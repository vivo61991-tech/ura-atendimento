// Aba Agora com o histórico: chave Previsto, mediana nos cards (até o mesmo minuto) e área da hora atual inteira.
const { chromium } = require('/home/claude/.npm-global/lib/node_modules/playwright');
const fs = require('fs'), path = require('path');
const D = require('../dados.js'), Hs = require('../historico.js');
const URL = process.env.URL || 'http://localhost:8765/ura/';
const ok = (c, m) => { if (!c) { console.log('FALHOU', m); process.exitCode = 1; } else console.log('ok  ', m); };
const H = Hs.parse(fs.readFileSync(path.join(__dirname, 'historico_amostra.csv'), 'utf8'));
const trad = require('./amostra.json').skills;
const fI = n => Math.round(n).toLocaleString('pt-BR');
const fP = n => n.toLocaleString('pt-BR', { minimumFractionDigits: 1, maximumFractionDigits: 1 }) + '%';
const med = (tipo, f) => Hs.mediana(Hs.referencias(H, '2026-10-30', tipo).map(r => { const d = Hs.diaComoDados(H, r, trad); return f(d, D.filtro(d, { dir: 'CO' }), D.filtro(d, { dir: 'TEL' })); }));
const AGORA = 19 * 60 + 15;
(async () => {
  const b = await chromium.launch();
  const erros = [];
  const p = await b.newPage({ viewport: { width: 390, height: 844 } });
  p.on('pageerror', e => erros.push(e.message));
  await p.clock.install({ time: new Date('2026-10-30T19:17:30') });
  await p.goto(URL); await p.evaluate(() => { try { localStorage.removeItem('ura-b2c:cmp'); } catch (e) {} }); await p.reload();
  await p.waitForFunction(() => window.__ura.estado().dados && window.__ura.estado().hist); await p.waitForTimeout(150);
  const pg = '#pgAgora';
  // chave acima do gráfico da hora atual
  const ch = await p.$eval(pg, g => { const k = g.querySelector('.cmpk'), h = g.querySelector('.chart[data-ch="agora-of"]');
    return k && h && k.getBoundingClientRect().bottom <= h.getBoundingClientRect().top ? [...k.querySelectorAll('button')].map(x => x.textContent + (x.classList.contains('on') ? '*' : '')).join('|') : null; });
  ok(ch === '7 dias|7 sex*|Desligado', 'Agora: chave Previsto acima da hora atual: ' + ch);
  // cards: mediana do dia até 19:15 (mesmo minuto da última coleta)
  const nsM = med('sem', (d, co) => D.agregarEm(d, AGORA, co).ns), ofM = med('sem', (d, co) => D.agregarEm(d, AGORA, co).ofer);
  const hero = await p.$eval(`${pg} .hero .meta.hr`, x => x.textContent.replace(/\s+/g, ' '));
  ok(hero.includes('med. 7 sex: ' + fP(nsM)), `NS do dia: mediana até 19:15 = ${fP(nsM)} (${hero.trim()})`);
  // botões do topo (iguais aos da aba Skills, na ordem da Evolução); começa em Total URA
  const bts = await p.$$eval(`${pg} .agdir button`, bs => bs.map(b => b.textContent + (b.classList.contains('on') ? '*' : '')).join('|'));
  ok(bts === 'Total URA*|CO|TEL' && await p.$eval(`${pg} > *`, x => x.classList.contains('agdir')), 'topo da Agora: Total URA (marcado) · CO · TEL: ' + bts);
  ok(await p.locator(`${pg} .tg, ${pg} h2.sec:has-text("TEL · Parceira")`).count() === 0 && !/CO por grupo|TEL por grupo/.test(await p.$eval(pg, x => x.textContent)), 'sem as tabelas "CO por grupo"/"TEL por grupo" e sem a parte "TEL · Parceira"');
  // sem cards: só o NS do dia fica; os totais (da hora) e a comparação com a mediana ficam nos gráficos
  ok(await p.locator(`${pg} .kpis2`).count() === 0 && await p.locator(`${pg} .hero`).count() === 1, 'Agora: sem os cards, só o card do NS');
  const urA = (d, co, tel, i, f) => D.intervaloEm(d, i, f, co).ofer + D.intervaloEm(d, i, f, tel).ofer;
  const pAte = med('sem', (d, co, tel) => urA(d, co, tel, 1140, AGORA));
  const tOf = await p.$eval(`${pg} .chart[data-ch="agora-of"]`, c => c.querySelector('.ch-tot').textContent.replace(/\s+/g, ' ') + ' | ' + c.querySelector('.ch-det').textContent);
  ok(/^39 ?CO 20 · TEL 19 \| med\. 7 sex: /.test(tOf) && tOf.endsWith('med. 7 sex: ' + fI(pAte) + ' +34%'), `1º gráfico: total da hora (39 = CO 20 · TEL 19) e a mediana até 19:15 no rodapé (${tOf})`);
  const ordem = await p.$$eval(`${pg} .chart`, cs => cs.map(c => c.dataset.ch).slice(0, 4).join());
  ok(ordem === 'agora-of,agora-oftel,agora-ofco,agora-esp', 'Total URA: oferecidas, depois TEL, depois CO encabeçando os do CO: ' + ordem);
  const telH = await p.$eval(`${pg} .chart[data-ch="agora-oftel"] .ch-v`, x => x.textContent), coH = await p.$eval(`${pg} .chart[data-ch="agora-ofco"] .ch-v`, x => x.textContent);
  ok(telH === '19' && coH === '20', `TEL e CO separados: ${telH} e ${coH}`);
  // CO
  await p.click(`${pg} button[data-agdir="CO"]`); await p.waitForTimeout(150);
  const coM = med('sem', (d, co) => D.intervaloEm(d, 1140, AGORA, co).ofer);
  const kCO = await p.$eval(`${pg} .chart[data-ch="agora-of"]`, c => c.querySelector('.ch-v').textContent + ' | ' + c.querySelector('.ch-det').textContent);
  ok(kCO.startsWith('20 | ') && kCO.includes('med. 7 sex: ' + fI(coM)) && await p.locator(`${pg} .chart[data-ch="agora-oftel"]`).count() === 0, `CO: total da hora 20, mediana ${fI(coM)}, sem o gráfico da TEL (${kCO})`);
  ok(await p.$eval(`${pg} .chart[data-ch="agora-of"] .ch-filtro`, x => x.textContent) === 'CO' && await p.locator(`${pg} #tIvAg thead th`).count() === 7, 'CO: gráficos e tabela só do CO');
  // TEL
  await p.click(`${pg} button[data-agdir="TEL"]`); await p.waitForTimeout(150);
  const telM = med('sem', (d, co, tel) => D.intervaloEm(d, 1140, AGORA, tel).ofer);
  const kTel = await p.$eval(`${pg} .chart[data-ch="agora-of"]`, c => c.querySelector('.ch-v').textContent + ' | ' + c.querySelector('.ch-det').textContent);
  ok(kTel.startsWith('19 | ') && kTel.includes(fI(telM)), `TEL: total da hora 19 e mediana ${fI(telM)} (${kTel})`);
  const telTela = await p.evaluate(() => ({ hero: !!document.querySelector('#pgAgora .hero'), fila: /Fila agora/i.test(document.querySelector('#pgAgora').textContent), graf: [...document.querySelectorAll('#pgAgora .chart')].map(c => c.dataset.ch) }));
  ok(!telTela.hero && !telTela.fila && telTela.graf.join() === 'agora-of', 'TEL: sem NS, sem fila; na hora só o gráfico de oferecidas: ' + telTela.graf.join());
  await p.click(`${pg} button[data-agdir="TODOS"]`); await p.waitForTimeout(150);
  // tabela de intervalos de 15 min do dia, igual à da Evolução
  const tb = await p.$$eval(`${pg} #tIvAg tbody tr`, rs => rs.map(r => [...r.children].map(c => c.textContent)));
  const iv15 = D.intervalos(D.normalizar(require('./amostra.json')), 15, D.filtro(D.normalizar(require('./amostra.json')), { dir: 'CO' }));
  ok(/Intervalos de 15 min/.test(await p.$eval(`${pg} #tIvAg`, t => t.closest('.card').querySelector('h2').textContent)) && tb.length === 9 && tb[0][0] === '19:00' && tb[8][0] === '17:00', `tabela de 15 em 15 min: só as 9 mais recentes (${tb[0][0]} … ${tb[8][0]})`);
  const btM = await p.$eval(`${pg} .tab-mais`, x => x.textContent.trim());
  ok(btM === `Ver o dia todo · mais ${iv15.length - 9} intervalos`, 'botão embaixo: ' + btM);
  const yTab = await p.$eval(`${pg} #tIvAg`, t => { t.closest('.card').scrollIntoView(); return Math.round(t.closest('.card').getBoundingClientRect().top); });
  await p.evaluate(() => document.querySelector('#pgAgora .tab-mais').click()); await p.waitForTimeout(150);
  const tb2 = await p.$$eval(`${pg} #tIvAg tbody tr`, rs => rs.map(r => [...r.children].map(c => c.textContent)));
  ok(tb2.length === iv15.length && tb2[tb2.length - 1][0] === '08:00' && await p.$eval(`${pg} .tab-mais`, x => x.textContent.trim()) === 'Mostrar só os 9 mais recentes', `ver o dia todo: ${tb2.length} linhas, até 08:00; o botão vira "Mostrar só os 9 mais recentes"`);
  ok(Math.abs(await p.$eval(`${pg} #tIvAg`, t => Math.round(t.closest('.card').getBoundingClientRect().top)) - yTab) <= 1, 'abrir a tabela não mexe na rolagem (a tabela fica no lugar)');
  ok(tb2.find(r => r[0] === '11:00')[1] === String(iv15.find(i => i.rot === '11:00').v.ofer), 'tabela: CO das 11:00 confere com as contas');
  const ab1915 = await p.$$eval(`${pg} #tIvAg tbody tr`, rs => rs.map(r => r.className));
  ok(ab1915[0] === 'aberto' && ab1915.slice(1).every(c => c !== 'aberto'), 'coleta das 19:15: a 1ª linha (19:00) listrada — a hora 19h ainda não fechou; as outras não');
  await p.evaluate(() => document.querySelector('#pgAgora .tab-mais').click()); await p.waitForTimeout(150);
  ok(await p.$$eval(`${pg} #tIvAg tbody tr`, r => r.length) === 9, 'recolher: volta para 9');
  await p.evaluate(() => scrollTo(0, 0));
  ok(/Fila agora\s*0.*19:15 · 11 agentes disponíveis/.test(await p.$$eval(`${pg} h2.sec`, hs => hs.map(h => h.textContent).join(' | '))), 'agentes disponíveis na linha da "Fila agora"');
  // técnicos em espera: pico da hora, % que enfrentou fila (atendidas depois de 1 min ÷ oferecidas CO) e a mediana do pico
  const co19 = D.filtro(D.normalizar(require('./amostra.json')), { dir: 'CO' }), dd0 = D.normalizar(require('./amostra.json'));
  const hC = D.delta(D.agregar(dd0.leituras.find(x => x.m === AGORA), co19), D.agregar(dd0.leituras.find(x => x.m === 1140), co19));
  const pct = D.fmtPct((hC.atend - hC.a60) / hC.ofer * 100);
  const picoM = med('sem', (d, co) => d.temFila ? D.espera(d.leituras, 1140, AGORA, co).pico : null);
  const tEsp = await p.$eval(`${pg} .chart[data-ch="agora-esp"]`, c => c.querySelector('.ch-tot').textContent.replace(/\s+/g, ' ') + ' | ' + c.querySelector('.ch-det').textContent);
  ok(tEsp.includes(pct + ' das oferecidas enfrentaram fila') && tEsp.includes('med. 7 sex: ' + fI(picoM)), `fila da hora: ${tEsp}`);
  // hora atual: área do início ao fim da hora, CO + TEL, 5 min = bloco ÷ 3
  const hora = `${pg} .chart[data-ch="agora-of"]`;
  const cobre = await p.$eval(hora, c => { const r = c.querySelector('path.ref').getBBox(), hs = c.querySelectorAll('rect.hit'), u = hs[hs.length - 1];
    return { n: hs.length, ok: r.x + r.width >= +u.getAttribute('x') + +u.getAttribute('width') / 2 }; });
  ok(cobre.n === 12 && cobre.ok, `hora atual: área até a última coluna da hora (${cobre.n} colunas de 5 min)`);
  const pHora = med('sem', (d, co, tel) => urA(d, co, tel, 1140, 1200));
  const res = await p.$eval(`${hora} .hres`, x => x.innerText.replace(/\s+/g, ' '));
  ok(res.includes('previsto ' + fI(pAte)) && res.includes('(19:00–20:00): ' + fI(pHora)), `resumo da hora: previsto até 19:15 = ${fI(pAte)} e na hora inteira = ${fI(pHora)} (${res})`);
  ok(/até agora/.test(res) && /mediana 7 sextas/.test(res), 'resumo diz "até agora" e qual mediana');
  ok(/dividido em 3 partes iguais/.test(await p.$eval('#inf-agora-of', x => x.textContent)), 'explicação (i): 5 min = bloco de 15 ÷ 3');
  // 7 dias corridos
  await p.click(`${pg} button[data-cmp="dias"]`); await p.waitForTimeout(150);
  const urD = med('dias', (d, co, tel) => urA(d, co, tel, 1140, AGORA));
  ok((await p.$eval(`${pg} .chart[data-ch="agora-of"] .ch-det`, x => x.textContent)).includes('med. 7 dias: ' + fI(urD)), `7 dias: mediana da hora até 19:15 = ${fI(urD)}`);
  // Desligado: tudo limpo, e vale também para a Evolução (mesma chave)
  await p.click(`${pg} button[data-cmp="off"]`); await p.waitForTimeout(150);
  ok(await p.locator(`${pg} .ch-det b, ${pg} .meta.hr, ${pg} path.ref, ${pg} .hres`).count() === 0, 'Desligado: sem mediana nos gráficos e no NS, sem área e sem resumo');
  await p.click('nav.tabs button[data-v="evo"]');
  ok(await p.locator('#pgEvo path.ref').count() === 0 && await p.locator('#pgEvo .cmpk button.on[data-cmp="off"]').count() === 1, 'a mesma chave vale na Evolução');
  await p.click('nav.tabs button[data-v="agora"]');
  await p.click(`${pg} button[data-cmp="sem"]`);
  // ---- hora atual com os MESMOS gráficos da Evolução
  const tipos = await p.$$eval(`${pg} .chart`, cs => cs.map(c => c.dataset.ch));
  ok(['agora-of', 'agora-esp', 'agora-dir', 'agora-ns', 'agora-ab', 'agora-tme', 'agora-tma'].every(t => tipos.includes(t)), 'Agora: os 7 gráficos da Evolução na hora atual: ' + tipos.join(', '));
  const cobertura = await p.$$eval(`${pg} .chart`, cs => cs.map(c => { const hs = c.querySelectorAll('rect.hit'), r = c.querySelector('path.ref'), u = hs[hs.length - 1];
    return { n: hs.length, ref: !!r && r.getBBox().x + r.getBBox().width >= +u.getAttribute('x') + +u.getAttribute('width') / 2 }; }));
  ok(cobertura.every(x => x.n === 12 && x.ref), 'todos com 12 colunas de 5 min e o previsto até o fim da hora');
  const vazias = await p.$$eval(`${pg} .chart[data-ch="agora-ns"] svg text`, ts => ts.map(t => t.textContent).filter(t => /%$/.test(t)).length);
  ok(vazias === 3, `só as 3 colunas que chegaram têm valor (19:00, 19:05, 19:10); o resto da hora vazio (${vazias} rótulos)`);
  ok((await p.$$eval(`${pg} .chart`, cs => cs.filter(c => /19:15|19:30|19:45/.test(c.textContent)).length)) === 9, 'eixo com a hora inteira (19:15, 19:30, 19:45)');
  // coluna de 5 min selecionada: valores dela e o previsto (bloco de 15 ÷ 3)
  await p.locator(`${pg} .chart[data-ch="agora-of"] rect.hit`).nth(1).click(); await p.waitForTimeout(150);
  const p5 = med('sem', (d, co, tel) => urA(d, co, tel, 1145, 1150));
  const cap5 = await p.$eval(`${pg} .chart[data-ch="agora-of"] .csel`, x => x.innerText.replace(/\s+/g, ' '));
  ok(/19:05–19:10/.test(cap5) && cap5.includes('mediana 7 sextas: ' + fI(p5)), `coluna 19:05 selecionada: "${cap5}" (previsto ${fI(p5)})`);
  ok(await p.evaluate(() => window.__ura.estado().ag.sel) === 1145 && await p.locator(`${pg} .chart .csel`).count() >= 7, 'seleção vale para todos os gráficos da hora');
  await p.locator(`${pg} .chart[data-ch="agora-of"] rect.hit`).nth(8).click(); await p.waitForTimeout(150);
  ok(await p.evaluate(() => window.__ura.estado().ag.sel) === 1145, 'coluna que ainda não chegou não seleciona');
  await p.locator(`${pg} .chart[data-ch="agora-of"] rect.hit`).nth(1).click(); await p.waitForTimeout(150);
  ok(await p.evaluate(() => window.__ura.estado().ag.sel) === null && /até agora/.test(await p.$eval(`${pg} .hres`, x => x.textContent)), 'tocar de novo limpa e volta o resumo da hora');
  // painel de grupos da hora: filtra só a aba Agora, sem mexer na rolagem
  const pn = `${pg} .painel[data-ch="agora-grupos"]`;
  ok(await p.locator(pn).count() === 1 && /oferecidas 19:00–19:15/.test(await p.$eval(`${pn} h2`, h => h.textContent)), 'painel "Grupos e skills" da hora na aba Agora');
  const qBL = await p.$eval(`${pn} .gks > .gk .gk-q`, x => x.textContent);
  const dd = D.normalizar(require('./amostra.json')), l19 = dd.leituras.find(x => x.m === 1140), l1915 = dd.leituras.find(x => x.m === 1155);
  const ssBL = D.filtro(dd, { dir: 'TODOS', grupo: 'SUPORTE BANDA LARGA' });
  ok(qBL === fI(D.agregar(l1915, ssBL).ofer - D.agregar(l19, ssBL).ofer), `SUPORTE BANDA LARGA na hora: ${qBL}`);
  await p.evaluate(sel => { const r = document.querySelector(sel); scrollBy(0, r.getBoundingClientRect().top - 380); }, `${pn} .gks > .gk`);
  await p.waitForTimeout(80);
  const yA = await p.$eval(`${pn} .gks > .gk`, l => Math.round(l.getBoundingClientRect().top));
  await p.click(`${pn} .gks > .gk .gk-n`); await p.waitForTimeout(150);
  ok(await p.$eval(`${pn} .gks > .gk`, l => Math.round(l.getBoundingClientRect().top)) === yA, `filtrar pelo grupo na Agora: linha parada (${yA} px)`);
  const est = await p.evaluate(() => { const e = window.__ura.estado(); return [e.ag.grupo, e.evo.grupo]; });
  ok(est[0] === 'SUPORTE BANDA LARGA' && est[1] === null, 'filtro da Agora não mexe na Evolução');
  ok(/SUPORTE BANDA LARGA/.test(await p.$eval(`${pg} .chart[data-ch="agora-of"] .ch-filtro`, x => x.textContent)), 'gráficos da hora mostram o filtro no rodapé');
  const of19 = await p.$$eval(`${pg} .chart[data-ch="agora-of"] svg text`, ts => ts.map(t => t.textContent));
  const v1900 = D.agregar(dd.leituras.find(x => x.m === 1145), ssBL).ofer - D.agregar(l19, ssBL).ofer;
  ok(of19.includes(String(v1900)), `oferecidas 19:00–19:05 só do grupo: ${v1900}`);
  const ivBL = D.intervalos(dd, 15, D.filtro(dd, { dir: 'CO', grupo: 'SUPORTE BANDA LARGA' }));
  const t11 = await p.$$eval(`${pg} #tIvAg tbody tr`, rs => { const r = rs.find(x => x.children[0].textContent === '18:00'); return r.children[1].textContent; });
  ok(t11 === String(ivBL.find(i => i.rot === '18:00').v.ofer) && /SUPORTE BANDA LARGA/.test(await p.$eval(`${pg} .tfil`, x => x.textContent)), 'filtro do painel vale também para a tabela (com o filtro escrito em cima)');
  await p.click(`${pn} .gks > .gk .gk-n`); await p.waitForTimeout(150);
  ok(await p.evaluate(() => window.__ura.estado().ag.grupo) === null, 'tocar de novo limpa o filtro da Agora');
  await p.evaluate(() => scrollTo(0, 0));
  // logo depois da virada da hora (última coleta às 19:00): a última hora fechada, de 15 em 15
  const h = await b.newPage({ viewport: { width: 390, height: 844 } });
  h.on('pageerror', e => erros.push(e.message));
  await h.clock.install({ time: new Date('2026-10-30T19:02:00') });
  await h.route('**/pulse.json*', async rt => { const r = await rt.fetch(); const j = await r.json(); j.leituras = j.leituras.filter(l => l.horario <= '19:00'); await rt.fulfill({ response: r, json: j }); });
  await h.goto(URL); await h.waitForFunction(() => window.__ura.estado().dados && window.__ura.estado().hist); await h.waitForTimeout(150);
  const sec = await h.$$eval('#pgAgora h2.sec', hs => hs.map(x => x.textContent).join(' | '));
  const nh = await h.$$eval('#pgAgora .chart[data-ch="agora-of"] rect.hit', r => r.length);
  ok(/Última hora · de 15 em 15 min/.test(sec) && /18:00–19:00/.test(sec) && nh === 4, `virada da hora: "Última hora" 18:00–19:00, 4 colunas de 15 min (${nh})`);
  await h.close();
  // intervalo ainda aberto (última coleta às 19:10): a 1ª linha da tabela fica com o listrado bem claro
  const ab = await b.newPage({ viewport: { width: 390, height: 844 } });
  ab.on('pageerror', e => erros.push(e.message));
  await ab.clock.install({ time: new Date('2026-10-30T19:12:00') });
  await ab.route('**/pulse.json*', async rt => { const r = await rt.fetch(); const j = await r.json(); j.leituras = j.leituras.filter(l => l.horario <= '19:10'); await rt.fulfill({ response: r, json: j }); });
  await ab.goto(URL); await ab.waitForFunction(() => window.__ura.estado().dados); await ab.waitForTimeout(150);
  const lin = await ab.$$eval('#tIvAg tbody tr', rs => rs.map(r => r.className));
  const bg = await ab.$eval('#tIvAg tr.aberto td', td => getComputedStyle(td).backgroundImage);
  ok(lin[0] === 'aberto' && lin.slice(1).every(c => c !== 'aberto') && /repeating-linear-gradient/.test(bg), '1ª linha (19:00, ainda aberta) com o listrado; as outras não');
  await ab.close();
  // virada da hora (última coleta às 19:00): a hora 18h fechou — a 1ª linha (18:45) sem listrado
  const vh = await b.newPage({ viewport: { width: 390, height: 844 } });
  await vh.clock.install({ time: new Date('2026-10-30T19:02:00') });
  await vh.route('**/pulse.json*', async rt => { const r = await rt.fetch(); const j = await r.json(); j.leituras = j.leituras.filter(l => l.horario <= '19:00'); await rt.fulfill({ response: r, json: j }); });
  await vh.goto(URL); await vh.waitForFunction(() => window.__ura.estado().dados); await vh.waitForTimeout(150);
  const lv = await vh.$$eval('#tIvAg tbody tr', rs => rs.map(r => r.children[0].textContent + ':' + r.className));
  ok(lv[0] === '18:45:' && !lv.some(x => /aberto/.test(x)), 'coleta das 19:00: a hora 18h fechou — nenhuma linha listrada (' + lv[0] + ')');
  await vh.close();
  // 360 px escuro sem estouro
  const q = await b.newPage({ viewport: { width: 360, height: 800 }, colorScheme: 'dark' });
  q.on('pageerror', e => erros.push(e.message));
  await q.clock.install({ time: new Date('2026-10-30T19:17:30') });
  await q.goto(URL); await q.waitForFunction(() => window.__ura.estado().hist); await q.waitForTimeout(150);
  ok(await q.evaluate(() => document.documentElement.scrollWidth) <= 360, '360 px: sem estouro lateral');
  ok(await q.$$eval('#pgAgora .cmpk button', bs => bs.every(x => x.scrollWidth <= x.clientWidth)), '360 px: chave sem texto cortado');
  ok(!erros.length, 'sem erros no console' + (erros.length ? ': ' + erros.join(' | ') : ''));
  await b.close();
})();

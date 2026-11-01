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
  const kOf = await p.$eval(`${pg} .kpis2 .kpi .r`, x => x.textContent.replace(/\s+/g, ' '));
  ok(kOf.includes('med. 7 sex: ' + fI(ofM)), `Oferecidas CO: mediana até 19:15 = ${fI(ofM)} (${kOf.trim()})`);
  const telM = med('sem', (d, co, tel) => D.agregarEm(d, AGORA, tel).ofer);
  const kTel = await p.$$eval(`${pg} .kpis2 .kpi`, ks => { const k = ks.find(x => /Oferecidas TEL/.test(x.textContent)); return k && k.querySelector('.r') ? k.querySelector('.r').textContent : ''; });
  ok(kTel.includes(fI(telM)), `Oferecidas TEL: mediana até 19:15 = ${fI(telM)}`);
  ok(await p.$$eval(`${pg} .kpis2 .kpi`, ks => { const k = ks.find(x => /Agentes/.test(x.textContent)); return !k.querySelector('.r'); }), 'agentes sem mediana (o histórico não tem)');
  const filaM = med('sem', (d, co) => { const l = [...d.leituras].reverse().find(x => x.m <= AGORA); return D.agregar(l, co).fila; });
  const kEsp = await p.$$eval(`${pg} .kpis2 .kpi`, ks => { const k = ks.find(x => /Em espera agora/.test(x.textContent)); return k.querySelector('.r') ? k.querySelector('.r').textContent : ''; });
  ok(kEsp.includes('med. 7 sex: ' + fI(filaM)), `Em espera agora: mediana das sextas às 19:15 = ${fI(filaM)} (${kEsp.trim()})`);
  // hora atual: área do início ao fim da hora, CO + TEL, 5 min = bloco ÷ 3
  const hora = `${pg} .chart[data-ch="agora-of"]`;
  const cobre = await p.$eval(hora, c => { const r = c.querySelector('path.ref').getBBox(), hs = c.querySelectorAll('rect.hit'), u = hs[hs.length - 1];
    return { n: hs.length, ok: r.x + r.width >= +u.getAttribute('x') + +u.getAttribute('width') / 2 }; });
  ok(cobre.n === 12 && cobre.ok, `hora atual: área até a última coluna da hora (${cobre.n} colunas de 5 min)`);
  const urA = (d, co, tel, i, f) => D.intervaloEm(d, i, f, co).ofer + D.intervaloEm(d, i, f, tel).ofer;
  const pAte = med('sem', (d, co, tel) => urA(d, co, tel, 1140, AGORA)), pHora = med('sem', (d, co, tel) => urA(d, co, tel, 1140, 1200));
  const res = await p.$eval(`${hora} .hres`, x => x.innerText.replace(/\s+/g, ' '));
  ok(res.includes('previsto ' + fI(pAte)) && res.includes('(19:00–20:00): ' + fI(pHora)), `resumo da hora: previsto até 19:15 = ${fI(pAte)} e na hora inteira = ${fI(pHora)} (${res})`);
  ok(/até agora/.test(res) && /mediana 7 sextas/.test(res), 'resumo diz "até agora" e qual mediana');
  ok(/dividido em 3 partes iguais/.test(await p.$eval('#inf-agora-of', x => x.textContent)), 'explicação (i): 5 min = bloco de 15 ÷ 3');
  // 7 dias corridos
  await p.click(`${pg} button[data-cmp="dias"]`); await p.waitForTimeout(150);
  const ofD = med('dias', (d, co) => D.agregarEm(d, AGORA, co).ofer);
  ok((await p.$eval(`${pg} .kpis2 .kpi .r`, x => x.textContent)).includes('med. 7 dias: ' + fI(ofD)), `7 dias: Oferecidas CO med. ${fI(ofD)}`);
  // Desligado: tudo limpo, e vale também para a Evolução (mesma chave)
  await p.click(`${pg} button[data-cmp="off"]`); await p.waitForTimeout(150);
  ok(await p.locator(`${pg} .kpi .r, ${pg} .meta.hr, ${pg} path.ref, ${pg} .hres`).count() === 0, 'Desligado: sem mediana nos cards, sem área e sem resumo');
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
  ok((await p.$$eval(`${pg} .chart`, cs => cs.filter(c => /19:15|19:30|19:45/.test(c.textContent)).length)) === 7, 'eixo com a hora inteira (19:15, 19:30, 19:45)');
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

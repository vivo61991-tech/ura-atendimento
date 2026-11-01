// Evolução com o histórico: navegação por dia e comparação pela mediana. Precisa do historico.csv no site de teste.
const { chromium } = require('/home/claude/.npm-global/lib/node_modules/playwright');
const fs = require('fs'), path = require('path');
const D = require('../dados.js'), Hs = require('../historico.js');
const URL = process.env.URL || 'http://localhost:8765/ura/';
const ok = (c, m) => { if (!c) { console.log('FALHOU', m); process.exitCode = 1; } else console.log('ok  ', m); };
const abrir = async p => { if (await p.locator('#pgEvo .topbar.fechado').count()) await p.click('#pgEvo .ctl-seta'); };
// valores esperados calculados aqui, direto do arquivo (mesmos módulos, sem o navegador)
const H = Hs.parse(fs.readFileSync(path.join(__dirname, 'historico_amostra.csv'), 'utf8'));   // já traz as colunas FILA
const trad = require('./amostra.json').skills;
const totCO = iso => { const d = Hs.diaComoDados(H, iso, trad); return D.agregar(d.leituras[d.leituras.length - 1], D.filtro(d, { dir: 'CO' })); };
const refs = Hs.referencias(H, '2026-10-30', 'sem');
const medAte = (m, f) => Hs.mediana(refs.map(r => { const d = Hs.diaComoDados(H, r, trad); const l = [...d.leituras].reverse().find(x => x.m <= m); return f(D.agregar(l, D.filtro(d, { dir: 'CO' }))); }));
const fI = n => Math.round(n).toLocaleString('pt-BR');
(async () => {
  const b = await chromium.launch();
  const erros = [];
  const nova = async (url, larg) => {
    const p = await b.newPage({ viewport: { width: larg || 390, height: 844 } });
    p.on('pageerror', e => erros.push(e.message));
    await p.clock.install({ time: new Date('2026-10-30T19:17:30') });
    await p.goto(url || URL);
    await p.waitForFunction(() => window.__ura.estado().dados);
    await p.evaluate(() => { try { localStorage.removeItem('ura-b2c:cmp'); } catch (e) {} });
    await p.reload(); await p.waitForFunction(() => window.__ura.estado().dados);
    await p.waitForFunction(() => window.__ura.estado().hist || window.__ura.estado().histErro);
    await p.click('nav.tabs button[data-v="evo"]');
    await p.locator('#pgEvo .topbar.fechado').count() && await p.click('#pgEvo .ctl-seta'); await p.click('#pgEvo button[data-dir="CO"]'); await p.click('#pgEvo .ctl-seta'); // a Evolução abre no Total URA: estes testes usam o CO
    return p;
  };
  const p = await nova();
  const nav = () => p.$eval('#pgEvo .dnav', n => ({ t: n.querySelector('.dn-t').innerText.replace(/\s+/g, ' '), hist: n.classList.contains('hist'),
    ant: !n.querySelector('[data-navdia="-1"]').disabled, prox: !n.querySelector('[data-navdia="1"]').disabled, hoje: !!n.querySelector('.dn-hoje') }));
  const titulos = () => p.$$eval('#pgEvo .chart h2', h => h.map(x => x.innerText));
  const kOf = () => p.$eval('#pgEvo .kpis2 .kpi .v', x => x.textContent);
  // 1) abre no dia ao vivo
  let n = await nav();
  const toastTx = () => p.$eval('#toast', t => t.classList.contains('show') ? t.textContent : '');
  ok(n.t.trim() === 'sex, 30/10/2026' && !n.hist && n.ant && !n.prox && !n.hoje, 'barra só com a data inteira: "' + n.t.trim() + '" (sem próximo dia)');
  ok(await toastTx() === 'Ao vivo · Pulse', 'ao entrar: aviso no rodapé "Ao vivo · Pulse"');
  const fs18 = await p.$eval('#pgEvo .dn-t b', b => parseFloat(getComputedStyle(b).fontSize));
  ok(fs18 >= 18, `data com mais destaque (${fs18}px)`);
  ok((await titulos()).some(t => /TÉCNICOS EM ESPERA/i.test(t)), 'ao vivo: tem o gráfico de técnicos em espera');
  // 2) dia anterior = histórico
  await p.click('#pgEvo [data-navdia="-1"]'); await p.waitForTimeout(150);
  n = await nav();
  ok(n.t.trim() === 'qui, 29/10/2026' && n.hist && n.prox && n.hoje, 'seta ‹: qui, 29/10/2026 do histórico (com "Hoje")');
  ok(await toastTx() === 'Histórico · Genesys', 'trocou de base: aviso "Histórico · Genesys"');
  await p.evaluate(() => { const t = document.querySelector('#toast'); t.classList.remove('show'); t.textContent = ''; });
  await p.click('#pgEvo [data-navdia="-1"]'); await p.waitForTimeout(150);
  ok(await toastTx() === '', 'outro dia do histórico (mesma base): sem aviso');
  await p.click('#pgEvo [data-navdia="1"]'); await p.waitForTimeout(150);
  const t29 = await titulos();
  // com o historico_fila.csv: o dia do histórico tem o gráfico de técnicos em espera (com o previsto)
  const d29 = Hs.diaComoDados(H, '2026-10-29', trad), co29 = D.filtro(d29, { dir: 'CO' });
  const esp29 = D.intervalos(d29, 60, co29).map(i => i.esp ? i.esp.pico : null);
  ok(t29.length === 7 && await p.locator('#pgEvo .semfila').count() === 0 && await p.locator('#pgEvo .chart[data-ch="evo-esp"] rect.hit').count() > 0, 'histórico com o arquivo da fila: 29/10 com o gráfico de técnicos em espera');
  const lab29 = await p.$$eval('#pgEvo .chart[data-ch="evo-esp"] svg text', ts => ts.map(t => t.textContent));
  ok(lab29.includes(String(Math.max(...esp29.filter(x => x != null)))), `29/10: pico do dia no gráfico = ${Math.max(...esp29.filter(x => x != null))} (arquivo da fila)`);
  ok(await p.locator('#pgEvo .chart[data-ch="evo-esp"] path.ref').count() === 1, '29/10: previsto (mediana) também na fila');
  ok(await kOf() === fI(totCO('2026-10-29').ofer), `oferecidas CO de 29/10 = ${fI(totCO('2026-10-29').ofer)} (arquivo)`);
  const kp = await p.$$eval('#pgEvo .kpis2 .kpi', x => x.map(e => e.textContent.replace(/\s+/g, ' ')));
  const kPico = kp.find(x => /Pico em espera/.test(x)) || '';
  ok(kPico.includes(fI(D.espera(d29.leituras, -1, d29.leituras[d29.leituras.length - 1].m, co29).pico)) && /med\. 7 qui/.test(kPico), 'histórico com fila: card "Pico em espera" com a mediana: ' + kPico.trim());
  const filaTab = await p.$$eval('#tIv tbody tr', rs => rs.map(r => r.children[5] && r.children[5].textContent));
  ok(filaTab.some(x => /^\d+$/.test(x) && +x > 0), 'tabela: coluna Fila com números no histórico');
  // dia antes do arquivo da fila (14/06): cartão no lugar, sem gráfico, explicando o período
  await p.$eval('#dnData', i => { i.value = '2026-06-14'; i.dispatchEvent(new Event('change', { bubbles: true })); }); await p.waitForTimeout(150);
  ok(await p.locator('#pgEvo .chart.semfila[data-ch="evo-esp"]').count() === 1 && /veio sem a coluna FILA/.test(await p.$eval('#pgEvo .semfila', x => x.textContent)), '14/06 (sem a coluna FILA): cartão explica');
  const kp14 = await p.$$eval('#pgEvo .kpis2 .kpi .l', x => x.map(e => e.textContent));
  ok(kp14.includes('Atendidas') && !kp14.includes('Pico em espera'), 'sem fila: card "Atendidas" no lugar de "Pico em espera"');
  await p.click('#pgEvo .semfila button[data-navdia="fim"]'); await p.waitForTimeout(150);
  ok(/30\/10/.test((await nav()).t) && await p.locator('#pgEvo .chart[data-ch="evo-esp"] rect.hit').count() > 0, 'botão "Ver o dia do Pulse" volta para 30/10');
  await p.click('#pgEvo [data-navdia="-1"]'); await p.waitForTimeout(150);
  // 3) seletor de data: dia de pico e dia sem dados
  await p.$eval('#dnData', i => { i.value = '2026-10-14'; i.dispatchEvent(new Event('change', { bubbles: true })); }); await p.waitForTimeout(150);
  ok(/qua, 14\/10/.test((await nav()).t) && await kOf() === fI(totCO('2026-10-14').ofer), `seletor de data: 14/10 com ${fI(totCO('2026-10-14').ofer)} oferecidas no CO`);
  await p.$eval('#dnData', i => { i.value = '2026-01-05'; i.dispatchEvent(new Event('change', { bubbles: true })); }); await p.waitForTimeout(150);
  ok(/qua, 14\/10/.test((await nav()).t) && /Sem dados de 05\/01\/2026/.test(await p.$eval('#toast', t => t.textContent)), 'data sem dados: avisa e continua no mesmo dia');
  // 4) primeiro dia: sem dia anterior
  await p.$eval('#dnData', i => { i.value = '2026-06-14'; i.dispatchEvent(new Event('change', { bubbles: true })); }); await p.waitForTimeout(150);
  ok(!(await nav()).ant, 'primeiro dia do histórico (14/06): seta ‹ desativada');
  // 5) Hoje
  await p.click('#pgEvo .dn-hoje'); await p.waitForTimeout(150);
  ok((await nav()).t.trim() === 'sex, 30/10/2026' && await toastTx() === 'Ao vivo · Pulse', '"Hoje" volta para o dia ao vivo e avisa "Ao vivo · Pulse"');
  // 6) comparação: ligada por padrão com as 7 sextas; chave acima do primeiro gráfico
  await abrir(p); await p.click('#pgEvo button[data-passo="60"]');
  const ch = await p.$eval('#pgEvo .cmpk', k => ({ bts: [...k.querySelectorAll('button')].map(b => b.textContent + (b.classList.contains('on') ? '*' : '')),
    antes: k.getBoundingClientRect().bottom <= document.querySelector('#pgEvo .chart').getBoundingClientRect().top, fora: !k.closest('.topbar') }));
  ok(ch.bts.join('|') === '7 dias|7 sex*|Desligado' && ch.antes && ch.fora, 'chave "Previsto" acima do 1º gráfico, fora dos controles: ' + ch.bts.join(' · '));
  const nRef = await p.$$eval('#pgEvo .chart', cs => cs.map(c => c.querySelectorAll('path.ref').length));
  ok(nRef.every(x => x > 0) && nRef.length === 7, `área do previsto nos 7 gráficos (a fila também, com o arquivo da fila): ${nRef.join(',')}`);
  const atras = await p.$$eval('#pgEvo .chart svg', ss => ss.filter(s => s.querySelector('path.ref')).every(s => { const els = [...s.children]; const r = els.findIndex(e => e.matches('path.ref')); const bar = els.findIndex(e => e.tagName === 'path' && !e.matches('.ref,.ref-l')); return bar < 0 || r < bar; }));
  ok(atras, 'área desenhada atrás das barras');
  const cores = await p.$$eval('#pgEvo .chart svg path.ref', ps => [...new Set(ps.map(x => (x.getAttribute('style').match(/var\(--[a-zA-Z0-9]+\)/) || [''])[0]))]);
  ok(cores.length >= 4, 'área na cor de cada gráfico, bem clara: ' + cores.join(' '));
  ok(await p.locator('#pgEvo .chart').nth(3).locator('path[style*="sAcum"]').count() === 0 && !/NS acumulado do dia/.test(await p.$eval('#inf-evo-ns', x => x.textContent)), 'NS: sem a linha do NS acumulado (removida)');
  const leg = await p.$eval('#inf-evo-of', x => x.textContent);
  ok(/mediana das últimas 7 sextas do histórico \(23\/10, 16\/10, 09\/10, 02\/10, 25\/09, 18\/09, 11\/09\)/.test(leg), 'legenda: as 7 sextas usadas');
  const esperadoOf = medAte(19 * 60 + 15, a => a.ofer);
  const r0 = await p.$eval('#pgEvo .kpis2 .kpi .r', x => x.textContent);
  ok(r0.includes('med. 7 sex: ' + fI(esperadoOf)), `card: mediana das sextas até 19:15 = ${fI(esperadoOf)} (${r0.trim()})`);
  // coluna das 11h: mediana conferida em Python (173)
  await p.locator('#pgEvo .chart').first().locator('rect.hit').nth(3).click(); await p.waitForTimeout(150);
  const cap = await p.$eval('#pgEvo .chart .csel', x => x.innerText.replace(/\s+/g, ' '));
  ok(/mediana 7 sextas: 173/.test(cap), 'coluna 11h: "mediana 7 sextas: 173" (conferido em Python)');
  const ult = await p.$$eval('#pgEvo .chart', cs => cs[0].querySelectorAll('rect.hit').length);
  await p.locator('#pgEvo .chart').first().locator('rect.hit').nth(ult - 1).click(); await p.waitForTimeout(150);
  // coluna em andamento (19:00–19:15): os outros dias no mesmo trecho
  const espAnd = Hs.mediana(refs.map(r => { const d = Hs.diaComoDados(H, r, trad); return D.intervaloEm(d, 19 * 60, 19 * 60 + 15, D.filtro(d, { dir: 'CO' })).ofer; }));
  const capAnd = await p.$eval('#pgEvo .chart .csel', x => x.innerText.replace(/\s+/g, ' '));
  ok(capAnd.includes('mediana 7 sextas até 19:15: ' + fI(espAnd)), `coluna em andamento: mediana até 19:15 = ${fI(espAnd)} (${capAnd})`);
  const ateFim = await p.$eval('#pgEvo .chart', c => { const r = c.querySelector('path.ref').getBBox(), hs = c.querySelectorAll('rect.hit'), u = hs[hs.length - 1];
    return r.x + r.width >= +u.getAttribute('x') + +u.getAttribute('width') / 2; });
  ok(ateFim, 'área do previsto vai até a coluna em andamento');
  // 7 dias corridos (a chave troca em todos os gráficos)
  await p.click('#pgEvo button[data-cmp="dias"]');
  ok(/mediana dos últimos 7 dias do histórico \(29\/10, 28\/10, 27\/10, 26\/10, 25\/10, 24\/10, 23\/10\)/.test(await p.$eval('#inf-evo-of', x => x.textContent)), '7 dias corridos: 29/10 a 23/10');
  // num dia do histórico a comparação usa as semanas anteriores a ele
  await p.click('#pgEvo [data-navdia="-1"]'); await p.click('#pgEvo button[data-cmp="sem"]'); await p.waitForTimeout(150);
  ok(await p.$eval('#pgEvo .cmpk button[data-cmp="sem"]', b => b.textContent) === '7 qui', 'chave acompanha o dia: "7 qui" em 29/10');
  // desligado: gráficos e cards limpos
  await p.click('#pgEvo button[data-cmp="off"]'); await p.waitForTimeout(150);
  ok(await p.locator('#pgEvo path.ref, #pgEvo path.ref-l').count() === 0 && await p.locator('#pgEvo .kpis2 .kpi .r').count() === 0 && !/área clara/.test(await p.$eval('#inf-evo-of', x => x.textContent)),
    'Desligado: sem área, sem linha de mediana nos cards e sem legenda do previsto');
  ok(await p.locator('#pgEvo .cmpk button.on[data-cmp="off"]').count() === 1, 'Desligado: chave continua à vista para religar');
  await p.click('#pgEvo button[data-cmp="sem"]'); await p.waitForTimeout(150);
  ok(/7 quintas do histórico \(22\/10/.test(await p.$eval('#inf-evo-of', x => x.textContent)), 'em 29/10: compara com as 7 quintas anteriores');
  // comparação é lembrada; controles recolhidos com 4 botões cabem em 360 px
  await p.close();
  const q = await nova(URL, 360);
  const rec = await q.$eval('#pgEvo .ctl-res', r => [...r.querySelectorAll('.ctl-p')].map(x => ({ t: x.textContent, corta: x.scrollWidth > x.clientWidth })));
  ok(rec.length === 3 && rec.every(x => !x.corta), '360 px, recolhido: 3 botões inteiros (a comparação não está mais nos controles)');
  const cmpk = await q.$eval('#pgEvo .cmpk', k => [...k.querySelectorAll('button')].every(b => b.scrollWidth <= b.clientWidth));
  ok(cmpk, '360 px: chave "Previsto" sem texto cortado');
  const larg = await q.$$eval('#pgEvo .cmpk button', bs => bs.map(b => Math.round(b.getBoundingClientRect().width)));
  ok(larg.length === 3 && Math.max(...larg) - Math.min(...larg) <= 1, '360 px: os 3 botões da chave com a mesma largura: ' + larg.join('/'));
  // contorno da data no histórico: roxo (não azul)
  await q.click('#pgEvo [data-navdia="-1"]'); await q.waitForTimeout(100);
  const cont = await q.$eval('#pgEvo .dnav.hist', x => getComputedStyle(x).boxShadow);
  ok(!/1, 100, 201|0, 100, 201/.test(cont) && /100, 42, 144|0\.392157 0\.164706 0\.564706/.test(cont), 'dia do histórico: contorno roxo: ' + cont);
  // domingo em vermelho bem escuro
  await q.$eval('#dnData', i => { i.value = '2026-10-25'; i.dispatchEvent(new Event('change', { bubbles: true })); }); await q.waitForTimeout(100);
  const dom = await q.$eval('#pgEvo .dn-t b', b => [b.textContent, getComputedStyle(b).color]);
  ok(dom[0] === 'dom, 25/10/2026' && dom[1] === 'rgb(139, 26, 26)', 'domingo em vermelho bem escuro: ' + dom.join(' '));
  await q.$eval('#dnData', i => { i.value = '2026-10-24'; i.dispatchEvent(new Event('change', { bubbles: true })); }); await q.waitForTimeout(100);
  ok(await q.$eval('#pgEvo .dn-t b', b => getComputedStyle(b).color) !== 'rgb(139, 26, 26)', 'sábado na cor normal');
  const caber = await q.$eval('#pgEvo .dn-t b', b => b.scrollWidth <= b.parentElement.parentElement.clientWidth + 1);
  ok(caber, '360 px: data inteira cabe na barra (com "Último")');
  await q.click('#pgEvo .dn-hoje'); await q.waitForTimeout(100);
  await q.click('#pgEvo button[data-cmp="off"]');
  await q.reload(); await q.waitForFunction(() => window.__ura.estado().hist); await q.click('nav.tabs button[data-v="evo"]');
  ok(await q.evaluate(() => window.__ura.estado().evo.cmp) === 'off' && await q.locator('#pgEvo path.ref').count() === 0, 'Desligado lembrado ao reabrir');
  await q.click('#pgEvo button[data-cmp="dias"]');
  await q.reload(); await q.waitForFunction(() => window.__ura.estado().hist); await q.click('nav.tabs button[data-v="evo"]');
  ok(await q.evaluate(() => window.__ura.estado().evo.cmp) === 'dias', 'comparação lembrada ao reabrir');
  const w = await q.evaluate(() => document.documentElement.scrollWidth);
  ok(w <= 360, `sem estouro lateral em 360 px (${w}px)`);
  await q.close();
  // 8) sem histórico no site: app funciona, navegação e comparação desligadas
  const s = await nova(URL + '?historico=nao-existe.csv');
  const ns = await s.$eval('#pgEvo .dnav', x => x.innerText.replace(/\s+/g, ' '));
  ok(/sem histórico/.test(ns), 'sem historico.csv: barra avisa "sem histórico"');
  await abrir(s);
  ok(await s.locator('#pgEvo .cmpk').count() === 0 && await s.locator('#pgEvo path.ref').count() === 0 && await s.locator('#pgEvo .chart').count() === 7, 'sem histórico: sem chave, sem área e os 7 gráficos do dia normais');
  // abrir o histórico pelo botão de arquivo
  await s.setInputFiles('#arq', path.join(__dirname, 'historico_amostra.csv')); await s.waitForTimeout(800);
  ok(await s.evaluate(() => window.__ura.estado().histOrigem) === 'arquivo' && /139 dias/.test(await s.$eval('#toast', t => t.textContent)), 'histórico aberto do aparelho (139 dias)');
  await s.close();
  // 9) dia seguinte (31/10) com o Pulse ainda de 30/10: 30/10 continua vindo do Pulse; histórico só para trás
  const v = await b.newPage({ viewport: { width: 390, height: 844 } });
  v.on('pageerror', e => erros.push(e.message));
  await v.clock.install({ time: new Date('2026-10-31T09:15:00') });
  await v.goto(URL); await v.waitForFunction(() => window.__ura.estado().dados && window.__ura.estado().hist);
  await v.click('nav.tabs button[data-v="evo"]');
  await v.locator('#pgEvo .topbar.fechado').count() && await v.click('#pgEvo .ctl-seta'); await v.click('#pgEvo button[data-dir="CO"]'); await v.click('#pgEvo .ctl-seta'); // a Evolução abre no Total URA: estes testes usam o CO
  const nv = await v.$eval('#pgEvo .dnav', x => x.innerText.replace(/\s+/g, ' '));
  ok(/sex, 30\/10\/2026/.test(nv) && await v.$eval('#toast', t => t.textContent) === 'Pulse', 'Pulse de 30/10 aberto em 31/10: 30/10 continua do Pulse, aviso "Pulse" (' + nv.trim() + ')');
  ok(await v.locator('#pgEvo .chart h2:has-text("TÉCNICOS EM ESPERA")').count() === 1, 'continua com a fila do Pulse');
  ok(await v.$eval('#dnData', i => i.max) === '2026-10-30', 'não há dia depois do dia do Pulse');
  await v.click('#pgEvo [data-navdia="-1"]');
  await v.waitForTimeout(100);
  ok(/qui, 29\/10\/2026/.test(await v.$eval('#pgEvo .dnav', x => x.innerText.replace(/\s+/g, ' '))) && await v.$eval('#toast', t => t.textContent) === 'Histórico · Genesys', 'dia anterior vem do histórico');
  await v.close();
  ok(erros.length === 0, 'sem erros de JavaScript' + (erros.length ? ': ' + erros.join(' | ') : ''));
  await b.close();
})();

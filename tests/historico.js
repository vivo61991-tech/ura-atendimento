// Evolução com o histórico: navegação por dia e comparação pela mediana. Precisa do historico.csv no site de teste.
const { chromium } = require('/home/claude/.npm-global/lib/node_modules/playwright');
const fs = require('fs'), path = require('path');
const D = require('../dados.js'), Hs = require('../historico.js');
const URL = process.env.URL || 'http://localhost:8765/ura/';
const ok = (c, m) => { if (!c) { console.log('FALHOU', m); process.exitCode = 1; } else console.log('ok  ', m); };
const abrir = async p => { if (await p.locator('#pgEvo .topbar.fechado').count()) await p.click('#pgEvo .ctl-seta'); };
// valores esperados calculados aqui, direto do arquivo (mesmos módulos, sem o navegador)
const H = Hs.parse(fs.readFileSync(path.join(__dirname, 'historico_amostra.csv'), 'utf8'));
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
    return p;
  };
  const p = await nova();
  const nav = () => p.$eval('#pgEvo .dnav', n => ({ t: n.querySelector('.dn-t').innerText.replace(/\s+/g, ' '), hist: n.classList.contains('hist'),
    ant: !n.querySelector('[data-navdia="-1"]').disabled, prox: !n.querySelector('[data-navdia="1"]').disabled, hoje: !!n.querySelector('.dn-hoje') }));
  const titulos = () => p.$$eval('#pgEvo .chart h2', h => h.map(x => x.innerText));
  const kOf = () => p.$eval('#pgEvo .kpis2 .kpi .v', x => x.textContent);
  // 1) abre no dia ao vivo
  let n = await nav();
  ok(/sex, 30\/10 ao vivo · Pulse/.test(n.t) && !n.hist && n.ant && !n.prox && !n.hoje, 'abre em "sex, 30/10 · ao vivo · Pulse" (sem próximo dia)');
  ok((await titulos()).some(t => /TÉCNICOS EM ESPERA/i.test(t)), 'ao vivo: tem o gráfico de técnicos em espera');
  // 2) dia anterior = histórico
  await p.click('#pgEvo [data-navdia="-1"]'); await p.waitForTimeout(150);
  n = await nav();
  ok(/qui, 29\/10 histórico · Genesys/.test(n.t) && n.hist && n.prox && n.hoje, 'seta ‹: qui, 29/10 do histórico (com "Hoje")');
  const t29 = await titulos();
  ok(!t29.some(t => /TÉCNICOS EM ESPERA/i.test(t)) && t29.length === 6, `histórico: sem o gráfico de fila (${t29.length} gráficos)`);
  ok(await kOf() === fI(totCO('2026-10-29').ofer), `oferecidas CO de 29/10 = ${fI(totCO('2026-10-29').ofer)} (arquivo)`);
  const kp = await p.$$eval('#pgEvo .kpis2 .kpi .l', x => x.map(e => e.textContent));
  ok(kp.includes('Atendidas') && !kp.includes('Pico em espera'), 'histórico: card "Atendidas" no lugar de "Pico em espera"');
  const filaTab = await p.$$eval('#tIv tbody tr', rs => rs.map(r => r.children[5] && r.children[5].textContent));
  ok(filaTab.every(x => x === '—'), 'tabela: fila "—" no histórico (não zero)');
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
  ok(/30\/10 ao vivo/.test((await nav()).t), '"Hoje" volta para o dia ao vivo');
  // 6) comparação com as 7 sextas
  await abrir(p); await p.click('#pgEvo button[data-passo="60"]'); await p.click('#pgEvo button[data-cmp="sem"]');
  const nRef = await p.$$eval('#pgEvo .chart', cs => cs.map(c => c.querySelectorAll('path.ref').length));
  ok(nRef.filter(x => x > 0).length === 6, `linha da mediana em 6 dos 7 gráficos (fila não tem histórico): ${nRef.join(',')}`);
  const leg = await p.$eval('#inf-evo-of', x => x.textContent);
  ok(/mediana das últimas 7 sextas do histórico \(23\/10, 16\/10, 09\/10, 02\/10, 25\/09, 18\/09, 11\/09\)/.test(leg), 'legenda: as 7 sextas usadas');
  const esperadoOf = medAte(19 * 60 + 15, a => a.ofer);
  const r0 = await p.$eval('#pgEvo .kpis2 .kpi .r', x => x.textContent);
  ok(r0.includes('med. 7 sex: ' + fI(esperadoOf)), `card: mediana das sextas até 19:15 = ${fI(esperadoOf)} (${r0.trim()})`);
  // coluna das 11h: mediana conferida em Python (173)
  await p.locator('#pgEvo .chart').first().locator('rect.hit').nth(3).click(); await p.waitForTimeout(150);
  const cap = await p.$eval('#pgEvo .chart .csel', x => x.innerText.replace(/\s+/g, ' '));
  ok(/mediana 7 sextas: 173/.test(cap), 'coluna 11h: "mediana 7 sextas: 173" (conferido em Python)');
  // coluna em andamento: sem mediana
  const ult = await p.$$eval('#pgEvo .chart', cs => cs[0].querySelectorAll('rect.hit').length);
  await p.locator('#pgEvo .chart').first().locator('rect.hit').nth(ult - 1).click(); await p.waitForTimeout(150);
  ok(/só para colunas fechadas/.test(await p.$eval('#pgEvo .chart .csel', x => x.innerText)), 'coluna em andamento: sem mediana (só colunas fechadas)');
  // 7 dias corridos
  await p.click('#pgEvo button[data-cmp="dias"]');
  ok(/mediana dos últimos 7 dias do histórico \(29\/10, 28\/10, 27\/10, 26\/10, 25\/10, 24\/10, 23\/10\)/.test(await p.$eval('#inf-evo-of', x => x.textContent)), '7 dias corridos: 29/10 a 23/10');
  // num dia do histórico a comparação usa as semanas anteriores a ele
  await p.click('#pgEvo [data-navdia="-1"]'); await p.click('#pgEvo button[data-cmp="sem"]'); await p.waitForTimeout(150);
  ok(/7 quintas do histórico \(22\/10/.test(await p.$eval('#inf-evo-of', x => x.textContent)), 'em 29/10: compara com as 7 quintas anteriores');
  // comparação é lembrada; controles recolhidos com 4 botões cabem em 360 px
  await p.close();
  const q = await nova(URL, 360);
  const rec = await q.$eval('#pgEvo .ctl-res', r => [...r.querySelectorAll('.ctl-p')].map(x => ({ t: x.textContent, corta: x.scrollWidth > x.clientWidth })));
  ok(rec.length === 3, 'sem comparação salva: 3 botões recolhidos');
  await abrir(q); await q.click('#pgEvo button[data-cmp="sem"]'); await q.click('#pgEvo .ctl-seta');
  const rec2 = await q.$eval('#pgEvo .ctl-res', r => [...r.querySelectorAll('.ctl-p')].map(x => ({ t: x.textContent, corta: x.scrollWidth > x.clientWidth })));
  ok(rec2.length === 4 && rec2.every(x => !x.corta), '360 px, recolhido com comparação: ' + rec2.map(x => x.t + (x.corta ? '(CORTADO)' : '')).join(' · '));
  await q.reload(); await q.waitForFunction(() => window.__ura.estado().hist); await q.click('nav.tabs button[data-v="evo"]');
  ok(await q.evaluate(() => window.__ura.estado().evo.cmp) === 'sem', 'comparação lembrada ao reabrir');
  const w = await q.evaluate(() => document.documentElement.scrollWidth);
  ok(w <= 360, `sem estouro lateral em 360 px (${w}px)`);
  await q.close();
  // 8) sem histórico no site: app funciona, navegação e comparação desligadas
  const s = await nova(URL + '?historico=nao-existe.csv');
  const ns = await s.$eval('#pgEvo .dnav', x => x.innerText.replace(/\s+/g, ' '));
  ok(/sem histórico/.test(ns), 'sem historico.csv: barra avisa "sem histórico"');
  await abrir(s);
  ok(await s.$eval('#pgEvo button[data-cmp="sem"]', x => x.disabled) && await s.locator('#pgEvo .chart').count() === 7, 'sem histórico: comparação desativada e os 7 gráficos do dia normais');
  // abrir o histórico pelo botão de arquivo
  await s.setInputFiles('#arq', path.join(__dirname, 'historico_amostra.csv')); await s.waitForTimeout(800);
  ok(await s.evaluate(() => window.__ura.estado().histOrigem) === 'arquivo' && /139 dias/.test(await s.$eval('#toast', t => t.textContent)), 'histórico aberto do aparelho (139 dias)');
  await s.close();
  ok(erros.length === 0, 'sem erros de JavaScript' + (erros.length ? ': ' + erros.join(' | ') : ''));
  await b.close();
})();

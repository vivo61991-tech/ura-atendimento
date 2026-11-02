// Painel "Grupos e skills" da Evolução: ordem pelo volume do dia, barra, números, abrir as skills,
// filtrar a tela pelo nome (grupo ou skill) sem mudar a ordem nem mexer na rolagem.
const { chromium } = require('/home/claude/.npm-global/lib/node_modules/playwright');
const D = require('../dados.js');
const URL = process.env.URL || 'http://localhost:8765/ura/';
const ok = (c, m) => { if (!c) { console.log('FALHOU', m); process.exitCode = 1; } else console.log('ok  ', m); };
const amostra = require('./amostra.json');
const d = D.normalizar(amostra), L = d.leituras[d.leituras.length - 1];
const fI = n => Math.round(n).toLocaleString('pt-BR');
const ofer = ss => D.agregar(L, ss).ofer;
(async () => {
  const b = await chromium.launch();
  const erros = [];
  const p = await b.newPage({ viewport: { width: 390, height: 844 } });
  p.on('pageerror', e => erros.push(e.message));
  await p.clock.install({ time: new Date('2026-10-30T19:17:30') });
  await p.goto(URL); await p.evaluate(() => localStorage.clear()); await p.reload();
  await p.waitForFunction(() => window.__ura.estado().dados && window.__ura.estado().hist);
  await p.click('nav.tabs button[data-v="evo"]');
  const pn = '#pgEvo .painel[data-ch="evo-grupos"]';
  ok(await p.locator(pn).count() === 1, 'painel "Grupos e skills" na Evolução');
  // 1) grupos do Total URA, do maior para o menor volume do dia, com a quantidade de cada um
  const todas = D.filtro(d, { dir: 'TODOS' }), grp = new Map();
  todas.forEach(s => { const g = d.trad[s].SKILL_GRUPO; if (!grp.has(g)) grp.set(g, []); grp.get(g).push(s); });
  const esp = [...grp.entries()].map(([g, ss]) => ({ g, q: ofer(ss), n: new Set(ss.map(s => d.trad[s].SKILL_SIMPLIFICADO)).size })).sort((a, b) => b.q - a.q || a.g.localeCompare(b.g));
  const linhas = () => p.$$eval(`${pn} .gks > .gk`, ls => ls.map(l => ({ g: l.querySelector('.gk-n').textContent, q: l.querySelector('.gk-q').textContent, n: l.querySelector('.gk-x b').textContent,
    w: l.querySelectorAll('.gk-bar i')[0].style.width, w2: l.querySelectorAll('.gk-bar i')[1].style.width, m: l.querySelector('.gk-m').textContent.replace(/\s+/g, ' ') })));
  let ls = await linhas();
  ok(ls.map(x => x.g).join('|') === esp.map(x => x.g).join('|'), 'ordem: maior número de oferecidas (do dia) primeiro: ' + ls.map(x => x.g).join(', '));
  ok(ls.every((x, i) => x.q === fI(esp[i].q)), 'quantidade de cada grupo = oferecidas do dia (CO + TEL)');
  ok(ls.every((x, i) => x.n === `${esp[i].n} ${esp[i].n === 1 ? 'skill' : 'skills'}`), '1ª informação: quantidade de skills (negrito e itálico)');
  const tot = esp.reduce((t, x) => t + x.q, 0);
  const g0 = esp[0], g0co = D.agregar(L, grp.get(g0.g).filter(s => d.trad[s].DIRECIONAMENTO === 'CO'));
  ok(Math.abs(parseFloat(ls[0].w) + parseFloat(ls[0].w2) - g0.q / tot * 100) < 0.05, `barra = parte do volume (${g0.g}: ${(g0.q / tot * 100).toFixed(1)}%), CO e TEL em cores separadas`);
  ok(ls[0].m.includes('NS ' + D.fmtPct(g0co.ns)) && ls[0].m.includes('TME') && ls[0].m.includes('TMA') && /aband\./.test(ls[0].m), 'embaixo: NS, abandonadas, TME e TMA: ' + ls[0].m);
  const est = await p.$eval(`${pn} .gk-m`, m => ({ it: getComputedStyle(m.querySelector('i')).fontStyle, fs: parseFloat(getComputedStyle(m).fontSize), b: getComputedStyle(m.querySelector('.gk-x b')).fontWeight }));
  ok(est.it === 'italic' && est.fs <= 12 && +est.b >= 700, `letra pequena e itálica (${est.fs}px); skills em negrito`);
  // 2) abrir as skills: a linha do grupo não sai do lugar
  await p.evaluate(sel => { const r = document.querySelector(sel); scrollBy(0, r.getBoundingClientRect().top - 430); }, `${pn} .gks > .gk`);   // abaixo dos controles presos no topo
  await p.waitForTimeout(100);
  const trazer = async (g, y) => { await p.evaluate(([g, y]) => { const l = [...document.querySelectorAll('#pgEvo [data-anc]')].find(x => x.dataset.anc === g); scrollBy(0, l.getBoundingClientRect().top - y); }, [g, y]); await p.waitForTimeout(80); };
  const topo = g => p.$$eval(`${pn} [data-anc]`, (ls, g) => { const l = ls.find(x => x.dataset.anc === g); return l ? Math.round(l.getBoundingClientRect().top) : null; }, g);
  const y0 = await topo('g:' + g0.g);
  await p.click(`${pn} .gks > .gk .gk-x`); await p.waitForTimeout(150);
  ok(Math.abs(await topo('g:' + g0.g) - y0) <= 1, `abrir as skills: a linha do grupo fica parada (${y0} px)`);
  const subs = await p.$$eval(`${pn} .gk-sub .gk`, ls => ls.map(l => ({ n: l.querySelector('.gk-n').textContent, q: l.querySelector('.gk-q').textContent })));
  ok(subs.length === g0.n, `${g0.n} skills abertas embaixo do grupo`);
  const qs = subs.map(x => +x.q.replace(/\./g, ''));
  ok(qs.every((x, i) => i === 0 || qs[i - 1] >= x), 'skills do maior para o menor volume');
  const fundo = await p.$eval(`${pn} .gk-sub`, s => [getComputedStyle(s).backgroundColor, getComputedStyle(s.closest('.card')).backgroundColor]);
  ok(fundo[0] !== fundo[1], 'skills com fundo um pouco mais escuro (sub-item): ' + fundo.join(' × '));
  // 3) filtrar pela skill: a tela inteira filtra, o painel não muda de ordem e a linha tocada não se mexe
  const sk = subs[0].n, ssSk = grp.get(g0.g).filter(s => d.trad[s].SKILL_SIMPLIFICADO === sk);
  const ySk = await topo('s:' + g0.g + '|' + sk);
  await p.click(`${pn} .gk-sub .gk-n >> nth=0`); await p.waitForTimeout(150);
  ok(Math.abs(await topo('s:' + g0.g + '|' + sk) - ySk) <= 1, `filtrar pela skill: a linha tocada fica parada (${ySk} px)`);
  const st = await p.evaluate(() => { const e = window.__ura.estado().evo; return [e.grupo, e.skill]; });
  ok(st[0] === g0.g && st[1] === sk, `filtro: grupo ${st[0]} › skill ${st[1]}`);
  const kOf = await p.$eval('#pgEvo .chart[data-ch="evo-of"] .ch-v', x => x.textContent);
  ok(kOf === fI(ofer(ssSk)), `total do 1º gráfico = só a skill (${kOf})`);
  ok((await p.$eval('#pgEvo .chart[data-ch="evo-of"] .ch-filtro', x => x.textContent)).includes('› ' + sk), 'rodapé dos gráficos mostra a skill');
  ls = await linhas();
  ok(ls.map(x => x.g).join('|') === esp.map(x => x.g).join('|') && ls[0].q === fI(g0.q), 'painel não se filtra: mesma ordem e mesmos números');
  ok(await p.locator(`${pn} .gk-sub .gk.on`).count() === 1, 'skill escolhida marcada');
  // tocar de novo limpa a skill (o grupo continua)
  await p.click(`${pn} .gk-sub .gk-n >> nth=0`); await p.waitForTimeout(150);
  ok(await p.evaluate(() => window.__ura.estado().evo.skill) === null && await p.evaluate(() => window.__ura.estado().evo.grupo) === g0.g, 'tocar de novo na skill limpa a skill (fica o grupo)');
  // 4) filtrar pelo grupo (outro grupo): chip marcado, cards do grupo, linha parada
  const g1 = esp[1];
  await trazer('g:' + g1.g, 420);
  const yG = await topo('g:' + g1.g);
  await p.click(`${pn} .gks > .gk >> nth=1 >> .gk-n`); await p.waitForTimeout(150);
  ok(Math.abs(await topo('g:' + g1.g) - yG) <= 1, `filtrar pelo grupo: linha parada (${yG} px)`);
  ok(await p.evaluate(() => window.__ura.estado().evo.grupo) === g1.g && await p.locator(`#pgEvo .chip[aria-pressed="true"][data-grp="${g1.g}"]`).count() === 1, 'grupo aplicado e botão do grupo marcado');
  ok(await p.$eval('#pgEvo .chart[data-ch="evo-of"] .ch-v', x => x.textContent) === fI(g1.q), `total do gráfico = volume do grupo (${fI(g1.q)})`);
  ok(await p.locator(`${pn} .gks > .gk.on`).count() === 1, 'grupo escolhido marcado no painel');
  await p.click(`${pn} .gks > .gk >> nth=1 >> .gk-n`); await p.waitForTimeout(150);
  ok(await p.evaluate(() => window.__ura.estado().evo.grupo) === null, 'tocar de novo no grupo limpa o filtro');
  // a faixa de cima inteira filtra: tocar no NÚMERO e na BARRA também (não só no nome)
  const g2 = esp[2];
  await trazer('g:' + g2.g, 430);
  await p.click(`${pn} .gks > .gk >> nth=2 >> .gk-q`); await p.waitForTimeout(150);
  ok(await p.evaluate(() => window.__ura.estado().evo.grupo) === g2.g, `tocar no número (${g2.g}) filtra`);
  await p.click(`${pn} .gks > .gk >> nth=2 >> .gk-bar`); await p.waitForTimeout(150);
  ok(await p.evaluate(() => window.__ura.estado().evo.grupo) === null, 'tocar na barra (de novo) limpa');
  const faixa = await p.$eval(`${pn} .gks > .gk .gk-top`, t => { const r = t.getBoundingClientRect(), l = t.closest('.gk').getBoundingClientRect(); return { w: r.width >= l.width - 20, temNum: !!t.querySelector('.gk-q'), temBarra: !!t.querySelector('.gk-bar') }; });
  ok(faixa.w && faixa.temNum && faixa.temBarra, 'faixa tocável ocupa a largura da linha (nome, número e barra)');
  // "N skills" só abre a lista, não filtra
  await p.click(`${pn} .gks > .gk >> nth=2 >> .gk-x`); await p.waitForTimeout(150);
  ok(await p.evaluate(() => window.__ura.estado().evo.grupo) === null && await p.locator(`${pn} .gk-sub`).count() >= 1, '"skills" só abre a lista, sem filtrar');
  await p.click(`${pn} .gks > .gk >> nth=2 >> .gk-x`); await p.waitForTimeout(150);
  // skill: tocar no número também filtra
  await p.click(`${pn} .gk-sub .gk-q >> nth=0`); await p.waitForTimeout(150);
  ok(!!(await p.evaluate(() => window.__ura.estado().evo.skill)), 'skill: tocar no número também filtra');
  await p.click(`${pn} .gk-sub .gk-q >> nth=0`); await p.waitForTimeout(150);
  // 5) fechar as skills: linha parada
  await trazer('g:' + g0.g, 350);
  const y2 = await topo('g:' + g0.g);
  await p.click(`${pn} .gks > .gk .gk-x`); await p.waitForTimeout(150);
  ok(Math.abs(await topo('g:' + g0.g) - y2) <= 1 && await p.locator(`${pn} .gk-sub`).count() === 0, 'fechar as skills: linha parada');
  // 6) coluna selecionada: números da coluna, do maior para o menor (a ordem segue o que está sendo mostrado)
  await p.evaluate(() => window.scrollTo(0, 0));
  await p.locator('#pgEvo .chart').first().locator('rect.hit').nth(3).click(); await p.waitForTimeout(150);
  const c11 = D.intervalos(d, 60, todas).find(i => i.rot === '11:00');
  const l12 = d.leituras.find(x => x.m === c11.ateM), l11 = d.leituras.find(x => x.m === c11.baseM);
  const q11 = ss => D.agregar(l12, ss).ofer - D.agregar(l11, ss).ofer;
  ls = await linhas();
  const esp11 = [...grp.entries()].map(([g, ss]) => ({ g, q: q11(ss) })).sort((a, b) => b.q - a.q || esp.findIndex(x => x.g === a.g) - esp.findIndex(x => x.g === b.g));
  ok(/11:00–12:00/.test(await p.$eval(`${pn} h2`, h => h.textContent)) && ls.map(x => x.g).join('|') === esp11.map(x => x.g).join('|') && ls.every((x, i) => x.q === fI(esp11[i].q)),
    `coluna 11h: números da coluna, do maior para o menor: ${ls.map(x => x.g + ' ' + x.q).join(', ')}`);
  const qs11 = ls.map(x => +x.q.replace(/\./g, ''));
  ok(qs11.every((x, i) => i === 0 || qs11[i - 1] >= x), 'ordem decrescente pelas oferecidas mostradas');
  // 7) 360 px escuro, dia do histórico
  const q = await b.newPage({ viewport: { width: 360, height: 800 }, colorScheme: 'dark' });
  q.on('pageerror', e => erros.push(e.message));
  await q.clock.install({ time: new Date('2026-10-30T19:17:30') });
  await q.goto(URL); await q.waitForFunction(() => window.__ura.estado().hist); await q.click('nav.tabs button[data-v="evo"]');
  await q.click('#pgEvo [data-navdia="-1"]'); await q.waitForTimeout(150);
  await q.evaluate(() => document.querySelector('#pgEvo .gk-x').click()); await q.waitForTimeout(100);
  ok(await q.locator('#pgEvo .gk').count() > 8, 'dia do histórico: painel com grupos e skills');
  ok(await q.evaluate(() => document.documentElement.scrollWidth) <= 360, '360 px: sem estouro lateral');
  ok(await q.$$eval('#pgEvo .gk-l', ls => ls.every(l => l.querySelector('.gk-q').getBoundingClientRect().right <= l.getBoundingClientRect().right + 0.5)), '360 px: quantidade sempre à vista');
  ok(!erros.length, 'sem erros no console' + (erros.length ? ': ' + erros.join(' | ') : ''));
  await b.close();
})();

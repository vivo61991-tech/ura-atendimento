// Aba Skills com a barra de data da Evolução (sem o botão Horas/Dia): a data é a mesma nas duas abas; a lista e o
// detalhe da skill mostram o dia escolhido. Botão "Hoje" verde; "Último" (quando o último dia não é hoje) roxo.
const { chromium } = require('/home/claude/.npm-global/lib/node_modules/playwright');
const fs = require('fs'), path = require('path');
const D = require('../dados.js'), Hs = require('../historico.js');
const URL = process.env.URL || 'http://localhost:8765/ura/';
const ok = (c, m) => { if (!c) { console.log('FALHOU', m); process.exitCode = 1; } else console.log('ok  ', m); };
const H = Hs.parse(fs.readFileSync(path.join(__dirname, 'historico_amostra.csv'), 'utf8'));
const trad = require('./amostra.json').skills;
const fI = D.fmtInt;
(async () => {
  const b = await chromium.launch(); const erros = [];
  const nova = async quando => {
    const p = await b.newPage({ viewport: { width: 390, height: 844 } });
    p.on('pageerror', e => erros.push(e.message));
    await p.clock.install({ time: new Date(quando) });
    await p.goto(URL); await p.evaluate(() => localStorage.clear()); await p.reload();
    await p.waitForFunction(() => window.__ura.estado().hist);
    return p;
  };
  const p = await nova('2026-10-30T19:17:30');
  await p.click('nav.tabs button[data-v="skills"]'); await p.waitForTimeout(200);
  const barra = await p.$eval('#pgSkills', pg => { const n = pg.querySelector('.dnav'); return { existe: !!n, primeiro: pg.firstElementChild === n, vis: !!pg.querySelector('.dn-vis'), data: n && n.querySelector('.dn-t b').textContent }; });
  ok(barra.existe && barra.primeiro && !barra.vis && barra.data === 'sex, 30/10/2026', `barra de data no topo da aba Skills, sem o botão Horas/Dia (${barra.data})`);
  ok(await p.locator('#pgSkills .dn-hoje').count() === 0, 'no último dia não aparece o botão de voltar');
  // dia anterior na aba Skills
  await p.click('#pgSkills [data-navdia="-1"]'); await p.waitForTimeout(250);
  ok(await p.$eval('#pgSkills .dn-t b', x => x.textContent) === 'qui, 29/10/2026' && await p.evaluate(() => window.__ura.estado().evo.dia) === '2026-10-29', '‹ na aba Skills: 29/10 (a mesma data da Evolução)');
  // a lista mostra o dia escolhido (conta independente, do histórico)
  const d29 = Hs.diaComoDados(H, '2026-10-29', trad), L29 = d29.leituras[d29.leituras.length - 1];
  const mapa = new Map(); D.filtro(d29, { dir: 'TODOS' }).forEach(s => { const k = d29.trad[s].SKILL_SIMPLIFICADO; if (!mapa.has(k)) mapa.set(k, []); mapa.get(k).push(s); });
  const top = [...mapa.entries()].map(([n, ss]) => ({ n, v: D.agregar(L29, ss).ofer })).sort((x, y) => y.v - x.v || x.n.localeCompare(y.n))[0];
  const prim = await p.$eval('#pgSkills .fi', x => ({ n: x.querySelector('.nm').textContent, v: x.querySelector('.nv b').textContent }));
  ok(prim.n === top.n && prim.v === fI(top.v), `lista de 29/10: 1ª skill ${prim.n} com ${prim.v} (conferido no histórico: ${fI(top.v)})`);
  ok(/Com chamadas no dia/i.test(await p.$eval('#pgSkills h2.sec', x => x.textContent)), 'título "Com chamadas no dia" num dia passado');
  // botão Hoje: verde
  const bt = await p.$eval('#pgSkills .dn-hoje', x => ({ t: x.textContent, c: getComputedStyle(x).backgroundColor }));
  ok(bt.t === 'Hoje' && bt.c === 'rgb(106, 158, 20)', `botão "Hoje" verde (${bt.c})`);
  // detalhe da skill no dia escolhido
  await p.locator('#pgSkills .fi').first().click(); await p.waitForTimeout(350);
  const sh = await p.$eval('#sheet', x => x.innerText.replace(/\s+/g, ' '));
  ok(/· 29\/10/.test(sh) && sh.includes(fI(top.v) + ' de ') && /Dia 29\/10\/2026 \(histórico Genesys\)/.test(await p.$eval('#sheet', x => x.textContent)) && !/Em espera agora|Agentes logados|EWT/.test(sh), 'detalhe da skill: 29/10, números do dia, sem os retratos do momento');
  await p.click('#sheet [data-act="fechar"]'); await p.waitForTimeout(250);
  // sincronia: a Evolução está em 29/10; mudar lá muda aqui
  await p.click('nav.tabs button[data-v="evo"]'); await p.waitForTimeout(200);
  ok(await p.$eval('#pgEvo .dn-t b', x => x.textContent) === 'qui, 29/10/2026', 'a Evolução acompanha: 29/10');
  await p.click('#pgEvo [data-navdia="-1"]'); await p.waitForTimeout(250);
  await p.click('nav.tabs button[data-v="skills"]'); await p.waitForTimeout(200);
  ok(await p.$eval('#pgSkills .dn-t b', x => x.textContent) === 'qua, 28/10/2026', 'dia anterior na Evolução: a aba Skills vai junto (28/10)');
  // seletor de data na aba Skills
  await p.$eval('#dnDataSk', i => { i.value = '2026-10-20'; i.dispatchEvent(new Event('change', { bubbles: true })); }); await p.waitForTimeout(250);
  ok(await p.evaluate(() => window.__ura.estado().evo.dia) === '2026-10-20' && await p.$eval('#pgSkills .dn-t b', x => x.textContent) === 'ter, 20/10/2026', 'seletor de data da aba Skills: 20/10 (vale para as duas abas)');
  // a aba Agora continua ao vivo: o detalhe aberto pela lista "Em espera agora" é do dia de hoje
  await p.click('nav.tabs button[data-v="agora"]'); await p.waitForTimeout(200);
  if (await p.locator('#pgAgora .fi[data-sk]').count()) {
    await p.locator('#pgAgora .fi[data-sk]').first().click(); await p.waitForTimeout(350);
    ok(/Em espera agora/.test(await p.$eval('#sheet', x => x.innerText)) && /· 30\/10/.test(await p.$eval('#sheet', x => x.innerText)), 'detalhe aberto da aba Agora: dia ao vivo (30/10), com "Em espera agora"');
    await p.click('#sheet [data-act="fechar"]'); await p.waitForTimeout(250);
  }
  // voltar para hoje
  await p.click('nav.tabs button[data-v="skills"]'); await p.click('#pgSkills .dn-hoje'); await p.waitForTimeout(250);
  ok(await p.$eval('#pgSkills .dn-t b', x => x.textContent) === 'sex, 30/10/2026' && /Com chamadas hoje/i.test(await p.$eval('#pgSkills h2.sec', x => x.textContent)), '"Hoje" volta para 30/10 ("Com chamadas hoje")');
  await p.close();
  // quando o último dia com dados não é hoje: "Último", roxo
  const q = await nova('2026-10-31T10:00:00');
  await q.click('nav.tabs button[data-v="skills"]'); await q.click('#pgSkills [data-navdia="-1"]'); await q.waitForTimeout(250);
  const ul = await q.$eval('#pgSkills .dn-hoje', x => ({ t: x.textContent, c: getComputedStyle(x).backgroundColor }));
  ok(ul.t === 'Último' && ul.c === 'rgb(100, 42, 144)', `último dia não é hoje: "Último" roxo (${ul.c})`);
  await q.click('nav.tabs button[data-v="evo"]'); await q.waitForTimeout(200);
  ok(await q.$eval('#pgEvo .dn-hoje', x => x.textContent === 'Último' && getComputedStyle(x).backgroundColor === 'rgb(100, 42, 144)') && await q.locator('#pgEvo .dn-vis').count() === 1, 'na Evolução também: "Último" roxo, e o botão Horas/Dia continua lá');
  // 360 px escuro
  const r = await b.newPage({ viewport: { width: 360, height: 800 }, colorScheme: 'dark' });
  r.on('pageerror', e => erros.push(e.message));
  await r.clock.install({ time: new Date('2026-10-30T19:17:30') });
  await r.goto(URL); await r.waitForFunction(() => window.__ura.estado().hist); await r.click('nav.tabs button[data-v="skills"]'); await r.click('#pgSkills [data-navdia="-1"]'); await r.waitForTimeout(250);
  ok(await r.evaluate(() => document.documentElement.scrollWidth) <= 360 && await r.$eval('#pgSkills .dn-t b', b => b.scrollWidth <= b.closest('.dn-d').clientWidth + 1), '360 px escuro: a barra cabe, sem estouro');
  ok(!erros.length, 'sem erros no console' + (erros.length ? ': ' + erros.join(' | ') : ''));
  await b.close();
})();

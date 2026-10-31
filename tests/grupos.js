// Tabelas "CO por grupo" e "TEL por grupo" (aba Agora): uma linha na tela larga; duas linhas padronizadas na estreita.
const { chromium } = require('/home/claude/.npm-global/lib/node_modules/playwright');
const URL = process.env.URL || 'http://localhost:8765/ura/';
const ok = (c, m) => { if (!c) { console.log('FALHOU', m); process.exitCode = 1; } else console.log('ok  ', m); };
const medir = p => p.$$eval('.tg', ts => ts.map(t => [...t.querySelectorAll('.tg-r')].map(r => {
  const n = r.querySelector('.nm').getBoundingClientRect(), vs = [...r.querySelectorAll('.v')].map(v => v.getBoundingClientRect());
  return { h: r.getBoundingClientRect().height, nTop: n.top, nH: n.height, vTop: vs[0].top, vRight: vs.map(v => Math.round(v.right)), nm: r.querySelector('.nm'), corta: r.querySelector('.nm').scrollWidth > r.querySelector('.nm').clientWidth };
}).map(({ nm, ...x }) => x)));
(async () => {
  const b = await chromium.launch();
  const erros = [];
  for (const [larg, nome] of [[360, 'celular pequeno'], [390, 'celular'], [900, 'tela larga']]) {
    const p = await b.newPage({ viewport: { width: larg, height: 844 } });
    p.on('pageerror', e => erros.push(e.message));
    await p.clock.install({ time: new Date('2026-10-30T19:17:30') });
    await p.goto(URL);
    await p.waitForFunction(() => window.__ura.estado().dados);
    const ts = await medir(p);
    ok(ts.length === 2, `${nome}: tabelas CO e TEL`);
    ts.forEach((rows, k) => {
      const tab = k ? 'TEL' : 'CO', dados = rows.slice(1);
      const duas = dados.every(r => r.vTop > r.nTop + r.nH - 2);
      if (larg < 540) ok(duas, `${nome} ${tab}: TODAS as linhas em duas (nome em cima, números embaixo)`);
      else ok(dados.every(r => Math.abs(r.vTop - r.nTop) < 4), `${nome} ${tab}: uma linha por grupo`);
      const hs = dados.map(r => Math.round(r.h));
      ok(Math.max(...hs) - Math.min(...hs) <= 1, `${nome} ${tab}: linhas da mesma altura (${[...new Set(hs)].join('/')} px)`);
      ok(dados.every(r => r.nH < 22), `${nome} ${tab}: nome sem quebra de linha`);
      const col = rows[0].vRight;
      ok(rows.every(r => r.vRight.every((x, i) => Math.abs(x - col[i]) <= 1)), `${nome} ${tab}: números alinhados com o cabeçalho`);
    });
    const w = await p.evaluate(() => document.documentElement.scrollWidth);
    ok(w <= larg, `${nome}: sem estouro lateral`);
    if (larg === 390) {
      await p.locator('.tg-a').first().click();
      const st = await p.evaluate(() => { const s = window.__ura.estado(); return s.pagina + '|' + s.evo.dir + '|' + s.evo.grupo; });
      ok(st === 'evo|CO|SUPORTE BANDA LARGA', 'tocar no grupo abre a Evolução filtrada (' + st + ')');
    }
    await p.close();
  }
  ok(erros.length === 0, 'sem erros de JavaScript' + (erros.length ? ': ' + erros.join(' | ') : ''));
  await b.close();
})();

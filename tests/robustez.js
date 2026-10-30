// Robustez com Playwright: arquivo quebrado mantém os últimos dados válidos; 404 usa a cópia do aparelho; nada estoura a largura.
const { chromium } = require('/home/claude/.npm-global/lib/node_modules/playwright');
const fs = require('fs');
const SITE = process.env.SITE || '/tmp/claude-0/site/ura';
const URL = process.env.URL || 'http://localhost:8765/ura/';
const ok = (c, m) => { if (!c) { console.log('FALHOU', m); process.exitCode = 1; } else console.log('ok  ', m); };
(async () => {
  const bom = fs.readFileSync(SITE + '/pulse.json', 'utf8');
  const b = await chromium.launch();
  const ctx = await b.newContext({ viewport: { width: 390, height: 844 } });
  const p = await ctx.newPage();
  const erros = []; p.on('pageerror', e => erros.push(e.message));
  await p.clock.install({ time: new Date('2026-10-30T19:17:30') });
  await p.goto(URL);
  await p.waitForFunction(() => window.__ura.estado().dados);
  for (const v of ['agora', 'evo', 'skills']) {
    await p.click(`nav.tabs button[data-v="${v}"]`);
    const w = await p.evaluate(() => document.documentElement.scrollWidth);
    ok(w <= 390, `aba ${v} sem estouro lateral (${w}px)`);
  }
  // 1) arquivo quebrado
  fs.writeFileSync(SITE + '/pulse.json', '{"dia":"2026-10-30","metricas":[');
  await p.click('#btRefresh'); await p.waitForTimeout(400);
  let st = await p.evaluate(() => { const s = window.__ura.estado(); return { n: s.dados && s.dados.leituras.length, e: s.erroDados }; });
  ok(st.n === 47 && /JSON/.test(st.e), 'JSON quebrado: mantém os 47 slots válidos e avisa');
  ok(await p.locator('.banner.bad').count() === 1, 'faixa vermelha de arquivo com problema');
  // 2) arquivo sumiu (404) e app recarregado: usa a cópia guardada
  fs.unlinkSync(SITE + '/pulse.json');
  await p.reload(); await p.waitForTimeout(600);
  st = await p.evaluate(() => { const s = window.__ura.estado(); return { n: s.dados && s.dados.leituras.length, f: s.erroFonte, o: s.origem }; });
  ok(st.n === 47 && /não encontrado/.test(st.f) && st.o === 'copia', '404: usa a cópia do aparelho e avisa');
  // 3) abrir arquivo do aparelho
  fs.writeFileSync('/tmp/claude-0/teste-local.json', bom);
  await p.setInputFiles('#arq', '/tmp/claude-0/teste-local.json'); await p.waitForTimeout(400);
  st = await p.evaluate(() => window.__ura.estado().origem);
  ok(st === 'arquivo', 'arquivo aberto do aparelho');
  fs.writeFileSync(SITE + '/pulse.json', bom);   // devolve o arquivo do site
  ok(erros.length === 0, 'sem erros de JavaScript' + (erros.length ? ': ' + erros.join(' | ') : ''));
  await b.close();
})();

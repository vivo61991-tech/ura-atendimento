// Teste de tela: abre o app com Playwright (390 px, claro e escuro), percorre as 3 abas e tira prints.
const { chromium } = require('/home/claude/.npm-global/lib/node_modules/playwright');
const URL = process.env.URL || 'http://localhost:8765/ura/';
const OUT = process.env.OUT || '/tmp/claude-0/shots';
require('fs').mkdirSync(OUT, { recursive: true });
(async () => {
  const b = await chromium.launch();
  const erros = [];
  for (const tema of ['light', 'dark']) {
    const ctx = await b.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, colorScheme: tema });
    const p = await ctx.newPage();
    p.on('pageerror', e => erros.push(tema + ' pageerror: ' + e.message));
    p.on('console', m => { if (m.type() === 'error') erros.push(tema + ' console: ' + m.text()); });
    await p.clock.install({ time: new Date('2026-10-30T19:17:30') });
    await p.goto(URL);
    await p.waitForFunction(() => window.__ura && window.__ura.estado().dados);
    await p.waitForTimeout(300);
    await p.screenshot({ path: `${OUT}/${tema}-1-agora.png`, fullPage: true });
    await p.click('nav.tabs button[data-v="evo"]'); await p.waitForTimeout(200);
    await p.screenshot({ path: `${OUT}/${tema}-2-evo.png`, fullPage: true });
    // seleciona uma coluna
    await p.locator('#pgEvo .chart').first().locator('rect.hit').nth(3).click(); await p.waitForTimeout(200);
    await p.screenshot({ path: `${OUT}/${tema}-3-evo-sel.png`, fullPage: true });
    await p.click('#pgEvo button[data-dir="TODOS"]'); await p.click('#pgEvo button[data-passo="15"]'); await p.waitForTimeout(200);
    await p.screenshot({ path: `${OUT}/${tema}-4-evo-total15.png`, fullPage: true });
    await p.click('#pgEvo button[data-passo="auto"]');
    await p.click('nav.tabs button[data-v="skills"]'); await p.waitForTimeout(200);
    await p.screenshot({ path: `${OUT}/${tema}-5-skills.png`, fullPage: true });
    await p.locator('#pgSkills .fi').first().click(); await p.waitForTimeout(400);
    await p.screenshot({ path: `${OUT}/${tema}-6-detalhe.png` });
    const st = await p.evaluate(() => { const s = window.__ura.estado(); return { origem: s.origem, erroFonte: s.erroFonte, erroDados: s.erroDados, n: s.dados.leituras.length }; });
    console.log(tema, JSON.stringify(st));
    await ctx.close();
  }
  await b.close();
  console.log(erros.length ? 'ERROS:\n' + erros.join('\n') : 'sem erros no console');
})();


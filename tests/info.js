// Botão (i) dos gráficos: escondido por padrão, abre/fecha no toque, só um aberto por vez.
const { chromium } = require('/home/claude/.npm-global/lib/node_modules/playwright');
const URL = process.env.URL || 'http://localhost:8765/ura/';
const ok = (c, m) => { if (!c) { console.log('FALHOU', m); process.exitCode = 1; } else console.log('ok  ', m); };
(async () => {
  const b = await chromium.launch();
  const p = await b.newPage({ viewport: { width: 390, height: 844 } });
  const erros = []; p.on('pageerror', e => erros.push(e.message));
  await p.clock.install({ time: new Date('2026-10-30T19:17:30') });
  await p.goto(URL);
  await p.waitForFunction(() => window.__ura.estado().dados);
  const abertos = () => p.evaluate(() => [...document.querySelectorAll('.ch-info')].filter(x => !x.hidden && x.offsetParent).map(x => x.id));
  ok((await abertos()).length === 0, 'Agora: explicação escondida ao abrir');
  ok(await p.$$eval('#pgAgora .chart .legend', ls => ls.length >= 7 && ls.every(l => !l.offsetParent)), 'Agora: legendas não aparecem sem tocar no (i)');
  await p.click('nav.tabs button[data-v="evo"]');
  const nInfo = await p.locator('#pgEvo button.info').count();
  ok(nInfo >= 5, `Evolução: botão (i) em todos os ${nInfo} gráficos`);
  ok((await abertos()).length === 0, 'Evolução: tudo escondido');
  const bt = i => p.locator('#pgEvo button.info').nth(i);
  await bt(0).click();
  ok(JSON.stringify(await abertos()) === '["inf-evo-of"]' && await bt(0).getAttribute('aria-expanded') === 'true', 'toque no (i) do 1º gráfico: abre só ele');
  await bt(2).click();
  ok(JSON.stringify(await abertos()) === '["inf-evo-ofco"]', 'abrir outro gráfico fecha o anterior');
  await bt(2).click();
  ok((await abertos()).length === 0, 'tocar de novo recolhe');
  // continua aberto quando a tela se redesenha (seleção de coluna)
  await bt(1).click();
  await p.locator('#pgEvo .chart').first().locator('rect.hit').nth(4).click();
  ok(JSON.stringify(await abertos()) === '["inf-evo-oftel"]', 'selecionar uma coluna mantém aberto o que estava aberto');
  ok(await p.locator('#pgEvo .chart').first().locator('.capsel').isVisible(), 'resumo do intervalo selecionado fica à vista, fora do (i)');
  // trocar de aba fecha
  await p.click('nav.tabs button[data-v="skills"]'); await p.click('nav.tabs button[data-v="evo"]');
  ok((await abertos()).length === 0, 'trocar de aba fecha a explicação');
  // detalhe da skill
  await p.click('nav.tabs button[data-v="skills"]'); await p.locator('#pgSkills .fi').first().click(); await p.waitForTimeout(300);
  await p.locator('#sheet button.info').click();
  ok(JSON.stringify(await abertos()) === '["inf-sk-of"]', 'detalhe da skill: (i) abre a legenda');
  ok(erros.length === 0, 'sem erros de JavaScript' + (erros.length ? ': ' + erros.join(' | ') : ''));
  await b.close();
})();

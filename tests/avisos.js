// Rótulos "NS 5 min" e avisos laranja do topo com X para fechar.
const { chromium } = require('/home/claude/.npm-global/lib/node_modules/playwright');
const URL = process.env.URL || 'http://localhost:8765/ura/';
const ok = (c, m) => { if (!c) { console.log('FALHOU', m); process.exitCode = 1; } else console.log('ok  ', m); };
(async () => {
  const b = await chromium.launch();
  const p = await b.newPage({ viewport: { width: 390, height: 844 } });
  const erros = []; p.on('pageerror', e => erros.push(e.message));
  // dia seguinte aos dados: aparece o aviso "não são de hoje"
  await p.clock.install({ time: new Date('2026-10-31T09:15:00') });
  await p.goto(URL);
  await p.waitForFunction(() => window.__ura.estado().dados);
  await p.click('nav.tabs button[data-v="agora"]');   // o app abre em Alarmes
  const txt = await p.evaluate(() => document.body.innerText);
  ok(!/300s/.test(txt), 'nenhum "300s" na tela Agora');
  ok(/NS 5 min · CO/.test(txt), 'destaque: "NS 5 min · CO"');
  const av = p.locator('#banners .banner.warn');
  ok(await av.count() === 1 && /não de hoje/.test(await av.innerText()), 'aviso laranja "dados de 30/10/2026, não de hoje"');
  const x = await p.$eval('#banners .bx-x', e => { const r = e.getBoundingClientRect(), c = e.closest('.banner').getBoundingClientRect(); return { dir: Math.round(c.right - r.right), alt: Math.round(r.height) }; });
  ok(x.dir <= 12, `X no canto direito do aviso (${x.dir}px da borda)`);
  const topoAntes = await p.$eval('#pgAgora', e => Math.round(e.getBoundingClientRect().top));
  await p.click('#banners .bx-x');
  ok(await p.locator('#banners .banner').count() === 0, 'X fecha o aviso');
  const topoDepois = await p.$eval('#pgAgora', e => Math.round(e.getBoundingClientRect().top));
  ok(topoDepois < topoAntes, `layout volta ao normal (conteúdo sobe de ${topoAntes} para ${topoDepois}px)`);
  // continua fechado ao atualizar e ao trocar de aba
  await p.click('#btRefresh'); await p.waitForTimeout(800);
  await p.click('nav.tabs button[data-v="evo"]'); await p.click('nav.tabs button[data-v="agora"]');
  ok(await p.locator('#banners .banner').count() === 0, 'continua fechado depois de atualizar e trocar de aba');
  // Evolução e detalhe: rótulos em 5 min
  await p.click('nav.tabs button[data-v="evo"]');
  await p.click('#pgEvo [data-menu="dir"]'); await p.click('#pgEvo button[data-dir="CO"]'); // a Evolução abre no Total URA: estes testes usam o CO
  const evo = await p.evaluate(() => document.querySelector('#pgEvo').innerText);
  ok(!/300s/.test(evo) && /NS \(5 min\) POR INTERVALO/.test(evo), 'Evolução: gráfico "NS (5 min) por intervalo" (sem "300s")');
  await p.click('nav.tabs button[data-v="skills"]');
  await p.locator('#pgSkills .fi[data-skd="CO"]').first().click(); await p.waitForTimeout(300);
  ok(/NS 5 min/.test(await p.$eval('#sheet', e => e.innerText)), 'detalhe da skill: "NS 5 min"');
  // ao reabrir o app, o aviso volta (o motivo continua)
  await p.reload(); await p.waitForFunction(() => window.__ura.estado().dados);
  ok(await p.locator('#banners .banner.warn').count() === 1, 'ao reabrir o app, o aviso volta');
  ok(erros.length === 0, 'sem erros de JavaScript' + (erros.length ? ': ' + erros.join(' | ') : ''));
  await b.close();
})();

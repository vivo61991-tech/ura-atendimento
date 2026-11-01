// Fixar os controles da Evolução: alfinete só com os controles abertos; fixado, controles + grupos ficam presos no topo.
const { chromium } = require('/home/claude/.npm-global/lib/node_modules/playwright');
const URL = process.env.URL || 'http://localhost:8765/ura/';
const ok = (c, m) => { if (!c) { console.log('FALHOU', m); process.exitCode = 1; } else console.log('ok  ', m); };
(async () => {
  const b = await chromium.launch();
  const p = await b.newPage({ viewport: { width: 390, height: 844 } });
  const erros = []; p.on('pageerror', e => erros.push(e.message));
  await p.clock.install({ time: new Date('2026-10-30T19:17:30') });
  await p.goto(URL);
  await p.evaluate(() => { try { localStorage.removeItem('ura-b2c:fixo'); } catch (e) {} });
  await p.reload();
  await p.waitForFunction(() => window.__ura.estado().dados);
  await p.click('nav.tabs button[data-v="evo"]');
  const vis = async () => p.evaluate(() => {
    const h = document.querySelector('header.top').getBoundingClientRect().bottom;
    const t = document.querySelector('#pgEvo .evo-ctl > :first-child').getBoundingClientRect(), c = document.querySelector('#pgEvo .chips').getBoundingClientRect();
    return { topo: Math.round(t.top - h), chipsVis: c.top >= h - 1 && c.bottom <= innerHeight, fixo: !!document.querySelector('#pgEvo .evo-ctl.fixo') };
  });
  ok(await p.locator('#pgEvo .ctl-pino').count() === 0, 'recolhido: sem o alfinete');
  await p.click('#pgEvo .ctl-seta');
  const pos = await p.$eval('#pgEvo .ctl-pino', pi => { const s = pi.nextElementSibling; return s && s.classList.contains('ctl-seta') && pi.getBoundingClientRect().right <= s.getBoundingClientRect().left; });
  ok(pos, 'aberto: alfinete à esquerda da seta');
  // sem fixar, rolando a tela os controles somem
  await p.mouse.wheel(0, 1600); await p.waitForTimeout(250);
  let v = await vis();
  ok(!v.fixo && v.topo < -100, `sem fixar: controles saem da tela ao rolar (${v.topo}px)`);
  await p.evaluate(() => scrollTo(0, 0)); await p.waitForTimeout(100);
  // fixar
  await p.click('#pgEvo .ctl-pino');
  ok(await p.getAttribute('#pgEvo .ctl-pino', 'aria-pressed') === 'true', 'alfinete marcado');
  await p.mouse.wheel(0, 1600); await p.waitForTimeout(250);
  v = await vis();
  ok(v.fixo && Math.abs(v.topo) <= 14 && v.chipsVis, `fixado: controles e faixa de grupos presos logo abaixo do topo (${v.topo}px)`);
  // mexer nos controles com a tela rolada (gráficos se ajustam e os controles continuam lá)
  await p.click('#pgEvo button[data-modo="acum"]'); await p.waitForTimeout(150);
  v = await vis();
  ok(v.fixo && Math.abs(v.topo) <= 14, 'trocar o modo com a tela rolada: continua preso');
  await p.click('#pgEvo .chip[data-grp="MANOBRA"]'); await p.waitForTimeout(500);
  v = await vis();
  ok(v.fixo && v.chipsVis && await p.evaluate(() => window.__ura.estado().evo.grupo) === 'MANOBRA', 'escolher grupo com a tela rolada: grupo aplicado e faixa visível');
  // recolher: continua fixado, sem alfinete
  await p.click('#pgEvo .ctl-seta'); await p.waitForTimeout(100);
  await p.mouse.wheel(0, 800); await p.waitForTimeout(250);
  v = await vis();
  ok(v.fixo && Math.abs(v.topo) <= 14 && await p.locator('#pgEvo .ctl-pino').count() === 0, 'recolhido continua fixado (e sem o alfinete)');
  // lembra a escolha ao reabrir
  await p.reload(); await p.waitForFunction(() => window.__ura.estado().dados);
  await p.click('nav.tabs button[data-v="evo"]');
  ok((await vis()).fixo, 'ao reabrir o app, continua fixado');
  // soltar: só com os controles abertos
  await p.click('#pgEvo .ctl-seta'); await p.click('#pgEvo .ctl-pino'); await p.waitForTimeout(100);
  await p.mouse.wheel(0, 1600); await p.waitForTimeout(250);
  v = await vis();
  ok(!v.fixo && v.topo < -100, `solto: volta a rolar junto com a tela (${v.topo}px)`);
  const w = await p.evaluate(() => document.documentElement.scrollWidth);
  ok(w <= 390, `sem estouro lateral (${w}px)`);
  ok(erros.length === 0, 'sem erros de JavaScript' + (erros.length ? ': ' + erros.join(' | ') : ''));
  await b.close();
})();

// Arrastar para o lado troca de aba: Agora ⇄ Evolução ⇄ Skills (com toque de verdade, pelo protocolo do Chrome).
const { chromium } = require('/home/claude/.npm-global/lib/node_modules/playwright');
const URL = process.env.URL || 'http://localhost:8765/ura/';
const ok = (c, m) => { if (!c) { console.log('FALHOU', m); process.exitCode = 1; } else console.log('ok  ', m); };
(async () => {
  const b = await chromium.launch(); const erros = [];
  const ctx = await b.newContext({ viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true });
  const p = await ctx.newPage();
  p.on('pageerror', e => erros.push(e.message));
  await p.clock.install({ time: new Date('2026-10-30T19:17:30') });
  await p.goto(URL); await p.waitForFunction(() => window.__ura.estado().hist);
  const cdp = await ctx.newCDPSession(p);
  const toque = async (tipo, x, y) => cdp.send('Input.dispatchTouchEvent', { type: tipo, touchPoints: tipo === 'touchEnd' ? [] : [{ x, y }] });
  const arrastar = async (x0, y0, dx, dy, passos = 8, ms = 18) => {
    await toque('touchStart', x0, y0);
    for (let k = 1; k <= passos; k++) { await toque('touchMove', x0 + dx * k / passos, y0 + dy * k / passos); await p.waitForTimeout(ms); }
    await toque('touchEnd'); await p.waitForTimeout(380);
  };
  const aba = () => p.evaluate(() => window.__ura.estado().pagina);
  ok(await aba() === 'agora', 'começa na Agora');
  await arrastar(320, 500, -200, 6);
  ok(await aba() === 'evo', 'arrastar para a esquerda: Evolução');
  await arrastar(320, 600, -200, -4);
  ok(await aba() === 'skills', 'de novo: Skills');
  await arrastar(320, 500, -200, 0);
  ok(await aba() === 'skills', 'na última aba, para a esquerda não sai');
  await arrastar(60, 500, 200, 0);
  ok(await aba() === 'evo', 'arrastar para a direita: volta para a Evolução');
  const sec = await p.$eval('#pgEvo', el => ({ t: el.style.transform, o: el.style.opacity }));
  ok(!sec.t && !sec.o, 'depois de trocar, a tela fica no lugar (sem deslocamento sobrando)');
  // gestos que NÃO trocam
  await arrastar(300, 600, -40, 0, 8, 60);
  ok(await aba() === 'evo', 'arrasto curto e lento: não troca (volta para o lugar)');
  await arrastar(200, 650, -90, -260);
  ok(await aba() === 'evo', 'gesto mais vertical que horizontal (rolar a tela): não troca');
  const chips = await p.$eval('#pgEvo .chips', c => { const r = c.getBoundingClientRect(); return { x: r.left + r.width * 0.8, y: r.top + r.height / 2 }; });
  await arrastar(chips.x, chips.y, -200, 0);
  ok(await aba() === 'evo', 'arrastar na faixa de grupos rola a faixa, não troca de aba');
  // rápido e curto também troca
  await arrastar(250, 600, -60, 0, 3, 15);
  ok(await aba() === 'skills', 'arrasto rápido (curto) também troca');
  await arrastar(60, 600, 210, 0); await arrastar(60, 600, 210, 0);
  ok(await aba() === 'agora', 'dois arrastos para a direita: volta para a Agora');
  ok(await p.$eval('nav.tabs button.on', x => x.dataset.v) === 'agora', 'menu de baixo acompanha a aba');
  // detalhe da skill aberto: arrastar não troca
  await p.click('nav.tabs button[data-v="skills"]'); await p.locator('#pgSkills .fi').first().click(); await p.waitForTimeout(300);
  await arrastar(320, 300, -200, 0);
  ok(await aba() === 'skills', 'com o detalhe da skill aberto, arrastar não troca de aba');
  ok(!erros.length, 'sem erros no console' + (erros.length ? ': ' + erros.join(' | ') : ''));
  await b.close();
})();

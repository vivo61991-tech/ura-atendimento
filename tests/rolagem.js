// Trocar a data não pode mexer na rolagem: o gráfico que está na tela continua no mesmo lugar,
// mesmo quando o dia novo tem um gráfico a menos acima (o histórico não tem "técnicos em espera").
const { chromium } = require('/home/claude/.npm-global/lib/node_modules/playwright');
const URL = process.env.URL || 'http://localhost:8765/ura/';
const ok = (c, m) => { if (!c) { console.log('FALHOU', m); process.exitCode = 1; } else console.log('ok  ', m); };
(async () => {
  const b = await chromium.launch();
  const erros = [];
  const nova = async fixo => {
    const p = await b.newPage({ viewport: { width: 390, height: 844 } });
    p.on('pageerror', e => erros.push(e.message));
    await p.clock.install({ time: new Date('2026-10-30T19:17:30') });
    await p.goto(URL);
    await p.evaluate(f => { try { localStorage.setItem('ura-b2c:fixo', JSON.stringify(f)); localStorage.removeItem('ura-b2c:cmp'); } catch (e) {} }, fixo);
    await p.reload();
    await p.waitForFunction(() => window.__ura.estado().dados && window.__ura.estado().hist);
    await p.click('nav.tabs button[data-v="evo"]');
    return p;
  };
  const topo = (p, ch) => p.$eval(`#pgEvo .chart[data-ch="${ch}"]`, c => Math.round(c.getBoundingClientRect().top));
  const rolarAte = async (p, ch, y) => { await p.evaluate(([ch, y]) => { const c = document.querySelector(`#pgEvo .chart[data-ch="${ch}"]`); scrollBy(0, c.getBoundingClientRect().top - y); }, [ch, y]); await p.waitForTimeout(100); };

  // 1) controles fixados no topo: trocar a data pelas setas, pelo seletor e pelo "Hoje"
  const p = await nova(true);
  ok(await p.locator('#pgEvo .evo-ctl.fixo').count() === 1, 'controles fixados (a barra de data fica à vista ao rolar)');
  await rolarAte(p, 'evo-ns', 420);
  const y0 = await topo(p, 'evo-ns');
  await p.click('#pgEvo [data-navdia="-1"]'); await p.waitForTimeout(150);
  ok(await p.locator('#pgEvo .chart[data-ch="evo-esp"] rect.hit').count() === 0, 'dia anterior (histórico): cartão da fila sem gráfico (mais baixo) acima');
  let y = await topo(p, 'evo-ns');
  ok(Math.abs(y - y0) <= 1, `‹ dia anterior: gráfico de NS parado na tela (${y0} → ${y} px)`);
  await p.click('#pgEvo [data-navdia="-1"]'); await p.waitForTimeout(150);
  y = await topo(p, 'evo-ns');
  ok(Math.abs(y - y0) <= 1, `‹ mais um dia: continua parado (${y} px)`);
  await p.$eval('#dnData', i => { i.value = '2026-09-15'; i.dispatchEvent(new Event('change', { bubbles: true })); }); await p.waitForTimeout(150);
  y = await topo(p, 'evo-ns');
  ok(Math.abs(y - y0) <= 1, `seletor de data (15/09): continua parado (${y} px)`);
  await p.click('#pgEvo .dn-hoje'); await p.waitForTimeout(150);
  ok(await p.locator('#pgEvo .chart[data-ch="evo-esp"] rect.hit').count() > 0, 'de volta ao dia do Pulse: gráfico da fila voltou acima');
  y = await topo(p, 'evo-ns');
  ok(Math.abs(y - y0) <= 1, `"Hoje": gráfico de NS no mesmo lugar (${y} px)`);
  // trocar o previsto também não mexe
  await rolarAte(p, 'evo-tma', 380);
  const t0 = await topo(p, 'evo-tma');
  await p.evaluate(() => document.querySelector('#pgEvo button[data-cmp="off"]').click()); await p.waitForTimeout(150);
  y = await topo(p, 'evo-tma');
  ok(Math.abs(y - t0) <= 1, `previsto desligado: gráfico de TMA parado (${t0} → ${y} px)`);
  // o gráfico de fila está na tela e o dia novo não tem fila: o cartão dela fica no mesmo lugar
  await p.evaluate(() => document.querySelector('#pgEvo button[data-cmp="sem"]').click()); await p.waitForTimeout(100);
  await rolarAte(p, 'evo-esp', 300);
  await p.click('#pgEvo [data-navdia="-1"]'); await p.waitForTimeout(150);
  y = await topo(p, 'evo-esp');
  ok(Math.abs(y - 300) <= 1, `fila na tela e dia sem fila: o cartão da fila continua no mesmo lugar (${y} px)`);
  await p.close();

  // 2) sem fixar, no topo da tela: continua no topo
  const q = await nova(false);
  await q.click('#pgEvo [data-navdia="-1"]'); await q.waitForTimeout(150);
  ok(await q.evaluate(() => scrollY) === 0, 'sem fixar, no topo: trocar o dia mantém a tela no topo');
  await q.click('#pgEvo [data-navdia="1"]'); await q.waitForTimeout(150);
  ok(await q.evaluate(() => scrollY) === 0, 'sem fixar: › volta e continua no topo');
  // selecionar coluna com a tela rolada: o gráfico tocado não pula
  await rolarAte(q, 'evo-ab', 400);
  await q.locator('#pgEvo .chart[data-ch="evo-ab"] rect.hit').nth(4).click(); await q.waitForTimeout(150);
  y = await topo(q, 'evo-ab');
  ok(Math.abs(y - 400) <= 1, `tocar numa coluna com a tela rolada: gráfico parado (${y} px)`);
  await q.close();

  ok(!erros.length, 'sem erros no console' + (erros.length ? ': ' + erros.join(' | ') : ''));
  await b.close();
})();

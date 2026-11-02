// Títulos dos gráficos centralizados e numa linha só (360 px), total embaixo do título e o visto no abandono zerado.
const { chromium } = require('/home/claude/.npm-global/lib/node_modules/playwright');
const D = require('../dados.js');
const URL = process.env.URL || 'http://localhost:8765/ura/';
const ok = (c, m) => { if (!c) { console.log('FALHOU', m); process.exitCode = 1; } else console.log('ok  ', m); };
(async () => {
  const b = await chromium.launch(); const erros = [];
  for (const larg of [360, 390]) {
    const p = await b.newPage({ viewport: { width: larg, height: 800 } });
    p.on('pageerror', e => erros.push(e.message));
    await p.clock.install({ time: new Date('2026-10-30T19:17:30') });
    await p.goto(URL); await p.evaluate(() => localStorage.clear()); await p.reload();
    await p.waitForFunction(() => window.__ura.estado().hist);
    for (const [aba, pg] of [['agora', '#pgAgora'], ['evo', '#pgEvo']]) {
      await p.click(`nav.tabs button[data-v="${aba}"]`); await p.waitForTimeout(150);
      const t = await p.$$eval(`${pg} .chart h2`, hs => hs.map(h => { const cs = getComputedStyle(h), lh = parseFloat(cs.lineHeight) || parseFloat(cs.fontSize) * 1.2;
        return { t: h.textContent, uma: h.getBoundingClientRect().height < lh * 1.5, centro: cs.textAlign === 'center' }; }));
      ok(t.length >= 9 && t.every(x => x.uma && x.centro), `${aba} ${larg}px: ${t.length} títulos centralizados e numa linha só` + (t.every(x => x.uma) ? '' : ': ' + t.filter(x => !x.uma).map(x => x.t).join(', ')));
      ok(t.some(x => x.t === 'TME por intervalo · CO') && t.some(x => x.t === 'TMA por intervalo · CO'), `${aba}: "TME por intervalo" e "TMA por intervalo"`);
      const tot = await p.$$eval(`${pg} .chart`, cs => cs.every(c => { const h = c.querySelector('h2'), v = c.querySelector('.ch-tot'), s = c.querySelector('svg');
        return v && h.getBoundingClientRect().bottom <= v.getBoundingClientRect().top + 1 && v.getBoundingClientRect().bottom <= s.getBoundingClientRect().top + 1; }));
      ok(tot, `${aba} ${larg}px: total embaixo do título, acima do gráfico, em todos`);
      const caps = await p.$$eval(`${pg} .chart .ch-v`, vs => vs.map(v => { const cs = getComputedStyle(v); return cs.backgroundColor !== 'rgba(0, 0, 0, 0)' && parseFloat(cs.borderTopLeftRadius) > 8; }));
      ok(caps.length >= 9 && caps.every(Boolean), `${aba} ${larg}px: número em cápsula roxa bem clara em todos os gráficos`);
    }
    await p.close();
  }
  // abandono zerado: visto verde (13h e 14h na amostra), sem rótulo "0%"
  const p = await b.newPage({ viewport: { width: 390, height: 800 } });
  await p.clock.install({ time: new Date('2026-10-30T19:17:30') });
  await p.goto(URL); await p.waitForFunction(() => window.__ura.estado().hist); await p.click('nav.tabs button[data-v="evo"]');
  const d = D.normalizar(require('./amostra.json')), iv = D.intervalos(d, 60, D.filtro(d, { dir: 'CO' }));
  const zeros = iv.filter(i => i.v && !i.v.aband).length;
  const ab = await p.$eval('#pgEvo .chart[data-ch="evo-ab"] svg', s => ({ ok: s.querySelectorAll('circle[style*="okc"]').length, z: [...s.querySelectorAll('text')].filter(t => t.textContent === '0%').length }));
  const esp = await p.$eval('#pgEvo .chart[data-ch="evo-esp"] svg', s => s.querySelectorAll('circle[style*="okc"]').length);
  ok(zeros > 0 && ab.z === 0 && ab.ok > 0, `abandono: ${zeros} colunas sem abandono com o visto (como a fila zerada), sem "0%"`);
  ok(ab.ok / zeros === esp / iv.filter(i => i.esp && i.esp.pico === 0).length, 'mesmo ícone da fila zerada');
  ok(!erros.length, 'sem erros no console' + (erros.length ? ': ' + erros.join(' | ') : ''));
  await b.close();
})();

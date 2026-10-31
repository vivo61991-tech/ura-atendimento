// Rodapé dos gráficos da Evolução: filtro aplicado na linha do botão (i).
const { chromium } = require('/home/claude/.npm-global/lib/node_modules/playwright');
const URL = process.env.URL || 'http://localhost:8765/ura/';
const ok = (c, m) => { if (!c) { console.log('FALHOU', m); process.exitCode = 1; } else console.log('ok  ', m); };
const abrir = async p => { if (await p.locator('#pgEvo .topbar.fechado').count()) await p.click('#pgEvo .ctl-seta'); };
(async () => {
  const b = await chromium.launch();
  const p = await b.newPage({ viewport: { width: 390, height: 844 } });
  const erros = []; p.on('pageerror', e => erros.push(e.message));
  await p.clock.install({ time: new Date('2026-10-30T19:17:30') });
  await p.goto(URL);
  await p.waitForFunction(() => window.__ura.estado().dados);
  await p.click('nav.tabs button[data-v="evo"]');
  const filtros = () => p.$$eval('#pgEvo .chart', cs => cs.map(c => { const f = c.querySelector('.ch-base .ch-filtro'); return f ? f.textContent : ''; }));
  const um = async () => { const f = await filtros(); return new Set(f).size === 1 ? f[0] : 'DIFERENTES: ' + f.join(' | '); };
  ok(await um() === 'CO', 'CO selecionado: "CO" em todos os gráficos');
  await p.click('#pgEvo .chip[data-grp="MANOBRA"]'); await p.waitForTimeout(400);
  ok(await um() === 'CO – MANOBRA', 'CO + grupo: "CO – MANOBRA"');
  await abrir(p); await p.click('#pgEvo button[data-dir="TEL"]');
  ok(await um() === 'TEL', 'TEL (grupo limpo ao trocar): "TEL"');
  await p.click('#pgEvo .chip[data-grp="SUSPEITA MASSIVA"]'); await p.waitForTimeout(400);
  ok(await um() === 'TEL – SUSPEITA MASSIVA', 'TEL + grupo: "TEL – SUSPEITA MASSIVA"');
  await p.click('#pgEvo button[data-dir="TODOS"]');
  ok((await filtros()).every(f => f === ''), 'Total URA sem grupo: nada');
  await p.click('#pgEvo .chip[data-grp="MANOBRA"]'); await p.waitForTimeout(400);
  ok(await um() === 'MANOBRA', 'Total URA + grupo dos dois atendimentos: só "MANOBRA"');
  await p.click('#pgEvo .chip[data-grp="SUSPEITA MASSIVA"]'); await p.waitForTimeout(400);
  ok(await um() === 'TEL – SUSPEITA MASSIVA', 'Total URA + grupo só da TEL: "TEL – SUSPEITA MASSIVA"');
  // estilo discreto e na linha do (i)
  const st = await p.$eval('#pgEvo .chart .ch-filtro', f => { const cs = getComputedStyle(f), i = f.parentElement.querySelector('.info'); const a = f.getBoundingClientRect(), r = i.getBoundingClientRect();
    return { w: +cs.fontWeight, fs: parseFloat(cs.fontSize), mesmaLinha: Math.abs((a.top + a.height / 2) - (r.top + r.height / 2)) < 3, antes: a.right <= r.left }; });
  ok(st.w < 600 && st.fs <= 12, `sem negrito e letra pequena (peso ${st.w}, ${st.fs}px)`);
  ok(st.mesmaLinha && st.antes, 'na mesma linha do (i)');
  const cen = await p.$$eval('#pgEvo .chart', cs => cs.map(c => { const f = c.querySelector('.ch-filtro'), r = document.createRange(); r.selectNodeContents(f);
    const t = r.getBoundingClientRect(), k = c.getBoundingClientRect(); return Math.abs((t.left + t.width / 2) - (k.left + k.width / 2)); }));
  ok(cen.every(x => x < 2), `texto centralizado no cartão (desvio máx. ${Math.max(...cen).toFixed(1)}px)`);
  const iPos = await p.$eval('#pgEvo .chart', c => { const i = c.querySelector('.info').getBoundingClientRect(), k = c.getBoundingClientRect(); return Math.round(k.right - i.right); });
  ok(iPos <= 14, `(i) continua no canto direito (${iPos}px da borda)`);
  // com coluna selecionada: resumo em cima, filtro e (i) embaixo
  await p.locator('#pgEvo .chart').first().locator('rect.hit').nth(3).click(); await p.waitForTimeout(200);
  const ordem = await p.$eval('#pgEvo .chart', c => { const s = c.querySelector('.csel').getBoundingClientRect(), f = c.querySelector('.ch-filtro').getBoundingClientRect(); return f.top >= s.bottom - 1; });
  ok(ordem && await um() === 'TEL – SUSPEITA MASSIVA', 'com coluna selecionada: resumo em cima, filtro na linha do (i) embaixo');
  // aba Agora e detalhe: sem filtro
  await p.click('nav.tabs button[data-v="agora"]');
  ok(await p.locator('#pgAgora .ch-filtro').count() === 0, 'gráfico da aba Agora: sem texto de filtro');
  const w = await p.evaluate(() => document.documentElement.scrollWidth);
  ok(w <= 390, `sem estouro lateral (${w}px)`);
  ok(erros.length === 0, 'sem erros de JavaScript' + (erros.length ? ': ' + erros.join(' | ') : ''));
  await b.close();
})();

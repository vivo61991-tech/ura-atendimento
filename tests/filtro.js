// Rodapé dos gráficos da Evolução: comparação com a mediana na linha do (i), em letra bem pequena; o filtro embaixo dela.
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
  await p.waitForFunction(() => window.__ura.estado().dados && window.__ura.estado().hist);
  await p.click('nav.tabs button[data-v="evo"]');
  await p.locator('#pgEvo .topbar.fechado').count() && await p.click('#pgEvo .ctl-seta'); await p.click('#pgEvo button[data-dir="CO"]'); await p.click('#pgEvo .ctl-seta'); // a Evolução abre no Total URA: estes testes usam o CO
  const filtros = () => p.$$eval('#pgEvo .chart', cs => cs.map(c => { const f = c.querySelector('.ch-pe > .ch-filtro'); return f ? f.textContent : ''; }));
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
  // estilo discreto; a comparação com a mediana fica na linha do (i) (letra bem pequena) e o filtro embaixo dela
  const st = await p.$eval('#pgEvo .chart', c => { const f = c.querySelector('.ch-filtro'), dt = c.querySelector('.ch-det'), i = c.querySelector('.info');
    const cs = getComputedStyle(f), a = f.getBoundingClientRect(), r = i.getBoundingClientRect(), d = dt.getBoundingClientRect();
    return { w: +cs.fontWeight, fs: parseFloat(cs.fontSize), fsD: parseFloat(getComputedStyle(dt).fontSize), det: dt.textContent, embaixo: a.top >= r.bottom - 1,
      detLinha: Math.abs((d.top + d.height / 2) - (r.top + r.height / 2)) < 4 && d.right <= r.left }; });
  ok(st.w < 600 && st.fs <= 12, `filtro sem negrito e letra pequena (peso ${st.w}, ${st.fs}px)`);
  ok(st.embaixo, 'filtro embaixo da linha do (i)');
  ok(st.detLinha && st.fsD <= 11 && /^med\. 7 sex: /.test(st.det), `comparação com a mediana na linha do (i), letra bem pequena (${st.fsD}px): ${st.det}`);
  const cen = await p.$$eval('#pgEvo .chart', cs => cs.map(c => { const f = c.querySelector('.ch-filtro'), r = document.createRange(); r.selectNodeContents(f);
    const t = r.getBoundingClientRect(), k = c.getBoundingClientRect(); return Math.abs((t.left + t.width / 2) - (k.left + k.width / 2)); }));
  ok(cen.every(x => x < 2), `texto centralizado no cartão (desvio máx. ${Math.max(...cen).toFixed(1)}px)`);
  const iPos = await p.$eval('#pgEvo .chart', c => { const i = c.querySelector('.info').getBoundingClientRect(), k = c.getBoundingClientRect(); return Math.round(k.right - i.right); });
  ok(iPos <= 14, `(i) continua no canto direito (${iPos}px da borda)`);
  // com coluna selecionada: resumo em cima, filtro e (i) embaixo
  await p.locator('#pgEvo .chart').first().locator('rect.hit').nth(3).click(); await p.waitForTimeout(200);
  const ordem = await p.$eval('#pgEvo .chart', c => { const s = c.querySelector('.csel').getBoundingClientRect(), f = c.querySelector('.ch-filtro').getBoundingClientRect(); return f.top >= s.bottom - 1; });
  ok(ordem && await um() === 'TEL – SUSPEITA MASSIVA', 'com coluna selecionada: resumo em cima, filtro embaixo');
  // aba Agora e detalhe: sem filtro
  await p.click('nav.tabs button[data-v="agora"]');
  ok(await p.locator('#pgAgora .ch-filtro').count() === 0, 'gráfico da aba Agora: sem texto de filtro');
  const w = await p.evaluate(() => document.documentElement.scrollWidth);
  ok(w <= 390, `sem estouro lateral (${w}px)`);
  ok(erros.length === 0, 'sem erros de JavaScript' + (erros.length ? ': ' + erros.join(' | ') : ''));
  await b.close();
})();

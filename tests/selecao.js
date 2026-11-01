// Seleção de coluna: cada gráfico mostra o período e só os valores dele, centralizados.
const { chromium } = require('/home/claude/.npm-global/lib/node_modules/playwright');
// controles da Evolução começam recolhidos: abre antes de usar
const abrir = async p => { if (await p.locator('#pgEvo .topbar.fechado').count()) await p.click('#pgEvo .ctl-seta'); };
const URL = process.env.URL || 'http://localhost:8765/ura/';
const ok = (c, m) => { if (!c) { console.log('FALHOU', m); process.exitCode = 1; } else console.log('ok  ', m); };
(async () => {
  const b = await chromium.launch();
  const p = await b.newPage({ viewport: { width: 390, height: 844 } });
  const erros = []; p.on('pageerror', e => erros.push(e.message));
  await p.clock.install({ time: new Date('2026-10-30T19:17:30') });
  await p.goto(URL);
  await p.waitForFunction(() => window.__ura.estado().dados);
  await p.click('nav.tabs button[data-v="evo"]');
  await abrir(p); await p.click('#pgEvo button[data-passo="60"]');
  ok(await p.locator('.csel').count() === 0, 'sem seleção: nenhum resumo');
  // coluna das 11h (4ª) no gráfico de técnicos em espera
  await p.locator('#pgEvo .chart').nth(1).locator('rect.hit').nth(3).click();
  const caps = await p.$$eval('#pgEvo .chart .csel', els => els.map(e => e.innerText.replace(/\s+/g, ' ').trim()));
  console.log(caps.map((c, i) => '   ' + i + ': ' + c).join('\n'));
  ok(caps.length === 7, 'um resumo em cada um dos 7 gráficos');
  ok(caps.every(c => c.startsWith('11:00–12:00')), 'todos começam pelo período selecionado');
  ok(/187 oferecidas · 107 atendidas · 77 abandonadas/.test(caps[0]) && !/NS|TME|técnico/.test(caps[0]), 'oferecidas: só volumes');
  ok(/pico de 50 técnicos em espera às 12:00/.test(caps[1]) && !/oferecidas|NS/.test(caps[1]), 'técnicos em espera: só a fila');
  ok(/0,0% atendidos direto · 0 de 107 em até 1 min/.test(caps[2]), 'atendidos direto: só o % de até 1 min');
  ok(/NS 1,6% · 3 de 184 finalizadas/.test(caps[3]) && !/acumulado do dia/.test(caps[3]) && !/TME/.test(caps[3]), 'NS: só o NS do intervalo (sem o acumulado, a linha saiu)');
  ok(/41,8% de abandono · 77 de 184 finalizadas/.test(caps[4]), 'abandono: só o abandono');
  ok(/TME 17min 33s · TMA 18min 31s/.test(caps[5]) && !/NS|abandono/.test(caps[5]), 'TME: só os tempos');
  ok(/TMA 18min 31s · TME 17min 33s · 107 atendidas/.test(caps[6]) && !/NS|abandono/.test(caps[6]), 'TMA: só os tempos, TMA em destaque');
  // rótulos com % em cima e quantidade embaixo (atendidos direto e abandono)
  const dois = await p.$$eval('#pgEvo .chart', cs => [2, 4].map(i => [...cs[i].querySelectorAll('svg text')].filter(t => /font-weight:650/.test(t.getAttribute('style')) && +t.getAttribute('y') < 165).length));
  ok(dois[0] > 5 && dois[1] > 5, `quantidade embaixo do % em atendidos direto (${dois[0]}) e abandono (${dois[1]})`);
  // atendidos direto: altura das colunas = quantidade (não o %)
  const alt = await p.$$eval('#pgEvo .chart', cs => { const svg = cs[2].querySelector('svg');
    const barras = [...svg.querySelectorAll('path[style*="sCO"]:not(.ref):not(.ref-l)')].map(b => b.getBBox().height);
    const qt = [...svg.querySelectorAll('text')].filter(t => /font-weight:650/.test(t.getAttribute('style')) && +t.getAttribute('y') < 165).map(t => +t.textContent.replace(/\./g, ''));
    return { barras, qt }; });
  const qs = alt.qt.filter(q => q > 0);   // coluna com 0 não desenha barra
  const pares = qs.map((q, i) => [q, alt.barras[i]]);
  ok(qs.length === alt.barras.length, `uma barra para cada coluna com técnicos (${alt.barras.length})`);
  ok(pares.length > 5 && pares.every(([q, h], i) => pares.every(([q2, h2]) => (q > q2) === (h > h2 + 0.5) || q === q2 || Math.abs(h - h2) < 0.6)), 'atendidos direto: a coluna mais alta é a de mais técnicos (' + alt.qt.join(',') + ')');
  const al = await p.$eval('#pgEvo .chart .csel', e => getComputedStyle(e).textAlign);
  ok(al === 'center', 'texto centralizado');
  // centro do texto ≈ centro do cartão
  const cen = await p.$eval('#pgEvo .chart', c => { const r = c.getBoundingClientRect(), t = c.querySelector('.csel b').getBoundingClientRect(); return Math.abs((r.left + r.width / 2) - (t.left + t.width / 2)); });
  ok(cen < 6, `período centralizado no cartão (desvio ${cen.toFixed(1)} px)`);
  // Total URA: oferecidas mostra CO e TEL
  await abrir(p); await p.click('#pgEvo button[data-dir="TODOS"]');
  await p.locator('#pgEvo .chart').first().locator('rect.hit').nth(3).click();
  const c0 = await p.$eval('#pgEvo .chart .csel', e => e.innerText.replace(/\s+/g, ' '));
  ok(/· CO 187 · TEL \d+/.test(c0), 'Total URA: oferecidas com CO e TEL (' + c0.trim() + ')');
  ok(erros.length === 0, 'sem erros de JavaScript' + (erros.length ? ': ' + erros.join(' | ') : ''));
  await b.close();
})();

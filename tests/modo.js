// Modo Por intervalo × Acumulado na aba Evolução.
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
  await p.click('nav.tabs button[data-v="evo"]');
  ok(await p.locator('#pgEvo button[data-modo="int"]').getAttribute('class') === 'on', 'abre em "Por intervalo"');
  await p.click('#pgEvo button[data-passo="60"]');
  const rotX = () => p.$$eval('#pgEvo .chart svg', s => [...s[0].querySelectorAll('text')].filter(t => +t.getAttribute('y') > 160).map(t => t.textContent));
  const xInt = await rotX();
  await p.click('#pgEvo button[data-modo="acum"]');
  ok(await p.locator('#pgEvo button[data-modo="acum"]').getAttribute('class') === 'on', 'troca para "Acumulado"');
  const xAc = await rotX();
  ok(xInt[0] === '08h' && xAc[0] === '09h', `no acumulado a coluna leva o horário do fim (${xInt[0]} → ${xAc[0]})`);
  const tits = await p.$$eval('#pgEvo .chart h2', h => h.map(x => x.innerText));
  ok(tits.length === 7 && tits.filter(t => /acumulado|até o horário/.test(t)).length === 7, 'todos os 7 gráficos indicam o acumulado');
  // atendidos direto e abandono: no acumulado a altura é a QUANTIDADE, que só cresce
  const vol = await p.$$eval('#pgEvo .chart', cs => [2, 4].map(i => [...cs[i].querySelectorAll('svg text')].filter(t => /font-weight:650/.test(t.getAttribute('style')) && +t.getAttribute('y') < 165).map(t => +t.textContent.replace(/\./g, ''))));
  ok(vol.every(v => v.length > 5 && v.every((x, i) => i === 0 || x >= v[i - 1])), 'acumulado: atendidos direto e abandonadas crescem (' + vol.map(v => v.join(',')).join(' | ') + ')');
  ok(vol[1][vol[1].length - 1] === 205, 'abandonadas acumuladas terminam em 205 (total do dia)');
  // rótulos de oferecidas crescem coluna a coluna
  const labs = await p.$$eval('#pgEvo .chart svg', s => [...s[0].querySelectorAll('text')].filter(t => +t.getAttribute('y') < 160 && /^[\d.]+$/.test(t.textContent)).map(t => +t.textContent.replace(/\./g, '')));
  ok(labs.every((v, i) => i === 0 || v >= labs[i - 1]) && labs[labs.length - 1] === 1562, 'oferecidas acumuladas sobem até 1.562 (' + labs.join(', ') + ')');
  ok(await p.locator('#pgEvo .chart').nth(3).locator('path[style*="sAcum"]').count() === 0, 'NS: sem a linha extra (as colunas já são o acumulado)');
  // seleção da coluna "até 12h"
  await p.locator('#pgEvo .chart').first().locator('rect.hit').nth(3).click();
  const caps = await p.$$eval('#pgEvo .chart .csel', els => els.map(e => e.innerText.replace(/\s+/g, ' ').trim()));
  console.log(caps.map((c, i) => '   ' + i + ': ' + c).join('\n'));
  ok(caps.length === 7 && caps.every(c => c.startsWith('Acumulado até 12:00')), 'resumo: "Acumulado até 12:00" em todos');
  ok(/maior fila do dia até aqui: 50 técnicos às 12:00/.test(caps[1]), 'técnicos em espera: maior fila do dia até ali');
  ok(/oferecidas em até 5 min/.test(caps[3]) && !/finalizadas/.test(caps[3]), 'NS acumulado ÷ oferecidas');
  const thead = await p.$eval('#tIv thead', t => t.innerText);
  ok(/^Até/.test(thead.trim()), 'tabela: coluna "Até"');
  const k = await p.$eval('#pgEvo .kpis2', e => e.innerText);
  ok(/até 12:00/.test(k), 'cards mostram o acumulado até 12:00');
  // volta e recarrega: sempre começa em "Por intervalo"
  await p.reload(); await p.waitForFunction(() => window.__ura.estado().dados);
  await p.click('nav.tabs button[data-v="evo"]');
  ok(await p.locator('#pgEvo button[data-modo="int"]').getAttribute('class') === 'on', 'ao reabrir o app, volta para "Por intervalo"');
  const w = await p.evaluate(() => document.documentElement.scrollWidth);
  ok(w <= 390, `sem estouro lateral (${w}px)`);
  ok(erros.length === 0, 'sem erros de JavaScript' + (erros.length ? ': ' + erros.join(' | ') : ''));
  await b.close();
})();

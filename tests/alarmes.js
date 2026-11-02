// Painel de alarmes da aba Agora: acima do NS, críticos primeiro, detalhe ao tocar, silenciar 1 h, "desde" e último
// alarme guardados no aparelho, "Ver na Evolução" abre o gráfico já filtrado, estado "tudo normal".
const { chromium } = require('/home/claude/.npm-global/lib/node_modules/playwright');
const URL = process.env.URL || 'http://localhost:8765/ura/';
const ok = (c, m) => { if (!c) { console.log('FALHOU', m); process.exitCode = 1; } else console.log('ok  ', m); };
(async () => {
  const b = await chromium.launch(); const erros = [];
  const p = await b.newPage({ viewport: { width: 390, height: 844 } });
  p.on('pageerror', e => erros.push(e.message));
  await p.clock.install({ time: new Date('2026-10-30T19:17:30') });
  await p.goto(URL); await p.evaluate(() => localStorage.clear()); await p.reload();
  await p.waitForFunction(() => window.__ura.estado().hist && document.querySelector('#pgAgora .alarmes .al'));
  const ids = () => p.$$eval('#pgAgora .alarmes .al', r => r.map(x => x.dataset.alId));
  // posição: depois dos botões Total URA/CO/TEL e antes do NS
  const pos = await p.$eval('#pgAgora', pg => { const k = [...pg.children]; const i = c => k.findIndex(x => x.matches(c)); return [i('.agdir'), i('.alarmes'), k.findIndex(x => x.querySelector && x.querySelector('.hero'))]; });
  ok(pos[0] < pos[1] && pos[1] < pos[2], `cartão de alarmes entre os botões e o NS (${pos})`);
  ok(/verificado às 19:15/.test(await p.$eval('#pgAgora .al-cab', x => x.textContent)), 'cabeçalho: "verificado às 19:15"');
  // a fila depende do pulse.json servido (com ou sem técnicos esperando na última coleta)
  const nFila = await p.evaluate(() => { const d = window.__ura.estado().dados, L = d.leituras[d.leituras.length - 1]; return d.skills.filter(s => d.trad[s].DIRECIONAMENTO === 'CO').reduce((t, s) => t + ((L.v[s] || {}).Current_Calls || 0), 0); });
  const esperado = nFila ? 'ns,aband,vol,fila' : 'ns,aband,vol';
  const pills = await p.$$eval('#pgAgora .al-pill', x => x.map(y => y.textContent.trim()));
  ok(pills[0] === '2 críticos' && pills[1] === (nFila ? '2 em atenção' : '1 em atenção') && /normais$/.test(pills[2]), `resumo: ${pills.join(' · ')}`);
  ok((await ids()).join() === esperado, `críticos primeiro: ${(await ids()).join()}`);
  const tx = id => p.$eval(`#pgAgora .al[data-al-id="${id}"]`, x => x.innerText.replace(/\s+/g, ' '));
  ok(/61,2%/.test(await tx('ns')) && /med\. 7 sex: 68,0%/.test(await tx('ns')), 'NS do dia 61,2% com a mediana das 7 sextas');
  ok(/205 abandonadas no dia \(13,1%\)/.test(await tx('aband')) && /\+44%/.test(await tx('aband')), 'abandono: 205 (13,1%), +44%');
  ok(/39 oferecidas · previsto 29/.test(await tx('vol')) && /\+34%/.test(await tx('vol')), 'volume da hora: 39 × previsto 29 (+34%)');
  if (nFila) ok(/3 técnicos esperando/.test(await tx('fila')) && /4m30/.test(await tx('fila')), 'fila: 3 esperando, mais antiga 4m30');
  else ok(/Fila/.test(await p.$eval('#pgAgora .al-okg', x => x.textContent)), 'fila vazia: "Fila" entre as verificações normais');
  ok(/desde 19:15/.test(await tx('ns')), '"desde 19:15" (primeira vez visto neste aparelho)');
  // os botões da Agora não mudam os alarmes (sempre Total URA)
  await p.click('#pgAgora button[data-agdir="CO"]'); await p.waitForTimeout(100);
  ok((await ids()).join() === esperado, 'com "CO" escolhido os alarmes continuam os mesmos');
  await p.click('#pgAgora button[data-agdir="TODOS"]');
  // detalhe ao tocar (a linha tocada não sai do lugar)
  await p.evaluate(() => scrollBy(0, document.querySelector('#pgAgora .al[data-al-id="aband"]').getBoundingClientRect().top - 300)); await p.waitForTimeout(80);
  const y0 = await p.$eval('#pgAgora .al[data-al-id="aband"]', x => x.getBoundingClientRect().top);
  await p.click('#pgAgora .al-top[data-al="aband"]'); await p.waitForTimeout(100);
  const y1 = await p.$eval('#pgAgora .al[data-al-id="aband"]', x => x.getBoundingClientRect().top);
  const mais = await p.$eval('#pgAgora .al[data-al-id="aband"] .al-mais', x => x.innerText);
  ok(/Regra:/.test(mais) && /Onde mais pesa: SUPORTE/.test(mais) && /Ver na Evolução/.test(mais) && /Silenciar 1 h/.test(mais), 'tocar abre a regra, onde mais pesa e os botões');
  ok(Math.abs(y1 - y0) <= 1, `a linha tocada fica parada (${Math.round(y0)} → ${Math.round(y1)})`);
  await p.click('#pgAgora .al-top[data-al="aband"]'); await p.waitForTimeout(80);
  ok(await p.locator('#pgAgora .al-mais').count() === 0, 'tocar de novo fecha');
  // silenciar 1 h
  await p.click('#pgAgora .al-top[data-al="aband"]'); await p.click('#pgAgora [data-alsil="aband"]'); await p.waitForTimeout(100);
  ok(!(await ids()).includes('aband') && /Silenciado até 20:17: Abandono acima do normal/.test(await p.$eval('#pgAgora .al-silx', x => x.textContent)), 'silenciado: some da lista, linha "Silenciado até 20:17"');
  ok((await p.$$eval('#pgAgora .al-pill', x => x.map(y => y.textContent.trim())))[0] === '1 crítico', 'resumo: 1 crítico');
  await p.reload(); await p.waitForFunction(() => document.querySelector('#pgAgora .alarmes .al'));
  ok(!(await ids()).includes('aband'), 'continua silenciado depois de reabrir o app');
  await p.clock.runFor(61 * 60000); await p.click('#pgAgora button[data-agdir="TODOS"]'); await p.waitForTimeout(100);
  ok((await ids()).includes('aband'), 'depois de 1 h volta sozinho');
  await p.click('#pgAgora .al-top[data-al="vol"]'); await p.click('#pgAgora [data-alsil="vol"]'); await p.waitForTimeout(80);
  await p.click('#pgAgora [data-alreat]'); await p.waitForTimeout(80);
  ok((await ids()).includes('vol') && await p.locator('#pgAgora .al-silx').count() === 0, '"reativar" traz de volta');
  await b.close().catch(() => {});

  // "desde" guardado e "Ver na Evolução"
  const b2 = await chromium.launch(); const q = await b2.newPage({ viewport: { width: 390, height: 844 } });
  q.on('pageerror', e => erros.push(e.message));
  await q.clock.install({ time: new Date('2026-10-30T19:17:30') });
  await q.goto(URL);
  await q.evaluate(() => { localStorage.clear(); localStorage.setItem('ura-b2c:alarmes', JSON.stringify({ dia: '2026-10-30', desde: { ns: '10:30', coleta: '18:00' }, tit: { ns: 'NS do dia abaixo de 70%', coleta: 'Coleta atrasada' }, ult: null, sil: {} })); });
  await q.reload(); await q.waitForFunction(() => window.__ura.estado().hist && document.querySelector('#pgAgora .alarmes .al'));
  ok(/desde 10:30/.test(await q.$eval('#pgAgora .al[data-al-id="ns"]', x => x.textContent)), '"desde 10:30" guardado no aparelho');
  ok(JSON.parse(await q.evaluate(() => localStorage.getItem('ura-b2c:alarmes'))).ult.titulo === 'Coleta atrasada', 'o alarme que sumiu vira "último alarme"');
  await q.click('#pgAgora .al-top[data-al="aband"]'); await q.click('#pgAgora [data-alver="aband"]'); await q.waitForTimeout(200);
  const st = await q.evaluate(() => { const e = window.__ura.estado().evo; return { pg: window.__ura.estado().pagina, dir: e.dir, grupo: e.grupo }; });
  const top = await q.$eval('#pgEvo .chart[data-ch="evo-ab"]', c => c.getBoundingClientRect().top);
  ok(st.pg === 'evo' && st.dir === 'CO' && !st.grupo && top > 0 && top < 400, `"Ver na Evolução": Evolução no CO com o gráfico de abandono na tela (${Math.round(top)} px)`);
  // estado "tudo normal" (limites bem largos só para o teste)
  await q.click('nav.tabs button[data-v="agora"]');
  await q.evaluate(() => { const L = window.Alarmes.LIM; L.ns.aten = L.ns.crit = 0; L.nsHora.aten = L.nsHora.crit = 0; Object.assign(L.aband, { aten: 1e9, crit: 1e9, pctCrit: 100 }); Object.assign(L.vol, { atenMais: 1e9, critMais: 1e9 }); Object.assign(L.espera, { aten: 1e9, crit: 1e9, filaCrit: 1e9 }); });
  await q.click('#pgAgora button[data-agdir="TODOS"]'); await q.waitForTimeout(100);
  const tudo = await q.$eval('#pgAgora .alarmes', x => x.innerText.replace(/\s+/g, ' '));
  ok(/Tudo dentro do normal/.test(tudo) && await q.locator('#pgAgora .alarmes .al').count() === 0, 'tudo normal: "Tudo dentro do normal", sem linhas de alarme');
  ok(/último alarme: NS do dia abaixo de 70% \(e mais [23]\), encerrados às 19:15/.test(tudo), 'rodapé: "último alarme: NS do dia abaixo de 70% (e mais …), encerrados às 19:15"');
  await q.click('#pgAgora .alarmes button.info'); 
  ok(await q.$eval('#inf-alarmes', x => !x.hidden && /Abandono:/.test(x.textContent) && /Coleta:/.test(x.textContent)), '(i) explica as regras');
  // 360 px escuro
  const r = await b2.newPage({ viewport: { width: 360, height: 800 }, colorScheme: 'dark' });
  r.on('pageerror', e => erros.push(e.message));
  await r.clock.install({ time: new Date('2026-10-30T19:17:30') });
  await r.goto(URL); await r.evaluate(() => localStorage.clear()); await r.reload(); await r.waitForFunction(() => document.querySelector('#pgAgora .alarmes .al'));
  await r.click('#pgAgora .al-top[data-al="ns"]');
  ok(await r.evaluate(() => document.documentElement.scrollWidth) <= 360 && await r.$$eval('#pgAgora .al', a => a.every(x => x.scrollWidth <= x.clientWidth + 1)), '360 px escuro: sem estouro');
  ok(!erros.length, 'sem erros no console' + (erros.length ? ': ' + erros.join(' | ') : ''));
  await b2.close();
})();

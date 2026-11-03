// Resumo dos alarmes do dia na Evolução (o último item da tela): acompanha a data escolhida (fechamento do dia; no dia do Pulse, até a última
// coleta), uma linha por tipo na ordem da configuração (fixa ao trocar de dia), ícone em cada linha, cápsulas de filtro
// (críticos, atenção, normais; dá para combinar pelo "+"; tocar de novo tira; o X limpa) e configuração própria (coluna "Evolução").
const { chromium } = require('/home/claude/.npm-global/lib/node_modules/playwright');
const A = require('../alarmes.js');
const URL = process.env.URL || 'http://localhost:8765/ura/';
const ok = (c, m) => { if (!c) { console.log('FALHOU', m); process.exitCode = 1; } else console.log('ok  ', m); };
(async () => {
  const b = await chromium.launch(); const erros = [];
  const p = await b.newPage({ viewport: { width: 390, height: 844 } });
  p.on('pageerror', e => erros.push(e.message));
  await p.clock.install({ time: new Date('2026-10-30T19:17:30') });
  await p.goto(URL); await p.evaluate(() => localStorage.clear()); await p.reload();
  await p.waitForFunction(() => window.__ura.estado().hist && document.querySelector('#pgAlarmes .alarmes'));
  await p.click('nav.tabs button[data-v="evo"]'); await p.waitForTimeout(200);
  const R = '#pgEvo .alresumo';
  const linhas = () => p.$$eval(`${R} li[data-alr]`, l => l.map(x => ({ t: x.dataset.alr, n: x.className.replace('alr-', ''), nome: x.querySelector('.al-okn').textContent, v: x.querySelector('.al-okv').textContent, ref: (x.querySelector('.al-okr') || {}).textContent || '', ic: !!x.querySelector('.alr-ic svg') })));
  const pills = () => p.$$eval(`${R} .al-fil button`, bs => bs.map(x => x.textContent.trim()));
  // posição: depois da chave Previsto, antes do primeiro gráfico
  const pos = await p.$eval('#pgEvo', pg => { const k = [...pg.children]; return { r: k.indexOf(pg.querySelector('.alresumo')), n: k.length, tab: k.indexOf(pg.querySelector('#tIv').closest('.card')) }; });
  ok(pos.r === pos.n - 1 && pos.r > pos.tab, `resumo é o último item da Evolução, depois da tabela (${pos.r + 1} de ${pos.n})`);
  const ordem = A.TIPOS.map(t => t.id).join();
  let l = await linhas();
  ok(l.map(x => x.t).join() === ordem && l.every(x => x.ic), 'uma linha por tipo, na ordem da configuração, cada uma com o seu ícone');
  ok(/dia até 19:15 · med\. 7 sex/.test(await p.$eval(`${R} .al-cab`, x => x.textContent)), '30/10 (dia do Pulse): "dia até 19:15"');
  ok((await pills()).join('|') === '2 críticos|0 atenção|10 normais' && (await linhas()).length === 12, `três cápsulas, sem filtro (lista inteira): ${(await pills()).join(' · ')}`);
  const ns = l.find(x => x.t === 'ns'), ab = l.find(x => x.t === 'aband');
  ok(ns.n === 'crit' && ns.v === '61,2%' && /abaixo de 70% no dia/.test(ns.ref) && ab.n === 'crit' && ab.v === '205', 'NS 61,2% e Abandonadas 205: críticos (iguais à visão Hoje)');
  // o resumo é o mesmo da visão Hoje da página Alarmes
  const hoje = await p.evaluate(() => { document.querySelector('nav.tabs button[data-v="alarmes"]').click(); document.querySelector('#pgAlarmes [data-alvista="dia"]').click(); return [...document.querySelectorAll('#pgAlarmes .al')].map(x => x.dataset.alId).join(); });
  ok(hoje === l.filter(x => x.n === 'crit' || x.n === 'aten').map(x => x.t).join(), `mesmos alarmes da visão Hoje (${hoje})`);
  await p.click('nav.tabs button[data-v="evo"]'); await p.waitForTimeout(150);
  // trocar de dia: a lista fica no mesmo lugar e na mesma ordem
  // com o resumo na tela (ele é o último item), trocar de dia não tira a lista do lugar na tela
  await p.evaluate(r => { scrollBy(0, document.querySelector(r).getBoundingClientRect().top - 300); }, R); await p.waitForTimeout(100);
  const y0 = await p.$eval(`${R} li[data-alr="ns"]`, x => x.getBoundingClientRect().top);
  await p.click('#pgEvo [data-navdia="-1"]'); await p.waitForTimeout(250);
  l = await linhas();
  const y1 = await p.$eval(`${R} li[data-alr="ns"]`, x => x.getBoundingClientRect().top);
  ok(l.map(x => x.t).join() === ordem && Math.abs(y1 - y0) <= 1, `29/10: mesma ordem e a lista parada na tela (${Math.round(y0)} → ${Math.round(y1)} px)`);
  ok(/fechamento do dia · med\. 7 qui/.test(await p.$eval(`${R} .al-cab`, x => x.textContent)), '29/10: "fechamento do dia · med. 7 qui"');
  const ns29 = l.find(x => x.t === 'ns');
  ok(ns29.n === 'aten' && ns29.v === '70,7%', `29/10: NS ${ns29.v} em atenção`);
  ok(['agentes', 'parada', 'coleta'].every(t => { const x = l.find(y => y.t === t); return x.n === 'na' && /só vale no dia de hoje/.test(x.ref) && x.v === '—'; }), 'dia passado: em espera sem agente, skills sem chamadas e coleta "só valem no dia de hoje"');
  // filtros
  await p.click(`${R} [data-alk="aten"]`); await p.waitForTimeout(120);
  l = await linhas();
  ok(l.length === 1 && l[0].t === 'ns' && await p.$eval(`${R} [data-alk="aten"]`, x => x.classList.contains('on')), 'filtro "atenção": só o NS');
  const x1 = await p.$eval(`${R} .al-fil`, f => { const bs = [...f.children], x = f.querySelector('.al-x'); return { ultimo: bs[bs.length - 1] === x, linha: bs.every(b => Math.abs(b.getBoundingClientRect().top - bs[0].getBoundingClientRect().top) < 2) }; });
  ok(x1.ultimo && x1.linha, 'com filtro: cápsula com X à direita, tudo numa linha');
  const mais = await p.$$eval(`${R} .al-fil [data-alk]`, bs => bs.map(b => b.dataset.alk + ':' + (b.querySelector('.al-mais-ic') ? '+' : '')).join());
  ok(mais === 'crit:+,aten:,ok:+', `com uma marcada, as outras ganham o "+" no canto (${mais})`);
  await p.click(`${R} [data-alk="aten"]`); await p.waitForTimeout(120);
  ok((await linhas()).length === 12 && await p.locator(`${R} .al-x`).count() === 0, 'tocar de novo no filtro marcado desmarca (lista inteira, sem o X)');
  await p.click(`${R} [data-alk="aten"]`); await p.click(`${R} .al-x`); await p.waitForTimeout(120);
  ok((await linhas()).length === 12 && await p.locator(`${R} .al-x`).count() === 0, 'o X limpa o filtro');
  await p.click(`${R} [data-alk="crit"]`); await p.waitForTimeout(120);
  ok((await linhas()).length === 0 && /Nenhum alarme crítico neste dia/.test(await p.$eval(R, x => x.textContent)), 'filtro "críticos" num dia sem críticos: "Nenhum alarme crítico neste dia."');
  await p.click('#pgEvo [data-navdia="1"]'); await p.waitForTimeout(250);
  l = await linhas();
  ok(l.map(x => x.t).join() === 'ns,aband' && l.every(x => x.n === 'crit'), 'o filtro continua ao trocar de dia: 30/10 mostra os 2 críticos');
  // combinações: críticos + normais
  await p.click(`${R} [data-alk="ok"]`); await p.waitForTimeout(120);
  l = await linhas();
  ok(l.length === 12 && l.filter(x => x.n === 'crit').length === 2 && l.filter(x => x.n === 'ok').length === 10 && l.map(x => x.t).join() === ordem, 'tocar no "+" de normais soma: críticos + normais (na ordem da configuração)');
  ok(await p.$$eval(`${R} .al-fil .on`, bs => bs.map(b => b.dataset.alk).join()) === 'crit,ok' && await p.locator(`${R} .al-mais-ic`).count() === 1, 'duas marcadas; só a de atenção fica com o "+"');
  await p.click(`${R} [data-alk="crit"]`); await p.waitForTimeout(120);
  ok((await linhas()).every(x => x.n === 'ok') && (await linhas()).length === 10, 'tocar numa marcada tira só ela: ficam as 10 normais');
  await p.click(`${R} .al-x`); await p.waitForTimeout(120);
  ok((await linhas()).length === 12, 'X: volta a lista inteira');
  // configuração própria (coluna Evolução)
  await p.click(`${R} .al-cfg`); await p.waitForTimeout(250);
  ok(await p.$eval('#sheet', s => [...s.querySelectorAll('th')].map(x => x.textContent).join('|')) === 'Alarme|Agora|Hoje|Evolução', 'configuração com a coluna "Evolução"');
  await p.click('#sheet input[data-cfg="evo"][data-tipo="coleta"]'); await p.click('#sheet input[data-cfg="evo"][data-tipo="tma"]'); await p.waitForTimeout(100);
  await p.click('#sheet [data-act="fechar"]'); await p.waitForTimeout(250);
  l = await linhas();
  ok(l.length === 10 && !l.some(x => x.t === 'coleta' || x.t === 'tma') && /2 desligados · configurar/.test(await p.$eval(R, x => x.textContent)), 'TMA e Coleta desligados na Evolução: 10 linhas, "2 desligados · configurar"');
  await p.click('nav.tabs button[data-v="alarmes"]'); await p.click('#pgAlarmes [data-alvista="dia"]'); await p.waitForTimeout(100);
  ok(await p.$eval('#pgAlarmes .al-qt', x => x.textContent) === '2/12', 'a página Alarmes não muda (Hoje continua 2/12)');
  await p.click('nav.tabs button[data-v="evo"]'); await p.waitForTimeout(150);
  await p.reload(); await p.waitForFunction(() => window.__ura.estado().hist); await p.click('nav.tabs button[data-v="evo"]'); await p.waitForTimeout(200);
  ok((await linhas()).length === 10, 'a configuração da Evolução fica guardada');
  // vista por dia: o resumo continua
  await p.click('#pgEvo .dn-vis'); await p.waitForTimeout(200);
  ok(await p.locator(R).count() === 1 && (await linhas()).length === 10, 'eixo por dia: o resumo continua');
  // 360 px escuro
  const q = await b.newPage({ viewport: { width: 360, height: 800 }, colorScheme: 'dark' });
  q.on('pageerror', e => erros.push(e.message));
  await q.clock.install({ time: new Date('2026-10-30T19:17:30') });
  await q.goto(URL); await q.waitForFunction(() => window.__ura.estado().hist); await q.click('nav.tabs button[data-v="evo"]'); await q.waitForTimeout(200);
  ok(await q.evaluate(() => document.documentElement.scrollWidth) <= 360 && await q.$$eval('#pgEvo .alresumo li', a => a.every(x => x.scrollWidth <= x.clientWidth + 1)), '360 px escuro: sem estouro');
  await q.click('#pgEvo .alresumo [data-alk="ok"]'); await q.waitForTimeout(120);
  const umaLinha = await q.$eval('#pgEvo .alresumo .al-fil', f => { const bs = [...f.children]; return bs.length === 4 && bs.every(b => Math.abs(b.getBoundingClientRect().top - bs[0].getBoundingClientRect().top) < 2) && f.scrollWidth <= f.clientWidth + 1; });
  ok(umaLinha, '360 px: as três cápsulas e o X numa linha só, sem estouro');
  ok(!erros.length, 'sem erros no console' + (erros.length ? ': ' + erros.join(' | ') : ''));
  await b.close();
})();

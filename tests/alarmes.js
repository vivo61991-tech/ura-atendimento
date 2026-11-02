// Página Alarmes (a primeira aba): bolinha com a quantidade no ícone, chave Agora/Hoje (sempre abre em Agora), resumo
// da outra visão, detalhe ao tocar, silenciar 1 h por visão, "desde"/último guardados no aparelho, engrenagem com a
// configuração por visão (e "Todos"), "Ver na Evolução", estado "tudo normal".
const { chromium } = require('/home/claude/.npm-global/lib/node_modules/playwright');
const URL = process.env.URL || 'http://localhost:8765/ura/';
const ok = (c, m) => { if (!c) { console.log('FALHOU', m); process.exitCode = 1; } else console.log('ok  ', m); };
(async () => {
  const b = await chromium.launch(); const erros = [];
  const nova = async (vp, esq) => {
    const p = await b.newPage({ viewport: vp || { width: 390, height: 844 }, colorScheme: esq || 'light' });
    p.on('pageerror', e => erros.push(e.message));
    await p.clock.install({ time: new Date('2026-10-30T19:17:30') });
    await p.goto(URL); await p.evaluate(() => localStorage.clear()); await p.reload();
    await p.waitForFunction(() => window.__ura.estado().hist && document.querySelector('#pgAlarmes .alarmes'));
    return p;
  };
  const p = await nova();
  // (depois de adiantar o relógio 1 h a coleta fica atrasada: esse alarme é conferido à parte)
  const ids = () => p.$$eval('#pgAlarmes .al', r => r.map(x => x.dataset.alId).filter(x => x !== 'coleta'));
  const vista = () => p.evaluate(() => window.__ura.estado().al.vista);
  const reabrir = async () => { await p.reload(); await p.waitForFunction(() => document.querySelector('#pgAlarmes .alarmes')); };
  // a fila depende do pulse.json servido (com ou sem técnicos esperando na última coleta)
  const nFila = await p.evaluate(() => { const d = window.__ura.estado().dados, L = d.leituras[d.leituras.length - 1]; return d.skills.filter(s => d.trad[s].DIRECIONAMENTO === 'CO').reduce((t, s) => t + ((L.v[s] || {}).Current_Calls || 0), 0); });

  // abre na página Alarmes, a primeira aba, com a bolinha
  const abas = await p.$$eval('nav.tabs button', bs => bs.map(x => x.dataset.v));
  ok(abas.join() === 'alarmes,agora,evo,skills' && await p.evaluate(() => window.__ura.estado().pagina) === 'alarmes', `abre em Alarmes, a primeira aba (${abas.join(', ')})`);
  ok(await p.locator('#pgAgora .alarmes').count() === 0, 'a aba Agora não tem mais o cartão de alarmes');
  ok(await vista() === 'agora' && await p.$eval('#pgAlarmes [data-alvista="agora"]', x => x.classList.contains('on')), 'começa na visão Agora');
  const agoraIds = await ids();
  // maior fila na hora (19:05–19:15): o original tem 1 técnico às 19:10, num horário em que quase nunca há fila
  const picoHora = await p.evaluate(() => { const d = window.__ura.estado().dados; return Math.max(0, ...d.leituras.filter(l => l.m > 1140).map(l => d.skills.filter(s => d.trad[s].DIRECIONAMENTO === 'CO').reduce((t, s) => t + ((l.v[s] || {}).Current_Calls || 0), 0))); });
  ok(agoraIds.join() === 'vol,fila' && picoHora > 0, `Agora (hora 19:00–19:15): ${agoraIds.join(', ')} (maior fila na hora: ${picoHora})`);
  if (!nFila) ok(/Fila fora do comum para o horário/.test(await p.$eval('#pgAlarmes .al[data-al-id="fila"]', x => x.textContent)) && /ninguém esperando agora · maior fila 19:00–19:15: 1/.test(await p.$eval('#pgAlarmes .al[data-al-id="fila"]', x => x.textContent)), 'fila vazia agora, mas 1 técnico às 19:10: "Fila fora do comum para o horário"');
  ok(/hora aberta 19:00–19:15/.test(await p.$eval('#pgAlarmes .al-cab', x => x.textContent)), 'cabeçalho: "hora aberta 19:00–19:15"');
  const bol = await p.$eval('#alBadge', x => ({ t: x.textContent, h: x.hidden, aten: x.classList.contains('aten'), dentro: (() => { const i = x.closest('.ico').getBoundingClientRect(), r = x.getBoundingClientRect(); return r.left > i.left && r.top < i.top; })() }));
  ok(!bol.h && +bol.t === agoraIds.length && bol.aten && bol.dentro, `bolinha no canto superior direito do ícone: ${bol.t} (laranja: só em atenção)`);
  if (nFila) ok(/normal neste horário: 0 \(fila em 1 de 7 dias\)/.test(await p.$eval('#pgAlarmes .al[data-al-id="fila"]', x => x.textContent)), 'fila: "normal neste horário: 0 (fila em 1 de 7 dias)"');
  ok(/Hoje: 2 críticos/.test(await p.$eval('#pgAlarmes .al-outra', x => x.textContent)), 'resumo da outra visão: "Hoje: 2 críticos"');
  // Hoje
  await p.click('#pgAlarmes .al-outra'); await p.waitForTimeout(100);
  ok(await vista() === 'dia' && (await ids()).join() === 'ns,aband', `tocar no resumo troca para Hoje: ${(await ids()).join(', ')}`);
  const tx = id => p.$eval(`#pgAlarmes .al[data-al-id="${id}"]`, x => x.innerText.replace(/\s+/g, ' '));
  ok(/61,2%/.test(await tx('ns')) && /205 abandonadas no dia \(13,1%\)/.test(await tx('aband')) && /\+44%/.test(await tx('aband')), 'Hoje: NS 61,2% e abandono 205 (13,1%), +44%');
  ok(/dia até 19:15/.test(await p.$eval('#pgAlarmes .al-cab', x => x.textContent)), 'cabeçalho: "dia até 19:15"');
  ok(await p.$eval('#alBadge', x => x.textContent === '2' && !x.classList.contains('aten')), 'bolinha acompanha a visão: 2, rosa (tem crítico)');
  await reabrir();
  ok(await vista() === 'agora', 'reabrir o app: volta para Agora');
  await p.click('#pgAlarmes [data-alvista="dia"]'); await p.waitForTimeout(80);
  // detalhe (a linha tocada fica parada)
  await p.evaluate(() => scrollBy(0, document.querySelector('#pgAlarmes .al[data-al-id="aband"]').getBoundingClientRect().top - 300)); await p.waitForTimeout(80);
  const y0 = await p.$eval('#pgAlarmes .al[data-al-id="aband"]', x => x.getBoundingClientRect().top);
  await p.click('#pgAlarmes .al-top[data-al="aband"]'); await p.waitForTimeout(100);
  const mais = await p.$eval('#pgAlarmes .al[data-al-id="aband"] .al-mais', x => x.innerText);
  ok(/Regra:/.test(mais) && /Onde mais pesa: SUPORTE/.test(mais) && /Ver na Evolução/.test(mais) && /Silenciar 1 h/.test(mais), 'tocar abre a regra, onde mais pesa e os botões');
  ok(Math.abs(await p.$eval('#pgAlarmes .al[data-al-id="aband"]', x => x.getBoundingClientRect().top) - y0) <= 1, 'a linha tocada fica parada');
  // silenciar (só nesta visão)
  await p.click('#pgAlarmes [data-alsil="aband"]'); await p.waitForTimeout(100);
  ok(!(await ids()).includes('aband') && /Silenciado até 20:17: Abandono do dia acima do normal/.test(await p.$eval('#pgAlarmes .al-silx', x => x.textContent)), 'silenciado: some da lista, "Silenciado até 20:17"');
  await reabrir(); await p.click('#pgAlarmes [data-alvista="dia"]'); await p.waitForTimeout(80);
  ok(!(await ids()).includes('aband'), 'continua silenciado depois de reabrir o app');
  await p.clock.runFor(61 * 60000); await p.click('#pgAlarmes [data-alvista="dia"]'); await p.waitForTimeout(100);
  ok((await ids()).includes('aband'), 'depois de 1 h volta sozinho');
  ok(/Coleta atrasada/.test(await p.$eval('#pgAlarmes .al[data-al-id="coleta"]', x => x.textContent)) && /há 63 min/.test(await p.$eval('#pgAlarmes .al[data-al-id="coleta"]', x => x.textContent)), '1 h sem coleta nova: "Coleta atrasada" (há 63 min)');
  await p.click('#pgAlarmes .al-top[data-al="ns"]'); await p.click('#pgAlarmes [data-alsil="ns"]'); await p.waitForTimeout(80);
  await p.click('#pgAlarmes [data-alvista="agora"]'); await p.waitForTimeout(80);
  ok(await p.locator('#pgAlarmes .al-silx').count() === 0, 'o silêncio do Hoje não vale no Agora');
  await p.click('#pgAlarmes [data-alvista="dia"]'); await p.click('#pgAlarmes [data-alreat]'); await p.waitForTimeout(80);
  ok((await ids()).includes('ns') && await p.locator('#pgAlarmes .al-silx').count() === 0, '"reativar" traz de volta');

  // configuração (engrenagem no canto do cartão)
  const eng = await p.$eval('#pgAlarmes .al-cfg', x => { const c = x.closest('.card').getBoundingClientRect(), r = x.getBoundingClientRect(); return c.right - r.right < 14 && r.top - c.top < 14; });
  ok(eng, 'engrenagem no canto superior direito do cartão');
  await p.click('#pgAlarmes .al-cfg'); await p.waitForTimeout(250);
  const cfg = await p.$eval('#sheet', s => ({ show: s.classList.contains('show'), cab: [...s.querySelectorAll('th')].map(x => x.textContent).join('|'), n: s.querySelectorAll('tbody tr').length, todos: s.querySelector('tr.alc-todos td').textContent }));
  ok(cfg.show && cfg.cab === 'Alarme|Agora|Hoje' && cfg.n === 13 && cfg.todos === 'Todos', `configuração: colunas ${cfg.cab}, "Todos" + 12 alarmes`);
  await p.click('#sheet input[data-cfg="dia"][data-tipo="ns"]'); await p.waitForTimeout(100);
  ok(await p.$eval('#sheet input[data-cfgtodos="dia"]', x => !x.checked && x.indeterminate) && await p.$eval('#sheet input[data-cfgtodos="agora"]', x => x.checked), '"Todos" do Hoje fica parcial; o do Agora continua marcado');
  await p.click('#sheet [data-act="fechar"]'); await p.waitForTimeout(250);
  ok((await ids()).join() === 'aband' && /1 alarme desligado nesta visão/.test(await p.$eval('#pgAlarmes .al-desl', x => x.textContent)), 'NS desligado no Hoje: some, com o aviso "1 alarme desligado nesta visão"');
  ok(!(await p.$$eval('#pgAlarmes .al-ch span', x => x.map(y => y.textContent))).includes('NS'), 'e não aparece entre as normais');
  await p.click('#pgAlarmes [data-alvista="agora"]'); await p.waitForTimeout(80);
  ok(await p.locator('#pgAlarmes .al-desl').count() === 0 && (await p.$$eval('#pgAlarmes .al-ch span', x => x.map(y => y.textContent))).includes('NS'), 'no Agora o NS continua ligado');
  await reabrir(); await p.click('#pgAlarmes [data-alvista="dia"]'); await p.waitForTimeout(80);
  ok((await ids()).join() === 'aband', 'a configuração fica guardada no aparelho');
  // "Todos" do Agora: desliga e liga tudo
  await p.click('#pgAlarmes [data-alvista="agora"]'); await p.click('#pgAlarmes .al-cfg'); await p.waitForTimeout(250);
  await p.click('#sheet input[data-cfgtodos="agora"]'); await p.waitForTimeout(100);
  ok(await p.$$eval('#sheet input[data-cfg="agora"]', xs => xs.every(x => !x.checked)) && await p.$$eval('#sheet input[data-cfg="dia"]', xs => xs.filter(x => x.checked).length) === 11, '"Todos" desmarca a coluna inteira do Agora (o Hoje não muda)');
  ok(await p.$eval('#alBadge', x => x.hidden) && await p.locator('#pgAlarmes .al').count() === 0 && /Tudo dentro do normal/.test(await p.$eval('#pgAlarmes .alarmes', x => x.textContent)), 'tudo desligado no Agora: nenhum alarme e a bolinha some');
  await p.click('#sheet input[data-cfgtodos="agora"]'); await p.waitForTimeout(100);
  ok(await p.$$eval('#sheet input[data-cfg="agora"]', xs => xs.every(x => x.checked)), '"Todos" de novo: liga a coluna inteira');
  await p.click('#sheet [data-act="fechar"]'); await p.waitForTimeout(250);
  ok((await ids()).join() === agoraIds.join(), 'os alarmes do Agora voltam');
  await p.close();

  // "desde" guardado, último alarme, "Ver na Evolução" e o estado "tudo normal"
  const q = await nova();
  await q.evaluate(() => { localStorage.setItem('ura-b2c:alarmes:dia', JSON.stringify({ dia: '2026-10-30', desde: { ns: '10:30', coleta: '18:00' }, tit: { ns: 'NS do dia abaixo de 70%', coleta: 'Coleta atrasada' }, ult: null, sil: {} })); });
  await q.reload(); await q.waitForFunction(() => document.querySelector('#pgAlarmes .al'));
  await q.click('#pgAlarmes [data-alvista="dia"]'); await q.waitForTimeout(80);
  ok(/desde 10:30/.test(await q.$eval('#pgAlarmes .al[data-al-id="ns"]', x => x.textContent)), '"desde 10:30" guardado no aparelho');
  ok(JSON.parse(await q.evaluate(() => localStorage.getItem('ura-b2c:alarmes:dia'))).ult.titulo === 'Coleta atrasada', 'o alarme que sumiu vira "último alarme"');
  await q.click('#pgAlarmes .al-top[data-al="aband"]'); await q.click('#pgAlarmes [data-alver="aband"]'); await q.waitForTimeout(200);
  const st = await q.evaluate(() => { const e = window.__ura.estado(); return { pg: e.pagina, dir: e.evo.dir, grupo: e.evo.grupo }; });
  const top = await q.$eval('#pgEvo .chart[data-ch="evo-ab"]', c => c.getBoundingClientRect().top);
  ok(st.pg === 'evo' && st.dir === 'CO' && !st.grupo && top > 0 && top < 400, `"Ver na Evolução": Evolução no CO com o gráfico de abandono na tela (${Math.round(top)} px)`);
  await q.click('nav.tabs button[data-v="alarmes"]'); await q.click('#pgAlarmes [data-alvista="dia"]');
  await q.evaluate(() => { const L = window.Alarmes.LIM.dia; L.ns.aten = L.ns.crit = 0; Object.assign(L.aband, { aten: 1e9, crit: 1e9, pctCrit: 100 }); });
  await q.click('#pgAlarmes [data-alvista="dia"]'); await q.waitForTimeout(100);
  const tudo = await q.$eval('#pgAlarmes .alarmes', x => x.innerText.replace(/\s+/g, ' '));
  ok(/Tudo dentro do normal/.test(tudo) && await q.locator('#pgAlarmes .al').count() === 0, 'tudo normal: "Tudo dentro do normal"');
  ok(/último alarme: NS do dia abaixo de 70% \(e mais 1\), encerrados às 19:15/.test(tudo), 'rodapé: "último alarme: NS do dia abaixo de 70% (e mais 1), encerrados às 19:15"');
  await q.click('#pgAlarmes .alarmes button.info');
  ok(await q.$eval('#inf-alarmes', x => !x.hidden && /Abandono:/.test(x.textContent) && /Coleta:/.test(x.textContent)), '(i) explica as regras');
  await q.close();

  // 360 px escuro
  const r = await nova({ width: 360, height: 800 }, 'dark');
  await r.click('#pgAlarmes .al-top');
  ok(await r.evaluate(() => document.documentElement.scrollWidth) <= 360 && await r.$$eval('#pgAlarmes .al', a => a.every(x => x.scrollWidth <= x.clientWidth + 1)), '360 px escuro: sem estouro');
  await r.click('#pgAlarmes .al-cfg'); await r.waitForTimeout(250);
  ok(await r.$eval('#sheet .alc-t', t => t.scrollWidth <= t.parentElement.clientWidth + 1), '360 px: a configuração cabe');
  ok(!erros.length, 'sem erros no console' + (erros.length ? ': ' + erros.join(' | ') : ''));
  await b.close();
})();

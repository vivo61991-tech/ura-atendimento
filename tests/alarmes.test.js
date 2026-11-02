// Regras do painel de alarmes (node tests/alarmes.test.js): só as contas, sem tela.
const assert = require('assert');
const A = require('../alarmes.js');
let ok = 0;
const t = (nome, fn) => { try { fn(); ok++; console.log('ok  ', nome); } catch (e) { console.log('FALHOU', nome, '\n  ', e.message); process.exitCode = 1; } };
const base = () => ({ horario: '19:15', cmpNome: '7 sex', vivo: true, atrasoMin: 2,
  dia: { ofer: 1000, ns: 95, nsPrev: 94, aband: 30, abandPrev: 30, abandPct: 3, tme: 40, tmePrev: 40, tma: 600, tmaPrev: 600, dir60: 80, dir60Prev: 80, telPct: 30, telPctPrev: 30 },
  hora: { ini: 1140, ate: 1155, fecha: false, ofer: 30, oferPrev: 30, oferPrevHora: 70, ns: 95, fin: 30, a300: 29 },
  fila: { total: 0, espMax: 0, skillMax: '', semAgente: [] },
  grupos: [{ g: 'SUPORTE TV', dir: 'CO', v: 10, prev: 10 }], paradas: [], onde: {} });
const por = (l, id) => l.find(x => x.id === id);
t('tudo normal: nenhum alarme, todas as 13 verificações ok', () => {
  const l = A.avaliar(base());
  assert.strictEqual(l.length, 13); assert(l.every(x => x.nivel === 'ok'), l.filter(x => x.nivel !== 'ok').map(x => x.id).join());
});
t('NS do dia: 85% atenção, 69,9% crítico, poucas chamadas não avalia', () => {
  const m = base(); m.dia.ns = 85; assert.strictEqual(por(A.avaliar(m), 'ns').nivel, 'aten');
  m.dia.ns = 69.9; const x = por(A.avaliar(m), 'ns'); assert.strictEqual(x.nivel, 'crit'); assert.strictEqual(x.titulo, 'NS do dia abaixo de 70%');
  m.dia.ofer = 10; assert.strictEqual(por(A.avaliar(m), 'ns').nivel, 'na');
});
t('NS da hora só a partir de 15 finalizadas', () => {
  const m = base(); m.hora.ns = 50; m.hora.fin = 14; assert.strictEqual(por(A.avaliar(m), 'nsHora').nivel, 'na');
  m.hora.fin = 15; assert.strictEqual(por(A.avaliar(m), 'nsHora').nivel, 'crit');
});
t('volume: +25% atenção, +50% crítico, −30% atenção, previsto pequeno não avalia', () => {
  const m = base(); m.hora.oferPrev = 40;
  m.hora.ofer = 50; assert.strictEqual(por(A.avaliar(m), 'vol').nivel, 'aten');
  m.hora.ofer = 60; assert.strictEqual(por(A.avaliar(m), 'vol').nivel, 'crit');
  m.hora.ofer = 28; const x = por(A.avaliar(m), 'vol'); assert.strictEqual(x.nivel, 'aten'); assert.strictEqual(x.titulo, 'Volume da hora abaixo do previsto'); assert.strictEqual(x.valor, '−30%');
  m.hora.oferPrev = 19; assert.strictEqual(por(A.avaliar(m), 'vol').nivel, 'na');
});
t('abandono: +20% atenção, +40% crítico, 10% das oferecidas é crítico mesmo dentro do normal', () => {
  const m = base(); m.dia.abandPrev = 100;
  m.dia.aband = 125; assert.strictEqual(por(A.avaliar(m), 'aband').nivel, 'aten');
  m.dia.aband = 140; assert.strictEqual(por(A.avaliar(m), 'aband').nivel, 'crit');
  m.dia.aband = 100; m.dia.abandPct = 10; const x = por(A.avaliar(m), 'aband'); assert.strictEqual(x.nivel, 'crit'); assert.strictEqual(x.titulo, 'Abandono de 10% ou mais');
});
t('fila: 2 min atenção, 5 min crítico, 15 esperando crítico ("Fila grande")', () => {
  const m = base(); m.fila = { total: 2, espMax: 120, skillMax: 'X', semAgente: [] };
  assert.strictEqual(por(A.avaliar(m), 'fila').nivel, 'aten');
  m.fila.espMax = 300; assert.strictEqual(por(A.avaliar(m), 'fila').nivel, 'crit');
  m.fila = { total: 15, espMax: 30, semAgente: [] }; const x = por(A.avaliar(m), 'fila'); assert.strictEqual(x.nivel, 'crit'); assert.strictEqual(x.titulo, 'Fila grande');
});
t('fila sem agente disponível: atenção com os nomes', () => {
  const m = base(); m.fila = { total: 1, espMax: 10, semAgente: ['HB_SUP'] };
  const x = por(A.avaliar(m), 'agentes'); assert.strictEqual(x.nivel, 'aten'); assert(x.det.includes('HB_SUP'));
});
t('TME e TMA: precisam passar a % E a diferença mínima', () => {
  const m = base(); m.dia.tmePrev = 20; m.dia.tme = 29;   // +45%, mas só 9 s a mais
  assert.strictEqual(por(A.avaliar(m), 'tme').nivel, 'ok');
  m.dia.tme = 30; assert.strictEqual(por(A.avaliar(m), 'tme').nivel, 'crit');
  m.dia.tma = 760; assert.strictEqual(por(A.avaliar(m), 'tma').nivel, 'aten');
});
t('atendidos direto: −10 p.p. atenção, −20 p.p. crítico', () => {
  const m = base(); m.dia.dir60 = 70; assert.strictEqual(por(A.avaliar(m), 'direto').nivel, 'aten');
  m.dia.dir60 = 60; const x = por(A.avaliar(m), 'direto'); assert.strictEqual(x.nivel, 'crit'); assert.strictEqual(x.valor, '−20,0');
});
t('grupos: um alarme por grupo fora do padrão, com destino na Evolução', () => {
  const m = base(); m.grupos = [{ g: 'A', dir: 'CO', v: 16, prev: 10 }, { g: 'B', dir: 'TEL', v: 25, prev: 10 }, { g: 'C', dir: 'CO', v: 50, prev: 5 }];
  const l = A.avaliar(m), gs = l.filter(x => x.id.startsWith('grupo:'));
  assert.deepStrictEqual(gs.map(x => x.id + '/' + x.nivel), ['grupo:B/crit', 'grupo:A/aten']);
  assert.deepStrictEqual(gs[0].alvo, { ch: 'of', dir: 'TEL', grupo: 'B' });
  assert(!por(l, 'grupos'), 'sem a verificação "Grupos ok"');
});
t('skills paradas: só com normal ≥ 5', () => {
  const m = base(); m.paradas = [{ nome: 'S1', prev: 4 }]; assert.strictEqual(por(A.avaliar(m), 'parada').nivel, 'ok');
  m.paradas.push({ nome: 'S2', prev: 8, dir: 'TEL' }); const x = por(A.avaliar(m), 'parada'); assert.strictEqual(x.nivel, 'aten'); assert(x.det.includes('S2') && !x.det.includes('S1'));
});
t('CO/TEL e coleta', () => {
  const m = base(); m.dia.telPct = 41; assert.strictEqual(por(A.avaliar(m), 'tel').nivel, 'aten');
  m.dia.telPct = 9; assert.strictEqual(por(A.avaliar(m), 'tel').nivel, 'crit');
  m.atrasoMin = 12; assert.strictEqual(por(A.avaliar(m), 'coleta').nivel, 'aten');
  m.atrasoMin = 25; assert.strictEqual(por(A.avaliar(m), 'coleta').nivel, 'crit');
  m.vivo = false; assert.strictEqual(por(A.avaliar(m), 'coleta').nivel, 'na');
});
t('sem previsto: as regras que dependem dele ficam "sem dado"', () => {
  const m = base(); m.cmpNome = ''; ['nsPrev', 'abandPrev', 'tmePrev', 'tmaPrev', 'dir60Prev', 'telPctPrev'].forEach(k => { m.dia[k] = null; }); m.hora.oferPrev = null; m.grupos = null; m.paradas = null;
  const l = A.avaliar(m);
  assert.deepStrictEqual(l.filter(x => x.nivel === 'na').map(x => x.id).sort(), ['direto', 'grupos', 'parada', 'tel', 'tma', 'tme', 'vol'].sort());
  assert.strictEqual(por(l, 'aband').nivel, 'ok', 'o abandono ainda avalia a % das oferecidas');
});
t('ordem: críticos primeiro, depois atenção, na ordem das regras', () => {
  const m = base(); m.fila = { total: 2, espMax: 130, semAgente: [] }; m.dia.ns = 60; m.hora.ofer = 40;
  assert.deepStrictEqual(A.avaliar(m).slice(0, 3).map(x => x.id), ['ns', 'vol', 'fila']);
});
t('limites trocáveis: com limites próprios o resultado muda', () => {
  const m = base(); m.dia.ns = 85; const lim = JSON.parse(JSON.stringify(A.LIM)); lim.ns.aten = 80;
  assert.strictEqual(por(A.avaliar(m, lim), 'ns').nivel, 'ok');
});
t('histórico local: "desde", último encerrado, silêncio vencido e virada do dia', () => {
  const ns = { id: 'ns', nivel: 'crit', titulo: 'NS do dia abaixo de 70%' }, ok2 = { id: 'ns', nivel: 'ok', titulo: 'x' };
  let h = A.registrar(null, '2026-10-30', '10:30', [ns], 0);
  h = A.registrar(h, '2026-10-30', '10:35', [ns], 0);
  assert.strictEqual(h.desde.ns, '10:30');
  h.sil = { ns: 1000, outro: 5000 };
  h = A.registrar(h, '2026-10-30', '11:00', [ok2], 2000);
  assert.deepStrictEqual(h.ult, { titulo: 'NS do dia abaixo de 70%', fim: '11:00', mais: 0 }); assert(!h.desde.ns);
  assert.deepStrictEqual(Object.keys(h.sil), ['outro']);
  h = A.registrar(h, '2026-10-31', '08:05', [ok2], 2000);
  assert.strictEqual(h.ult, null); assert.deepStrictEqual(h.sil, {});
});
console.log(ok + ' testes ok');

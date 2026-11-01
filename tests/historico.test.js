// Testes do histórico (node tests/historico.test.js). Usa tests/historico_amostra.csv (139 dias, fora do git).
const assert = require('assert');
const fs = require('fs');
const path = require('path');
const D = require('../dados.js');
const Hs = require('../historico.js');
let ok = 0;
const t = (nome, fn) => { try { fn(); ok++; console.log('ok  ', nome); } catch (e) { console.log('FALHOU', nome, '\n  ', e.message); process.exitCode = 1; } };
const txt = fs.readFileSync(path.join(__dirname, 'historico_amostra.csv'), 'utf8');
const trad = require('./amostra.json').skills;
const H = Hs.parse(txt);
// conferido à parte em Python (pandas) sobre o mesmo arquivo: mediana das 7 sextas antes de 30/10, CO, por hora 08h–20h
const esperado = { sex: [38, 126, 153, 173, 158, 93, 118, 142, 195, 184, 96, 30, 5] };

t('lê os 139 dias (; e dd/mm/aaaa), sem avisos', () => {
  assert.strictEqual(H.lista.length, 139);
  assert.strictEqual(H.inicio, '2026-06-14'); assert.strictEqual(H.fim, '2026-10-30');
  assert.deepStrictEqual(H.avisos, []);
});

t('aceita tabulação e data ISO', () => {
  const l = txt.split(/\r?\n/).slice(0, 50);
  const tab = l.map((x, i) => i ? x.replace(/^(\d{2})\/(\d{2})\/(\d{4})/, '$3-$2-$1') : x).join('\n').replace(/;/g, '\t');
  const h2 = Hs.parse(tab);
  assert.strictEqual(h2.inicio, '2026-06-14');
  assert.strictEqual(h2.dias.get('2026-06-14').length, Hs.parse(l.join('\n')).dias.get('2026-06-14').length);
});

t('arquivo com problema é recusado com mensagem clara', () => {
  assert.throws(() => Hs.parse(''), /vazio/);
  assert.throws(() => Hs.parse('DIA;HORARIO;SKILL\n30/10/2026;08:00;X'), /colunas ausentes/);
});

t('dia convertido: total do dia = soma das linhas (08:00–21:00)', () => {
  const d = Hs.diaComoDados(H, '2026-10-30', trad);
  const L = d.leituras[d.leituras.length - 1];
  assert.strictEqual(L.horario, '21:00');
  const linhas = H.dias.get('2026-10-30').filter(r => r.m < 21 * 60);
  const co = D.filtro(d, { dir: 'CO' });
  const a = D.agregar(L, co);
  const soma = k => linhas.filter(r => trad[r.sk] && trad[r.sk].DIRECIONAMENTO === 'CO').reduce((s, r) => s + r[k], 0);
  assert.deepStrictEqual([a.ofer, a.atend, a.aband, a.a60, a.a300], [soma('o'), soma('a'), soma('b'), soma('a60'), soma('a300')]);
  assert.ok(Math.abs(a.tme - soma('esp') / soma('a')) < 1e-6 && Math.abs(a.tma - soma('tma') / soma('a')) < 1e-6);
});

t('dia convertido: intervalos de 15 min = linhas de cada bloco', () => {
  const d = Hs.diaComoDados(H, '2026-10-30', trad);
  const co = D.filtro(d, { dir: 'CO' });
  const iv = D.intervalos(d, 15, co);
  const linhas = H.dias.get('2026-10-30').filter(r => trad[r.sk] && trad[r.sk].DIRECIONAMENTO === 'CO');
  iv.slice(1).forEach(i => {
    const s = linhas.filter(r => r.m === i.ini).reduce((x, r) => x + r.o, 0);
    assert.strictEqual(i.v.ofer, s, i.rot);
  });
  assert.ok(iv.every(i => !i.andamento && !i.semColeta));
});

t('dia do histórico não tem fila (null, não zero)', () => {
  const d = Hs.diaComoDados(H, '2026-10-30', trad);
  const iv = D.intervalos(d, 60, D.filtro(d, { dir: 'CO' }));
  assert.ok(iv.every(i => i.esp === null));
  assert.ok(D.acumulados(d, iv, D.filtro(d, { dir: 'CO' })).every(i => i.esp === null));
});

t('referências: 7 mesmas semanas e 7 dias corridos', () => {
  assert.deepStrictEqual(Hs.referencias(H, '2026-10-30', 'sem'), ['2026-10-23', '2026-10-16', '2026-10-09', '2026-10-02', '2026-09-25', '2026-09-18', '2026-09-11']);
  assert.deepStrictEqual(Hs.referencias(H, '2026-10-31', 'dias'), ['2026-10-30', '2026-10-29', '2026-10-28', '2026-10-27', '2026-10-26', '2026-10-25', '2026-10-24']);
  assert.strictEqual(Hs.referencias(H, '2026-07-01', 'sem').length, 2, 'perto do início do histórico: só as semanas que existem');
  assert.ok(Hs.referencias(H, '2026-10-30', 'sem').every(r => Hs.diaSemana(r) === 5));
});

t('mediana: ímpar, par, ignora vazios', () => {
  assert.strictEqual(Hs.mediana([5, 1, 9]), 5);
  assert.strictEqual(Hs.mediana([4, 1, 9, 2]), 3);
  assert.strictEqual(Hs.mediana([null, 3, undefined]), 3);
  assert.strictEqual(Hs.mediana([]), null);
});

t('mediana das 7 sextas por hora (CO, oferecidas) = conferência em Python', () => {
  const refs = Hs.referencias(H, '2026-10-30', 'sem');
  const porHora = refs.map(r => { const d = Hs.diaComoDados(H, r, trad); return D.intervalos(d, 60, D.filtro(d, { dir: 'CO' })).map(i => i.v.ofer); });
  const med = porHora[0].map((_, k) => Hs.mediana(porHora.map(x => x[k])));
  assert.deepStrictEqual(med, esperado.sex);
});

t('cache: o mesmo dia não é convertido duas vezes; tradutora nova limpa o cache', () => {
  const a = Hs.diaComoDados(H, '2026-10-29', trad), b = Hs.diaComoDados(H, '2026-10-29', trad);
  assert.strictEqual(a, b);
  const c = Hs.diaComoDados(H, '2026-10-29', Object.assign({}, trad));
  assert.notStrictEqual(a, c);
});

t('desempenho: ler os 139 dias e converter 50 dias em menos de 1,5 s', () => {
  const t0 = Date.now();
  const h2 = Hs.parse(txt);
  h2.lista.slice(-50).forEach(d => Hs.diaComoDados(h2, d, trad));
  const ms = Date.now() - t0;
  console.log('      (' + ms + ' ms)');
  assert.ok(ms < 1500);
});

console.log(`\n${ok} teste(s) ok${process.exitCode ? ' — HÁ FALHAS' : ''}`);

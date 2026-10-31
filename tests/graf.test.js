// Testes do desenho das colunas (node tests/graf.test.js)
const assert = require('assert');
const G = require('../graf.js');
let ok = 0;
const t = (nome, fn) => { try { fn(); ok++; console.log('ok  ', nome); } catch (e) { console.log('FALHOU', nome, '\n  ', e.message); process.exitCode = 1; } };
const paths = svg => [...svg.matchAll(/<path d="([^"]+)" style="fill:(var\(--[a-zA-Z]+\)|url[^"]+)"/g)].map(m => ({ d: m[1], fill: m[2] }));
const arcos = d => (d.match(/A/g) || []).length;
// os 2 arcos de um caminho ficam no topo (logo após o 1º ponto) ou na base (depois do V)
const topoArredondado = d => /^M[^A]*A/.test(d) && d.indexOf('A') < d.indexOf('H');
const baseArredondada = d => /V[\d.]+A/.test(d);

t('coluna empilhada: base arredondada só embaixo, topo só em cima, emenda reta', () => {
  const svg = G.barras({ cols: [{ rot: 'a', segs: [{ v: 60, cor: 'var(--sCO)' }, { v: 40, cor: 'var(--sAb)' }] }], max: 100 });
  const p = paths(svg);
  assert.strictEqual(p.length, 2);
  const [baixo, cima] = p;
  assert.strictEqual(baixo.fill, 'var(--sCO)');
  assert.ok(baseArredondada(baixo.d) && !topoArredondado(baixo.d), 'parte de baixo: só a base arredondada');
  assert.ok(topoArredondado(cima.d) && !baseArredondada(cima.d), 'parte de cima: só o topo arredondado');
  assert.strictEqual(arcos(baixo.d) + arcos(cima.d), 4);
});

t('três partes: a do meio é reta nos quatro cantos', () => {
  const svg = G.barras({ cols: [{ rot: 'a', segs: [{ v: 30, cor: 'var(--sCO)' }, { v: 30, cor: 'var(--sTEL)' }, { v: 30, cor: 'var(--sAb)' }] }], max: 100 });
  const p = paths(svg);
  assert.strictEqual(p.length, 3);
  assert.strictEqual(arcos(p[1].d), 0);
});

t('coluna de uma parte só: arredondada em cima e embaixo', () => {
  const p = paths(G.barras({ cols: [{ rot: 'a', segs: [{ v: 50, cor: 'var(--sCO)' }] }], max: 100 }));
  assert.strictEqual(p.length, 1);
  assert.ok(topoArredondado(p[0].d) && baseArredondada(p[0].d));
});

t('parte com valor zero é ignorada (a outra vira a coluna inteira)', () => {
  const p = paths(G.barras({ cols: [{ rot: 'a', segs: [{ v: 50, cor: 'var(--sCO)' }, { v: 0, cor: 'var(--sAb)' }] }], max: 100 }));
  assert.strictEqual(p.length, 1);
  assert.ok(topoArredondado(p[0].d) && baseArredondada(p[0].d));
});

t('as partes se encostam: o topo de uma é a base da outra (sem fresta)', () => {
  const p = paths(G.barras({ cols: [{ rot: 'a', segs: [{ v: 60, cor: 'var(--sCO)' }, { v: 40, cor: 'var(--sAb)' }] }], max: 100 }));
  const topoBaixo = +/^M[\d.]+ ([\d.]+)/.exec(p[0].d)[1];
  const baseCima = +/V([\d.]+)/.exec(p[1].d)[1];
  assert.ok(topoBaixo <= baseCima, `parte de baixo (${topoBaixo}) deve subir até a de cima (${baseCima})`);
});
console.log(`\n${ok} teste(s) ok${process.exitCode ? ' — HÁ FALHAS' : ''}`);

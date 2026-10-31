// Testes das contas (node tests/dados.test.js). Os valores esperados da amostra foram conferidos à parte, em Python.
const assert = require('assert');
const fs = require('fs');
const path = require('path');
const D = require('../dados.js');
const amostra = () => JSON.parse(fs.readFileSync(path.join(__dirname, 'amostra.json'), 'utf8'));
let ok = 0;
const t = (nome, fn) => { try { fn(); ok++; console.log('ok  ', nome); } catch (e) { console.log('FALHOU', nome, '\n  ', e.message); process.exitCode = 1; } };

t('amostra: slots e desempate do 19:00 (fica a coleta das 19:00:07)', () => {
  const d = D.normalizar(amostra());
  assert.strictEqual(d.leituras.length, 47);
  assert.strictEqual(d.descartadas, 1);
  const l = d.leituras.find(x => x.horario === '19:00');
  assert.strictEqual(new Date(l.col).getMinutes(), 0);
});

t('amostra: acumulado CO e TEL na última coleta (19:15)', () => {
  const d = D.normalizar(amostra());
  const L = d.leituras[d.leituras.length - 1];
  const a = D.agregar(L, D.filtro(d, { dir: 'CO' }));
  assert.deepStrictEqual([a.ofer, a.atend, a.aband, a.a300], [1562, 1352, 205, 956]);
  assert.strictEqual(a.ns.toFixed(2), '61.20');
  assert.strictEqual(a.tma.toFixed(1), '929.3');
  assert.strictEqual(D.agregar(L, D.filtro(d, { dir: 'TEL' })).ofer, 2808);
});

t('amostra: intervalos de 1 h (volumes = fim − início)', () => {
  const d = D.normalizar(amostra());
  const iv = D.intervalos(d, 60, D.filtro(d, { dir: 'CO' }));
  const p = h => iv.find(i => i.rot === h).v;
  assert.deepStrictEqual([p('09:00').ofer, p('09:00').atend, p('09:00').aband, p('09:00').a300], [94, 79, 8, 46]);
  assert.deepStrictEqual([p('11:00').ofer, p('11:00').a300], [187, 3]);
  assert.deepStrictEqual([p('18:00').ofer, p('18:00').atend, p('18:00').aband, p('18:00').a300], [101, 104, 7, 79]);
  assert.ok(iv[0].incluiAntes, '1º intervalo sem leitura das 08:00 deve avisar');
  assert.ok(iv[iv.length - 1].andamento, 'último intervalo em andamento');
  // soma dos intervalos = acumulado final
  assert.strictEqual(iv.reduce((s, i) => s + i.v.ofer, 0), 1562);
});

t('NS do intervalo nunca passa de 100%', () => {
  const d = D.normalizar(amostra());
  [15, 30, 60, 120].forEach(p => D.intervalos(d, p, D.filtro(d, { dir: 'CO' })).forEach(i => {
    if (i.v && i.v.ns != null) assert.ok(i.v.ns <= 100 && i.v.ns >= 0, p + ' ' + i.rot + ' ' + i.v.ns);
  }));
});

t('hora atual de 5 em 5 min', () => {
  const d = D.normalizar(amostra());
  const iv = D.intervalos(d, 5, D.filtro(d, { dir: 'CO' }), { desde: 19 * 60 });
  assert.deepStrictEqual(iv.map(i => i.rot), ['19:00', '19:05', '19:10']);
  assert.deepStrictEqual(iv.map(i => i.v.ofer), [8, 9, 3]);
});

t('automático: 1 h no celular (12 colunas), 15 min com espaço', () => {
  const d = D.normalizar(amostra());
  assert.strictEqual(D.passoAuto(d, 13), 60);
  assert.strictEqual(D.passoAuto(d, 24), 30);
  assert.strictEqual(D.passoAuto(d, 60), 15);
});

t('lê pelo id da métrica, não pela posição', () => {
  const raw = amostra();
  const ord = raw.metricas.map((m, i) => i).reverse();
  raw.metricas = ord.map(i => raw.metricas[i]);
  raw.leituras.forEach(l => Object.keys(l.valores).forEach(k => { const a = l.valores[k]; l.valores[k] = ord.map(i => a[i]); }));
  const d = D.normalizar(raw);
  const a = D.agregar(d.leituras[d.leituras.length - 1], D.filtro(d, { dir: 'CO' }));
  assert.deepStrictEqual([a.ofer, a.atend, a.aband, a.a300], [1562, 1352, 205, 956]);
});

t('arquivo com problema é recusado com mensagem clara', () => {
  assert.throws(() => D.normalizar(null), /vazio/);
  assert.throws(() => D.normalizar({ dia: '30/10/2026', metricas: [], leituras: [] }), /dia/);
  const sem = amostra(); sem.metricas = sem.metricas.filter(m => m.id !== 'Answered');
  assert.throws(() => D.normalizar(sem), /Answered/);
  const vaz = amostra(); vaz.leituras = [];
  assert.throws(() => D.normalizar(vaz), /nenhuma leitura/);
});

t('slot sem coleta: coluna marcada e volume no intervalo seguinte', () => {
  const raw = amostra();
  raw.leituras = raw.leituras.filter(l => l.horario !== '10:15');
  const d = D.normalizar(raw);
  const iv = D.intervalos(d, 15, D.filtro(d, { dir: 'CO' }));
  const a = iv.find(i => i.rot === '10:00'), b = iv.find(i => i.rot === '10:15');
  assert.ok(a.semColeta && !a.v);
  assert.ok(b.juntaAnterior);
  assert.strictEqual(iv.filter(i => i.v).reduce((s, i) => s + i.v.ofer, 0), 1562, 'nada se perde');
});

t('skill que some numa leitura repete a anterior (sem volume negativo) e gera aviso', () => {
  const raw = amostra();
  const k = 'VQ_COE_VIV_C_HB_HIB_SUP_V1_BL@SW_SIPS_VQ';
  delete raw.leituras[20].valores[k];
  const d = D.normalizar(raw);
  assert.ok(d.avisos.some(a => /repetidos/.test(a)));
  D.intervalos(d, 15, [k]).forEach(i => { if (i.v) assert.ok(i.v.ofer >= 0 && !i.v.negativo); });
});

t('skill fora da tradutora vira "SEM TRADUÇÃO" com aviso', () => {
  const raw = amostra();
  raw.leituras.forEach(l => { l.valores['VQ_COE_NOVA_FILA@SW_SIPS_VQ'] = l.valores['VQ_COE_VIV_C_HB_HIB_SUP_V1_BL@SW_SIPS_VQ']; });
  const d = D.normalizar(raw);
  assert.strictEqual(d.trad['VQ_COE_NOVA_FILA@SW_SIPS_VQ'].SKILL_GRUPO, 'SEM TRADUÇÃO');
  assert.ok(d.avisos.some(a => /sem tradução/.test(a)));
  assert.strictEqual(D.filtro(d, { dir: 'CO' }).includes('VQ_COE_NOVA_FILA@SW_SIPS_VQ'), false, 'não entra no CO');
});

t('técnicos em espera: pico por intervalo (soma das skills na coleta, maior entre as coletas)', () => {
  const d = D.normalizar(amostra());
  const co = D.filtro(d, { dir: 'CO' });
  const iv = D.intervalos(d, 60, co);
  const p = h => iv.find(i => i.rot === h).esp;
  // conferido em Python: 10h → coletas 10:15 a 11:00 = 5, 26, 49, 47; 11h → 49, 29, 36, 50
  assert.deepStrictEqual([p('10:00').pico, p('10:00').n, p('10:00').espMax], [49, 4, 1431]);
  assert.deepStrictEqual([p('11:00').pico, d.leituras.find(l => l.m === p('11:00').picoM).horario, p('11:00').espMax], [50, '12:00', 1959]);
  assert.deepStrictEqual([p('13:00').pico, p('14:00').pico], [0, 0]);
  // em 15 min, cada intervalo tem só a coleta do fim
  const q = D.intervalos(d, 15, co).find(i => i.rot === '10:30').esp;
  assert.deepStrictEqual([q.pico, q.n], [49, 1]);
  const dia = D.espera(d.leituras, -1, d.leituras[d.leituras.length - 1].m, co);
  assert.deepStrictEqual([dia.pico, dia.espMax], [50, 1959]);
});

t('atendidos direto (até 1 min) ÷ atendidas, nunca acima de 100%', () => {
  const d = D.normalizar(amostra());
  const co = D.filtro(d, { dir: 'CO' });
  const a = D.agregar(d.leituras[d.leituras.length - 1], co);
  assert.ok(a.dir60 > 0 && a.dir60 <= 100);
  assert.strictEqual(a.dir60, a.a60 / a.atend * 100);
  [15, 60].forEach(p => D.intervalos(d, p, co).forEach(i => { if (i.v && i.v.dir60 != null) assert.ok(i.v.dir60 >= 0 && i.v.dir60 <= 100); }));
});

t('modo acumulado: cada coluna = total do dia até o fim dela; fila = maior do dia até ali', () => {
  const d = D.normalizar(amostra());
  const co = D.filtro(d, { dir: 'CO' });
  [15, 60].forEach(p => {
    const iv = D.intervalos(d, p, co), ac = D.acumulados(d, iv, co);
    let soma = 0, maior = 0;
    iv.forEach((c, i) => {
      soma += c.v.ofer; maior = Math.max(maior, c.esp ? c.esp.pico : 0);
      assert.strictEqual(ac[i].v.ofer, soma, `${p} min ${c.rot}: acumulado = soma dos intervalos`);
      assert.strictEqual(ac[i].esp.pico, maior, `${p} min ${c.rot}: maior fila até ali`);
      assert.ok(ac[i].acum && !ac[i].incluiAntes && !ac[i].juntaAnterior);
    });
    const ult = ac[ac.length - 1].v, dia = D.agregar(d.leituras[d.leituras.length - 1], co);
    assert.deepStrictEqual([ult.ofer, ult.atend, ult.aband, ult.a300, ult.ns], [dia.ofer, dia.atend, dia.aband, dia.a300, dia.ns]);
  });
  // conferido em Python: até 12:00 → NS (a300 ÷ ofer) e maior fila 50 às 12:00
  const ac = D.acumulados(d, D.intervalos(d, 60, co), co);
  const c = ac.find(x => x.fim === 12 * 60);
  assert.strictEqual(c.v.ns.toFixed(1), (c.v.a300 / c.v.ofer * 100).toFixed(1));
  assert.deepStrictEqual([c.esp.pico, D.hhmm(c.esp.picoM)], [50, '12:00']);
  // intervalos originais não são alterados
  const iv = D.intervalos(d, 60, co); D.acumulados(d, iv, co);
  assert.ok(!iv[0].acum && iv[0].incluiAntes);
});

t('formatação pt-BR', () => {
  assert.strictEqual(D.fmtInt(1562), '1.562');
  assert.strictEqual(D.fmtPct(61.2), '61,2%');
  assert.strictEqual(D.fmtSeg(289), '4min 49s');
  assert.strictEqual(D.fmtSeg(3720), '1h 02min');
});

t('versão igual em todos os arquivos', () => {
  const raiz = path.join(__dirname, '..');
  const ler = f => fs.readFileSync(path.join(raiz, f), 'utf8');
  const v = /APP_VERSION = '([\d.]+)'/.exec(ler('app.js'))[1];
  assert.strictEqual(/VERSION = '([\d.]+)'/.exec(ler('sw.js'))[1], v, 'sw.js');
  const qs = [...ler('index.html').matchAll(/\?v=([\d.]+)/g)].map(m => m[1]);
  assert.ok(qs.length >= 3 && qs.every(x => x === v), 'index.html ?v=');
});

console.log(`\n${ok} teste(s) ok${process.exitCode ? ' — HÁ FALHAS' : ''}`);

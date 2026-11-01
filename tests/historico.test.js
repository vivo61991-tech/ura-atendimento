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

t('dia do histórico sem a coluna FILA não tem fila (null, não zero)', () => {
  const d = Hs.diaComoDados(H, '2026-06-14', trad);
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

t('fila: lê só as marcas de 15 min, zera quem não aparece e respeita o período do arquivo', () => {
  const H = Hs.parse(['DIA;HORARIO;SKILL;OFERECIDAS;ATENDIDAS;ABANDONADAS;ATEND_60S;ATEND_300S;SOMA_ESPERA_S;SOMA_TMA_S',
    '01/10/2026;10:00;A;5;4;1;2;3;100;600', '02/10/2026;10:00;A;5;4;1;2;3;100;600', '03/10/2026;10:00;A;5;4;1;2;3;100;600'].join('\n'));
  assert.ok(Hs.ehFila('DIA;MARCA;SKILL;EM_ESPERA;ESPERA_MAX_S') && !Hs.ehFila('DIA;HORARIO;SKILL'));
  const F = Hs.parseFila(['\uFEFFDIA;MARCA;SKILL;EM_ESPERA;ESPERA_MAX_S', '02/10/2026;10:10;A;9;400', '02/10/2026;10:15;A;3;200', '2026-10-02;10:15;B;2;50', '02/10/2026;xx;A;1;1'].join('\n'));
  assert.deepStrictEqual([F.inicio, F.fim, F.ruins], ['2026-10-02', '2026-10-02', 1]);
  const trad = { A: { SKILL_GRUPO: 'G', DIRECIONAMENTO: 'CO' }, B: { SKILL_GRUPO: 'G', DIRECIONAMENTO: 'CO' } };
  assert.strictEqual(Hs.diaComoDados(H, '2026-10-02', trad).temFila, false, 'sem anexar: sem fila');
  Hs.anexarFila(H, F);
  const d = Hs.diaComoDados(H, '2026-10-02', trad);
  const l = d.leituras.find(x => x.m === 615), l0 = d.leituras.find(x => x.m === 600);
  assert.ok(d.temFila);
  assert.deepStrictEqual([l.v.A.Current_Calls, l.v.A.Curr_Max_Wait_Time, l.v.B.Current_Calls], [3, 200, 2], 'marca de 15 min');
  assert.strictEqual(l0.v.A.Current_Calls, 0, 'sem linha = ninguém esperando (zero, não vazio)');
  assert.strictEqual(D.espera(d.leituras, 600, 630, ['A', 'B']).pico, 5, 'pico soma as skills na marca (a de 10:10 fica de fora)');
  assert.strictEqual(Hs.diaComoDados(H, '2026-10-01', trad).temFila, false, 'fora do período do arquivo: sem fila');
  assert.throws(() => Hs.parseFila('DIA;MARCA;SKILL\n02/10/2026;10:15;A'), /EM_ESPERA/);
});

t('fila nas colunas do próprio histórico (um SELECT só): FILA do bloco HH:MM = retrato da leitura HH:MM + 15', () => {
  const H = Hs.parse(['DIA;HORARIO;SKILL;OFERECIDAS;ATENDIDAS;ABANDONADAS;ATEND_60S;ATEND_300S;SOMA_ESPERA_S;SOMA_TMA_S;FILA;ESPERA_MAX_S',
    '2026-10-01;10:00;A;5;4;1;2;3;100;600;;', '2026-10-02;10:00;A;5;4;1;2;3;100;600;3;200', '2026-10-02;10:00;B;0;0;0;0;0;0;0;2;50',
    '2026-10-02;10:15;A;1;1;0;1;1;10;60;0;0'].join('\n'));
  const trad = { A: { SKILL_GRUPO: 'G', DIRECIONAMENTO: 'CO' }, B: { SKILL_GRUPO: 'G', DIRECIONAMENTO: 'CO' } };
  assert.ok(H.colsFila && H.diasFila.has('2026-10-02') && !H.diasFila.has('2026-10-01'));
  const d = Hs.diaComoDados(H, '2026-10-02', trad), l = d.leituras.find(x => x.m === 615);
  assert.ok(d.temFila);
  assert.deepStrictEqual([l.v.A.Current_Calls, l.v.A.Curr_Max_Wait_Time, l.v.B.Current_Calls], [3, 200, 2]);
  assert.strictEqual(l.v.B.Distinct_Entered, 0, 'linha só de fila não soma volume');
  assert.strictEqual(d.leituras.find(x => x.m === 630).v.A.Current_Calls, 0);
  assert.strictEqual(Hs.diaComoDados(H, '2026-10-01', trad).temFila, false, 'coluna vazia no dia: sem fila');
  assert.strictEqual(Hs.parse('DIA;HORARIO;SKILL;OFERECIDAS;ATENDIDAS;ABANDONADAS;ATEND_60S;ATEND_300S;SOMA_ESPERA_S;SOMA_TMA_S\n2026-10-01;10:00;A;1;1;0;1;1;1;1').colsFila, false, 'formato antigo continua valendo');
});

console.log(`\n${ok} teste(s) ok${process.exitCode ? ' — HÁ FALHAS' : ''}`);

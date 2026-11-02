/* URA · Suporte B2C — painel de alarmes (aba Agora).
 * Regras puras: recebem os números já calculados pelo app (m) e devolvem a lista de verificações.
 * Os limites ficam todos em LIM, num lugar só, para ajustar depois.
 *
 * Cada verificação: { id, chip, nivel: 'crit'|'aten'|'ok'|'na', titulo, det (HTML), valor, valorSub, tag, regra,
 *   onde (HTML ou ''), alvo: { ch, dir, grupo } }  — 'na' = sem dado para avaliar (ex.: previsto desligado).
 */
(function (raiz, fab) {
  if (typeof module !== 'undefined' && module.exports) module.exports = fab(require('./dados.js'));
  else raiz.Alarmes = fab(raiz.Dados);
})(typeof self !== 'undefined' ? self : this, function (D) {
  'use strict';

  // ---------------------------------------------------------------- limites (modelo inicial, para ajustar)
  // %: diferença para o previsto (mediana dos dias de comparação, até o mesmo horário)
  // p.p.: pontos percentuais
  const LIM = {
    ns: { aten: 90, crit: 70, minOfer: 20 },                         // NS do dia (CO), em %
    nsHora: { aten: 90, crit: 70, minFin: 15 },                      // NS da hora (CO), em %; só com 15 finalizadas
    vol: { atenMais: 25, critMais: 50, atenMenos: -30, critMenos: -50, minPrev: 20 },   // oferecidas da hora (URA), %
    aband: { aten: 20, crit: 40, pctCrit: 10, minPrev: 10 },         // abandonadas do dia (CO), % acima; ou ≥ 10% das oferecidas
    espera: { aten: 120, crit: 300, filaCrit: 15 },                  // mais antiga na fila (s) e tamanho da fila
    tme: { aten: 25, crit: 50, minDif: 10 },                         // TME do dia (CO), % acima; e pelo menos 10 s a mais
    tma: { aten: 25, crit: 50, minDif: 30 },                         // TMA do dia (CO), % acima; e pelo menos 30 s a mais
    direto: { aten: -10, crit: -20 },                                // atendidos direto do dia (CO), p.p. abaixo
    grupo: { aten: 50, crit: 100, minPrev: 10 },                     // oferecidas do grupo na hora, % acima
    skillParada: { minPrev: 5 },                                     // skill sem nenhuma chamada na última hora (previsto ≥ 5)
    tel: { aten: 10, crit: 20 },                                     // parte da TEL nas oferecidas do dia, p.p.
    coleta: { aten: 10, crit: 20 }                                   // minutos sem coleta nova (só no dia de hoje)
  };

  const esc = s => String(s == null ? '' : s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const fI = D.fmtInt, fP = D.fmtPct, fS = D.fmtSeg;
  const sinal = x => (x > 0 ? '+' : x < 0 ? '−' : '±');
  const pctTx = x => sinal(x) + Math.abs(Math.round(x)) + '%';
  const ppTx = x => sinal(x) + Math.abs(x).toLocaleString('pt-BR', { maximumFractionDigits: 1, minimumFractionDigits: 1 });
  const dif = (v, r) => (v == null || r == null || !r) ? null : (v - r) / r * 100;
  const med = (m, tx) => m.cmpNome ? ` · med. ${esc(m.cmpNome)}: ${tx}` : '';
  const ondeTx = l => l && l.length ? l.slice(0, 3).map(x => `<b>${esc(x.nome)}</b> ${esc(x.tx)}`).join(' · ') : '';
  const espTx = s => s >= 60 ? Math.floor(s / 60) + 'm' + String(Math.round(s % 60)).padStart(2, '0') : Math.round(s) + 's';

  function verif(id, chip, tag, alvo) { return { id, chip, tag, alvo, nivel: 'na', titulo: chip, det: '', valor: '', valorSub: '', regra: '', onde: '' }; }

  // m: { horario, cmpNome, vivo, atrasoMin,
  //   dia: { ofer, ns, aband, abandPrev, abandPct, tme, tmePrev, tma, tmaPrev, dir60, dir60Prev, telPct, telPctPrev },
  //   hora: { ini, ate, fecha, ofer, oferPrev, oferPrevHora, ns, fin, a300 },
  //   fila: { total, espMax, skillMax, semAgente: [nomes] },
  //   grupos: [{ g, dir, v, prev }], paradas: [{ nome, dir, prev }],
  //   onde: { ns: [{nome,tx}], aband: [...], vol: [...], fila: [...] } }
  function avaliar(m, lim) {
    lim = lim || LIM;
    const out = [], dia = m.dia || {}, hr = m.hora || {}, fila = m.fila || {}, onde = m.onde || {};
    const faixa = hr.ini != null ? `${D.hhmm(hr.ini)}–${D.hhmm(hr.ate)}` : '';

    // 1) NS do dia
    let v = verif('ns', 'NS do dia', 'CO', { ch: 'ns', dir: 'CO' });
    v.regra = `NS do dia (CO) abaixo de ${lim.ns.aten}% = em atenção; abaixo de ${lim.ns.crit}% = crítico (a partir de ${lim.ns.minOfer} oferecidas).`;
    if (dia.ns != null && dia.ofer >= lim.ns.minOfer) {
      v.nivel = dia.ns < lim.ns.crit ? 'crit' : dia.ns < lim.ns.aten ? 'aten' : 'ok';
      v.titulo = v.nivel === 'crit' ? `NS do dia abaixo de ${lim.ns.crit}%` : 'NS do dia abaixo da meta';
      v.det = `NS <b>${fP(dia.ns)}</b> · meta ${lim.ns.aten}%` + (dia.nsPrev != null ? med(m, fP(dia.nsPrev)) : '');
      v.valor = fP(dia.ns); v.valorSub = 'no dia';
      v.onde = ondeTx(onde.ns);
    }
    out.push(v);

    // 2) NS da hora
    v = verif('nsHora', 'NS da hora', 'CO', { ch: 'ns', dir: 'CO' });
    v.regra = `NS da hora (CO, ÷ finalizadas) abaixo de ${lim.nsHora.aten}% = em atenção; abaixo de ${lim.nsHora.crit}% = crítico (a partir de ${lim.nsHora.minFin} chamadas finalizadas na hora).`;
    if (hr.ns != null && hr.fin >= lim.nsHora.minFin) {
      v.nivel = hr.ns < lim.nsHora.crit ? 'crit' : hr.ns < lim.nsHora.aten ? 'aten' : 'ok';
      v.titulo = v.nivel === 'crit' ? `NS da hora abaixo de ${lim.nsHora.crit}%` : 'NS da hora abaixo da meta';
      v.det = `${faixa}: <b>${fI(hr.a300)}</b> de ${fI(hr.fin)} finalizadas em até 5 min`;
      v.valor = fP(hr.ns); v.valorSub = 'na hora';
    }
    out.push(v);

    // 3) volume da hora (URA) contra o previsto até agora
    v = verif('vol', 'Volume', 'URA', { ch: 'of', dir: 'TODOS' });
    const L = lim.vol;
    v.regra = `Oferecidas da hora (URA) contra o previsto até o mesmo minuto: ${L.atenMais}% acima ou ${-L.atenMenos}% abaixo = em atenção; ${L.critMais}% acima ou ${-L.critMenos}% abaixo = crítico (só com previsto de ${L.minPrev} ou mais).`;
    const dv = hr.oferPrev >= L.minPrev ? dif(hr.ofer, hr.oferPrev) : null;
    if (dv != null) {
      v.nivel = dv >= L.critMais || dv <= L.critMenos ? 'crit' : dv >= L.atenMais || dv <= L.atenMenos ? 'aten' : 'ok';
      v.titulo = dv >= 0 ? 'Volume da hora acima do previsto' : 'Volume da hora abaixo do previsto';
      v.det = `${faixa}: <b>${fI(hr.ofer)}</b> oferecidas · previsto ${fI(hr.oferPrev)}` + (!hr.fecha && hr.oferPrevHora != null ? ` (hora inteira: ${fI(hr.oferPrevHora)})` : '');
      v.valor = pctTx(dv); v.valorSub = 'na hora';
      v.onde = ondeTx(onde.vol);
    }
    out.push(v);

    // 4) abandono do dia (CO)
    v = verif('aband', 'Abandono', 'CO', { ch: 'ab', dir: 'CO' });
    const A = lim.aband;
    v.regra = `Abandonadas do dia (CO) contra o previsto até o mesmo horário: ${A.aten}% acima = em atenção; ${A.crit}% acima ou abandono de ${A.pctCrit}% das oferecidas ou mais = crítico.`;
    const da = dia.abandPrev >= A.minPrev ? dif(dia.aband, dia.abandPrev) : null;
    const pctAlto = dia.abandPct != null && dia.ofer >= lim.ns.minOfer && dia.abandPct >= A.pctCrit;
    if (da != null || dia.abandPct != null) {
      v.nivel = pctAlto || (da != null && da >= A.crit) ? 'crit' : da != null && da >= A.aten ? 'aten' : 'ok';
      v.titulo = pctAlto && !(da != null && da >= A.aten) ? `Abandono de ${A.pctCrit}% ou mais` : 'Abandono acima do normal';
      v.det = `<b>${fI(dia.aband)}</b> abandonadas no dia (${fP(dia.abandPct)})` + (dia.abandPrev != null ? med(m, fI(dia.abandPrev)) : '');
      v.valor = da != null ? pctTx(da) : fP(dia.abandPct); v.valorSub = da != null ? 'vs. normal' : 'das oferecidas';
      v.onde = ondeTx(onde.aband);
    }
    out.push(v);

    // 5) fila: espera longa ou fila grande
    v = verif('fila', 'Fila', 'CO', { ch: 'esp', dir: 'CO' });
    const E = lim.espera;
    v.regra = `Chamada mais antiga na fila (CO) com ${fS(E.aten)} ou mais = em atenção; ${fS(E.crit)} ou mais, ou ${E.filaCrit} técnicos esperando ou mais = crítico.`;
    if (fila.total != null) {
      v.nivel = fila.espMax >= E.crit || fila.total >= E.filaCrit ? 'crit' : fila.espMax >= E.aten ? 'aten' : 'ok';
      v.titulo = fila.total >= E.filaCrit && fila.espMax < E.crit ? 'Fila grande' : 'Espera longa na fila';
      v.det = fila.total ? `<b>${fI(fila.total)}</b> ${fila.total === 1 ? 'técnico esperando' : 'técnicos esperando'} · mais antiga <b>${fS(fila.espMax)}</b>` + (fila.skillMax ? ` · ${esc(fila.skillMax)}` : '') : 'ninguém esperando';
      v.valor = fila.total ? espTx(fila.espMax) : '0'; v.valorSub = fila.total ? 'espera' : 'na fila';
      v.onde = ondeTx(onde.fila);
    }
    out.push(v);

    // 6) fila sem agente livre
    v = verif('agentes', 'Agentes', 'CO', { ch: 'esp', dir: 'CO' });
    v.regra = 'Skill com técnico esperando e nenhum agente disponível (Current_Ready = 0) na última coleta = em atenção.';
    if (fila.semAgente) {
      const n = fila.semAgente.length;
      v.nivel = n ? 'aten' : 'ok';
      v.titulo = 'Fila sem agente disponível';
      v.det = n ? `${n === 1 ? 'skill' : n + ' skills'} com espera e 0 disponível: <b>${fila.semAgente.slice(0, 3).map(esc).join(', ')}</b>${n > 3 ? '…' : ''}` : '';
      v.valor = n ? fI(n) : ''; v.valorSub = n ? (n === 1 ? 'skill' : 'skills') : '';
    }
    out.push(v);

    // 7–8) TME e TMA do dia (CO)
    [['tme', 'TME', 'tempo médio de espera'], ['tma', 'TMA', 'tempo médio de atendimento']].forEach(([k, nome, ext]) => {
      const T = lim[k];
      const x = verif(k, nome, 'CO', { ch: k, dir: 'CO' });
      x.regra = `${nome} do dia (${ext}, CO) contra o previsto: ${T.aten}% acima = em atenção; ${T.crit}% acima = crítico (só se passar o previsto em ${fS(T.minDif)} ou mais).`;
      const atual = dia[k], prev = dia[k + 'Prev'];
      const d = dif(atual, prev);
      if (d != null) {
        const longe = atual - prev >= T.minDif;
        x.nivel = longe && d >= T.crit ? 'crit' : longe && d >= T.aten ? 'aten' : 'ok';
        x.titulo = `${nome} acima do normal`;
        x.det = `${nome} do dia <b>${fS(atual)}</b>` + med(m, fS(prev));
        x.valor = pctTx(d); x.valorSub = 'vs. normal';
      }
      out.push(x);
    });

    // 9) atendidos direto (CO), em p.p.
    v = verif('direto', 'Atendidos direto', 'CO', { ch: 'dir', dir: 'CO' });
    const Dr = lim.direto;
    v.regra = `Atendidos direto (em até 1 min, CO) no dia contra o previsto: ${-Dr.aten} p.p. abaixo = em atenção; ${-Dr.crit} p.p. abaixo = crítico.`;
    if (dia.dir60 != null && dia.dir60Prev != null) {
      const x = dia.dir60 - dia.dir60Prev;
      v.nivel = x <= Dr.crit ? 'crit' : x <= Dr.aten ? 'aten' : 'ok';
      v.titulo = 'Menos atendidos direto';
      v.det = `<b>${fP(dia.dir60)}</b> das atendidas em até 1 min` + med(m, fP(dia.dir60Prev));
      v.valor = ppTx(x); v.valorSub = 'p.p.';
    }
    out.push(v);

    // 10) grupos fora do padrão (um alarme por grupo)
    const Gp = lim.grupo, grupos = (m.grupos || []).filter(g => g.prev >= Gp.minPrev);
    let algumGrupo = false;
    grupos.map(g => Object.assign({ d: dif(g.v, g.prev) }, g)).filter(g => g.d >= Gp.aten).sort((a, b) => b.d - a.d).forEach(g => {
      algumGrupo = true;
      const x = verif('grupo:' + g.g, 'Grupos', 'GRUPO', { ch: 'of', dir: g.dir || 'TODOS', grupo: g.g });
      x.regra = `Oferecidas do grupo na hora contra o previsto até o mesmo minuto: ${Gp.aten}% acima = em atenção; ${Gp.crit}% acima = crítico (só com previsto de ${Gp.minPrev} ou mais).`;
      x.nivel = g.d >= Gp.crit ? 'crit' : 'aten';
      x.titulo = 'Grupo fora do padrão';
      x.det = `${esc(g.g)}: <b>${fI(g.v)}</b> na hora · previsto ${fI(g.prev)}`;
      x.valor = pctTx(g.d); x.valorSub = 'na hora';
      out.push(x);
    });
    if (!algumGrupo) {
      const x = verif('grupos', 'Grupos', 'GRUPO', { ch: 'of', dir: 'TODOS' });
      x.regra = `Oferecidas de cada grupo na hora contra o previsto: ${Gp.aten}% acima = em atenção; ${Gp.crit}% acima = crítico.`;
      if (m.grupos && grupos.length) x.nivel = 'ok';
      out.push(x);
    }

    // 11) skills paradas
    v = verif('parada', 'Skills', 'SKILL', { ch: 'of', dir: 'TODOS' });
    v.regra = `Skill sem nenhuma chamada na última hora, quando o normal seria ${lim.skillParada.minPrev} ou mais = em atenção (pode ser falha de roteamento).`;
    if (m.paradas) {
      const p = m.paradas.filter(x => x.prev >= lim.skillParada.minPrev).sort((a, b) => b.prev - a.prev);
      v.nivel = p.length ? 'aten' : 'ok';
      v.titulo = p.length === 1 ? 'Skill sem chamadas há 1 h' : 'Skills sem chamadas há 1 h';
      v.det = p.length ? p.slice(0, 3).map(x => `<b>${esc(x.nome)}</b> (normal ${fI(x.prev)})`).join(' · ') + (p.length > 3 ? ` e mais ${p.length - 3}` : '') : '';
      v.valor = p.length ? fI(p.length) : ''; v.valorSub = p.length ? (p.length === 1 ? 'skill' : 'skills') : '';
      if (p.length === 1) v.alvo = { ch: 'of', dir: p[0].dir || 'TODOS' };
    }
    out.push(v);

    // 12) divisão CO/TEL
    v = verif('tel', 'CO/TEL', 'URA', { ch: 'oftel', dir: 'TODOS' });
    const Tl = lim.tel;
    v.regra = `Parte da TEL nas oferecidas do dia contra o previsto: ${Tl.aten} p.p. de diferença = em atenção; ${Tl.crit} p.p. = crítico.`;
    if (dia.telPct != null && dia.telPctPrev != null) {
      const x = dia.telPct - dia.telPctPrev, ax = Math.abs(x);
      v.nivel = ax >= Tl.crit ? 'crit' : ax >= Tl.aten ? 'aten' : 'ok';
      v.titulo = x > 0 ? 'Mais chamadas indo para a TEL' : 'Menos chamadas indo para a TEL';
      v.det = `TEL <b>${fP(dia.telPct)}</b> das oferecidas do dia` + med(m, fP(dia.telPctPrev));
      v.valor = ppTx(x); v.valorSub = 'p.p.';
    }
    out.push(v);

    // 13) coleta atrasada (só no dia de hoje, dentro do expediente)
    v = verif('coleta', 'Coleta', 'PULSE', null);
    const C = lim.coleta;
    v.regra = `Sem coleta nova do Pulse há ${C.aten} min ou mais = em atenção; ${C.crit} min ou mais = crítico (só no dia de hoje, no expediente).`;
    if (m.vivo) {
      const a = m.atrasoMin || 0;
      v.nivel = a >= C.crit ? 'crit' : a >= C.aten ? 'aten' : 'ok';
      v.titulo = 'Coleta atrasada';
      v.det = `última coleta às <b>${esc(m.horario)}</b>, há ${fI(a)} min`;
      v.valor = fI(a) + ' min'; v.valorSub = 'sem coleta';
    }
    out.push(v);

    // críticos primeiro, depois em atenção (na ordem das regras)
    const peso = { crit: 0, aten: 1, ok: 2, na: 3 };
    return out.map((x, i) => Object.assign(x, { ordem: i })).sort((a, b) => peso[a.nivel] - peso[b.nivel] || a.ordem - b.ordem);
  }

  // Histórico local (no aparelho): desde quando cada alarme está ativo, o último encerrado e os silenciados.
  // h: { dia, desde: {id: 'HH:MM'}, tit: {id: título}, ult: {titulo, fim} | null, sil: {id: ms até quando} }
  function registrar(h, dia, horario, lista, agora) {
    if (!h || h.dia !== dia) h = { dia, desde: {}, tit: {}, ult: null, sil: {} };
    h.desde = h.desde || {}; h.tit = h.tit || {}; h.sil = h.sil || {};
    const ativos = new Set(lista.filter(x => x.nivel === 'crit' || x.nivel === 'aten').map(x => x.id));
    // encerrados agora: o primeiro (o mais antigo na lista) vira o "último alarme"; os outros só contam ("e mais N")
    const fim = Object.keys(h.desde).filter(id => !ativos.has(id));
    if (fim.length) h.ult = { titulo: h.tit[fim[0]] || fim[0], fim: horario, mais: fim.length - 1 };
    fim.forEach(id => { delete h.desde[id]; delete h.tit[id]; });
    lista.forEach(x => { if (ativos.has(x.id)) { if (!h.desde[x.id]) h.desde[x.id] = horario; h.tit[x.id] = x.titulo; } });
    Object.keys(h.sil).forEach(id => { if (h.sil[id] <= agora) delete h.sil[id]; });
    return h;
  }

  return { LIM, avaliar, registrar };
});

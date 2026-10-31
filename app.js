/* URA · Suporte B2C — telas (Agora, Evolução, Skills), leitura do arquivo e atualização automática. */
(function () {
  'use strict';
  const APP_VERSION = '1.1.1';
  const D = window.Dados, G = window.Graf;

  // ---------------------------------------------------------------- configuração
  const META_NS = 90;          // meta do NS (%) — mesma do painel de Nível de Serviço do B2C
  const LIM_ATENCAO = 70;      // abaixo da meta e acima disto: "Em atenção"; abaixo: "Crítico"
  const PARAM = new URLSearchParams(location.search);
  const FONTE = PARAM.get('arquivo') || 'pulse.json';   // arquivo publicado na raiz do site, ao lado do index.html
  const CK = 'ura-b2c:';                                // prefixo das chaves no localStorage
  const ATRASO_MIN = 15;                                // sem coleta nova há mais que isto (no expediente): aviso
  const STATUS = { VERDE: 'Meta atingida', AMARELO: 'Em atenção', VERMELHO: 'Crítico' };
  const PASSO_NOME = { auto: 'Auto', 15: '15 min', 30: '30 min', 60: '1 h', 120: '2 h' };

  // ---------------------------------------------------------------- estado
  let dados = null;            // dados normalizados em uso (sempre o último arquivo VÁLIDO)
  let origem = '';             // 'site' | 'copia' | 'arquivo'
  let nomeArq = '';
  let erroFonte = null;        // falha ao ler do site (rede/HTTP)
  let erroDados = null;        // arquivo recebido com problema (estrutura)
  let carregando = false;
  let pagina = 'agora';
  const evo = { dir: 'CO', passo: lerPref('passo', 'auto'), grupo: null, sel: null };
  const sk = { dir: 'CO', q: '', zeros: false };

  const $ = s => document.querySelector(s);
  const esc = s => String(s == null ? '' : s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const fI = D.fmtInt, fP = D.fmtPct, fS = D.fmtSeg;
  function lerPref(k, def) { try { const v = localStorage.getItem(CK + k); return v == null ? def : JSON.parse(v); } catch (e) { return def; } }
  function gravarPref(k, v) { try { localStorage.setItem(CK + k, JSON.stringify(v)); } catch (e) { /* sem armazenamento: segue sem lembrar */ } }

  const situacao = ns => ns == null ? null : (Math.round(ns * 10) / 10 >= META_NS ? 'VERDE' : ns >= LIM_ATENCAO ? 'AMARELO' : 'VERMELHO');
  const corSit = s => s === 'VERDE' ? 'var(--verdeS)' : s === 'AMARELO' ? 'var(--amareloS)' : s === 'VERMELHO' ? 'var(--vermelhoS)' : 'var(--grid)';
  const ddmmaaaa = dia => dia.split('-').reverse().join('/');
  const hojeISO = () => { const n = new Date(); return n.getFullYear() + '-' + String(n.getMonth() + 1).padStart(2, '0') + '-' + String(n.getDate()).padStart(2, '0'); };
  const rotPasso = (m, passo) => passo >= 60 ? D.hhmm(m).slice(0, 2) + 'h' : D.hhmm(m);
  const ewtTx = s => s == null ? '—' : s >= D.EWT_SEM_AGENTE ? 'sem agente' : fS(s);

  function toast(msg) {
    const t = $('#toast'); t.textContent = msg; t.classList.add('show');
    clearTimeout(toast.t); toast.t = setTimeout(() => t.classList.remove('show'), 3200);
  }

  // ---------------------------------------------------------------- leitura
  // aplica um texto JSON; se não servir, NÃO troca os dados em uso (lança o erro para quem chamou)
  function aplicarTexto(txt, org, nome) {
    let raw;
    try { raw = JSON.parse(txt); } catch (e) { throw new Error('o arquivo não é um JSON válido'); }
    const d = D.normalizar(raw);
    dados = d; origem = org; nomeArq = nome || ''; erroDados = null;
    if (org !== 'copia') { try { localStorage.setItem(CK + 'ultimo', txt); localStorage.setItem(CK + 'ultimoNome', nome || ''); } catch (e) { /* cheio: segue só em memória */ } }
    if (evo.sel != null && !d.leituras.length) evo.sel = null;
  }
  function usarCopia() {
    if (dados) return;
    try {
      const txt = localStorage.getItem(CK + 'ultimo');
      if (txt) aplicarTexto(txt, 'copia', localStorage.getItem(CK + 'ultimoNome') || '');
    } catch (e) { /* cópia ruim: ignora */ }
  }
  async function carregar(manual) {
    if (carregando) return;
    carregando = true; $('#btRefresh').classList.add('spin');
    try {
      const r = await fetch(FONTE + (FONTE.includes('?') ? '&' : '?') + 't=' + Date.now(), { cache: 'no-store' });
      if (!r.ok) throw Object.assign(new Error(r.status === 404 ? 'arquivo ' + FONTE + ' não encontrado no site' : 'o site respondeu ' + r.status), { rede: true });
      const txt = await r.text();
      try { aplicarTexto(txt, 'site', FONTE); erroFonte = null; }
      catch (e) { erroDados = e.message; erroFonte = null; }
      if (manual) toast(erroDados ? 'O arquivo novo tem problema — mantidos os últimos dados válidos.' : 'Dados atualizados.');
    } catch (e) {
      erroFonte = e.rede ? e.message : 'sem conexão com o site';
      usarCopia();
      if (manual) toast('Não consegui atualizar: ' + erroFonte + '.');
    } finally {
      carregando = false; $('#btRefresh').classList.remove('spin');
      render();
    }
  }
  function abrirArquivo(file) {
    const fr = new FileReader();
    fr.onload = () => {
      try { aplicarTexto(String(fr.result), 'arquivo', file.name); erroFonte = null; toast('Arquivo aberto: ' + file.name); }
      catch (e) { toast('Este arquivo não serve: ' + e.message + '.'); }
      render();
    };
    fr.onerror = () => toast('Não consegui ler o arquivo.');
    fr.readAsText(file);
  }

  // ---------------------------------------------------------------- topo e avisos
  function ultima() { return dados.leituras[dados.leituras.length - 1]; }
  function minutosDesde(ms) { return ms == null ? null : Math.round((Date.now() - ms) / 60000); }
  function atrasado() {
    if (!dados || dados.dia !== hojeISO()) return null;
    const n = new Date(), m = n.getHours() * 60 + n.getMinutes();
    if (m < D.INICIO || m > D.FIM + 10) return null;
    const L = ultima(), min = minutosDesde(L.col);
    return min != null && min > ATRASO_MIN ? min : null;
  }
  function renderSync() {
    const dot = $('#syncDot'), tx = $('#syncTx');
    if (!dados) { dot.className = 'dot ' + (erroFonte ? 'err' : ''); tx.textContent = erroFonte ? 'Sem dados' : 'Carregando…'; return; }
    const L = ultima(), hoje = dados.dia === hojeISO();
    const min = minutosDesde(L.col);
    let t = (hoje ? 'Coleta das ' : 'Coleta de ' + ddmmaaaa(dados.dia).slice(0, 5) + ' às ') + L.horario;
    if (hoje && min != null && min >= 0) t += min < 1 ? ' · agora' : ' · há ' + (min < 60 ? min + ' min' : Math.floor(min / 60) + 'h' + String(min % 60).padStart(2, '0'));
    tx.textContent = t;
    dot.className = 'dot ' + (origem === 'arquivo' ? 'off' : erroFonte || erroDados ? 'err' : !hoje || atrasado() ? 'off' : 'live');
  }
  function renderBanners() {
    const b = [];
    if (erroDados) b.push(`<div class="banner bad"><b>O arquivo recebido tem problema:</b> ${esc(erroDados)}. ${dados ? 'Continuo mostrando os últimos dados válidos (coleta das ' + esc(ultima().horario) + ').' : ''}</div>`);
    if (erroFonte && origem !== 'arquivo') b.push(`<div class="banner warn">Não consegui ler os dados do site (${esc(erroFonte)}).${dados ? ' Mostrando a última cópia guardada no aparelho.' : ''}</div>`);
    if (origem === 'arquivo') b.push(`<div class="banner info">Mostrando o arquivo <b>${esc(nomeArq)}</b> aberto do aparelho. A atualização automática fica pausada; toque em ↻ para voltar aos dados do site.</div>`);
    if (dados && dados.dia !== hojeISO()) b.push(`<div class="banner warn">Estes dados são de <b>${ddmmaaaa(dados.dia)}</b>, não de hoje.</div>`);
    const at = atrasado();
    if (at && origem !== 'arquivo') b.push(`<div class="banner warn">Sem coleta nova há ${at} min. Os números podem estar desatualizados.</div>`);
    $('#banners').innerHTML = b.join('');
    $('#avisos').innerHTML = dados && dados.avisos.length ? `<div class="banner warn"><b>Avisos do arquivo</b><br>${dados.avisos.map(esc).join('<br>')}</div>` : '';
    $('#footDia').textContent = dados ? ' · dados de ' + ddmmaaaa(dados.dia) : '';
  }

  // ---------------------------------------------------------------- render geral
  function render() {
    renderSync(); renderBanners();
    ['agora', 'evo', 'skills'].forEach(p => { $('#pg' + p[0].toUpperCase() + p.slice(1)).hidden = p !== pagina; });
    document.querySelectorAll('nav.tabs button').forEach(b => b.classList.toggle('on', b.dataset.v === pagina));
    if (!dados) { $('#pg' + pagina[0].toUpperCase() + pagina.slice(1)).innerHTML = vazio(); return; }
    if (pagina === 'agora') renderAgora();
    else if (pagina === 'evo') renderEvo();
    else renderSkills();
  }
  function vazio() {
    return `<div class="card vazio"><svg width="46" height="46" viewBox="0 0 24 24" fill="none" stroke="var(--p300)" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M4 20h16a1 1 0 0 0 1-1V8a1 1 0 0 0-1-1h-8l-2-3H4a1 1 0 0 0-1 1v14a1 1 0 0 0 1 1z"/></svg>
      <p>${carregando ? 'Carregando os dados…' : 'Ainda não há dados para mostrar.<br>O app procura o arquivo <b>' + esc(FONTE) + '</b> no site; para testar, abra um arquivo JSON da coleta.'}</p>
      <button class="bt" data-act="arq">Abrir arquivo JSON</button></div>`;
  }

  // larguras: quantas colunas cabem sem poluir
  function maxColunas(el) {
    const w = (el && el.clientWidth) || Math.min(760, window.innerWidth) - 56;
    return Math.max(8, Math.min(24, Math.floor(w / 27)));
  }
  const kpi = (l, v, s, cls) => `<div class="kpi${cls ? ' ' + cls : ''}"><div class="l">${l}</div><div class="v">${v}</div><div class="s">${s || '&nbsp;'}</div></div>`;
  const nsTx = (ns, cls) => ns == null ? '—' : `<span class="${cls === false ? '' : 'c-' + situacao(ns)}">${fP(ns)}</span>`;

  // ---------------------------------------------------------------- AGORA
  function renderAgora() {
    const d = dados, L = ultima();
    const co = D.filtro(d, { dir: 'CO' }), tel = D.filtro(d, { dir: 'TEL' });
    const a = D.agregar(L, co), t = D.agregar(L, tel);
    const sit = situacao(a.ns);
    const iv15 = D.intervalos(d, 15, co), u15 = iv15.filter(i => i.v).pop();
    const iv15t = D.intervalos(d, 15, tel), u15t = iv15t.filter(i => i.v).pop();
    const totURA = a.ofer + t.ofer;
    const pctBar = a.ns == null ? 0 : Math.min(100, a.ns);

    const hero = `<div class="card">
      <div class="hero">
        <div><div class="lbl">NS 300s · CO</div><div class="big num c-${sit || 'x'}">${a.ns == null ? '—' : fP(a.ns)}</div></div>
        <div class="dir">
          <div>${sit ? `<span class="pill st-${sit}">${STATUS[sit]}</span>` : '<span class="pill" style="background:var(--grid)">Sem chamadas</span>'}</div>
          <div class="prog" aria-hidden="true"><i style="width:${pctBar}%;background:${corSit(sit)}"></i><b style="left:calc(${META_NS}% - 1px)"></b></div>
          <div class="meta">meta ${META_NS}% · ${fI(a.a300)} de ${fI(a.ofer)} oferecidas atendidas em até 5 min</div>
        </div>
      </div></div>`;

    const k = `<div class="kpis2 k3">
      ${kpi('Oferecidas CO', fI(a.ofer), `atendidas ${fI(a.atend)}`)}
      ${kpi('Abandonadas', `<span class="${a.aband ? 'c-VERMELHO' : ''}">${fI(a.aband)}</span>`, a.abandPct == null ? '' : fP(a.abandPct) + ' das oferecidas')}
      ${kpi('Em espera agora', fI(a.fila), a.fila ? 'mais antiga ' + fS(a.espMax) : 'nenhuma na fila')}
      ${kpi('TME', fS(a.tme), 'TMA ' + fS(a.tma))}
      ${kpi('Últimos 15 min', u15 ? fI(u15.v.ofer) : '—', u15 ? `${u15.rot}–${D.hhmm(u15.ateM)} · NS ${u15.v.ns == null ? '—' : fP(u15.v.ns)}` : '')}
      ${kpi('Agentes disponíveis', fI(a.dispMax), 'maior valor numa skill CO')}
    </div>`;

    // fila agora (CO)
    const filas = [...porSimpl(d, 'CO').entries()].map(([nome, ss]) => ({ nome, ss, a: D.agregar(L, ss) })).filter(x => x.a.fila > 0)
      .sort((x, y) => y.a.espMax - x.a.espMax || y.a.fila - x.a.fila);
    const filaHtml = filas.length ? `<div class="fl">${filas.map(x => {
      const tr = d.trad[x.ss[0]], mx = x.a.espMax;
      const cor = mx >= 300 ? 'var(--rosa)' : mx >= 120 ? 'var(--laranja)' : 'var(--p300)';
      return `<button class="fi" data-sk="${esc(x.nome)}" data-skd="CO"><span class="bar" style="background:${cor}"></span>
        <span class="tx"><div class="nm">${esc(x.nome)}</div><div class="sb">${esc(tr.SKILL_GRUPO)}${tr.SKILL_TIPO_ATENDIMENTO ? ' · ' + esc(tr.SKILL_TIPO_ATENDIMENTO) : ''} · ${fI(x.a.dispMax)} agente(s) disponível(is)</div></span>
        <span class="nv"><b>${fI(x.a.fila)}</b><small>mais antiga ${fS(mx)}</small></span></button>`;
    }).join('')}</div>`
      : `<div class="okcard"><span class="okb"><svg viewBox="0 0 24 24"><path d="m6.5 12.3 3.6 3.6L17.5 8.6"/></svg></span><div>Nenhuma chamada em espera no CO<small>na coleta das ${esc(L.horario)}</small></div></div>`;

    // hora atual de 5 em 5 min (CO + TEL empilhados)
    const hora = horaAtual(d, co, tel);

    // grupos CO
    const gCO = grupos(d, co, L);
    const tabCO = `<div class="card"><h2>CO por grupo <small>· toque para ver a evolução</small></h2><div class="tw"><table class="conf tsel"><thead><tr><th>Grupo</th><th>Ofer.</th><th>NS</th><th>Aband.</th><th>TME</th></tr></thead><tbody>
      ${gCO.map(g => `<tr data-grupo="${esc(g.nome)}" data-dir="CO"><td>${esc(g.nome)}</td><td>${fI(g.a.ofer)}</td><td>${nsTx(g.a.ns)}</td><td>${g.a.abandPct == null ? '—' : fP(g.a.abandPct)}</td><td>${fS(g.a.tme)}</td></tr>`).join('')}
      <tr class="tot"><td>Total CO</td><td>${fI(a.ofer)}</td><td>${nsTx(a.ns)}</td><td>${a.abandPct == null ? '—' : fP(a.abandPct)}</td><td>${fS(a.tme)}</td></tr>
      </tbody></table></div></div>`;

    // TEL
    const gTEL = grupos(d, tel, L);
    const kt = `<div class="kpis2">
      ${kpi('Oferecidas TEL', fI(t.ofer), totURA ? fP(t.ofer / totURA * 100) + ' do volume da URA' : '')}
      ${kpi('Últimos 15 min', u15t ? fI(u15t.v.ofer) : '—', u15t ? `${u15t.rot}–${D.hhmm(u15t.ateM)}` : '')}
    </div>`;
    const tabTEL = `<div class="card"><h2>TEL por grupo <small>· toque para ver a evolução</small></h2><div class="tw"><table class="conf tsel"><thead><tr><th>Grupo</th><th>Ofer.</th><th>% TEL</th></tr></thead><tbody>
      ${gTEL.map(g => `<tr data-grupo="${esc(g.nome)}" data-dir="TEL"><td>${esc(g.nome)}</td><td>${fI(g.a.ofer)}</td><td>${t.ofer ? fP(g.a.ofer / t.ofer * 100) : '—'}</td></tr>`).join('')}
      <tr class="tot"><td>Total TEL</td><td>${fI(t.ofer)}</td><td>${t.ofer ? '100,0%' : '—'}</td></tr></tbody></table></div>
      <p class="nota" style="margin-top:8px">A TEL é atendida em outro sistema: aqui aparece só o volume que a URA encaminhou (sem atendidas, abandono ou NS).</p></div>`;

    $('#pgAgora').innerHTML = `
      <h2 class="sec">CO · Centro de Operações<span class="sp"></span><span class="rt">acumulado do dia</span></h2>
      ${hero}${k}
      <h2 class="sec">Fila agora <span class="ct num">${fI(a.fila)}</span><span class="sp"></span><span class="rt">${esc(L.horario)}</span></h2>
      ${filaHtml}
      ${hora}
      ${tabCO}
      <h2 class="sec">TEL · Parceira<span class="sp"></span><span class="rt">acumulado do dia</span></h2>
      ${kt}${tabTEL}`;
  }

  function horaAtual(d, co, tel) {
    const L = ultima();
    let desde = Math.floor(L.m / 60) * 60, passo = 5, tit = 'Hora atual · de 5 em 5 min';
    if (desde === L.m) { desde -= 60; passo = 15; tit = 'Última hora · de 15 em 15 min'; }
    if (desde < D.INICIO) desde = D.INICIO;
    const ic = D.intervalos(d, passo, co, { desde }), it = D.intervalos(d, passo, tel, { desde });
    const cols = [];
    for (let m = desde, i = 0; m < desde + 60; m += passo, i++) {
      const c = ic[i], tt = it[i];
      if (c && c.v) cols.push({ rot: m === desde || (m - desde) % 15 === 0 ? D.hhmm(m) : '', and: c.andamento,
        segs: [{ v: c.v.ofer, cor: 'var(--sCO)' }, { v: tt && tt.v ? tt.v.ofer : 0, cor: 'var(--sTEL)' }],
        lab: fI(c.v.ofer + (tt && tt.v ? tt.v.ofer : 0)), titulo: D.hhmm(m) + '–' + D.hhmm(m + passo) });
      else if (c && c.semColeta) cols.push({ rot: (m - desde) % 15 === 0 ? D.hhmm(m) : '', sd: true });
      else cols.push({ rot: (m - desde) % 15 === 0 ? D.hhmm(m) : '', segs: [] });
    }
    return `<div class="card chart"><h2>${tit}</h2>${G.barras({ cols, maxRot: 12, rotulos: true, aria: 'Chamadas oferecidas na hora atual' })}
      <div class="legend"><span><i style="background:var(--sCO)"></i>CO</span><span><i style="background:var(--sTEL)"></i>TEL</span><span><i class="and"></i>intervalo em andamento</span></div>
      <div class="cap">Chamadas oferecidas em cada intervalo. As horas anteriores ficam guardadas de 15 em 15 min (aba Evolução).</div></div>`;
  }

  function grupos(d, skills, L) {
    const m = new Map();
    skills.forEach(s => { const g = d.trad[s].SKILL_GRUPO; if (!m.has(g)) m.set(g, []); m.get(g).push(s); });
    return [...m.entries()].map(([nome, ss]) => ({ nome, ss, a: D.agregar(L, ss) })).sort((x, y) => y.a.ofer - x.a.ofer || x.nome.localeCompare(y.nome));
  }

  // ---------------------------------------------------------------- EVOLUÇÃO
  function renderEvo() {
    const d = dados, L = ultima();
    const filtroDir = dir => D.filtro(d, { dir, grupo: evo.grupo });
    const grpsDisp = [...new Set(D.filtro(d, { dir: evo.dir }).map(s => d.trad[s].SKILL_GRUPO))].sort();
    if (evo.grupo && !grpsDisp.includes(evo.grupo)) evo.grupo = null;
    const co = filtroDir('CO'), tel = filtroDir('TEL');
    const el = $('#pgEvo');
    const passo = evo.passo === 'auto' ? D.passoAuto(d, maxColunas(el)) : +evo.passo;
    const ivC = D.intervalos(d, passo, co), ivT = D.intervalos(d, passo, tel);
    const n = ivC.length;
    if (evo.sel != null && !ivC.some(i => i.ini === evo.sel)) evo.sel = null;
    const iSel = evo.sel == null ? -1 : ivC.findIndex(i => i.ini === evo.sel);
    const dir = evo.dir;
    const temCO = dir !== 'TEL', temTEL = dir !== 'CO';

    // KPIs: sem seleção = acumulado do dia; com seleção = só o intervalo
    const aC = iSel >= 0 ? (ivC[iSel].v || null) : D.agregar(L, co);
    const aT = iSel >= 0 ? (ivT[iSel] && ivT[iSel].v || null) : D.agregar(L, tel);
    const kc = iSel >= 0 ? 'ksel' : '';
    const onde = iSel >= 0 ? 'no intervalo' : 'no dia';
    let k = '';
    if (iSel >= 0 && ivC[iSel].semColeta) k = `<div class="banner warn">${ivC[iSel].rot}: sem coleta neste horário — o volume entra no intervalo seguinte.</div>`;
    else if (dir === 'CO') {
      const eD = iSel >= 0 ? ivC[iSel].esp : D.espera(d.leituras, -1, L.m, co);
      k = kpi('Oferecidas', fI(aC.ofer), `atendidas ${fI(aC.atend)} ${onde}`, kc) + kpi('NS 300s', nsTx(aC.ns), `meta ${META_NS}%`, kc) +
        kpi('Abandonadas', fI(aC.aband), aC.abandPct == null ? '' : fP(aC.abandPct) + (iSel >= 0 ? ' das finalizadas' : ' das oferecidas'), kc) + kpi('TME', fS(aC.tme), 'TMA ' + fS(aC.tma), kc) +
        kpi('Pico em espera', eD ? fI(eD.pico) + (eD.pico === 1 ? ' técnico' : ' técnicos') : '—', eD && eD.pico ? 'às ' + D.hhmm(eD.picoM) + ' · até ' + minCurto(eD.espMax) : 'sem fila nas coletas', kc) +
        kpi('Atendidos direto', aC.dir60 == null ? '—' : fP(aC.dir60), 'em até 1 min ' + onde, kc);
    }
    else if (dir === 'TEL') k = kpi('Oferecidas TEL', fI(aT.ofer), onde, kc) + kpi('Média por intervalo', fI(media(ivT)), `${n} intervalo(s) de ${PASSO_NOME[passo]}`, kc);
    else k = kpi('Oferecidas URA', fI((aC ? aC.ofer : 0) + (aT ? aT.ofer : 0)), onde, kc) + kpi('CO', fI(aC.ofer), `NS ${aC.ns == null ? '—' : fP(aC.ns)}`, kc) +
      kpi('TEL', fI(aT.ofer), (aC.ofer + aT.ofer) ? fP(aT.ofer / (aC.ofer + aT.ofer) * 100) + ' do volume' : '', kc) + kpi('Abandonadas CO', fI(aC.aband), aC.abandPct == null ? '' : fP(aC.abandPct), kc);

    const rot = i => rotPasso(i.ini, passo);
    const tit = i => `${D.hhmm(i.ini)}–${D.hhmm(i.andamento ? i.ateM : i.fim)}${i.andamento ? ' (em andamento)' : ''}`;
    // 1) oferecidas
    const colsOf = ivC.map((c, i) => {
      const t = ivT[i];
      const base = { rot: rot(c), and: c.andamento, sd: c.semColeta, titulo: tit(c) };
      if (c.semColeta) return base;
      const vc = temCO ? c.v.ofer : 0, vt = temTEL && t && t.v ? t.v.ofer : 0;
      const segs = dir === 'CO' ? [{ v: c.v.ofer - Math.min(c.v.aband, c.v.ofer), cor: 'var(--sCO)' }, { v: Math.min(c.v.aband, c.v.ofer), cor: 'var(--sAb)' }]
        : [{ v: vc, cor: 'var(--sCO)' }, { v: vt, cor: 'var(--sTEL)' }];
      return Object.assign(base, { segs, lab: fI(vc + vt) });
    });
    const legOf = dir === 'CO' ? '<span><i style="background:var(--sCO)"></i>oferecidas</span><span><i style="background:var(--sAb)"></i>parte abandonada</span>'
      : (temCO ? '<span><i style="background:var(--sCO)"></i>CO</span>' : '') + '<span><i style="background:var(--sTEL)"></i>TEL</span>';
    const notas = [];
    if (ivC.some(i => i.andamento)) notas.push('<span><i class="and"></i>* em andamento (até a última coleta)</span>');
    if (ivC.some(i => i.semColeta)) notas.push('<span><i class="sd"></i>sem coleta (volume no intervalo seguinte)</span>');
    const capPadrao = ivC.length && ivC[0].incluiAntes ? `A 1ª coluna (${rot(ivC[0])}) inclui o que entrou antes da primeira coleta do dia.` : 'Toque numa coluna para selecionar · toque de novo para limpar.';
    const capSel = iSel >= 0 ? capIntervalo(ivC[iSel], ivT[iSel], dir) : capPadrao;
    const cap = `<div class="cap${iSel >= 0 ? ' capsel' : ''}">${capSel}</div>`;
    const graf = (titulo, svg, leg) => `<div class="card chart"><h2>${titulo}</h2>${svg}<div class="legend">${leg}${notas.join('')}</div>${cap}</div>`;

    let html = graf('Chamadas oferecidas por intervalo', G.barras({ cols: colsOf, sel: iSel, aria: 'Chamadas oferecidas por intervalo' }), legOf);
    if (temCO) {
      // técnicos em espera: pico do intervalo (retrato das coletas), cor pela espera mais longa
      const colsEsp = ivC.map(c => {
        const base = { rot: rot(c), and: c.andamento, titulo: tit(c) };
        if (!c.esp) return Object.assign(base, { sd: true });
        return Object.assign(base, { segs: [{ v: c.esp.pico, cor: corEspera(c.esp.espMax) }], lab: c.esp.pico ? fI(c.esp.pico) : '', ok: c.esp.pico === 0 });
      });
      html += graf('Técnicos em espera' + (dir === 'TODOS' ? ' · CO' : ''),
        G.barras({ cols: colsEsp, sel: iSel, aria: 'Técnicos em espera por intervalo' }),
        `<span><i style="background:var(--okc);border-radius:50%"></i>sem fila</span><span><i style="background:var(--p300)"></i>espera mais longa até 2 min</span><span><i style="background:var(--laranja)"></i>2 a 5 min</span><span><i style="background:var(--rosa)"></i>acima de 5 min</span>` +
        `<span>maior número de técnicos esperando ao mesmo tempo nas coletas do intervalo (${passo < 15 ? 'de 5 em 5 min' : 'horas fechadas: uma coleta a cada 15 min'})</span>`);
      // atendidos direto (em até 1 min)
      const colsDir = ivC.map(c => c.semColeta ? { rot: rot(c), sd: true, titulo: tit(c) } : {
        rot: rot(c), and: c.andamento, titulo: tit(c), segs: [{ v: c.v.dir60 == null ? 0 : c.v.dir60, cor: 'var(--sCO)' }], lab: c.v.dir60 == null ? '' : Math.round(c.v.dir60) + '%' });
      html += graf('Técnicos atendidos direto' + (dir === 'TODOS' ? ' · CO' : ''), G.barras({ cols: colsDir, max: 100, sel: iSel, aria: 'Atendidos em até 1 minuto' }),
        '<span><i style="background:var(--sCO)"></i>% das atendidas no intervalo que esperaram até 1 min</span>');
      // 2) NS do intervalo + NS acumulado do dia
      const acum = [];
      ivC.forEach(c => { const l = c.v ? d.leituras.find(x => x.m === c.ateM) : null; acum.push(l ? D.agregar(l, co).ns : null); });
      const colsNS = ivC.map(c => c.semColeta ? { rot: rot(c), sd: true, titulo: tit(c) } : {
        rot: rot(c), and: c.andamento, titulo: tit(c),
        segs: [{ v: c.v.ns == null ? 0 : c.v.ns, cor: corSit(situacao(c.v.ns)) }],
        lab: c.v.ns == null ? '' : Math.round(c.v.ns) + '%' });
      html += graf('Nível de serviço (300s) por intervalo' + (dir === 'TODOS' ? ' · CO' : ''),
        G.barras({ cols: colsNS, max: 100, meta: META_NS, metaTx: META_NS + '%', linha: acum, sel: iSel, aria: 'NS por intervalo' }),
        `<span><i style="background:var(--verdeS)"></i>Meta atingida</span><span><i style="background:var(--amareloS)"></i>Em atenção</span><span><i style="background:var(--vermelhoS)"></i>Crítico</span><span><i class="ln"></i>NS acumulado do dia (÷ oferecidas, como no Pulse)</span><span><i class="dash"></i>meta ${META_NS}%</span>` +
        '<span>colunas: atendidas em até 5 min ÷ chamadas finalizadas no intervalo (atendidas + abandonadas)</span>');
      // 3) abandono
      const colsAb = ivC.map(c => c.semColeta ? { rot: rot(c), sd: true, titulo: tit(c) } : {
        rot: rot(c), and: c.andamento, titulo: tit(c), segs: [{ v: c.v.abandPct || 0, cor: 'var(--sAb)' }], lab: c.v.abandPct == null ? '' : Math.round(c.v.abandPct) + '%' });
      html += graf('Abandono por intervalo' + (dir === 'TODOS' ? ' · CO' : ''), G.barras({ cols: colsAb, sel: iSel, aria: 'Abandono por intervalo' }),
        '<span><i style="background:var(--sAb)"></i>abandonadas ÷ chamadas finalizadas no intervalo</span>');
      // 4) TME
      const colsT = ivC.map(c => c.semColeta ? { rot: rot(c), sd: true, titulo: tit(c) } : {
        rot: rot(c), and: c.andamento, titulo: tit(c), segs: [{ v: c.v.tme || 0, cor: 'var(--sTme)' }], lab: c.v.tme == null ? '' : minCurto(c.v.tme) });
      html += graf('Tempo médio de espera (TME) por intervalo' + (dir === 'TODOS' ? ' · CO' : ''), G.barras({ cols: colsT, sel: iSel, aria: 'TME por intervalo' }),
        '<span><i style="background:var(--sTme)"></i>TME das chamadas atendidas no intervalo</span>');
    } else {
      html += `<div class="card"><p class="nota">A TEL é atendida em outro sistema: a URA registra só o volume encaminhado. Por isso não há NS, abandono nem tempos para a TEL.</p></div>`;
    }
    html += tabelaIntervalos(ivC, ivT, dir, passo, iSel);

    el.innerHTML = `
      <div class="card topbar">
        <div class="seg" role="tablist" aria-label="Atendimento">${[['CO', 'CO'], ['TEL', 'TEL'], ['TODOS', 'Total URA']].map(([v, t]) => `<button data-dir="${v}" class="${dir === v ? 'on' : ''}">${t}</button>`).join('')}</div>
        <div class="seg sm" role="tablist" aria-label="Intervalo do eixo">${['auto', 15, 30, 60, 120].map(p => `<button data-passo="${p}" class="${String(evo.passo) === String(p) ? 'on' : ''}">${PASSO_NOME[p]}</button>`).join('')}</div>
        <div class="meta-line"><span>Intervalos de ${PASSO_NOME[passo]}${evo.passo === 'auto' ? ' (automático)' : ''}</span><span>08:00–${esc(L.horario)}</span></div>
        ${iSel >= 0 ? `<button class="selchip" data-act="limpar"><span>Selecionado: <b>${tit(ivC[iSel])}</b> · toque para limpar</span><span aria-hidden="true">✕</span></button>` : ''}
      </div>
      <div class="chips" role="group" aria-label="Grupo">${[null, ...grpsDisp].map(g => `<button class="chip" data-grp="${esc(g || '')}" aria-pressed="${evo.grupo === g}">${esc(g || 'Todos os grupos')}</button>`).join('')}</div>
      <div class="kpis2">${k}</div>
      ${html}`;
  }
  // cor da fila pela espera mais longa (mesma régua da lista "Fila agora")
  const corEspera = s => s >= 300 ? 'var(--rosa)' : s >= 120 ? 'var(--laranja)' : 'var(--p300)';
  const media = iv => { const v = iv.filter(i => i.v && !i.andamento); return v.length ? v.reduce((s, i) => s + i.v.ofer, 0) / v.length : null; };
  // rótulo curto de tempo para as colunas: "45s", "4m49", "1h02"
  const minCurto = s => { s = Math.round(s); return s < 60 ? s + 's' : s < 3600 ? Math.floor(s / 60) + 'm' + String(s % 60).padStart(2, '0') : Math.floor(s / 3600) + 'h' + String(Math.floor(s % 3600 / 60)).padStart(2, '0'); };

  // skills agrupadas pelo nome simplificado da tradutora (o "nome de uso"); uma entrada pode juntar várias skills do Pulse
  function porSimpl(d, dir) {
    const m = new Map();
    D.filtro(d, { dir }).forEach(s => { const k = d.trad[s].SKILL_SIMPLIFICADO; if (!m.has(k)) m.set(k, []); m.get(k).push(s); });
    return m;
  }

  function capIntervalo(c, t, dir) {
    const p = `${D.hhmm(c.ini)}–${D.hhmm(c.andamento ? c.ateM : c.fim)}${c.andamento ? ' (em andamento)' : ''}`;
    if (c.semColeta) return `${p} — sem coleta neste horário.`;
    const extra = c.juntaAnterior ? ` · inclui o volume desde ${D.hhmm(c.baseM)} (horário sem coleta)` : c.incluiAntes ? ' · inclui o que entrou antes da primeira coleta' : '';
    if (dir === 'TEL') return `${p} — ${fI(t && t.v ? t.v.ofer : 0)} oferecidas TEL${extra}`;
    const fila = c.esp ? (c.esp.pico ? ` · pico de ${fI(c.esp.pico)} técnico(s) em espera às ${D.hhmm(c.esp.picoM)} (mais longa ${fS(c.esp.espMax)})` : ' · sem técnicos em espera nas coletas') : '';
    const co = `${fI(c.v.ofer)} oferecidas · ${fI(c.v.atend)} atendidas · ${fI(c.v.aband)} abandonadas · NS ${c.v.ns == null ? '—' : fP(c.v.ns)} · TME ${fS(c.v.tme)}${fila}`;
    return `${p} — ${dir === 'TODOS' ? 'CO: ' : ''}${co}${dir === 'TODOS' ? ` · TEL: ${fI(t && t.v ? t.v.ofer : 0)} oferecidas` : ''}${extra}`;
  }

  function tabelaIntervalos(ivC, ivT, dir, passo, iSel) {
    const linhas = ivC.map((c, i) => {
      const t = ivT[i], r = `${D.hhmm(c.ini)}${c.andamento ? '*' : ''}`;
      const cls = i === iSel ? ' class="sel"' : '';
      if (c.semColeta) return `<tr data-i="${i}"${cls}><td>${r}</td><td class="nd" colspan="${dir === 'TEL' ? 1 : dir === 'CO' ? 6 : 4}">sem coleta</td></tr>`;
      if (dir === 'TEL') return `<tr data-i="${i}"${cls}><td>${r}</td><td>${fI(t && t.v ? t.v.ofer : 0)}</td></tr>`;
      if (dir === 'CO') return `<tr data-i="${i}"${cls}><td>${r}</td><td>${fI(c.v.ofer)}</td><td>${fI(c.v.atend)}</td><td>${fI(c.v.aband)}</td><td>${nsTx(c.v.ns)}</td><td>${c.esp ? fI(c.esp.pico) : '—'}</td><td>${c.v.tme == null ? '—' : minCurto(c.v.tme)}</td></tr>`;
      return `<tr data-i="${i}"${cls}><td>${r}</td><td>${fI(c.v.ofer)}</td><td>${fI(t && t.v ? t.v.ofer : 0)}</td><td>${nsTx(c.v.ns)}</td><td>${fI(c.v.aband)}</td></tr>`;
    }).reverse().join('');
    const head = dir === 'TEL' ? '<th>Início</th><th>Oferecidas</th>' : dir === 'CO' ? '<th>Início</th><th>Ofer.</th><th>Atend.</th><th>Aband.</th><th>NS</th><th title="pico de técnicos em espera">Fila</th><th>TME</th>'
      : '<th>Início</th><th>CO</th><th>TEL</th><th>NS CO</th><th>Aband. CO</th>';
    return `<div class="card"><h2>Intervalos de ${PASSO_NOME[passo]} <small>· mais recente primeiro</small></h2><div class="tw"><table class="conf tsel" id="tIv"><thead><tr>${head}</tr></thead><tbody>${linhas}</tbody></table></div></div>`;
  }

  // ---------------------------------------------------------------- SKILLS
  function renderSkills() {
    const d = dados, L = ultima();
    const q = sk.q.trim().toLowerCase();
    const lista = [...porSimpl(d, sk.dir).entries()].filter(([nome, ss]) => {
      if (!q) return true;
      return ss.some(s => { const t = d.trad[s]; return [s, nome, t.SKILL_GRUPO, t.SKILL_SUBGRUPO, t.SKILL_TIPO_ATENDIMENTO, t.SKILL_PRODUTO].some(x => String(x || '').toLowerCase().includes(q)); });
    }).map(([nome, ss]) => ({ nome, ss, a: D.agregar(L, ss), t: d.trad[ss[0]] }));
    const totDir = D.agregar(L, D.filtro(d, { dir: sk.dir })).ofer;
    lista.sort((x, y) => y.a.ofer - x.a.ofer || x.nome.localeCompare(y.nome));
    const com = lista.filter(x => x.a.ofer > 0 || x.a.fila > 0), sem = lista.filter(x => !(x.a.ofer > 0 || x.a.fila > 0));
    const item = x => {
      const sit = situacao(x.a.ns);
      const cor = sk.dir === 'CO' ? corSit(sit) : 'var(--sTEL)';
      const dir = sk.dir === 'CO'
        ? `<b class="c-${sit || 'x'}">${x.a.ns == null ? '—' : fP(x.a.ns)}</b><small>${fI(x.a.ofer)} ofer.${x.a.fila ? ' · ' + fI(x.a.fila) + ' na fila' : ''}</small>`
        : `<b>${fI(x.a.ofer)}</b><small>${totDir ? fP(x.a.ofer / totDir * 100) : '—'} da TEL</small>`;
      return `<button class="fi" data-sk="${esc(x.nome)}" data-skd="${sk.dir}"><span class="bar" style="background:${x.a.ofer ? cor : 'var(--line)'}"></span>
        <span class="tx"><div class="nm">${esc(x.nome)}</div><div class="sb">${esc(x.t.SKILL_GRUPO)}${x.t.SKILL_TIPO_ATENDIMENTO ? ' · ' + esc(x.t.SKILL_TIPO_ATENDIMENTO) : ''}${x.ss.length > 1 ? ' · ' + x.ss.length + ' skills' : ''}</div></span>
        <span class="nv">${dir}</span></button>`;
    };
    $('#pgSkills').innerHTML = `
      <div class="tools">
        <div class="seg" role="tablist" aria-label="Atendimento">${['CO', 'TEL'].map(v => `<button data-skdir="${v}" class="${sk.dir === v ? 'on' : ''}">${v}</button>`).join('')}</div>
        <label class="srch"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><circle cx="11" cy="11" r="7"/><path d="m20 20-3.5-3.5"/></svg><input class="search" id="skQ" type="search" placeholder="Buscar skill, grupo, rede…" autocomplete="off" value="${esc(sk.q)}" aria-label="Buscar skill"></label>
      </div>
      <h2 class="sec">Com chamadas hoje <span class="ct num">${com.length}</span><span class="sp"></span><span class="rt">${sk.dir === 'CO' ? 'NS · oferecidas' : 'oferecidas'}</span></h2>
      <div class="fl">${com.length ? com.map(item).join('') : '<p class="nota" style="padding:4px">Nenhuma skill com chamadas.</p>'}</div>
      ${sem.length ? (sk.zeros ? `<h2 class="sec">Sem chamadas hoje <span class="ct num">${sem.length}</span></h2><div class="fl">${sem.map(item).join('')}</div>`
        : `<button class="zeros" data-act="zeros">Mostrar ${sem.length} skill(s) sem chamadas hoje</button>`) : ''}`;
  }

  // detalhe de uma skill simplificada (janela de baixo): soma das skills do Pulse que têm esse nome na tradutora
  function abrirSkill(nome, dirSk) {
    const d = dados, L = ultima();
    const ss = porSimpl(d, dirSk).get(nome);
    if (!ss) return;
    const t = d.trad[ss[0]];
    const a = D.agregar(L, ss);
    const isCO = dirSk === 'CO';
    const sh = $('#sheet');
    const largura = Math.min(760, window.innerWidth) - 60;
    const passo = D.passoAuto(d, Math.max(8, Math.min(24, Math.floor(largura / 27))));
    const iv = D.intervalos(d, passo, ss);
    const ewt = ss.map(s => L.v[s] && L.v[s].EWT).filter(x => x != null);
    const cols = iv.map(c => c.semColeta ? { rot: rotPasso(c.ini, passo), sd: true } : {
      rot: rotPasso(c.ini, passo), and: c.andamento, segs: isCO ? [{ v: c.v.ofer - Math.min(c.v.aband, c.v.ofer), cor: 'var(--sCO)' }, { v: Math.min(c.v.aband, c.v.ofer), cor: 'var(--sAb)' }] : [{ v: c.v.ofer, cor: 'var(--sTEL)' }],
      lab: fI(c.v.ofer) });
    const kp = isCO
      ? kpi('Oferecidas', fI(a.ofer), 'atendidas ' + fI(a.atend)) + kpi('NS 300s', nsTx(a.ns), `meta ${META_NS}%`) +
        kpi('Abandonadas', fI(a.aband), a.abandPct == null ? '' : fP(a.abandPct)) + kpi('TME', fS(a.tme), 'TMA ' + fS(a.tma)) +
        kpi('Em espera agora', fI(a.fila), a.fila ? 'mais antiga ' + fS(a.espMax) : 'nenhuma') + kpi('Agentes logados', fI(a.agMax), fI(a.dispMax) + ' disponíveis')
      : kpi('Oferecidas', fI(a.ofer), 'no dia') + kpi('EWT', ewtTx(ewt.length ? Math.min(...ewt) : null), 'espera estimada');
    // campos da tradutora: os comuns a todas as skills do grupo (os que variam aparecem na tabela de skills)
    const ign = new Set(['SKILL_SIMPLIFICADO']);
    const kv = Object.keys(t).filter(k => !ign.has(k)).map(k => {
      const vals = [...new Set(ss.map(s => d.trad[s][k]))];
      return `<dt>${esc(k.replace(/^SKILL_/, '').replace(/_/g, ' ').toLowerCase())}</dt><dd>${vals.map(esc).join(' / ')}</dd>`;
    }).join('');
    const linhas = ss.map(s => ({ s, a: D.agregar(L, [s]) })).sort((x, y) => y.a.ofer - x.a.ofer).map(x =>
      `<tr><td style="font-family:ui-monospace,Menlo,Consolas,monospace;font-size:11px;font-weight:600;word-break:break-all">${esc(D.curto(x.s))}</td><td>${fI(x.a.ofer)}</td>${isCO ? `<td>${nsTx(x.a.ns)}</td><td>${fI(x.a.fila)}</td>` : ''}</tr>`).join('');
    const tabSk = `<div class="card"><h2>Skills no Pulse <small>· ${ss.length}</small></h2><div class="tw"><table class="conf"><thead><tr><th>Skill</th><th>Ofer.</th>${isCO ? '<th>NS</th><th>Fila</th>' : ''}</tr></thead><tbody>${linhas}</tbody></table></div></div>`;
    sh.innerHTML = `<button class="fechar" data-act="fechar" aria-label="Fechar"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"><path d="M6 9l6 6 6-6"/></svg></button>
      <h3>${esc(nome)}</h3><div class="sub">${esc(dirSk)} · ${esc(t.SKILL_GRUPO)}${ss.length > 1 ? ' · ' + ss.length + ' skills do Pulse' : ' · ' + esc(ss[0])}</div>
      <div class="kpis2">${kp}</div>
      <div class="card chart"><h2>Oferecidas por intervalo <small>· ${PASSO_NOME[passo]}</small></h2>${G.barras({ cols, aria: 'Oferecidas por intervalo da skill' })}
        <div class="legend">${isCO ? '<span><i style="background:var(--sCO)"></i>oferecidas</span><span><i style="background:var(--sAb)"></i>parte abandonada</span>' : '<span><i style="background:var(--sTEL)"></i>oferecidas</span>'}</div>
        <div class="cap">Coleta das ${esc(L.horario)}.</div></div>
      ${ss.length > 1 ? tabSk : ''}
      <div class="card"><h2>Tradutora</h2><dl class="kv">${kv}</dl></div>`;
    sh.scrollTop = 0;
    sh.classList.add('show'); $('#sheetBg').classList.add('show');
  }
  function fecharSheet() { $('#sheet').classList.remove('show'); $('#sheetBg').classList.remove('show'); }

  // ---------------------------------------------------------------- eventos
  function irPara(p) { pagina = p; fecharSheet(); render(); window.scrollTo(0, 0); }
  document.addEventListener('click', e => {
    const b = e.target.closest('button, tr[data-grupo], tr[data-i], rect.hit');
    if (!b) { if (e.target.id === 'sheetBg') fecharSheet(); return; }
    if (b.closest('nav.tabs')) return irPara(b.dataset.v);
    if (b.id === 'btRefresh') { if (origem === 'arquivo') { origem = 'site'; } return carregar(true); }
    if (b.id === 'btArq' || b.dataset.act === 'arq') return $('#arq').click();
    if (b.dataset.act === 'fechar') return fecharSheet();
    if (b.dataset.act === 'limpar') { evo.sel = null; return redesenhar(); }
    if (b.dataset.act === 'zeros') { sk.zeros = true; return render(); }
    if (b.dataset.sk) return abrirSkill(b.dataset.sk, b.dataset.skd);
    if (b.dataset.dir && b.closest('#pgEvo')) { evo.dir = b.dataset.dir; evo.grupo = null; evo.sel = null; return redesenhar(); }
    if (b.dataset.passo) { evo.passo = b.dataset.passo === 'auto' ? 'auto' : +b.dataset.passo; gravarPref('passo', evo.passo); evo.sel = null; return redesenhar(); }
    if (b.dataset.grp != null && b.classList.contains('chip')) { evo.grupo = b.dataset.grp || null; evo.sel = null; return redesenhar(); }
    if (b.dataset.skdir) { sk.dir = b.dataset.skdir; sk.zeros = false; return render(); }
    if (b.matches('tr[data-grupo]')) { evo.dir = b.dataset.dir; evo.grupo = b.dataset.grupo; evo.sel = null; return irPara('evo'); }
    if (b.matches('rect.hit') && b.closest('#pgEvo') || b.matches('#tIv tr[data-i]')) {
      const iv = ivAtuais(); const i = +b.dataset.i; const c = iv[i];
      if (c) { evo.sel = evo.sel === c.ini ? null : c.ini; redesenhar(); }
    }
  });
  function ivAtuais() {
    const co = D.filtro(dados, { dir: 'CO', grupo: evo.grupo });
    const passo = evo.passo === 'auto' ? D.passoAuto(dados, maxColunas($('#pgEvo'))) : +evo.passo;
    return D.intervalos(dados, passo, co);
  }
  function redesenhar() { const y = window.scrollY; render(); window.scrollTo(0, y); }
  document.addEventListener('input', e => {
    if (e.target.id === 'skQ') {
      sk.q = e.target.value;
      const pos = e.target.selectionStart;
      renderSkills();
      const q = $('#skQ'); q.focus(); try { q.setSelectionRange(pos, pos); } catch (er) { /* type=search em alguns navegadores */ }
    }
  });
  document.addEventListener('keydown', e => { if (e.key === 'Escape') fecharSheet(); });
  $('#arq').addEventListener('change', e => { const f = e.target.files && e.target.files[0]; if (f) abrirArquivo(f); e.target.value = ''; });
  let largAnt = window.innerWidth;
  window.addEventListener('resize', () => { if (Math.abs(window.innerWidth - largAnt) > 40 && dados && pagina === 'evo') { largAnt = window.innerWidth; redesenhar(); } });

  // atualização automática: a cada 1 min (a coleta é de 5 em 5) e ao voltar para o app
  setInterval(() => { if (origem !== 'arquivo' && !document.hidden) carregar(false); }, 60000);
  setInterval(renderSync, 30000);
  document.addEventListener('visibilitychange', () => { if (!document.hidden && origem !== 'arquivo') carregar(false); });

  $('#ver').textContent = APP_VERSION;
  if ('serviceWorker' in navigator && location.protocol.startsWith('http')) {
    navigator.serviceWorker.register('sw.js').catch(() => { /* sem offline: o app funciona igual */ });
  }
  usarCopia();
  render();
  carregar(false);

  // para testes
  window.__ura = { versao: APP_VERSION, estado: () => ({ dados, origem, erroFonte, erroDados, pagina, evo, sk }) };
})();

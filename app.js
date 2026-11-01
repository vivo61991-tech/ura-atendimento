/* URA · Suporte B2C — telas (Agora, Evolução, Skills), leitura do arquivo e atualização automática. */
(function () {
  'use strict';
  const APP_VERSION = '1.9.0';
  const D = window.Dados, G = window.Graf, Hs = window.Historico;

  // ---------------------------------------------------------------- configuração
  const META_NS = 90;          // meta do NS (%) — mesma do painel de Nível de Serviço do B2C
  const LIM_ATENCAO = 70;      // abaixo da meta e acima disto: "Em atenção"; abaixo: "Crítico"
  const PARAM = new URLSearchParams(location.search);
  const FONTE = PARAM.get('arquivo') || 'pulse.json';   // arquivo publicado na raiz do site, ao lado do index.html
  const HIST_FONTE = PARAM.get('historico') || 'historico.csv';   // base Genesys (somas por skill a cada 15 min)
  const HIST_RECARGA_MIN = 60;                          // o histórico muda uma vez por dia: confere a cada 1 h
  const CK = 'ura-b2c:';                                // prefixo das chaves no localStorage
  const ATRASO_MIN = 15;                                // sem coleta nova há mais que isto (no expediente): aviso
  const STATUS = { VERDE: 'Meta atingida', AMARELO: 'Em atenção', VERMELHO: 'Crítico' };
  const PASSO_NOME = { auto: 'Auto', 15: '15 min', 30: '30 min', 60: '1 h', 120: '2 h' };
  const DS_CURTO = ['dom', 'seg', 'ter', 'qua', 'qui', 'sex', 'sáb'];
  const DS_PLURAL = ['domingos', 'segundas', 'terças', 'quartas', 'quintas', 'sextas', 'sábados'];

  // ---------------------------------------------------------------- estado
  let dados = null;            // dados normalizados em uso (sempre o último arquivo VÁLIDO)
  let origem = '';             // 'site' | 'copia' | 'arquivo'
  let nomeArq = '';
  let erroFonte = null;        // falha ao ler do site (rede/HTTP)
  let erroDados = null;        // arquivo recebido com problema (estrutura)
  let carregando = false;
  let pagina = 'agora';
  let hist = null;             // histórico lido (Historico.parse) — o último VÁLIDO
  let histErro = null;         // falha ao ler/entender o historico.csv
  let histCarregando = false;
  let histEm = 0;              // quando o histórico foi conferido pela última vez (ms)
  let histOrigem = '';         // 'site' | 'arquivo'
  // modo: 'int' = por intervalo (padrão, sempre ao abrir) | 'acum' = acumulado do dia
  // ctl: controles da Evolução abertos (começam sempre recolhidos)
  // fixo: controles + faixa de grupos presos no topo ao rolar (escolha lembrada no aparelho; só se troca com os controles abertos)
  // dia: null = o mais recente (ao vivo) | 'aaaa-mm-dd' = dia escolhido na navegação
  // cmp: comparação pela mediana — 'nao' | 'dias' (7 dias corridos) | 'sem' (7 mesmos dias da semana); lembrada no aparelho
  const evo = { dir: 'CO', passo: lerPref('passo', 'auto'), grupo: null, sel: null, modo: 'int', ctl: false, fixo: lerPref('fixo', false) === true,
    dia: null, cmp: ['nao', 'dias', 'sem'].includes(lerPref('cmp', 'nao')) ? lerPref('cmp', 'nao') : 'nao' };
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
  // Histórico: baixado no início e conferido a cada 1 h (o arquivo muda uma vez por dia). Se o arquivo novo vier com
  // problema, continua o último válido. Sem histórico o app funciona igual, só sem navegação e comparação.
  async function carregarHist(forcar) {
    if (histCarregando || histOrigem === 'arquivo' || !Hs) return;
    if (!forcar && hist && Date.now() - histEm < HIST_RECARGA_MIN * 60000) return;
    histCarregando = true;
    try {
      const r = await fetch(HIST_FONTE, { cache: 'no-cache' });
      if (!r.ok) throw new Error(r.status === 404 ? 'arquivo ' + HIST_FONTE + ' não encontrado no site' : 'o site respondeu ' + r.status);
      const txt = await r.text();
      const novo = Hs.parse(txt);
      hist = novo; histErro = null; histOrigem = 'site';
    } catch (e) {
      histErro = e.message || 'falha ao ler o histórico';
    } finally {
      histCarregando = false; histEm = Date.now();
      if (dados && pagina === 'evo') redesenhar(); else renderBanners();
    }
  }
  function abrirArquivo(file) {
    const fr = new FileReader();
    const csv = /\.(csv|txt)$/i.test(file.name);
    fr.onload = () => {
      if (csv) {
        // arquivo do histórico aberto do aparelho (para testes): vale até recarregar o app
        try { hist = Hs.parse(String(fr.result)); histErro = null; histOrigem = 'arquivo'; evo.dia = null; toast(`Histórico aberto: ${hist.lista.length} dias (${ddmmaaaa(hist.inicio)} a ${ddmmaaaa(hist.fim)}).`); }
        catch (e) { toast('Este histórico não serve: ' + e.message + '.'); }
        return render();
      }
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
  // Avisos laranja do topo podem ser fechados no X. Fica fechado enquanto o motivo for o mesmo
  // (mesmo dia dos dados, mesma última coleta, mesmo erro); se o motivo mudar, o aviso volta.
  // Vale até o app ser fechado. O aviso vermelho (arquivo com problema) não fecha.
  const avisosFechados = new Set();
  const aviso = (chave, html) => avisosFechados.has(chave) ? '' :
    `<div class="banner warn bx"><span>${html}</span><button class="bx-x" data-fecha-aviso="${esc(chave)}" aria-label="Fechar aviso" title="Fechar aviso"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.6" stroke-linecap="round" aria-hidden="true"><path d="M6 6l12 12M18 6 6 18"/></svg></button></div>`;
  function renderBanners() {
    const b = [];
    if (erroDados) b.push(`<div class="banner bad"><b>O arquivo recebido tem problema:</b> ${esc(erroDados)}. ${dados ? 'Continuo mostrando os últimos dados válidos (coleta das ' + esc(ultima().horario) + ').' : ''}</div>`);
    if (erroFonte && origem !== 'arquivo') b.push(aviso('fonte:' + erroFonte, `Não consegui ler os dados do site (${esc(erroFonte)}).${dados ? ' Mostrando a última cópia guardada no aparelho.' : ''}`));
    if (origem === 'arquivo') b.push(`<div class="banner info">Mostrando o arquivo <b>${esc(nomeArq)}</b> aberto do aparelho. A atualização automática fica pausada; toque em ↻ para voltar aos dados do site.</div>`);
    if (dados && dados.dia !== hojeISO()) b.push(aviso('dia:' + dados.dia, `Estes dados são de <b>${ddmmaaaa(dados.dia)}</b>, não de hoje.`));
    const at = atrasado();
    if (at && origem !== 'arquivo') b.push(aviso('atraso:' + dados.dia + ultima().horario, `Sem coleta nova há ${at} min. Os números podem estar desatualizados.`));
    $('#banners').innerHTML = b.filter(Boolean).join('');
    const av = (dados ? dados.avisos : []).concat(hist ? hist.avisos : []);
    $('#avisos').innerHTML = av.length ? `<div class="banner warn"><b>Avisos do arquivo</b><br>${av.map(esc).join('<br>')}</div>` : '';
    $('#footDia').textContent = dados ? ' · dados de ' + ddmmaaaa(dados.dia) : '';
  }

  // ---------------------------------------------------------------- render geral
  function render() {
    renderSync(); renderBanners(); medirTopo();
    ['agora', 'evo', 'skills'].forEach(p => { $('#pg' + p[0].toUpperCase() + p.slice(1)).hidden = p !== pagina; });
    document.querySelectorAll('nav.tabs button').forEach(b => b.classList.toggle('on', b.dataset.v === pagina));
    if (!dados) { $('#pg' + pagina[0].toUpperCase() + pagina.slice(1)).innerHTML = vazio(); return; }
    if (pagina === 'agora') renderAgora();
    else if (pagina === 'evo') {
      // a faixa de grupos é redesenhada a cada atualização: guarda a rolagem para não "pular" para o início
      const fx = $('#pgEvo .chips'), antes = fx ? fx.scrollLeft : 0;
      renderEvo();
      posicionarGrupos(antes, chipAnimar); chipAnimar = false;
    }
    else renderSkills();
  }
  function vazio() {
    return `<div class="card vazio"><svg width="46" height="46" viewBox="0 0 24 24" fill="none" stroke="var(--p300)" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M4 20h16a1 1 0 0 0 1-1V8a1 1 0 0 0-1-1h-8l-2-3H4a1 1 0 0 0-1 1v14a1 1 0 0 0 1 1z"/></svg>
      <p>${carregando ? 'Carregando os dados…' : 'Ainda não há dados para mostrar.<br>O app procura o arquivo <b>' + esc(FONTE) + '</b> no site; para testar, abra um arquivo JSON da coleta.'}</p>
      <button class="bt" data-act="arq">Abrir arquivo JSON</button></div>`;
  }

  // seta de recolher/abrir os controles da Evolução (canto inferior direito do cartão)
  const setaCtl = aberto => `<button class="ctl-seta" data-act="ctl" aria-expanded="${aberto}" aria-label="${aberto ? 'Recolher' : 'Mostrar'} os controles" title="${aberto ? 'Recolher' : 'Mostrar'} os controles"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.6" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="${aberto ? 'M6 15l6-6 6 6' : 'M6 9l6 6 6-6'}"/></svg></button>`;

  // alfinete de fixar os controles (só aparece com os controles abertos), à esquerda da seta
  const pinoCtl = () => `<button class="ctl-pino${evo.fixo ? ' on' : ''}" data-act="fixar" aria-pressed="${evo.fixo}" aria-label="${evo.fixo ? 'Soltar' : 'Fixar'} os controles no topo" title="${evo.fixo ? 'Soltar' : 'Fixar'} os controles no topo"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path class="pc" d="M9 3h6l-1 6 3 3v2H7v-2l3-3z"/><path d="M12 14v7"/></svg></button>`;
  // altura do topo roxo: os controles fixados ficam presos logo abaixo dele
  function medirTopo() { const h = document.querySelector('header.top'); if (h) document.documentElement.style.setProperty('--topo', h.offsetHeight + 'px'); }

  // Faixa de grupos da Evolução: o grupo selecionado corre para a esquerda e fica como o primeiro visível;
  // sem grupo, volta para o início ("Todos os grupos"). Se o grupo estiver no fim da faixa, um respiro à direita
  // deixa ele chegar até a esquerda.
  let chipAnimar = false;
  function posicionarGrupos(de, animar) {
    const fx = $('#pgEvo .chips'); if (!fx) return;
    fx.style.paddingRight = '';
    fx.scrollLeft = de || 0;
    const sel = evo.grupo ? fx.querySelector('.chip[aria-pressed="true"]') : null;
    let alvo = 0;
    if (sel) {
      alvo = Math.max(0, fx.scrollLeft + sel.getBoundingClientRect().left - fx.getBoundingClientRect().left);
      const max = fx.scrollWidth - fx.clientWidth;
      if (alvo > max) fx.style.paddingRight = Math.ceil(alvo - max) + 'px';
    }
    const suave = animar && !(window.matchMedia && matchMedia('(prefers-reduced-motion: reduce)').matches);
    fx.scrollTo({ left: alvo, behavior: suave ? 'smooth' : 'auto' });
  }

  // larguras: quantas colunas cabem sem poluir
  function maxColunas(el) {
    const w = (el && el.clientWidth) || Math.min(760, window.innerWidth) - 56;
    return Math.max(8, Math.min(24, Math.floor(w / 27)));
  }
  // cartão de gráfico: legenda e explicações ficam escondidas atrás do botão (i), no canto inferior direito.
  // Só um aberto por vez (abrir outro fecha o anterior); o aberto continua aberto quando a tela se redesenha.
  let infoAberto = null;
  const ICONE_INFO = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><circle cx="12" cy="12" r="9.5"/><path d="M12 11v6"/><path d="M12 7.4h.01" stroke-width="2.8"/></svg>';
  // filtro: texto discreto à esquerda do (i), na mesma linha (ex.: "CO – MANOBRA"); vazio = nada
  function cartaoGraf(id, titulo, svg, info, fixo, filtro) {
    const ab = infoAberto === id;
    return `<div class="card chart" data-ch="${id}"><h2>${titulo}</h2>${svg}
      <div class="ch-pe">${fixo || ''}<div class="ch-base">${filtro ? `<span class="ch-filtro" title="Filtro aplicado">${esc(filtro)}</span>` : ''}<button class="info" data-info="${id}" aria-expanded="${ab}" aria-controls="inf-${id}" aria-label="${ab ? 'Esconder' : 'Mostrar'} a explicação do gráfico" title="Explicação do gráfico">${ICONE_INFO}</button></div></div>
      <div class="ch-info" id="inf-${id}"${ab ? '' : ' hidden'}>${info}</div></div>`;
  }
  function alternarInfo(id) {
    infoAberto = infoAberto === id ? null : id;
    document.querySelectorAll('button.info[data-info]').forEach(b => {
      const ab = b.dataset.info === infoAberto;
      b.setAttribute('aria-expanded', ab); b.setAttribute('aria-label', (ab ? 'Esconder' : 'Mostrar') + ' a explicação do gráfico');
      const p = document.getElementById('inf-' + b.dataset.info); if (p) p.hidden = !ab;
    });
  }
  const kpi = (l, v, s, cls, r) => `<div class="kpi${cls ? ' ' + cls : ''}"><div class="l">${l}</div><div class="v">${v}</div><div class="s">${s || '&nbsp;'}</div>${r ? `<div class="r">${r}</div>` : ''}</div>`;
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
        <div><div class="lbl">NS <span class="un">5 min</span> · CO</div><div class="big num c-${sit || 'x'}">${a.ns == null ? '—' : fP(a.ns)}</div></div>
        <div class="dir">
          <div>${sit ? `<span class="pill st-${sit}">${STATUS[sit]}</span>` : '<span class="pill" style="background:var(--grid)">Sem chamadas</span>'}</div>
          <div class="prog" aria-hidden="true"><i style="width:${pctBar}%;background:${corSit(sit)}"></i><b style="left:calc(${META_NS}% - 1px)"></b></div>
          <div class="meta">meta ${META_NS}% · ${fI(a.a300)} de ${fI(a.ofer)} oferecidas atendidas em até 5&nbsp;min</div>
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
    const tabCO = `<div class="card"><h2>CO por grupo <small>· toque para ver a evolução</small></h2>${tabGrupos(['Ofer.', 'NS', 'Aband.', 'TME'],
      gCO.map(g => ({ nome: g.nome, dir: 'CO', v: [fI(g.a.ofer), nsTx(g.a.ns), g.a.abandPct == null ? '—' : fP(g.a.abandPct), fS(g.a.tme)] })),
      { nome: 'Total CO', v: [fI(a.ofer), nsTx(a.ns), a.abandPct == null ? '—' : fP(a.abandPct), fS(a.tme)] })}</div>`;

    // TEL
    const gTEL = grupos(d, tel, L);
    const kt = `<div class="kpis2">
      ${kpi('Oferecidas TEL', fI(t.ofer), totURA ? fP(t.ofer / totURA * 100) + ' do volume da URA' : '')}
      ${kpi('Últimos 15 min', u15t ? fI(u15t.v.ofer) : '—', u15t ? `${u15t.rot}–${D.hhmm(u15t.ateM)}` : '')}
    </div>`;
    const tabTEL = `<div class="card"><h2>TEL por grupo <small>· toque para ver a evolução</small></h2>${tabGrupos(['Ofer.', '% TEL'],
      gTEL.map(g => ({ nome: g.nome, dir: 'TEL', v: [fI(g.a.ofer), t.ofer ? fP(g.a.ofer / t.ofer * 100) : '—'] })),
      { nome: 'Total TEL', v: [fI(t.ofer), t.ofer ? '100,0%' : '—'] })}
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

  // Tabela de grupos responsiva (grade, não <table>): na tela larga, uma linha por grupo; na estreita,
  // TODAS as linhas viram duas — nome em cima (sem quebrar) e os números embaixo, nas mesmas colunas do cabeçalho.
  function tabGrupos(cab, linhas, total) {
    const lin = (r, cls, attrs) => `<div class="tg-r${cls}"${attrs}><span class="nm">${esc(r.nome)}</span>${r.v.map(x => `<span class="v">${x}</span>`).join('')}</div>`;
    return `<div class="tg" style="--n:${cab.length}" role="table">
      <div class="tg-r tg-h" role="row"><span class="nm">Grupo</span>${cab.map(c => `<span class="v">${c}</span>`).join('')}</div>
      ${linhas.map(r => lin(r, ' tg-a', ` role="button" tabindex="0" data-grupo="${esc(r.nome)}" data-dir="${r.dir}"`)).join('')}
      ${lin(total, ' tot', '')}</div>`;
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
    return cartaoGraf('agora-hora', tit, G.barras({ cols, maxRot: 12, rotulos: true, aria: 'Chamadas oferecidas na hora atual' }),
      '<div class="legend"><span><i style="background:var(--sCO)"></i>CO</span><span><i style="background:var(--sTEL)"></i>TEL</span><span><i class="and"></i>intervalo em andamento</span></div>' +
      '<div class="cap">Chamadas oferecidas em cada intervalo. As horas anteriores ficam guardadas de 15 em 15 min (aba Evolução).</div>');
  }

  function grupos(d, skills, L) {
    const m = new Map();
    skills.forEach(s => { const g = d.trad[s].SKILL_GRUPO; if (!m.has(g)) m.set(g, []); m.get(g).push(s); });
    return [...m.entries()].map(([nome, ss]) => ({ nome, ss, a: D.agregar(L, ss) })).sort((x, y) => y.a.ofer - x.a.ofer || x.nome.localeCompare(y.nome));
  }

  // ---------------------------------------------------------------- EVOLUÇÃO
  // ---------------------------------------------------------------- dia da Evolução (ao vivo ou do histórico)
  // Dias disponíveis = os do histórico + o dia do Pulse. O dia do Pulse vem "ao vivo" (com fila); se ele já passou e o
  // histórico tem o dia completo, vale o histórico (o Pulse pode ter parado no meio do dia).
  function diasDisp() {
    const c = new Set(hist ? hist.lista : []);
    if (dados) c.add(dados.dia);
    return [...c].sort();
  }
  const usaPulse = iso => !!dados && iso === dados.dia && !(dados.dia !== hojeISO() && hist && hist.dias.has(iso));
  function diaEvo() {
    const lista = diasDisp();
    if (evo.dia && !lista.includes(evo.dia)) evo.dia = null;
    const alvo = evo.dia || lista[lista.length - 1];
    if (!hist || usaPulse(alvo)) return { d: dados, iso: dados.dia, vivo: true, lista, i: lista.indexOf(dados.dia) };
    return { d: Hs.diaComoDados(hist, alvo, dados.trad), iso: alvo, vivo: false, lista, i: lista.indexOf(alvo) };
  }
  // nome da comparação: "7 sextas", "5 sextas" (perto do início do histórico), "7 dias"
  function nomeCmp(iso, n, curto) {
    if (evo.cmp === 'dias') return n + ' dias';
    const w = Hs.diaSemana(iso);
    return n + ' ' + (curto ? DS_CURTO[w] : n === 1 ? DS_PLURAL[w].slice(0, -1) : DS_PLURAL[w]);
  }
  // Mediana do histórico para o dia em exibição: mesmos filtros, mesmo eixo e mesmo modo (intervalo/acumulado).
  // Lm: horário da última leitura do dia em exibição — os cards comparam "o dia até agora" com os outros dias até a mesma hora.
  function comparacao(iso, passo, acum, Lm) {
    if (evo.cmp === 'nao' || !hist) return null;
    const refs = Hs.referencias(hist, iso, evo.cmp);
    const porRef = refs.map(r => {
      const dR = Hs.diaComoDados(hist, r, dados.trad);
      const coR = D.filtro(dR, { dir: 'CO', grupo: evo.grupo }), telR = D.filtro(dR, { dir: 'TEL', grupo: evo.grupo });
      let ivC = D.intervalos(dR, passo, coR), ivT = D.intervalos(dR, passo, telR);
      if (acum) { ivC = D.acumulados(dR, ivC, coR); ivT = D.acumulados(dR, ivT, telR); }
      const lAte = [...dR.leituras].reverse().find(l => l.m <= Lm) || dR.leituras[0];
      return { ivC: new Map(ivC.map(c => [c.ini, c])), ivT: new Map(ivT.map(c => [c.ini, c])), diaC: D.agregar(lAte, coR), diaT: D.agregar(lAte, telR) };
    });
    return { refs, porRef, nome: nomeCmp(iso, refs.length), curto: nomeCmp(iso, refs.length, true) };
  }
  const medCol = (cmp, c, f) => !cmp || !cmp.porRef.length || !c || c.andamento || c.semColeta ? null :
    Hs.mediana(cmp.porRef.map(r => { const x = r.ivC.get(c.ini), y = r.ivT.get(c.ini); return x && x.v ? f(x.v, y && y.v) : null; }));
  const medDia = (cmp, f) => !cmp || !cmp.porRef.length ? null : Hs.mediana(cmp.porRef.map(r => f(r.diaC, r.diaT)));
  // diferença para a mediana: % em volumes e tempos; pontos percentuais (p.p.) em percentuais
  function difTx(atual, ref, pp) {
    if (atual == null || ref == null) return '';
    if (pp) { const x = atual - ref; return `${x > 0 ? '+' : x < 0 ? '−' : '±'}${Math.abs(x).toLocaleString('pt-BR', { maximumFractionDigits: 1, minimumFractionDigits: 1 })} p.p.`; }
    if (!ref) return '';
    const x = (atual / ref - 1) * 100;
    return `${x > 0 ? '+' : x < 0 ? '−' : '±'}${Math.abs(x).toLocaleString('pt-BR', { maximumFractionDigits: 0 })}%`;
  }

  // barra de data da Evolução: ‹ dia ›, seletor de data e "Hoje"/"Último"
  function navDia(ctx) {
    const { lista, i } = ctx, ult = lista[lista.length - 1];
    const w = Hs ? Hs.diaSemana(ctx.iso) : 0;
    const fonte = ctx.vivo ? (ctx.iso === hojeISO() ? 'ao vivo · Pulse' : 'Pulse') : 'histórico · Genesys';
    const st = !hist && histCarregando ? 'carregando histórico…' : !hist && histErro ? 'sem histórico: ' + histErro : fonte;
    const seta = dz => `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.6" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="${dz}"/></svg>`;
    return `<div class="dnav${ctx.vivo ? '' : ' hist'}">
      <button class="dn-b" data-navdia="-1"${i > 0 ? '' : ' disabled'} aria-label="Dia anterior">${seta('M15 6l-6 6 6 6')}</button>
      <label class="dn-d"><span class="dn-t"><b>${DS_CURTO[w]}, ${ddmmaaaa(ctx.iso).slice(0, 5)}</b><small>${esc(st)}</small></span>
        <input type="date" id="dnData" min="${lista[0]}" max="${ult}" value="${ctx.iso}" aria-label="Escolher o dia"></label>
      <button class="dn-b" data-navdia="1"${i < lista.length - 1 ? '' : ' disabled'} aria-label="Próximo dia">${seta('M9 6l6 6-6 6')}</button>
      ${i < lista.length - 1 ? `<button class="dn-hoje" data-navdia="fim">${ult === hojeISO() ? 'Hoje' : 'Último'}</button>` : ''}
    </div>`;
  }

  function renderEvo() {
    const ctx = diaEvo(), d = ctx.d, L = d.leituras[d.leituras.length - 1];
    const filtroDir = dir => D.filtro(d, { dir, grupo: evo.grupo });
    // grupos do atendimento escolhido, com as oferecidas do dia (prévia do volume): maior volume primeiro, zerados no fim
    const volGrp = new Map();
    D.filtro(d, { dir: evo.dir }).forEach(s => { const g = d.trad[s].SKILL_GRUPO; volGrp.set(g, (volGrp.get(g) || 0) + ((L.v[s] && L.v[s].Distinct_Entered) || 0)); });
    const grpsDisp = [...volGrp.keys()].sort((a, b) => volGrp.get(b) - volGrp.get(a) || a.localeCompare(b));
    const volTodos = [...volGrp.values()].reduce((a, b) => a + b, 0);
    if (evo.grupo && !grpsDisp.includes(evo.grupo)) evo.grupo = null;
    const co = filtroDir('CO'), tel = filtroDir('TEL');
    const el = $('#pgEvo');
    const passo = evo.passo === 'auto' ? D.passoAuto(d, maxColunas(el)) : +evo.passo;
    const acum = evo.modo === 'acum';
    let ivC = D.intervalos(d, passo, co), ivT = D.intervalos(d, passo, tel);
    if (acum) { ivC = D.acumulados(d, ivC, co); ivT = D.acumulados(d, ivT, tel); }
    const n = ivC.length;
    const fimDe = c => c.andamento ? c.ateM : c.fim;
    const suf = acum ? ' <small>· acumulado</small>' : '';
    if (evo.sel != null && !ivC.some(i => i.ini === evo.sel)) evo.sel = null;
    const iSel = evo.sel == null ? -1 : ivC.findIndex(i => i.ini === evo.sel);
    const dir = evo.dir;
    const temCO = dir !== 'TEL', temTEL = dir !== 'CO';

    // no acumulado, a coluna leva o horário do FIM (total do dia até ali)
    const rot = i => acum ? (i.andamento ? D.hhmm(i.ateM) : rotPasso(i.fim, passo)) : rotPasso(i.ini, passo);
    const tit = i => acum ? `Acumulado até ${D.hhmm(fimDe(i))}${i.andamento ? ' (em andamento)' : ''}` : `${D.hhmm(i.ini)}–${D.hhmm(fimDe(i))}${i.andamento ? ' (em andamento)' : ''}`;
    // Números dos botões de grupo: sem seleção = oferecidas do dia; com coluna selecionada = oferecidas DAQUELA coluna
    // (no intervalo, ou acumuladas até ela no modo Acumulado). A ordem dos botões continua pelo volume do dia.
    const chipVol = new Map();
    let chipTodos = 0, ondeChip = 'no dia';
    if (iSel >= 0) {
      const c = ivC[iSel];
      ondeChip = acum ? 'até ' + D.hhmm(fimDe(c)) : D.hhmm(c.ini) + '–' + D.hhmm(fimDe(c));
      const lFim = c.semColeta ? null : d.leituras.find(x => x.m === c.ateM);
      const lIni = !acum && c.baseM != null ? d.leituras.find(x => x.m === c.baseM) : null;
      const de = (l, sk) => l && l.v[sk] ? (l.v[sk].Distinct_Entered || 0) : 0;
      if (!lFim) { chipTodos = null; grpsDisp.forEach(g => chipVol.set(g, null)); }
      else {
        D.filtro(d, { dir: evo.dir }).forEach(sk => { const g = d.trad[sk].SKILL_GRUPO; chipVol.set(g, (chipVol.get(g) || 0) + Math.max(0, de(lFim, sk) - de(lIni, sk))); });
        chipTodos = [...chipVol.values()].reduce((a, b) => a + b, 0);
      }
    } else { grpsDisp.forEach(g => chipVol.set(g, volGrp.get(g))); chipTodos = volTodos; }
    const cmp = comparacao(ctx.iso, passo, acum, L.m);
    const temCmp = !!(cmp && cmp.porRef.length);
    // controles recolhidos: só o que está escolhido, numa linha (com comparação, rótulos mais curtos para caber)
    const resumoCtl = [{ CO: 'CO', TEL: 'TEL', TODOS: 'Total URA' }[dir], acum ? (cmp ? 'Acum.' : 'Acumulado') : (cmp ? 'Intervalo' : 'Por intervalo'),
      evo.passo === 'auto' ? (cmp ? 'Auto' : 'Auto · ' + PASSO_NOME[passo]) : PASSO_NOME[passo]].concat(cmp ? ['vs ' + nomeCmp(ctx.iso, 7, true)] : []);
    // KPIs: sem seleção = acumulado do dia; com seleção = só o intervalo
    const aC = iSel >= 0 ? (ivC[iSel].v || null) : D.agregar(L, co);
    const aT = iSel >= 0 ? (ivT[iSel] && ivT[iSel].v || null) : D.agregar(L, tel);
    const kc = iSel >= 0 ? 'ksel' : '';
    const onde = iSel >= 0 ? (acum ? 'até ' + D.hhmm(fimDe(ivC[iSel])) : 'no intervalo') : 'no dia';
    // mediana para os cards: com coluna selecionada, a da coluna; sem seleção, a do dia até o mesmo horário
    const kRef = f => !temCmp ? null : iSel >= 0 ? medCol(cmp, ivC[iSel], f) : medDia(cmp, f);
    const kR = (f, fmt, atual, pp) => { if (!temCmp) return ''; const r = kRef(f); return `med. ${esc(cmp.curto)}: <b>${r == null ? '—' : fmt(r)}</b> <span class="df">${r == null ? '' : difTx(atual, r, pp)}</span>`; };
    let k = '';
    if (iSel >= 0 && ivC[iSel].semColeta) k = `<div class="banner warn">${rot(ivC[iSel])}: sem coleta neste horário${acum ? '.' : ' — o volume entra no intervalo seguinte.'}</div>`;
    else if (dir === 'CO') {
      const eD = iSel >= 0 ? ivC[iSel].esp : D.espera(d.leituras, -1, L.m, co);
      // o histórico não tem fila: no lugar do "Pico em espera" entram as atendidas
      const kFila = ctx.vivo
        ? kpi('Pico em espera', eD ? fI(eD.pico) + (eD.pico === 1 ? ' técnico' : ' técnicos') : '—', eD && eD.pico ? 'às ' + D.hhmm(eD.picoM) + ' · até ' + minCurto(eD.espMax) : 'sem fila nas coletas', kc)
        : kpi('Atendidas', fI(aC.atend), aC.ofer ? fP(aC.atend / aC.ofer * 100) + ' das oferecidas' : '', kc, kR(v => v.atend, fI, aC.atend));
      k = kpi('Oferecidas', fI(aC.ofer), `atendidas ${fI(aC.atend)} ${onde}`, kc, kR(v => v.ofer, fI, aC.ofer)) +
        kpi('NS 5 min', nsTx(aC.ns), `meta ${META_NS}%`, kc, kR(v => v.ns, x => fP(x), aC.ns, true)) +
        kpi('Abandonadas', fI(aC.aband), aC.abandPct == null ? '' : fP(aC.abandPct) + (iSel >= 0 && !acum ? ' das finalizadas' : ' das oferecidas'), kc, kR(v => v.aband, fI, aC.aband)) +
        kpi('TME', fS(aC.tme), 'TMA ' + fS(aC.tma), kc, kR(v => v.tme, fS, aC.tme)) + kFila +
        kpi('Atendidos direto', aC.dir60 == null ? '—' : fP(aC.dir60), 'em até 1&nbsp;min ' + onde, kc, kR(v => v.dir60, x => fP(x), aC.dir60, true));
    }
    else if (dir === 'TEL') k = kpi('Oferecidas TEL', fI(aT.ofer), onde, kc, kR((v, t) => t ? t.ofer : 0, fI, aT.ofer)) + kpi('Média por intervalo', fI(media(ivT)), `${n} intervalo(s) de ${PASSO_NOME[passo]}`, kc);
    else k = kpi('Oferecidas URA', fI((aC ? aC.ofer : 0) + (aT ? aT.ofer : 0)), onde, kc, kR((v, t) => v.ofer + (t ? t.ofer : 0), fI, (aC ? aC.ofer : 0) + (aT ? aT.ofer : 0))) + kpi('CO', fI(aC.ofer), `NS ${aC.ns == null ? '—' : fP(aC.ns)}`, kc, kR(v => v.ofer, fI, aC.ofer)) +
      kpi('TEL', fI(aT.ofer), (aC.ofer + aT.ofer) ? fP(aT.ofer / (aC.ofer + aT.ofer) * 100) + ' do volume' : '', kc, kR((v, t) => t ? t.ofer : 0, fI, aT.ofer)) + kpi('Abandonadas CO', fI(aC.aband), aC.abandPct == null ? '' : fP(aC.abandPct), kc, kR(v => v.aband, fI, aC.aband));

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
    if (ivC.some(i => i.semColeta)) notas.push(`<span><i class="sd"></i>${acum ? 'sem coleta neste horário' : 'sem coleta (volume no intervalo seguinte)'}</span>`);
    if (cmp) notas.push(temCmp
      ? `<span><i class="ref"></i>mediana ${evo.cmp === 'sem' ? 'das últimas ' : 'dos últimos '}${esc(cmp.nome)} do histórico (${cmp.refs.map(r => ddmmaaaa(r).slice(0, 5)).join(', ')})${ivC.some(i => i.andamento) ? ' · sem mediana na coluna em andamento' : ''}</span>`
      : '<span>sem dias anteriores no histórico para comparar</span>');
    const capPadrao = !acum && ivC.length && ivC[0].incluiAntes ? `A 1ª coluna (${rot(ivC[0])}) inclui o que entrou antes da primeira coleta do dia.` : 'Toque numa coluna para selecionar · toque de novo para limpar.';
    // o resumo do intervalo selecionado fica sempre à vista, centralizado, só com os valores DAQUELE gráfico;
    // legenda e explicações ficam no botão (i)
    const selTx = (tipo, extra) => iSel >= 0 ? capGraf(tipo, ivC[iSel], ivT[iSel], dir, extra) : '';
    // mediana da coluna selecionada no resumo de cada gráfico
    const refSel = (f, fmt, atual, pp) => {
      if (!temCmp || iSel < 0) return null;
      const c = ivC[iSel], r = medCol(cmp, c, f);
      if (c.andamento) return `mediana ${esc(cmp.nome)}: só para colunas fechadas`;
      return `mediana ${esc(cmp.nome)}: <b>${r == null ? '—' : fmt(r)}</b>${r == null ? '' : ' ' + difTx(atual, r, pp)}`;
    };
    const cS = iSel >= 0 ? ivC[iSel] : null, tS = iSel >= 0 ? ivT[iSel] : null, vS = cS && cS.v, vT = tS && tS.v;
    const fOf = (v, t) => dir === 'CO' ? v.ofer : dir === 'TEL' ? (t ? t.ofer : 0) : v.ofer + (t ? t.ofer : 0);
    const fAb = v => acum ? v.aband : v.abandPct;
    const refArr = f => temCmp ? ivC.map(c => medCol(cmp, c, f)) : null;
    const dica = `<div class="cap">${acum ? 'Modo acumulado: cada coluna mostra o total do dia até o horário dela. ' : ''}${capPadrao}${!acum && ivC.length && ivC[0].incluiAntes ? ' Toque numa coluna para selecionar · toque de novo para limpar.' : ''}</div>`;
    let nGraf = 0;
    // filtro aplicado, mostrado no rodapé de cada gráfico:
    //   CO ou TEL → "CO"; com grupo → "CO – GRUPO"; Total URA → nada; Total URA com grupo → "GRUPO",
    //   ou "CO – GRUPO"/"TEL – GRUPO" quando o grupo só existe num dos dois atendimentos
    let filtroTx = '';
    if (dir !== 'TODOS') filtroTx = dir + (evo.grupo ? ' – ' + evo.grupo : '');
    else if (evo.grupo) {
      const ds = [...new Set(D.filtro(d, { dir: 'TODOS', grupo: evo.grupo }).map(s => d.trad[s].DIRECIONAMENTO))];
      filtroTx = (ds.length === 1 ? ds[0] + ' – ' : '') + evo.grupo;
    }
    const graf = (titulo, svg, leg, tipo, extra) => cartaoGraf('evo-' + tipo, titulo, svg, `<div class="legend">${leg}${notas.join('')}</div>${dica}`, selTx(tipo, extra), filtroTx);

    let html = graf((acum ? 'Chamadas oferecidas' : 'Chamadas oferecidas por intervalo') + suf, G.barras({ cols: colsOf, sel: iSel, ref: refArr(fOf), aria: 'Chamadas oferecidas' }), legOf, 'of',
      { refHtml: vS ? refSel(fOf, fI, fOf(vS, vT)) : null });
    if (temCO) {
      // técnicos em espera: pico do intervalo (retrato das coletas), cor pela espera mais longa
      if (ctx.vivo) {
      const colsEsp = ivC.map(c => {
        const base = { rot: rot(c), and: c.andamento, titulo: tit(c) };
        if (!c.esp) return Object.assign(base, { sd: true });
        return Object.assign(base, { segs: [{ v: c.esp.pico, cor: corEspera(c.esp.espMax) }], lab: c.esp.pico ? fI(c.esp.pico) : '', ok: c.esp.pico === 0 });
      });
      html += graf('Técnicos em espera' + (dir === 'TODOS' ? ' · CO' : '') + (acum ? ' <small>· maior fila do dia até o horário</small>' : ''),
        G.barras({ cols: colsEsp, sel: iSel, aria: 'Técnicos em espera por intervalo' }),
        `<span><i style="background:var(--okc);border-radius:50%"></i>sem fila</span><span><i style="background:var(--p300)"></i>espera mais longa até 2 min</span><span><i style="background:var(--laranja)"></i>2 a 5 min</span><span><i style="background:var(--rosa)"></i>acima de 5 min</span>` +
        (acum ? '<span>maior número de técnicos esperando ao mesmo tempo, do início do dia até o horário da coluna (a fila é um retrato: não se soma ao longo do tempo)</span>'
          : `<span>maior número de técnicos esperando ao mesmo tempo nas coletas do intervalo (${passo < 15 ? 'de 5 em 5 min' : 'horas fechadas: uma coleta a cada 15 min'})</span>`), 'esp');
      }   // (o histórico não tem fila: o gráfico de técnicos em espera só aparece no dia ao vivo)
      // atendidos direto (em até 1 min)
      // altura = QUANTIDADE de técnicos atendidos em até 1 min (no intervalo, ou somada no dia no Acumulado);
      // rótulo: % das atendidas em cima (maior) e a quantidade embaixo (menor)
      const colsDir = ivC.map(c => c.semColeta ? { rot: rot(c), sd: true, titulo: tit(c) } : {
        rot: rot(c), and: c.andamento, titulo: tit(c), segs: [{ v: c.v.a60 || 0, cor: 'var(--sCO)' }],
        lab: c.v.dir60 == null ? '' : Math.round(c.v.dir60) + '%', lab2: c.v.dir60 == null ? '' : fI(c.v.a60) });
      html += graf('Técnicos atendidos direto' + (dir === 'TODOS' ? ' · CO' : '') + suf, G.barras({ cols: colsDir, sel: iSel, ref: refArr(v => v.a60), aria: 'Atendidos em até 1 minuto' }),
        (acum ? '<span><i style="background:var(--sCO)"></i>altura: técnicos atendidos em até 1&nbsp;min, somados do início do dia até o horário</span>'
          : '<span><i style="background:var(--sCO)"></i>altura: técnicos atendidos em até 1&nbsp;min no intervalo</span>') +
        `<span>rótulo: % das atendidas ${acum ? 'no dia até o horário' : 'no intervalo'} (em cima) e quantidade de técnicos atendidos direto (embaixo)</span>`, 'dir',
        { refHtml: vS ? refSel(v => v.a60, fI, vS.a60) : null });
      // 2) NS do intervalo + NS acumulado do dia
      // linha do NS acumulado: só no modo por intervalo (no acumulado as próprias colunas já são o acumulado)
      const linhaNS = [];
      ivC.forEach(c => { const l = c.v ? d.leituras.find(x => x.m === c.ateM) : null; linhaNS.push(l ? D.agregar(l, co).ns : null); });
      const colsNS = ivC.map(c => c.semColeta ? { rot: rot(c), sd: true, titulo: tit(c) } : {
        rot: rot(c), and: c.andamento, titulo: tit(c),
        segs: [{ v: c.v.ns == null ? 0 : c.v.ns, cor: corSit(situacao(c.v.ns)) }],
        lab: c.v.ns == null ? '' : Math.round(c.v.ns) + '%' });
      html += graf((acum ? 'Nível de serviço (<span class="un">5 min</span>)' : 'Nível de serviço (<span class="un">5 min</span>) por intervalo') + (dir === 'TODOS' ? ' · CO' : '') + suf,
        // com comparação, a linha do NS acumulado dá lugar à linha da mediana (duas linhas confundiriam)
        G.barras({ cols: colsNS, max: 100, meta: META_NS, metaTx: META_NS + '%', linha: acum || temCmp ? null : linhaNS, ref: refArr(v => v.ns), sel: iSel, aria: 'Nível de serviço' }),
        `<span><i style="background:var(--verdeS)"></i>Meta atingida</span><span><i style="background:var(--amareloS)"></i>Em atenção</span><span><i style="background:var(--vermelhoS)"></i>Crítico</span>${acum || temCmp ? '' : '<span><i class="ln"></i>NS acumulado do dia (÷ oferecidas, como no Pulse)</span>'}<span><i class="dash"></i>meta ${META_NS}%</span>` +
        (acum ? '<span>colunas: NS do dia até o horário — atendidas em até 5&nbsp;min ÷ oferecidas, como no Pulse</span>' : '<span>colunas: atendidas em até 5&nbsp;min ÷ chamadas finalizadas no intervalo (atendidas + abandonadas)</span>'),
        'ns', { acum: iSel >= 0 && !acum ? linhaNS[iSel] : null, refHtml: vS ? refSel(v => v.ns, x => fP(x), vS.ns, true) : null });
      // 3) abandono
      const colsAb = ivC.map(c => c.semColeta ? { rot: rot(c), sd: true, titulo: tit(c) } : {
        rot: rot(c), and: c.andamento, titulo: tit(c), segs: [{ v: acum ? c.v.aband : (c.v.abandPct || 0), cor: 'var(--sAb)' }],
        lab: c.v.abandPct == null ? '' : Math.round(c.v.abandPct) + '%', lab2: c.v.abandPct == null ? '' : fI(c.v.aband) });
      html += graf((acum ? 'Abandono' : 'Abandono por intervalo') + (dir === 'TODOS' ? ' · CO' : '') + suf, G.barras({ cols: colsAb, sel: iSel, ref: refArr(fAb), aria: 'Abandono' }),
        (acum ? '<span><i style="background:var(--sAb)"></i>altura: chamadas abandonadas, somadas do início do dia até o horário</span><span>rótulo: abandonadas ÷ oferecidas do dia (em cima) e quantidade (embaixo)</span>'
          : '<span><i style="background:var(--sAb)"></i>altura: abandonadas ÷ chamadas finalizadas no intervalo</span><span>rótulo: % (em cima) e quantidade de abandonadas (embaixo)</span>'), 'ab',
        { refHtml: vS ? (acum ? refSel(v => v.aband, fI, vS.aband) : refSel(v => v.abandPct, x => fP(x), vS.abandPct, true)) : null });
      // 4) TME
      const colsT = ivC.map(c => c.semColeta ? { rot: rot(c), sd: true, titulo: tit(c) } : {
        rot: rot(c), and: c.andamento, titulo: tit(c), segs: [{ v: c.v.tme || 0, cor: 'var(--sTme)' }], lab: c.v.tme == null ? '' : minCurto(c.v.tme) });
      html += graf((acum ? 'Tempo médio de espera (TME)' : 'Tempo médio de espera (TME) por intervalo') + (dir === 'TODOS' ? ' · CO' : '') + suf, G.barras({ cols: colsT, sel: iSel, ref: refArr(v => v.tme), aria: 'TME' }),
        `<span><i style="background:var(--sTme)"></i>TME das chamadas atendidas ${acum ? 'no dia até o horário' : 'no intervalo'}: tempo que o técnico esperou até ser atendido</span>`, 'tme',
        { refHtml: vS ? refSel(v => v.tme, fS, vS.tme) : null });
      // 5) TMA (média: no acumulado é a média do dia até ali, não soma)
      const colsTma = ivC.map(c => c.semColeta ? { rot: rot(c), sd: true, titulo: tit(c) } : {
        rot: rot(c), and: c.andamento, titulo: tit(c), segs: [{ v: c.v.tma || 0, cor: 'var(--sTma)' }], lab: c.v.tma == null ? '' : minCurto(c.v.tma) });
      html += graf((acum ? 'Tempo médio de atendimento (TMA)' : 'Tempo médio de atendimento (TMA) por intervalo') + (dir === 'TODOS' ? ' · CO' : '') + suf, G.barras({ cols: colsTma, sel: iSel, ref: refArr(v => v.tma), aria: 'TMA' }),
        `<span><i style="background:var(--sTma)"></i>TMA das chamadas atendidas ${acum ? 'no dia até o horário' : 'no intervalo'}: duração do atendimento (média ponderada pelas atendidas)</span>`, 'tma',
        { refHtml: vS ? refSel(v => v.tma, fS, vS.tma) : null });
    } else {
      html += `<div class="card"><p class="nota">A TEL é atendida em outro sistema: a URA registra só o volume encaminhado. Por isso não há NS, abandono nem tempos para a TEL.</p></div>`;
    }
    html += tabelaIntervalos(ivC, ivT, dir, passo, iSel, acum);

    el.innerHTML = `
      <div class="evo-ctl${evo.fixo ? ' fixo' : ''}">
      ${navDia(ctx)}
      <div class="card topbar ${evo.ctl ? 'aberto' : 'fechado'}">
        ${evo.ctl ? `<div class="seg" role="tablist" aria-label="Atendimento">${[['CO', 'CO'], ['TEL', 'TEL'], ['TODOS', 'Total URA']].map(([v, t]) => `<button data-dir="${v}" class="${dir === v ? 'on' : ''}">${t}</button>`).join('')}</div>
        <div class="seg sm" role="tablist" aria-label="Modo">${[['int', 'Por intervalo'], ['acum', 'Acumulado']].map(([v, t]) => `<button data-modo="${v}" class="${evo.modo === v ? 'on' : ''}" aria-pressed="${evo.modo === v}">${t}</button>`).join('')}</div>
        <div class="seg sm" role="tablist" aria-label="Intervalo do eixo">${['auto', 15, 30, 60, 120].map(p => `<button data-passo="${p}" class="${String(evo.passo) === String(p) ? 'on' : ''}">${PASSO_NOME[p]}</button>`).join('')}</div>
        <div class="seg sm" role="tablist" aria-label="Comparar com a mediana do histórico">${[['nao', 'Sem comparação'], ['dias', '7 dias'], ['sem', '7 ' + DS_PLURAL[Hs ? Hs.diaSemana(ctx.iso) : 0]]].map(([v, t]) => `<button data-cmp="${v}" class="${evo.cmp === v ? 'on' : ''}" aria-pressed="${evo.cmp === v}"${!hist && v !== 'nao' ? ' disabled title="Histórico indisponível"' : ''}>${t}</button>`).join('')}</div>
        <div class="ctl-pe"><div class="meta-line"><span>${acum ? 'Acumulado · a cada ' + PASSO_NOME[passo] : 'Intervalos de ' + PASSO_NOME[passo]}${evo.passo === 'auto' ? ' (auto)' : ''}</span><span>08:00–${esc(L.horario)}</span></div>${pinoCtl()}${setaCtl(true)}</div>`
        : `<div class="ctl-pe"><button class="ctl-res" data-act="ctl" aria-label="Mostrar os controles: ${esc(resumoCtl.join(', '))}">${resumoCtl.map(t => `<span class="ctl-p">${esc(t)}</span>`).join('')}</button>${setaCtl(false)}</div>`}
        ${iSel >= 0 ? `<button class="selchip" data-act="limpar"><span>Selecionado: <b>${tit(ivC[iSel])}</b> · toque para limpar</span><span aria-hidden="true">✕</span></button>` : ''}
      </div>
      <div class="chips${iSel >= 0 ? ' per' : ''}" role="group" aria-label="Grupo (oferecidas ${esc(ondeChip)})">${[null, ...grpsDisp].map(g => {
        const v = g == null ? chipTodos : chipVol.get(g);
        return `<button class="chip${v ? '' : ' zero'}" data-grp="${esc(g || '')}" aria-pressed="${evo.grupo === g}" title="${v == null ? 'sem coleta' : fI(v) + ' oferecidas ' + esc(ondeChip)}">${esc(g || 'Todos os grupos')}<span class="qt num">${v == null ? '—' : fI(v)}</span></button>`;
      }).join('')}</div>
      </div>
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

  // Resumo do intervalo selecionado, centralizado: período em cima e, embaixo, só os valores do gráfico em questão.
  function capGraf(tipo, c, t, dir, extra) {
    const ac = !!c.acum, fim = D.hhmm(c.andamento ? c.ateM : c.fim);
    const per = (ac ? `Acumulado até ${fim}` : `${D.hhmm(c.ini)}–${fim}`) + (c.andamento ? ' · em andamento' : '');
    const ref = extra && extra.refHtml ? `<small class="cref">${extra.refHtml}</small>` : '';
    const caixa = (val, nota) => `<div class="cap capsel csel"><b>${per}</b><span>${val}</span>${nota ? `<small>${nota}</small>` : ''}${ref}</div>`;
    const pl = (n, um, varios) => fI(n) + ' ' + (n === 1 ? um : varios);
    if (tipo === 'esp') {
      const e = c.esp;
      if (!e) return caixa('sem coleta neste horário');
      if (ac) return caixa(e.pico ? `maior fila do dia até aqui: <b>${pl(e.pico, 'técnico', 'técnicos')}</b> às ${D.hhmm(e.picoM)} · espera mais longa ${fS(e.espMax)}`
        : 'nenhum técnico em espera no dia até aqui', `${e.n} coletas desde o início do dia`);
      return caixa(e.pico ? `pico de <b>${pl(e.pico, 'técnico', 'técnicos')}</b> em espera às ${D.hhmm(e.picoM)} · espera mais longa ${fS(e.espMax)}`
        : 'nenhum técnico em espera nas coletas', e.n > 1 ? `maior valor entre ${e.n} coletas do intervalo` : '');
    }
    if (c.semColeta) return caixa('sem coleta neste horário', ac ? '' : 'o volume entra no intervalo seguinte');
    const nota = c.juntaAnterior ? `inclui o volume desde ${D.hhmm(c.baseM)} (horário sem coleta)` : c.incluiAntes ? 'inclui o que entrou antes da primeira coleta do dia' : '';
    const v = c.v, tv = t && t.v ? t.v.ofer : 0;
    if (tipo === 'of') {
      if (dir === 'TEL') return caixa(`<b>${pl(tv, 'oferecida', 'oferecidas')}</b> na TEL`, nota);
      if (dir === 'TODOS') return caixa(`<b>${pl(v.ofer + tv, 'oferecida', 'oferecidas')}</b> · CO ${fI(v.ofer)} · TEL ${fI(tv)}`, nota);
      return caixa(`<b>${pl(v.ofer, 'oferecida', 'oferecidas')}</b> · ${fI(v.atend)} atendidas · ${fI(v.aband)} abandonadas`, nota);
    }
    if (tipo === 'dir') return caixa(v.dir60 == null ? 'sem chamadas atendidas' : `<b>${fP(v.dir60)}</b> atendidos direto · ${fI(v.a60)} de ${fI(v.atend)} em até 1&nbsp;min`, nota);
    if (tipo === 'ns') {
      const sit = situacao(v.ns);
      if (ac) return caixa(v.ns == null ? 'sem chamadas oferecidas' : `NS <b class="c-${sit}">${fP(v.ns)}</b> · ${fI(v.a300)} de ${fI(v.ofer)} oferecidas em até 5&nbsp;min`, nota);
      return caixa(v.ns == null ? 'sem chamadas finalizadas' : `NS <b class="c-${sit}">${fP(v.ns)}</b> · ${fI(v.a300)} de ${fI(v.fin)} finalizadas em até 5&nbsp;min`,
        [extra && extra.acum != null ? 'acumulado do dia até aqui: ' + fP(extra.acum) : '', nota].filter(Boolean).join(' · '));
    }
    if (tipo === 'ab') return caixa(v.abandPct == null ? (ac ? 'sem chamadas oferecidas' : 'sem chamadas finalizadas')
      : `<b>${fP(v.abandPct)}</b> de abandono · ${fI(v.aband)} de ${fI(ac ? v.ofer : v.fin)} ${ac ? 'oferecidas' : 'finalizadas'}`, nota);
    if (tipo === 'tma') return caixa(v.tma == null ? 'sem chamadas atendidas' : `TMA <b>${fS(v.tma)}</b> · TME ${fS(v.tme)} · ${pl(v.atend, 'atendida', 'atendidas')}`, nota);
    if (tipo === 'tme') return caixa(v.tme == null ? 'sem chamadas atendidas' : `TME <b>${fS(v.tme)}</b> · TMA ${fS(v.tma)} · ${pl(v.atend, 'atendida', 'atendidas')}`, nota);
    return caixa('');
  }

  function tabelaIntervalos(ivC, ivT, dir, passo, iSel, acum) {
    const linhas = ivC.map((c, i) => {
      const t = ivT[i], r = `${D.hhmm(acum ? (c.andamento ? c.ateM : c.fim) : c.ini)}${c.andamento ? '*' : ''}`;
      const cls = i === iSel ? ' class="sel"' : '';
      if (c.semColeta) return `<tr data-i="${i}"${cls}><td>${r}</td><td class="nd" colspan="${dir === 'TEL' ? 1 : dir === 'CO' ? 6 : 4}">sem coleta</td></tr>`;
      if (dir === 'TEL') return `<tr data-i="${i}"${cls}><td>${r}</td><td>${fI(t && t.v ? t.v.ofer : 0)}</td></tr>`;
      if (dir === 'CO') return `<tr data-i="${i}"${cls}><td>${r}</td><td>${fI(c.v.ofer)}</td><td>${fI(c.v.atend)}</td><td>${fI(c.v.aband)}</td><td>${nsTx(c.v.ns)}</td><td>${c.esp ? fI(c.esp.pico) : '—'}</td><td>${c.v.tme == null ? '—' : minCurto(c.v.tme)}</td></tr>`;
      return `<tr data-i="${i}"${cls}><td>${r}</td><td>${fI(c.v.ofer)}</td><td>${fI(t && t.v ? t.v.ofer : 0)}</td><td>${nsTx(c.v.ns)}</td><td>${fI(c.v.aband)}</td></tr>`;
    }).reverse().join('');
    const h1 = acum ? 'Até' : 'Início';
    const head = dir === 'TEL' ? `<th>${h1}</th><th>Oferecidas</th>` : dir === 'CO' ? `<th>${h1}</th><th>Ofer.</th><th>Atend.</th><th>Aband.</th><th>NS</th><th title="${acum ? 'maior fila do dia até o horário' : 'pico de técnicos em espera'}">Fila</th><th>TME</th>`
      : `<th>${h1}</th><th>CO</th><th>TEL</th><th>NS CO</th><th>Aband. CO</th>`;
    return `<div class="card"><h2>${acum ? 'Acumulado do dia' : 'Intervalos de ' + PASSO_NOME[passo]} <small>· mais recente primeiro</small></h2><div class="tw"><table class="conf tsel" id="tIv"><thead><tr>${head}</tr></thead><tbody>${linhas}</tbody></table></div></div>`;
  }

  // ---------------------------------------------------------------- SKILLS
  function renderSkills() {
    const d = dados, L = ultima();
    const q = sk.q.trim().toLowerCase();
    const lista = [...porSimpl(d, sk.dir).entries()].filter(([nome, ss]) => {
      if (!q) return true;
      return ss.some(s => { const t = d.trad[s]; return [s, nome, t.SKILL_GRUPO, t.SKILL_SUBGRUPO, t.SKILL_TIPO_ATENDIMENTO, t.SKILL_PRODUTO].some(x => String(x || '').toLowerCase().includes(q)); });
    }).map(([nome, ss]) => {
      // atendimento do item: o das suas skills (no Total URA, um nome pode juntar CO e TEL: "MISTO")
      const ds = [...new Set(ss.map(s => d.trad[s].DIRECIONAMENTO))];
      return { nome, ss, a: D.agregar(L, ss), t: d.trad[ss[0]], dir: ds.length === 1 ? ds[0] : 'TODOS' };
    });
    const totDir = D.agregar(L, D.filtro(d, { dir: sk.dir })).ofer;
    const nomeTot = { CO: 'do CO', TEL: 'da TEL', TODOS: 'da URA' }[sk.dir];
    lista.sort((x, y) => y.a.ofer - x.a.ofer || x.nome.localeCompare(y.nome));
    const com = lista.filter(x => x.a.ofer > 0 || x.a.fila > 0), sem = lista.filter(x => !(x.a.ofer > 0 || x.a.fila > 0));
    const item = x => {
      const sit = situacao(x.a.ns);
      // padrão único: oferecidas em destaque; embaixo, menor, o NS colorido (CO) ou a participação no volume (TEL)
      const eCO = x.dir === 'CO';
      const cor = eCO ? corSit(sit) : 'var(--sTEL)';
      const dir = eCO
        ? `<b>${fI(x.a.ofer)}</b><small>NS <span class="nsc c-${sit || 'x'}">${x.a.ns == null ? '—' : fP(x.a.ns)}</span>${x.a.fila ? ' · ' + fI(x.a.fila) + ' na fila' : ''}</small>`
        : `<b>${fI(x.a.ofer)}</b><small>${totDir ? fP(x.a.ofer / totDir * 100) : '—'} ${nomeTot}</small>`;
      const tag = sk.dir === 'TODOS' ? `<span class="dtag d-${x.dir}">${x.dir === 'TODOS' ? 'CO+TEL' : x.dir}</span>` : '';
      return `<button class="fi" data-sk="${esc(x.nome)}" data-skd="${x.dir}"><span class="bar" style="background:${x.a.ofer ? cor : 'var(--line)'}"></span>
        <span class="tx"><div class="nm">${esc(x.nome)}</div><div class="sb">${tag}${esc(x.t.SKILL_GRUPO)}${x.t.SKILL_TIPO_ATENDIMENTO ? ' · ' + esc(x.t.SKILL_TIPO_ATENDIMENTO) : ''}${x.ss.length > 1 ? ' · ' + x.ss.length + ' skills' : ''}</div></span>
        <span class="nv">${dir}</span></button>`;
    };
    $('#pgSkills').innerHTML = `
      <div class="tools">
        <div class="seg" role="tablist" aria-label="Atendimento">${[['CO', 'CO'], ['TEL', 'TEL'], ['TODOS', 'Total URA']].map(([v, t]) => `<button data-skdir="${v}" class="${sk.dir === v ? 'on' : ''}">${t}</button>`).join('')}</div>
        <label class="srch"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><circle cx="11" cy="11" r="7"/><path d="m20 20-3.5-3.5"/></svg><input class="search" id="skQ" type="search" placeholder="Buscar skill, grupo, rede…" autocomplete="off" value="${esc(sk.q)}" aria-label="Buscar skill"></label>
      </div>
      <h2 class="sec">Com chamadas hoje <span class="ct num">${com.length}</span><span class="sp"></span><span class="rt">oferecidas</span></h2>
      <div class="fl">${com.length ? com.map(item).join('') : '<p class="nota" style="padding:4px">Nenhuma skill com chamadas.</p>'}</div>
      ${sem.length ? (sk.zeros ? `<h2 class="sec">Sem chamadas hoje <span class="ct num">${sem.length}</span></h2><div class="fl">${sem.map(item).join('')}</div>`
        : `<button class="zeros" data-act="zeros">Mostrar ${sem.length} skill(s) sem chamadas hoje</button>`) : ''}`;
  }

  // Peso da skill no dia: representatividade (% das oferecidas da URA, CO + TEL) e rank entre as mais acionadas.
  // O rank usa a mesma lista da aba Skills em "Total URA" (nomes simplificados); empate divide a posição (1º, 2º, 2º, 4º).
  function rankEntre(mapa, nome) {
    const L = ultima(), vol = [...mapa.entries()].map(([n, ss]) => ({ n, v: D.agregar(L, ss).ofer }));
    const meu = vol.find(x => x.n === nome);
    if (!meu) return null;
    return { pos: 1 + vol.filter(x => x.v > meu.v).length, de: vol.length, empate: vol.filter(x => x.v === meu.v).length > 1 };
  }
  function cartaoPeso(nome, ss, a, dirSk) {
    const d = dados, L = ultima();
    const tot = D.agregar(L, D.filtro(d, { dir: 'TODOS' })).ofer;
    const rep = tot ? a.ofer / tot * 100 : null;
    const rk = rankEntre(porSimpl(d, 'TODOS'), nome);
    const nDir = dirSk === 'CO' || dirSk === 'TEL' ? dirSk : null;
    const totDir = nDir ? D.agregar(L, D.filtro(d, { dir: nDir })).ofer : null;
    const rkDir = nDir ? rankEntre(porSimpl(d, nDir), nome) : null;
    const pos = r => r ? `${r.pos}º` : '—';
    return `<div class="card peso"><h2>No volume da URA <small>· ${ddmmaaaa(d.dia).slice(0, 5)}</small></h2><div class="peso-g">
      <div><div class="l">Representatividade</div><div class="v num">${rep == null ? '—' : fP(rep)}</div>
        <div class="s">${fI(a.ofer)} de ${fI(tot)} oferecidas${nDir && totDir ? ` · ${fP(a.ofer / totDir * 100)} ${nDir === 'CO' ? 'do CO' : 'da TEL'}` : ''}</div></div>
      <div><div class="l">Rank</div><div class="v num">${pos(rk)}<small> de ${rk ? rk.de : '—'}</small></div>
        <div class="s">${a.ofer ? 'mais acionadas da URA' : 'sem chamadas hoje'}${rk && rk.empate ? ' (empate)' : ''}${rkDir && a.ofer ? ` · ${pos(rkDir)} ${nDir === 'CO' ? 'no CO' : 'na TEL'}` : ''}</div></div>
    </div></div>`;
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
      ? kpi('Oferecidas', fI(a.ofer), 'atendidas ' + fI(a.atend)) + kpi('NS 5 min', nsTx(a.ns), `meta ${META_NS}%`) +
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
      ${cartaoPeso(nome, ss, a, dirSk)}
      <div class="kpis2">${kp}</div>
      ${cartaoGraf('sk-of', `Oferecidas por intervalo <small>· ${PASSO_NOME[passo]}</small>`, G.barras({ cols, aria: 'Oferecidas por intervalo da skill' }),
        `<div class="legend">${isCO ? '<span><i style="background:var(--sCO)"></i>oferecidas</span><span><i style="background:var(--sAb)"></i>parte abandonada</span>' : '<span><i style="background:var(--sTEL)"></i>oferecidas</span>'}</div>` +
        `<div class="cap">Coleta das ${esc(L.horario)}.</div>`)}
      ${ss.length > 1 ? tabSk : ''}
      <div class="card"><h2>Tradutora</h2><dl class="kv">${kv}</dl></div>`;
    sh.scrollTop = 0;
    sh.classList.add('show'); $('#sheetBg').classList.add('show');
  }
  function fecharSheet() { $('#sheet').classList.remove('show'); $('#sheetBg').classList.remove('show'); if (infoAberto && infoAberto.startsWith('sk-')) infoAberto = null; }

  // ---------------------------------------------------------------- eventos
  function irPara(p) { pagina = p; infoAberto = null; evo.ctl = false; fecharSheet(); render(); window.scrollTo(0, 0); }
  document.addEventListener('click', e => {
    const b = e.target.closest('button, [data-grupo], tr[data-i], rect.hit');
    if (!b) { if (e.target.id === 'sheetBg') fecharSheet(); return; }
    if (b.closest('nav.tabs')) return irPara(b.dataset.v);
    if (b.id === 'btRefresh') { if (origem === 'arquivo') { origem = 'site'; } return carregar(true); }
    if (b.id === 'btArq' || b.dataset.act === 'arq') return $('#arq').click();
    if (b.dataset.fechaAviso != null) { avisosFechados.add(b.dataset.fechaAviso); return renderBanners(); }
    if (b.dataset.info) return alternarInfo(b.dataset.info);
    if (b.dataset.act === 'fechar') return fecharSheet();
    if (b.dataset.act === 'ctl') { evo.ctl = !evo.ctl; return redesenhar(); }
    if (b.dataset.act === 'fixar') { evo.fixo = !evo.fixo; gravarPref('fixo', evo.fixo); toast(evo.fixo ? 'Controles fixados no topo.' : 'Controles soltos.'); return redesenhar(); }
    if (b.dataset.act === 'limpar') { evo.sel = null; return redesenhar(); }
    if (b.dataset.act === 'zeros') { sk.zeros = true; return render(); }
    if (b.dataset.sk) return abrirSkill(b.dataset.sk, b.dataset.skd);
    if (b.dataset.dir && b.closest('#pgEvo')) { evo.dir = b.dataset.dir; evo.grupo = null; evo.sel = null; return redesenhar(); }
    if (b.dataset.modo) { evo.modo = b.dataset.modo; return redesenhar(); }
    if (b.dataset.cmp) { evo.cmp = b.dataset.cmp; gravarPref('cmp', evo.cmp); return redesenhar(); }
    if (b.dataset.navdia) {
      // navegar entre os dias: a coluna selecionada continua (mesmo horário em outro dia)
      const lista = diasDisp(), atual = evo.dia || lista[lista.length - 1];
      let i = lista.indexOf(atual);
      if (b.dataset.navdia === 'fim') i = lista.length - 1; else i = Math.max(0, Math.min(lista.length - 1, i + +b.dataset.navdia));
      evo.dia = i === lista.length - 1 ? null : lista[i];
      return redesenhar();
    }
    if (b.dataset.passo) { evo.passo = b.dataset.passo === 'auto' ? 'auto' : +b.dataset.passo; gravarPref('passo', evo.passo); evo.sel = null; return redesenhar(); }
    if (b.dataset.grp != null && b.classList.contains('chip')) {
      // tocar no grupo já selecionado desmarca e volta para "Todos os grupos"
      const g = b.dataset.grp || null;
      // a coluna selecionada continua selecionada: os gráficos trocam de grupo mantendo o mesmo horário
      evo.grupo = g && g === evo.grupo ? null : g; chipAnimar = true;
      return redesenhar();
    }
    if (b.dataset.skdir) { sk.dir = b.dataset.skdir; sk.zeros = false; return render(); }
    if (b.matches('[data-grupo]')) { evo.dir = b.dataset.dir; evo.grupo = b.dataset.grupo; evo.sel = null; return irPara('evo'); }
    if (b.matches('rect.hit') && b.closest('#pgEvo') || b.matches('#tIv tr[data-i]')) {
      const iv = ivAtuais(); const i = +b.dataset.i; const c = iv[i];
      if (c) { evo.sel = evo.sel === c.ini ? null : c.ini; redesenhar(); }
    }
  });
  function ivAtuais() {
    const d = diaEvo().d;
    const co = D.filtro(d, { dir: 'CO', grupo: evo.grupo });
    const passo = evo.passo === 'auto' ? D.passoAuto(d, maxColunas($('#pgEvo'))) : +evo.passo;
    return D.intervalos(d, passo, co);
  }
  function redesenhar() { const y = window.scrollY; render(); window.scrollTo(0, y); }
  // seletor de data: escolher um dia sem dados avisa e não muda
  document.addEventListener('change', e => {
    if (e.target.id !== 'dnData') return;
    const v = e.target.value, lista = diasDisp();
    if (!v) return;
    if (!lista.includes(v)) { toast(`Sem dados de ${ddmmaaaa(v)}.`); return redesenhar(); }
    evo.dia = v === lista[lista.length - 1] ? null : v;
    redesenhar();
  });
  document.addEventListener('input', e => {
    if (e.target.id === 'skQ') {
      sk.q = e.target.value;
      const pos = e.target.selectionStart;
      renderSkills();
      const q = $('#skQ'); q.focus(); try { q.setSelectionRange(pos, pos); } catch (er) { /* type=search em alguns navegadores */ }
    }
  });
  document.addEventListener('keydown', e => {
    if (e.key === 'Escape') fecharSheet();
    if ((e.key === 'Enter' || e.key === ' ') && e.target.matches && e.target.matches('.tg-a[data-grupo]')) { e.preventDefault(); e.target.click(); }
  });
  $('#arq').addEventListener('change', e => { const f = e.target.files && e.target.files[0]; if (f) abrirArquivo(f); e.target.value = ''; });
  let largAnt = window.innerWidth;
  window.addEventListener('resize', () => {
    medirTopo(); if (Math.abs(window.innerWidth - largAnt) > 40 && dados && pagina === 'evo') { largAnt = window.innerWidth; redesenhar(); } });

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
  carregar(false).then(() => carregarHist(true));
  setInterval(() => { if (!document.hidden) carregarHist(false); }, 5 * 60000);

  // para testes
  window.__ura = { versao: APP_VERSION, estado: () => ({ dados, origem, erroFonte, erroDados, pagina, evo, sk, hist, histErro, histOrigem }) };
})();

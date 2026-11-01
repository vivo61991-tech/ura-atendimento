-- =====================================================================================
-- URA · Suporte B2C — HISTÓRICO DA FILA (técnicos em espera no CO), para o app
-- Fonte: GENESYS_DAGENT_HIST_V3 · Banco: Oracle      (calibrado contra o Pulse em 30/10, chamada a chamada)
--
-- A fila é um RETRATO: quantos técnicos estão esperando num instante. O Genesys não guarda esse retrato,
-- mas guarda cada chamada; daí dá para refazê-lo:
--   • FIM da espera: na ATENDIDA é o INICIO_INTERACAO_PERNA (a perna "RoutedTo" começa quando a chamada
--     vai para o agente); na ABANDONADA é o FIM_INTERACAO_PERNA (quando o técnico desliga);
--   • a espera toda dura MEDIATION_DURATION (na atendida = ESPERA; na abandonada = ABANDONED_TIME);
--   • os primeiros 120 s são URA/anúncio, que o Pulse NÃO conta como fila → parâmetro DESC_FILA_S
--     (o mesmo desconto que acertou o NS);
--   • em cada marca de 5 min (08:05 … 21:00), conta as chamadas entre "entrou na fila" e "saiu".
-- Calibração (30/10, 87 coletas do Pulse, CO): total 100% igual, erro médio 0,8 técnico por coleta,
-- correlação 0,997, maior diferença 8; espera mais longa com erro médio de 26 s.
-- (A 1ª versão usava o INICIO como começo da espera: ficava 15–30 min adiantada — correlação 0,77.)
--
-- Saída: uma linha por DIA × MARCA (5 min) × SKILL, só quando havia alguém esperando (arquivo pequeno).
--   DIA;MARCA;SKILL;EM_ESPERA;ESPERA_MAX_S
--   ESPERA_MAX_S = há quanto tempo o técnico mais antigo da fila está esperando (desde que entrou na fila).
-- O app soma as skills em cada marca e pega o pico do intervalo — igual faz com o Pulse.
--
-- Exportar: delimitado · tabulação · cabeçalho · UTF-8 → historico_fila.txt
-- =====================================================================================
WITH param AS (
    SELECT 120                        AS desc_fila_s,  -- URA/anúncio antes da fila (calibrado em 30/10)
           TRUNC(SYSDATE) - (90 + 49) AS dia_ini,      -- mesmo período do historico.csv
           TRUNC(SYSDATE)             AS dia_fim       -- só dias fechados
      FROM dual
),
esperas AS (
    SELECT h.interaction_id,
           h.vq_name,
           h.inicio_interacao_perna,
           NVL(h.mediation_duration, 0)                                           AS espera_total_s,
           CASE WHEN NVL(h.abandoned, 0) = 1 THEN h.fim_interacao_perna
                ELSE h.inicio_interacao_perna END                                 AS fim_espera
      FROM genesys_dagent_hist_v3 h
     CROSS JOIN param p
     WHERE h.row_date >= p.dia_ini
       AND h.row_date <  p.dia_fim
       AND h.papel = 'RoutedTo'
       AND NVL(h.mediation_duration, 0) > p.desc_fila_s      -- quem saiu antes nem chegou a esperar na fila
       AND h.vq_name IN (
      'VQ_COE_DEFAULT_CO_DEFAULT_SUP_FIB_V1'
    , 'VQ_COE_DEFAULT_CO_DEFAULT_SUP_FIB_V2'
    , 'VQ_COE_VIV_CO_DEFAULT_SUP_FIB_V1'
    , 'VQ_COE_VIV_CO_DEFAULT_SUP_FIB_V2'
    , 'VQ_COE_VIV_C_HB_HIB_CERTIFICA_REDE_NEUTRA'
    , 'VQ_COE_VIV_C_HB_HIB_CERTIFICA_REDE_NEUTRA_BEATRIX'
    , 'VQ_COE_VIV_C_HB_HIB_CERTIFICA_V1'
    , 'VQ_COE_VIV_C_HB_HIB_CERTIFICA_V1_BEATRIX'
    , 'VQ_COE_VIV_C_HB_HIB_CERTIFICA_V1_SF'
    , 'VQ_COE_VIV_C_HB_HIB_CERTIFICA_V2'
    , 'VQ_COE_VIV_C_HB_HIB_CERTIFICA_V2_BEATRIX'
    , 'VQ_COE_VIV_C_HB_HIB_CERTIFICA_V2_SF'
    , 'VQ_COE_VIV_C_HB_HIB_SUP_BL_REDE_NEUTRA'
    , 'VQ_COE_VIV_C_HB_HIB_SUP_BL_REDE_NEUTRA_BEATRIX'
    , 'VQ_COE_VIV_C_HB_HIB_SUP_REDE_NEUTRA_MANOBRA'
    , 'VQ_COE_VIV_C_HB_HIB_SUP_REDE_NEUTRA_MANOBRA_BEATRIX'
    , 'VQ_COE_VIV_C_HB_HIB_SUP_REDE_NEUTRA_MULTIPLAS_LINHAS'
    , 'VQ_COE_VIV_C_HB_HIB_SUP_REDE_NEUTRA_TV'
    , 'VQ_COE_VIV_C_HB_HIB_SUP_REDE_NEUTRA_TV_BEATRIX'
    , 'VQ_COE_VIV_C_HB_HIB_SUP_REDE_NEUTRA_VOIP'
    , 'VQ_COE_VIV_C_HB_HIB_SUP_REDE_NEUTRA_VOIP_BEATRIX'
    , 'VQ_COE_VIV_C_HB_HIB_SUP_RN_MULTIPLAS_LINHAS_BEATRIX'
    , 'VQ_COE_VIV_C_HB_HIB_SUP_V1_BL'
    , 'VQ_COE_VIV_C_HB_HIB_SUP_V1_BL_BEATRIX'
    , 'VQ_COE_VIV_C_HB_HIB_SUP_V1_BL_SF'
    , 'VQ_COE_VIV_C_HB_HIB_SUP_V1_MANOBRA'
    , 'VQ_COE_VIV_C_HB_HIB_SUP_V1_MANOBRA_BEATRIX'
    , 'VQ_COE_VIV_C_HB_HIB_SUP_V1_MANOBRA_SF'
    , 'VQ_COE_VIV_C_HB_HIB_SUP_V1_MULTIPLAS_LINHAS'
    , 'VQ_COE_VIV_C_HB_HIB_SUP_V1_MULTIPLAS_LINHAS_BEATRIX'
    , 'VQ_COE_VIV_C_HB_HIB_SUP_V1_MULTIPLAS_LINHAS_SF'
    , 'VQ_COE_VIV_C_HB_HIB_SUP_V1_TV'
    , 'VQ_COE_VIV_C_HB_HIB_SUP_V1_TV_BEATRIX'
    , 'VQ_COE_VIV_C_HB_HIB_SUP_V1_TV_SF'
    , 'VQ_COE_VIV_C_HB_HIB_SUP_V1_VOIP'
    , 'VQ_COE_VIV_C_HB_HIB_SUP_V1_VOIP_SF'
    , 'VQ_COE_VIV_C_HB_HIB_SUP_V2_BL'
    , 'VQ_COE_VIV_C_HB_HIB_SUP_V2_BL_BEATRIX'
    , 'VQ_COE_VIV_C_HB_HIB_SUP_V2_BL_SF'
    , 'VQ_COE_VIV_C_HB_HIB_SUP_V2_MANOBRA'
    , 'VQ_COE_VIV_C_HB_HIB_SUP_V2_MANOBRA_BEATRIX'
    , 'VQ_COE_VIV_C_HB_HIB_SUP_V2_MANOBRA_SF'
    , 'VQ_COE_VIV_C_HB_HIB_SUP_V2_MULTIPLAS_LINHAS'
    , 'VQ_COE_VIV_C_HB_HIB_SUP_V2_MULTIPLAS_LINHAS_BEATRIX'
    , 'VQ_COE_VIV_C_HB_HIB_SUP_V2_MULTIPLAS_LINHAS_SF'
    , 'VQ_COE_VIV_C_HB_HIB_SUP_V2_TV'
    , 'VQ_COE_VIV_C_HB_HIB_SUP_V2_TV_BEATRIX'
    , 'VQ_COE_VIV_C_HB_HIB_SUP_V2_TV_SF'
    , 'VQ_COE_VIV_C_HB_HIB_SUP_V2_VOIP'
    , 'VQ_COE_VIV_C_HB_HIB_SUP_V2_VOIP_SF'
       )
),
chamadas AS (
    SELECT TRUNC(e.fim_espera)                                                    AS dia,
           e.vq_name,
           e.fim_espera - (e.espera_total_s - p.desc_fila_s) / 86400              AS entra_fila,
           e.fim_espera                                                           AS sai_fila,
           ROW_NUMBER() OVER (PARTITION BY e.interaction_id, e.vq_name
                              ORDER BY e.inicio_interacao_perna)                  AS ordem
      FROM esperas e
     CROSS JOIN param p
),
dias AS (
    SELECT p.dia_ini + LEVEL - 1 AS dia
      FROM param p
   CONNECT BY LEVEL <= p.dia_fim - p.dia_ini
),
marcas AS (                                                   -- 156 marcas por dia: 08:05, 08:10 … 21:00
    SELECT d.dia, d.dia + (8 * 60 + 5 * n.k) / 1440 AS t
      FROM dias d
     CROSS JOIN (SELECT LEVEL AS k FROM dual CONNECT BY LEVEL <= 156) n
)
SELECT TO_CHAR(m.dia, 'YYYY-MM-DD')                                   AS dia,
       TO_CHAR(m.t, 'HH24:MI')                                        AS marca,
       c.vq_name || '@SW_SIPS_VQ'                                     AS skill,
       COUNT(*)                                                       AS em_espera,
       ROUND(MAX((m.t - c.entra_fila) * 86400))                       AS espera_max_s
  FROM marcas m
  JOIN chamadas c
    ON c.dia = m.dia
   AND c.ordem = 1
   AND c.entra_fila <= m.t
   AND c.sai_fila   >  m.t
 GROUP BY m.dia, m.t, c.vq_name
 ORDER BY dia, marca, skill;

-- =====================================================================================
-- URA · Suporte B2C — CALIBRAÇÃO DA FILA (técnicos em espera) — rodar UMA vez
-- Objetivo: conferir, chamada a chamada e com HORA, se a fila do Pulse (Current_Calls) pode ser
-- reconstruída pelo Genesys. Saída pequena: ~5 mil linhas (CO, 28 a 30/10).
--
-- Por que precisa: no analítico exportado antes, INICIO_INTERACAO_PERNA veio só com a data
-- (o SQL Developer esconde a hora). Aqui a hora sai como texto, com segundos.
--
-- Exportar: botão direito no resultado → Exportar → delimitado · tabulação · cabeçalho · UTF-8
--   → fila_calibracao.txt   (e me mande o arquivo)
-- =====================================================================================
SELECT TO_CHAR(h.inicio_interacao_perna, 'YYYY-MM-DD HH24:MI:SS') AS inicio_perna,
       TO_CHAR(h.fim_interacao_perna,    'YYYY-MM-DD HH24:MI:SS') AS fim_perna,
       h.interaction_id,
       h.vq_name,
       h.faixa,
       NVL(h.acdcalls, 0)               AS atendida,
       NVL(h.abandoned, 0)              AS abandonada,
       NVL(h.espera, 0)                 AS espera,
       NVL(h.mediation_duration, 0)     AS mediation_duration,
       NVL(h.routing_point_duration, 0) AS routing_point_duration,
       NVL(h.queue_duration, 0)         AS queue_duration,
       NVL(h.abandoned_time, 0)         AS abandoned_time,
       NVL(h.ring_duration, 0)          AS ring_duration
  FROM genesys_dagent_hist_v3 h
 WHERE h.row_date >= DATE '2026-10-28'
   AND h.row_date <  DATE '2026-10-31'
   AND h.papel = 'RoutedTo'
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
 ORDER BY h.inicio_interacao_perna;

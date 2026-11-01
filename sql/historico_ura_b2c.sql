-- =====================================================================================
-- URA · Suporte B2C — HISTÓRICO para o app (média dos 7 dias e das 7 semanas)
-- Fonte: GENESYS_DAGENT_HIST_V3  ·  Banco: Oracle
-- Saída: uma linha por DIA × HORARIO (bloco de 15 min) × SKILL, só quando houve chamada.
-- Período: 139 dias FECHADOS (até ontem) = 90 dias para navegar com comparação completa
--          + 49 dias (7 semanas) de base para a comparação do dia mais antigo. Tamanho esperado: ~11 MB.
--
-- Regras (validadas contra o Pulse no dia 30/10: oferecidas, atendidas e abandonadas batem):
--   • uma chamada = a perna de ENTRADA NA FILA (PAPEL = 'RoutedTo'); as outras linhas são
--     transferência, consulta e conferência e duplicariam a chamada
--   • só as 83 skills da grade do Pulse (lista abaixo, a mesma da tradutora)
--   • atendida = ACDCALLS = 1 · abandonada = ABANDONED = 1 (na TEL toda chamada vem como abandonada:
--     o app usa só o volume da TEL)
--   • ESPERA inclui ~2 min de URA/roteamento antes da fila; o desconto fica no parâmetro DESC_URA_S
--     (120 s reproduziu o NS de 1 min e de 5 min do Pulse). Ajuste aqui se a calibração mudar.
--   • TMA = conversa + espera em hold + pós-atendimento (ACDTIME + HOLDTIME + AFTER_CALL_WORK_DURATION)
--   • só somas e contagens (nada de média ou %): o app junta 15 min em 30 min, 1 h ou no dia e
--     calcula TME, TMA e NS a partir das somas
--
-- Exportar (SQL Developer): rodar com Ctrl+Enter → clicar com o botão direito no resultado →
--   Exportar → Formato: "delimitado" · Delimitador: tabulação · Cabeçalho: sim · Codificação: UTF-8
--   → nome do arquivo: historico.txt
-- =====================================================================================
WITH param AS (
    SELECT 120                   AS desc_ura_s,   -- segundos de URA/roteamento descontados da ESPERA
           TRUNC(SYSDATE) - (90 + 49) AS dia_ini, -- 90 dias navegáveis + 49 de base (7 semanas) = 139 dias
           TRUNC(SYSDATE)        AS dia_fim       -- hoje (não incluído: só dias fechados)
      FROM dual
),
chamadas AS (
    SELECT h.interaction_id,
           h.vq_name,
           h.inicio_interacao_perna                                   AS momento,
           NVL(h.acdcalls, 0)                                         AS atendida,
           NVL(h.abandoned, 0)                                        AS abandonada,
           GREATEST(NVL(h.espera, 0) - p.desc_ura_s, 0)               AS espera_fila,
           NVL(h.acdtime, 0) + NVL(h.holdtime, 0) + NVL(h.after_call_work_duration, 0) AS tma,
           -- se a mesma chamada entrar duas vezes na mesma fila, conta uma vez (a primeira)
           ROW_NUMBER() OVER (PARTITION BY h.interaction_id, h.vq_name
                              ORDER BY h.inicio_interacao_perna)    AS ordem
      FROM genesys_dagent_hist_v3 h
     CROSS JOIN param p
     WHERE h.row_date >= p.dia_ini
       AND h.row_date <  p.dia_fim
       AND h.papel = 'RoutedTo'
       AND h.vq_name IN (
      'VQ_COE_CO_SUSP_REDE_EXTERNA_EXT'
    , 'VQ_COE_DEFAULT_CO_DEFAULT_SUP_FIB_V1'
    , 'VQ_COE_DEFAULT_CO_DEFAULT_SUP_FIB_V2'
    , 'VQ_COE_VIV_CO_CERT_BEATRIX_V1_EXT'
    , 'VQ_COE_VIV_CO_CERT_BEATRIX_V2_EXT'
    , 'VQ_COE_VIV_CO_DEFAULT_SUP_FIB_V1'
    , 'VQ_COE_VIV_CO_DEFAULT_SUP_FIB_V2'
    , 'VQ_COE_VIV_CO_LINHA_VOIP_FIBRASIL_SF_EXT'
    , 'VQ_COE_VIV_CO_MULTIPLAS_LINHAS_FIBRASIL_EXT'
    , 'VQ_COE_VIV_CO_MULTIPLAS_LINHAS_V1_EXT'
    , 'VQ_COE_VIV_CO_MULTIPLAS_LINHAS_V2_EXT'
    , 'VQ_COE_VIV_CO_SUP_BL_FIBRA_ATC_EXT'
    , 'VQ_COE_VIV_CO_SUP_BL_FIBRA_FIBRASIL_EXT'
    , 'VQ_COE_VIV_CO_SUP_CERT_ATC_EXT'
    , 'VQ_COE_VIV_CO_SUP_LINHA_VOIP_ATC_EXT'
    , 'VQ_COE_VIV_CO_SUP_LINHA_VOIP_FIBRASIL_EXT'
    , 'VQ_COE_VIV_CO_V1_CERT_FIBRA_EXT'
    , 'VQ_COE_VIV_CO_V1_CPA_EXT'
    , 'VQ_COE_VIV_CO_V1_LINHA_VOIP_SF_EXT'
    , 'VQ_COE_VIV_CO_V1_MANOBRA_FIBRA_BEATRIX_EXT'
    , 'VQ_COE_VIV_CO_V1_MANOBRA_FIBRA_EXT'
    , 'VQ_COE_VIV_CO_V1_SUP_BL_FIBRA_BEATRIX_EXT'
    , 'VQ_COE_VIV_CO_V1_SUP_BL_FIBRA_EXT'
    , 'VQ_COE_VIV_CO_V1_SUP_BL_METALICO_EXT'
    , 'VQ_COE_VIV_CO_V1_SUP_LINHA_VOIP_BEATRIX_EXT'
    , 'VQ_COE_VIV_CO_V1_SUP_LINHA_VOIP_EXT'
    , 'VQ_COE_VIV_CO_V2_CERT_FIBRA_EXT'
    , 'VQ_COE_VIV_CO_V2_LINHA_VOIP_SF_EXT'
    , 'VQ_COE_VIV_CO_V2_MANOBRA_FIBRA_BEATRIX_EXT'
    , 'VQ_COE_VIV_CO_V2_MANOBRA_FIBRA_EXT'
    , 'VQ_COE_VIV_CO_V2_MANOBRA_MET_EXT'
    , 'VQ_COE_VIV_CO_V2_SUP_BL_FIBRA_BEATRIX_EXT'
    , 'VQ_COE_VIV_CO_V2_SUP_BL_FIBRA_EXT'
    , 'VQ_COE_VIV_CO_V2_SUP_LINHA_SIP_EXT'
    , 'VQ_COE_VIV_CO_V2_SUP_LINHA_VOIP_BEATRIX_EXT'
    , 'VQ_COE_VIV_CO_V2_SUP_TV_METALICO_EXT'
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
    , 'VQ_COE_VIV_C_HB_HIB_SUSP_V1_REDE_EXTERNA'
        -- fora da grade do Pulse hoje (CO). Tirar o "--" quando entrarem na grade e na tradutora:
        -- , 'VQ_COE_VIV_C_HB_HIB_SUP_V1_VOIP_BEATRIX'
        -- , 'VQ_COE_VIV_C_HB_HIB_SUP_V2_VOIP_BEATRIX'
       )
)
SELECT TO_CHAR(TRUNC(momento), 'YYYY-MM-DD')                                         AS dia,
       TO_CHAR(momento, 'HH24') || ':' ||
       LPAD(TRUNC(TO_NUMBER(TO_CHAR(momento, 'MI')) / 15) * 15, 2, '0')            AS horario,
       vq_name || '@SW_SIPS_VQ'                                                      AS skill,
       COUNT(*)                                                                      AS oferecidas,
       SUM(CASE WHEN atendida = 1 THEN 1 ELSE 0 END)                                 AS atendidas,
       SUM(CASE WHEN abandonada = 1 THEN 1 ELSE 0 END)                               AS abandonadas,
       SUM(CASE WHEN atendida = 1 AND espera_fila <= 60  THEN 1 ELSE 0 END)          AS atend_60s,
       SUM(CASE WHEN atendida = 1 AND espera_fila <= 300 THEN 1 ELSE 0 END)          AS atend_300s,
       SUM(CASE WHEN atendida = 1 THEN espera_fila ELSE 0 END)                       AS soma_espera_s,
       SUM(CASE WHEN atendida = 1 THEN tma ELSE 0 END)                               AS soma_tma_s
  FROM chamadas
 WHERE ordem = 1
 GROUP BY TO_CHAR(TRUNC(momento), 'YYYY-MM-DD'),
          TO_CHAR(momento, 'HH24') || ':' || LPAD(TRUNC(TO_NUMBER(TO_CHAR(momento, 'MI')) / 15) * 15, 2, '0'),
          vq_name
 ORDER BY dia, horario, skill;


-- =====================================================================================
-- CONFERÊNCIA RÁPIDA (rodar antes, uma vez): mostra se as colunas de data guardam a HORA.
-- Se HORA_INICIO_PERNA vier 00:00:00 em todas as linhas, a tabela não tem a hora e o SELECT
-- acima precisa usar a FAIXA (blocos de 30 min) — me mande o resultado que eu ajusto.
-- =====================================================================================
SELECT TO_CHAR(inicio_interacao,       'DD/MM/YYYY HH24:MI:SS') AS hora_inicio_interacao,
       TO_CHAR(inicio_interacao_perna, 'DD/MM/YYYY HH24:MI:SS') AS hora_inicio_perna,
       TO_CHAR(fim_interacao_perna,    'DD/MM/YYYY HH24:MI:SS') AS hora_fim_perna,
       faixa, papel, vq_name, espera, acdcalls
  FROM genesys_dagent_hist_v3
 WHERE row_date = TRUNC(SYSDATE) - 1
   AND papel = 'RoutedTo'
   AND ROWNUM <= 20;

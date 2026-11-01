-- =====================================================================================
-- URA · Suporte B2C — HISTÓRICO para o app (um SELECT só: volumes, tempos e FILA)
-- Fonte: GENESYS_DAGENT_HIST_V3  ·  Banco: Oracle
-- Saída: uma linha por DIA × HORARIO (bloco de 15 min) × SKILL, quando houve chamada OU alguém esperando.
-- Período: 139 dias FECHADOS (até ontem) = 90 dias para navegar com comparação completa
--          + 49 dias (7 semanas) de base para a comparação do dia mais antigo. Tamanho esperado: ~9 MB.
--
-- Volumes (validados contra o Pulse em 30/10: oferecidas, atendidas e abandonadas batem):
--   • uma chamada = a perna de ENTRADA NA FILA (PAPEL = 'RoutedTo'); as outras linhas são
--     transferência, consulta e conferência e duplicariam a chamada
--   • só as 83 skills da grade do Pulse (lista abaixo, a mesma da tradutora)
--   • atendida = ACDCALLS = 1 · abandonada = ABANDONED = 1 (na TEL toda chamada vem como abandonada:
--     o app usa só o volume da TEL)
--   • ESPERA inclui 120 s de URA/roteamento antes da fila → parâmetro DESC_URA_S (reproduziu o NS do Pulse)
--   • TMA = conversa + espera em hold + pós-atendimento (ACDTIME + HOLDTIME + AFTER_CALL_WORK_DURATION)
--   • só somas e contagens (nada de média ou %): o app junta 15 min em 30 min, 1 h ou no dia
--
-- FILA (técnicos em espera no CO) — calibrada contra o Pulse em 30/10, chamada a chamada
-- (total 100%, erro médio 0,8 técnico por coleta, correlação 0,997; espera mais longa ±26 s):
--   • a espera TERMINA no INICIO_INTERACAO_PERNA (atendida: a perna começa quando vai para o agente)
--     ou no FIM_INTERACAO_PERNA (abandonada: quando o técnico desliga) e dura MEDIATION_DURATION;
--   • os primeiros 120 s são URA/anúncio e o Pulse não conta como fila (o mesmo DESC_URA_S);
--   • FILA = quantos estavam esperando no FIM do bloco (HORARIO + 15 min) — o mesmo retrato de 15 em 15 min
--     que o Pulse guarda nas horas fechadas; ESPERA_MAX_S = há quanto tempo o mais antigo esperava.
--   • só nas skills do CO; na TEL as colunas vêm 0.
--
-- Exportar (SQL Developer): rodar com Ctrl+Enter → botão direito no resultado → Exportar →
--   delimitado · tabulação · cabeçalho: sim · UTF-8 → historico.csv   (sem abrir no Excel antes)
-- =====================================================================================
WITH param AS (
    SELECT 120                        AS desc_ura_s,   -- segundos de URA/roteamento (NS e fila)
           TRUNC(SYSDATE) - (90 + 49) AS dia_ini,      -- 90 dias navegáveis + 49 de base = 139 dias
           TRUNC(SYSDATE)             AS dia_fim       -- hoje (não incluído: só dias fechados)
      FROM dual
),
pernas AS (
    SELECT h.interaction_id,
           h.vq_name,
           h.inicio_interacao_perna                                                AS momento,
           NVL(h.acdcalls, 0)                                                      AS atendida,
           NVL(h.abandoned, 0)                                                     AS abandonada,
           GREATEST(NVL(h.espera, 0) - p.desc_ura_s, 0)                            AS espera_fila,
           NVL(h.acdtime, 0) + NVL(h.holdtime, 0) + NVL(h.after_call_work_duration, 0) AS tma,
           NVL(h.mediation_duration, 0)                                            AS espera_total_s,
           CASE WHEN NVL(h.abandoned, 0) = 1 THEN h.fim_interacao_perna
                ELSE h.inicio_interacao_perna END                                  AS fim_espera,
           -- se a mesma chamada entrar duas vezes na mesma fila, conta uma vez (a primeira)
           ROW_NUMBER() OVER (PARTITION BY h.interaction_id, h.vq_name
                              ORDER BY h.inicio_interacao_perna)                   AS ordem
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
),
volume AS (
    SELECT TO_CHAR(TRUNC(momento), 'YYYY-MM-DD')                                     AS dia,
           TO_CHAR(momento, 'HH24') || ':' ||
           LPAD(TRUNC(TO_NUMBER(TO_CHAR(momento, 'MI')) / 15) * 15, 2, '0')         AS horario,
           vq_name,
           COUNT(*)                                                                  AS oferecidas,
           SUM(CASE WHEN atendida = 1 THEN 1 ELSE 0 END)                             AS atendidas,
           SUM(CASE WHEN abandonada = 1 THEN 1 ELSE 0 END)                           AS abandonadas,
           SUM(CASE WHEN atendida = 1 AND espera_fila <= 60  THEN 1 ELSE 0 END)      AS atend_60s,
           SUM(CASE WHEN atendida = 1 AND espera_fila <= 300 THEN 1 ELSE 0 END)      AS atend_300s,
           SUM(CASE WHEN atendida = 1 THEN espera_fila ELSE 0 END)                   AS soma_espera_s,
           SUM(CASE WHEN atendida = 1 THEN tma ELSE 0 END)                           AS soma_tma_s
      FROM pernas
     WHERE ordem = 1
     GROUP BY TO_CHAR(TRUNC(momento), 'YYYY-MM-DD'),
              TO_CHAR(momento, 'HH24') || ':' || LPAD(TRUNC(TO_NUMBER(TO_CHAR(momento, 'MI')) / 15) * 15, 2, '0'),
              vq_name
),
esperas AS (                                                   -- só CO: quando cada técnico esteve na fila
    SELECT TRUNC(e.fim_espera)                                                       AS dia,
           e.vq_name,
           e.fim_espera - (e.espera_total_s - p.desc_ura_s) / 86400                  AS entra_fila,
           e.fim_espera                                                              AS sai_fila
      FROM pernas e
     CROSS JOIN param p
     WHERE e.ordem = 1
       AND e.espera_total_s > p.desc_ura_s                     -- quem saiu antes nem chegou a esperar na fila
       AND e.vq_name IN (
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
dias AS (
    SELECT p.dia_ini + LEVEL - 1 AS dia
      FROM param p
   CONNECT BY LEVEL <= p.dia_fim - p.dia_ini
),
marcas AS (                                                    -- fim de cada bloco: 08:15, 08:30 … 21:00 (52 por dia)
    SELECT d.dia, d.dia + (8 * 60 + 15 * n.k) / 1440 AS t
      FROM dias d
     CROSS JOIN (SELECT LEVEL AS k FROM dual CONNECT BY LEVEL <= 52) n
),
fila AS (
    SELECT TO_CHAR(m.dia, 'YYYY-MM-DD')                                              AS dia,
           TO_CHAR(m.t - 15 / 1440, 'HH24:MI')                                       AS horario,   -- bloco que termina na marca
           e.vq_name,
           COUNT(*)                                                                  AS fila,
           ROUND(MAX((m.t - e.entra_fila) * 86400))                                  AS espera_max_s
      FROM marcas m
      JOIN esperas e
        ON e.dia = m.dia
       AND e.entra_fila <= m.t
       AND e.sai_fila   >  m.t
     GROUP BY m.dia, m.t, e.vq_name
)
SELECT NVL(v.dia, f.dia)                                       AS dia,
       NVL(v.horario, f.horario)                               AS horario,
       NVL(v.vq_name, f.vq_name) || '@SW_SIPS_VQ'              AS skill,
       NVL(v.oferecidas, 0)                                    AS oferecidas,
       NVL(v.atendidas, 0)                                     AS atendidas,
       NVL(v.abandonadas, 0)                                   AS abandonadas,
       NVL(v.atend_60s, 0)                                     AS atend_60s,
       NVL(v.atend_300s, 0)                                    AS atend_300s,
       NVL(v.soma_espera_s, 0)                                 AS soma_espera_s,
       NVL(v.soma_tma_s, 0)                                    AS soma_tma_s,
       NVL(f.fila, 0)                                          AS fila,
       NVL(f.espera_max_s, 0)                                  AS espera_max_s
  FROM volume v
  FULL OUTER JOIN fila f
    ON f.dia = v.dia
   AND f.horario = v.horario
   AND f.vq_name = v.vq_name
 ORDER BY dia, horario, skill;

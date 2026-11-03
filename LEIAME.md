# URA · Suporte B2C (v1.29.1)

PWA que mostra **ao vivo** as filas do Suporte B2C na URA, a partir da coleta do Pulse feita pelo MAPI.
Mesma identidade visual do Problemas Sistêmicos e do Nível de Serviço (paleta da empresa, topo roxo, menu de baixo, modo escuro).

## Como os dados chegam
- O app lê o arquivo **`pulse.json`** na raiz do site, ao lado do `index.html`.
  - Para testar outro nome: abra com `?arquivo=nome.json` no fim do endereço.
- **Quando o app confere o arquivo:**
  - a cada 1 minuto (a coleta é de 5 em 5);
  - quando a tela volta a ficar visível;
  - ao tocar em ↻.
- **Arquivo novo com problema** (JSON cortado, métrica obrigatória faltando, sem leituras):
  - o app **mantém os últimos dados válidos**;
  - mostra uma faixa vermelha com o motivo.
- **Sem conexão ou arquivo não encontrado:** usa a última cópia válida guardada no aparelho e avisa.
- **Botão de pasta** (topo): abre um JSON do próprio aparelho, para testes.
  - Nesse modo a atualização automática fica pausada.
  - ↻ volta para os dados do site.

## Formato do JSON (gerado pela coleta)
```
{ "dia": "2026-10-30",
  "metricas": [ {"id":"Current_Calls","label":"Chamadas em Espera","formato":"integer"}, … ],
  "skills":   { "VQ_…@SW_SIPS_VQ": { "SKILL_GRUPO": "…", "DIRECIONAMENTO": "CO", … } },
  "leituras": [ { "horario":"08:15", "coletado_em":"2026-10-30 08:13:05", "origem":"auto",
                  "valores": { "VQ_…@SW_SIPS_VQ": [n, n, …] } } ] }
```
- **Ordem dos valores:** os valores de cada skill seguem a ordem de `metricas`. O app procura cada métrica **pelo `id`**: se a ordem mudar, nada quebra.
- **Métricas obrigatórias:**
  - `Current_Calls`, `Curr_Max_Wait_Time`, `Current_Logged_In`, `Current_Ready`;
  - `Distinct_Entered`, `Answered`, `Average_Handle_Time`, `Average_Wait_Time`;
  - `Answered_less_300s`, `Abandoned`.
- **Tempos** em segundos inteiros. **EWT `10000`** = "sem agente".
- **`horario`** é o slot agendado e o eixo X.
  - `coletado_em` só desempata quando o mesmo slot vem repetido: fica a coleta mais perto do horário do slot.
- **Skill sem tradução:** aparece como "SEM TRADUÇÃO", com aviso no fim da página, e não entra no CO nem na TEL.
- **Skill que some de uma leitura:** repete o valor anterior, com aviso. Contador acumulado não pode voltar.

## Contas
- **Contadores acumulados do dia:** o volume de um intervalo é o valor do fim menos o do início. A soma dos intervalos dá o total do dia.
- **NS do dia** = atendidas em até 300s ÷ oferecidas, a mesma regra do Pulse.
- **NS e abandono de um intervalo:** ÷ chamadas **finalizadas** no intervalo (atendidas + abandonadas).
  - Uma chamada pode entrar num intervalo e ser atendida no seguinte.
  - Dividir pelas oferecidas do intervalo passaria de 100%.
- **TMA/TME de grupo:** média ponderada pelas atendidas. No intervalo, são reconstruídos pela diferença dos totais.
- **Agentes nunca são somados**, porque são compartilhados entre skills. O app usa o maior valor de uma skill.
- **Meta do NS:** 90%, igual ao painel de Nível de Serviço do B2C.
  - **Meta atingida:** NS igual ou acima da meta.
  - **Em atenção:** de 70% até a meta.
  - **Crítico:** abaixo de 70%.
  - Para mudar, altere `META_NS` e `LIM_ATENCAO` no `app.js`.
- **1ª coluna do dia:** se não houver leitura das 08:00, ela inclui o que entrou antes da primeira coleta, e o app avisa.

## Telas
0. **Alarmes** (a primeira; o app abre nela): veja "Página Alarmes" abaixo.
1. **Agora:**
   - NS do CO em destaque, com a situação;
   - oferecidas, abandonadas, fila agora, TME/TMA, últimos 15 min e agentes disponíveis;
   - lista das **filas com chamadas em espera**: a mais antiga primeiro, com cor por tempo (até 2 min, 2 a 5 min, acima de 5 min);
   - **hora atual de 5 em 5 min** (CO + TEL);
   - tabelas por grupo do CO e da TEL. Tocar num grupo abre a Evolução já filtrada.
2. **Evolução:**
   - **CO / TEL / Total URA**;
   - eixo em **Auto, 15 min, 30 min, 1 h ou 2 h**. O Auto escolhe o menor intervalo que cabe na tela sem poluir, e a escolha fica salva no aparelho;
   - filtro por grupo;
   - gráficos de oferecidas (com a parte abandonada), **técnicos em espera**, **técnicos atendidos direto**, NS por intervalo (com meta), abandono e TME;
   - **técnicos em espera:** o **pico** do intervalo, ou seja, o maior número de técnicos de campo esperando ao mesmo tempo nas coletas do intervalo.
     - Numa coleta, as chamadas em espera **somam** entre as skills, porque cada chamada fica numa fila só.
     - Ao longo do tempo **não somam**: a fila é um retrato, e por isso vale o maior valor.
     - A cor mostra a espera mais longa: até 2 min, de 2 a 5 min, ou acima de 5 min. A bolinha verde indica intervalo sem fila.
     - Horas fechadas têm uma coleta a cada 15 min; a hora atual, uma a cada 5. Um pico entre duas coletas não aparece.
   - **atendidos direto:** atendidas em até 1 min ÷ atendidas no intervalo;
   - tabela de intervalos.
   - **Seleção:** tocar numa coluna ou linha seleciona o intervalo nos gráficos, nos cards e na tabela.
3. **Skills:**
   - CO ou TEL, agrupadas pelo **nome simplificado da tradutora**, com busca;
   - o detalhe mostra os números do dia, o gráfico, as skills do Pulse que formam o grupo e os campos da tradutora.

## Histórico (base Genesys)
- **Arquivo:** `historico.csv` na raiz do site, gerado pelo SELECT `historico_ura_b2c` (Oracle, tabela `GENESYS_DAGENT_HIST_V3`).
  - Período: **139 dias fechados** = 90 dias para navegar com comparação completa + 49 dias (7 semanas) de base. Cerca de 7,5 MB.
  - Colunas: `DIA;HORARIO;SKILL;OFERECIDAS;ATENDIDAS;ABANDONADAS;ATEND_60S;ATEND_300S;SOMA_ESPERA_S;SOMA_TMA_S`.
  - Separador `;` ou tabulação; data `dd/mm/aaaa` ou `aaaa-mm-dd`; uma linha por dia × bloco de 15 min × skill.
  - Atualizar uma vez por dia (subir o arquivo novo no lugar do anterior). Para testar outro nome: `?historico=nome.csv`.
- **Regras do SELECT** (validadas contra o Pulse em 30/10): só a entrada na fila (`PAPEL = 'RoutedTo'`), só as skills da grade,
  atendida = `ACDCALLS = 1`, abandonada = `ABANDONED = 1`, espera com desconto de 120 s de URA (`ESPERA − 120`).
- **No app:** o histórico é baixado no início e conferido a cada 1 h; se vier com problema, continua o último válido.
  Sem o arquivo, o app funciona igual, só sem navegação e comparação. O botão de pasta também abre um `.csv` de histórico (testes).
- Um dia do histórico é convertido para o mesmo formato do `pulse.json` (leituras acumuladas a cada 15 min, 08:00–21:00),
  então todas as telas e contas servem para os dois. **O histórico não tem fila** (técnicos em espera): esse gráfico só aparece no dia ao vivo.

## Arrastar para o lado
- Arrastar a tela para a esquerda/direita troca de aba: Agora ⇄ Evolução ⇄ Skills. A tela acompanha o dedo; soltando
  depois de ~70 px (ou num arrasto rápido) entra a aba vizinha deslizando; antes disso, volta para o lugar.
- Não troca quando o gesto é mais vertical (rolar), quando começa na faixa de grupos ou numa tabela larga (que rolam
  para o lado), com um menu aberto ou com o detalhe da skill aberto. Sem animação para quem pediu menos movimento.

## Total URA · CO · TEL (as três telas)
- Um filtro só para Agora, Evolução e Skills: escolher em qualquer tela vale nas outras. Começa em Total URA (primeira
  opção em todas). Trocar de atendimento limpa o filtro de grupo/skill e a coluna selecionada.

## Gráficos sem cards (Evolução e Agora)
- **Horas | Dia** (botão à direita na barra de data): em "Horas", o dia em horários (como sempre). Em "Dia", o eixo
  recebe dias — cada coluna é um dia inteiro (o dia do Pulse vai até a última coleta).
  - Controles: atendimento e **quantidade de dias** (7 a 13; começa em 7 e a escolha fica lembrada no aparelho).
  - A chave Previsto escolhe os dias: **Corridos** (dias seguidos até a data escolhida) ou **dom a dom** (só o mesmo dia
    da semana, ex.: sábado com sábado). **Desligado**: dias seguidos, sem a linha.
  - Previsto = **linha reta na mediana dos dias do gráfico** (cada gráfico com os seus valores; sem o dia em andamento).
    A mediana não se deixa puxar por dias extremos. No rodapé, "mediana por dia"; embaixo do título, o total dos dias.
  - A tabela vira "Dias".
- **Em espera** (todas as vistas): em cada coluna, o % das oferecidas do CO que enfrentaram fila (em cima) e o
  pico de técnicos esperando (embaixo).
- **Controles** (Evolução): três botões sempre à vista e presos no topo com a data e os grupos — atendimento ·
  modo · eixo. Cada um abre um menu suspenso com as opções (a atual marcada); escolher aplica e fecha; tocar fora ou
  Esc fecha sem mudar. Não há mais abrir/recolher nem alfinete.
- Os cards saíram: cada gráfico traz, embaixo do título (centralizado), o **total do período** (roxo, um pouco mais
  claro que o título) — o dia até agora na
  Evolução; a hora até agora na aba Agora — e um detalhe (ex.: "CO 1.562 · TEL 2.808"). No NS, o NS do período.
- Na linha do (i), em letra bem pequena, a **comparação com a mediana** ("med. 7 sex: 4.480 −2%"); o filtro de
  grupo/skill fica embaixo dela.
- No Total URA, depois das oferecidas: **Oferecidas TEL** e **Oferecidas CO** — o do CO encabeça os gráficos que só o
  CO tem (fila, atendidos direto, NS, abandono, TME, TMA).
- Em espera: maior fila do período e **% que enfrentou fila** = atendidas depois de 1 min ÷ oferecidas do CO.
- Abandono zero na coluna: o mesmo visto verde da fila zerada.
- Títulos curtos (numa linha só em 360 px): "TME por intervalo", "TMA por intervalo", "NS (5 min) por intervalo".
- Aba Agora: fica só o card do **NS do dia**; os agentes disponíveis foram para a linha da "Em espera agora".

## Página Alarmes (a primeira aba)
**Nomes padronizados** (iguais nos gráficos, tabelas, cartões e alarmes): Oferecidas · Em espera · Atendidos direto ·
NS · Abandonadas · TME · TMA. Cada alarme mostra o nome do indicador e o número na mesma linha, os dois na cor do nível
(rosa = crítico, laranja = em atenção, verde = normal); embaixo, nas cores normais do texto, o que aconteceu (menor,
em negrito) e o detalhe.

Junta num cartão só o que está fora do normal, **sempre no Total URA**. O app abre nesta página. A aba tem uma
bolinha no canto do ícone com a quantidade de alarmes ativos da visão escolhida (rosa se houver crítico, laranja se
só houver em atenção; some quando não há nenhum).

- **Chave Agora · Hoje** (no topo, sempre começa em **Agora**):
  - **Agora** = a hora aberta (de HH:00 até a última coleta; na virada da hora, a hora anterior). Mostra se o problema
    continua e quando volta ao normal.
  - **Hoje** = o dia até a última coleta (o acumulado).
  - Cada botão tem uma bolinha no canto superior direito com quantos alarmes estão ativos naquela visão (rosa se
    houver crítico, laranja se só em atenção).
  - Embaixo dos botões, o título **Alarmes** com "ativos/ligados" à direita (ex.: 2/12 = 2 tipos de alarme ativos
    entre os 12 ligados na configuração da visão escolhida). Dentro do cartão, o título é **Agora** ou **Hoje**.
- **Previsto** = mediana dos dias da chave Previsto (7 mesmos dias da semana ou 7 dias corridos) **no mesmo trecho do
  dia** (a mesma hora até o mesmo minuto, ou o dia até o mesmo horário). Com o previsto desligado, os alarmes usam os
  mesmos dias da semana. Sem previsto ou com poucas chamadas, a regra aparece como "sem dado para avaliar".
- **Verificações normais**: uma cápsula por linha com o nome, o número atual (à direita) e a referência embaixo do
  nome (meta, mediana do previsto ou limite). Ex.: "NS · meta 90% · med. 100,0% · 100,0%".
- **Tocar num alarme**: a regra, onde mais pesa e os botões **Ver na Evolução ›** (o gráfico do alarme, já no CO/TEL e
  no grupo dele) e **Silenciar 1 h**.
- **Engrenagem** (canto do cartão): lista dos 12 alarmes com uma coluna para **Agora** e outra para **Hoje**, e a linha
  **Todos** em cada coluna. Desligar um alarme tira ele da visão (e da bolinha); o cartão avisa quantos estão
  desligados. Fica guardado no aparelho.
- **Guardado no aparelho, separado por visão** (recomeça a cada dia): desde quando cada alarme está ativo, o último
  encerrado e os silenciados.

Limites iniciais (modelo para ajustar; ficam todos em `LIM` no começo do `alarmes.js`, um bloco por visão):

| Alarme | Agora (hora aberta) | Hoje (dia) |
|---|---|---|
| NS (CO) | < 90% atenção; < 70% crítico (≥ 15 finalizadas) | < 90% atenção; < 70% crítico (≥ 20) |
| Volume (URA) × previsto | +25%/−30% atenção; +50%/−50% crítico (previsto ≥ 20) | +15%/−20% atenção; +30%/−35% crítico (previsto ≥ 100) |
| Abandono (CO) | abandonos **a mais** que o previsto: 3 atenção, 6 crítico (e +20%/+40% quando o previsto passa de zero; ≥ 15 finalizadas) | +20% atenção; +40% ou ≥ 10% das oferecidas crítico |
| Fila (CO) | mais antiga ≥ 2 min atenção; ≥ 5 min ou 15 esperando crítico; **fila fora do comum**: maior fila da hora 3 acima da mediana do horário, ou alguém esperando num horário em que no máximo 1 dos dias de comparação teve fila = atenção | maior fila do dia × mediana das maiores filas: +50% atenção, +100% crítico (≥ 5 técnicos de diferença) |
| Fila sem agente | skill com espera e 0 disponível (atenção) | igual |
| TME (CO) × previsto | +25% atenção; +50% crítico (e ≥ 60 s a mais; ≥ 15 finalizadas) | +25%/+50% (e ≥ 30 s a mais) |
| TMA (CO) × previsto | +25%/+50% (e ≥ 30 s a mais) | igual |
| Atendidos direto (CO) | −10 p.p. atenção; −20 p.p. crítico | igual |
| Grupos (um alarme por grupo) | +50% atenção; +100% crítico (previsto ≥ 10) | +30%/+60% (previsto ≥ 50) |
| Skills sem chamadas | nenhuma chamada nos últimos 60 min com normal ≥ 5 (atenção) | igual |
| CO/TEL (parte da TEL) | ±10 p.p. atenção; ±20 p.p. crítico (≥ 20 oferecidas) | igual (≥ 100) |
| Coleta (só hoje, no expediente) | sem coleta há 10 min atenção; 20 min crítico | igual |

## Resumo dos alarmes do dia (Evolução)
Cartão **Alarmes do dia**, o último item da Evolução (depois da tabela de intervalos). Acompanha a data da barra de cima: num dia do histórico
é o **fechamento do dia**; no dia do Pulse, o dia até a última coleta. Usa as mesmas regras da visão Hoje da página
Alarmes, com o previsto da chave Previsto.

- Simplificado e fixo: **uma linha por tipo de alarme, sempre na ordem da configuração**, com o ícone do nível
  (crítico, em atenção, normal ou sem dado), o nome e o número na cor do nível e a referência embaixo. Ao trocar de dia
  a lista não muda de lugar, só os números e as cores: dá para ver a movimentação de um dia para o outro.
- Três cápsulas no topo servem de filtro: **críticos**, **atenção** e **normais**. Tocar numa filtra; com uma marcada,
  as outras ganham um **+** no canto e tocar nelas soma ao filtro (ex.: críticos + atenção). Tocar numa marcada tira
  só ela; o **X** à direita limpa tudo. O filtro continua ao trocar de dia.
- Engrenagem: a mesma configuração da página Alarmes, com uma coluna própria **Evolução**.
- Em dias passados, Em espera sem agente, Skills sem chamadas e Coleta aparecem como "só vale no dia de hoje":
  são retratos do momento que o histórico não tem.

## Aba Agora
- No topo, os botões **Total URA · CO · TEL** (os mesmos da aba Skills, na ordem da Evolução); começa sempre em Total URA.
  - Total URA: NS do CO, Oferecidas URA (CO e TEL), abandonadas, em espera, TME, últimos 15 min (CO + TEL), agentes.
  - CO: os cards do CO. TEL: só o volume (sem NS, fila ou tempos — a TEL é atendida em outro sistema).
- Embaixo da hora atual, a **tabela de intervalos** igual à da Evolução, de 15 em 15 min, mais recente primeiro; segue o
  atendimento escolhido e o filtro do painel de grupos (escrito em cima da tabela). Mostra as **9 mais recentes**; o
  botão "Ver o dia todo · mais N intervalos" abre o resto (e "Mostrar só os 9 mais recentes" recolhe). A 1ª linha fica com
  um listrado bem claro no fundo enquanto a hora dela não fechou (coleta das 19:15 → a linha das 19:00, da hora 19h).
- Saíram as tabelas "CO por grupo"/"TEL por grupo" e a parte "TEL · Parceira" (o painel "Grupos e skills" e os botões
  do topo cobrem o mesmo).

### Hora atual
- Os MESMOS gráficos da Evolução (oferecidas, técnicos em espera, atendidos direto, NS, abandono, TME, TMA), só da hora
  atual, de 5 em 5 min. Logo depois da virada (última coleta às HH:00), a última hora fechada, de 15 em 15.
- As colunas que ainda não chegaram ficam vazias, com o previsto (mediana, mesma chave Previsto) já desenhado até o fim
  da hora; as barras vão preenchendo a cada coleta. De 5 em 5 min o previsto divide cada bloco de 15 min do histórico
  em 3 partes iguais (aproximação); a fila prevista fica entre os retratos de 15 min.
- 1º gráfico, sem seleção: a hora até agora × previsto até agora, e o previsto da hora inteira.
- Toque numa coluna seleciona em todos os gráficos da hora (com a mediana daquela coluna); colunas futuras não selecionam.
- Painel "Grupos e skills" da hora, igual ao da Evolução. O filtro (grupo/skill) vale só para a aba Agora; os cards
  do topo continuam do dia inteiro (mudam só com os botões Total URA · CO · TEL).

## Painel "Grupos e skills" (Evolução, depois dos gráficos)
- Um grupo por linha: nome e quantidade (oferecidas, CO + TEL) na mesma linha; barra com a parte do volume
  (CO roxo, TEL azul); embaixo, em letra pequena e itálico: **N skills** (negrito), NS (5 min), abandonadas, TME e TMA do CO.
- Ordem: do maior para o menor número de oferecidas MOSTRADO — do dia (ou da coluna selecionada) na Evolução; da hora
  na aba Agora. Filtrar não muda a ordem (o painel não se filtra).
- "N skills" abre as skills do grupo (fundo mais escuro; barra = parte do grupo). Skill = nome simplificado da tradutora.
- Tocar na faixa de cima da linha (nome, número ou barra) do grupo ou da skill filtra a tela inteira (gráficos, cards, previsto, tabela); de novo, limpa.
  O painel não se filtra (continua mostrando tudo e marca o escolhido) e a linha tocada não sai do lugar na tela.

## Fila do histórico (técnicos em espera)
- **Um SELECT só** (`sql/historico_ura_b2c.sql`) gera o `historico.csv` com volumes, tempos E a fila:
  duas colunas no fim, `FILA;ESPERA_MAX_S` = técnicos esperando no FIM do bloco (HORARIO + 15) e há quanto tempo
  o mais antigo esperava. Só no CO (na TEL vêm 0). Linha também quando só havia fila (volumes 0).
- Regra (calibrada contra o Pulse em 30/10, chamada a chamada): a espera termina no INICIO_INTERACAO_PERNA (atendida)
  ou no FIM_INTERACAO_PERNA (abandonada) e dura MEDIATION_DURATION; os primeiros 120 s são URA e não contam como fila.
  Resultado no CO: total 100%, erro médio 0,8 técnico por coleta, correlação 0,997; espera mais longa ±26 s.
- É o retrato de 15 em 15 min que o Pulse guarda nas horas fechadas: o dia ao vivo e o histórico comparam a mesma coisa.
- Com a fila: gráfico de técnicos em espera nos dias do histórico, card "Pico em espera", coluna Fila na tabela e
  previsto (mediana) na fila — inclusive no dia ao vivo e no "Em espera agora" da aba Agora.
  Dia com a coluna FILA vazia (ou histórico no formato antigo, sem as colunas) fica com o cartão explicando.
- Compatível com o formato antigo (fila em `historico_fila.csv` separado), que só é procurado se o
  `historico.csv` não tiver as colunas.

## Previsto até agora (coluna em andamento e aba Agora)
- O histórico é de 15 em 15 min; o Pulse anda de 5 em 5. Para comparar "até agora", os outros dias são cortados no MESMO
  minuto da última coleta, **proporcional** dentro do bloco de 15 min (19:20 = até 19:15 + 1/3 do bloco 19:15–19:30).
  Percentuais e tempos saem das somas parciais (não da média das médias).
- **Evolução:** a coluna em andamento também tem previsto (a área vai até ela); ao tocar, "mediana 7 sextas até 19:15".
  Os cards do dia comparam com os outros dias até o mesmo minuto.
- **Agora:** chave Previsto (a mesma da Evolução) acima da hora atual; "med." no NS do dia, Oferecidas CO, Abandonadas, TME,
  Últimos 15 min e na TEL. Fila e agentes não têm (o histórico não guarda).
  Hora atual: área do previsto na hora INTEIRA (CO + TEL), já desenhada até o fim; as barras vão preenchendo.
  De 5 em 5 min cada bloco de 15 é dividido em 3 partes iguais (aproximação, avisada no (i)).
  Embaixo: oferecidas até agora × previsto até agora e o previsto para a hora inteira.

## Seleção inicial da Evolução
- Ao abrir o app, a Evolução começa sempre nas primeiras opções de cada linha (as da esquerda):
  **Total URA** · **Por intervalo** · **Auto**. Ordem dos botões de atendimento: Total URA, CO, TEL.
  As trocas valem enquanto o app está aberto; reabrir volta para esse início. (Previsto e controles fixados continuam lembrados.)

## Navegação por dia e comparação (Evolução)
- **Barra de data** acima dos controles: ‹ dia ›, a data inteira em destaque ("qui, 29/10/2026"; domingo na cor do NS
  crítico), toque na data para escolher no calendário, botão "Hoje" para voltar.
  O dia do `pulse.json` vem **sempre do Pulse**; os outros vêm do histórico (borda roxa). A origem não fica na barra:
  aparece no rodapé por alguns segundos ao entrar na Evolução e sempre que muda ("Ao vivo · Pulse", "Pulse",
  "Histórico · Genesys"). O histórico só vale para trás: dias iguais ou posteriores ao dia do Pulse ficam de fora.
  A coluna selecionada continua ao trocar de dia, e a tela não pula: o gráfico que está à vista fica no mesmo lugar
  (se ele não existir no outro dia, como a fila no histórico, o seguinte ocupa o lugar dele).
- **Previsto** (chave acima do primeiro gráfico, vale para todos, três botões da mesma largura):
  **7 dias** (os 7 dias corridos anteriores) · **7 sex** (os 7 mesmos dias da semana anteriores; padrão) ·
  **Desligado** (gráficos e cards limpos). Aparece quando há histórico; a escolha fica lembrada no aparelho.
- **Mediana**, não média: um feriado ou um dia de pico não puxa a referência.
  - Gráficos: área bem clara, na cor do gráfico, com linha suave, ATRÁS das barras = o previsto para o horário.
    Barra acima da área = acima do previsto.
  - Cards: "med. 7 sex" com a diferença (% em volume e tempo; p.p. em percentual). Sem seleção, o dia até a hora da última
    coleta contra os outros dias até a mesma hora; com coluna selecionada, a coluna.
  - Resumo da coluna selecionada: "mediana 7 sextas: X".
  - A coluna em andamento não tem mediana (comparar parte do intervalo com o intervalo inteiro enganaria).
  - Perto do início do histórico há menos dias de referência: a legenda mostra quantos e quais dias entraram.

## Compartilhar o link (WhatsApp, Teams)
O `index.html` tem as etiquetas de prévia de link (Open Graph): ao colar o endereço
`https://vivo61991-tech.github.io/ura-atendimento/` numa conversa, aparece a imagem `icons/compartilhar.png`
(1200×630, com o ícone e o nome do app), o título e a descrição. O endereço da imagem precisa ser completo: se o app
mudar de endereço, troque nas etiquetas `og:url`, `og:image`, `og:image:secure_url`, `twitter:image` e `image_src`.
O WhatsApp e o Teams guardam a prévia de links já enviados; para ver a nova, envie o link com algo no fim
(ex.: `…/ura-atendimento/?v=2`).

## Versões
- **1.29.1:** prévia do link com o ícone do app ao compartilhar no WhatsApp e no Teams (etiquetas Open Graph e imagem `icons/compartilhar.png`).
- **1.29.0:** filtro do resumo da Evolução com combinação: "+" no canto das cápsulas não marcadas para somar ao filtro.
- **1.28.2:** resumo da Evolução só com as três cápsulas (críticos, atenção, normais), numa linha; tocar de novo desmarca e o X limpa o filtro.
- **1.28.1:** o resumo "Alarmes do dia" passa a ser o último item da Evolução.
- **1.28.0:** resumo dos alarmes do dia na Evolução (acompanha a data, lista fixa com ícones, cápsulas de filtro Todos/críticos/em atenção/normais); configuração com a coluna Evolução.
- **1.27.0:** bolinhas com a quantidade nos botões Agora e Hoje; título "Alarmes" fora do cartão com ativos/ligados (ex.: 2/12); o cartão passa a se chamar Agora ou Hoje.
- **1.26.1:** só o nome do indicador e o número ficam na cor do nível; o texto de baixo volta às cores normais.
- **1.26.0:** alarmes críticos e em atenção no formato das normais (nome e número na cor do nível, complemento menor em negrito na mesma cor); nomes padronizados em gráficos, tabelas, cartões e alarmes: Oferecidas, Em espera, Atendidos direto, NS, Abandonadas, TME, TMA.
- **1.25.1:** verificações normais em lista, uma cápsula por linha, com o número atual e a referência (meta, mediana ou limite) que mostra que está normal.
- **1.25.0:** alarmes numa página própria, a primeira (bolinha com a quantidade no ícone); chave Agora (hora aberta) · Hoje (dia) com regras próprias, incluindo "fila fora do comum para o horário"; engrenagem para ligar/desligar cada alarme em cada visão.
- **1.24.0:** painel de alarmes (na aba Agora, acima do NS; passou para a página própria na 1.25.0) (13 verificações, detalhe ao tocar, Ver na Evolução, silenciar 1 h, "desde" e último alarme guardados no aparelho).
- **1.23.0:** arrastar para o lado troca de aba (Agora ⇄ Evolução ⇄ Skills), com a tela acompanhando o dedo.
- **1.22.4:** número embaixo do título de cada gráfico numa cápsula roxa bem clara (leve destaque).
- **1.22.3:** painel Grupos e skills ordenado pelas oferecidas mostradas (da hora na Agora; do dia ou da coluna selecionada na Evolução).
- **1.22.2:** listrado da linha aberta preso à própria linha (sem impressão de movimento ao rolar) e contínuo entre as células.
- **1.22.1:** a 1ª linha da tabela de 15 min fica listrada enquanto a HORA dela não fechou (não só o intervalo de 15 min).
- **1.22.0:** tabela de 15 min da aba Agora com as 9 linhas mais recentes e botão para ver o dia todo; intervalo ainda aberto com listrado bem claro.
- **1.21.0:** Total URA · CO · TEL sincronizado entre Agora, Evolução e Skills; na Skills, Total URA primeiro e padrão.
- **1.20.1:** painel Grupos e skills: a faixa de cima inteira da linha (nome, número e barra) filtra; "N skills" continua só abrindo a lista.
- **1.20.0:** vista por dia com botão de quantidade de dias (7 a 13, lembrada) no lugar dos botões apagados; previsto por dia vira linha reta na mediana dos dias do gráfico; % que enfrentou fila em cada coluna dos técnicos em espera.
- **1.19.0:** botão Horas | Dia na barra de data: eixo por dia (dias corridos ou o mesmo dia da semana, pela chave Previsto), com previsto por dia e tabela de dias.
- **1.18.0:** controles em três botões com menu suspenso, sempre presos no topo (sem abrir/recolher e sem alfinete); domingo na cor do NS crítico; total dos gráficos menor, mais perto do título e em roxo.
- **1.17.0:** sem cards: total do período embaixo do título de cada gráfico e a mediana no rodapé; gráficos Oferecidas TEL e Oferecidas CO no Total URA; % que enfrentou fila; visto no abandono zero; títulos centralizados e curtos (TME/TMA). Na Agora fica só o card do NS.
- **1.16.0:** aba Agora com os botões Total URA · CO · TEL no topo e a tabela de intervalos de 15 min (igual à da Evolução); saem as tabelas por grupo e a parte TEL · Parceira.
- **1.15.0:** aba Agora com os mesmos gráficos da Evolução na hora atual (previsto até o fim da hora, barras preenchendo) e o painel Grupos e skills da hora, com filtro próprio.
- **1.14.0:** barra de data só com a data inteira, maior; domingo em vermelho escuro; origem (Pulse / Histórico · Genesys) como aviso no rodapé ao trocar.
- **1.13.0:** painel "Grupos e skills" na Evolução: barra, volume, NS/abandono/TME/TMA, skills expansíveis e filtro por grupo ou skill sem mexer na rolagem.
- **1.12.0:** um SELECT só: a fila virou duas colunas do historico.csv (FILA, ESPERA_MAX_S); sai o historico_fila.sql/csv. Mesmo resultado do formato separado (conferido nos 139 dias: zero diferenças).
- **1.11.0:** fila do histórico (historico_fila.csv, refeita pelo Genesys e calibrada contra o Pulse): gráfico de técnicos em espera nos dias do histórico, previsto na fila e mediana no "Pico em espera" e no "Em espera agora".
- **1.10.0:** previsto proporcional até o minuto da última coleta: coluna em andamento da Evolução, cards do dia; aba Agora com chave Previsto, "med." nos cards e área do previsto na hora atual inteira, com resumo até agora × previsto e previsto da hora.
- **1.9.4:** num dia do histórico, o cartão "Em espera" continua no lugar explicando que o Genesys não guarda a fila, com botão para ir ao dia do Pulse (antes o gráfico simplesmente sumia).
- **1.9.3:** Evolução abre sempre em Total URA · Por intervalo · Auto; botões na ordem Total URA, CO, TEL (o eixo não fica mais lembrado).
- **1.9.2:** sem a linha do NS acumulado no gráfico de NS; trocar a data (ou o previsto, ou tocar numa coluna) não mexe na rolagem; chave Previsto com 3 botões iguais: 7 dias · 7 dom/seg… · Desligado; barra de data do histórico em roxo (sem o azul).
- **1.9.1:** dia do Pulse sempre do Pulse (histórico só para trás); previsto como área clara atrás das barras; chave "Previsto" (7 dias corridos / 7 mesmos dias da semana) acima do primeiro gráfico, fora dos controles.
- **1.9.0:** histórico da base Genesys (139 dias): navegação por dia na Evolução e comparação pela mediana dos 7 dias corridos ou dos 7 mesmos dias da semana (linha nos gráficos, cards e resumo da seleção).
- **1.8.4:** técnicos atendidos direto: a altura das colunas passa a ser a QUANTIDADE de técnicos atendidos em até 1 min também no modo Por intervalo (antes era o %); o rótulo continua com o % em cima e a quantidade embaixo.
- **1.8.3:** texto do filtro no rodapé dos gráficos centralizado no cartão; o (i) continua no canto direito.
- **1.8.2:** rodapé dos gráficos da Evolução mostra, discreto e na linha do (i), o filtro aplicado: "CO"/"TEL", "CO – GRUPO"; no Total URA nada, ou só o grupo (com "CO –"/"TEL –" quando o grupo só existe num dos atendimentos). Com coluna selecionada, o resumo fica em cima e essa linha embaixo.
- **1.8.1:** nível de serviço passa a ser lido como **5 min** (antes "300s") em todos os rótulos; avisos laranja do topo (dados de outro dia, sem coleta nova, falha ao ler o site) ganham um X para fechar — ficam fechados enquanto o motivo for o mesmo e voltam ao reabrir o app. O aviso vermelho de arquivo com problema não fecha.
- **1.8.0:** detalhe da skill com o cartão "No volume da URA": **representatividade** (% das oferecidas da URA no dia, CO + TEL, e % do próprio atendimento) e **rank** entre as mais acionadas (posição na URA, de N skills, e posição no CO ou na TEL; empate divide a posição).
- **1.7.3:** lista de Skills padronizada: oferecidas em destaque em todas; embaixo, menor, o NS colorido pela situação (CO) ou o % do volume (TEL).
- **1.7.2:** aba Skills com a opção **Total URA** (todas as skills, CO e TEL juntas, do maior volume para o menor), cada uma com a etiqueta CO ou TEL; CO mostra o NS e TEL o volume e o % da URA; o detalhe abre no formato do atendimento da skill.
- **1.7.1:** com uma coluna selecionada, os botões de grupo mostram as oferecidas daquela coluna (no intervalo, ou acumuladas até ela no Acumulado), em laranja de seleção; trocar de grupo não tira mais a seleção — os gráficos mudam de grupo mantendo o mesmo horário. A ordem dos botões continua pelo volume do dia.
- **1.7.0:** alfinete para **fixar** os controles da Evolução (só aparece com os controles abertos, à esquerda da seta). Fixados, os controles e a faixa de grupos ficam presos logo abaixo do topo ao rolar, abertos ou recolhidos; a escolha fica lembrada no aparelho.
- **1.6.1:** controles recolhidos com a mesma cara do botão marcado aberto (retângulo de canto arredondado, roxo) e dividindo toda a largura do cartão até a seta.
- **1.6.0:** controles da Evolução (CO/TEL/Total, Por intervalo/Acumulado, eixo) recolhíveis: começam sempre recolhidos numa linha fina com só o que está escolhido; a seta no canto inferior direito (ou um toque na linha) abre e recolhe. A seleção de coluna continua visível com os controles recolhidos.
- **1.5.3:** na faixa de grupos da Evolução, o grupo selecionado corre (com animação) para a esquerda e fica lá, mesmo quando a tela se redesenha ou os dados atualizam; tocar no grupo selecionado desmarca e volta para "Todos os grupos".
- **1.5.2:** tabelas "CO por grupo" e "TEL por grupo" responsivas: na tela larga, uma linha por grupo; até 540 px, todas as linhas em duas (nome em cima, sem quebrar; números embaixo, alinhados ao cabeçalho), todas da mesma altura.
- **1.5.1:** botões de grupo da Evolução mostram as oferecidas do dia à direita do nome ("Todos os grupos" = total do atendimento escolhido), ordenados do maior volume para o menor; grupos zerados em cinza.
- **1.5.0:** atendidos direto e abandono mostram o % (maior) e a quantidade (menor, embaixo); no Acumulado a altura dessas colunas passa a ser a QUANTIDADE somada no dia (cresce ao longo do dia), com o % no rótulo. NS e TME continuam médias. Novo gráfico de TMA (tempo médio de atendimento), por intervalo e acumulado.
- **1.4.0:** modo **Acumulado** na Evolução (botões Por intervalo / Acumulado; sempre abre em Por intervalo). No acumulado cada coluna mostra o total do dia até o horário dela (NS e abandono ÷ oferecidas, como no Pulse; técnicos em espera = maior fila do dia até ali); tabela "Acumulado do dia". Rótulos das colunas diminuem quando o texto não cabe.
- **1.3.1:** menos espaço em branco embaixo dos gráficos (eixo mais baixo, botão (i) menor e rodapé mais justo); linha do NS acumulado suave (curva monotônica, sem picos inventados) em roxo escuro da empresa.
- **1.3.0:** ao selecionar uma coluna, cada gráfico mostra, centralizado, o período e só os valores dele (oferecidas: volumes; técnicos em espera: pico e espera mais longa; atendidos direto: % até 1 min; NS: NS do intervalo e acumulado do dia; abandono: %; TME: tempos).
- **1.2.0:** legenda e explicações de cada gráfico escondidas atrás do botão (i) no canto inferior direito; tocar abre, tocar de novo recolhe; só um aberto por vez (abrir outro fecha o anterior; trocar de aba fecha). O resumo do intervalo selecionado continua à vista.
- **1.1.1:** colunas empilhadas desenhadas como uma barra só: cantos arredondados apenas na base e no topo da coluna, emenda reta entre as cores.
- **1.1.0:** técnicos em espera por intervalo (pico, com cor pela espera mais longa) e técnicos atendidos direto (até 1 min); KPIs e coluna "Fila" na tabela de intervalos.
- **1.0.0:** primeira versão: abas Agora, Evolução e Skills.

## Arquivos
| Arquivo | Papel |
|---|---|
| `index.html` | estrutura e estilos (paleta, modo escuro), CSP |
| `dados.js` | leitura, validação e contas (roda no Node para os testes) |
| `historico.js` | leitura do `historico.csv`, dia do histórico no formato do Pulse, referências e mediana |
| `alarmes.js` | regras e limites do painel de alarmes (roda no Node para os testes) |
| `historico.csv` | histórico (base Genesys) — trocado uma vez por dia |
| `graf.js` | gráfico de colunas em SVG |
| `app.js` | telas, atualização automática, cópia no aparelho |
| `sw.js` | cache offline só deste app (caches `ura-b2c-v…`); o `.json` de dados nunca passa pelo cache |
| `manifest.webmanifest`, `icons/` | instalação no celular; `icons/compartilhar.png` é a imagem da prévia do link |
| `tests/` | `dados.test.js` (contas), `graf.test.js` (desenho das colunas), `tela.js`, `robustez.js`, `info.js`, `selecao.js`, `modo.js`, `chips.js`, `controles.js`, `chipsel.js`, `skills.js`, `avisos.js`, `filtro.js`, `historico.js`, `rolagem.js`, `agora.js`, `painel.js` e `titulos.js`, `dia.js`, `sincronia.js`, `arrastar.js`, `alarmes.js` e `alarmes-evo.js` (Playwright), `historico.test.js` (contas do histórico), `alarmes.test.js` (regras dos alarmes), `compartilhar.test.js` (prévia do link) |

## Antes de publicar
1. **Mesma versão** em `APP_VERSION` (`app.js`), `VERSION` (`sw.js`) e nos `?v=` do `index.html`. O teste confere.
2. `node --check` em todos os `.js` e `node tests/dados.test.js`.
3. Testes de tela em ~390 px, claro e escuro. Sirva a pasta com um `pulse.json` e rode `node tests/tela.js` e `node tests/robustez.js`.
4. Os testes usam `tests/amostra.json`, que é o JSON da coleta de 30/10/2026. Ele tem números reais, por isso **não vai para o repositório** (está no `.gitignore`): copie o arquivo para essa pasta antes de rodar os testes.

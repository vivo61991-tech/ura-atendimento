# URA · Suporte B2C (v1.6.0)

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
   - gráficos de oferecidas (com a parte abandonada), **técnicos em espera**, **técnicos atendidos direto**, NS por intervalo (com meta e NS acumulado), abandono e TME;
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

## Versões
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
| `graf.js` | gráfico de colunas em SVG |
| `app.js` | telas, atualização automática, cópia no aparelho |
| `sw.js` | cache offline só deste app (caches `ura-b2c-v…`); o `.json` de dados nunca passa pelo cache |
| `manifest.webmanifest`, `icons/` | instalação no celular |
| `tests/` | `dados.test.js` (contas), `graf.test.js` (desenho das colunas), `tela.js`, `robustez.js`, `info.js`, `selecao.js`, `modo.js`, `chips.js`, `grupos.js` e `controles.js` (Playwright) |

## Antes de publicar
1. **Mesma versão** em `APP_VERSION` (`app.js`), `VERSION` (`sw.js`) e nos `?v=` do `index.html`. O teste confere.
2. `node --check` em todos os `.js` e `node tests/dados.test.js`.
3. Testes de tela em ~390 px, claro e escuro. Sirva a pasta com um `pulse.json` e rode `node tests/tela.js` e `node tests/robustez.js`.
4. Os testes usam `tests/amostra.json`, que é o JSON da coleta de 30/10/2026. Ele tem números reais, por isso **não vai para o repositório** (está no `.gitignore`): copie o arquivo para essa pasta antes de rodar os testes.

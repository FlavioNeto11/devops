# 06 - Frontend UX

## Objetivo da fase

Documentar o redesenho frontend ja presente no workspace para o fluxo do destinador, confirmando que a listagem de manifestos virou o ponto de entrada para:

- recebimento individual e em lote de MTR;
- abertura de um fluxo separado de geracao de CDF;
- consulta e baixa de CDF emitido sem depender do detalhe do manifesto.

Esta fase nao introduziu mudancas adicionais de produto. O trabalho consistiu em inspecionar o estado atual do frontend e registrar o handoff obrigatorio.

## Arquivos alterados observados na fase

Arquivos de frontend ja modificados no workspace e diretamente relacionados a esta entrega:

- `frontend/src/views/ManifestsView.vue`
- `frontend/src/views/ManifestDetailView.vue`
- `frontend/src/components/DestinadorCdfWorkspace.vue`

Arquivo criado nesta fase de handoff:

- `docs/handoffs/frontend-destinador-receive-cdf-redesign/06-frontend-ux.md`

## UX e comportamento implementados

### 1. A listagem passou a ser a entrada operacional do destinador

- `ManifestsView.vue` identifica modo operacional de destinador a partir da conta ativa CETESB com `accountType = receiver`.
- Nesse modo, o cabecalho muda a semantica da tela para operacao do destinador e troca o CTA principal de criacao por entrada para o fluxo de CDF.
- A propria listagem incorpora o workspace `DestinadorCdfWorkspace`, visivel acima dos filtros, para manter a operacao de CDF conectada a selecao atual da grid.

### 2. O menu de acoes por manifesto foi reorientado para o papel de destinador

- Em modo destinador, a linha do manifesto expõe `Visualizar`, `Receber MTR` e `Iniciar fluxo CDF` quando o item esta elegivel.
- As acoes de `Replicar`, `Submeter` e `Reenviar` permanecem condicionadas ao modo nao-destinador.
- O popover de acoes continua usando `Teleport`, reposicionamento por viewport, fechamento ao clicar fora e fechamento por `Escape`, o que preserva usabilidade em grids com overflow.

### 3. Recebimento de MTR foi movido para modal a partir da listagem

- `ManifestsView.vue` implementa modal de recebimento para operacao individual ou em lote.
- A elegibilidade e validada por manifesto com base em identificadores CETESB e status local, bloqueando rascunhos, itens em processamento, cancelados, recebidos ou com falha operacional.
- O lote nao monta um payload remoto multi-manifesto. A view enfileira um recebimento por manifesto elegivel, consolida sucesso parcial e mostra bloqueios por item quando houver mistura de itens elegiveis e inelegiveis.
- O formulario exige data e hora de recebimento e codigo do responsavel, com opcao para baixar e persistir o comprovante PDF apos o recebimento.

### 4. Geracao de CDF saiu do detalhe e virou workspace proprio na listagem

- `DestinadorCdfWorkspace.vue` recebe os manifestos selecionados na grid e monta uma area separada de emissao.
- O workspace resume quantidade selecionada, quantidade elegivel e quantidade bloqueada.
- A base de emissao e apresentada em tabela com MTR, gerador, status e condicao de uso, permitindo abrir o detalhe apenas para consulta.
- O formulario de CDF exige codigo do responsavel, data e hora de emissao e periodo inicial/final; a observacao segue opcional.
- A emissao usa apenas manifestos elegiveis da selecao atual e envia tambem os parceiros geradores derivados da selecao.
- A propria interface informa que o backend revalida a elegibilidade remota antes da emissao, evitando dependencia exclusiva de heuristica local.

### 5. Consulta e baixa de CDF ficaram separadas da emissao

- O mesmo workspace possui um segundo painel para consulta de CDFs emitidos.
- A consulta usa o contexto CETESB ativo e a janela de datas do formulario.
- Os certificados retornados sao mostrados em tabela com codigo, data de emissao, periodo e responsavel.
- Cada linha oferece acao direta de `Baixar PDF`, reforcando que consulta e baixa sao fluxos separados da emissao em si.

### 6. O detalhe do manifesto deixou de ser o lugar principal de recebimento e CDF

- `ManifestDetailView.vue` agora orienta explicitamente o usuario a voltar para a listagem operacional.
- O detalhe preserva papel de consulta, enquanto recebimento e emissao de CDF passam a ser apresentados como fluxos da listagem.

## Validacoes executadas nesta fase

Validacoes feitas agora durante a inspecao:

- leitura dos checkpoints anteriores `00-orchestration`, `01-source-validation` e `05-domain-rules`;
- verificacao do estado atual do git para confirmar os arquivos de frontend alterados nesta entrega;
- inspeccao direta dos arquivos `frontend/src/views/ManifestsView.vue`, `frontend/src/views/ManifestDetailView.vue` e `frontend/src/components/DestinadorCdfWorkspace.vue`.

Validacoes diretamente verificaveis no estado atual:

- existe um workspace novo e dedicado para CDF em `frontend/src/components/DestinadorCdfWorkspace.vue`;
- a listagem em `frontend/src/views/ManifestsView.vue` ja contem:
  - CTA de entrada para fluxo CDF;
  - modal de recebimento individual e em lote;
  - menu de acoes condicionado ao modo destinador;
  - montagem do workspace a partir da selecao da grid;
- o detalhe em `frontend/src/views/ManifestDetailView.vue` ja redireciona conceitualmente o usuario para a listagem operacional.

Nao foi executado teste end-to-end novo nesta fase. A suite `frontend/tests/ui/cetesb-operational-flows.spec.js` ainda referencia o fluxo antigo centrado em `Recebimento e CDF` no detalhe do manifesto e, por isso, nao foi registrada como evidencia valida deste redesenho especifico sem readequacao previa do teste.

## Riscos residuais para QA

1. A cobertura automatizada observada para fluxos CETESB aparenta refletir o layout anterior no detalhe do manifesto e pode nao proteger o novo workspace da listagem.
2. O lote de recebimento usa orquestracao sequencial de varios comandos individuais; QA precisa validar feedback parcial, bloqueio por item inelegivel e consistencia apos refresh da lista.
3. O workspace de CDF depende fortemente do contexto CETESB ativo da sessao; QA deve validar troca de conta, sessao expirada e ausencia de `integrationAccountId` ou `sessionContextId`.
4. A elegibilidade local para receber e gerar CDF usa heuristicas por status e identificadores presentes no manifesto; QA deve confirmar se todos os estados reais retornados pela CETESB continuam sendo classificados corretamente.
5. A consulta e baixa de CDF foram acopladas ao mesmo periodo usado na emissao; QA deve validar se a janela padrao atende o uso esperado e se nao esconde certificados emitidos fora do intervalo pre-preenchido.
6. O fluxo novo depende da selecao da grid como origem operacional; QA deve validar navegacao, limpeza de selecao, selecao em lote, scroll ate o workspace e retorno a partir do detalhe.

## Handoff

- Checkpoint desta fase: concluido.
- Proximo agente esperado pela orquestracao: `tester-qa-mtr`.
- Objetivo do proximo passo: validar a UX real do destinador na listagem, atualizar ou substituir os testes E2E que ainda espelham o fluxo antigo no detalhe e comprovar recebimento individual, recebimento em lote, emissao de CDF por selecao e baixa de CDF emitido.

## Rodada corretiva apos QA

### Ajustes aplicados

- `ManifestsView.vue` deixou de sugerir CDF para qualquer manifesto apenas sincronizado com a CETESB. A elegibilidade local agora exige estado combinado contendo `Recebido` e bloqueia itens com indicio local de CDF ja emitido.
- A normalizacao de status da listagem passou a considerar `status` local e `externalStatus` em conjunto. Isso evita que um manifesto `submitted` com retorno CETESB `Recebido` continue aparecendo como apto para recebimento ou como candidato amplo demais para CDF.
- O CTA `Ir para fluxo CDF` ganhou bloqueio explicito quando a selecao atual nao contem ao menos um manifesto recebido e ainda elegivel, reduzindo a chance de abrir o workspace com falsa expectativa operacional.
- `DestinadorCdfWorkspace.vue` passou a repetir a mesma politica de elegibilidade segura: manifesto com identificadores CETESB, recebido e sem sinal local de CDF emitido.

### Cobertura automatizada atualizada

- `frontend/tests/ui/cetesb-operational-flows.spec.js` foi reescrito para validar a UX nova na listagem de manifestos, em vez do fluxo antigo centrado no detalhe.
- A suite agora protege:
  - acao por linha coerente com o estado do manifesto;
  - recebimento em lote com mistura de item elegivel e item bloqueado;
  - abertura do workspace de CDF a partir da selecao da grid;
  - emissao de CDF apenas com manifesto recebido e elegivel;
  - consulta e baixa direta de CDF no workspace novo.

### Validacoes desta rodada

- revisao e correcao da heuristica local de elegibilidade em listagem e workspace;
- atualizacao da cobertura Playwright para o fluxo novo da grid;
- validacao direcionada planejada para build frontend e Playwright do arquivo reescrito.
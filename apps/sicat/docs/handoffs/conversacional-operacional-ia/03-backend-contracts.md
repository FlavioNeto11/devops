# 03 - Backend Contracts

## Objetivo da fase

Implementar a base da arquitetura multiagente no backend conversacional (planner/router + especialistas + protocolo de execucao em etapas + sintese final) sem quebrar o contrato existente de `POST /v1/conversations/turns`.

## Escopo implementado nesta execucao

1. Evolucao do planner principal no `llm-provider` com output estruturado:
- `intent`
- `constraints` (selecao por recencia e patch operacional)
- `confirmations`
- `steps`
- `needsClarification` e `clarifyingQuestion`

2. Inclusao de especialista operacional para replicacao:
- nova tool `replicate_manifest` no catalogo do provider;
- suporte no dispatcher reutilizando `replicateManifest` existente.

3. Protocolo de tools e decisao multi-etapas no `conversation-service`:
- fluxo composto `manifest.cancel_recent_excluding_first`:
	- consulta de manifestos recentes;
	- decisao de selecao (skip mais recente + take N);
	- execucao de cancelamento por manifesto selecionado;
- fluxo composto `manifest.replicate_with_patch`:
	- validacao de dados minimos (manifesto base + patch);
	- aplicacao de patch em motorista/placa;
	- despacho de replicacao.

4. Sintese final consolidada por turno:
- resposta inclui `orchestration` opcional com intent, etapas, confirmacoes e resumo final;
- preservado contrato atual (`status`, `responseText`, `toolCall`, `policy`, `context`) com extensao backward-compatible.

5. Guardrails e contexto operacional:
- `replicate_manifest` adicionado em policy como acao sensivel (R3 + confirmacao);
- bloqueio por confirmacao/canal/allowActions mantido;
- preservacao de `correlationId`, `sessionContextId` e `integrationAccountId` em todas as chamadas e logs.

## Cobertura dos pedidos compostos obrigatorios

1. "cancelar os 3 manifestos mais recentes ignorando o primeiro mais recente"
- planner detecta intencao composta;
- aplica `skipMostRecent=1` e `take=3`;
- executa cancelamento em lote logico com retorno consolidado.

2. "replicar o manifesto X alterando nome do caminhoneiro e placa"
- planner detecta intencao de replicacao com patch;
- extrai manifesto base e patch (`driverName`, `vehiclePlate`);
- executa `replicate_manifest` via dispatcher.

## Arquivos alterados

### Codigo backend
- `src/services/conversation/llm-provider.ts`
- `src/services/conversation/conversation-service.ts`
- `src/services/conversation/conversation-policy-service.ts`
- `src/services/conversation/conversation-tool-dispatcher.ts`

### Testes
- `tests/unit/conversation-policy-service.test.js`
- `tests/unit/conversation-planner-output.test.js`

### Checkpoint
- `docs/handoffs/conversacional-operacional-ia/03-backend-contracts.md`

## Decisoes tecnicas

1. Multiagente implementado no backend como protocolo explicito (planner + especialistas) sem criar endpoint novo.
2. Mantida compatibilidade de resposta de `/v1/conversations/turns`; campos novos entram como opcionais.
3. Reuso de capacidades existentes de manifesto (sem inventar regra fora do dominio atual).
4. Confirmacao obrigatoria para acoes sensiveis foi mantida e aplicada tambem a replicacao.
5. Persistencia adicional estruturada de etapas ficou no proprio turno conversacional, sem alterar schema nesta fase.

## Validacoes executadas

1. `npm run typecheck`
2. `npx tsx --test tests/unit/conversation-policy-service.test.js tests/unit/conversation-planner-output.test.js tests/unit/conversation-service-fallback.test.js`

Resultado:
- tipagem backend sem erro;
- testes focais passando para planner, policy e fallback.

## Riscos e pendencias para proxima fase

1. O parser heuristico de linguagem natural cobre os casos prioritarios desta fase, mas ainda pode exigir refinamento para variacoes linguisticas amplas.
2. O fluxo composto ainda depende de disponibilidade de dados em `list_manifests` para selecao por recencia.
3. Persistencia analitica de cada etapa multiagente (modelo dedicado) permanece para fase de persistencia/worker.
4. Recomendado para proximo owner: testes integrados ponta-a-ponta de turnos compostos com ambiente de dados controlado.

## Handoff

Fase 03 backend-contracts concluida dentro do escopo solicitado, sem executar QA final nem documentacao final.

next_agent_required: `tester-qa-mtr`
prompt sugerido para proximo owner:

"Validar em ambiente integrado os fluxos conversacionais compostos de cancelamento por recencia com exclusao do primeiro item e replicacao com patch de motorista/placa, incluindo cenarios com e sem confirmacao, e registrar evidencias no checkpoint de QA da demanda conversacional-operacional-ia." 

---

## Atualizacao 2026-04-23 (rodada fluidez operacional IA)

### Objetivo desta rodada

Elevar a capacidade do orquestrador e dos especialistas conversacionais para pedidos compostos com constraints de selecao e sintese final aderente ao pedido do usuario, sem quebra de contrato da rota atual.

### Arquivos alterados nesta rodada

- `src/services/conversation/llm-provider.ts`
- `src/services/conversation/conversation-policy-service.ts`
- `src/services/conversation/conversation-tool-dispatcher.ts`
- `src/services/conversation/conversation-service.ts`
- `tests/unit/conversation-policy-service.test.js`
- `tests/unit/conversation-planner-output.test.js`

### Decisoes aplicadas

1. Provider com parser deterministico para pedidos compostos prioritarios:
- top N por recencia;
- cancelamento por recencia com exclusao do primeiro;
- replicacao com patch (motorista/placa).

2. Nova tool de orquestracao (`orchestrate_manifest_operation`) para executar fluxo composto com especialistas internos (consulta/listagem, selecao e acao).

3. Policy dinamica por intent da orquestracao:
- `manifest.list_recent_top`: consulta R1 sem confirmacao;
- `manifest.cancel_recent_excluding_first`: acao R4 com confirmacao obrigatoria;
- `manifest.replicate_with_patch`: acao R3 com confirmacao obrigatoria.

4. Sintese final consolidada passa a priorizar `assistantSummary` retornado pelo dispatcher, contendo entendimento, criterio, itens afetados e resultado.

5. Rastreabilidade preservada com `correlationId`, `integrationAccountId`, `sessionContextId`, `requestedBy` e `idempotency-key` por item nos cancelamentos compostos.

### Cobertura mandatória nesta rodada

1. "cancelar os 3 manifestos mais recentes ignorando o primeiro mais recente":
- reconhecimento deterministico do intent;
- aplicacao de `top=3` e `skipMostRecent=1`;
- suporte de policy com confirmacao obrigatoria;
- execucao no dispatcher com listagem, selecao e cancelamento por item.

2. "replicar manifesto X alterando nome do caminhoneiro e placa":
- reconhecimento deterministico do intent;
- extracao de `sourceManifestId`, `driverName` e `vehiclePlate`;
- suporte de policy com confirmacao obrigatoria;
- execucao no dispatcher com `replicateManifest` e patch aplicado.

### Validacoes desta rodada

- `npm run typecheck` executado com sucesso (sem erros);
- `npx tsx --test tests/unit/conversation-langgraph-memory.test.js tests/unit/conversation-planner-output.test.js tests/unit/conversation-service-fallback.test.js` executado com sucesso (7/7 testes passando).

### Atualizacao 2026-04-23 (correcao de memoria conversacional LangGraph)

#### Objetivo desta rodada

Corrigir a ausencia de memoria conversacional no fluxo de planejamento para que o turno seguinte reutilize mensagens anteriores da mesma sessao, com isolamento estrito entre sessoes.

#### Implementacao aplicada

1. Memoria nativa no LangGraph:
- adicionado `MemorySaver` como checkpointer na compilacao do grafo de planejamento;
- criado helper `createMemoryBackedPlanningGraph` para centralizar `checkpointer + graph.invoke` com `thread_id`.

2. Isolamento por sessao/thread:
- criado helper `buildConversationThreadId(context)`;
- thread composta por `integrationAccountId` + `conversationSessionId` (fallback para `sessionContextId`/`auditCorrelationId`);
- fallback efemero quando nenhum identificador de sessao estiver presente.

3. Execucao do provider com memoria:
- `createLlmProvider` passou a manter o grafo compilado em cache por instancia do provider;
- cada `plan()` invoca o grafo com `configurable.thread_id`, garantindo continuidade no mesmo thread.

4. Guardrails preservados:
- parser deterministico, policies de risco e confirmacao de acoes sensiveis nao foram alterados;
- fluxo de tool-calling e padrao de resposta da conversa permanecem inalterados.

#### Arquivos alterados nesta rodada

- `src/services/conversation/llm-provider.ts`
- `tests/unit/conversation-langgraph-memory.test.js`
- `docs/handoffs/conversacional-operacional-ia/03-backend-contracts.md`

#### Evidencias de validacao

- Typecheck: `npm run typecheck` -> sucesso.
- Testes focais conversacionais:
  - `tests/unit/conversation-langgraph-memory.test.js` -> 3/3 passando;
  - `tests/unit/conversation-planner-output.test.js` -> 3/3 passando;
  - `tests/unit/conversation-service-fallback.test.js` -> 1/1 passando.

### Proximo agente sugerido

`tester-qa-mtr` para validacao integrada do endpoint `POST /v1/conversations/turns` cobrindo persistencia entre turnos da mesma sessao e nao-vazamento entre sessoes distintas.

---

## Atualizacao 2026-04-23 (camada conversacional operacional com dados ricos de manifesto)

### Objetivo desta rodada

Eliminar o gap operacional em que a conversa listava apenas IDs e caia em fallback consultivo para pedidos de detalhamento, passando a reutilizar as mesmas fontes de dados do dashboard para lista/detalhe de manifesto e mantendo guardrails de seguranca.

### Implementacao aplicada

1. Reuso das mesmas fontes de dados do dashboard no dispatcher conversacional:
- `listManifests` para top N por recencia com `expeditionDate`, `status`, `externalStatus`, parceiros e condutor/placa quando disponiveis;
- `getManifest` para detalhamento consolidado de conjunto selecionado (campos ricos de manifesto).

2. Nova intencao orquestrada para detalhamento de conjunto anterior:
- `manifest.detail_selected_set` em `orchestrate_manifest_operation`;
- consolidacao de campos: data, status, CDF/hash, gerador, transportador, destinador, placa e motorista.

3. Memoria de sessao para “quero mais dados deles”:
- persistencia de `conversationMemory.lastManifestSet.manifestIds` no turno executado;
- leitura do ultimo conjunto durante o planejamento do turno seguinte;
- parser deterministico no provider para mapear “mais dados deles/desses” para `manifest.detail_selected_set`.

4. Robustecimento de fallback quando provider falha:
- ao erro do provider, tenta plano deterministico + execucao real de tools;
- se houver plano deterministico, retorna resposta util operacional (nao travada em modo consultivo);
- fallback consultivo antigo fica apenas para mensagens sem plano deterministico valido.

5. Resposta final em linguagem natural sem labels internos:
- consolidacoes operacionais com portugues claro;
- bypass de re-sintese para intents de consulta rica (`manifest.list_recent_top` e `manifest.detail_selected_set`) para nao perder datas/status.

6. Guardrails preservados:
- policy por risco/canal/confirmacao mantida;
- `manifest.detail_selected_set` classificada como consulta R1;
- acoes sensiveis seguem exigindo confirmacao e canais permitidos.

### Arquivos alterados nesta rodada

- `src/services/conversation/conversation-tool-dispatcher.ts`
- `src/services/conversation/llm-provider.ts`
- `src/services/conversation/conversation-service.ts`
- `src/services/conversation/conversation-policy-service.ts`
- `tests/unit/conversation-planner-output.test.js`
- `tests/unit/conversation-policy-service.test.js`
- `tests/integration/conversation-composed-operations.test.js`
- `docs/handoffs/conversacional-operacional-ia/03-backend-contracts.md`

### Evidencias de validacao

1. Typecheck:
- `npm run typecheck` -> sucesso.

2. Testes focais conversacionais:
- `npx tsx --test tests/unit/conversation-planner-output.test.js tests/unit/conversation-policy-service.test.js tests/unit/conversation-service-fallback.test.js tests/integration/conversation-composed-operations.test.js`
- Resultado: **19/19 passando**, 0 falhas.

3. Cobertura direta dos cenarios obrigatorios:
- “me retorne os 5 manifestos mais recentes com as datas” -> teste de integracao validando datas reais + status;
- “quero mais dados deles” -> teste de integracao multi-turno com memoria do ultimo conjunto;
- falha do provider -> no segundo turno do teste acima, provider falha e fluxo segue por caminho deterministico com resposta util.

### Handoff

Fase 03 backend-contracts atualizada para o escopo de dados ricos e fallback deterministico da camada conversacional.

---

## Atualizacao 2026-04-23 (remocao completa de inferencia semantica por regex no fluxo deterministico)

### Objetivo desta rodada

Eliminar o padrao de classificacao semantica de intencao por regex no caminho deterministico do provider conversacional e manter apenas fallback de emergencia minimo para indisponibilidade total, sem roteamento por regex.

### Auditoria executada

Escopo auditado:
- `src/services/conversation/llm-provider.ts`
- dependencias imediatas do fluxo principal (`src/services/conversation/conversation-service.ts`)
- suites focais de conversation para cobertura de regressao

Padroes identificados e removidos (semantica por regex):
1. `isSelectedSetAttributesIntent(...)`
2. `isCancelRecentIntent(...)`
3. `isReplicateWithPatchIntent(...)`
4. checks equivalentes em builders deterministicos:
	- `buildSelectedSetDetailDeterministicPlan(...)`
	- `buildAskedManifestHistoryPlan(...)`
	- `buildGeneratorLookupPlan(...)`
	- `buildGreetingPlan(...)`
	- `buildCancelRecentDeterministicPlan(...)`
	- `buildReplicateDeterministicPlan(...)`
5. detectores auxiliares de inferencia semantica:
	- `normalizeText(...)`
	- `extractTopSelection(...)`
	- `detectConfirmation(...)`
	- `detectSkipMostRecent(...)`
	- `isSimpleGreeting(...)`
	- `extractManifestId(...)`
	- `extractManifestNumber(...)`
	- `extractDriverName(...)`
	- `extractVehiclePlate(...)`

### Implementacao aplicada

1. `buildDeterministicPlan(...)` mantido apenas por compatibilidade de API e agora retorna `null` sem qualquer inferencia semantica regex.
2. `createLlmProvider().plan(...)` deixou de usar fallback deterministico por regex:
	- removido override em `needsClarification` que promovia plano regex;
	- removido override para `classification.intent === unclear` com tool call regex.
3. `conversation-service` deixou de promover fallback deterministico por regex quando provider falha:
	- removido bloco `PROVIDER_UNAVAILABLE_DETERMINISTIC`;
	- mantido somente fallback consultivo minimo (`PROVIDER_UNAVAILABLE`) sem tool call.
4. Guardrails de seguranca preservados:
	- policy por risco/canal/confirmacao segue ativa;
	- acoes sensiveis continuam bloqueadas sem confirmacao.

### Regex mantidas e justificativa

Regex mantidas nesta rodada sao tecnicas e nao semanticas de intencao:
- parsing robusto de JSON/fenced blocks em `extractFirstJsonObject(...)` do provider (suporte de formato de resposta do modelo);
- extracao tecnica de tokens/IDs em `conversation-service` para memoria operacional (`extractManifestTokensFromText(...)`), sem efeito de classificacao de intencao.

### Arquivos alterados

- `src/services/conversation/llm-provider.ts`
- `src/services/conversation/conversation-service.ts`
- `tests/unit/conversation-planner-output.test.js`
- `tests/unit/conversation-service-fallback.test.js`
- `tests/integration/conversation-composed-operations.test.js`
- `docs/handoffs/conversacional-operacional-ia/03-backend-contracts.md`

### Evidencias de validacao

1. Typecheck:
- `npm run typecheck` -> sucesso.

2. Suites focais conversation:
- `npx tsx --test tests/unit/conversation-planner-output.test.js tests/unit/conversation-service-fallback.test.js tests/unit/conversation-policy-service.test.js tests/unit/conversation-langgraph-memory.test.js tests/integration/conversation-composed-operations.test.js tests/integration/conversation-multiturn-memory.test.js`
- Resultado: **38/38 passando**, 0 falhas.

### Handoff

next_agent_required: `tester-qa-mtr`

prompt sugerido para proximo owner:

"Executar validacao de regressao orientada a risco no endpoint conversacional com foco em: (a) ausencia de roteamento semantico por regex no caminho deterministico, (b) decisao de intencao exclusivamente via camada classifier/planner LLM, (c) fallback minimo sem tool call em indisponibilidade total do provider, e (d) continuidade dos guardrails de confirmacao/policy para acoes sensiveis." 

---

## Atualizacao 2026-04-23 (correcao INVALID_TOOL_RESULTS no planner/executor)

### Objetivo desta rodada

Eliminar erro 400 `INVALID_TOOL_RESULTS` no fluxo OpenAI/LangChain garantindo contrato de tool-calling e robustecer follow-up contextual de origem dos manifestos.

### Causa raiz identificada

1. O planner com `LangGraph + MemorySaver` persistia `AIMessage` com `tool_calls` entre turnos.
2. No turno seguinte, o historico reaproveitado podia chegar ao modelo sem `ToolMessage` correspondente para cada `tool_call_id`.
3. O provedor OpenAI rejeitava a sequencia com erro de protocolo (`An assistant message with 'tool_calls' must be followed by tool messages... INVALID_TOOL_RESULTS`).

### Correcoes aplicadas

1. Reparo de protocolo no grafo de planejamento:
- sanitizacao do historico antes de cada invocacao para garantir pareamento de `tool_call_id`;
- injecao de `ToolMessage` sintetica quando faltar resposta para tool call.

2. Persistencia de pareamento para novas tool calls:
- quando o planner retorna `AIMessage` com `tool_calls`, o grafo agora anexa `ToolMessage` correspondente no mesmo ciclo, evitando historico invalido no turno seguinte.

3. Regra de esclarecimento sem tool call:
- se `needsClarification=true` e nao houver plano deterministico robusto, o provider responde com pergunta de esclarecimento e `toolCall=null`.

4. Follow-up contextual "de onde vem esses manifestos?":
- parser deterministico ampliado para reconhecer origem/"de onde vem" + referencia ao conjunto anterior;
- uso de `lastManifestSelectionIds` para `manifest.detail_selected_set` quando aplicavel.

5. Memoria de follow-up preservada:
- fluxo continua carregando historico user+assistant via `conversation_messages` para cada novo turno;
- respostas do assistente seguem persistidas e disponiveis para contexto subsequente.

### Arquivos alterados nesta rodada

- `src/services/conversation/llm-provider.ts`
- `tests/unit/conversation-langgraph-memory.test.js`
- `tests/unit/conversation-planner-output.test.js`
- `tests/unit/conversation-service-fallback.test.js`
- `docs/handoffs/conversacional-operacional-ia/03-backend-contracts.md`

### Evidencias de validacao

1. Typecheck:
- `npm run typecheck` -> sucesso.

2. Testes focais conversation:
- `npx tsx --test tests/unit/conversation-planner-output.test.js tests/unit/conversation-langgraph-memory.test.js tests/unit/conversation-service-fallback.test.js tests/integration/conversation-composed-operations.test.js`
- Resultado: **27/27 passando**, 0 falhas.

3. Cobertura dos cenarios obrigatorios:
- sequencia em 2 turnos com reutilizacao de conjunto anterior sem erro de protocolo;
- caso unclear com pergunta de esclarecimento sem `toolCall`;
- caso com `tool_calls` sempre pareado por `tool_call_id` no historico do grafo.

### Handoff

next_agent_required: `tester-qa-mtr`
prompt sugerido para proximo owner:

"Executar revalidacao QA integrada do endpoint POST /v1/conversations/turns com OpenAI real para confirmar ausencia de INVALID_TOOL_RESULTS em cenarios multi-turno com tool calls, incluindo sequencia: 'ultimos 6 manifestos' -> 'de onde vem esses manifestos?', e anexar evidencias no checkpoint 09-qa-validation." 

---

## Atualizacao 2026-04-23 (higienizacao lint/quality no provider conversacional)

### Objetivo desta rodada

Remover erros de lint/quality em `src/services/conversation/llm-provider.ts` apos rodada anterior, sem alterar comportamento funcional validado para follow-up por atributo, saudacao local com provider indisponivel e memoria/continuidade de sessao.

### Arquivo alterado nesta rodada

- `src/services/conversation/llm-provider.ts`

### Ajustes aplicados (sem mudanca funcional)

1. Regex e parsing:
- substituicoes de `String.match(...)` por `RegExp.exec(...)` nos extratores;
- normalizacao de regex com classes mais concisas (`\d`, remocao de escapes redundantes e simplificacao de classes);
- normalizacao textual com `replaceAll(...)` conforme regra de qualidade do workspace.

---

## Atualizacao 2026-04-23 (pipeline multiagente em camadas + memoria de turno completo)

### Objetivo desta rodada

Substituir a dependencia funcional de heuristica no caminho principal de inferencia por pipeline multiagente em camadas (classifier -> planner -> executor -> synthesizer), persistir memoria de turno completo (user + assistant + entidades/plano/selecoes) e corrigir consulta direta de gerador por numero de manifesto.

### Implementacao aplicada

1. Caminho principal de producao sem heuristica:
- `createLlmProvider().plan()` passou a executar como fluxo principal:
	- Agent Intent Classifier (LLM com contrato JSON);
	- Agent Planner (LLM com tools e contrato de decisao);
	- retorno estruturado com metadados de orquestracao por camada.
- Heuristica (`buildDeterministicPlan`) mantida apenas como fallback de emergencia quando provider indisponivel.

2. Cadenciamento de agentes e contrato entre camadas:
- novo metadata `orchestration` em `LlmPlan`, contendo:
	- saida do classifier (intent, entities, confidence, clarification);
	- decisao do planner (toolName, toolArgs, confidence).
- `conversation-service` persiste esse artefato por turno nos `structuredPayload` das mensagens do assistente.

3. Memory Layer com persistencia/reuso por sessao:
- persistencia de `conversationMemory.askedManifestIds` em turnos responded/blocked/executed;
- persistencia de `conversationMemory.lastManifestSet` em turnos executados com resultado de ferramenta;
- recuperacao no turno seguinte via leitura de `conversation_messages`:
	- `lastManifestSelectionIds`;
	- `askedManifestIds`;
	- historico user + assistant para o provider.

4. Executor com novas intencoes operacionais:
- `orchestrate_manifest_operation` ganhou:
	- `manifest.lookup_generator_by_number`;
	- `memory.list_asked_manifests`.
- lookup direto usa fonte operacional correta (`listManifests` com filtro `manifestNumber`), retornando gerador/transportador/destinador e item encontrado.

5. Policy/guardrails preservados:
- intents novas classificadas como consulta `R1` em qualquer canal permitido de leitura;
- confirmacao obrigatoria mantida para acoes sensiveis.

### Arquivos alterados nesta rodada

- `src/services/conversation/llm-provider.ts`
- `src/services/conversation/conversation-service.ts`
- `src/services/conversation/conversation-tool-dispatcher.ts`
- `src/services/conversation/conversation-policy-service.ts`
- `tests/unit/conversation-planner-output.test.js`
- `tests/unit/conversation-policy-service.test.js`
- `tests/integration/conversation-multiturn-memory.test.js`
- `tests/integration/conversation-composed-operations.test.js`
- `docs/handoffs/conversacional-operacional-ia/03-backend-contracts.md`

### Evidencias de validacao

1. Typecheck:
- `npm run typecheck` -> sucesso.

2. Testes focais conversacionais:
- `npx tsx --test tests/unit/conversation-planner-output.test.js tests/unit/conversation-policy-service.test.js tests/integration/conversation-multiturn-memory.test.js tests/integration/conversation-composed-operations.test.js`
- Resultado: **29/29 passando**, 0 falhas.

3. Cobertura dos cenarios obrigatorios:
- memoria de resposta do assistente no turno seguinte: validado em `conversation-multiturn-memory`;
- ultimos 4 + follow-up de origem: validado em `conversation-composed-operations`;
- "quais manifestos eu perguntei": validado em `conversation-composed-operations` com reuse de `askedManifestIds`;
- lookup direto "gerador do manifesto 260011455990": validado em `conversation-composed-operations`.

### Handoff

Fase 03 backend-contracts atualizada com pipeline multiagente em camadas, memoria persistida por turno completo e lookup direto de gerador por numero de manifesto.

next_agent_required: `tester-qa-mtr`

prompt sugerido para proximo owner:

"Executar validacao integrada do endpoint POST /v1/conversations/turns em ambiente real-dev cobrindo os cenarios de memoria multi-turno (respostas do assistente e contexto), follow-up de origem de conjunto anterior e lookup direto por numero de manifesto 260011455990, registrando evidencias no checkpoint 09-qa-validation da demanda conversacional-operacional-ia." 

2. Qualidade/legibilidade:
- remocao de non-null assertions desnecessarias em leitura de `lastManifestSelectionIds`;
- extracao de predicados de intencao (`isRecentListIntent`, `isSelectedSetAttributesIntent`, etc.) para reduzir complexidade cognitiva de `buildDeterministicPlan`;
- extracao de helpers de parsing/sintese (`extractToolCallFromGraphMessage`, `resolveOutputTextFromGraphMessage`, `resolveConfidenceScore`) para escopo de modulo;
- remocao de ternario aninhado na definicao de confidence.

3. Tipagem:
- ajuste de helper para consumir `GraphMessage` (mensagem do estado do LangGraph), preservando compatibilidade de tipos em `plan`.

### Validacoes executadas

1. `npm run typecheck`
- resultado: sucesso (0 erros de tipagem).

2. Testes focais conversacionais
- comando: `npm test -- tests/unit/conversation-planner-output.test.js tests/unit/conversation-service-fallback.test.js tests/integration/conversation-composed-operations.test.js tests/integration/conversation-multiturn-memory.test.js`
- resultado observado no run: **249/249 passando, 0 falhas** (o script `npm test` executa a suite completa por configuracao de `tests/**/*.test.js`, incluindo os focais solicitados).

### Handoff

Fase 03 backend-contracts atualizada para a rodada de higienizacao lint/quality do provider.

`next_agent_required`: `tester-qa-mtr`

Prompt sugerido para proximo owner:

"Executar revalidacao focada em conversacao operacional no endpoint POST /v1/conversations/turns, priorizando follow-up por atributo do conjunto anterior, saudacao com provider indisponivel e continuidade de sessao multi-turno, registrando evidencias no checkpoint 09-qa-validation da demanda conversacional-operacional-ia." 

---

## Atualizacao 2026-04-23 (correcao de continuidade pos-primeiro-turno com provider indisponivel)

### Objetivo desta rodada

Eliminar a regressao em que a conversa funcionava no primeiro turno (top manifestos), mas no turno seguinte entrava em fallback consultivo repetitivo apos falha do provider e passava a responder de forma degradada para mensagens simples.

### Causa raiz encontrada

1. Lacuna no parser deterministico de follow-up contextual:
- o provider fallback reconhecia "quero mais dados deles", mas nao cobria variantes operacionais diretas como "quais sao os geradores deles";
- quando o provider falhava no segundo turno, esse follow-up nao era mapeado para `manifest.detail_selected_set` e caia no fallback consultivo fixo.

2. Ausencia de resposta local para saudacoes simples com provider indisponivel:
- mensagens curtas como "oi" dependiam do provider para plano textual;
- sem provider e sem plano deterministico, retornavam novamente o fallback consultivo "Nao consegui acessar o provedor...", aparentando sessao travada.

### Implementacao aplicada

1. Expansao do parser deterministico em `llm-provider`:
- novo reconhecimento de follow-up por atributos do conjunto anterior (`gerador`, `transportador`, `destinador`, `motorista`, `placa`, `status`, `data`, `cdf/hash`) com deiticos de conjunto (`deles`, `desses`, etc.);
- mapeamento para `orchestrate_manifest_operation` com intent `manifest.detail_selected_set` reaproveitando `lastManifestSelectionIds`.

2. Resposta util para saudacoes sem depender do provider:
- saudacoes simples (`oi`, `ola`, `bom dia`, etc.) agora geram plano deterministico sem tool call;
- em falha do provider, a sessao responde normalmente (provedor `rule-based-fallback`) sem cair no fallback consultivo repetitivo.

3. Robustez de tipagem do plano deterministico:
- `DeterministicPlan.toolCall` passou a aceitar `null` para cobrir respostas conversacionais sem chamada de ferramenta.

### Arquivos alterados nesta rodada

- `src/services/conversation/llm-provider.ts`
- `tests/unit/conversation-planner-output.test.js`
- `tests/unit/conversation-service-fallback.test.js`
- `tests/integration/conversation-composed-operations.test.js`
- `docs/handoffs/conversacional-operacional-ia/03-backend-contracts.md`

### Evidencias de validacao

1. Typecheck:
- `npm run typecheck` -> sucesso.

2. Testes focais conversacionais:
- `npx tsx --test tests/unit/conversation-planner-output.test.js tests/unit/conversation-service-fallback.test.js tests/integration/conversation-composed-operations.test.js`
- Resultado: **15/15 passando**, 0 falhas.

3. Cobertura do fluxo obrigatorio em 3 turnos com provider falhando apos turno 1:
- turno 1: lista top 5/top N de manifestos recentes;
- turno 2: follow-up "quais sao os geradores deles" executado por caminho deterministico com reutilizacao do ultimo conjunto;
- turno 3: saudacao simples "oi" respondida normalmente, sem loop de fallback consultivo.

### Risco residual

1. O reconhecimento deterministico de follow-up continua heuristico; variacoes linguisticas muito fora dos padroes atuais podem voltar ao fallback consultivo quando o provider estiver indisponivel.
2. Nao houve alteracao de guardrails de acoes sensiveis; risco de regressao nessa area permanece baixo, mas deve ser mantida cobertura de QA integrada em fluxo com confirmacao.

### Handoff

next_agent_required: `tester-qa-mtr`

Prompt sugerido para proximo owner:

"Executar validacao integrada do endpoint POST /v1/conversations/turns para continuidade de sessao com provider indisponivel apos o primeiro turno, cobrindo: (1) lista inicial de manifestos recentes, (2) follow-up contextual por conjunto anterior (ex.: geradores deles), (3) saudacao simples sem loop de fallback consultivo, preservando guardrails de confirmacao para acoes sensiveis." 

next_agent_required: `tester-qa-mtr`
prompt sugerido para proximo owner:

"Executar validacao integrada do endpoint POST /v1/conversations/turns para consultas operacionais de manifesto com foco em: top N com datas/status, detalhamento do conjunto anterior por memoria de sessao ("quero mais dados deles"), e resiliencia quando provider LLM estiver indisponivel (caminho deterministico com tools). Registrar evidencias em 09-qa-validation.md." 

---

## Atualizacao 2026-04-23 (hardening de isolamento cross-account na memoria conversacional)

### Objetivo desta rodada

Eliminar risco residual de vazamento cross-account no carregamento de historico conversacional quando houver reutilizacao do mesmo `conversationSessionId` em contas diferentes.

### Causa raiz

1. Leitura de historico no planner (`loadConversationPlanningState`) consultava `conversation_messages` apenas por `conversation_session_id`.
2. Isso permitia mistura teorica de mensagens entre contas distintas caso o mesmo `conversationSessionId` fosse reutilizado.

### Ajuste aplicado

1. Repositorio de mensagens:
- `listConversationMessages` agora exige `integrationAccountId` e filtra por:
	- `conversation_session_id = $1`
	- `integration_account_id is not distinct from $2`

2. Service conversacional:
- `loadConversationPlanningState` passou a chamar `listConversationMessages` com `context.integrationAccountId`.

3. Lookups adicionais por sessao (hardening preventivo):
- `listConversationActionLogs` agora tambem filtra por conta + sessao;
- `findConversationMemory` e `listActiveConversationMemory` passaram a escopar por conta + sessao via `join conversation_sessions`.

### Arquivos alterados nesta rodada

- `src/repositories/conversation-message-repo.ts`
- `src/services/conversation/conversation-service.ts`
- `src/repositories/conversation-action-log-repo.ts`
- `src/repositories/conversation-memory-repo.ts`
- `tests/integration/conversation-multiturn-memory.test.js`
- `docs/handoffs/conversacional-operacional-ia/03-backend-contracts.md`

### Evidencias de validacao

1. Typecheck:
- `npm run typecheck` -> sucesso.

2. Testes focais memory + policy:
- `npx tsx --test tests/unit/conversation-policy-service.test.js tests/integration/conversation-multiturn-memory.test.js`
- Resultado: **12/12 passando**, incluindo os cenarios:
	- mesma session id em contas diferentes NAO compartilha historico;
	- mesma conta + mesma session continua compartilhando historico.

### Handoff

next_agent_required: `tester-qa-mtr`

Prompt sugerido para proximo owner:

"Executar validacao integrada do endpoint POST /v1/conversations/turns focada em isolamento cross-account da memoria conversacional, comprovando nao-vazamento quando a mesma `conversationSessionId` e reutilizada entre contas distintas e preservacao do compartilhamento legitimo na mesma conta+sessoes." 

---

## Atualizacao 2026-04-23 (remocao de heuristica regex de intencao no deterministic fallback)

### Objetivo desta rodada

Eliminar o uso das heuristicas semanticas proibidas (`isRecentListIntent` e `isPreviousSetDataIntent`) no fluxo deterministico, deixando a classificacao desses intents sob responsabilidade da pipeline em camadas (`classifier`/`planner` LLM).

### Ajustes aplicados

1. `llm-provider`:
- removida a chamada de `buildRecentListDeterministicPlan` da cadeia principal de `buildDeterministicPlan`;
- removida a funcao `buildRecentListDeterministicPlan`;
- removida a funcao `isRecentListIntent`;
- removida a funcao `isPreviousSetDataIntent`;
- `buildSelectedSetDetailDeterministicPlan` passou a aceitar apenas follow-up com atributo explicito do conjunto anterior (`isSelectedSetAttributesIntent`).

2. Cobertura unit de planner atualizada:
- casos antes cobertos por heuristica para `manifest.list_recent_top` e "quero mais dados deles" agora validam `plan === null`, confirmando que nao ha mais roteamento por regex nesses intents no fallback deterministico.

### Diff logico (o que substituiu as heuristicas)

1. Antes:
- fallback deterministico decidia intents `manifest.list_recent_top` e follow-up generico de conjunto anterior via regex hardcoded.

2. Depois:
- fallback deterministico **nao** decide mais esses intents por regex;
- intents equivalentes passam para decisao de `classifyIntent` + `planner` (pipeline LLM em camadas) no caminho principal;
- fallback deterministico permanece apenas para intents locais ainda permitidos (ex.: cancelamento composto, replicacao com patch, lookup por numero, historico consultado, saudacao e follow-up por atributo explicito).

### Arquivos alterados nesta rodada

- `src/services/conversation/llm-provider.ts`
- `tests/unit/conversation-planner-output.test.js`
- `docs/handoffs/conversacional-operacional-ia/03-backend-contracts.md`

### Evidencias de validacao

1. Typecheck:
- `npm run typecheck` -> sucesso.

2. Testes focais conversacionais:
- `npx tsx --test tests/unit/conversation-planner-output.test.js tests/unit/conversation-service-fallback.test.js tests/integration/conversation-composed-operations.test.js tests/integration/conversation-multiturn-memory.test.js`
- Resultado: **26/26 passando**, 0 falhas.

3. Cenarios sensiveis preservados:
- follow-up contextual de conjunto anterior por atributo (origem/gerador): passando;
- lookup de gerador por numero de manifesto: passando;
- robustez de memoria/protocolo do planner (sem regressao observada na suite focal integrada desta rodada).

### Handoff

next_agent_required: `tester-qa-mtr`

Prompt sugerido para proximo owner:

"Revalidar em QA integrado o work_id conversacional-operacional-ia apos remocao das heuristicas regex de intencao no fallback deterministico, cobrindo follow-up contextual por atributo do conjunto anterior, lookup por numero de manifesto e estabilidade do fluxo multi-turno com pipeline classifier/planner em camadas." 

---

## Atualizacao 2026-04-23 (correcao de direcao temporal para "mais antigos" em manifest.list_recent_top)

### Objetivo desta rodada

Corrigir ponta a ponta o tratamento de pedidos por recencia ascendente ("mais antigos") no fluxo conversacional operacional, sem reintroduzir inferencia semantica por regex.

### Causa raiz confirmada

1. O fluxo classifier/planner nao tinha hardening de entidade explicita de direcao temporal no output final do tool call.
2. O dispatcher de `manifest.list_recent_top` ordenava sempre por recencia descendente, ignorando `selection.orderBy`.
3. A sintese de selecao usava texto fixo de "mais recentes", mesmo quando o criterio deveria ser ascendente.

### Implementacao aplicada

1. Hardening no provider (`llm-provider`):
- reforco de contrato no classifier para `entities.recencyDirection` (`oldest`/`recent`) em consultas de recencia;
- reforco de contrato no planner para preencher `selection.orderBy` coerente com direcao temporal;
- pos-processamento seguro do tool call via `normalizePlannerToolCallForRecency(...)`:
	- `manifest.list_recent_top` com `recencyDirection=oldest` passa a forcar `selection.orderBy=recency_asc`;
	- sem pedido explicito para pular, `skipMostRecent=0` em `oldest`;
	- compatibilidade preservada: ausencia de `orderBy` continua com default `recency_desc`.

2. Correcao no dispatcher (`conversation-tool-dispatcher`):
- `handleManifestListRecentTop` agora respeita `selection.orderBy` (`recency_desc` ou `recency_asc`);
- `criteria.orderBy` no resultado reflete o criterio realmente aplicado;
- `buildSelectionSummary` ajustado para linguagem coerente com direcao:
	- "mais recentes" para `recency_desc`;
	- "mais antigos" para `recency_asc`.

3. Robustez e retrocompatibilidade:
- chamadas legadas sem `orderBy` permanecem funcionando com default descendente;
- sem alteracao de memoria de sessao, correlacao ou contratos de persistencia.

### Arquivos alterados nesta rodada

- `src/services/conversation/llm-provider.ts`
- `src/services/conversation/conversation-tool-dispatcher.ts`
- `tests/unit/conversation-recency-direction.test.js`
- `docs/handoffs/conversacional-operacional-ia/03-backend-contracts.md`

### Evidencias de validacao

1. Typecheck:
- `npm run typecheck` -> sucesso.

2. Testes focais conversacionais:
- `npx tsx --test tests/unit/conversation-recency-direction.test.js tests/unit/conversation-planner-output.test.js tests/unit/conversation-service-fallback.test.js`
- Resultado: **16/16 passando**, 0 falhas.

3. Cobertura obrigatoria desta correcao:
- "2 mais antigos" -> normalizacao para `orderBy=recency_asc`, `top=2`, `skipMostRecent=0` sem skip implicito;
- "2 mais recentes" -> permanece `recency_desc`;
- dispatcher retorna ordenacao correta para asc/desc com base em `selection.orderBy`.

### Handoff

next_agent_required: `tester-qa-mtr`

Prompt sugerido para proximo owner:

"Executar validacao QA integrada do endpoint POST /v1/conversations/turns para pedidos de recencia asc/desc, cobrindo especificamente: (1) 'me retorne os 2 manifestos mais antigos', (2) 'me retorne os 2 manifestos mais recentes', (3) regressao de chamadas legadas sem orderBy. Registrar evidencias no checkpoint 09-qa-validation." 

---

## Atualizacao 2026-04-23 (filtros temporais amplos para manifest.list_recent_top)

### Objetivo desta rodada

Implementar suporte amplo a filtros temporais no fluxo classifier/planner e no dispatcher de manifesto, cobrindo intervalo de datas (from/to) e ordenacao temporal (recentes/antigos), sem regressao para heuristica semantica hardcoded.

### Implementacao aplicada

1. Provider em camadas (`llm-provider`):
- ampliado contrato da tool `orchestrate_manifest_operation` com campos temporais em `selection`:
	- `dateFrom` e `dateTo` (canonicos)
	- aliases aceitos: `from`, `to`, `startDate`, `endDate`
- reforcado prompt do classifier para extrair `entities.dateFrom`/`entities.dateTo` (YYYY-MM-DD quando possivel), alem de `top`, `skipMostRecent` e `orderBy`;
- reforcado prompt do planner para preservar intervalo temporal no tool call;
- `normalizePlannerToolCallForRecency(...)` agora tambem normaliza intervalo temporal:
	- converte alias para `selection.dateFrom`/`selection.dateTo`;
	- normaliza datas para YYYY-MM-DD;
	- corrige intervalo invertido (swap seguro);
	- remove aliases residuais no payload final.

2. Dispatcher de manifesto (`conversation-tool-dispatcher`):
- adicionado parser de intervalo temporal com suporte a formatos ISO e BR;
- aplicado filtro local por intervalo sobre a lista operacional disponivel antes da selecao por recencia/top;
- preservado comportamento legado quando nao houver filtro temporal;
- `manifest.list_recent_top` agora retorna em `criteria`:
	- `dateFrom`, `dateTo`, `totalInRange`, alem de `orderBy/top/skipMostRecent`;
- sintese natural (`assistantSummary`) passou a incluir:
	- quantidade considerada no periodo;
	- periodo aplicado;
	- itens retornados com data/status.

3. Compatibilidade e guardrails:
- nenhuma alteracao de policy de risco/sensivel;
- memoria de sessao e `askedManifestIds` preservadas (sem alteracao de fluxo em `conversation-service`);
- consultas sem filtro temporal continuam com resultado e ordenacao legados.

### Arquivos alterados nesta rodada

- `src/services/conversation/llm-provider.ts`
- `src/services/conversation/conversation-tool-dispatcher.ts`
- `tests/unit/conversation-recency-direction.test.js`
- `docs/handoffs/conversacional-operacional-ia/03-backend-contracts.md`

### Evidencias de validacao

1. Typecheck:
- `npm run typecheck` -> sucesso.

2. Suites focais conversation:
- `npx tsx --test tests/unit/conversation-recency-direction.test.js tests/unit/conversation-planner-output.test.js tests/unit/conversation-service-fallback.test.js`
- Resultado: **19/19 passando**, 0 falhas.

3. Cobertura mandataria validada em testes:
- intervalo explicito `17-20 abril 2026` com filtro de datas e combinacao de `top/orderBy`;
- variacao equivalente por aliases temporais (`from/to`) normalizada para `dateFrom/dateTo`;
- combinacao com `orderBy` asc/desc em cima do conjunto filtrado.

### Handoff

next_agent_required: `tester-qa-mtr`

Prompt sugerido para proximo owner:

"Executar validacao integrada do endpoint POST /v1/conversations/turns para consultas de manifesto com intervalo temporal em linguagem natural, cobrindo equivalencias de frase (entre/de-ate/do dia X ao dia Y), verificando aplicacao de `dateFrom/dateTo`, ordenacao `recency_desc/recency_asc`, resumo natural com quantidade/periodo e regressao zero para consultas sem filtro temporal." 

---

## Atualizacao 2026-04-25 (evolucao conversacional component-first com planner/memory/results)

### Objetivo desta rodada

Executar a fase 03-backend-contracts da evolucao conversacional operacional IA com separacao de responsabilidades (planning/memory/results/tools), ampliacao de cobertura de tools, normalizacao de resultados para contrato visual e erros estruturados acionaveis, preservando compatibilidade retroativa de `POST /v1/conversations/turns`.

### Diagnostico inicial obrigatorio (antes das alteracoes)

1. Tools atuais:
- cobertura real concentrada em manifesto, jobs, auditoria e dashboard;
- havia base de orquestracao (`orchestrate_manifest_operation`) para casos compostos principais.

2. Lacunas de cobertura:
- baixa cobertura explicita no registry para documentos lifecycle, CDF/CDR, catalogos, parceiros, operacoes, DMR e MTR provisorio;
- ausencia de tipos de resultado detalhados para varios cenarios operacionais.

3. Gargalos de memoria:
- havia memoria operacional util (manifest refs, selection, jobs, artifacts), mas sem `memoryPatch` por turno com intent/tool/date-range sintetizados.

4. Gargalos de normalizacao:
- normalizacao distribuida e parcialmente inferida por heuristica local;
- faltava centralizacao para `result.type/data/artifacts/actions` com tipagem minima padronizada.

5. Gargalos de renderizacao/contrato backend->frontend:
- respostas `executed` ja traziam estrutura, mas `blocked/failed/responded` nem sempre retornavam payload visual acionavel consistente.

6. Riscos de compatibilidade:
- alterar shape principal de resposta quebraria consumidores atuais;
- ampliar toolset sem policy/schema poderia abrir regressao de seguranca.

7. Plano em fases aplicado nesta rodada:
- F1: separar modulos de planning, memory e results;
- F2: ampliar registry/schemas/policy + dispatcher deterministico para ferramentas adicionais;
- F3: integrar operation-plan + memoryPatch + normalizador central no `conversation-service`;
- F4: validar typecheck + suites api/integration/contract + unit focais adicionadas.

### Arquivos analisados nesta rodada

- `src/routes/conversation-routes.ts`
- `src/services/conversation/conversation-service.ts`
- `src/services/conversation/llm-provider.ts`
- `src/services/conversation/ai-config.ts`
- `src/services/conversation/conversation-tool-dispatcher.ts`
- `src/services/conversation/conversation-context-service.ts`
- `src/services/conversation/conversation-policy-service.ts`
- `src/services/conversation/conversation-observability.ts`
- `src/services/conversation/tools/tool-registry.ts`
- `src/services/conversation/tools/tool-types.ts`
- `src/services/manifest-service.ts`
- `src/services/job-service.ts`
- `src/services/audit-service.ts`
- `src/services/catalog-service.ts`
- `src/services/partner-service.ts`
- `src/services/operations-service.ts`
- `src/services/dmr-service.ts`
- `src/services/mtr-provisorio-service.ts`
- `docs/copilot/16-camada-conversacional.md`
- `docs/copilot/conversacional/*.md`
- `docs/handoffs/conversacional-sicat-consolidacao/03-backend-contracts.md`
- `docs/handoffs/conversacional-operacional-ia/*.md` (sem edicao em `00-orchestration.md`, conforme instrucao)

### Implementacao aplicada

1. Separacao de responsabilidades (component-first):
- `src/services/conversation/planning/conversation-date-range-resolver.ts`
- `src/services/conversation/planning/conversation-entity-resolver.ts`
- `src/services/conversation/planning/conversation-operation-planner.ts`
- `src/services/conversation/memory/conversation-memory-types.ts`
- `src/services/conversation/memory/conversation-memory-service.ts`
- `src/services/conversation/results/conversation-result-types.ts`
- `src/services/conversation/results/conversation-result-normalizer.ts`

2. Planner multi-etapas estruturado:
- operation plan com `steps`, `dependsOn`, `risk`, `requiresConfirmation`;
- resolucao contextual de entidades e intervalo temporal (incluindo relativo `lastDays`).

3. Memoria operacional rica com patch por turno:
- `memoryPatch` persistido em `conversation_memory.summary_kind = memory_patch`;
- patch inclui intent, lastToolName, manifest/job/artifact refs e dateRange resolvido.

4. Normalizador central de resultado:
- consolidacao em `normalizeConversationStructuredResult` e `normalizeConversationStructuredError`;
- padronizacao de payload visual com `type/data/artifacts/actions`;
- erros retornam `error_explanation` com `correlationId`, `reasonCode`, sugestao e acao de follow-up.

5. Expansao de tools registry + schemas + dispatcher (cobertura real):
- novos tools registrados e validados: `list_manifest_documents`, `list_cdf_certificates`, `enqueue_cdf_download`, `list_jobs`, `query_catalog`, `search_partners`, `get_operations_overview`, `list_dmr`, `list_mtr_provisorio`;
- dispatcher passou a executar essas tools via services/repositorios existentes (deterministico, sem acesso direto do LLM a DB/gateway/credenciais).

6. Policy/confirmacao atualizadas:
- permissoes e checks de contexto adaptados aos novos tools;
- confirmacao exigida para `enqueue_cdf_download` (R3), sem quebrar contratos atuais.

7. Compatibilidade retroativa:
- shape principal de `/v1/conversations/turns` mantido (`status`, `responseText`, `toolCall`, `policy`, `context`);
- extensoes adicionadas de forma backward-compatible em `result` e `structuredPayload`.

### Arquivos alterados nesta rodada

- `src/services/conversation/conversation-service.ts`
- `src/services/conversation/conversation-tool-dispatcher.ts`
- `src/services/conversation/conversation-policy-service.ts`
- `src/services/conversation/llm-provider.ts`
- `src/services/conversation/tools/tool-types.ts`
- `src/services/conversation/tools/tool-registry.ts`
- `src/services/conversation/tools/tool-schemas.ts`
- `src/services/conversation/planning/conversation-date-range-resolver.ts`
- `src/services/conversation/planning/conversation-entity-resolver.ts`
- `src/services/conversation/planning/conversation-operation-planner.ts`
- `src/services/conversation/memory/conversation-memory-types.ts`
- `src/services/conversation/memory/conversation-memory-service.ts`
- `src/services/conversation/results/conversation-result-types.ts`
- `src/services/conversation/results/conversation-result-normalizer.ts`
- `tests/unit/conversation-policy-service.test.js`
- `tests/unit/conversation-operation-planner.test.js`
- `tests/unit/conversation-result-normalizer.test.js`
- `docs/handoffs/conversacional-operacional-ia/03-backend-contracts.md`

### Validacoes executadas

1. `npm run typecheck`
- resultado: sucesso.

2. `npm run test:api`
- resultado: sucesso (23/23 passando).

3. `npm run test:integration`
- resultado: sucesso (125/125 passando).

4. `npm run test:contract`
- resultado: sucesso (4/4 passando + `validate:openapi` ok).

5. testes unitarios focais adicionados:
- `npx tsx --test tests/unit/conversation-policy-service.test.js tests/unit/conversation-operation-planner.test.js tests/unit/conversation-result-normalizer.test.js`
- resultado: sucesso (17/17 passando).

### Riscos remanescentes

1. O classificador/planner LLM ainda e sensivel a qualidade semantica do prompt para intents novos fora dos casos cobertos por testes atuais.
2. Parte dos novos tipos minimos solicitados depende de evolucao adicional de intents no dispatcher para cobertura 100% (ex.: comparacoes/agregacoes e previews especializados mais granulares).
3. Nao houve mudanca em OpenAPI nesta rodada por manter retrocompatibilidade do endpoint existente; se frontend exigir contrato explicito de novos `result.type`, recomendada fase contratual dedicada.

### Handoff para proximo agente

`next_agent_required`: `manifestos-operacional-mtr`

Prompt sugerido para fase 05-domain-rules:

"Executar a fase 05-domain-rules do work_id conversacional-operacional-ia sobre a base component-first recem-implementada, validando e refinando regras de dominio para intents compostos (agrupamento/agregacao/comparacao, batch preview/confirmacao, lifecycle de documentos PDF/ZIP, CDF/CDR, jobs/auditoria/catalogos/parceiros), garantindo coerencia de policy/confirmacao por risco, sem quebrar o contrato atual de POST /v1/conversations/turns, e registrando evidencias no checkpoint 05-domain-rules.md." 

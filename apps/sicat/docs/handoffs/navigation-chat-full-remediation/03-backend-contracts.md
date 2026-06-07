# 03 - Backend Contracts

## Objetivo da fase

Corrigir causa raiz de incoerencia de periodo entre recorte curto e amplo em endpoints de Manifestos/Relatorio MTR, endurecer consistencia do chat para pedidos variados (incluindo follow-up) e manter rastreabilidade de erro acionavel sem quebra de contrato OpenAPI.

## Diagnostico

### Achado 1: inconsistencias em recorte amplo apos autosync vazio

No fluxo de `listManifests` em modo real, quando a sincronizacao automatica com CETESB retornava lista vazia (`remoteItems.length === 0`) e `forceSync !== true`, o backend removia o espelho local da janela (`deleteManifestsForMirrorWindow`).

Efeito colateral observado:
- recorte curto podia ter dados locais validos;
- recorte amplo (que deveria conter o curto) acionava autosync vazio e apagava cache local;
- resultado final ficava incoerente entre periodos e contaminava consultas de Relatorio MTR (que le da mesma tabela `manifests`).

### Achado 2: autocorrecao silenciosa de periodo invertido no chat

Na camada conversacional havia autocorrecao silenciosa de intervalo invertido (swap de `dateFrom`/`dateTo`) em mais de um ponto:
- normalizacao do planner LLM;
- resolvedor de periodo da fase de planning/memory;
- resolvedor de periodo na execucao de tool dispatcher.

Efeito colateral:
- pedidos simples/filtrados/compostos/follow-up podiam ser executados com criterio diferente do pedido do operador;
- dificuldade de diagnostico operacional por falta de erro explicito.

## Causa raiz

1. Regra destrutiva no autosync nao-forcado ao receber retorno remoto vazio, limpando espelho local de forma agressiva.
2. Estrategia de tolerancia no chat baseada em swap automatico de datas invertidas, gerando incoerencia silenciosa.

## Alteracoes aplicadas

### 1) Preservacao de espelho local em autosync vazio nao-forcado

Arquivo:
- src/services/manifest-service.ts

Mudancas:
- adicionado `buildSyncEmptyPreserveWarning(...)`;
- em `listManifests`, ramo `remoteItems.length === 0` com `!forceSync` agora:
  - **nao** executa `deleteManifestsForMirrorWindow`;
  - **nao** executa reconciliacao destrutiva neste ramo;
  - retorna pagina local com `syncWarning.code = CETESB_SYNC_EMPTY_PRESERVED`.

Resultado esperado:
- recorte amplo deixa de apagar cache valido e passa a respeitar monotonicidade de periodo (amplo contendo curto), quando os dados ja existem localmente.

### 2) Chat: erro explicito para periodo invertido (sem swap silencioso)

Arquivos:
- src/services/conversation/conversation-tool-dispatcher.ts
- src/services/conversation/llm-provider.ts
- src/services/conversation/planning/conversation-date-range-resolver.ts
- src/services/conversation/conversation-service.ts

Mudancas:
- removido swap silencioso em `resolveTemporalPair` (llm-provider);
- removido swap silencioso no date range resolver de planning/memory;
- `resolveManifestDateRange` agora lança `AppError(400)` com `code: CONVERSATION_INVALID_DATE_RANGE` e contexto (`dateFrom`, `dateTo`) quando intervalo vem invertido;
- adicionada validacao de ordem tambem para tools diretas `list_manifests` e `list_cdf_certificates`;
- adicionada mensagem operacional acionavel no mapeamento de erro (`resolveOperationalErrorMessageByCode`) para `CONVERSATION_INVALID_DATE_RANGE`.

Resultado esperado:
- chat passa a responder de forma consistente e rastreavel para pedidos variados/follow-up com periodo invertido, sem executar consulta com criterio alterado implicitamente.

## Testes de regressao adicionados/ajustados

Arquivos:
- tests/integration/manifest-list-search.test.js
- tests/integration/conversation-composed-operations.test.js
- tests/unit/conversation-recency-direction.test.js

Cobertura adicionada:
1. `manifest-list-search`:
- teste novo valida que autosync remoto vazio em recorte amplo **preserva cache local**;
- valida consistencia curto vs amplo em Manifestos;
- valida consistencia curto vs amplo em Relatorio MTR (`reportsMtrSearch`) no mesmo cenario.

2. `conversation-composed-operations`:
- teste novo de follow-up com periodo invertido garante status `failed`, mensagem acionavel e `reasonCode` estruturado (`CONVERSATION_INVALID_DATE_RANGE`).

3. `conversation-recency-direction`:
- ajuste de expectativa para confirmar que normalizacao nao corrige mais intervalo invertido silenciosamente.

## Validacoes executadas

1. Typecheck:
- comando: `npm run typecheck`
- resultado: aprovado.

2. Testes focais:
- comando: `npx tsx --test tests/integration/manifest-list-search.test.js tests/integration/conversation-composed-operations.test.js tests/unit/conversation-recency-direction.test.js`
- resultado: 29 passed, 0 failed.

## Contrato/OpenAPI

- Nenhuma alteracao de superficie HTTP de API publica foi introduzida.
- Nao houve mudanca em OpenAPI nem em `src/generated/operations.ts`.
- Estruturas de erro continuam compativeis com padrao `application/problem+json` (AppError centralizado), com melhoria de codigo/contexto para diagnostico no fluxo conversacional.

## Riscos residuais e pendencias

1. O warning `CETESB_SYNC_EMPTY_PRESERVED` evita perda indevida, mas pode manter dado stale por mais tempo quando CETESB realmente nao tem mais itens. Isso e intencional para seguranca operacional em autosync nao-forcado.
2. Reconciliacao de ghost continua ativa em `forceSync` (comportamento mantido por intencao explicita do operador).
3. Recomenda-se QA validar cenario e2e real com CETESB instavel para confirmar UX e telemetria do warning no frontend.

## Handoff para fase 09 (tester-qa-mtr)

Status: next_agent_required

Prompt pronto para tester-qa-mtr:

"work_id: navigation-chat-full-remediation

Voce e owner da fase 09-qa-validation.

Objetivo:
Validar regressao completa apos correcoes da fase 03-backend-contracts, com foco em:
1) consistencia de periodo curto vs amplo em Manifestos e Relatorio MTR;
2) consistencia do chat para pedidos variados e follow-up com intervalo invertido;
3) rastreabilidade de erro acionavel.

Contexto tecnico entregue pela fase 03:
- `listManifests` nao apaga mais espelho local quando autosync remoto retornar vazio em modo nao-forcado; agora retorna warning `CETESB_SYNC_EMPTY_PRESERVED`.
- chat nao faz mais swap silencioso de periodo invertido; agora retorna erro explicito `CONVERSATION_INVALID_DATE_RANGE` com mensagem acionavel.
- mapeamento de erro conversacional atualizado para operador.

Arquivos alterados na fase 03:
- src/services/manifest-service.ts
- src/services/conversation/conversation-tool-dispatcher.ts
- src/services/conversation/llm-provider.ts
- src/services/conversation/planning/conversation-date-range-resolver.ts
- src/services/conversation/conversation-service.ts
- tests/integration/manifest-list-search.test.js
- tests/integration/conversation-composed-operations.test.js
- tests/unit/conversation-recency-direction.test.js

Evidencias ja executadas:
- npm run typecheck: ok
- npx tsx --test tests/integration/manifest-list-search.test.js tests/integration/conversation-composed-operations.test.js tests/unit/conversation-recency-direction.test.js: 29 passed / 0 failed

Checklist QA solicitado:
- executar suites relevantes de integracao/api/contract do backend;
- validar cenario monotonicidade de datas (recorte amplo contendo curto) sem regressao;
- validar chat em consulta simples, filtrada, composta e follow-up, incluindo periodo invertido com resposta acionavel;
- validar que erros continuam padronizados e sem falhas silenciosas;
- registrar checkpoint em docs/handoffs/navigation-chat-full-remediation/09-qa-validation.md com achados, evidencias e status final."
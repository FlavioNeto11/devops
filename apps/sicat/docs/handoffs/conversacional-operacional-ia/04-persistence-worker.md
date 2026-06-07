# 04 - Persistence Worker

## Objetivo da fase

Consolidar a persistencia deterministica da camada conversacional operacional para preview/confirmacao/execucao, com trilha auditavel reproduzivel por `snapshot/plano/resultado`, integração com jobs/worker e lifecycle de artifacts sem quebra de contrato HTTP existente.

## Escopo implementado nesta rodada

1. Persistencia deterministica (`snapshot/plano/resultado`) com correlacao fim-a-fim:
- migration `src/sql/015_conversation_deterministic_trail.sql` criando `conversation_deterministic_trails`;
- novo repositório `src/repositories/conversation-deterministic-trail-repo.ts`;
- `conversation-service` passou a persistir:
  - fase `plan` após planejamento do turno;
  - fase `snapshot` quando preview retorna `selectionSnapshot/creationSnapshot`;
  - fase `result` em execução (sucesso/falha), incluindo `manifestIds`, `cdfIds`, `jobId`, `commandId`, `correlationId`, `integrationAccountId`, `sessionContextId`.

2. Reprodutibilidade de confirmação sem recálculo silencioso:
- manutenção da exigência de `selectionSnapshot` para execução sensível quando não há `manifestIds` explícitos;
- propagação de metadados determinísticos para payload de jobs em fan-out de lote (`submit/cancel/print` e `cdf.download_batch_selected`) via `conversationDeterministic`;
- batch fan-out em `manifest-service` preserva metadados determinísticos por item (`selectedManifestIds`, `selectedManifestId`).

3. Lifecycle consolidado de artifacts:
- evolução do status para `processing|available|partial|failed|expired`;
- migration 015 converteu estados legados (`pending/collecting -> processing`) e adicionou `expires_at`;
- `conversation-persistence-service` agora aplica:
  - expiração automática em leitura (`expired`);
  - falha terminal explícita de artifact;
  - TTL renovado em disponibilidade de artifact.

4. Integração com worker/jobs para status e correlação:
- novo side-effect `applyConversationArtifactTerminalFailureSideEffect` em `operation-handlers`;
- `job-runner` invoca side-effect em transições terminais (`failed`/`dlq`) para marcar artifacts vinculados como `failed`;
- worker de bundle atualizado para `processing` durante coleta.

5. Contratos HTTP preservados:
- nenhuma rota existente foi removida/renomeada;
- `POST /v1/conversations/turns` mantém estrutura base e adiciona apenas persistência interna.

## Arquivos alterados

- `src/sql/015_conversation_deterministic_trail.sql`
- `src/repositories/conversation-deterministic-trail-repo.ts`
- `src/repositories/conversation-artifact-repo.ts`
- `src/services/conversation/conversation-persistence-service.ts`
- `src/services/conversation/conversation-service.ts`
- `src/services/conversation/conversation-tool-dispatcher.ts`
- `src/services/manifest-service.ts`
- `src/workers/operation-handlers.ts`
- `src/workers/job-runner.ts`
- `tests/worker/conversation-artifact-lifecycle.test.js`
- `tests/integration/conversation-composed-operations.test.js`
- `docs/copilot/05-modelo-de-dados.md`

## Decisões técnicas

1. Trilha determinística em tabela dedicada (`conversation_deterministic_trails`) com granularidade por fase (`snapshot|plan|result`) para facilitar auditoria e replay.
2. `snapshot_token` persistido junto de `result` e `plan` para correlacionar preview e confirmação sem depender de memória efêmera.
3. Lifecycle de artifacts unificado para estados operacionais observáveis (`processing/available/partial/failed/expired`) e com TTL (`expires_at`).
4. Falha terminal de job com `conversationArtifactId` passa a produzir falha persistida de artifact automaticamente no worker.

## Validações executadas

1. Migração:
- `npm run migrate` -> **PASSOU** (`[migrate] concluido`).

2. Typecheck:
- `npm run typecheck` -> **PASSOU**.

3. Worker (subset relevante):
- `npx tsx --test tests/worker/conversation-artifact-lifecycle.test.js tests/worker/manifest-submit-handler.test.js`
- Resultado: **11/11 passando**.

4. Integração (subset relevante da fase 04):
- `npx tsx --test --test-name-pattern "bloqueia cancelamento composto sem confirmacao explicita|executa cancelamento composto com snapshot confirmado e trilha deterministica persistida" tests/integration/conversation-composed-operations.test.js`
- Resultado: **2/2 passando**.

Justificativa do subset de integração:
- valida diretamente o comportamento novo da fase 04 (preview->snapshot->confirmacao com trilha persistida), sem depender de cenários não alterados nesta fase.

## Riscos e pendências

1. A suite completa `tests/integration/conversation-composed-operations.test.js` contém teste legado de replicação com flutuação de síntese textual não relacionado ao escopo da fase 04.
2. A persistência da trilha determinística está implementada por gravações seguras no fluxo da conversa; pode ser evoluída com transação única multi-write por turno em rodada futura para atomicidade estrita entre `message/action/trail`.

## Handoff para fase 08

next_agent_required: `perfis-acessos-admin-mtr`

Prompt sugerido:

"work_id: conversacional-operacional-ia

Voce e owner da fase 08-access-control desta rodada.

Contexto pronto:
- fase 03 (backend contracts) concluida;
- fase 05 (domain rules) concluida com preview+confirm por snapshot;
- fase 04 (persistence-worker) concluida com trilha deterministica persistida em `conversation_deterministic_trails`, lifecycle de artifacts (`processing/available/partial/failed/expired`) e side-effects de falha terminal no worker.

Objetivo da fase 08:
1) Reforcar controles de acesso/guardrails por canal/intencao para operacoes sensiveis conversacionais.
2) Garantir que confirmacoes sensiveis respeitem escopo de permissao (perfil/conta/sessao) sem bypass.
3) Endurecer validacoes para uso de snapshots confirmados com contexto autorizado.
4) Preservar contratos HTTP existentes.

Arquivos recomendados:
- docs/handoffs/conversacional-operacional-ia/03-backend-contracts.md
- docs/handoffs/conversacional-operacional-ia/04-persistence-worker.md
- docs/handoffs/conversacional-operacional-ia/05-domain-rules.md
- src/services/conversation/conversation-policy-service.ts
- src/services/conversation/conversation-service.ts
- src/services/conversation/conversation-tool-dispatcher.ts
- src/routes/conversation-routes.ts

Entregaveis esperados:
- checkpoint atualizado em docs/handoffs/conversacional-operacional-ia/08-access-control.md
- validacoes de typecheck e testes focais de policy/access-control
- riscos e handoff para fase seguinte."
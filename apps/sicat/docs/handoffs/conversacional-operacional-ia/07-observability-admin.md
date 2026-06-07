# 07 - Observability & Readiness (Fase 6, primeira onda)

## Objetivo da fase

Executar hardening da camada conversacional nativa (sem WhatsApp), cobrindo:

- telemetria essencial de sucesso, falha, bloqueio por policy e fallback;
- fallback seguro quando provider falhar;
- sinal de readiness operacional da camada conversacional nativa;
- testes minimos de backend para os comportamentos acima.

## Arquivos analisados

- `src/services/conversation/conversation-service.ts`
- `src/services/conversation/conversation-policy-service.ts`
- `src/services/conversation/llm-provider.ts`
- `src/routes/conversation-routes.ts`
- `src/routes/health-routes.ts`
- `tests/unit/conversation-policy-service.test.js`
- `docs/handoffs/conversacional-operacional-ia/README.md`
- `docs/handoffs/conversacional-operacional-ia/05-copilot-runbook.md`
- `docs/handoffs/conversacional-operacional-ia/02-checklist-fases.md`
- `docs/copilot/16-camada-conversacional.md`
- `docs/copilot/conversacional/*`

## Implementacao realizada

1. Telemetria essencial (primeira onda)

- Novo modulo: `src/services/conversation/conversation-observability.ts`.
- Contadores adicionados:
  - `totalTurns`
  - `outcomes.responded|blocked|executed|failed`
  - `policyBlockedTotal`
  - `providerFailuresTotal`
  - `fallbackTriggeredTotal`
- Breakdowns adicionados:
  - `blockedByReason`
  - `fallbackByReason`

1. Fallback seguro de provider com trilha auditavel

- `conversation-service` agora trata falha de `llmProvider.plan()` com resposta consultiva segura, sem quebrar o fluxo HTTP.
- Mensagem de fallback inclui `correlationId` para troubleshooting.
- Fallback registra:
  - telemetria (`providerFailuresTotal`, `fallbackTriggeredTotal`, `outcomes.responded`)
  - message log conversacional
  - action log conversacional (`actionType: fallback.provider`)
  - audit trail tecnico (`audit_logs`) via persistencia segura.

1. Hardening de persistencia/auditoria

- Insercoes de auditoria na camada conversacional passaram a usar persistencia segura (`persistSafely`) para evitar quebra de fluxo por falha de I/O de auditoria.

1. Readiness operacional da camada conversacional nativa

- Endpoint existente `GET /health/system` foi enriquecido com bloco `conversation`:
  - `readiness` (`component`, `ready`, `status`, `mode`, `channels`, `provider.lastFailure*`)
  - `telemetry` (snapshot dos contadores essenciais)
- Sem criar endpoint novo fora do padrao existente.

## Arquivos alterados

- `src/services/conversation/conversation-service.ts`
- `src/services/conversation/conversation-observability.ts` (novo)
- `src/routes/health-routes.ts`
- `tests/unit/conversation-observability.test.js` (novo)
- `tests/unit/conversation-service-fallback.test.js` (novo)

## Validacoes executadas

1. Typecheck

- Comando: `npm run typecheck`
- Resultado: sucesso

1. Testes unitarios focados

- Comando:
  - `npx tsx --test tests/unit/conversation-policy-service.test.js tests/unit/conversation-observability.test.js tests/unit/conversation-service-fallback.test.js`
- Resultado:
  - `6 passed / 0 failed`
- Observacao:
  - durante o teste de fallback apareceram warnings de FK em persistencia conversacional por ausencia de precondicoes completas de banco no cenario isolado; o comportamento esperado da fase (nao quebrar fluxo e responder com fallback seguro) foi validado com sucesso.

## Decisoes tecnicas

- Nao foi implementado canal externo nem alteracao de policy para bypass de acao sensivel.
- Nao foi criado endpoint novo de health; foi reutilizado `GET /health/system` para readiness conversacional.
- Fallback prioriza continuidade consultiva e rastreabilidade por `correlationId`.

## Escopo explicitamente nao tocado

- WhatsApp, webhook de canal externo, vinculacao por telefone e adaptadores externos: **nao implementados nesta fase**.

## Handoff sugerido

- `tester-qa-mtr` para validacao integrada de readiness/telemetria em stack real.

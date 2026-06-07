# 07 — Observability & Admin: Centro Operacional SICAT

> **Fase**: 04-observability-admin (orchestration) → checkpoint padrão
> `07-observability-admin.md`.
> **Owner**: `dashboard-observability-mtr`.
> **Anteriores**:
> [00-orchestration.md](./00-orchestration.md),
> [01-baseline-docs.md](./01-baseline-docs.md),
> [03-backend-contracts.md](./03-backend-contracts.md),
> [04-persistence-worker.md](./04-persistence-worker.md).

## Objetivo da fase

Consolidar a taxonomia operacional do Centro Operacional SICAT (13 estados),
publicar o registry canônico em código, ampliar `/v1/operations/overview`
com listas enriquecidas (`recentJobs`, `recentErrors`, `recentDlq`
enriquecido) e expor severidade/ação recomendada/retryability/bucket em
`/v1/jobs/search`. Alinhar contrato OpenAPI + exemplos + operations
geradas em lockstep. Não tocar em frontend (fase 05) nem em CETESB gateway.

## Arquivos analisados

- [docs/handoffs/centro-operacional-sicat/00-orchestration.md](./00-orchestration.md)
- [docs/handoffs/centro-operacional-sicat/03-backend-contracts.md](./03-backend-contracts.md)
- [docs/handoffs/centro-operacional-sicat/04-persistence-worker.md](./04-persistence-worker.md)
- [src/services/operations-service.ts](../../../src/services/operations-service.ts) — `mapOperationalStatus`, `getOperationsOverview`, `mapJobSearchItem`
- [src/repositories/operations-repo.ts](../../../src/repositories/operations-repo.ts) — `getOperationsOverviewSummary`
- [openapi/mtr_automacao_openapi_interna.yaml](../../../openapi/mtr_automacao_openapi_interna.yaml) — `OperationsOverviewResponse`, `JobSearchItem`, `JobOperationalStatus`
- [examples/get_v1_operations_overview_response.json](../../../examples/get_v1_operations_overview_response.json)
- [tests/unit/operations-status-mapper.test.js](../../../tests/unit/operations-status-mapper.test.js)

## Decisões

1. **Taxonomia canônica em uma única fonte de verdade de código.**
   Criada `src/lib/operational-status.ts` com `OPERATIONAL_STATUS_REGISTRY`
   (13 entradas frozen) + helpers `mapJobToOperationalStatus` /
   `describeOperationalStatus` / `describeJobOperationalStatus`. Backend e
   frontend devem importar dessa lib; nunca duplicar a tabela.

2. **`mapOperationalStatus` em `operations-service.ts` agora delega ao lib.**
   Preserva a assinatura usada pelos testes
   (`tests/unit/operations-status-mapper.test.js` — 11/11 verde) e mantém
   passthrough para status físicos desconhecidos.

3. **Detecção heurística por hint de erro/contexto.** Adicionados
   discriminadores para `blocked_external_data`,
   `blocked_missing_context`, `awaiting_remote_confirmation` e
   `completed_with_no_items`, baseados em substrings em `last_error_code`,
   `dlq_reason` e (futuro) `result_summary`. Critérios documentados em
   [docs/05-operacao/taxonomia-status-erros-operacionais.md](../../05-operacao/taxonomia-status-erros-operacionais.md).

4. **Enriquecimento backward-compatible em `/v1/operations/overview`.**
   - `recentDlq`: cada item ganhou `operationalStatus`, `label`,
     `severity`, `recommendedAction`, `retryable`, `bucket` (campos
     existentes preservados).
   - Novos `recentJobs` (top 10 por `greatest(finished_at, started_at,
     queued_at)`) e `recentErrors` (top 10 com status `failed | cancelled
     | dlq`), ambos com descritor + links (`self`, `events`, `retry`,
     `audit`).
   - Counters jobs/manifests/accounts/sessions inalterados para preservar
     leitores existentes.

5. **Enriquecimento em `/v1/jobs/search`.** `JobSearchItem` agora carrega
   `label`, `severity`, `recommendedAction`, `retryable`, `bucket` ao lado
   do `operationalStatus` já existente. Nenhum campo removido.

6. **Lockstep aplicado.** OpenAPI atualizado com novo schema
   `OverviewRecentJobItem` + componentes auxiliares
   `OperationalStatusSeverity` / `OperationalStatusRetryable` /
   `OperationalStatusBucket`. Exemplo `examples/get_v1_operations_overview_response.json`
   reescrito com todos os campos novos. `npm run gen:operations`
   regenerou as 72 operações tipadas.

7. **Não tocado.** `src/gateways/cetesb-gateway.js` (proibido).
   Frontend Vue (responsabilidade de `frontend-vue-ux-mtr`).
   Migrations SQL e índices (cobertos na fase 03).

## Arquivos criados / alterados

### Criados

- [src/lib/operational-status.ts](../../../src/lib/operational-status.ts) —
  registry canônico + helpers.
- [docs/05-operacao/taxonomia-status-erros-operacionais.md](../../05-operacao/taxonomia-status-erros-operacionais.md) —
  documentação canônica dos 13 estados (label, severity, retryable,
  bucket, recommendedAction, regras de transição, mapeamento).
- [docs/handoffs/centro-operacional-sicat/07-observability-admin.md](./07-observability-admin.md) —
  este checkpoint.

### Alterados

- [src/services/operations-service.ts](../../../src/services/operations-service.ts) —
  delegação ao lib, enriquecimento de overview e job search items.
- [src/repositories/operations-repo.ts](../../../src/repositories/operations-repo.ts) —
  novos selects `recentJobs`, `recentErrors` e tipos
  `OverviewRecentJobRow` / `OverviewRecentErrorRow`.
- [openapi/mtr_automacao_openapi_interna.yaml](../../../openapi/mtr_automacao_openapi_interna.yaml) —
  `OperationsOverviewResponse` ampliado, `JobSearchItem` enriquecido,
  novos schemas `OverviewRecentJobItem`, `OperationalStatusSeverity`,
  `OperationalStatusRetryable`, `OperationalStatusBucket`.
- [examples/get_v1_operations_overview_response.json](../../../examples/get_v1_operations_overview_response.json) —
  exemplo completo com `recentDlq` enriquecido + `recentJobs` +
  `recentErrors`.
- [src/generated/operations.js](../../../src/generated/operations.js) e
  [src/generated/operations.ts](../../../src/generated/operations.ts) —
  regenerados via `npm run gen:operations` (72 operações).

## Validações executadas

| comando | resultado |
| --- | --- |
| `npm run validate:openapi` | `[ok] OpenAPI validado` + fonte da verdade CETESB ok + links ok |
| `npm run gen:operations` | `[ok] 72 operações regeneradas em src/generated/operations.js` |
| `npm run typecheck` | sem erros |
| `npm run test:contract` | `# tests 4 # pass 4` (CommandAccepted, exemplo job vs enum, exemplos de comando) |
| `npm run test:api` | `# tests 23 # pass 23` (AuthN/AuthZ + SICAT Dual Auth + CETESB Accounts) |
| `npx tsx --test tests/unit/operations-status-mapper.test.js` | `# tests 11 # pass 11` |

## Pendências e itens fora de escopo

- **Frontend**: aplicar `describeOperationalStatus` em badges, filtros e
  ações sugeridas — fase 05 (`frontend-vue-ux-mtr`).
- **`result_summary` em jobs**: o campo já é considerado pelo mapper
  (`completed_with_no_items`), mas ainda não é populado por todos os
  handlers. Avaliar enriquecimento em `src/workers/operation-handlers.ts`
  numa frente futura — não é bloqueador para fase 05.
- **`/v1/health/jobs/active` e `/v1/health/jobs/dlq`**: hoje retornam o
  shape do health-service; podem ser enriquecidos com descritor numa
  passada incremental quando o frontend exigir. Compatibilidade atual
  preservada.
- **Exports volumosos** (`/v1/reports/mtrs/export`): segue limite
  síncrono de 5 000 linhas (DL fase 02). Migração para 202 + job fica
  para fase futura.

## Handoff explícito

`next_agent`: **frontend-vue-ux-mtr**
`next_phase`: **05-frontend**
`next_checkpoint`: `docs/handoffs/centro-operacional-sicat/06-frontend-ux.md`

### Prompt sugerido para `frontend-vue-ux-mtr`

```text
work_id: centro-operacional-sicat
fase: 05-frontend
checkpoint mestre: docs/handoffs/centro-operacional-sicat/00-orchestration.md
anteriores: 01-baseline-docs.md, 03-backend-contracts.md,
            04-persistence-worker.md, 07-observability-admin.md

CONTEXTO
Backend, persistência e taxonomia operacional prontos. Endpoints disponíveis:
- GET /v1/operations/overview (counters + recentDlq/recentJobs/recentErrors enriquecidos)
- GET /v1/jobs/search (itens com operationalStatus + label/severity/recommendedAction/retryable/bucket)
- POST /v1/jobs/{jobId}/retry (Idempotency-Key suportado, 202 + command-accepted)
- GET /v1/audit/search e /v1/audit/{correlationId}
- GET /v1/cetesb/accounts/health e /v1/cetesb/sessions/health
- GET /v1/reports/mtrs e /v1/reports/mtrs/export (CSV síncrono, limite 5 000)

Taxonomia canônica: docs/05-operacao/taxonomia-status-erros-operacionais.md.
Registry de código: src/lib/operational-status.ts (NÃO duplicar; portar a
mesma tabela para frontend/src/lib/operational-status.{js,ts} ou expor via API
helper, mas mantendo paridade exata).

ENTREGÁVEIS
1. Criar módulos sob frontend/src/modules/:
   - operations-dashboard/ (consome /v1/operations/overview; KPI cards +
     listas recentJobs/recentErrors/recentDlq com badges severity/label e
     ação rápida via recommendedAction).
   - jobs-console/ (consome /v1/jobs/search com filtros por status,
     operação, conta, sessão, correlationId; tabela com badge operacional;
     ação Retry quando retryable !== 'false', integrando POST /v1/jobs/:id/retry
     com Idempotency-Key).
   - audit-explorer/ (consome /v1/audit/search + drill-down por correlationId).
   - cetesb-accounts-health/ (consome /v1/cetesb/accounts/health e
     /v1/cetesb/sessions/health; visão por conta + sessões + jobs falhos 24h).
   - mtr-reports/ (consome /v1/reports/mtrs com filtros + botão Export CSV
     calling /v1/reports/mtrs/export, tratando 413 com mensagem amigável).
   - command-center/ (base estrutural: commandRegistry.js + CommandCenterView.vue;
     ainda sem backend de IA — apenas registry + skeleton conforme
     docs/04-arquitetura/command-center-sicat.md).
2. Tabela canônica de severity/label/recommendedAction/retryable/bucket
   importada/portada de src/lib/operational-status.ts. Componente
   <OperationalStatusBadge :status="..." /> reutilizado em todos os módulos.
3. Rotas Vue protegidas em frontend/src/router.js (auth guard + seleção de
   conta CETESB onde aplicável).
4. Testes Playwright em frontend/tests/ui/ cobrindo cada novo módulo
   (smoke de render + 1 fluxo crítico por módulo).
5. Sem tocar backend, OpenAPI, exemplos ou gateway.
6. Atualizar docs/handoffs/centro-operacional-sicat/06-frontend-ux.md ao
   final, com handoff para tester-qa-mtr (fase 07-qa).

VALIDAÇÕES MÍNIMAS
- npm --prefix frontend run build
- npm --prefix frontend run test:ui (smoke + módulos novos)
- Visualização local opcional via task "workflow: dev (real-dev)".

REGRAS
- Não tocar em src/**, openapi/**, examples/**, src/gateways/**.
- Não fazer commit/push.
- Manter lockstep com a taxonomia (sem inventar status novo).
- Não marcar IMPLEMENTADO sem evidência (link de arquivo + teste).
```

Se o runtime não conseguir invocar `frontend-vue-ux-mtr`, devolver
`next_agent_required: frontend-vue-ux-mtr` com este prompt.

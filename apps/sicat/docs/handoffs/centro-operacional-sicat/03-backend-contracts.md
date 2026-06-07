# 03 — Backend Contracts: Centro Operacional SICAT

> **Nota de numeração**: O orchestration list inicialmente apontou
> `02-backend-contracts.md`. Optei por seguir o template padrão dos modos
> (`03-backend-contracts.md`) para ficar coerente com os outros checkpoints
> da sequência. A fase é a "02" do orchestration.

## Objetivo da fase

Implementar/consolidar os endpoints operacionais do Centro Operacional SICAT
respeitando a fronteira `route → service → repository → job → worker → gateway`,
sem alterar o gateway CETESB, e mantendo lockstep entre OpenAPI, exemplos,
operations geradas, rotas e testes.

## Escopo entregue

Endpoints publicados (todos derivados de fontes locais — nenhuma chamada CETESB):

| Método | Rota | Tag | Sucesso |
|--------|------|-----|---------|
| GET | `/v1/operations/overview` | Operations | 200 |
| GET | `/v1/jobs/search` | Jobs | 200 |
| POST | `/v1/jobs/{jobId}/retry` | Jobs | 202 |
| GET | `/v1/audit/search` | Audit | 200 |
| GET | `/v1/cetesb/accounts/health` | CETESB | 200 |
| GET | `/v1/cetesb/sessions/health` | CETESB | 200 |
| GET | `/v1/reports/mtrs` | Reports | 200 |
| GET | `/v1/reports/mtrs/export` | Reports | 200 (text/csv) |

Endpoints já existentes mantidos sem alteração (consolidados no checkpoint):
`GET /v1/jobs/{jobId}`, `GET /v1/jobs/{jobId}/events`,
`GET /v1/audit/{correlationId}`.

## Arquivos analisados

- [docs/handoffs/centro-operacional-sicat/00-orchestration.md](../../handoffs/centro-operacional-sicat/00-orchestration.md)
- [docs/handoffs/centro-operacional-sicat/01-baseline-docs.md](../../handoffs/centro-operacional-sicat/01-baseline-docs.md)
- [src/routes/api-routes.ts](../../../src/routes/api-routes.ts)
- [src/services/manifest-service.ts](../../../src/services/manifest-service.ts) (padrão `enqueueX` + `buildCommandAccepted`)
- [src/services/cadastro-service.ts](../../../src/services/cadastro-service.ts) (padrão idempotência)
- [src/services/job-service.ts](../../../src/services/job-service.ts)
- [src/services/audit-service.ts](../../../src/services/audit-service.ts)
- [src/services/idempotency-service.ts](../../../src/services/idempotency-service.ts)
- [src/services/sicat-account-service.ts](../../../src/services/sicat-account-service.ts) (`buildIntegrationAccountId` = `'acc_' || sicat_account.id`)
- [src/repositories/job-repo.ts](../../../src/repositories/job-repo.ts) (`insertJob`, `findJobById`, `requeueFromDLQ`, `updateJob`, `version`)
- [src/repositories/audit-repo.ts](../../../src/repositories/audit-repo.ts)
- [src/repositories/health-repo.ts](../../../src/repositories/health-repo.ts) (DL-022)
- [src/lib/command-response.ts](../../../src/lib/command-response.ts)
- [src/lib/problem.ts](../../../src/lib/problem.ts)
- [src/lib/retry.ts](../../../src/lib/retry.ts)
- [src/lib/ids.ts](../../../src/lib/ids.ts)
- [src/sql/001_init.sql](../../../src/sql/001_init.sql)
- [src/sql/002_queue_improvements.sql](../../../src/sql/002_queue_improvements.sql)
- [src/sql/006_sicat_dual_auth_persistence.sql](../../../src/sql/006_sicat_dual_auth_persistence.sql)
- [openapi/mtr_automacao_openapi_interna.yaml](../../../openapi/mtr_automacao_openapi_interna.yaml)
- [src/generated/operations.ts](../../../src/generated/operations.ts)
- [src/generated/operations.js](../../../src/generated/operations.js)
- [scripts/generate-operations.js](../../../scripts/generate-operations.js)

## Decisões

1. **Export CSV síncrono com cap (REPORT_EXPORT_LIMIT_EXCEEDED)**
   `/v1/reports/mtrs/export` retorna `text/csv` síncrono limitado a 5000 linhas.
   Acima disso retorna `413` com `code: REPORT_EXPORT_LIMIT_EXCEEDED` orientando
   o cliente a estreitar filtros. Evolução prevista para fase 04: 202 + job
   assíncrono para exports volumosos.

2. **`operationalStatus` derivado**
   Cada item de `/v1/jobs/search` traz `operationalStatus` (taxonomia ampla
   antecipada para a fase 04). Mapper isolado em
   `mapOperationalStatus()` no service. Discrimina `failed` por prefixo do
   `lastErrorCode` (`VALIDATION|CONTRACT` → `failed_validation`, `AUTH` →
   `failed_remote_auth`, `REMOTE|CETESB` → `failed_remote_contract`,
   default → `failed_internal_processing`). `succeeded` → `completed_with_document`.
   `cancelled` → `failed_internal_processing`. Demais status mantêm o nome.
   Fica forward-compat: `dashboard-observability-mtr` poderá ampliar/refinar
   sem quebrar o contrato.

3. **`/v1/operations/overview` é complementar a `/v1/dashboard/overview`**
   `dashboard/overview` (DL-022) cobre health/snapshots/metrics e timeline com
   foco em manifestos. O novo endpoint foca **agregações operacionais**
   (counters de jobs por status, succeeded/failed em 24h, manifestos por
   status, sumário de contas/sessões, top-10 DLQ). Evita duplicação:
   payloads não se sobrepõem.

4. **CETESB Health = derivado local (zero round-trip externo)**
   `/v1/cetesb/accounts/health` e `/v1/cetesb/sessions/health` consultam
   `sicat_cetesb_accounts`, `session_contexts` e `jobs`. **Não** chamam o
   gateway. Status agregado por conta:
   - `inactive` se `is_active = false`
   - `healthy` se `active_sessions > 0`
   - `pending` se `pending_sessions > 0`
   - `degraded` se `expired + invalid > 0`
   - `idle` caso contrário

5. **Retry seguro com lineage**
   `POST /v1/jobs/{jobId}/retry`:
   - DLQ → `requeueFromDLQ(jobId)` (preserva jobId, zera attempts).
   - `failed`/`cancelled` → `insertJob(...)` cria novo job (novo jobId/commandId)
     preservando linhagem em `payload._retryOf`. O job original permanece como
     histórico imutável.
   - `queued`/`running`/`retry_wait`/`succeeded` → 409
     `JOB_NOT_RETRYABLE`.
   - 404 quando o jobId não existe.
   - Idempotente via `Idempotency-Key` (operação `'job.retry'`).
   - Resposta 202 `CommandAccepted`.

6. **JOIN account ↔ session/jobs usa prefixo `acc_`**
   `session_contexts.integration_account_id = 'acc_' || sicat_cetesb_accounts.id`
   (mesma regra de `buildIntegrationAccountId`). Aggregations de jobs por conta
   usam `payload ->> 'integrationAccountId' = 'acc_' || a.id`.

7. **Sync do `operations.ts` via script auxiliar**
   `scripts/generate-operations.js` continua gerando apenas `.js` (intencional —
   single source of truth). Para manter `src/generated/operations.ts`
   alinhado, foi adicionado utilitário `scripts/sync-operations-ts.mjs` que lê
   o `.js` recém-gerado e reemite o `.ts` com o tipo `as const satisfies
   readonly OperationDefinition[]`. Fluxo padrão:
   `npm run gen:operations && node scripts/sync-operations-ts.mjs`.

8. **Boundary preservada**
   `src/routes/api-routes.ts` apenas roteia (sem regra de negócio).
   `src/services/operations-service.ts` orquestra (idempotência, mapping,
   retry, taxonomia).
   `src/repositories/operations-repo.ts` é o único lugar com SQL para os
   novos endpoints.
   Gateway `src/gateways/cetesb-gateway.js` **não foi tocado**.

## Arquivos criados

- [src/repositories/operations-repo.ts](../../../src/repositories/operations-repo.ts)
- [src/services/operations-service.ts](../../../src/services/operations-service.ts)
- [scripts/sync-operations-ts.mjs](../../../scripts/sync-operations-ts.mjs)
- [tests/unit/operations-status-mapper.test.js](../../../tests/unit/operations-status-mapper.test.js)
- [examples/get_v1_operations_overview_response.json](../../../examples/get_v1_operations_overview_response.json)
- [examples/get_v1_jobs_search_response.json](../../../examples/get_v1_jobs_search_response.json)
- [examples/post_v1_jobs_jobId_retry_response.json](../../../examples/post_v1_jobs_jobId_retry_response.json)
- [examples/get_v1_audit_search_response.json](../../../examples/get_v1_audit_search_response.json)
- [examples/get_v1_cetesb_accounts_health_response.json](../../../examples/get_v1_cetesb_accounts_health_response.json)
- [examples/get_v1_cetesb_sessions_health_response.json](../../../examples/get_v1_cetesb_sessions_health_response.json)
- [examples/get_v1_reports_mtrs_response.json](../../../examples/get_v1_reports_mtrs_response.json)

## Arquivos alterados

- [src/routes/api-routes.ts](../../../src/routes/api-routes.ts) — adicionadas 8 rotas. Search routes registradas **antes** das rotas parametrizadas (`/v1/jobs/:jobId`, `/v1/audit/:correlationId`) para evitar colisão de match no Express.
- [openapi/mtr_automacao_openapi_interna.yaml](../../../openapi/mtr_automacao_openapi_interna.yaml) — adicionados 8 paths, 3 tags (`Operations`, `CETESB`, `Reports`) e 13 schemas (`OperationsOverviewResponse`, `JobOperationalStatus`, `JobSearchItem`, `JobsSearchResponse`, `AuditSearchItem`, `AuditSearchResponse`, `CetesbAccountHealthItem`, `CetesbAccountsHealthResponse`, `CetesbSessionHealthItem`, `CetesbSessionsHealthResponse`, `ReportMtrItem`, `ReportsMtrsResponse`).
- [src/generated/operations.js](../../../src/generated/operations.js) — regenerado (72 ops).
- [src/generated/operations.ts](../../../src/generated/operations.ts) — sincronizado a partir do `.js`.

## Validações executadas

| Check | Resultado |
|------|-----------|
| `npm run validate:openapi` | ok — OpenAPI válido, source-of-truth CETESB válido, links OK |
| `npm run gen:operations` | ok — 72 operações regeneradas |
| `node scripts/sync-operations-ts.mjs` | ok — 72 operations sincronizadas |
| `npm run typecheck` | ok — zero erros |
| `npx tsx --test tests/unit/operations-status-mapper.test.js` | ok — 11/11 passes |
| `npm run test:contract` | ok — 4/4 passes + validate:openapi |

> Notas:
> - Tests de API/integração para os novos endpoints **não foram criados aqui**
>   porque dependem de seed/queries reais. Ficam para `tester-qa-mtr` na fase 07.
> - `npm run test:api` / `test:integration` / `test:worker` não foram executados
>   nesta fase — não houve alteração nas rotas/services pré-existentes que esses
>   testes cobrem; rodá-los é responsabilidade do `tester-qa-mtr`.

## Pendências e sinalizações para a fase 04

- Publicar `docs/05-operacao/taxonomia-status-erros-operacionais.md` com:
  registry de `operationalStatus` (label, severity, recommendedAction, retryable).
  O backend já produz o campo; falta o registry consumível pelo frontend.
- Considerar export assíncrono (job + 202) para `mtrs/export` quando filtros
  forem amplos. Hoje retorna 413 acima de 5000 linhas.

## Handoff para `postgres-queue-mtr` (fase 03-persistence-queue)

### Prompt pronto

> **Tarefa**: Avaliar e otimizar a camada de persistência/fila para suportar os
> novos endpoints operacionais publicados na fase 02 do work_id
> `centro-operacional-sicat`. Não alterar gateway CETESB. Manter fronteira.

### Pontos de atenção sugeridos

1. **Índices novos para `/v1/jobs/search`**
   - `create index if not exists idx_jobs_payload_integration_account on jobs ((payload ->> 'integrationAccountId'));`
   - `create index if not exists idx_jobs_status_operation_queued on jobs (status, operation, queued_at desc);`
   - Avaliar GIN em `payload` se filtros adicionais por chave JSONB se tornarem comuns.
2. **Índice de auditoria**
   - `create index if not exists idx_audit_logs_search on audit_logs (entity_type, occurred_at desc);` (complementa `idx_audit_correlation`).
3. **Agregações de overview**
   - Validar performance de `getOperationsOverviewSummary` em volume real.
   - Eventualmente materializar contadores (cache curto) se necessário.
4. **Health derivado**
   - Avaliar índice em `session_contexts(integration_account_id, status)`.
   - Avaliar índice em `manifests((payload ->> 'expeditionDate')::date)` para `/v1/reports/mtrs`.
5. **Retry seguro com optimistic locking**
   - Garantir que `requeueFromDLQ` e `insertJob` continuem coerentes com o
     campo `version` (DL-022). Caso necessário, propor `updateJobIfVersion`.
6. **Constraints adicionais**
   - Considerar constraint para impedir `dlq_reason` nulo quando `status='dlq'`
     (já há checks em DL-022; revisar para os novos cenários de retry).

### Próxima fase

`next_agent: postgres-queue-mtr`
`next_phase: 03-persistence-queue`
`next_checkpoint: docs/handoffs/centro-operacional-sicat/04-persistence-worker.md`

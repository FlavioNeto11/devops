# 04 — Persistence / Queue: Centro Operacional SICAT

> **Fase**: 03-persistence-queue (orchestration) → checkpoint padrão dos modos
> `04-persistence-worker.md`.
> **Owner**: `postgres-queue-mtr`.
> **Anteriores**:
> [00-orchestration.md](./00-orchestration.md),
> [01-baseline-docs.md](./01-baseline-docs.md),
> [03-backend-contracts.md](./03-backend-contracts.md).

## Objetivo da fase

Sustentar, em persistência e fila, os 8 endpoints do Centro Operacional
publicados na fase 02 (`operations/overview`, `jobs/search`, `jobs/:id/retry`,
`audit/search`, `cetesb/accounts/health`, `cetesb/sessions/health`,
`reports/mtrs`, `reports/mtrs/export`), garantindo:

- índices que evitem table-scan nas novas queries;
- retry seguro com optimistic locking (DL-022) preservando linhagem
  `_retryOf`;
- preservação das 5 constraints de consistência DL-022 e da fronteira
  `route → service → repo → job → worker → gateway`;
- migrations idempotentes (seguras de reaplicar).

## Arquivos analisados

- [docs/handoffs/centro-operacional-sicat/00-orchestration.md](./00-orchestration.md)
- [docs/handoffs/centro-operacional-sicat/03-backend-contracts.md](./03-backend-contracts.md)
- [src/repositories/operations-repo.ts](../../../src/repositories/operations-repo.ts) — todas as queries da fase 02
- [src/repositories/job-repo.ts](../../../src/repositories/job-repo.ts) — `requeueFromDLQ`, `updateJobWithOptimisticLock`
- [src/services/operations-service.ts](../../../src/services/operations-service.ts) — `retryJob` (DLQ vs failed/cancelled)
- [src/sql/001_init.sql](../../../src/sql/001_init.sql) — schema base de jobs / audit_logs / manifests / session_contexts
- [src/sql/002_queue_improvements.sql](../../../src/sql/002_queue_improvements.sql) — índices `idx_jobs_polling_v2`, `idx_jobs_claimed`, `idx_jobs_dlq`, `idx_jobs_performance`, DLQ
- [src/sql/004_advanced_locking_consistency.sql](../../../src/sql/004_advanced_locking_consistency.sql) — `version` + trigger `trg_jobs_version`, 5 constraints (chk_manifest_submitted_integrity, chk_job_finished_integrity, chk_job_running_integrity, chk_job_retry_wait_integrity, chk_job_attempts_integrity), `worker_health`, `system_events`, `performance_snapshots`, `idx_performance_snapshots`, `idx_jobs_next_retry_due`, `idx_jobs_errors`, `idx_jobs_tags_gin`, `idx_manifests_correlation`
- [src/sql/005_worker_claim_lease.sql](../../../src/sql/005_worker_claim_lease.sql) — `idx_jobs_running_claim_lease`
- [src/sql/006_sicat_dual_auth_persistence.sql](../../../src/sql/006_sicat_dual_auth_persistence.sql) — `sicat_cetesb_accounts` + índices
- [src/sql/007_queue_transactional_consistency.sql](../../../src/sql/007_queue_transactional_consistency.sql)
- [src/sql/010_async_operation_entities.sql](../../../src/sql/010_async_operation_entities.sql)

## Decisões

1. **Migration nova `012_operations_indexes.sql` (idempotente)**
   Apenas `create index if not exists`, sem alterações de schema. Não toca
   nas 5 constraints DL-022 nem nos triggers de versioning.

2. **Lista do que já existia (não reaplicado)**
   - `jobs`: `idx_jobs_polling`, `idx_jobs_polling_v2`, `idx_jobs_entity`,
     `idx_jobs_claimed`, `idx_jobs_dlq`, `idx_jobs_performance`,
     `idx_jobs_next_retry_due`, `idx_jobs_errors`, `idx_jobs_tags_gin`,
     `idx_jobs_running_claim_lease`.
   - `job_dead_letter_queue`: `idx_dlq_correlation`, `idx_dlq_operation`,
     `idx_dlq_entity`.
   - `audit_logs`: `idx_audit_correlation` (correlation_id, occurred_at).
   - `manifests`: `idx_manifests_filters`
     (integration_account_id, status, external_status, created_at desc),
     `idx_manifests_correlation`.
   - `performance_snapshots`: `idx_performance_snapshots`
     (metric_name, snapshot_at desc).
   - `sicat_cetesb_accounts`: `idx_sicat_cetesb_accounts_user_id`,
     `idx_sicat_cetesb_accounts_is_active`,
     `idx_sicat_cetesb_accounts_last_usage_at`.

3. **Índices novos criados**
   - `idx_jobs_payload_integration_account` em
     `jobs ((payload ->> 'integrationAccountId'))` — usado por
     `searchJobs`, `getAccountsHealth` (left join agregado), filtros do
     overview.
   - `idx_jobs_payload_session_context` em
     `jobs ((payload ->> 'sessionContextId'))` — drill-down por sessão.
   - `idx_jobs_status_finished_at` em `jobs (status, finished_at desc)` —
     counters `succeeded_24h`, `failed_24h` em
     `getOperationsOverviewSummary`.
   - `idx_jobs_operation_status` em `jobs (operation, status)` —
     filtros combinados de `searchJobs` e agregações por operação.
   - `idx_jobs_correlation_id` em `jobs (correlation_id)` — lookup direto
     de jobs por correlationId em `searchJobs` e auditoria.
   - `idx_audit_logs_entity_occurred` em
     `audit_logs (entity_type, occurred_at desc)` — filtro principal de
     `searchAuditEntries`.
   - `idx_audit_logs_component_occurred` em
     `audit_logs (component, occurred_at desc)` — filtro por componente.
   - `idx_session_contexts_account_status` em
     `session_contexts (integration_account_id, status)` — left join
     agregado de `getAccountsHealth`.
   - `idx_session_contexts_status_updated` em
     `session_contexts (status, updated_at desc)` — listagem de
     `getSessionsHealth` (limit 500).
   - `idx_manifests_expedition_date_text` em
     `manifests ((payload ->> 'expeditionDate'))` — filtros de
     `/v1/reports/mtrs` (data exata e seletividade alta).
     **Tentativa anterior**: índice funcional com `::date` (`((payload
     ->> 'expeditionDate')::date)`) falhou na criação porque o cast
     text→date não é IMMUTABLE em Postgres (`42P17 — functions in index
     expression must be marked IMMUTABLE`). Solução adotada: índice em
     texto puro (formato ISO `YYYY-MM-DD` ordena lexicograficamente).
     Filtros de range continuam fazendo cast em filter pós-leitura.

4. **GIN não criado**
   Não foi criado índice GIN em `jobs.payload` ou `manifests.payload`.
   Custo de manutenção alto e os caminhos JSONB usados hoje
   (`integrationAccountId`, `sessionContextId`, `expeditionDate`,
   partner codes em `generator/carrier/receiver.partnerCode`) são
   cobertos por filtros de seletividade alta a montante. Reavaliar se
   surgirem filtros adicionais frequentes por chaves JSONB.

5. **Retry seguro com optimistic locking (DL-022)**
   - `POST /v1/jobs/:id/retry` em `operations-service.ts → retryJob`:
     - `dlq` → `requeueFromDLQ(jobId)` (mantém `job_id` original);
     - `failed` / `cancelled` → `insertJob` cria novo job (novo `jobId` /
       `commandId`) preservando linhagem em `payload._retryOf` (jobId,
       previousStatus, previousAttempts, previousErrorCode,
       previousErrorMessage, retriedAt);
     - demais status → `409 JOB_NOT_RETRYABLE`;
     - `Idempotency-Key` honrado via `getIdempotentResponse` /
       `rememberIdempotentResponse` para a operação `'job.retry'`.
   - `requeueFromDLQ` em `src/repositories/job-repo.ts` foi reforçado:
     - `select ... from job_dead_letter_queue where job_id = $1 for update`
       (lock da linha DLQ);
     - `select status, version from jobs where job_id = $1 for update`
       (lock da linha de jobs e captura da `version` corrente);
     - validação `current.status === 'dlq'` antes de prosseguir;
     - `UPDATE jobs SET ... WHERE job_id = $1 AND status = 'dlq' AND
       version = $2` — bloqueia race de requeue concorrente; o trigger
       `trg_jobs_version` incrementa a `version` automaticamente;
     - se `rowCount === 0`, lança `OptimisticLockError` explícito.
   - `failed`/`cancelled` não precisam de optimistic lock no job original
     (que permanece imutável como histórico). O job filho é inserido
     novo via `insertJob`.

6. **Constraints DL-022 preservadas**
   As 5 constraints (`chk_manifest_submitted_integrity`,
   `chk_job_finished_integrity`, `chk_job_running_integrity`,
   `chk_job_retry_wait_integrity`, `chk_job_attempts_integrity`)
   continuam ativas — esta migration apenas adiciona índices, sem
   alteração de tabelas, status ou triggers.

7. **Paginação estável já honrada**
   - `searchJobs` ordena por
     `coalesce(j.queued_at, j.created_at) desc, j.job_id desc`
     (tiebreaker estável pelo PK), com `count(*)` separado usando o
     mesmo WHERE — o índice composto
     `idx_jobs_payload_integration_account` + parâmetros de status
     reduz table-scan; `idx_jobs_status_finished_at` cobre subset por
     status.
   - `searchAuditEntries` ordena por `occurred_at desc, id desc`
     (PK `bigserial`) — `idx_audit_logs_entity_occurred` cobre o caso
     principal.
   - `searchReportsMtrs` ordena por
     `coalesce((payload ->> 'expeditionDate')::date, created_at::date) desc, id desc`
     com count separado.
   Decisão de manter o `ORDER BY` atual (em vez de `created_at, id`)
   porque o serviço já está publicado e os clientes esperam ordenação
   por data operacional. A nota do prompt foi tratada: tiebreaker
   estável existe em todas as três queries de search.

8. **Health derivado, sem chamadas ao gateway**
   `getAccountsHealth` e `getSessionsHealth` continuam consultando
   somente tabelas locais (`sicat_cetesb_accounts`, `session_contexts`,
   `jobs`). Nenhuma chamada para `src/gateways/cetesb-gateway.js`.

## Arquivos criados

- [src/sql/012_operations_indexes.sql](../../../src/sql/012_operations_indexes.sql)

## Arquivos alterados

- [src/repositories/job-repo.ts](../../../src/repositories/job-repo.ts) —
  `requeueFromDLQ` agora usa `for update` (DLQ + jobs) + check de
  `status = 'dlq'` + check de `version` no UPDATE, lançando
  `OptimisticLockError` quando o predicado falha. Trigger
  `trg_jobs_version` continua incrementando a `version` no UPDATE.

## Validações executadas

| Check | Resultado |
|------|-----------|
| `npm run typecheck` | ok — zero erros |
| `npm run migrate` (aplicação de `012_operations_indexes.sql`) | ok — `[migrate] aplicado 012_operations_indexes.sql` |
| `npm run test:contract` | ok — 4/4 + `validate:openapi` ok + `validate-cetesb-source-of-truth` ok + links ok (643 arquivos) |
| `npm run test:integration` | ok — 124/124 (suítes 13) |
| `npm run test:worker` | ok — 14/14 (suítes 3) |

## Pendências / sinalizações para a fase 04

- `dashboard-observability-mtr` deve criar
  `docs/05-operacao/taxonomia-status-erros-operacionais.md` cobrindo o
  registry consumido pelo backend e frontend. Estados a documentar
  (label, severity, recommendedAction, retryable):
  - `ready`, `running`, `retry_wait`, `dlq`,
  - `blocked_external_data`, `blocked_missing_context`,
  - `awaiting_remote_confirmation`,
  - `completed_with_no_items`, `completed_with_document`,
  - `failed_validation`, `failed_remote_auth`, `failed_remote_contract`,
    `failed_internal_processing`.
- Alinhar a taxonomia com `mapOperationalStatus` em
  [src/services/operations-service.ts](../../../src/services/operations-service.ts).
  Hoje o mapper produz: `queued|running|retry_wait|dlq|completed_with_document|failed_validation|failed_remote_auth|failed_remote_contract|failed_internal_processing`.
  Estados `blocked_*`, `awaiting_remote_confirmation`,
  `completed_with_no_items` e `ready` ainda não são produzidos pelo
  mapper — caberá ao especialista de observabilidade decidir se amplia
  a heurística (precisa de novos sinais em `payload`/`lastErrorCode`)
  ou se documenta como “reservados para evoluções futuras”.
- Avaliar enriquecer `/v1/operations/overview` com `severity` e
  `recommendedAction` agregados por bucket operacional, expostos no
  payload do overview se trouxerem valor para a UI.
- Considerar export assíncrono (`202` + job) para `/v1/reports/mtrs/export`
  quando filtros forem amplos — hoje retorna `413
  REPORT_EXPORT_LIMIT_EXCEEDED` acima de 5000 linhas (já documentado na
  fase 02).

## Handoff para `dashboard-observability-mtr` (fase 04-observability-admin)

### Prompt pronto

> **Tarefa**: Consolidar a observabilidade do Centro Operacional SICAT,
> publicar a taxonomia de status/erros operacionais e alinhar o backend
> e (futuramente) o frontend ao registry. Não tocar gateway CETESB. Não
> criar páginas Vue (frontend é fase 05). Não commitar/push.
>
> work_id: `centro-operacional-sicat`. Fase: `04-observability-admin`.
> Checkpoint mestre:
> [docs/handoffs/centro-operacional-sicat/00-orchestration.md](./00-orchestration.md).
> Anteriores: `01-baseline-docs.md`, `03-backend-contracts.md`,
> `04-persistence-worker.md` (este).
>
> **Entregáveis mínimos**:
> 1. Criar `docs/05-operacao/taxonomia-status-erros-operacionais.md` com
>    o registry consumível por backend e frontend, contendo para cada
>    status: `code`, `label`, `severity` (info|warning|error|fatal),
>    `recommendedAction` (texto curto e acionável), `retryable`
>    (boolean), `bucket` (queued|in_flight|blocked|awaiting|completed|failed).
>    Estados a cobrir: `ready`, `running`, `retry_wait`, `dlq`,
>    `blocked_external_data`, `blocked_missing_context`,
>    `awaiting_remote_confirmation`, `completed_with_no_items`,
>    `completed_with_document`, `failed_validation`,
>    `failed_remote_auth`, `failed_remote_contract`,
>    `failed_internal_processing`.
> 2. Alinhar com `mapOperationalStatus` em
>    [src/services/operations-service.ts](../../../src/services/operations-service.ts).
>    Decidir e implementar (em service, não no repo) se amplia a
>    heurística para emitir `blocked_*`,
>    `awaiting_remote_confirmation`, `completed_with_no_items` e `ready`
>    com base em campos disponíveis em `jobs`/`manifests`/`session_contexts`,
>    ou se documenta esses estados como reservados.
> 3. Avaliar e, se válido, expor `severity`/`recommendedAction` por
>    bucket no payload de `GET /v1/operations/overview` (sem regredir o
>    contrato existente — adicionar campos opcionais).
> 4. Atualizar `OpenAPI` + `examples/` + `src/generated/operations.ts`
>    se a superfície HTTP mudar (lockstep). Rodar `validate:openapi`,
>    `gen:operations`, `sync-operations-ts`, `typecheck`,
>    `test:contract` e (se aplicável) `smoke:health` /
>    `test:integration`.
> 5. Criar checkpoint
>    `docs/handoffs/centro-operacional-sicat/07-observability-admin.md`
>    com objetivo, arquivos analisados, decisões, criados/alterados,
>    validações e handoff explícito para `frontend-vue-ux-mtr`
>    (fase 05-frontend).
> 6. Atualizar [00-orchestration.md](./00-orchestration.md) marcando a
>    fase `04-observability-admin` como concluída e ajustando
>    `next_agent` / `next_phase` para `frontend-vue-ux-mtr` /
>    `05-frontend`.
>
> **Restrições**:
> - Não tocar `src/gateways/cetesb-gateway.js`.
> - Não criar páginas Vue (delegar para fase 05).
> - Não commitar/push.
> - Preservar fronteira route → service → repo → job → worker → gateway.
> - Preservar 5 constraints DL-022 e versioning.
> - Não marcar IMPLEMENTADO sem evidência (código + teste + doc).
>
> **Retorno esperado**: arquivos criados/alterados, resultado das
> validações e handoff explícito para `frontend-vue-ux-mtr` ou
> `next_agent_required` se runtime não invocar o próximo subagente.

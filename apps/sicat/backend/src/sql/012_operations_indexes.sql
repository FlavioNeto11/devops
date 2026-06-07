-- Migration 012: Índices de suporte aos endpoints do Centro Operacional SICAT
-- Data: 2026-04-25
-- Work_id: centro-operacional-sicat (fase 03-persistence-queue)
--
-- Objetivo: criar índices necessários para sustentar os endpoints publicados
-- na fase 02 (operations/overview, jobs/search, audit/search, cetesb/*/health,
-- reports/mtrs) sem regressão de performance, todos idempotentes.
--
-- Índices já existentes (NÃO recriados aqui — apenas referenciados):
--   jobs:
--     idx_jobs_polling, idx_jobs_polling_v2, idx_jobs_entity,
--     idx_jobs_claimed, idx_jobs_dlq, idx_jobs_performance,
--     idx_jobs_next_retry_due, idx_jobs_errors, idx_jobs_tags_gin,
--     idx_jobs_running_claim_lease
--   job_dead_letter_queue: idx_dlq_correlation, idx_dlq_operation, idx_dlq_entity
--   audit_logs: idx_audit_correlation
--   manifests: idx_manifests_filters, idx_manifests_correlation
--   performance_snapshots: idx_performance_snapshots
--   sicat_cetesb_accounts: idx_sicat_cetesb_accounts_user_id,
--     idx_sicat_cetesb_accounts_is_active, idx_sicat_cetesb_accounts_last_usage_at

-- =============================================================================
-- 1. JOBS — suporte a /v1/jobs/search e agregações de /v1/operations/overview
-- =============================================================================

-- Filtro por integrationAccountId derivado de payload.
create index if not exists idx_jobs_payload_integration_account on jobs (
    (
        payload ->> 'integrationAccountId'
    )
);

-- Filtro por sessionContextId derivado de payload (joins de auditoria).
create index if not exists idx_jobs_payload_session_context on jobs (
    (
        payload ->> 'sessionContextId'
    )
);

-- Counters de overview por status + janela de 24h em finished_at.
create index if not exists idx_jobs_status_finished_at on jobs (status, finished_at desc);

-- Aggregations / filtros por (operation, status).
create index if not exists idx_jobs_operation_status on jobs (operation, status);

-- Lookup direto por correlationId (jobs/search e drill-down de auditoria).
create index if not exists idx_jobs_correlation_id on jobs (correlation_id);

-- =============================================================================
-- 2. AUDIT_LOGS — suporte a /v1/audit/search e /v1/audit/{correlationId}
-- =============================================================================

-- Busca por entity_type ordenada por occurred_at desc.
create index if not exists idx_audit_logs_entity_occurred on audit_logs (entity_type, occurred_at desc);

-- Busca por componente (gateway, worker, route) ordenada por occurred_at desc.
create index if not exists idx_audit_logs_component_occurred on audit_logs (component, occurred_at desc);

-- =============================================================================
-- 3. SESSION_CONTEXTS — suporte a /v1/cetesb/sessions/health e accounts/health
-- =============================================================================

-- Agrupamento por account + status (left join em accounts/health).
create index if not exists idx_session_contexts_account_status on session_contexts (
    integration_account_id,
    status
);

-- Listagem mais recente por status (sessions/health, ordenada por updated_at).
create index if not exists idx_session_contexts_status_updated on session_contexts (status, updated_at desc);

-- =============================================================================
-- 4. MANIFESTS — suporte a /v1/reports/mtrs (filtro por data de expedição)
-- =============================================================================

-- Índice em texto puro de expeditionDate (formato ISO YYYY-MM-DD); o cast
-- ::date no SELECT/WHERE não é IMMUTABLE e não pode ser usado em índice
-- funcional. Mantemos o índice em texto para acelerar filtros de seletividade
-- alta (data exata) e o planner faz filter pós-leitura nos ranges.
create index if not exists idx_manifests_expedition_date_text on manifests (
    (payload ->> 'expeditionDate')
);

-- =============================================================================
-- Notas:
-- - Não foi criado índice GIN em jobs.payload nem manifests.payload por agora.
--   O custo de manutenção é alto e os filtros JSONB atuais (integrationAccountId,
--   sessionContextId, expeditionDate, partner codes) são cobertos pelos índices
--   funcionais acima ou por filtros de seletividade alta a montante.
-- - performance_snapshots já tem idx_performance_snapshots(metric_name,
--   snapshot_at desc); não foi necessário novo índice nesta migration.
-- - A 5 constraints DL-022 (chk_manifest_submitted_integrity,
--   chk_job_finished_integrity, chk_job_running_integrity,
--   chk_job_retry_wait_integrity, chk_job_attempts_integrity) seguem válidas:
--   esta migration não altera tabelas, apenas adiciona índices.
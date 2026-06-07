-- Migration 007: Consistência transacional da fila e locking operacional
-- Data: 2026-03-14
-- Objetivo:
--   1) evitar duplicidade de jobs ativos por entidade/operação
--   2) fortalecer invariantes de attempts/retry
--   3) melhorar path crítico de atualização por ownership do worker

-- 1) Normalizar duplicidades ativas legadas antes do índice único parcial
with ranked_active as (
  select
    job_id,
    row_number() over (
      partition by entity_type, entity_id, operation
      order by queued_at asc, created_at asc
    ) as rn
  from jobs
  where status in ('queued', 'running', 'retry_wait')
), duplicates as (
  select job_id
  from ranked_active
  where rn > 1
)
update jobs j
   set status = 'failed',
       finished_at = coalesce(j.finished_at, now()),
       next_retry_at = null,
       claimed_at = null,
       claim_heartbeat_at = null,
       claimed_by = null,
       last_error_code = 'JOB_DUPLICATE_ACTIVE',
       last_error_message = 'Duplicate active job superseded by unique active index migration',
       updated_at = now()
  from duplicates d
 where j.job_id = d.job_id;

-- 2) Garantir no máximo um job ativo por (entity_type, entity_id, operation)
create unique index if not exists ux_jobs_active_entity_operation
  on jobs(entity_type, entity_id, operation)
  where status in ('queued', 'running', 'retry_wait');

-- 3) Reforçar constraints de integridade para retries
alter table jobs drop constraint if exists chk_job_attempts_non_negative;
alter table jobs add constraint chk_job_attempts_non_negative check (attempts >= 0);

alter table jobs drop constraint if exists chk_job_max_attempts_positive;
alter table jobs add constraint chk_job_max_attempts_positive check (max_attempts >= 1);

alter table jobs drop constraint if exists chk_job_attempts_upper_bound;
alter table jobs add constraint chk_job_attempts_upper_bound check (
  (status = 'dlq') or (attempts <= max_attempts)
);

-- 4) Índice para updates ownership-safe do worker
create index if not exists idx_jobs_running_owner_update
  on jobs(job_id, claimed_by, status)
  where status = 'running';

-- 5) Evento de auditoria de migração
insert into system_events (event_type, severity, component, message, details)
values (
  'MIGRATION_APPLIED',
  'info',
  'migrations',
  'Migration 007 applied: transactional queue consistency and active-job deduplication',
  jsonb_build_object(
    'migration', '007_queue_transactional_consistency',
    'features', jsonb_build_array(
      'unique active job per entity/operation',
      'duplicate active cleanup',
      'retry integrity constraints',
      'worker ownership update index'
    )
  )
);

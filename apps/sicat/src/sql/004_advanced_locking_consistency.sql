-- Migration 004: Advanced locking, consistency e observabilidade
-- Data: 2026-03-09
-- Objetivo: Locking otimista, versioning, consistency checks, health monitoring

-- =============================================================================
-- 1. LOCKING OTIMISTA COM VERSIONING
-- =============================================================================

-- Adicionar version column para locking otimista
alter table jobs add column if not exists version integer not null default 1;
alter table manifests add column if not exists version integer not null default 1;
alter table session_contexts add column if not exists version integer not null default 1;

-- Trigger para incrementar version automaticamente
create or replace function increment_version()
returns trigger as $$
begin
  new.version = old.version + 1;
  new.updated_at = now();
  return new;
end;
$$ language plpgsql;

drop trigger if exists trg_jobs_version on jobs;
create trigger trg_jobs_version
  before update on jobs
  for each row
  when (old.* is distinct from new.*)
  execute function increment_version();

drop trigger if exists trg_manifests_version on manifests;
create trigger trg_manifests_version
  before update on manifests
  for each row
  when (old.* is distinct from new.*)
  execute function increment_version();

drop trigger if exists trg_session_contexts_version on session_contexts;
create trigger trg_session_contexts_version
  before update on session_contexts
  for each row
  when (old.* is distinct from new.*)
  execute function increment_version();

-- =============================================================================
-- 2. CONSISTENCY CHECKS E CONSTRAINTS AVANÇADAS
-- =============================================================================

-- Garantir que manifests com status 'submitted' tenham external_hash_code
alter table manifests drop constraint if exists chk_manifest_submitted_integrity;
alter table manifests add constraint chk_manifest_submitted_integrity check (
  (status != 'submitted') or 
  (status = 'submitted' and external_hash_code is not null)
);

-- Garantir que jobs succeeded/failed tenham finished_at
alter table jobs drop constraint if exists chk_job_finished_integrity;
alter table jobs add constraint chk_job_finished_integrity check (
  (status not in ('succeeded', 'failed')) or
  (status in ('succeeded', 'failed') and finished_at is not null)
);

-- Garantir que jobs running tenham claimed_at e claimed_by
alter table jobs drop constraint if exists chk_job_running_integrity;
alter table jobs add constraint chk_job_running_integrity check (
  (status != 'running') or
  (status = 'running' and claimed_at is not null and claimed_by is not null)
);

-- Garantir que retry_wait tenha next_retry_at definido
-- Nota: Não validamos se next_retry_at é futuro pois em testes pode ser passado
alter table jobs drop constraint if exists chk_job_retry_wait_integrity;
alter table jobs add constraint chk_job_retry_wait_integrity check (
  (status != 'retry_wait') or
  (status = 'retry_wait' and next_retry_at is not null)
);

-- Garantir que attempts não exceda max_attempts (exceto em DLQ)
alter table jobs drop constraint if exists chk_job_attempts_integrity;
alter table jobs add constraint chk_job_attempts_integrity check (
  (status = 'dlq') or
  (attempts <= max_attempts)
);

-- =============================================================================
-- 3. HEALTH MONITORING E OBSERVABILIDADE
-- =============================================================================

-- Tabela de health checks do worker
create table if not exists worker_health (
  worker_id text primary key,
  worker_name text not null,
  hostname text,
  pid integer,
  started_at timestamptz not null,
  last_heartbeat_at timestamptz not null default now(),
  last_job_claimed_at timestamptz,
  last_job_completed_at timestamptz,
  total_jobs_claimed integer not null default 0,
  total_jobs_succeeded integer not null default 0,
  total_jobs_failed integer not null default 0,
  total_jobs_dlq integer not null default 0,
  avg_job_duration_ms integer,
  status text not null default 'healthy' check (status in ('healthy', 'degraded', 'unhealthy', 'stopped')),
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists idx_worker_health_heartbeat on worker_health(last_heartbeat_at desc);
create index if not exists idx_worker_health_status on worker_health(status, last_heartbeat_at desc);

-- Tabela de eventos de sistema (para auditoria de operações críticas)
create table if not exists system_events (
  id bigserial primary key,
  event_type text not null check (event_type in (
    'MIGRATION_APPLIED', 
    'WORKER_STARTED', 
    'WORKER_STOPPED', 
    'JOB_DLQ_MOVED',
    'STALE_JOBS_REQUEUED',
    'CONSISTENCY_CHECK_FAILED',
    'PERFORMANCE_DEGRADATION',
    'ERROR_THRESHOLD_EXCEEDED'
  )),
  severity text not null default 'info' check (severity in ('debug', 'info', 'warning', 'error', 'critical')),
  component text not null,
  message text not null,
  details jsonb not null default '{}'::jsonb,
  correlation_id text,
  occurred_at timestamptz not null default now()
);

create index if not exists idx_system_events_type on system_events(event_type, occurred_at desc);
create index if not exists idx_system_events_severity on system_events(severity, occurred_at desc);
create index if not exists idx_system_events_correlation on system_events(correlation_id) where correlation_id is not null;

-- Tabela de performance snapshots (agregações rápidas para dashboards)
create table if not exists performance_snapshots (
  id bigserial primary key,
  snapshot_at timestamptz not null default now(),
  metric_name text not null,
  metric_value numeric not null,
  tags jsonb not null default '{}'::jsonb,
  unique(snapshot_at, metric_name, tags)
);

create index if not exists idx_performance_snapshots on performance_snapshots(metric_name, snapshot_at desc);

-- =============================================================================
-- 4. FUNÇÕES DE MANUTENÇÃO E LIMPEZA
-- =============================================================================

-- Função para limpar jobs antigos (execução manual/agendada)
create or replace function cleanup_old_jobs(
  p_retention_days integer default 30,
  p_batch_size integer default 1000
) returns table(deleted_count bigint) as $$
declare
  v_deleted bigint;
begin
  with to_delete as (
    select job_id
    from jobs
    where status in ('succeeded', 'failed')
      and finished_at < now() - (p_retention_days || ' days')::interval
    limit p_batch_size
  )
  delete from jobs
  where job_id in (select job_id from to_delete);
  
  get diagnostics v_deleted = row_count;
  
  insert into system_events (event_type, severity, component, message, details)
  values (
    'MIGRATION_APPLIED',
    'info',
    'cleanup_old_jobs',
    format('Deleted %s old jobs', v_deleted),
    jsonb_build_object('deleted_count', v_deleted, 'retention_days', p_retention_days)
  );
  
  return query select v_deleted;
end;
$$ language plpgsql;

-- Função para detectar workers não responsivos
create or replace function detect_unhealthy_workers(
  p_heartbeat_timeout_seconds integer default 300
) returns table(
  worker_id text,
  worker_name text,
  last_heartbeat_at timestamptz,
  seconds_since_heartbeat integer
) as $$
begin
  return query
  select 
    wh.worker_id,
    wh.worker_name,
    wh.last_heartbeat_at,
    extract(epoch from (now() - wh.last_heartbeat_at))::integer as seconds_since_heartbeat
  from worker_health wh
  where wh.status != 'stopped'
    and wh.last_heartbeat_at < now() - (p_heartbeat_timeout_seconds || ' seconds')::interval
  order by wh.last_heartbeat_at asc;
end;
$$ language plpgsql;

-- Função para calcular métricas de performance
create or replace function calculate_job_performance_metrics(
  p_hours_back integer default 24
) returns table(
  operation text,
  total_jobs bigint,
  succeeded_jobs bigint,
  failed_jobs bigint,
  dlq_jobs bigint,
  avg_duration_ms numeric,
  p50_duration_ms numeric,
  p95_duration_ms numeric,
  p99_duration_ms numeric,
  success_rate numeric
) as $$
begin
  return query
  select
    j.operation,
    count(*)::bigint as total_jobs,
    count(*) filter (where j.status = 'succeeded')::bigint as succeeded_jobs,
    count(*) filter (where j.status = 'failed')::bigint as failed_jobs,
    count(*) filter (where j.status = 'dlq')::bigint as dlq_jobs,
    avg(j.execution_time_ms) as avg_duration_ms,
    percentile_cont(0.50) within group (order by j.execution_time_ms) as p50_duration_ms,
    percentile_cont(0.95) within group (order by j.execution_time_ms) as p95_duration_ms,
    percentile_cont(0.99) within group (order by j.execution_time_ms) as p99_duration_ms,
    (count(*) filter (where j.status = 'succeeded')::numeric / nullif(count(*), 0) * 100) as success_rate
  from jobs j
  where j.finished_at >= now() - (p_hours_back || ' hours')::interval
    and j.status in ('succeeded', 'failed', 'dlq')
  group by j.operation
  order by total_jobs desc;
end;
$$ language plpgsql;

-- =============================================================================
-- 5. VIEWS PARA MONITORAMENTO
-- =============================================================================

-- View de jobs ativos (para dashboard)
create or replace view v_active_jobs as
select
  j.job_id,
  j.operation,
  j.entity_type,
  j.entity_id,
  j.status,
  j.attempts,
  j.max_attempts,
  j.priority,
  j.correlation_id,
  j.queued_at,
  j.claimed_at,
  j.claimed_by,
  j.next_retry_at,
  extract(epoch from (now() - j.queued_at))::integer as age_seconds,
  case 
    when j.status = 'running' and j.claimed_at is not null then
      extract(epoch from (now() - j.claimed_at))::integer
    else null
  end as running_duration_seconds,
  j.last_error_code,
  j.last_error_message,
  j.tags,
  j.version
from jobs j
where j.status in ('queued', 'running', 'retry_wait')
order by j.priority desc, j.queued_at asc;

-- View de health status geral
create or replace view v_system_health as
select
  (select count(*) from jobs where status = 'queued') as jobs_queued,
  (select count(*) from jobs where status = 'running') as jobs_running,
  (select count(*) from jobs where status = 'retry_wait') as jobs_retry_wait,
  (select count(*) from jobs where status = 'succeeded' and finished_at >= now() - interval '1 hour') as jobs_succeeded_1h,
  (select count(*) from jobs where status = 'failed' and finished_at >= now() - interval '1 hour') as jobs_failed_1h,
  (select count(*) from jobs where status = 'dlq') as jobs_dlq_total,
  (select count(*) from worker_health where status = 'healthy') as workers_healthy,
  (select count(*) from worker_health where status in ('degraded', 'unhealthy')) as workers_degraded,
  (select count(*) from worker_health where last_heartbeat_at >= now() - interval '5 minutes') as workers_active_5m,
  (select avg(execution_time_ms)::integer from jobs where status = 'succeeded' and finished_at >= now() - interval '1 hour') as avg_job_duration_ms_1h,
  now() as snapshot_at;

-- =============================================================================
-- 6. ÍNDICES ADICIONAIS PARA PERFORMANCE
-- =============================================================================

-- Índice parcial para jobs em retry_wait próximos de execução
-- Nota: Removido predicado com now() pois não é IMMUTABLE (causa erro no PostgreSQL 16+)
-- Worker buscará jobs em retry_wait com next_retry_at <= now() via query
create index if not exists idx_jobs_next_retry_due on jobs(next_retry_at) 
where status = 'retry_wait';

-- Índice para análise de erros
create index if not exists idx_jobs_errors on jobs(last_error_code, status, finished_at desc)
where last_error_code is not null;

-- Índice GIN para busca em tags
create index if not exists idx_jobs_tags_gin on jobs using gin(tags);

-- Índice para correlação de audit
create index if not exists idx_manifests_correlation on manifests(correlation_id, created_at desc);

-- =============================================================================
-- 7. REGISTRAR EVENTO DE MIGRATION
-- =============================================================================

insert into system_events (event_type, severity, component, message, details)
values (
  'MIGRATION_APPLIED',
  'info',
  'migrations',
  'Migration 004 applied: Advanced locking, consistency and observability',
  jsonb_build_object(
    'migration', '004_advanced_locking_consistency',
    'features', jsonb_build_array(
      'Optimistic locking with versioning',
      'Advanced consistency constraints',
      'Worker health monitoring',
      'System events tracking',
      'Performance snapshots',
      'Maintenance functions',
      'Monitoring views'
    )
  )
);

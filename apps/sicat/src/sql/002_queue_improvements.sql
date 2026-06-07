-- Migration 002: Melhorias na fila transacional e retry
-- Data: 2026-03-08
-- Objetivo: Adicionar campos para backoff exponencial, DLQ, priorização e observabilidade

-- 1. Adicionar campos de controle de retry avançado
alter table jobs add column if not exists priority integer not null default 0;
alter table jobs add column if not exists retry_strategy text not null default 'exponential';
alter table jobs add column if not exists base_delay_ms integer not null default 1000;
alter table jobs add column if not exists max_delay_ms integer not null default 300000;
alter table jobs add column if not exists retry_delays jsonb;
alter table jobs add column if not exists claimed_at timestamptz;
alter table jobs add column if not exists claimed_by text;
alter table jobs add column if not exists execution_time_ms integer;
alter table jobs add column if not exists tags jsonb not null default '[]'::jsonb;

-- 2. Adicionar campos de dead letter queue
alter table jobs add column if not exists dlq_moved_at timestamptz;
alter table jobs add column if not exists dlq_reason text;

-- 3. Melhorar índices para performance
drop index if exists idx_jobs_polling;
create index idx_jobs_polling_v2 on jobs(
  status, 
  priority desc, 
  next_retry_at, 
  queued_at
) where status in ('queued', 'retry_wait');

create index if not exists idx_jobs_claimed on jobs(claimed_at, claimed_by) where status = 'running';
create index if not exists idx_jobs_dlq on jobs(dlq_moved_at) where dlq_moved_at is not null;
create index if not exists idx_jobs_performance on jobs(operation, status, execution_time_ms);

-- 4. Criar tabela de dead letter queue
create table if not exists job_dead_letter_queue (
  id bigserial primary key,
  job_id text not null,
  command_id text not null,
  entity_type text not null,
  entity_id text not null,
  operation text not null,
  payload jsonb not null,
  attempts integer not null,
  max_attempts integer not null,
  last_error_code text,
  last_error_message text,
  retry_delays jsonb,
  tags jsonb,
  correlation_id text not null,
  moved_at timestamptz not null default now(),
  reason text not null,
  original_queued_at timestamptz not null,
  original_finished_at timestamptz
);

create index if not exists idx_dlq_correlation on job_dead_letter_queue(correlation_id, moved_at desc);
create index if not exists idx_dlq_operation on job_dead_letter_queue(operation, moved_at desc);
create index if not exists idx_dlq_entity on job_dead_letter_queue(entity_type, entity_id);

-- 5. Criar tabela de métricas agregadas (para observabilidade)
create table if not exists job_metrics_hourly (
  id bigserial primary key,
  hour_start timestamptz not null,
  operation text not null,
  status text not null,
  count integer not null default 0,
  avg_execution_time_ms integer,
  min_execution_time_ms integer,
  max_execution_time_ms integer,
  p50_execution_time_ms integer,
  p95_execution_time_ms integer,
  p99_execution_time_ms integer,
  total_retries integer not null default 0,
  unique(hour_start, operation, status)
);

create index if not exists idx_metrics_time on job_metrics_hourly(hour_start desc, operation);

-- 6. Adicionar constraints para validação
alter table jobs add constraint chk_status check (
  status in ('queued', 'running', 'retry_wait', 'succeeded', 'failed', 'dlq')
);

alter table jobs add constraint chk_retry_strategy check (
  retry_strategy in ('exponential', 'linear', 'fixed')
);

alter table jobs add constraint chk_priority check (
  priority >= 0 and priority <= 10
);

-- 7. Adicionar trigger para atualizar updated_at automaticamente
create or replace function update_jobs_updated_at()
returns trigger as $$
begin
  new.updated_at = now();
  return new;
end;
$$ language plpgsql;

drop trigger if exists trg_jobs_updated_at on jobs;
create trigger trg_jobs_updated_at
  before update on jobs
  for each row
  execute function update_jobs_updated_at();

-- 8. Função helper para calcular próximo retry com backoff exponencial
create or replace function calculate_next_retry(
  p_attempts integer,
  p_retry_strategy text,
  p_base_delay_ms integer,
  p_max_delay_ms integer
) returns timestamptz as $$
declare
  v_delay_ms integer;
  v_jitter_ms integer;
begin
  case p_retry_strategy
    when 'exponential' then
      -- Exponencial: base_delay * (2 ^ (attempts - 1))
      v_delay_ms := least(p_base_delay_ms * power(2, p_attempts - 1)::integer, p_max_delay_ms);
    when 'linear' then
      -- Linear: base_delay * attempts
      v_delay_ms := least(p_base_delay_ms * p_attempts, p_max_delay_ms);
    else
      -- Fixed: sempre base_delay
      v_delay_ms := p_base_delay_ms;
  end case;
  
  -- Adiciona jitter de até 10% para evitar thundering herd
  v_jitter_ms := (random() * v_delay_ms * 0.1)::integer;
  
  return now() + (v_delay_ms + v_jitter_ms) * interval '1 millisecond';
end;
$$ language plpgsql volatile;

-- 9. Registrar migration
insert into schema_migrations (version) values ('002_queue_improvements')
on conflict (version) do nothing;

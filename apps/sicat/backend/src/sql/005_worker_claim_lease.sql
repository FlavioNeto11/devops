-- Migration 005: Claim lease heartbeat para jobs running
-- Data: 2026-03-10
-- Objetivo: Evitar requeue indevido de jobs longos com worker saudável

-- 1. Campo de heartbeat de claim
alter table jobs add column if not exists claim_heartbeat_at timestamptz;

-- 2. Inicializar valor para jobs já running
update jobs
   set claim_heartbeat_at = coalesce(claimed_at, now())
 where status = 'running'
   and claim_heartbeat_at is null;

-- 3. Consistência adicional para running
alter table jobs drop constraint if exists chk_job_running_integrity;
alter table jobs add constraint chk_job_running_integrity check (
  (status != 'running') or
  (
    status = 'running'
    and claimed_at is not null
    and claimed_by is not null
    and started_at is not null
    and claim_heartbeat_at is not null
  )
);

-- 4. Índice para varredura de leases expirados
create index if not exists idx_jobs_running_claim_lease
  on jobs(claim_heartbeat_at, claimed_at)
  where status = 'running';

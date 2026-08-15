-- Migration 028: Transporte — ciclo do CIOT com provedor ABSTRAÍDO (PR-C2 do programa "SICAT
-- Transporte", DL-103, padrão DL-102 aplicado desde o início).
--
-- Cria `ciot_operations` (uma linha por TENTATIVA de ciclo CIOT de uma `transport_operations`) e
-- `ciot_events` (trilha append-only de tudo que aconteceu numa tentativa: pré-validação, dispatch,
-- confirmação, retificação, cancelamento, encerramento, rejeição, reconciliação).
--
-- ── Por que existe `ciot_operations` (e não uma coluna em `transport_operations`) ────────────────
-- O número do CIOT NASCE NA RESPOSTA do provedor (nunca no request) — mesma característica do
-- `manHashCode` do MTR que motivou o DL-102. Uma tentativa REJEITADA (ex.: frete abaixo de um piso
-- mínimo do provedor) não pode apagar o histórico nem travar uma nova tentativa: por isso cada
-- `solicitar` cria uma linha NOVA, e `transport_operations.status` permanece `ciot_pending` até uma
-- tentativa terminar em `registered` (`confirm_ciot`, CAS para `ciot_registered`). Rejeição/cancel do
-- CIOT NÃO cancela a operação — são ciclos distintos.
--
-- ── Padrão DL-102 desde o início ────────────────────────────────────────────────────────────────
-- `correlation_marker` (formato `[sicat:<ciotId>]`, único) é gravado na CRIAÇÃO da linha — ANTES de
-- qualquer chamada ao provedor. Se a resposta se perder depois do dispatch, `status` vira
-- `request_unconfirmed` (NUNCA `failed`): "não perguntei" e "perguntei e não existe" são fatos
-- diferentes, e só o reconciliador (`transporte.ciot.reconcile`, via
-- `gateways/ciot-provider-gateway.ts#queryCiotByMarker`) tem autoridade para provar ausência.
--
-- Padrões DL-022 honrados (molde: 024_transport_operations.sql, 027_transport_rntrc_verifications.sql):
-- PK `text` via `createPrefixedId` (`ciot_`/`ciotev_`), `ciot_operations` tem `version` + trigger
-- `increment_version()` (a function já existe desde a migration 004); `ciot_events` é APPEND-ONLY
-- (mesmo desvio deliberado de `rntrc_verifications`/`compliance_evaluations` — sem update/delete,
-- sem version própria); checks idempotentes (`drop constraint if exists` + `add`), `create table/
-- index if not exists`, `correlation_id` obrigatório, tenancy por `integration_account_id`.

-- =============================================================================
-- 1. ciot_operations
-- =============================================================================

create table if not exists ciot_operations (
  id text primary key,
  integration_account_id text not null references integration_accounts (id),
  operation_id text not null references transport_operations (id),
  provider text not null default 'mock',
  status text not null default 'pre_validation',
  ciot_number text,
  correlation_marker text not null,
  request_payload_snapshot jsonb not null default '{}'::jsonb,
  provider_response_snapshot jsonb default '{}'::jsonb,
  rejection_reason_code text,
  external_status text,
  requested_at timestamptz,
  registered_at timestamptz,
  closed_at timestamptz,
  cancelled_at timestamptz,
  job_id text,
  correlation_id text not null,
  command_id text,
  last_error_code text,
  last_error_detail jsonb,
  version integer not null default 1,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table ciot_operations
drop constraint if exists chk_ciotop_status;

alter table ciot_operations
add constraint chk_ciotop_status check (
    status in (
        'pre_validation',
        'requested',
        'request_unconfirmed',
        'registered',
        'rectified',
        'cancelled',
        'closed',
        'rejected',
        'blocked'
    )
);

alter table ciot_operations
drop constraint if exists chk_ciotop_provider;

alter table ciot_operations
add constraint chk_ciotop_provider check (
    provider in ('mock', 'real')
);

-- Identidade remota (número do CIOT) — só existe DEPOIS de o provedor responder; parcial porque a
-- maioria das linhas (pré-validação, rejeitadas, respostas perdidas nunca confirmadas) nunca chega
-- a ter um número.
alter table ciot_operations
drop constraint if exists uq_ciotop_ciot_number;

create unique index if not exists uq_ciotop_ciot_number on ciot_operations (
    ciot_number
)
where
    ciot_number is not null;

-- Marcador de correlação — DL-102: único desde a criação, gravado ANTES de qualquer chamada ao
-- provedor. É a chave que `queryCiotByMarker` usa para perguntar "isto nasceu do outro lado?".
alter table ciot_operations
drop constraint if exists uq_ciotop_correlation_marker;

alter table ciot_operations
add constraint uq_ciotop_correlation_marker unique (correlation_marker);

create index if not exists idx_ciotop_operation on ciot_operations (
    operation_id, created_at desc
);

create index if not exists idx_ciotop_account_status on ciot_operations (
    integration_account_id, status
);

create index if not exists idx_ciotop_correlation_marker on ciot_operations (
    correlation_marker
);

drop trigger if exists trg_ciot_operations_version on ciot_operations;

create trigger trg_ciot_operations_version
  before update on ciot_operations
  for each row
  when (old.* is distinct from new.*)
  execute function increment_version();

-- =============================================================================
-- 2. ciot_events — trilha APPEND-ONLY (mesmo racional de rntrc_verifications/
-- compliance_evaluations: nenhuma linha é apagada ou reescrita; cada evento é uma linha nova).
-- =============================================================================

create table if not exists ciot_events (
  id text primary key,
  ciot_operation_id text not null references ciot_operations (id) on delete cascade,
  event_type text not null,
  detail jsonb not null default '{}'::jsonb,
  correlation_id text not null,
  created_at timestamptz not null default now()
);

alter table ciot_events
drop constraint if exists chk_ciotev_event_type;

alter table ciot_events
add constraint chk_ciotev_event_type check (
    event_type in (
        'pre_validated',
        'request_dispatched',
        'request_confirmed',
        'request_unconfirmed',
        'registered',
        'rectify_requested',
        'rectified',
        'cancel_requested',
        'cancelled',
        'close_requested',
        'closed',
        'rejected',
        'blocked',
        'reconciled'
    )
);

create index if not exists idx_ciotev_operation_created on ciot_events (
    ciot_operation_id, created_at
);

-- Migration 029: Transporte — Vale-Pedágio Obrigatório (VPO), PR-D1 do programa "SICAT Transporte"
-- (Lei 10.209/2001 + Res. ANTT 6.024/2023, DL-103).
--
-- ── VPO NÃO é checkbox universal ───────────────────────────────────────────────────────────────
-- Ao contrário do CIOT (obrigatório para toda operação remunerada), o VPO só é devido quando a
-- rota tem pedágio esperado E a operação é lotação (Res. 6.024/2023) — carga fracionada/múltiplos
-- embarcadores caem em exceções que exigem análise. `VpoApplicabilityEngine`
-- (`src/lib/transport/vpo-applicability-engine.ts`) decide `applicable: true|false|null`; QUALQUER
-- desfecho `not_applicable` PRECISA de `applicability_reason_code` (constraint abaixo) — a
-- exigência do guia do programa ("até NOT_APPLICABLE deixa evidência") é estrutural, não uma
-- convenção de código.
--
-- ── vpo_providers — cadastro CONFIGURÁVEL (não hardcoded) ────────────────────────────────────────
-- [EXTERNAL DEPENDENCY] P6 do guia: fornecedoras de VPO habilitadas pela ANTT mudam com o tempo
-- (novo credenciamento, descredenciamento). O cadastro é carregado por loader MANUAL
-- (`scripts/load-vpo-providers.js`, molde `load-freight-floor-tables.js`) a partir de
-- `reference-data/vpo/fornecedoras-habilitadas.json` — NUNCA seed de boot, e o loader é ADITIVO
-- (upsert por `name`; desativar uma fornecedora é ato manual do operador, nunca um `delete`).
--
-- ── vpo_allocations — UMA linha por OPERAÇÃO (não por tentativa) ────────────────────────────────
-- Diferente de `ciot_operations` (nova linha a cada `solicitar`): a especificação do PR-D1 descreve
-- `avaliarAplicabilidade`/`registrar-aquisicao` como "cria/atualiza" — um recurso MUTÁVEL por
-- operação (`unique (operation_id)`), no molde de `transport_operations` em si. O histórico
-- completo (avaliação, dispatch, confirmação, resposta perdida, reconciliação, evidência anexada)
-- vive em `vpo_events` (APPEND-ONLY), nunca reescrito.
--
-- ── Padrão DL-102 aplicado à aquisição via provedor (decisão do PR-D1) ───────────────────────────
-- A especificação do PR-D1 pede explicitamente a MESMA topologia do CIOT (DL-102) para
-- `POST .../vpo/adquirir`: identidade remota (referência do provedor) nasce na RESPOSTA, nunca no
-- request. Por isso o enum de `status` é estendido além do conjunto mínimo (`pending/applicable/
-- not_applicable/acquired/cancelled`) com dois estados de trânsito — `acquisition_requested`
-- (dispatch já aconteceu, resposta ainda não confirmada) e `acquisition_unconfirmed`
-- (DL-102: resposta perdida DEPOIS do dispatch — NUNCA confundido com falha definitiva). Réplica
-- DELIBERADA dos princípios de `ciot_operations`/DL-102, NÃO reuso — bounded context próprio,
-- helpers podem ser compartilhados (`lib/transport/vpo-correlation.ts`), módulos nunca acoplados.
--
-- ── VPO_amount SEMPRE separado do frete ──────────────────────────────────────────────────────────
-- `transport_operations.vpo_amount` (migration 024) já é um campo DECOMPOSTO, nunca somado a
-- `freight_offered_amount`/`freight_contracted_amount`. Esta migration não adiciona coluna nova em
-- `transport_operations` — só popula `vpo_amount` via `updateOperationById` (CAS por `version`),
-- exatamente como `calcular-piso` já faz para `freight_floor_amount` (PR-B1).
--
-- Padrões DL-022 honrados (molde: 024_transport_operations.sql, 027_transport_rntrc_verifications.sql,
-- 028_transport_ciot.sql): PK `text` via `createPrefixedId` (`vpoprov_`/`vpoalloc_`/`vpoev_`),
-- `vpo_providers`/`vpo_allocations` têm `version` + trigger `increment_version()` (function já
-- existe desde a migration 004); `vpo_events` é APPEND-ONLY (mesmo desvio deliberado de
-- `ciot_events`/`rntrc_verifications` — sem update/delete, sem version própria); constraints
-- idempotentes (`drop constraint if exists` + `add`), `create table/index if not exists`,
-- `correlation_id` obrigatório em `vpo_allocations`/`vpo_events`.

-- =============================================================================
-- 1. vpo_providers — cadastro de referência (sem tenancy: fornecedoras são nacionais/ANTT)
-- =============================================================================

create table if not exists vpo_providers (
  id text primary key,
  name text not null,
  is_active boolean not null default true,
  habilitation_source text,
  habilitation_checked_at date,
  notes text not null default '',
  version integer not null default 1,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table vpo_providers
drop constraint if exists uq_vpoprov_name;

alter table vpo_providers
add constraint uq_vpoprov_name unique (name);

create index if not exists idx_vpoprov_is_active on vpo_providers (is_active);

drop trigger if exists trg_vpo_providers_version on vpo_providers;

create trigger trg_vpo_providers_version
  before update on vpo_providers
  for each row
  when (old.* is distinct from new.*)
  execute function increment_version();

-- =============================================================================
-- 2. vpo_allocations — recurso MUTÁVEL, uma linha por transport_operations
-- =============================================================================

create table if not exists vpo_allocations (
  id text primary key,
  integration_account_id text not null references integration_accounts (id),
  operation_id text not null references transport_operations (id),
  status text not null default 'pending',
  applicable boolean,
  applicability_reason_code text,
  provider_id text references vpo_providers (id),
  provider_reference text,
  amount numeric(18, 2),
  acquired_at timestamptz,
  evidence jsonb not null default '{}'::jsonb,
  evidence_source text,
  route_snapshot jsonb not null default '{}'::jsonb,
  -- Referência do VPO no MDF-e (TR-VPO-004, GATE_FISCAL) — coluna já nasce aqui para a Fase E não
  -- precisar de ALTER TABLE; permanece null até o vínculo CIOT/MDF-e existir.
  mdfe_reference text,
  job_id text,
  correlation_id text not null,
  command_id text,
  last_error_code text,
  last_error_detail jsonb,
  version integer not null default 1,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table vpo_allocations
drop constraint if exists chk_vpoalloc_status;

alter table vpo_allocations
add constraint chk_vpoalloc_status check (
    status in (
        'pending',
        'applicable',
        'not_applicable',
        'acquisition_requested',
        'acquisition_unconfirmed',
        'acquired',
        'cancelled'
    )
);

-- A exigência de ouro do PR-D1: até um NOT_APPLICABLE precisa de justificativa evidenciada.
alter table vpo_allocations
drop constraint if exists chk_vpoalloc_not_applicable_reason;

alter table vpo_allocations
add constraint chk_vpoalloc_not_applicable_reason check (
    status <> 'not_applicable' or applicability_reason_code is not null
);

alter table vpo_allocations
drop constraint if exists chk_vpoalloc_evidence_source;

alter table vpo_allocations
add constraint chk_vpoalloc_evidence_source check (
    evidence_source is null or evidence_source in ('manual', 'provider', 'mock')
);

alter table vpo_allocations
drop constraint if exists chk_vpoalloc_amount_nonneg;

alter table vpo_allocations
add constraint chk_vpoalloc_amount_nonneg check (
    amount is null or amount >= 0
);

-- Recurso MUTÁVEL: no máximo UMA alocação de VPO por operação (ao contrário de `ciot_operations`,
-- que nasce uma linha nova por tentativa) — ver header desta migration.
alter table vpo_allocations
drop constraint if exists uq_vpoalloc_operation;

alter table vpo_allocations
add constraint uq_vpoalloc_operation unique (operation_id);

create index if not exists idx_vpoalloc_account_status on vpo_allocations (
    integration_account_id, status
);

drop trigger if exists trg_vpo_allocations_version on vpo_allocations;

create trigger trg_vpo_allocations_version
  before update on vpo_allocations
  for each row
  when (old.* is distinct from new.*)
  execute function increment_version();

-- =============================================================================
-- 3. vpo_events — trilha APPEND-ONLY (mesmo racional de ciot_events/rntrc_verifications)
-- =============================================================================

create table if not exists vpo_events (
  id text primary key,
  vpo_allocation_id text not null references vpo_allocations (id) on delete cascade,
  event_type text not null,
  detail jsonb not null default '{}'::jsonb,
  correlation_id text not null,
  created_at timestamptz not null default now()
);

alter table vpo_events
drop constraint if exists chk_vpoev_event_type;

alter table vpo_events
add constraint chk_vpoev_event_type check (
    event_type in (
        'applicability_evaluated',
        'acquisition_requested',
        -- DL-102 aplicado ao VPO (decisão do PR-D1) — resposta perdida DEPOIS do dispatch nunca é
        -- `acquisition_failed`; `reconciled` é o desfecho (found/not-found) da varredura periódica.
        'acquisition_unconfirmed',
        'reconciled',
        'acquired',
        'acquisition_failed',
        'cancelled',
        'evidence_attached'
    )
);

create index if not exists idx_vpoev_allocation_created on vpo_events (
    vpo_allocation_id, created_at
);

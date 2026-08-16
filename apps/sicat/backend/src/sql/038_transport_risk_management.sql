-- Migration 038: Transporte — Gerenciamento de Riscos operacional (PR I5 do plano "Módulo
-- Transportadora", REQ-SICAT-0036).
--
-- O PGR (migration 031) registra o plano como DOCUMENTO arquivado. O circuito real (doc Irmãos
-- PADILHA, item 4) exige duas coisas OPERACIONAIS que as seguradoras condicionam às apólices de
-- roubo: (a) PESQUISA CADASTRAL de motorista e veículo em empresas especializadas, com validade; e
-- (b) RASTREAMENTO do caminhão conforme a mercadoria. Sem isso a apólice fica em risco — e o SICAT
-- não tinha onde guardar nem uma coisa nem outra.
--
-- Três mudanças:
--   1. risk_screenings              — APPEND-ONLY, uma linha por TENTATIVA de pesquisa (motorista OU
--                                     veículo), com marcador de correlação (DL-102) e a validade do
--                                     resultado. Mesmo racional de `rntrc_verifications`: consulta é
--                                     evidência datada, nunca se reescreve.
--   2. risk_tracking_confirmations  — confirmação de rastreamento por operação (uma ATIVA por vez).
--   3. risk_management_plans.tracking_matrix — matriz DECLARATIVA (por valor da carga) que diz
--      QUANDO o rastreamento é exigido. Mora no PGR porque a exigência é da seguradora/plano, não da
--      viagem: `{"thresholds":[{"minDeclaredValue":100000,"required":true}]}`.
--
-- LGPD: o resultado da pesquisa guarda o VEREDITO e a validade — nunca antecedentes detalhados
-- (mesma postura de `insurance-verification-provider.ts`, que exclui condições comerciais).
--
-- E o domínio `GR` entra no catálogo regulatório (`chk_regrule_domain`), para as regras TR-GR-001/002.
--
-- Padrões DL-022 honrados (molde 031/036/037): PK `text` via `createPrefixedId`
-- (`riskscr_`/`trkconf_`), `version` + trigger `increment_version()` só onde a linha MUDA de estado
-- (confirmação de rastreamento), constraints idempotentes, tenancy por `integration_account_id`.

-- =============================================================================
-- 1. risk_screenings — APPEND-ONLY (uma linha por tentativa)
-- =============================================================================

create table if not exists risk_screenings (
  id text primary key,
  integration_account_id text not null references integration_accounts (id),
  subject_type text not null,
  driver_id text references transport_drivers (id),
  vehicle_id text references transport_vehicles (id),
  provider text not null default 'sandbox',
  correlation_marker text not null,
  status text not null default 'requesting',
  outcome text,
  result jsonb not null default '{}'::jsonb,
  valid_until date,
  requested_by text,
  correlation_id text not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table risk_screenings
drop constraint if exists chk_riskscr_subject_type;

alter table risk_screenings
add constraint chk_riskscr_subject_type check (subject_type in ('driver', 'vehicle'));

-- Exatamente UM alvo preenchido, coerente com `subject_type`: uma pesquisa é de motorista OU de
-- veículo — nunca das duas coisas, nunca de nenhuma.
alter table risk_screenings
drop constraint if exists chk_riskscr_subject_target;

alter table risk_screenings
add constraint chk_riskscr_subject_target check (
    (subject_type = 'driver' and driver_id is not null and vehicle_id is null)
    or (subject_type = 'vehicle' and vehicle_id is not null and driver_id is null)
);

alter table risk_screenings
drop constraint if exists chk_riskscr_status;

alter table risk_screenings
add constraint chk_riskscr_status check (
    status in ('requesting', 'completed', 'request_unconfirmed', 'failed')
);

alter table risk_screenings
drop constraint if exists chk_riskscr_outcome;

alter table risk_screenings
add constraint chk_riskscr_outcome check (
    outcome is null or outcome in ('approved', 'rejected', 'inconclusive')
);

create unique index if not exists uq_riskscr_correlation_marker on risk_screenings (correlation_marker);

-- Consulta do gate TR-GR-001: a pesquisa VÁLIDA mais recente de um alvo.
create index if not exists idx_riskscr_driver_valid on risk_screenings (driver_id, valid_until desc)
where driver_id is not null;

create index if not exists idx_riskscr_vehicle_valid on risk_screenings (vehicle_id, valid_until desc)
where vehicle_id is not null;

-- Varredura de reconciliação (request_unconfirmed dentro da janela).
create index if not exists idx_riskscr_status_updated on risk_screenings (status, updated_at);

create index if not exists idx_riskscr_account_created on risk_screenings (
    integration_account_id, created_at desc
);

-- =============================================================================
-- 2. risk_tracking_confirmations — evidência de rastreamento por operação
-- =============================================================================

create table if not exists risk_tracking_confirmations (
  id text primary key,
  integration_account_id text not null references integration_accounts (id),
  operation_id text not null references transport_operations (id),
  vehicle_id text references transport_vehicles (id),
  tracker_provider text,
  status text not null default 'confirmed',
  evidence jsonb not null default '{}'::jsonb,
  correlation_id text not null,
  version integer not null default 1,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table risk_tracking_confirmations
drop constraint if exists chk_trkconf_status;

alter table risk_tracking_confirmations
add constraint chk_trkconf_status check (status in ('confirmed', 'revoked'));

-- No máximo UMA confirmação ativa por operação (revogar libera para uma nova).
create unique index if not exists uq_trkconf_operation_active on risk_tracking_confirmations (operation_id)
where status = 'confirmed';

create index if not exists idx_trkconf_operation_created on risk_tracking_confirmations (
    operation_id, created_at desc
);

drop trigger if exists trg_risk_tracking_confirmations_version on risk_tracking_confirmations;

create trigger trg_risk_tracking_confirmations_version
  before update on risk_tracking_confirmations
  for each row
  when (old.* is distinct from new.*)
  execute function increment_version();

-- =============================================================================
-- 3. Matriz de rastreamento no PGR + domínio GR no catálogo regulatório
-- =============================================================================

alter table risk_management_plans
add column if not exists tracking_matrix jsonb not null default '{}'::jsonb;

alter table regulatory_rules
drop constraint if exists chk_regrule_domain;

alter table regulatory_rules
add constraint chk_regrule_domain check (
    domain in (
        'RNTRC',
        'PMF',
        'CIOT',
        'PAY',
        'VPO',
        'NFE',
        'CTE',
        'MDFE',
        'SEG',
        'PGR',
        'GR',
        'COMP'
    )
);

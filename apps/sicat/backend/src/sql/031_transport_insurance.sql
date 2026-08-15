-- Migration 031: Transporte — seguros obrigatórios do transportador e PGR (PR-F2 do programa
-- "SICAT Transporte", DL-103, Lei 14.599/2023).
--
-- Bounded context TRANSPORTE, separado do ambiental. Cria as três tabelas da Fase F:
--   1. insurance_policies       — apólices declaradas do transportador (RCTR-C/RC-DC/RC-V).
--   2. risk_management_plans    — PGR (Plano de Gerenciamento de Riscos), vinculado por lei ao
--                                  RCTR-C/RC-DC (Lei 14.599/2023).
--   3. insurance_verifications  — trilha APPEND-ONLY de cada TENTATIVA de verificação (mesmo
--                                  racional de `rntrc_verifications`, migration 027).
--
-- ── insurance_policies — VIGÊNCIA NA DATA DA OPERAÇÃO, não "cadastrada" ──────────────────────────
-- `status` é ADMINISTRATIVO (o operador pode marcar `cancelled`/`expired_marked` cedo, ex.: aviso da
-- seguradora) — a expiração REAL por vigência é sempre derivada de `valid_from`/`valid_until` contra
-- uma data de referência (nunca contra "hoje" sozinho: `rule-evaluators.ts#evaluateSeg00x` compara
-- com `ctx.referenceDate`, a data da OPERAÇÃO, não a data em que o gate roda). Isso espelha a mesma
-- distinção que `rntrc_verifications` trouxe para RNTRC (guia do programa, pendência P4): um registro
-- "ativo" não é prova de vigência HOJE nem na data que importa.
--
-- ── risk_management_plans — vínculo legal com RCTR-C/RC-DC ───────────────────────────────────────
-- `related_policy_types` é declarativo (jsonb, default `["RCTR_C","RC_DC"]`) — TR-PGR-001
-- (`rule-evaluators.ts`) só EXIGE o PGR quando a operação carrega uma dessas duas apólices vigentes;
-- RC-V isolado não aciona a exigência (Lei 14.599/2023 vincula PGR a RCTR-C/RC-DC, não a RC-V).
--
-- ── insurance_verifications — trilha de EVIDÊNCIA, não substitui a apólice ───────────────────────
-- Cada tentativa de verificação (`manual`, `provider`, `antt`, `mock`) grava uma linha nova — nunca
-- reescreve uma anterior. `requested_status` nasce `succeeded` no fluxo síncrono desta fase (`manual`
-- e `mock`, os dois únicos implementados agora); `pending`/`failed` ficam reservados para quando um
-- provedor real assíncrono existir ([EXTERNAL DEPENDENCY] P8 do guia do programa — cronograma ANTT de
-- verificação automática de seguros existe, mas exige credenciamento). `policy_id` é opcional
-- (`provider`/`antt` podem verificar um documento que ainda não virou `insurance_policies` local).
--
-- Padrões DL-022 honrados (molde: 023_transport_parties_vehicles.sql, 027_rntrc_verifications.sql):
-- PK `text` via `createPrefixedId` (`inspol_`/`pgr_`/`insver_`), `insurance_policies`/
-- `risk_management_plans` têm `version` + trigger `increment_version()` (function já existe desde a
-- migration 004, NÃO recriar aqui); `insurance_verifications` é append-only (sem `version`, sem
-- update). Constraints idempotentes (`drop constraint if exists` + `add`), `create table/index if
-- not exists`, `correlation_id` obrigatório, tenancy por `integration_account_id` em TODA tabela.

-- =============================================================================
-- 1. insurance_policies
-- =============================================================================

create table if not exists insurance_policies (
  id text primary key,
  integration_account_id text not null references integration_accounts (id),
  party_id text not null references transport_parties (id),
  policy_type text not null,
  insurer_name text not null,
  insurer_document text,
  policy_number text not null,
  coverage_amount numeric(18, 2),
  valid_from date not null,
  valid_until date not null,
  status text not null default 'active',
  evidence jsonb not null default '{}'::jsonb,
  evidence_source text not null default 'manual',
  correlation_id text not null,
  version integer not null default 1,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table insurance_policies
drop constraint if exists chk_inspol_policy_type;

alter table insurance_policies
add constraint chk_inspol_policy_type check (
    policy_type in ('RCTR_C', 'RC_DC', 'RC_V')
);

alter table insurance_policies
drop constraint if exists chk_inspol_status;

alter table insurance_policies
add constraint chk_inspol_status check (
    status in ('active', 'cancelled', 'expired_marked')
);

alter table insurance_policies
drop constraint if exists chk_inspol_evidence_source;

alter table insurance_policies
add constraint chk_inspol_evidence_source check (
    evidence_source in ('manual', 'provider', 'antt', 'mock')
);

alter table insurance_policies
drop constraint if exists chk_inspol_valid_period;

alter table insurance_policies
add constraint chk_inspol_valid_period check (
    valid_until >= valid_from
);

-- Chave natural: mesma apólice (tipo + número) não se repete para o mesmo transportador na mesma conta.
alter table insurance_policies
drop constraint if exists uq_inspol_account_party_type_number;

alter table insurance_policies
add constraint uq_inspol_account_party_type_number unique (
    integration_account_id, party_id, policy_type, policy_number
);

drop trigger if exists trg_insurance_policies_version on insurance_policies;

create trigger trg_insurance_policies_version
  before update on insurance_policies
  for each row
  when (old.* is distinct from new.*)
  execute function increment_version();

-- Índice principal do motor de compliance: "a apólice mais recente deste tipo para este transportador,
-- pela vigência" — `findLatestPolicyForPartyAndType` (repo) apoia-se nele.
create index if not exists idx_inspol_party_type_valid_until on insurance_policies (
    party_id, policy_type, valid_until desc
);

create index if not exists idx_inspol_account_valid_until on insurance_policies (
    integration_account_id, valid_until
);

-- =============================================================================
-- 2. risk_management_plans (PGR)
-- =============================================================================

create table if not exists risk_management_plans (
  id text primary key,
  integration_account_id text not null references integration_accounts (id),
  party_id text not null references transport_parties (id),
  plan_reference text not null,
  version_label text not null default '',
  valid_from date not null,
  valid_until date,
  status text not null default 'active',
  evidence jsonb not null default '{}'::jsonb,
  evidence_source text not null default 'manual',
  related_policy_types jsonb not null default '["RCTR_C","RC_DC"]'::jsonb,
  correlation_id text not null,
  version integer not null default 1,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table risk_management_plans
drop constraint if exists chk_pgr_status;

alter table risk_management_plans
add constraint chk_pgr_status check (
    status in ('active', 'superseded', 'cancelled')
);

alter table risk_management_plans
drop constraint if exists chk_pgr_evidence_source;

alter table risk_management_plans
add constraint chk_pgr_evidence_source check (
    evidence_source in ('manual', 'mock')
);

alter table risk_management_plans
drop constraint if exists chk_pgr_valid_period;

alter table risk_management_plans
add constraint chk_pgr_valid_period check (
    valid_until is null
    or valid_until >= valid_from
);

alter table risk_management_plans
drop constraint if exists uq_pgr_account_party_reference;

alter table risk_management_plans
add constraint uq_pgr_account_party_reference unique (
    integration_account_id, party_id, plan_reference
);

drop trigger if exists trg_risk_management_plans_version on risk_management_plans;

create trigger trg_risk_management_plans_version
  before update on risk_management_plans
  for each row
  when (old.* is distinct from new.*)
  execute function increment_version();

create index if not exists idx_pgr_party_valid_until on risk_management_plans (
    party_id, valid_until desc
);

create index if not exists idx_pgr_account_status on risk_management_plans (
    integration_account_id, status
);

-- =============================================================================
-- 3. insurance_verifications — APPEND-ONLY (mesmo racional de `rntrc_verifications`)
-- =============================================================================

create table if not exists insurance_verifications (
  id text primary key,
  integration_account_id text not null references integration_accounts (id),
  party_id text not null references transport_parties (id),
  policy_id text references insurance_policies (id),
  strategy text not null,
  requested_status text not null default 'succeeded',
  result jsonb not null default '{}'::jsonb,
  verified_by text,
  verified_at timestamptz not null default now(),
  correlation_id text not null,
  created_at timestamptz not null default now()
);

alter table insurance_verifications
drop constraint if exists chk_insver_strategy;

alter table insurance_verifications
add constraint chk_insver_strategy check (
    strategy in ('manual', 'provider', 'antt', 'mock')
);

alter table insurance_verifications
drop constraint if exists chk_insver_requested_status;

alter table insurance_verifications
add constraint chk_insver_requested_status check (
    requested_status in ('pending', 'succeeded', 'failed')
);

create index if not exists idx_insver_party_created on insurance_verifications (
    party_id, created_at desc
);

create index if not exists idx_insver_account_created on insurance_verifications (
    integration_account_id, created_at desc
);

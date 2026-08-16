-- Migration 035: Transporte — condições comerciais mínimas do seguro (PR-I2 do Módulo
-- Transportadora, REQ-SICAT-0028 rev.2 + REQ-SICAT-0034).
--
-- Duas mudanças, ambas no bounded context TRANSPORTE (molde: 031_transport_insurance.sql):
--   1. `insurance_policies` ganha o LIMITE DE GARANTIA POR VIAGEM (`per_trip_limit_amount`) e as
--      condições associadas (`limit_conditions`) — é o dado que TR-SEG-004 confronta com a soma dos
--      `declared_value` da carga no GATE_PRE_BOARDING.
--   2. `insurance_rate_schedules` — taxas de averbação VERSIONADAS POR VIGÊNCIA por apólice.
--
-- ── per_trip_limit_amount — limite POR VIAGEM, não cobertura total ───────────────────────────────
-- `coverage_amount` (migration 031) é a importância segurada TOTAL da apólice; o circuito real
-- (doc Irmãos PADILHA) trabalha com um teto POR VIAGEM: a soma dos valores declarados da carga de
-- UMA operação não pode ultrapassá-lo, senão a carga viaja parcialmente descoberta. Nullable por
-- desenho: apólice sem limite configurado gera AVISO no gate (PER_TRIP_LIMIT_NOT_CONFIGURED),
-- nunca bloqueio — acceptance de REQ-SICAT-0028 rev.2.
--
-- ── limit_conditions — objeto MÍNIMO, nunca as condições comerciais completas ────────────────────
-- LGPD/escopo do REQ-SICAT-0028: JAMAIS armazenar franquia, cláusulas ou prêmio negociado. O jsonb
-- guarda só anotações curtas sobre COMO o limite se aplica (o service sanitiza para escalares
-- curtos — `sanitizeLimitConditions` em `transport-insurance-service.ts`).
--
-- ── insurance_rate_schedules — taxa % versionada por vigência, com escopo de percurso ────────────
-- As taxas nascem aqui (REQ-SICAT-0028/PR-I2) mas servem a AVERBAÇÃO (REQ-SICAT-0034/PR-I3): cada
-- viagem averbada paga `valor_da_carga × rate_percent%` (ex. real do circuito: 0,072% RCTR-C +
-- 0,025% RC-DC = 0,097% → R$ 24,25 numa carga de R$ 25.000). `rate_percent` grava o PERCENTUAL
-- literal (0,072% grava 0.072000) — a conversão para fração fica no motor puro
-- (`insurance-premium-engine.ts`), nunca no banco. `route_scope` cobre o RCV por percurso
-- (ex. 'SP-PR'); NULL = taxa default da apólice. `monthly_minimum_amount` é o custo mínimo mensal
-- que a apuração (PR-I4) usa em `max(transportado × taxa, mínimo)`.
--
-- Versionamento: criar taxa nova com a MESMA chave lógica (policy_id + route_scope) marca a
-- anterior `superseded` (service, numa transação) — o histórico fica íntegro para reproduzir
-- prêmios/apurações de datas passadas; a seleção da taxa aplicável é sempre por VIGÊNCIA
-- (`selectApplicableRate`, motor puro), nunca por status `active` sozinho.
--
-- Padrões DL-022 honrados (molde: 031_transport_insurance.sql): PK `text` via `createPrefixedId`
-- (`insrate_`), `version` + trigger `increment_version()` (function existe desde a migration 004,
-- NÃO recriar aqui), constraints idempotentes (`drop constraint if exists` + `add`),
-- `create table/index if not exists`, `correlation_id` obrigatório, tenancy por
-- `integration_account_id`.

-- =============================================================================
-- 1. insurance_policies — limite de garantia por viagem
-- =============================================================================

alter table insurance_policies
add column if not exists per_trip_limit_amount numeric(18, 2);

alter table insurance_policies
add column if not exists limit_conditions jsonb not null default '{}'::jsonb;

alter table insurance_policies
drop constraint if exists chk_inspol_per_trip_limit;

alter table insurance_policies
add constraint chk_inspol_per_trip_limit check (
    per_trip_limit_amount is null
    or per_trip_limit_amount >= 0
);

-- =============================================================================
-- 2. insurance_rate_schedules — taxas de averbação versionadas por vigência
-- =============================================================================

create table if not exists insurance_rate_schedules (
  id text primary key,
  integration_account_id text not null references integration_accounts (id),
  policy_id text not null references insurance_policies (id),
  rate_percent numeric(9, 6) not null,
  route_scope text,
  monthly_minimum_amount numeric(18, 2) not null default 0,
  valid_from date not null,
  valid_until date,
  status text not null default 'active',
  evidence jsonb not null default '{}'::jsonb,
  correlation_id text not null,
  version integer not null default 1,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table insurance_rate_schedules
drop constraint if exists chk_insrate_rate_percent;

-- Taxa zero não existe no circuito (averbação sem custo = apólice sem taxa cadastrada) — o check
-- fecha o caminho do "0.000000 silencioso" que renderia prêmio R$ 0,00 sem ninguém perceber.
alter table insurance_rate_schedules
add constraint chk_insrate_rate_percent check (
    rate_percent > 0
);

alter table insurance_rate_schedules
drop constraint if exists chk_insrate_monthly_minimum;

alter table insurance_rate_schedules
add constraint chk_insrate_monthly_minimum check (
    monthly_minimum_amount >= 0
);

alter table insurance_rate_schedules
drop constraint if exists chk_insrate_status;

alter table insurance_rate_schedules
add constraint chk_insrate_status check (
    status in ('active', 'superseded', 'cancelled')
);

drop trigger if exists trg_insurance_rate_schedules_version on insurance_rate_schedules;

create trigger trg_insurance_rate_schedules_version
  before update on insurance_rate_schedules
  for each row
  when (old.* is distinct from new.*)
  execute function increment_version();

-- Chave natural do versionamento: uma vigência (`valid_from`) por chave lógica (apólice +
-- percurso). Índice ÚNICO EM EXPRESSÃO (não constraint) porque `route_scope` é nullable e NULLs
-- não colidem em unique comum — `coalesce(route_scope, '')` faz o default da apólice ('' interno)
-- disputar a mesma chave que qualquer percurso nomeado disputa entre si.
create unique index if not exists uq_insrate_policy_scope_valid_from on insurance_rate_schedules (
    policy_id, (coalesce(route_scope, '')), valid_from
);

-- Índice de leitura do motor de seleção/averbação: "as taxas desta apólice, da vigência mais
-- recente para trás" — `listRateSchedulesForPolicy` (repo) apoia-se nele.
create index if not exists idx_insrate_policy_valid_from on insurance_rate_schedules (
    policy_id, valid_from desc
);

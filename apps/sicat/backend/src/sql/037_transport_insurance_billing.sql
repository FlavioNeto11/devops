-- Migration 037: Transporte — apuração mensal do prêmio de averbação (PR I4 do plano
-- "Módulo Transportadora", REQ-SICAT-0035).
--
-- O circuito comercial do TRC (doc Irmãos PADILHA) fecha o mês assim: a seguradora soma o que foi
-- transportado, aplica a taxa da apólice e compara com o CUSTO MÍNIMO MENSAL — cobra o MAIOR dos
-- dois (ex.: mínimo R$ 700 para RCTR-C/RC-DC, R$ 300 para RC-V). A transportadora precisa ver essa
-- conta ANTES da fatura chegar; sem isto o SICAT registra a averbação (migration 036) mas não sabe
-- dizer quanto o mês vai custar.
--
-- Duas tabelas:
--   1. insurance_billing_periods — UM período por (apólice × mês), com o snapshot do extrato. É o
--      agregado consultável: total declarado, soma dos prêmios, mínimo vigente no fechamento,
--      `billed_amount` = greatest(prêmios, mínimo) e a BASE que venceu (`premium` | `minimum`).
--   2. insurance_billing_runs — APPEND-ONLY, uma linha por recálculo (sweep/manual/recompute), com
--      as entradas e o resultado. Mesmo racional de `compliance_evaluations`/`insurance_verifications`:
--      a conta do mês precisa ser REPRODUZÍVEL — quem perguntar "por que deu isso em agosto?" tem a
--      trilha, não uma reconstrução a posteriori.
--
-- Por que o extrato mora em `statement jsonb` e não numa tabela de itens: o extrato é um SNAPSHOT
-- do que entrou na conta naquele fechamento (declaração, operação, valor, taxa, prêmio). Uma tabela
-- de itens obrigaria a re-sincronizar linhas a cada recálculo de período aberto — e o que importa
-- é o retrato, não a normalização. As declarações continuam sendo a fonte viva (036).
--
-- Padrões DL-022 honrados (molde 035/036): PK `text` via `createPrefixedId` (`insbill_`/`insbrun_`),
-- `version` + trigger `increment_version()` (function existe desde a 004, NÃO recriar), constraints
-- idempotentes (`drop constraint if exists` + `add`), `create table/index if not exists`,
-- `correlation_id` obrigatório, tenancy por `integration_account_id`.

-- =============================================================================
-- 1. insurance_billing_periods
-- =============================================================================

create table if not exists insurance_billing_periods (
  id text primary key,
  integration_account_id text not null references integration_accounts (id),
  policy_id text not null references insurance_policies (id),
  period_month date not null,
  declared_total_amount numeric(18, 2) not null default 0,
  premium_total_amount numeric(18, 2) not null default 0,
  minimum_amount numeric(18, 2) not null default 0,
  billed_amount numeric(18, 2) not null default 0,
  billing_basis text not null default 'minimum',
  status text not null default 'open',
  statement jsonb not null default '{}'::jsonb,
  closed_at timestamptz,
  correlation_id text not null,
  version integer not null default 1,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- `period_month` é sempre o DIA 1 do mês (a API expõe `YYYY-MM`). Guardar o dia 1 — e não um par
-- (ano, mês) — permite comparar/ordenar por data e casar com o `date_trunc('month', ...)` das
-- consultas sem conversão.
alter table insurance_billing_periods
drop constraint if exists chk_insbill_period_month_first_day;

alter table insurance_billing_periods
add constraint chk_insbill_period_month_first_day check (
    extract(day from period_month) = 1
);

alter table insurance_billing_periods
drop constraint if exists chk_insbill_billing_basis;

alter table insurance_billing_periods
add constraint chk_insbill_billing_basis check (billing_basis in ('premium', 'minimum'));

alter table insurance_billing_periods
drop constraint if exists chk_insbill_status;

alter table insurance_billing_periods
add constraint chk_insbill_status check (status in ('open', 'closed'));

alter table insurance_billing_periods
drop constraint if exists chk_insbill_amounts_non_negative;

alter table insurance_billing_periods
add constraint chk_insbill_amounts_non_negative check (
    declared_total_amount >= 0
    and premium_total_amount >= 0
    and minimum_amount >= 0
    and billed_amount >= 0
);

-- Um período por apólice/mês: é a chave natural da cobrança. O recálculo faz UPDATE nesta linha
-- (quando aberta), nunca insere uma segunda.
create unique index if not exists uq_insbill_policy_period on insurance_billing_periods (
    policy_id, period_month
);

-- Consulta da tela (`GET /v1/transporte/seguros/apuracao?period=YYYY-MM`).
create index if not exists idx_insbill_account_period on insurance_billing_periods (
    integration_account_id, period_month desc
);

-- Sweep mensal: varre os períodos ainda abertos para fechar.
create index if not exists idx_insbill_status_period on insurance_billing_periods (
    status, period_month
);

drop trigger if exists trg_insurance_billing_periods_version on insurance_billing_periods;

create trigger trg_insurance_billing_periods_version
  before update on insurance_billing_periods
  for each row
  when (old.* is distinct from new.*)
  execute function increment_version();

-- =============================================================================
-- 2. insurance_billing_runs — APPEND-ONLY (reprodutibilidade do cálculo)
-- =============================================================================

create table if not exists insurance_billing_runs (
  id text primary key,
  billing_period_id text not null references insurance_billing_periods (id),
  trigger text not null,
  inputs jsonb not null default '{}'::jsonb,
  result jsonb not null default '{}'::jsonb,
  correlation_id text not null,
  created_at timestamptz not null default now()
);

alter table insurance_billing_runs
drop constraint if exists chk_insbrun_trigger;

alter table insurance_billing_runs
add constraint chk_insbrun_trigger check (trigger in ('sweep', 'manual', 'recompute'));

create index if not exists idx_insbrun_period_created on insurance_billing_runs (
    billing_period_id, created_at desc
);

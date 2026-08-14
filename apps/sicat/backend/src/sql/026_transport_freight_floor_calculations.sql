-- Migration 026: Transporte — cálculos do piso mínimo de frete (PR-B1 do programa "SICAT
-- Transporte", DL-103).
--
-- Cria `freight_floor_calculations`: UM registro por tentativa de cálculo do `FreightFloorEngine`
-- (`lib/transport/freight-floor-engine.ts`) sobre UMA operação, numa data de referência — o
-- snapshot reprodutível que alimenta TR-PMF-002/003/004 (`rule-evaluators.ts`, via
-- `ctx.floorCalculation`) e atualiza `transport_operations.freight_floor_amount` quando
-- `outcome = 'calculated'`.
--
-- Base normativa: Lei 13.703/2018 (Política Nacional de Pisos Mínimos) + Res. ANTT 5.867/2020
-- (metodologia original) + Res. ANTT 6.076/2026 (altera a metodologia, 19/01/2026) + Res. ANTT
-- 6.084/2026 (atualiza as tabelas de coeficientes, vigência 17/07/2026) — as duas últimas entram
-- em `regulatory_sources` neste mesmo PR (seed aditivo, `regulatory-rules-seed.ts`).
--
-- ⚠️ DESVIO DELIBERADO em relação ao padrão DL-022 (mesmo racional da migration 025,
-- `compliance_evaluations`): `freight_floor_calculations` é **APPEND-ONLY** — SEM coluna
-- `version`, SEM trigger `increment_version()`, e o código da aplicação
-- (`freight-floor-repo.ts`) NUNCA emite `update`/`delete` contra ela. Recalcular o piso da mesma
-- operação (nova oferta, nova tabela revisada, `referenceDate` diferente) é sempre uma LINHA NOVA
-- — a mesma garantia de reprodutibilidade/auditoria (NFR-0009/0010) que sustenta
-- `compliance_evaluations`: a decisão de compliance de ontem tem que continuar reconstituível
-- exatamente como aconteceu, mesmo depois de um recálculo hoje.
--
-- ⚠️ MODO SHADOW (regra de ouro do PR-B1): esta tabela e o motor que a alimenta NÃO tornam
-- TR-PMF-002/003 bloqueantes — o seed continua 100% `blocking=false` (migration 021) e o clamp de
-- enforcement (`applyEnforcementClamp`) segue rebaixando qualquer `block` bruto para `warn`. O
-- cálculo é real e persistido; a ENFORÇABILIDADE fica para uma fase futura, após revisão jurídica
-- das tabelas (pendência P3 do guia — `freight_floor_versions` carregadas por
-- `npm run load:freight-floor` nascem SEMPRE `review_status = 'pending_review'`).
--
-- `cargo_type`/`axles_count`/`distance_km` são NOT NULL por desenho: são o SNAPSHOT dos insumos
-- efetivamente lidos da operação no momento do cálculo (mesmo quando o resultado é
-- `not_applicable`/`missing_inputs`/`missing_coefficients` — nesses casos o serviço grava o melhor
-- valor disponível, com `''`/`0` como sentinela de "não disponível"; o PORQUÊ de cada sentinela
-- fica em `calculation_inputs_snapshot`/`calculation_trace`, nunca inferido da ausência de dado).
--
-- Padrões DL-022 honrados no que NÃO é o desvio acima: PK `text` via `createPrefixedId`
-- (`ffcalc_`), `created_at` timestamptz default now(), `correlation_id` em toda tabela de topo,
-- tenancy por `integration_account_id`, constraints idempotentes (`drop constraint if exists` +
-- `add`), `create table/index if not exists`.

create table if not exists freight_floor_calculations (
  id text primary key,
  integration_account_id text not null references integration_accounts (id),
  operation_id text not null references transport_operations (id),
  floor_version_id text references freight_floor_versions (id),
  rule_version_id text references regulatory_rule_versions (id),
  reference_date date not null,
  cargo_type text not null,
  axles_count integer not null,
  distance_km numeric(10, 2) not null,
  displacement_coefficient numeric(18, 6),
  load_unload_coefficient numeric(18, 6),
  minimum_amount numeric(18, 2),
  offered_amount numeric(18, 2),
  contracted_amount numeric(18, 2),
  compliant boolean,
  outcome text not null,
  calculation_inputs_snapshot jsonb not null default '{}'::jsonb,
  calculation_trace jsonb not null default '{}'::jsonb,
  engine_version text not null,
  correlation_id text not null,
  created_at timestamptz not null default now()
);

alter table freight_floor_calculations
drop constraint if exists chk_ffcalc_outcome;

alter table freight_floor_calculations
add constraint chk_ffcalc_outcome check (
    outcome in ('calculated', 'not_applicable', 'missing_coefficients', 'missing_inputs')
);

alter table freight_floor_calculations
drop constraint if exists chk_ffcalc_axles_count_nonneg;

alter table freight_floor_calculations
add constraint chk_ffcalc_axles_count_nonneg check (axles_count >= 0);

alter table freight_floor_calculations
drop constraint if exists chk_ffcalc_distance_km_nonneg;

alter table freight_floor_calculations
add constraint chk_ffcalc_distance_km_nonneg check (distance_km >= 0);

alter table freight_floor_calculations
drop constraint if exists chk_ffcalc_coefficients_positive;

alter table freight_floor_calculations
add constraint chk_ffcalc_coefficients_positive check (
    (displacement_coefficient is null or displacement_coefficient > 0)
    and (load_unload_coefficient is null or load_unload_coefficient > 0)
);

alter table freight_floor_calculations
drop constraint if exists chk_ffcalc_amounts_nonneg;

alter table freight_floor_calculations
add constraint chk_ffcalc_amounts_nonneg check (
    (minimum_amount is null or minimum_amount >= 0)
    and (offered_amount is null or offered_amount >= 0)
    and (contracted_amount is null or contracted_amount >= 0)
);

create index if not exists idx_ffcalc_operation_created on freight_floor_calculations (
    operation_id, created_at desc
);

create index if not exists idx_ffcalc_account_created on freight_floor_calculations (
    integration_account_id, created_at desc
);

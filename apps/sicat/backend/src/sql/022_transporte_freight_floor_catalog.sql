-- Migration 022: Transporte — estrutura das tabelas de piso mínimo de frete (PR-A1).
--
-- Cria APENAS a estrutura versionada do piso (Lei 13.703/2018 + Res. ANTT 5.867/2020):
--   1. freight_floor_versions     — versões normativas das tabelas A/B/C/D, com vigência.
--   2. freight_floor_coefficients — coeficientes por (carga, eixos, tipo), amarrados à versão.
--
-- ⚠️ NENHUM coeficiente é semeado nesta migration (nem em seed de boot). Coeficiente real
-- só entra no catálogo depois de validação jurídica humana das tabelas vigentes — pendência
-- P3 do guia (`apps/sicat/docs/30-transporte/transporte-guia.md`), que bloqueia a Fase B.
-- O relatório-base é explícito: coeficiente JAMAIS hardcoded (regra #6 da tabela de adoção).
--
-- Padrões DL-022 honrados (molde: 013_dmr_declarations.sql):
-- - PK `text`, `version` int + trigger `increment_version()` na tabela-cabeçalho
--   (a function já existe desde a migration 004 — não recriar).
-- - constraints idempotentes (`drop constraint if exists` + `add`), `create table/index if not exists`.
-- - `freight_floor_coefficients` é imutável por desenho (só `created_at`, sem update em produção):
--   correção de coeficiente = NOVA `freight_floor_version`, nunca edição in-place.

-- =============================================================================
-- 1. freight_floor_versions
-- =============================================================================

create table if not exists freight_floor_versions (
  id text primary key,
  normative_reference text not null,
  resolution text,
  table_code text not null,
  published_at date,
  effective_from date not null,
  effective_until date,
  methodology_notes text not null default '',
  source_url text,
  source_hash text,
  review_status text not null default 'pending_review',
  reviewed_by text,
  reviewed_at timestamptz,
  version integer not null default 1,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- Chave natural: uma versão por (referência normativa, tabela).
create unique index if not exists uq_ffv_reference_table
on freight_floor_versions (normative_reference, table_code);

alter table freight_floor_versions
drop constraint if exists chk_ffv_table_code;

alter table freight_floor_versions
add constraint chk_ffv_table_code check (
    table_code in ('A', 'B', 'C', 'D')
);

alter table freight_floor_versions
drop constraint if exists chk_ffv_review_status;

alter table freight_floor_versions
add constraint chk_ffv_review_status check (
    review_status in ('pending_review', 'reviewed', 'rejected')
);

alter table freight_floor_versions
drop constraint if exists chk_ffv_effective_period;

alter table freight_floor_versions
add constraint chk_ffv_effective_period check (
    effective_until is null
    or effective_until >= effective_from
);

drop trigger if exists trg_freight_floor_versions_version on freight_floor_versions;

create trigger trg_freight_floor_versions_version
  before update on freight_floor_versions
  for each row
  when (old.* is distinct from new.*)
  execute function increment_version();

create index if not exists idx_ffv_table_effective
on freight_floor_versions (table_code, effective_from desc);

-- =============================================================================
-- 2. freight_floor_coefficients
-- =============================================================================

create table if not exists freight_floor_coefficients (
  id text primary key,
  floor_version_id text not null references freight_floor_versions (id) on delete cascade,
  cargo_type text not null,
  axles_count integer not null,
  coefficient_type text not null,
  value numeric(18, 6) not null,
  created_at timestamptz not null default now()
);

create unique index if not exists uq_ffc_version_cargo_axles_type
on freight_floor_coefficients (floor_version_id, cargo_type, axles_count, coefficient_type);

alter table freight_floor_coefficients
drop constraint if exists chk_ffc_axles_count;

alter table freight_floor_coefficients
add constraint chk_ffc_axles_count check (
    axles_count >= 1
    and axles_count <= 12
);

alter table freight_floor_coefficients
drop constraint if exists chk_ffc_coefficient_type;

alter table freight_floor_coefficients
add constraint chk_ffc_coefficient_type check (
    coefficient_type in ('displacement_cost', 'load_unload_cost')
);

alter table freight_floor_coefficients
drop constraint if exists chk_ffc_value_positive;

alter table freight_floor_coefficients
add constraint chk_ffc_value_positive check (value > 0);

create index if not exists idx_ffc_floor_version
on freight_floor_coefficients (floor_version_id);

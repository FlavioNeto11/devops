-- Migration 021: Transporte — catálogo regulatório temporal (PR-A1 do programa "SICAT Transporte").
--
-- Bounded context TRANSPORTE, separado do ambiental (DL-103: MTR ambiental ≠ MDF-e; nada aqui
-- referencia `manifests` nem as entidades CETESB). Cria as três tabelas do catálogo:
--   1. regulatory_sources       — fontes normativas (leis, resoluções ANTT, vetos, NTs).
--   2. regulatory_rules         — regras TR-* (identidade estável, sem vigência).
--   3. regulatory_rule_versions — versões com vigência temporal (a regra "viva" em cada data).
--
-- Padrões DL-022 honrados (molde: 013_dmr_declarations.sql):
-- - PK `text`, `version` int para locking otimista + trigger `increment_version()`
--   (a function já existe desde a migration 004 — NÃO recriar aqui).
-- - constraints idempotentes (`drop constraint if exists` + `add`), `create table/index if not exists`.
-- - `created_at`/`updated_at` timestamptz default now().
--
-- Regra de ouro do programa (guia §Status da baseline): nenhuma regra nasce bloqueante.
-- A trava vive em DDL: `chk_regrulev_blocking_reviewed` impede `ACTIVE + blocking=true`
-- sem `reviewed_by`/`reviewed_at` — a promoção a bloqueante exige revisão humana.
--
-- Anti-sobreposição temporal: exclusion constraint por GiST (btree_gist) garante no banco que
-- duas versões da MESMA regra jamais têm vigências que se cruzam — a resolução temporal
-- (`resolveRuleVersionAt`) devolve no máximo UMA versão para qualquer data.

-- Necessária para o operador `=` em coluna text dentro de `exclude using gist`.
create extension if not exists btree_gist;

-- =============================================================================
-- 1. regulatory_sources
-- =============================================================================

create table if not exists regulatory_sources (
  id text primary key,
  source_type text not null,
  reference text not null,
  title text not null default '',
  issuer text not null default 'OTHER',
  published_at date,
  effective_from date,
  effective_until date,
  source_url text,
  source_hash text,
  monitoring_status text not null default 'monitored',
  review_status text not null default 'pending_review',
  reviewed_by text,
  reviewed_at timestamptz,
  notes jsonb not null default '{}'::jsonb,
  version integer not null default 1,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- Chave natural (identidade do upsert do seed — jamais a PK, que é randômica).
create unique index if not exists uq_regsrc_reference on regulatory_sources (reference);

alter table regulatory_sources
drop constraint if exists chk_regsrc_source_type;

alter table regulatory_sources
add constraint chk_regsrc_source_type check (
    source_type in (
        'law',
        'decree',
        'antt_resolution',
        'antt_portaria',
        'sinief_adjustment',
        'technical_note',
        'veto',
        'other'
    )
);

alter table regulatory_sources
drop constraint if exists chk_regsrc_issuer;

alter table regulatory_sources
add constraint chk_regsrc_issuer check (
    issuer in (
        'CONGRESSO',
        'PRESIDENCIA',
        'ANTT',
        'CONFAZ',
        'SEFAZ',
        'SUSEP',
        'CNSP',
        'OTHER'
    )
);

alter table regulatory_sources
drop constraint if exists chk_regsrc_monitoring_status;

alter table regulatory_sources
add constraint chk_regsrc_monitoring_status check (
    monitoring_status in ('monitored', 'stable', 'superseded', 'revoked')
);

alter table regulatory_sources
drop constraint if exists chk_regsrc_review_status;

alter table regulatory_sources
add constraint chk_regsrc_review_status check (
    review_status in ('pending_review', 'under_review', 'reviewed')
);

alter table regulatory_sources
drop constraint if exists chk_regsrc_effective_period;

alter table regulatory_sources
add constraint chk_regsrc_effective_period check (
    effective_from is null
    or effective_until is null
    or effective_until >= effective_from
);

drop trigger if exists trg_regulatory_sources_version on regulatory_sources;

create trigger trg_regulatory_sources_version
  before update on regulatory_sources
  for each row
  when (old.* is distinct from new.*)
  execute function increment_version();

create index if not exists idx_regsrc_source_type on regulatory_sources (source_type);

create index if not exists idx_regsrc_review_status on regulatory_sources (review_status);

-- =============================================================================
-- 2. regulatory_rules
-- =============================================================================

create table if not exists regulatory_rules (
  id text primary key,
  code text not null,
  domain text not null,
  title text not null default '',
  description text not null default '',
  default_gate text not null,
  display_order integer not null default 0,
  version integer not null default 1,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- Chave natural (código TR-*).
create unique index if not exists uq_regrule_code on regulatory_rules (code);

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
        'COMP'
    )
);

alter table regulatory_rules
drop constraint if exists chk_regrule_default_gate;

alter table regulatory_rules
add constraint chk_regrule_default_gate check (
    default_gate in (
        'GATE_PROPOSAL',
        'GATE_CONTRACT',
        'GATE_CIOT',
        'GATE_FISCAL',
        'GATE_PRE_BOARDING',
        'GATE_RELEASE',
        'GATE_IN_TRANSIT',
        'GATE_COMPLETION'
    )
);

drop trigger if exists trg_regulatory_rules_version on regulatory_rules;

create trigger trg_regulatory_rules_version
  before update on regulatory_rules
  for each row
  when (old.* is distinct from new.*)
  execute function increment_version();

create index if not exists idx_regrule_domain on regulatory_rules (domain);

create index if not exists idx_regrule_default_gate on regulatory_rules (default_gate);

-- =============================================================================
-- 3. regulatory_rule_versions
-- =============================================================================

create table if not exists regulatory_rule_versions (
  id text primary key,
  rule_id text not null references regulatory_rules (id),
  version_label text not null,
  legal_basis jsonb not null default '[]'::jsonb,
  summary text not null default '',
  effective_from date not null,
  effective_until date,
  implementation_state text not null default 'DRAFT',
  blocking boolean not null default false,
  severity text not null default 'warning',
  applicability jsonb not null default '{}'::jsonb,
  reason_codes jsonb not null default '[]'::jsonb,
  source_hash text,
  reviewed_by text,
  reviewed_at timestamptz,
  version integer not null default 1,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- Chave natural (identidade do upsert do seed).
create unique index if not exists uq_regrulev_rule_version
on regulatory_rule_versions (rule_id, version_label);

alter table regulatory_rule_versions
drop constraint if exists chk_regrulev_implementation_state;

alter table regulatory_rule_versions
add constraint chk_regrulev_implementation_state check (
    implementation_state in (
        'DRAFT',
        'UNDER_REVIEW',
        'ACTIVE',
        'FUTURE',
        'SUPERSEDED',
        'REVOKED',
        'AWAITING_REGULATION'
    )
);

alter table regulatory_rule_versions
drop constraint if exists chk_regrulev_severity;

alter table regulatory_rule_versions
add constraint chk_regrulev_severity check (
    severity in ('info', 'warning', 'critical')
);

alter table regulatory_rule_versions
drop constraint if exists chk_regrulev_effective_period;

alter table regulatory_rule_versions
add constraint chk_regrulev_effective_period check (
    effective_until is null
    or effective_until >= effective_from
);

-- ⚠️ Check CRÍTICO da regra de ouro: versão ACTIVE só pode ser bloqueante com revisão
-- humana registrada (reviewed_by + reviewed_at). O seed nunca preenche esses campos —
-- eles pertencem ao operador.
alter table regulatory_rule_versions
drop constraint if exists chk_regrulev_blocking_reviewed;

alter table regulatory_rule_versions
add constraint chk_regrulev_blocking_reviewed check (
    not (blocking and implementation_state = 'ACTIVE')
    or (reviewed_by is not null and reviewed_at is not null)
);

-- Anti-sobreposição temporal: duas versões da mesma regra não podem ter vigências que se
-- cruzam. `effective_until` nulo = vigência aberta (modelada como 9999-12-31, inclusiva).
alter table regulatory_rule_versions
drop constraint if exists excl_regrulev_no_temporal_overlap;

alter table regulatory_rule_versions
add constraint excl_regrulev_no_temporal_overlap exclude using gist (
    rule_id with =,
    daterange(
        effective_from,
        coalesce(effective_until, date '9999-12-31'),
        '[]'
    ) with &&
);

drop trigger if exists trg_regulatory_rule_versions_version on regulatory_rule_versions;

create trigger trg_regulatory_rule_versions_version
  before update on regulatory_rule_versions
  for each row
  when (old.* is distinct from new.*)
  execute function increment_version();

create index if not exists idx_regrulev_rule_effective
on regulatory_rule_versions (rule_id, effective_from desc);

create index if not exists idx_regrulev_implementation_state
on regulatory_rule_versions (implementation_state);

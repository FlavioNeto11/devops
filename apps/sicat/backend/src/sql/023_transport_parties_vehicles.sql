-- Migration 023: Transporte — cadastro-base de transportadores e veículos (PR-A3 do programa
-- "SICAT Transporte", DL-103).
--
-- Bounded context TRANSPORTE, separado do ambiental (nada aqui referencia `manifests`/CETESB).
-- Cria as quatro tabelas do cadastro-base:
--   1. transport_parties        — transportadores/partes (pessoa jurídica ou física), com o
--                                  estado RNTRC DECLARADO (rntrc_*) — SEM verificação externa.
--                                  A verificação real via ANTT é Fase C (rotas /regularidade e
--                                  /verificar NÃO nascem neste PR).
--   2. transport_party_roles    — papéis que a parte exerce (contratante, embarcador, etc.).
--   3. transport_vehicles       — veículos do cadastro-base.
--   4. transport_vehicle_links  — vínculo veículo↔parte (propriedade, locação, agregação, frota
--                                  RNTRC declarada).
--
-- Padrões DL-022 honrados (molde: 013_dmr_declarations.sql, 021_transporte_regulatory_catalog.sql):
-- - PK `text`, `version` int para locking otimista + trigger `increment_version()` nas DUAS
--   tabelas-cabeçalho (parties/vehicles) — a function já existe desde a migration 004, NÃO
--   recriar aqui. As tabelas de vínculo (`party_roles`/`vehicle_links`) não têm version própria:
--   mutação nelas é sempre insert/delete, nunca update in-place.
-- - constraints idempotentes (`drop constraint if exists` + `add`), `create table/index if not
--   exists`.
-- - `created_at`/`updated_at` timestamptz default now().
--
-- Tenancy: toda tabela carrega `integration_account_id` (FK para `integration_accounts`, já
-- existente desde a migration 001) — é a chave de isolamento que os repositórios da camada
-- TypeScript (`transport-party-repo.ts`/`transport-vehicle-repo.ts`) usam em TODA query.

-- =============================================================================
-- 1. transport_parties
-- =============================================================================

create table if not exists transport_parties (
  id text primary key,
  integration_account_id text not null references integration_accounts (id),
  document_type text not null,
  document_number text not null,
  legal_name text not null,
  trade_name text,
  rntrc_number text,
  rntrc_category text,
  rntrc_status text not null default 'unknown',
  rntrc_verified_at timestamptz,
  rntrc_verification_source text not null default 'manual',
  municipality text,
  uf text,
  is_active boolean not null default true,
  metadata jsonb not null default '{}'::jsonb,
  correlation_id text not null,
  version integer not null default 1,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table transport_parties
drop constraint if exists chk_trparty_document_type;

alter table transport_parties
add constraint chk_trparty_document_type check (
    document_type in ('CNPJ', 'CPF')
);

alter table transport_parties
drop constraint if exists chk_trparty_rntrc_category;

alter table transport_parties
add constraint chk_trparty_rntrc_category check (
    rntrc_category is null
    or rntrc_category in ('TAC', 'ETC', 'CTC')
);

alter table transport_parties
drop constraint if exists chk_trparty_rntrc_status;

alter table transport_parties
add constraint chk_trparty_rntrc_status check (
    rntrc_status in ('unknown', 'active', 'suspended', 'cancelled', 'expired')
);

alter table transport_parties
drop constraint if exists chk_trparty_rntrc_verification_source;

alter table transport_parties
add constraint chk_trparty_rntrc_verification_source check (
    rntrc_verification_source in ('manual', 'open_data', 'antt')
);

alter table transport_parties
drop constraint if exists chk_trparty_uf;

alter table transport_parties
add constraint chk_trparty_uf check (
    uf is null
    or uf ~ '^[A-Z]{2}$'
);

-- Chave natural de tenancy: mesmo documento não se repete duas vezes na MESMA conta.
alter table transport_parties
drop constraint if exists uq_trparty_account_document;

alter table transport_parties
add constraint uq_trparty_account_document unique (
    integration_account_id, document_type, document_number
);

-- RNTRC é opcional (parte pode ainda não ter cadastro RNTRC), mas quando presente não se repete
-- na mesma conta.
create unique index if not exists uq_trparty_account_rntrc on transport_parties (
    integration_account_id, rntrc_number
)
where
    rntrc_number is not null;

drop trigger if exists trg_transport_parties_version on transport_parties;

create trigger trg_transport_parties_version
  before update on transport_parties
  for each row
  when (old.* is distinct from new.*)
  execute function increment_version();

create index if not exists idx_trparty_account_name on transport_parties (
    integration_account_id, legal_name
);

create index if not exists idx_trparty_account_rntrc_status on transport_parties (
    integration_account_id, rntrc_status
);

-- =============================================================================
-- 2. transport_party_roles
-- =============================================================================

create table if not exists transport_party_roles (
  id text primary key,
  party_id text not null references transport_parties (id) on delete cascade,
  role text not null,
  created_at timestamptz not null default now()
);

alter table transport_party_roles
drop constraint if exists chk_trprole_role;

alter table transport_party_roles
add constraint chk_trprole_role check (
    role in (
        'contractor',
        'shipper',
        'carrier',
        'subcontractor',
        'consignee',
        'driver'
    )
);

alter table transport_party_roles
drop constraint if exists uq_trprole_party_role;

alter table transport_party_roles
add constraint uq_trprole_party_role unique (party_id, role);

-- =============================================================================
-- 3. transport_vehicles
-- =============================================================================

create table if not exists transport_vehicles (
  id text primary key,
  integration_account_id text not null references integration_accounts (id),
  plate text not null,
  renavam text,
  vehicle_type text not null,
  axles_count integer,
  cargo_body_type text,
  owner_party_id text references transport_parties (id),
  is_active boolean not null default true,
  metadata jsonb not null default '{}'::jsonb,
  correlation_id text not null,
  version integer not null default 1,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table transport_vehicles
drop constraint if exists chk_trveh_vehicle_type;

alter table transport_vehicles
add constraint chk_trveh_vehicle_type check (
    vehicle_type in ('tractor', 'truck', 'semi_trailer', 'trailer', 'other')
);

alter table transport_vehicles
drop constraint if exists chk_trveh_axles_count;

alter table transport_vehicles
add constraint chk_trveh_axles_count check (
    axles_count is null
    or (axles_count between 1 and 12)
);

alter table transport_vehicles
drop constraint if exists uq_trveh_account_plate;

alter table transport_vehicles
add constraint uq_trveh_account_plate unique (integration_account_id, plate);

drop trigger if exists trg_transport_vehicles_version on transport_vehicles;

create trigger trg_transport_vehicles_version
  before update on transport_vehicles
  for each row
  when (old.* is distinct from new.*)
  execute function increment_version();

create index if not exists idx_trveh_account_type on transport_vehicles (
    integration_account_id, vehicle_type
);

-- =============================================================================
-- 4. transport_vehicle_links
-- =============================================================================

create table if not exists transport_vehicle_links (
  id text primary key,
  vehicle_id text not null references transport_vehicles (id) on delete cascade,
  party_id text not null references transport_parties (id) on delete cascade,
  link_type text not null,
  valid_from date,
  valid_until date,
  source text not null default 'manual',
  evidence_ref text,
  created_at timestamptz not null default now()
);

alter table transport_vehicle_links
drop constraint if exists chk_trvlink_link_type;

alter table transport_vehicle_links
add constraint chk_trvlink_link_type check (
    link_type in ('owned', 'leased', 'aggregated', 'rntrc_fleet')
);

alter table transport_vehicle_links
drop constraint if exists chk_trvlink_valid_period;

alter table transport_vehicle_links
add constraint chk_trvlink_valid_period check (
    valid_until is null
    or valid_from is null
    or valid_until >= valid_from
);

alter table transport_vehicle_links
drop constraint if exists uq_trvlink_vehicle_party_type;

alter table transport_vehicle_links
add constraint uq_trvlink_vehicle_party_type unique (vehicle_id, party_id, link_type);

create index if not exists idx_trvlink_party on transport_vehicle_links (party_id);

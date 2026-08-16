-- Migration 034: Transporte — motoristas (CNH) e vínculo motorista↔transportador (PR I1 do plano
-- "Módulo Transportadora", REQ-SICAT-0033).
--
-- Bounded context TRANSPORTE, separado do ambiental (nada aqui referencia `manifests`/CETESB).
-- O papel `driver` existe em `transport_party_roles` desde a migration 023, mas nunca virou
-- ENTIDADE: não havia onde guardar CNH (número/categoria/validade) — que é exatamente o que a
-- pesquisa cadastral de GR das seguradoras exige (doc Irmãos PADILHA). Cria as duas tabelas:
--   1. transport_drivers              — extensão 1:1 de uma parte PF com papel driver (CNH
--                                        DECLARADA pelo operador — sem verificação externa
--                                        DETRAN/SENATRAN nesta fase).
--   2. transport_driver_carrier_links — vínculo do motorista com o transportador (frota própria
--                                        × agregado), com vigência. A tipologia TAC/ETC do
--                                        transportador NÃO mora aqui: é DERIVADA da frota ativa
--                                        (`transport_vehicle_links` owned+leased) em
--                                        `lib/transport/carrier-typology.ts` — banco guarda fatos,
--                                        não a classificação.
--
-- Padrões DL-022 honrados (molde: 023_transport_parties_vehicles.sql, 031_transport_insurance.sql):
-- - PK `text` via `createPrefixedId` (`trdrv_`/`trdrvlink_`), `version` int para locking otimista +
--   trigger `increment_version()` nas DUAS tabelas — a function já existe desde a migration 004,
--   NÃO recriar aqui. Diferente dos vínculos de veículo (023), o vínculo motorista↔transportador
--   TEM `version`: encerrar o vínculo é um UPDATE de vigência (valid_until/status), não um
--   insert/delete.
-- - constraints idempotentes (`drop constraint if exists` + `add`), `create table/index if not
--   exists`.
-- - `created_at`/`updated_at` timestamptz default now(), `correlation_id` obrigatório.
--
-- Tenancy: as duas tabelas carregam `integration_account_id` (FK para `integration_accounts`) — a
-- chave de isolamento que `transport-driver-repo.ts` usa em TODA query.

-- =============================================================================
-- 1. transport_drivers
-- =============================================================================

create table if not exists transport_drivers (
  id text primary key,
  integration_account_id text not null references integration_accounts (id),
  party_id text not null references transport_parties (id) on delete cascade,
  cnh_number text not null,
  cnh_category text not null,
  cnh_valid_until date not null,
  cnh_uf text,
  status text not null default 'active',
  evidence jsonb not null default '{}'::jsonb,
  evidence_source text not null default 'manual',
  correlation_id text not null,
  version integer not null default 1,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table transport_drivers
drop constraint if exists chk_trdrv_cnh_category;

alter table transport_drivers
add constraint chk_trdrv_cnh_category check (
    cnh_category in ('A', 'B', 'C', 'D', 'E', 'AB', 'AC', 'AD', 'AE')
);

alter table transport_drivers
drop constraint if exists chk_trdrv_cnh_uf;

alter table transport_drivers
add constraint chk_trdrv_cnh_uf check (
    cnh_uf is null
    or cnh_uf ~ '^[A-Z]{2}$'
);

alter table transport_drivers
drop constraint if exists chk_trdrv_status;

alter table transport_drivers
add constraint chk_trdrv_status check (
    status in ('active', 'inactive')
);

alter table transport_drivers
drop constraint if exists chk_trdrv_evidence_source;

alter table transport_drivers
add constraint chk_trdrv_evidence_source check (
    evidence_source in ('manual', 'mock')
);

-- 1:1 com a parte: um motorista É uma parte PF estendida — duas fichas de CNH para a mesma pessoa
-- seriam duas verdades concorrentes (a checagem "parte é PF com papel driver" é do service, que
-- ADICIONA o papel quando falta — regra de negócio, não de schema).
alter table transport_drivers
drop constraint if exists uq_trdrv_party;

alter table transport_drivers
add constraint uq_trdrv_party unique (party_id);

drop trigger if exists trg_transport_drivers_version on transport_drivers;

create trigger trg_transport_drivers_version
  before update on transport_drivers
  for each row
  when (old.* is distinct from new.*)
  execute function increment_version();

create index if not exists idx_trdrv_account_status on transport_drivers (
    integration_account_id, status
);

-- Varredura de CNHs a vencer (alertas/GR nas fases seguintes) sem filtrar por conta primeiro.
create index if not exists idx_trdrv_cnh_valid_until on transport_drivers (cnh_valid_until);

-- =============================================================================
-- 2. transport_driver_carrier_links
-- =============================================================================

create table if not exists transport_driver_carrier_links (
  id text primary key,
  integration_account_id text not null references integration_accounts (id),
  driver_id text not null references transport_drivers (id) on delete cascade,
  carrier_party_id text not null references transport_parties (id) on delete cascade,
  link_type text not null,
  valid_from date not null,
  valid_until date,
  status text not null default 'active',
  correlation_id text not null,
  version integer not null default 1,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table transport_driver_carrier_links
drop constraint if exists chk_trdrvlink_link_type;

-- `fleet` = motorista da frota própria do transportador; `aggregated` = agregado (terceiro que
-- opera para o transportador) — os dois regimes do circuito TRC (doc Irmãos PADILHA).
alter table transport_driver_carrier_links
add constraint chk_trdrvlink_link_type check (
    link_type in ('fleet', 'aggregated')
);

alter table transport_driver_carrier_links
drop constraint if exists chk_trdrvlink_status;

alter table transport_driver_carrier_links
add constraint chk_trdrvlink_status check (
    status in ('active', 'ended')
);

alter table transport_driver_carrier_links
drop constraint if exists chk_trdrvlink_valid_period;

alter table transport_driver_carrier_links
add constraint chk_trdrvlink_valid_period check (
    valid_until is null
    or valid_until >= valid_from
);

-- Histórico permitido (mesmo par+tipo pode se repetir com vigências distintas); o que não pode é
-- o MESMO início duas vezes. "No máximo UM vínculo VIGENTE por par driver×carrier×tipo" é regra do
-- service (vigência depende da data de referência — não é expressável como unique estático).
alter table transport_driver_carrier_links
drop constraint if exists uq_trdrvlink_driver_carrier_type_from;

alter table transport_driver_carrier_links
add constraint uq_trdrvlink_driver_carrier_type_from unique (
    driver_id, carrier_party_id, link_type, valid_from
);

drop trigger if exists trg_transport_driver_carrier_links_version on transport_driver_carrier_links;

create trigger trg_transport_driver_carrier_links_version
  before update on transport_driver_carrier_links
  for each row
  when (old.* is distinct from new.*)
  execute function increment_version();

-- Parcial: vínculos em aberto (sem data de fim) são a consulta quente do service — a checagem de
-- "já existe vigente?" e a listagem da frota ativa do motorista.
create index if not exists idx_trdrvlink_driver_open on transport_driver_carrier_links (driver_id)
where
    valid_until is null;

create index if not exists idx_trdrvlink_carrier on transport_driver_carrier_links (carrier_party_id);

-- Migration 024: Transporte — agregado central TransportOperation (PR-A4 do programa
-- "SICAT Transporte", DL-103).
--
-- Bounded context TRANSPORTE, separado do ambiental (nada aqui referencia `manifests`/CETESB).
-- Cria o agregado central do ciclo de vida de uma operação de transporte e seus quatro
-- sub-recursos:
--   1. transport_operations        — cabeçalho: status (máquina de estados), frete DECOMPOSTO
--                                     (offered/contracted/floor/toll/vpo/other/total — VPO jamais
--                                     somado ao frete), pagamento, correlação.
--   2. transport_operation_parties — partes vinculadas (contratante/embarcador/transportador/...),
--                                     com `party_snapshot` CONGELADO no momento do vínculo.
--   3. transport_operation_vehicles — veículos vinculados (tração/1º/2º reboque), com
--                                     `vehicle_snapshot` CONGELADO no momento do vínculo.
--   4. transport_operation_cargo   — itens de carga da operação.
--   5. transport_operation_routes  — rota (origem/destino); 1 por operação na Fase A (ver nota).
--
-- Padrões DL-022 honrados (molde: 013_dmr_declarations.sql, 021_transporte_regulatory_catalog.sql,
-- 023_transport_parties_vehicles.sql):
-- - PK `text`, `version` int para locking otimista + trigger `increment_version()` SÓ no
--   cabeçalho (`transport_operations`) — a function já existe desde a migration 004, NÃO recriar
--   aqui. Os quatro sub-recursos não têm `version` própria: mutação neles é sempre insert (a
--   Fase A só cria; não há PATCH de sub-recurso neste PR).
-- - constraints idempotentes (`drop constraint if exists` + `add`), `create table/index if not
--   exists`.
-- - `created_at`/`updated_at` timestamptz default now().
--
-- Máquina de estados: os 13 estados do CHECK `chk_trop_status` espelham 1:1
-- `TRANSPORT_OPERATION_STATUSES` em `src/lib/transport/transport-state-machine.ts` — mudou lá,
-- muda aqui no mesmo PR (e vice-versa). Este PR (PR-A4) só expõe por API as transições SEM gate
-- (`submit_validation`, `cancel`); os GATES (motor de compliance) chegam no PR-A5 — até lá, as
-- transições gated ficam declaradas no grafo TypeScript mas sem rota.
--
-- Tenancy: `transport_operations` carrega `integration_account_id` (FK para `integration_accounts`,
-- já existente desde a migration 001) — é a chave de isolamento que
-- `transport-operation-repo.ts` usa em toda query. Os quatro sub-recursos herdam tenancy via FK
-- `on delete cascade` para `transport_operations` (nenhum tem `integration_account_id` própria,
-- mesmo padrão de `transport_vehicle_links` na migration 023).

-- =============================================================================
-- 1. transport_operations
-- =============================================================================

create table if not exists transport_operations (
  id text primary key,
  integration_account_id text not null references integration_accounts (id),
  session_context_id text references session_contexts (id),
  reference_code text,
  status text not null default 'draft',
  cargo_regime text not null default 'unknown',
  operation_classification text,
  freight_offered_amount numeric(18, 2),
  freight_contracted_amount numeric(18, 2),
  freight_floor_amount numeric(18, 2),
  toll_amount numeric(18, 2),
  vpo_amount numeric(18, 2),
  other_components_amount numeric(18, 2),
  total_contract_value numeric(18, 2),
  currency text not null default 'BRL',
  payment_method text,
  payment_term_days integer,
  blocked_reason_code text,
  cancelled_reason text,
  correlation_id text not null,
  command_id text,
  last_error_code text,
  last_error_detail jsonb,
  version integer not null default 1,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- Os 13 estados da máquina (`transport-state-machine.ts`). Fases C..F (ciot_pending em diante)
-- são alcançáveis apenas por transições declaradas SEM rota neste PR — o CHECK já os aceita para
-- o grafo nascer completo, mesmo que nenhum endpoint os produza ainda.
alter table transport_operations
drop constraint if exists chk_trop_status;

alter table transport_operations
add constraint chk_trop_status check (
    status in (
        'draft',
        'validating',
        'blocked',
        'ready_for_contract',
        'contracted',
        'ciot_pending',
        'ciot_registered',
        'fiscal_pending',
        'ready_for_release',
        'in_transit',
        'completion_pending',
        'completed',
        'cancelled'
    )
);

alter table transport_operations
drop constraint if exists chk_trop_cargo_regime;

alter table transport_operations
add constraint chk_trop_cargo_regime check (
    cargo_regime in ('lotacao', 'fracionada', 'unknown')
);

-- Frete DECOMPOSTO: cada componente é opcional (preenchido conforme a operação avança pelas
-- fases), mas nunca negativo quando presente.
alter table transport_operations
drop constraint if exists chk_trop_amounts_nonneg;

alter table transport_operations
add constraint chk_trop_amounts_nonneg check (
    (freight_offered_amount is null or freight_offered_amount >= 0)
    and (freight_contracted_amount is null or freight_contracted_amount >= 0)
    and (freight_floor_amount is null or freight_floor_amount >= 0)
    and (toll_amount is null or toll_amount >= 0)
    and (vpo_amount is null or vpo_amount >= 0)
    and (other_components_amount is null or other_components_amount >= 0)
    and (total_contract_value is null or total_contract_value >= 0)
);

alter table transport_operations
drop constraint if exists chk_trop_payment_term_days;

alter table transport_operations
add constraint chk_trop_payment_term_days check (
    payment_term_days is null or payment_term_days >= 0
);

-- Trava de consistência: só pode estar `cancelled` com o motivo registrado (o service exige
-- `reason` no corpo de `POST .../cancelar` — 400 `TRANSPORT_CANCEL_REASON_REQUIRED`).
alter table transport_operations
drop constraint if exists chk_trop_cancelled_reason;

alter table transport_operations
add constraint chk_trop_cancelled_reason check (
    status <> 'cancelled' or cancelled_reason is not null
);

-- Chave natural OPCIONAL: quando o operador informa `referenceCode` (nº de pedido/contrato
-- externo), ele não se repete na mesma conta. Parcial porque a maioria das operações nasce sem
-- referência externa ainda. Índice parcial (não constraint de tabela — `alter table add
-- constraint unique` não suporta `where`), mesmo padrão de `uq_trparty_account_rntrc` (023).
create unique index if not exists uq_trop_account_reference on transport_operations (
    integration_account_id, reference_code
)
where
    reference_code is not null;

drop trigger if exists trg_transport_operations_version on transport_operations;

create trigger trg_transport_operations_version
  before update on transport_operations
  for each row
  when (old.* is distinct from new.*)
  execute function increment_version();

create index if not exists idx_trop_account_status on transport_operations (
    integration_account_id, status, created_at desc
);

create index if not exists idx_trop_correlation on transport_operations (correlation_id);

-- =============================================================================
-- 2. transport_operation_parties
-- =============================================================================

create table if not exists transport_operation_parties (
  id text primary key,
  operation_id text not null references transport_operations (id) on delete cascade,
  party_id text not null references transport_parties (id),
  role text not null,
  party_snapshot jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

alter table transport_operation_parties
drop constraint if exists chk_troppart_role;

alter table transport_operation_parties
add constraint chk_troppart_role check (
    role in (
        'contractor',
        'shipper',
        'carrier',
        'subcontractor',
        'consignee',
        'driver'
    )
);

-- A MESMA parte não se vincula duas vezes com o MESMO papel na MESMA operação.
alter table transport_operation_parties
drop constraint if exists uq_troppart_operation_party_role;

alter table transport_operation_parties
add constraint uq_troppart_operation_party_role unique (operation_id, party_id, role);

-- `contractor` e `carrier` são papéis SINGLETON por operação (uma operação tem UM contratante e
-- UM transportador principal) — os demais papéis (shipper/subcontractor/consignee/driver) podem
-- se repetir com partes diferentes. Índice parcial, mesmo motivo do `uq_trop_account_reference`.
create unique index if not exists uq_troppart_operation_singleton_role on transport_operation_parties (
    operation_id, role
)
where
    role in ('contractor', 'carrier');

-- =============================================================================
-- 3. transport_operation_vehicles
-- =============================================================================

create table if not exists transport_operation_vehicles (
  id text primary key,
  operation_id text not null references transport_operations (id) on delete cascade,
  vehicle_id text not null references transport_vehicles (id),
  position text not null default 'traction',
  vehicle_snapshot jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

alter table transport_operation_vehicles
drop constraint if exists chk_tropveh_position;

alter table transport_operation_vehicles
add constraint chk_tropveh_position check (
    position in ('traction', 'towed_1', 'towed_2')
);

-- O MESMO veículo não se vincula duas vezes à MESMA operação (em posições diferentes seria uma
-- composição improvável — cavalo e reboque costumam ser veículos distintos).
alter table transport_operation_vehicles
drop constraint if exists uq_tropveh_operation_vehicle;

alter table transport_operation_vehicles
add constraint uq_tropveh_operation_vehicle unique (operation_id, vehicle_id);

-- Cada posição (tração/1º reboque/2º reboque) é ocupada por NO MÁXIMO um veículo por operação.
alter table transport_operation_vehicles
drop constraint if exists uq_tropveh_operation_position;

alter table transport_operation_vehicles
add constraint uq_tropveh_operation_position unique (operation_id, position);

-- =============================================================================
-- 4. transport_operation_cargo
-- =============================================================================

create table if not exists transport_operation_cargo (
  id text primary key,
  operation_id text not null references transport_operations (id) on delete cascade,
  cargo_type text not null,
  cargo_code text,
  description text not null default '',
  weight_kg numeric(14, 3),
  volume_m3 numeric(14, 3),
  declared_value numeric(18, 2),
  dangerous_goods boolean not null default false,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

alter table transport_operation_cargo
drop constraint if exists chk_tropcargo_weight_positive;

alter table transport_operation_cargo
add constraint chk_tropcargo_weight_positive check (
    weight_kg is null or weight_kg > 0
);

create index if not exists idx_tropcargo_operation on transport_operation_cargo (operation_id);

-- =============================================================================
-- 5. transport_operation_routes
-- =============================================================================

create table if not exists transport_operation_routes (
  id text primary key,
  operation_id text not null references transport_operations (id) on delete cascade,
  origin_municipality text not null,
  origin_uf text not null,
  origin_ibge_code text,
  destination_municipality text not null,
  destination_uf text not null,
  destination_ibge_code text,
  distance_km numeric(10, 2),
  route_source text not null default 'manual',
  toll_expected boolean,
  waypoints jsonb not null default '[]'::jsonb,
  created_at timestamptz not null default now()
);

alter table transport_operation_routes
drop constraint if exists chk_troproute_distance_positive;

alter table transport_operation_routes
add constraint chk_troproute_distance_positive check (
    distance_km is null or distance_km > 0
);

alter table transport_operation_routes
drop constraint if exists chk_troproute_route_source;

alter table transport_operation_routes
add constraint chk_troproute_route_source check (
    route_source in ('manual', 'estimated')
);

-- Mesmo formato de UF do CHECK `chk_trparty_uf` (migration 023) — reaproveitado aqui para a rota
-- não aceitar lixo em `origin_uf`/`destination_uf` mesmo se algum caminho pular a validação da
-- camada TypeScript.
alter table transport_operation_routes
drop constraint if exists chk_troproute_origin_uf;

alter table transport_operation_routes
add constraint chk_troproute_origin_uf check (
    origin_uf ~ '^[A-Z]{2}$'
);

alter table transport_operation_routes
drop constraint if exists chk_troproute_destination_uf;

alter table transport_operation_routes
add constraint chk_troproute_destination_uf check (
    destination_uf ~ '^[A-Z]{2}$'
);

-- 1 rota por operação na Fase A (a operação transporta carga de um ponto A a um ponto B; rotas
-- multi-perna/multi-trecho ficam para uma fase futura — dropar esta UNIQUE quando chegar).
alter table transport_operation_routes
drop constraint if exists uq_troproute_operation;

alter table transport_operation_routes
add constraint uq_troproute_operation unique (operation_id);

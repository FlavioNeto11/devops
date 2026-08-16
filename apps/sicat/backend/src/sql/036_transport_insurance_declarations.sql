-- Migration 036: Transporte — averbação eletrônica por viagem (PR-I3 do Módulo Transportadora,
-- REQ-SICAT-0034).
--
-- Duas tabelas, ambas no bounded context TRANSPORTE (moldes: 031_transport_insurance.sql e
-- 035_transport_insurance_commercial.sql):
--   1. insurance_shipment_declarations — UMA averbação (declaração de embarque) por operação×apólice
--      viva, com o ciclo DL-102 completo (declarar → retificar → cancelar, com estados
--      `*_unconfirmed` para resposta perdida e reconciliação por marcador).
--   2. insurance_declaration_events    — trilha APPEND-ONLY de cada transição do ciclo (mesmo
--      racional de `ciot_events`, migration 028).
--
-- ── declared_cargo_amount — o valor é CONGELADO NO ATO ───────────────────────────────────────────
-- A averbação declara o valor da carga NO MOMENTO em que é feita (circuito real Irmãos PADILHA:
-- prêmio = valor da carga × taxa %). A carga da operação pode mudar DEPOIS — é exatamente essa
-- divergência que TR-SEG-005 aponta como `SHIPMENT_DECLARATION_STALE` (warn pedindo retificação).
-- Por isso a coluna existe aqui e NÃO é derivada de `transport_operation_cargo` na leitura.
--
-- ── provider_declaration_ref nasce NA RESPOSTA (DL-102) ──────────────────────────────────────────
-- Nenhum identificador nosso existe do lado da seguradora antes da resposta — mesmo padrão do
-- `ciot_number` (migration 028). Se a resposta se perder, a única pergunta possível é pelo
-- `correlation_marker`, gravado na CRIAÇÃO da linha, ANTES de qualquer chamada ao gateway
-- (`lib/transport/averbacao-correlation.ts`). Daí o UNIQUE: o marcador é a identidade da
-- declaração no provedor.
--
-- ── Estados do ciclo ─────────────────────────────────────────────────────────────────────────────
--   declaring           → despacho da declaração em curso (job na fila / chamada em trânsito)
--   declared            → seguradora confirmou (provider_declaration_ref preenchido)
--   declare_unconfirmed → resposta do declare se perdeu — só a reconciliação resolve
--   rectifying          → retificação (novo valor de carga congelado NA LINHA) em curso
--   rectify_unconfirmed → resposta do rectify se perdeu
--   cancelling          → cancelamento em curso
--   cancel_unconfirmed  → resposta do cancel se perdeu
--   cancelled           → averbação anulada (estado terminal; libera nova averbação viva)
--   rejected            → seguradora recusou a declaração (terminal; libera nova averbação viva)
-- Não existe estado `rectified`: retificação bem-sucedida VOLTA a `declared` (o evento append-only
-- `rectified` registra o fato; o estado descreve "o que vale agora").
--
-- Padrões DL-022 honrados (molde 031/035): PK `text` via `createPrefixedId` (`insdecl_`/`insdev_`),
-- `version` + trigger `increment_version()` (function existe desde a migration 004, NÃO recriar
-- aqui), constraints idempotentes (`drop constraint if exists` + `add`), `create table/index if
-- not exists`, `correlation_id` obrigatório, tenancy por `integration_account_id`.

-- =============================================================================
-- 1. insurance_shipment_declarations
-- =============================================================================

create table if not exists insurance_shipment_declarations (
  id text primary key,
  integration_account_id text not null references integration_accounts (id),
  operation_id text not null references transport_operations (id),
  policy_id text not null references insurance_policies (id),
  rate_schedule_id text not null references insurance_rate_schedules (id),
  declared_cargo_amount numeric(18, 2) not null,
  applied_rate_percent numeric(9, 6) not null,
  premium_amount numeric(18, 2) not null,
  route_scope text,
  provider_declaration_ref text,
  correlation_marker text not null,
  status text not null default 'declaring',
  last_error_code text,
  correlation_id text not null,
  version integer not null default 1,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table insurance_shipment_declarations
drop constraint if exists chk_insdecl_status;

alter table insurance_shipment_declarations
add constraint chk_insdecl_status check (
    status in (
      'declaring',
      'declared',
      'declare_unconfirmed',
      'rectifying',
      'rectify_unconfirmed',
      'cancelling',
      'cancel_unconfirmed',
      'cancelled',
      'rejected'
    )
);

alter table insurance_shipment_declarations
drop constraint if exists chk_insdecl_declared_cargo_amount;

alter table insurance_shipment_declarations
add constraint chk_insdecl_declared_cargo_amount check (
    declared_cargo_amount >= 0
);

-- Taxa aplicada segue a mesma regra da origem (`chk_insrate_rate_percent`, migration 035): taxa
-- zero não existe no circuito — congelar 0 aqui esconderia um prêmio R$ 0,00 sem ninguém perceber.
alter table insurance_shipment_declarations
drop constraint if exists chk_insdecl_applied_rate_percent;

alter table insurance_shipment_declarations
add constraint chk_insdecl_applied_rate_percent check (
    applied_rate_percent > 0
);

alter table insurance_shipment_declarations
drop constraint if exists chk_insdecl_premium_amount;

alter table insurance_shipment_declarations
add constraint chk_insdecl_premium_amount check (
    premium_amount >= 0
);

-- O marcador é a identidade da declaração no provedor (DL-102) — dois registros com o mesmo
-- marcador tornariam a reconciliação ambígua por construção.
alter table insurance_shipment_declarations
drop constraint if exists uq_insdecl_correlation_marker;

alter table insurance_shipment_declarations
add constraint uq_insdecl_correlation_marker unique (correlation_marker);

drop trigger if exists trg_insurance_shipment_declarations_version on insurance_shipment_declarations;

create trigger trg_insurance_shipment_declarations_version
  before update on insurance_shipment_declarations
  for each row
  when (old.* is distinct from new.*)
  execute function increment_version();

-- NO MÁXIMO UMA averbação VIVA por operação×apólice: `cancelled`/`rejected` são os únicos estados
-- que liberam a chave para uma nova declaração (o histórico terminal fica, íntegro). Índice
-- PARCIAL (não constraint) porque a exclusividade só vale para o subconjunto vivo.
create unique index if not exists uq_insdecl_operation_policy_live on insurance_shipment_declarations (
    operation_id, policy_id
)
where status not in ('cancelled', 'rejected');

-- Varredura de reconciliação do worker (`listUnconfirmedDeclarationsForReconciliation`): estados
-- `*_unconfirmed` dentro da janela de atividade — sem este índice a sweep degenera em full scan.
create index if not exists idx_insdecl_status_updated on insurance_shipment_declarations (
    status, updated_at
);

-- Listagem por conta/período (`GET /v1/transporte/seguros/averbacoes`).
create index if not exists idx_insdecl_account_created on insurance_shipment_declarations (
    integration_account_id, created_at desc
);

-- Leitura por operação (card "Seguro da viagem" + contexto de TR-SEG-005 no motor de compliance).
create index if not exists idx_insdecl_operation_created on insurance_shipment_declarations (
    operation_id, created_at desc
);

-- =============================================================================
-- 2. insurance_declaration_events — APPEND-ONLY (mesmo racional de `ciot_events`)
-- =============================================================================

create table if not exists insurance_declaration_events (
  id text primary key,
  declaration_id text not null references insurance_shipment_declarations (id),
  event_type text not null,
  payload jsonb not null default '{}'::jsonb,
  correlation_id text not null,
  created_at timestamptz not null default now()
);

alter table insurance_declaration_events
drop constraint if exists chk_insdev_event_type;

alter table insurance_declaration_events
add constraint chk_insdev_event_type check (
    event_type in (
      'declare_requested',
      'declared',
      'declare_unconfirmed',
      'rectify_requested',
      'rectified',
      'cancel_requested',
      'cancelled',
      'rejected',
      'reconciled'
    )
);

create index if not exists idx_insdev_declaration_created on insurance_declaration_events (
    declaration_id, created_at
);

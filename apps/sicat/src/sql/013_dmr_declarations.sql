-- Migration 013: DMR — Declaração de Movimentação de Resíduos (cadeia `dmr-fluxo-base`).
--
-- Cria as tabelas `dmr_declarations` e `dmr_declaration_items`, alinhadas com
-- docs/04-arquitetura/dmr-sicat.md §3 e com os tipos exportados em
-- src/repositories/dmr-repo.ts.
--
-- Padrões DL-022 honrados:
-- - `version` int para locking otimista.
-- - 5 constraints de consistência específicas do DMR.
-- - índices `create index if not exists`.
-- - migration idempotente (`create table if not exists`, `drop constraint if exists` + add).
--
-- IDs: text para alinhar com integration_accounts.id, manifests.id, etc. (todas
-- as PKs do projeto são textuais — o doc menciona uuid de forma indicativa).

-- =============================================================================
-- 1. dmr_declarations
-- =============================================================================

create table if not exists dmr_declarations (
  id text primary key,
  integration_account_id text not null references integration_accounts(id),
  cnpj text not null default '',
  unit_code text not null default '',
  role text not null,
  period_start date not null,
  period_end date not null,
  period_label text not null,
  status text not null default 'draft',
  correlation_id text not null,
  command_id text,
  session_context_id text references session_contexts(id),
  submitted_at timestamptz,
  protocol_number text,
  remote_reference text,
  summary_totals jsonb not null default '{}'::jsonb,
  payload_snapshot jsonb not null default '{}'::jsonb,
  last_error_code text,
  last_error_detail jsonb,
  attempts integer not null default 0,
  version integer not null default 1,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- Constraints DL-022 (idempotente: drop + add).
alter table dmr_declarations
drop constraint if exists chk_dmr_period_order;

alter table dmr_declarations
add constraint chk_dmr_period_order check (period_end >= period_start);

alter table dmr_declarations
drop constraint if exists chk_dmr_role_allowed;

alter table dmr_declarations
add constraint chk_dmr_role_allowed check (
    role in (
        'gerador',
        'transportador',
        'destinador',
        'armazenador_temporario'
    )
);

alter table dmr_declarations
drop constraint if exists chk_dmr_status_allowed;

alter table dmr_declarations
add constraint chk_dmr_status_allowed check (
    status in (
        'draft',
        'consolidating',
        'pending_review',
        'enqueued',
        'submitting',
        'awaiting_remote',
        'submitted',
        'failed_validation',
        'failed_remote',
        'cancelled'
    )
);

alter table dmr_declarations
drop constraint if exists chk_dmr_submitted_consistency;

alter table dmr_declarations
add constraint chk_dmr_submitted_consistency check (
    (status <> 'submitted')
    or (
        status = 'submitted'
        and submitted_at is not null
        and protocol_number is not null
    )
);

alter table dmr_declarations
drop constraint if exists chk_dmr_attempts_nonneg;

alter table dmr_declarations
add constraint chk_dmr_attempts_nonneg check (attempts >= 0);

-- Trigger de version (espelha padrão DL-022 de manifests/jobs/session_contexts).
drop trigger if exists trg_dmr_declarations_version on dmr_declarations;

create trigger trg_dmr_declarations_version
  before update on dmr_declarations
  for each row
  when (old.* is distinct from new.*)
  execute function increment_version();

-- Índices (idempotentes).
create index if not exists idx_dmr_account_status on dmr_declarations (
    integration_account_id,
    status,
    created_at desc
);

create index if not exists idx_dmr_period on dmr_declarations (
    integration_account_id,
    period_start,
    period_end
);

create index if not exists idx_dmr_correlation on dmr_declarations (correlation_id);

create index if not exists idx_dmr_protocol on dmr_declarations (protocol_number)
where
    protocol_number is not null;

-- =============================================================================
-- 2. dmr_declaration_items
-- =============================================================================

create table if not exists dmr_declaration_items (
    id text primary key,
    declaration_id text not null references dmr_declarations (id) on delete cascade,
    manifest_id text references manifests (id),
    mtr_number text not null,
    cdf_number text,
    residue_class text not null,
    residue_code text,
    quantity_value numeric(18, 4) not null,
    quantity_unit text not null,
    partner_role text not null,
    partner_cnpj text not null,
    metadata jsonb,
    created_at timestamptz not null default now()
);

alter table dmr_declaration_items
drop constraint if exists chk_dmr_item_quantity_unit;

alter table dmr_declaration_items
add constraint chk_dmr_item_quantity_unit check (
    quantity_unit in ('kg', 't', 'm3', 'L')
);

alter table dmr_declaration_items
drop constraint if exists chk_dmr_item_partner_role;

alter table dmr_declaration_items
add constraint chk_dmr_item_partner_role check (
    partner_role in (
        'transportador',
        'destinador',
        'armazenador'
    )
);

alter table dmr_declaration_items
drop constraint if exists chk_dmr_item_quantity_positive;

alter table dmr_declaration_items
add constraint chk_dmr_item_quantity_positive check (quantity_value > 0);

create index if not exists idx_dmr_items_decl on dmr_declaration_items (declaration_id, created_at);

create index if not exists idx_dmr_items_manifest on dmr_declaration_items (manifest_id)
where
    manifest_id is not null;
-- Migration 032: Transporte — emissão de DF-e SANDBOX-READY (PR-G do programa "SICAT Transporte",
-- DL-103, DL-102 aplicado à emissão fiscal).
--
-- ── Por que "sandbox-ready" e não "emissão" ────────────────────────────────────────────────────
-- A Fase G é CONDICIONAL a go/no-go comercial + certificado digital + credenciamento SEFAZ
-- ([LEGAL REVIEW REQUIRED]+[EXTERNAL DEPENDENCY], pendência P9 do guia). Este PR entrega a
-- ARQUITETURA completa de emissão, testável hoje em modo sandbox (via `@flavioneto11/fiscal-kit`,
-- fail-closed sem certificado), atrás de uma flag de CONFIGURAÇÃO (`DFE_ISSUANCE_MODE=off` por
-- default) — nunca emissão em `production` sem decisão comercial explícita do operador.
--
-- ── dfe_issuances — UMA linha por TENTATIVA de emissão (molde `ciot_operations`, NÃO `vpo_allocations`) ──
-- A identidade remota (protocolo de autorização) nasce na RESPOSTA do (simulador de) SEFAZ — nunca
-- no request. Por isso `correlation_marker` é gravado na CRIAÇÃO da linha, ANTES de qualquer chamada
-- ao gateway (`gateways/dfe-issuance-gateway.ts`), e uma tentativa que fica sem resposta confirmada
-- vira `submit_unconfirmed` (NUNCA `failed`) até o reconciliador (`transporte.dfe.issue.reconcile`)
-- provar o que aconteceu. `fiscal_document_id` só é preenchido quando a emissão AUTORIZADA é
-- reimportada ao acervo da Fase E (`transport-fiscal-service.importarDocumentoFiscal`, reuso
-- interno) — a emissão vira um documento validável pelos evaluators TR-NFE/CTE/MDFE já existentes,
-- sem lógica nova.
--
-- ── environment: sandbox|production — o bloqueio de produção é CONFIGURAÇÃO, não constraint ──────
-- A coluna aceita os dois valores por desenho de schema (a emissão real algum dia vai gravar
-- `production`), mas NADA neste PR grava `production`: `dfe-issuance-gateway.ts` só implementa
-- `mode: 'sandbox'` (e `mode: 'off'`, que recusa TODA chamada) — `mode: 'real'`/ambiente `production`
-- ficam para quando P9 for resolvida pelo operador. Bloquear por CHECK aqui seria birrar contra o
-- próprio schema no dia em que a Fase G ligar de verdade; o bloqueio real é `DFE_ISSUANCE_MODE=off`
-- (config) + o gateway recusando `mode: 'real'` (código, mesma postura de
-- `CIOT_PROVIDER_NOT_CONFIGURED`/`VPO_PROVIDER_NOT_CONFIGURED`).
--
-- ── dfe_issuance_events — trilha APPEND-ONLY (mesmo racional de ciot_events/vpo_events) ──────────
-- Um evento por etapa do pipeline `build → sign → submit` (mais `submit_unconfirmed`/`reconciled`/
-- `imported_to_registry` do lado da reconciliação/DL-102) — nenhuma linha é apagada ou reescrita.
--
-- Padrões DL-022 honrados (molde: 028_transport_ciot.sql, 030_transport_fiscal_documents.sql):
-- PK `text` via `createPrefixedId` (`dfeiss_`/`dfeissev_`), `dfe_issuances` tem `version` + trigger
-- `increment_version()`; `dfe_issuance_events` é APPEND-ONLY (sem version própria); checks
-- idempotentes (`drop constraint if exists` + `add`), `create table/index if not exists`,
-- `correlation_id` obrigatório, tenancy por `integration_account_id`.

-- =============================================================================
-- 1. dfe_issuances
-- =============================================================================

create table if not exists dfe_issuances (
  id text primary key,
  integration_account_id text not null references integration_accounts (id),
  operation_id text not null references transport_operations (id),
  document_type text not null,
  status text not null default 'draft',
  environment text not null default 'sandbox',
  access_key text,
  protocol text,
  xml_storage_ref text,
  xml_hash text,
  provider_response jsonb not null default '{}'::jsonb,
  rejection_reason text,
  correlation_marker text not null,
  -- Preenchido quando a emissão AUTORIZADA é reimportada ao acervo da Fase E (dfe_issuances 1:1
  -- fiscal_documents nessa direção — uma emissão produz no máximo um documento; o inverso não é
  -- verdade, fiscal_documents também recebe XMLs importados manualmente sem emissão).
  fiscal_document_id text references fiscal_documents (id),
  job_id text,
  correlation_id text not null,
  command_id text,
  last_error_code text,
  last_error_detail jsonb,
  version integer not null default 1,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table dfe_issuances
drop constraint if exists chk_dfeiss_document_type;

alter table dfe_issuances
add constraint chk_dfeiss_document_type check (
    document_type in ('NFE', 'CTE', 'MDFE')
);

alter table dfe_issuances
drop constraint if exists chk_dfeiss_status;

alter table dfe_issuances
add constraint chk_dfeiss_status check (
    status in (
        'draft',
        'building',
        'built',
        'signing',
        'signed',
        'submitting',
        'submit_unconfirmed',
        'authorized',
        'rejected',
        'failed_validation',
        'cancelled'
    )
);

alter table dfe_issuances
drop constraint if exists chk_dfeiss_environment;

alter table dfe_issuances
add constraint chk_dfeiss_environment check (
    environment in ('sandbox', 'production')
);

-- Marcador de correlação — DL-102: único desde a criação, gravado ANTES de qualquer chamada ao
-- gateway. É a chave que `queryByMarker` usa para perguntar "isto nasceu do outro lado?".
alter table dfe_issuances
drop constraint if exists uq_dfeiss_correlation_marker;

alter table dfe_issuances
add constraint uq_dfeiss_correlation_marker unique (correlation_marker);

create index if not exists idx_dfeiss_operation on dfe_issuances (
    operation_id, created_at desc
);

create index if not exists idx_dfeiss_account_status on dfe_issuances (
    integration_account_id, status
);

drop trigger if exists trg_dfe_issuances_version on dfe_issuances;

create trigger trg_dfe_issuances_version
  before update on dfe_issuances
  for each row
  when (old.* is distinct from new.*)
  execute function increment_version();

-- =============================================================================
-- 2. dfe_issuance_events — trilha APPEND-ONLY
-- =============================================================================

create table if not exists dfe_issuance_events (
  id text primary key,
  issuance_id text not null references dfe_issuances (id) on delete cascade,
  event_type text not null,
  detail jsonb not null default '{}'::jsonb,
  correlation_id text not null,
  created_at timestamptz not null default now()
);

alter table dfe_issuance_events
drop constraint if exists chk_dfeissev_event_type;

alter table dfe_issuance_events
add constraint chk_dfeissev_event_type check (
    event_type in (
        'created',
        'built',
        'signed',
        'submitted',
        'submit_unconfirmed',
        'authorized',
        'rejected',
        'failed',
        'cancelled',
        'reconciled',
        'imported_to_registry'
    )
);

create index if not exists idx_dfeissev_issuance_created on dfe_issuance_events (
    issuance_id, created_at
);

-- Migration 030: Transporte — importação e validação de documentos fiscais (PR-E1 do programa
-- "SICAT Transporte", DL-103). Camada fiscal: IMPORTA, VALIDA e RELACIONA XMLs de NF-e/CT-e/MDF-e
-- a operações. Emissão de DF-e fica para a Fase G (fiscal-kit) — este PR nunca fala com a SEFAZ,
-- é 100% parsing local e síncrono (200/201).
--
-- ── dfe_schema_registry — schema registry VERSIONADO ──────────────────────────────────────────────
-- Nenhuma regra de validação de XML depende de um "schema eterno": cada combinação
-- (document_type, layout_version, technical_note) tem uma linha própria com
-- `validation_profile` (jsonb — regras ATIVÁVEIS por perfil, ex.: `{"mdfeRequiresCiot": true}`) e
-- uma janela de vigência (`effective_from`/`effective_until`, MESMO predicado temporal do catálogo
-- regulatório — `lib/transport/regulatory-temporal.ts#resolveVersionFromList`, reaproveitado aqui
-- em vez de duplicado). A antecipação em TESTE das rejeições da NT MDF-e 2026.001 (CIOT obrigatório
-- no MDF-e para transporte remunerado por terceiros) É uma linha deste registry
-- (MDFE/3.00/NT 2026.001, `effective_from` [ASSUMPTION] 2026-10-01 — ver seed,
-- `bootstrap/dfe-schema-seed.ts`), nunca um `if` hardcoded no validador.
--
-- ── fiscal_documents — UM documento importado ──────────────────────────────────────────────────────
-- `operation_id` nasce NULO (pode importar antes de vincular a uma operação — o vínculo é ato
-- explícito, `POST .../vincular`). O XML NUNCA entra em coluna jsonb/text: `xml_storage_ref` aponta
-- para `STORAGE_DIR/transporte-dfe/<hash>.xml` (`lib/files.ts#resolveStoragePath`) e `xml_hash` é o
-- SHA-256 do conteúdo — auditoria e dedupe sem duplicar bytes no banco.
-- `authorization_status` vem do XML (`protNFe`/`protCTe`/`protMDFe`) quando presente — NUNCA
-- inferido do relógio do processo. `validation_status`/`validation_issues` são o SNAPSHOT da última
-- validação (import ou revalidação); `revalidar` reprocessa e SOBRESCREVE estes dois campos, mas
-- NUNCA o snapshot importado (`xml_storage_ref`/`xml_hash`/campos extraídos do XML original).
-- `ciot_numbers`/`vpo_references` são os CIOTs/indícios de vale-pedágio extraídos do MDF-e (jsonb —
-- lista, um MDF-e pode citar mais de um CIOT quando há múltiplos responsáveis).
--
-- ── fiscal_document_links — vínculo ENTRE documentos (nfe→cte→mdfe) ──────────────────────────────
-- Resolvido automaticamente na importação (chaves referenciadas no XML já importadas antes) — nunca
-- duplicado (`unique (document_id, linked_document_id, link_type)`).
--
-- ── fiscal_document_events — trilha APPEND-ONLY ────────────────────────────────────────────────────
-- Mesmo racional de `ciot_events`/`vpo_events`/`rntrc_verifications`: nenhuma linha é apagada ou
-- reescrita: `imported`, `validated`, `revalidated`, `linked_to_operation`, `unlinked`.
--
-- Padrões DL-022 honrados (molde: 028_transport_ciot.sql, 029_transport_vpo.sql): PK `text` via
-- `createPrefixedId` (`dfeschema_`/`dfe_`/`dfelink_`/`dfeev_`), `dfe_schema_registry`/
-- `fiscal_documents` têm `version` + trigger `increment_version()`; `fiscal_document_links`/
-- `fiscal_document_events` são leves e append-only (sem `version`); checks idempotentes
-- (`drop constraint if exists` + `add`), `create table/index if not exists`, `correlation_id`
-- obrigatório em `fiscal_documents`/`fiscal_document_events`, tenancy por `integration_account_id`.

-- =============================================================================
-- 1. dfe_schema_registry — schema registry versionado (SEM tenancy: perfis de validação são globais)
-- =============================================================================

create table if not exists dfe_schema_registry (
  id text primary key,
  document_type text not null,
  layout_version text not null,
  technical_note text,
  effective_from date not null,
  effective_until date,
  validation_profile jsonb not null default '{}'::jsonb,
  notes text not null default '',
  version integer not null default 1,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table dfe_schema_registry
drop constraint if exists chk_dfeschema_document_type;

alter table dfe_schema_registry
add constraint chk_dfeschema_document_type check (
    document_type in ('NFE', 'CTE', 'MDFE')
);

alter table dfe_schema_registry
drop constraint if exists chk_dfeschema_effective_window;

alter table dfe_schema_registry
add constraint chk_dfeschema_effective_window check (
    effective_until is null or effective_until >= effective_from
);

-- ÍNDICE (não constraint simples) com `coalesce(technical_note, '')`: uma UNIQUE constraint comum
-- trataria duas linhas com `technical_note is null` como NÃO conflitantes (semântica padrão de NULL
-- em índice único), o que quebraria a idempotência do seed (bootstrap/dfe-schema-seed.ts) na
-- primeira entrada SEM nota técnica de cada tipo — ex.: reboot semeando NFE/4.00/null de novo
-- criaria uma SEGUNDA linha em vez de fazer upsert. `coalesce` fecha essa lacuna.
alter table dfe_schema_registry
drop constraint if exists uq_dfeschema_type_version_note;

create unique index if not exists uq_dfeschema_type_version_note on dfe_schema_registry (
    document_type, layout_version, (coalesce(technical_note, ''))
);

create index if not exists idx_dfeschema_type_effective on dfe_schema_registry (
    document_type, effective_from
);

drop trigger if exists trg_dfe_schema_registry_version on dfe_schema_registry;

create trigger trg_dfe_schema_registry_version
  before update on dfe_schema_registry
  for each row
  when (old.* is distinct from new.*)
  execute function increment_version();

-- =============================================================================
-- 2. fiscal_documents — UM documento importado
-- =============================================================================

create table if not exists fiscal_documents (
  id text primary key,
  integration_account_id text not null references integration_accounts (id),
  operation_id text references transport_operations (id),
  document_type text not null,
  access_key text not null,
  xml_storage_ref text not null,
  xml_hash text not null,
  layout_version text,
  schema_registry_id text references dfe_schema_registry (id),
  authorization_status text not null default 'unknown',
  protocol text,
  issued_at timestamptz,
  issuer_document text,
  issuer_name text,
  recipient_document text,
  recipient_name text,
  total_amount numeric(18, 2),
  validation_status text not null default 'pending',
  validation_issues jsonb not null default '[]'::jsonb,
  ciot_numbers jsonb not null default '[]'::jsonb,
  vpo_references jsonb not null default '[]'::jsonb,
  correlation_id text not null,
  version integer not null default 1,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table fiscal_documents
drop constraint if exists chk_dfe_document_type;

alter table fiscal_documents
add constraint chk_dfe_document_type check (
    document_type in ('NFE', 'CTE', 'MDFE')
);

-- Chave de acesso: 44 dígitos numéricos (layout da SEFAZ) — validação estrutural mínima; a
-- coerência (UF/modelo/CNPJ/DV embutidos) é responsabilidade de `dfe-validator.ts`
-- (`DFE_ACCESS_KEY_MISMATCH`), não desta constraint.
alter table fiscal_documents
drop constraint if exists chk_dfe_access_key_format;

alter table fiscal_documents
add constraint chk_dfe_access_key_format check (
    length(access_key) = 44 and access_key ~ '^[0-9]{44}$'
);

alter table fiscal_documents
drop constraint if exists chk_dfe_authorization_status;

alter table fiscal_documents
add constraint chk_dfe_authorization_status check (
    authorization_status in ('unknown', 'authorized', 'cancelled', 'denied')
);

alter table fiscal_documents
drop constraint if exists chk_dfe_validation_status;

alter table fiscal_documents
add constraint chk_dfe_validation_status check (
    validation_status in ('pending', 'valid', 'invalid', 'warnings')
);

alter table fiscal_documents
drop constraint if exists chk_dfe_total_amount_nonneg;

alter table fiscal_documents
add constraint chk_dfe_total_amount_nonneg check (
    total_amount is null or total_amount >= 0
);

-- Dedupe por conta: reimportar o MESMO XML (mesma access_key) na mesma conta é 409
-- `DFE_ALREADY_IMPORTED`, nunca uma segunda linha.
alter table fiscal_documents
drop constraint if exists uq_dfe_account_access_key;

alter table fiscal_documents
add constraint uq_dfe_account_access_key unique (
    integration_account_id, access_key
);

create index if not exists idx_dfe_operation on fiscal_documents (operation_id);

create index if not exists idx_dfe_account_type on fiscal_documents (
    integration_account_id, document_type
);

drop trigger if exists trg_fiscal_documents_version on fiscal_documents;

create trigger trg_fiscal_documents_version
  before update on fiscal_documents
  for each row
  when (old.* is distinct from new.*)
  execute function increment_version();

-- =============================================================================
-- 3. fiscal_document_links — vínculo ENTRE documentos (nfe→cte→mdfe), resolvido na importação
-- =============================================================================

create table if not exists fiscal_document_links (
  id text primary key,
  document_id text not null references fiscal_documents (id) on delete cascade,
  linked_document_id text references fiscal_documents (id),
  link_type text not null,
  created_at timestamptz not null default now()
);

alter table fiscal_document_links
drop constraint if exists chk_dfelink_type;

alter table fiscal_document_links
add constraint chk_dfelink_type check (
    link_type in ('nfe_in_cte', 'cte_in_mdfe', 'nfe_in_mdfe')
);

alter table fiscal_document_links
drop constraint if exists uq_dfelink_document_linked_type;

alter table fiscal_document_links
add constraint uq_dfelink_document_linked_type unique (
    document_id, linked_document_id, link_type
);

create index if not exists idx_dfelink_document on fiscal_document_links (document_id);

create index if not exists idx_dfelink_linked_document on fiscal_document_links (linked_document_id);

-- =============================================================================
-- 4. fiscal_document_events — trilha APPEND-ONLY (mesmo racional de ciot_events/vpo_events)
-- =============================================================================

create table if not exists fiscal_document_events (
  id text primary key,
  document_id text not null references fiscal_documents (id) on delete cascade,
  event_type text not null,
  detail jsonb not null default '{}'::jsonb,
  correlation_id text not null,
  created_at timestamptz not null default now()
);

alter table fiscal_document_events
drop constraint if exists chk_dfeev_event_type;

alter table fiscal_document_events
add constraint chk_dfeev_event_type check (
    event_type in ('imported', 'validated', 'revalidated', 'linked_to_operation', 'unlinked')
);

create index if not exists idx_dfeev_document_created on fiscal_document_events (
    document_id, created_at
);

-- Migration 033: Transporte — Regulatory Watch (PR-H1 do programa "SICAT Transporte", DL-103).
--
-- Acompanhamento de fontes normativas (`regulatory_sources`, migration 021) com fluxo
-- DETECTED → INGESTED → AI_ANALYZED/AI_SKIPPED → HUMAN_REVIEW → APPROVED → TESTED → SCHEDULED →
-- ACTIVE_APPLIED (ou REJECTED). `tested`/`scheduled` são reservados para uma fase futura — este PR
-- só alcança até `approved`/`rejected` (via `POST .../watch/{itemId}/revisar`) e `active_applied`
-- (via `POST .../watch/{itemId}/aplicar`, que cria uma NOVA `regulatory_rule_version`).
--
-- ⚠️ REGRA DE OURO DO PROGRAMA reafirmada aqui: a máquina NUNCA ativa regra bloqueante sozinha —
-- sugestão (detecção + IA opcional) é máquina, ativação é humano. `aplicar` cria versão SEMPRE
-- `blocking=false` (o campo nem existe no request do endpoint — garantido em código, não aqui). O
-- ÚNICO caminho para `blocking=true` é a promoção administrativa
-- (`POST /v1/transporte/regras/{code}/versoes/{versionLabel}/promover`), que grava
-- `reviewed_by`/`reviewed_at` na MESMA linha de `regulatory_rule_versions` — a trava já existente
-- desde a migration 021 (`chk_regrulev_blocking_reviewed`) continua sendo a garantia de banco.
--
-- ── regulatory_watch_items — UMA linha por MUDANÇA DETECTADA numa fonte ────────────────────────────
-- `detected_change` guarda o fato bruto da detecção (hash anterior/novo, status HTTP, etag/
-- last-modified) — NUNCA o conteúdo inteiro (isso vive em `ingested_content_ref`, um ponteiro para
-- `STORAGE_DIR/regulatory-watch/`, molde de `fiscal_documents.xml_storage_ref`). `ai_analysis` é um
-- resumo MÍNIMO opcional (nunca uma decisão — ver `regulatory-watch-gateway.ts`/
-- `transport-regulatory-watch-service.ts`). `applied_rule_version_id` só é preenchido por `aplicar`.
--
-- ── regulatory_watch_events — trilha APPEND-ONLY (molde ciot_events/vpo_events/dfe_issuance_events) ─
-- Um evento por transição do item (`watch_item_id` obrigatório nesses casos), MAIS
-- `check_run_no_change` — a varredura que NÃO encontrou mudança na fonte NÃO cria
-- `regulatory_watch_items` (não há "mudança" para acompanhar), então esse evento é o ÚNICO tipo com
-- `watch_item_id` nulo; carrega `source_id` diretamente para não perder de vista QUAL fonte foi
-- checada. Todo evento carrega `source_id` (mesmo os ligados a um item, para consulta uniforme
-- "últimas verificações desta fonte" sem precisar de join).
--
-- Padrões DL-022 honrados (molde: 028_transport_ciot.sql/032_transport_dfe_issuance.sql): PK `text`
-- via `createPrefixedId` (`regwatch_`/`regwev_`), `regulatory_watch_items` tem `version` + trigger
-- `increment_version()`; `regulatory_watch_events` é APPEND-ONLY (sem version própria); checks
-- idempotentes (`drop constraint if exists` + `add`), `create table/index if not exists`,
-- `correlation_id` obrigatório. SEM tenancy (`integration_account_id`): o catálogo regulatório e seu
-- monitoramento são GLOBAIS neste operador único (mesmo racional de `regulatory_sources`).

-- =============================================================================
-- 1. regulatory_watch_items
-- =============================================================================

create table if not exists regulatory_watch_items (
  id text primary key,
  source_id text not null references regulatory_sources (id),
  status text not null default 'detected',
  detected_change jsonb not null default '{}'::jsonb,
  -- Referência de storage do conteúdo baixado (NUNCA o conteúdo inteiro em coluna) — preenchida na
  -- transição detected → ingested.
  ingested_content_ref text,
  ai_analysis jsonb not null default '{}'::jsonb,
  human_review_notes text,
  reviewed_by text,
  reviewed_at timestamptz,
  applied_rule_version_id text references regulatory_rule_versions (id),
  job_id text,
  correlation_id text not null,
  version integer not null default 1,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table regulatory_watch_items
drop constraint if exists chk_regwatch_status;

alter table regulatory_watch_items
add constraint chk_regwatch_status check (
    status in (
        'detected',
        'ingested',
        'ai_analyzed',
        'ai_skipped',
        'human_review',
        'approved',
        'rejected',
        'tested',
        'scheduled',
        'active_applied'
    )
);

-- Mesma trava conceitual de `chk_regrulev_blocking_reviewed` (migration 021): um item só pode estar
-- `approved`/`rejected`/`active_applied` com `reviewed_by`/`reviewed_at` preenchidos — a decisão
-- humana fica registrada NA LINHA, não só no evento append-only.
alter table regulatory_watch_items
drop constraint if exists chk_regwatch_reviewed_when_decided;

alter table regulatory_watch_items
add constraint chk_regwatch_reviewed_when_decided check (
    status not in ('approved', 'rejected', 'active_applied')
    or (reviewed_by is not null and reviewed_at is not null)
);

drop trigger if exists trg_regulatory_watch_items_version on regulatory_watch_items;

create trigger trg_regulatory_watch_items_version
  before update on regulatory_watch_items
  for each row
  when (old.* is distinct from new.*)
  execute function increment_version();

create index if not exists idx_regwatch_source_created on regulatory_watch_items (
    source_id, created_at desc
);

create index if not exists idx_regwatch_status on regulatory_watch_items (status);

-- =============================================================================
-- 2. regulatory_watch_events — trilha APPEND-ONLY
-- =============================================================================

create table if not exists regulatory_watch_events (
  id text primary key,
  -- Nulo APENAS para `check_run_no_change` (ver constraint abaixo) — todo evento de transição de um
  -- item exige o vínculo.
  watch_item_id text references regulatory_watch_items (id) on delete cascade,
  source_id text not null references regulatory_sources (id),
  event_type text not null,
  detail jsonb not null default '{}'::jsonb,
  correlation_id text not null,
  created_at timestamptz not null default now()
);

alter table regulatory_watch_events
drop constraint if exists chk_regwev_event_type;

alter table regulatory_watch_events
add constraint chk_regwev_event_type check (
    event_type in (
        'detected',
        'ingested',
        'ai_analyzed',
        'ai_skipped',
        'human_review',
        'approved',
        'rejected',
        'tested',
        'scheduled',
        'active_applied',
        -- Varredura que confirmou a fonte SEM mudança (hash igual ao `source_hash` conhecido) — o
        -- ÚNICO tipo de evento que não acompanha um item (nenhuma mudança para acompanhar).
        'check_run_no_change'
    )
);

alter table regulatory_watch_events
drop constraint if exists chk_regwev_watch_item_required;

alter table regulatory_watch_events
add constraint chk_regwev_watch_item_required check (
    event_type = 'check_run_no_change' or watch_item_id is not null
);

create index if not exists idx_regwev_item_created on regulatory_watch_events (
    watch_item_id, created_at
);

create index if not exists idx_regwev_source_created on regulatory_watch_events (
    source_id, created_at desc
);

-- Migration 025: Transporte — motor de compliance (PR-A5 do programa "SICAT Transporte", DL-103).
--
-- Cria as três tabelas do motor de compliance: `TransportComplianceService` avalia GATES sobre um
-- `TransportOperation` (agregado da migration 024) contra o catálogo regulatório temporal
-- (migration 021) e persiste o resultado aqui.
--   1. compliance_evaluations — UMA avaliação de UM gate, numa data de referência, com o
--      resultado agregado (`overall_status`) e o snapshot da operação no momento.
--   2. compliance_checks      — UM resultado por regra TR-* dentro da avaliação (`ruleCode`,
--      status, base legal congelada, motivo).
--   3. compliance_evidence    — evidência que sustenta um check (para a Fase A, o traço do
--      cálculo puro do evaluator; fases futuras trazem `document`/`external_response`).
--
-- ⚠️ DESVIO DELIBERADO em relação ao padrão DL-022 (`013_dmr_declarations.sql`, migrations
-- 021/023/024 desta mesma vertical): `compliance_evaluations` e `compliance_checks` são
-- **APPEND-ONLY** — SEM coluna `version`, SEM trigger `increment_version()`, e o código da
-- aplicação (`transport-compliance-repo.ts`) NUNCA emite `update`/`delete` contra elas. Uma nova
-- avaliação do mesmo gate/operação é sempre uma LINHA NOVA, nunca uma correção in-place da
-- anterior. Justificativa:
--   - Reprodutibilidade/auditoria (NFR-0009/0010 do programa): a decisão de aprovar/bloquear uma
--     transição tem que ser reconstituível exatamente como aconteceu — se avaliações fossem
--     mutáveis, um `update` futuro reescreveria silenciosamente o motivo pelo qual uma operação
--     foi liberada no passado. `operation_snapshot` (jsonb) e `result_snapshot`/`legal_basis`
--     congelados por check tornam cada avaliação uma fotografia imutável.
--   - O histórico completo de avaliações de uma operação IMPORTA por si (regressão de conformidade,
--     re-teste após correção de dado, trilha para o operador jurídico) — apagar/sobrescrever
--     destruiria esse histórico. `compliance_evidence` seria a mesma tabela `_evidence` de
--     `013_dmr_declarations.sql`.
-- `compliance_evidence` segue o MESMO racional (evidência de uma avaliação passada não pode virar
-- evidência de outra coisa por update).
--
-- Padrões DL-022 honrados no que NÃO é o desvio acima: PK `text` via `createPrefixedId`
-- (`cmpeval_`/`cmpchk_`/`cmpevd_`), `created_at` timestamptz default now(), `correlation_id` em
-- toda tabela de topo, tenancy por `integration_account_id`, constraints idempotentes
-- (`drop constraint if exists` + `add`), `create table/index if not exists`.

-- =============================================================================
-- 1. compliance_evaluations
-- =============================================================================

create table if not exists compliance_evaluations (
  id text primary key,
  integration_account_id text not null references integration_accounts (id),
  operation_id text not null references transport_operations (id),
  gate text not null,
  overall_status text not null,
  reference_date date not null,
  evaluated_at timestamptz not null default now(),
  triggered_by text not null,
  evaluated_by text,
  engine_version text not null,
  operation_snapshot jsonb not null,
  correlation_id text not null,
  command_id text,
  created_at timestamptz not null default now()
);

alter table compliance_evaluations
drop constraint if exists chk_cmpeval_gate;

alter table compliance_evaluations
add constraint chk_cmpeval_gate check (
    gate in (
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

alter table compliance_evaluations
drop constraint if exists chk_cmpeval_overall_status;

alter table compliance_evaluations
add constraint chk_cmpeval_overall_status check (
    overall_status in ('pass', 'warn', 'block')
);

alter table compliance_evaluations
drop constraint if exists chk_cmpeval_triggered_by;

alter table compliance_evaluations
add constraint chk_cmpeval_triggered_by check (
    triggered_by in ('user', 'transition', 'system')
);

create index if not exists idx_cmpeval_operation_gate on compliance_evaluations (
    operation_id, gate, evaluated_at desc
);

create index if not exists idx_cmpeval_account_evaluated on compliance_evaluations (
    integration_account_id, evaluated_at desc
);

create index if not exists idx_cmpeval_correlation on compliance_evaluations (correlation_id);

-- =============================================================================
-- 2. compliance_checks
-- =============================================================================

create table if not exists compliance_checks (
  id text primary key,
  evaluation_id text not null references compliance_evaluations (id) on delete cascade,
  rule_code text not null,
  rule_version_id text references regulatory_rule_versions (id),
  rule_version_label text not null default '',
  status text not null,
  raw_status text,
  reason_code text,
  human_message text not null default '',
  legal_basis jsonb not null default '[]'::jsonb,
  inputs_snapshot jsonb not null default '{}'::jsonb,
  result_snapshot jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

alter table compliance_checks
drop constraint if exists chk_cmpchk_status;

alter table compliance_checks
add constraint chk_cmpchk_status check (
    status in ('pass', 'warn', 'block', 'not_applicable')
);

-- `raw_status` só é preenchido quando o clamp de enforcement mudou o status (ver
-- `applyEnforcementClamp` em `lib/transport/rule-evaluators.ts`) — nulo é o caso comum (sem clamp).
alter table compliance_checks
drop constraint if exists chk_cmpchk_raw_status;

alter table compliance_checks
add constraint chk_cmpchk_raw_status check (
    raw_status is null or raw_status in ('pass', 'warn', 'block', 'not_applicable')
);

create index if not exists idx_cmpchk_evaluation on compliance_checks (evaluation_id);

create index if not exists idx_cmpchk_rule_status on compliance_checks (rule_code, status);

-- =============================================================================
-- 3. compliance_evidence
-- =============================================================================

create table if not exists compliance_evidence (
  id text primary key,
  integration_account_id text not null references integration_accounts (id),
  operation_id text references transport_operations (id),
  check_id text references compliance_checks (id) on delete cascade,
  evidence_type text not null,
  payload jsonb,
  storage_ref text,
  content_hash text,
  source text not null default 'system',
  collected_by text,
  collected_at timestamptz not null default now(),
  correlation_id text not null,
  created_at timestamptz not null default now()
);

alter table compliance_evidence
drop constraint if exists chk_cmpevd_evidence_type;

alter table compliance_evidence
add constraint chk_cmpevd_evidence_type check (
    evidence_type in (
        'calculation',
        'document',
        'external_response',
        'manual_declaration',
        'system_snapshot'
    )
);

-- Toda evidência carrega ALGUMA coisa: o payload inline (Fase A: traço do cálculo puro) ou uma
-- referência de storage (fases futuras: documento anexado, resposta externa persistida à parte).
alter table compliance_evidence
drop constraint if exists chk_cmpevd_payload_or_storage;

alter table compliance_evidence
add constraint chk_cmpevd_payload_or_storage check (
    payload is not null or storage_ref is not null
);

create index if not exists idx_cmpevd_operation on compliance_evidence (operation_id);

create index if not exists idx_cmpevd_check on compliance_evidence (check_id);

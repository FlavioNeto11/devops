-- Migration 027: Transporte — verificações de regularidade RNTRC (PR-C1 do programa "SICAT
-- Transporte", DL-103).
--
-- Cria `rntrc_verifications`: UMA linha por TENTATIVA de verificação de regularidade RNTRC de um
-- transportador (`transport_parties`), via `open_data` (integração real com o Portal de Dados
-- Abertos da ANTT — dados.antt.gov.br, dataset "rntrc"), `manual` (evidência declarada por um
-- usuário) ou `antt` (consulta credenciada — interface reservada, sem implementação nesta fase).
--
-- ⚠️ "APPEND-ONLY" aqui tem um sentido específico (mesmo racional de `compliance_evaluations` e
-- `freight_floor_calculations`, DESVIO deliberado do padrão DL-022 de `version`/trigger): nenhuma
-- linha é apagada e uma NOVA verificação NUNCA reabre/sobrescreve uma linha terminal — sempre nasce
-- uma linha nova. A diferença para as duas tabelas irmãs é que `open_data` é ASSÍNCRONA (fila): a
-- linha nasce `requested_status = 'pending'` (gravada ANTES da chamada ao gateway, no mesmo molde de
-- `buildPayloadWithSubmitIntent`/`status: 'submitting'` do fluxo de manifesto) e recebe EXATAMENTE
-- UMA transição em UPDATE, pending → succeeded OU pending → failed, quando o worker conclui a
-- tentativa (`rntrc-verification-repo.ts` só permite esse update via `where requested_status =
-- 'pending'`). `manual` não tem fase pending: nasce direto `succeeded` (síncrono, sem fila).
--
-- Distinção de relatório que este PR introduz (guia do programa, pendência P4): dado aberto é CACHE
-- INFORMATIVO, não prova de regularidade. Por isso `result_status`/`data_reference_date` vivem
-- separados do enum de `transport_parties.rntrc_status` — a UI/API compõem a frase "active
-- (open_data, dataDate=...)" a partir destes dois campos, nunca um rótulo "verificado" sozinho.
--
-- Padrões DL-022 honrados: PK `text` via `createPrefixedId` (`rntrcver_`), `created_at` timestamptz
-- default now(), `correlation_id` obrigatório, tenancy por `integration_account_id`, constraints
-- idempotentes (`drop constraint if exists` + `add`), `create table/index if not exists`.

create table if not exists rntrc_verifications (
  id text primary key,
  integration_account_id text not null references integration_accounts (id),
  party_id text not null references transport_parties (id),
  rntrc_number text,
  requested_status text not null default 'pending',
  strategy text not null,
  result_status text,
  result_category text,
  data_reference_date date,
  evidence jsonb not null default '{}'::jsonb,
  evidence_source text,
  verified_by text,
  job_id text,
  correlation_id text not null,
  created_at timestamptz not null default now(),
  completed_at timestamptz
);

alter table rntrc_verifications
drop constraint if exists chk_rntrcver_requested_status;

alter table rntrc_verifications
add constraint chk_rntrcver_requested_status check (
    requested_status in ('pending', 'succeeded', 'failed')
);

alter table rntrc_verifications
drop constraint if exists chk_rntrcver_strategy;

alter table rntrc_verifications
add constraint chk_rntrcver_strategy check (
    strategy in ('open_data', 'manual', 'antt')
);

alter table rntrc_verifications
drop constraint if exists chk_rntrcver_result_status;

alter table rntrc_verifications
add constraint chk_rntrcver_result_status check (
    result_status is null
    or result_status in ('active', 'suspended', 'cancelled', 'expired', 'not_found', 'unknown')
);

alter table rntrc_verifications
drop constraint if exists chk_rntrcver_result_category;

alter table rntrc_verifications
add constraint chk_rntrcver_result_category check (
    result_category is null
    or result_category in ('TAC', 'ETC', 'CTC')
);

create index if not exists idx_rntrcver_party_created on rntrc_verifications (
    party_id, created_at desc
);

create index if not exists idx_rntrcver_account_created on rntrc_verifications (
    integration_account_id, created_at desc
);

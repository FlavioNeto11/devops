-- Migration 014: MTR provisório — discriminador `kind` em `manifests`
-- (cadeia `mtr-provisorio-fluxo-base`, fase 05-persistence-queue).
--
-- Decisão R3-C (formalizada em
-- docs/handoffs/mtr-provisorio-fluxo-base/04-backend-contracts.md):
-- `kind ∈ { 'definitivo','provisorio' }` é o discriminador SICAT no
-- schema/repo. A conversão para `tipoManifestoOverride` numérico só
-- ocorre na borda do service ao invocar o gateway.
--
-- Esta migration é ADITIVA e idempotente:
--   1. acrescenta `kind` (default 'definitivo') + check constraint;
--   2. acrescenta `provisional_number` (nullable) — número provisório
--      retornado pela CETESB no submit do MTR provisório;
--   3. acrescenta `definitive_manifest_id` (nullable, FK opcional para
--      `manifests(id)`) — futuro vínculo provisório → definitivo;
--   4. cria índice `ix_manifests_kind` (listagem por discriminador);
--   5. cria índice parcial `ix_manifests_kind_provisorio`
--      (suporte à listagem dedicada de `/v1/mtr-provisorio`).
--
-- DL-022 preservado:
-- - constraints de consistência (chk_manifest_submitted_integrity,
--   chk_job_*) permanecem inalteradas; este ramo `kind='provisorio'`
--   reusa as 5 constraints já vigentes na tabela `manifests`/`jobs`;
-- - locking otimista via coluna `version` permanece (trigger
--   `trg_manifests_version` cobre updates inclusive sobre `kind`,
--   `provisional_number` e `definitive_manifest_id`).

-- =============================================================================
-- 1. Coluna `kind` (discriminador SICAT)
-- =============================================================================

alter table manifests
add column if not exists kind text not null default 'definitivo';

alter table manifests drop constraint if exists chk_manifests_kind;

alter table manifests
add constraint chk_manifests_kind check (
    kind in ('definitivo', 'provisorio')
);

-- =============================================================================
-- 2. Coluna `provisional_number`
-- =============================================================================

alter table manifests
add column if not exists provisional_number text;

-- =============================================================================
-- 3. Coluna `definitive_manifest_id`
-- =============================================================================

alter table manifests
add column if not exists definitive_manifest_id text;

-- FK opcional (idempotente). Em ambientes muito antigos a coluna pode já
-- existir com FK; o bloco abaixo trata o caso "create if not exists".
do $$
begin
  if not exists (
    select 1 from pg_constraint
     where conname = 'fk_manifests_definitive_manifest_id'
  ) then
    alter table manifests
      add constraint fk_manifests_definitive_manifest_id
      foreign key (definitive_manifest_id) references manifests(id)
      on delete set null;
  end if;
end $$;

-- =============================================================================
-- 4. Índices
-- =============================================================================

create index if not exists ix_manifests_kind on manifests (kind);

-- Listagem dedicada de provisórios por integration_account ordenada
-- pela data de expedição (extraída do payload). Mantemos o índice
-- parcial sobre colunas físicas (created_at) para evitar dependência
-- de funções imutáveis sobre jsonb; o orderby por expedição usa o
-- índice `idx_manifests_expedition_date_text` já existente (012).
create index if not exists ix_manifests_kind_provisorio on manifests (
    integration_account_id,
    created_at desc
)
where
    kind = 'provisorio';
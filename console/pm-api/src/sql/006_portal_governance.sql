-- 006: Governanca de portais — aprovacao + rastreio de criacao + vinculo opcional
-- portal -> produto/sistema.
--   approval_status: portal criado por admin nasce 'approved'; criado por member
--     nasce 'pending_approval' e SO aparece na rota publica apos aprovacao do dono.
--   related_project_id: vinculo RELACIONAL e opcional (contexto/IA/governanca);
--     um portal NUNCA vira o proprio produto — tem key, cms_site e paginas proprios.
-- Backfill: tudo que ja existe e considerado aprovado (estava no ar antes da regra).
-- Idempotente.

DO $$ BEGIN
  CREATE TYPE approval_status AS ENUM ('approved', 'pending_approval', 'rejected');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

ALTER TABLE projects
  ADD COLUMN IF NOT EXISTS approval_status approval_status NOT NULL DEFAULT 'approved',
  ADD COLUMN IF NOT EXISTS created_by text,
  ADD COLUMN IF NOT EXISTS approved_by text,
  ADD COLUMN IF NOT EXISTS approved_at timestamptz,
  ADD COLUMN IF NOT EXISTS related_project_id uuid REFERENCES projects(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_projects_approval ON projects (approval_status);
CREATE INDEX IF NOT EXISTS idx_projects_related ON projects (related_project_id);

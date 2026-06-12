-- 007: Base para geracao de portal assistida por IA.
--   cms_generation_requests: pedido de geracao (prompt/template/contexto salvos
--     para rastreabilidade e regeneracao), status e resultado bruto (jsonb).
--   cms_sections.generated_by/generation_id: marca o que foi gerado por IA
--     (auditoria) sem impedir ajuste manual — regenerar cria NOVOS rascunhos,
--     nunca sobrescreve secao existente.
-- Idempotente.

DO $$ BEGIN
  CREATE TYPE cms_generation_status AS ENUM ('queued', 'generating', 'done', 'failed', 'unavailable');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

CREATE TABLE IF NOT EXISTS cms_generation_requests (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id  uuid NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  kind        text NOT NULL DEFAULT 'portal',        -- portal | page | section | theme
  prompt      text NOT NULL,
  template    text,
  context     jsonb NOT NULL DEFAULT '{}',           -- ex.: produto relacionado, paleta desejada
  status      cms_generation_status NOT NULL DEFAULT 'queued',
  result      jsonb,                                 -- saida bruta da IA (paleta/sitemap/secoes)
  error       text,
  created_by  text,
  created_at  timestamptz NOT NULL DEFAULT now(),
  updated_at  timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_cms_genreq_project ON cms_generation_requests (project_id, created_at DESC);

ALTER TABLE cms_sections
  ADD COLUMN IF NOT EXISTS generated_by text,        -- 'ai' | 'seed' | NULL (humano)
  ADD COLUMN IF NOT EXISTS generation_id uuid REFERENCES cms_generation_requests(id) ON DELETE SET NULL;

-- 004: Taxonomia de aplicacoes — separa "portal CMS" de "produto/software" e
-- "ferramenta de plataforma". O Console usa isso para navegar/agrupar por tipo
-- (Meus Portais vs Meus Sistemas) e o editor de Conteudo so lista cms_portal.
-- Idempotente: ADD COLUMN IF NOT EXISTS + backfill condicional.

DO $$ BEGIN
  CREATE TYPE app_type AS ENUM ('product_software', 'cms_portal', 'platform_tool');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

ALTER TABLE projects
  ADD COLUMN IF NOT EXISTS app_type app_type NOT NULL DEFAULT 'product_software';

-- Backfill dos portais existentes (os demais permanecem product_software).
UPDATE projects SET app_type = 'cms_portal'
 WHERE key IN ('rmambiental', 'anarabottini') AND app_type <> 'cms_portal';

CREATE INDEX IF NOT EXISTS idx_projects_app_type ON projects (app_type);

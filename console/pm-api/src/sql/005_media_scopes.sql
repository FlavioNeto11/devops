-- 005: Biblioteca de midia em DOIS niveis.
--   scope = 'project' -> arquivo exclusivo de um portal (comportamento original);
--   scope = 'global'  -> biblioteca publica da plataforma (logos, fundos, icones,
--                        placeholders) reutilizavel por QUALQUER portal.
-- Compatibilidade: arquivos existentes permanecem 'project'; a URL publica
-- /devops/api/cms/public/files/<id> nao muda (serve por id, qualquer escopo).
-- Idempotente.

ALTER TABLE cms_files ALTER COLUMN project_id DROP NOT NULL;
ALTER TABLE cms_files ADD COLUMN IF NOT EXISTS scope text NOT NULL DEFAULT 'project';

UPDATE cms_files SET scope = 'project' WHERE scope IS NULL OR scope NOT IN ('project', 'global');

ALTER TABLE cms_files DROP CONSTRAINT IF EXISTS cms_files_scope_chk;
ALTER TABLE cms_files ADD CONSTRAINT cms_files_scope_chk CHECK (
  (scope = 'project' AND project_id IS NOT NULL) OR (scope = 'global' AND project_id IS NULL)
);

CREATE INDEX IF NOT EXISTS idx_cms_files_scope ON cms_files (scope, created_at DESC);

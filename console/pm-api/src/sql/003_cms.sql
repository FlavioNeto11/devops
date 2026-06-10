-- =============================================================================
-- CMS desacoplado — conteudo editavel dos portais (projeto == portal).
-- Idempotente: enums via DO/EXCEPTION; tabelas IF NOT EXISTS. Aditivo.
-- Escopo por project_id (reusa projects + pm_user_access para autorizacao).
-- `kind` e TEXT (nao enum): novos blocos genericos sem migracao; validado no app.
-- =============================================================================

DO $$ BEGIN CREATE TYPE cms_status AS ENUM ('draft','published'); EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- Config "site.ts" por portal: contato, redes, fotos, posicionamento, paleta.
CREATE TABLE IF NOT EXISTS cms_site (
  project_id  uuid PRIMARY KEY REFERENCES projects(id) ON DELETE CASCADE,
  data        jsonb NOT NULL DEFAULT '{}'::jsonb,
  updated_at  timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS cms_pages (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id  uuid NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  slug        text NOT NULL,                 -- 'home' | 'contato' | ...
  title       text NOT NULL,
  position    integer NOT NULL DEFAULT 0,
  status      cms_status NOT NULL DEFAULT 'draft',
  created_at  timestamptz NOT NULL DEFAULT now(),
  updated_at  timestamptz NOT NULL DEFAULT now(),
  UNIQUE (project_id, slug)
);

CREATE TABLE IF NOT EXISTS cms_sections (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  page_id     uuid NOT NULL REFERENCES cms_pages(id) ON DELETE CASCADE,
  kind        text NOT NULL,                 -- 'hero' | 'rich-text' | 'card-grid' | ...
  anchor      text,                          -- ancora p/ scroll (#palestras, #nr1...)
  position    integer NOT NULL DEFAULT 0,
  data        jsonb NOT NULL DEFAULT '{}'::jsonb,
  status      cms_status NOT NULL DEFAULT 'draft',
  visible     boolean NOT NULL DEFAULT true,
  created_at  timestamptz NOT NULL DEFAULT now(),
  updated_at  timestamptz NOT NULL DEFAULT now()
);

-- Arquivos (imagens/PDFs) por projeto, como bytea. Servidos pelo endpoint publico.
CREATE TABLE IF NOT EXISTS cms_files (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id  uuid NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  filename    text NOT NULL,
  mime        text NOT NULL,
  size        integer NOT NULL,
  bytes       bytea NOT NULL,
  created_by  text,                          -- req.auth.email
  created_at  timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_cms_pages_project     ON cms_pages(project_id, position);
CREATE INDEX IF NOT EXISTS idx_cms_sections_page_pos ON cms_sections(page_id, position);
CREATE INDEX IF NOT EXISTS idx_cms_files_project     ON cms_files(project_id, created_at DESC);

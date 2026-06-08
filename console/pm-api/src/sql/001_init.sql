-- =============================================================================
-- Projetos & Tarefas (meta-projeto) — schema inicial.
-- Idempotente: enums via DO/EXCEPTION; tabelas IF NOT EXISTS.
-- Convencao da plataforma: snake_case plural, enums prefixados, timestamps now().
-- =============================================================================

DO $$ BEGIN CREATE TYPE project_status AS ENUM ('active','paused','archived'); EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN CREATE TYPE item_type      AS ENUM ('bug','feature','evolution');  EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN CREATE TYPE item_status    AS ENUM ('backlog','todo','in_progress','in_review','done','wontfix'); EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN CREATE TYPE item_priority  AS ENUM ('P0','P1','P2','P3'); EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN CREATE TYPE task_status    AS ENUM ('todo','in_progress','done'); EXCEPTION WHEN duplicate_object THEN NULL; END $$;

CREATE TABLE IF NOT EXISTS projects (
  id                  uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  key                 text NOT NULL UNIQUE,
  name                text NOT NULL,
  stack               text,
  repo_url            text,
  route               text,
  k8s_namespace       text NOT NULL DEFAULT 'apps',
  k8s_label_selector  text,                         -- valor de app.kubernetes.io/part-of (cross-link c/ cluster)
  status              project_status NOT NULL DEFAULT 'active',
  description         text,
  created_at          timestamptz NOT NULL DEFAULT now(),
  updated_at          timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS items (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id    uuid NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  type          item_type NOT NULL,
  title         text NOT NULL,
  description   text,
  status        item_status NOT NULL DEFAULT 'backlog',
  priority      item_priority NOT NULL DEFAULT 'P2',
  external_ref  text,
  git_url       text,
  pr_url        text,
  created_at    timestamptz NOT NULL DEFAULT now(),
  updated_at    timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS tasks (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  item_id       uuid NOT NULL REFERENCES items(id) ON DELETE CASCADE,
  title         text NOT NULL,
  status        task_status NOT NULL DEFAULT 'todo',
  position      integer NOT NULL DEFAULT 0,
  assignee      text,
  estimate      numeric,
  started_at    timestamptz,
  completed_at  timestamptz,
  created_at    timestamptz NOT NULL DEFAULT now(),
  updated_at    timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS item_links (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  item_id     uuid NOT NULL REFERENCES items(id) ON DELETE CASCADE,
  kind        text NOT NULL,           -- git | pr | doc | cluster
  url         text,
  label       text,
  created_at  timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_items_project_status ON items(project_id, status);
CREATE INDEX IF NOT EXISTS idx_tasks_item_status_pos ON tasks(item_id, status, position);

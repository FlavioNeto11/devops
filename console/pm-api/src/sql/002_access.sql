-- =============================================================================
-- Acesso escopado a Projetos & Tarefas (usuários restritos do Console).
-- Identidade vive no Keycloak (grupo project-members); aqui guardamos o MAPA
-- usuário(e-mail) -> projeto. Idempotente (IF NOT EXISTS). Aditivo.
-- =============================================================================

-- Registro local dos usuários restritos (espelho da gestão; e-mail = identidade do Keycloak).
CREATE TABLE IF NOT EXISTS pm_users (
  email             text PRIMARY KEY,                 -- sempre lower-case (e-mail do Keycloak)
  display_name      text,
  keycloak_user_id  text,
  disabled          boolean NOT NULL DEFAULT false,
  created_at        timestamptz NOT NULL DEFAULT now()
);

-- Concessões de acesso por projeto. can_edit = true (decisão: membro edita o board do projeto).
CREATE TABLE IF NOT EXISTS pm_user_access (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_email  text NOT NULL,
  project_id  uuid NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  can_edit    boolean NOT NULL DEFAULT true,
  created_at  timestamptz NOT NULL DEFAULT now(),
  UNIQUE (user_email, project_id)
);

CREATE INDEX IF NOT EXISTS idx_pm_user_access_email ON pm_user_access(user_email);
CREATE INDEX IF NOT EXISTS idx_pm_user_access_project ON pm_user_access(project_id);

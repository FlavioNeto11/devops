-- Fase 0 — identidade + RBAC em dados (docs/evolution/01-rbac-permissoes.md + apendice B, grupo i).
-- Papeis/permissoes sao LINHAS; o codigo declara apenas o catalogo de permissoes.

CREATE TABLE users (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  email           TEXT NOT NULL,
  name            TEXT,
  keycloak_sub    TEXT UNIQUE,
  password_hash   TEXT,
  is_active       BOOLEAN NOT NULL DEFAULT true,
  approval_status TEXT NOT NULL DEFAULT 'active'
    CHECK (approval_status IN ('pending_approval', 'active', 'rejected')),
  kyc_status      TEXT NOT NULL DEFAULT 'none'
    CHECK (kyc_status IN ('none', 'pending', 'approved', 'rejected')),
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX users_email_lower_uniq ON users (lower(email));

CREATE TABLE roles (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  key         TEXT UNIQUE NOT NULL,
  label       TEXT NOT NULL,
  description TEXT,
  is_system   BOOLEAN NOT NULL DEFAULT false,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_by  UUID REFERENCES users(id)
);

-- Catalogo espelhado do codigo no boot (upsert); criar PERMISSAO nova exige deploy.
CREATE TABLE permissions (
  key          TEXT PRIMARY KEY,
  label        TEXT NOT NULL,
  category     TEXT NOT NULL,
  is_sensitive BOOLEAN NOT NULL DEFAULT false
);

CREATE TABLE role_permissions (
  role_id        UUID NOT NULL REFERENCES roles(id) ON DELETE CASCADE,
  permission_key TEXT NOT NULL REFERENCES permissions(key),
  scope          TEXT NOT NULL DEFAULT 'all' CHECK (scope IN ('own', 'linked', 'all')),
  PRIMARY KEY (role_id, permission_key)
);

CREATE TABLE user_roles (
  user_id    UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  role_id    UUID NOT NULL REFERENCES roles(id) ON DELETE CASCADE,
  granted_by UUID REFERENCES users(id),
  granted_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (user_id, role_id)
);

CREATE TABLE user_sessions (
  id                 UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id            UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  refresh_token_hash TEXT UNIQUE NOT NULL,
  user_agent         TEXT,
  created_at         TIMESTAMPTZ NOT NULL DEFAULT now(),
  expires_at         TIMESTAMPTZ NOT NULL,
  revoked_at         TIMESTAMPTZ
);
CREATE INDEX user_sessions_user_idx ON user_sessions (user_id);

CREATE TABLE invitations (
  id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  email            TEXT NOT NULL,
  role_id          UUID NOT NULL REFERENCES roles(id),
  token_hash       TEXT UNIQUE NOT NULL,
  invited_by       UUID NOT NULL REFERENCES users(id),
  created_at       TIMESTAMPTZ NOT NULL DEFAULT now(),
  expires_at       TIMESTAMPTZ NOT NULL,
  accepted_at      TIMESTAMPTZ,
  accepted_user_id UUID REFERENCES users(id)
);

-- bump a cada mutacao de RBAC -> invalida cache do resolver (design B.5)
CREATE TABLE rbac_meta (
  id      INT PRIMARY KEY CHECK (id = 1),
  version BIGINT NOT NULL
);
INSERT INTO rbac_meta (id, version) VALUES (1, 1);

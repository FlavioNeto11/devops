-- Fase 2 — portais por perfil (docs/evolution/08 + apendice C). Vinculo p/ escopo
-- `linked` (advogado/juiz veem so os titulos concedidos pelo Gestor) + termos versionados.

CREATE TABLE title_access_grants (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  title_id    UUID NOT NULL REFERENCES security_title(id) ON DELETE CASCADE,
  user_id     UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  granted_by  UUID REFERENCES users(id),
  granted_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  revoked_at  TIMESTAMPTZ,
  purpose     TEXT NOT NULL DEFAULT 'audit',
  UNIQUE (title_id, user_id)
);
CREATE INDEX title_access_grants_user_idx ON title_access_grants (user_id) WHERE revoked_at IS NULL;

-- Termos versionados + aceite (investidor aceita antes de contratar/alugar)
CREATE TABLE terms_document (
  id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  kind       TEXT NOT NULL,                    -- 'investor_terms' | 'lease_terms'
  version    INT NOT NULL,
  title      TEXT NOT NULL,
  body       TEXT NOT NULL,
  active     BOOLEAN NOT NULL DEFAULT false,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (kind, version)
);
CREATE UNIQUE INDEX terms_document_one_active ON terms_document (kind) WHERE active;

CREATE TABLE terms_acceptance (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id     UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  terms_id    UUID NOT NULL REFERENCES terms_document(id),
  accepted_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  ip_hash     TEXT,
  UNIQUE (user_id, terms_id)
);

-- flag global de go-live (gate regulatorio, Fase 4 preenche os itens). Enquanto false,
-- o app opera em modo DEMONSTRACAO (watermark; sem valor mobiliario ofertado).
INSERT INTO system_parameters (key, value) VALUES ('go_live_enabled', 'false'::jsonb)
ON CONFLICT (key) DO NOTHING;

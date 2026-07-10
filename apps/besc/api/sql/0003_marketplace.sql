-- Fase 1 — dominio de tokenizacao OFF-CHAIN (docs/evolution/02, 03, 04 + apendice B).
-- Titulo -> parametro (versionado) -> emissao (lote) -> contrato (valor TRAVADO) ->
-- aluguel / substituicao; maquina de estado juridico do titulo com 7 estados.
-- Tudo simulado (SimulatedLedgerAdapter); nada on-chain nesta fase.

-- ---------- Titulo (ativo do marketplace; ponte soft ao case do store JSON) ----------
CREATE TABLE security_title (
  id                   UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  case_id              TEXT UNIQUE NOT NULL,        -- ref soft ao case (store JSON)
  label                TEXT NOT NULL,
  share_class          TEXT NOT NULL,               -- ON|PNA|PNB|unknown (enum do dominio)
  share_quantity       BIGINT NOT NULL CHECK (share_quantity > 0),
  legal_status         TEXT NOT NULL DEFAULT 'unjudged'
    CHECK (legal_status IN ('unjudged','ruled_favorable','ruled_against','under_appeal','reinstated','defeated','archived')),
  listing_status       TEXT NOT NULL DEFAULT 'draft'
    CHECK (listing_status IN ('draft','listed','delisted')),
  eligibility_snapshot JSONB NOT NULL,              -- case.status + risk + docPct no cadastro
  eligibility_override BOOLEAN NOT NULL DEFAULT false,
  created_by           UUID REFERENCES users(id),
  created_at           TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at           TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- disponibilidade DERIVADA (nunca coluna editavel): estados que aceitam nova contratacao
CREATE OR REPLACE FUNCTION title_available(p_legal TEXT, p_listing TEXT) RETURNS BOOLEAN AS $$
  SELECT p_legal IN ('unjudged','ruled_favorable','reinstated') AND p_listing = 'listed';
$$ LANGUAGE sql IMMUTABLE;

-- ---------- Serie temporal de valor de mercado (APPEND-ONLY) ----------
CREATE TABLE market_valuation (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  title_id        UUID NOT NULL REFERENCES security_title(id) ON DELETE CASCADE,
  value_per_share NUMERIC(18,2) NOT NULL CHECK (value_per_share > 0),
  currency        CHAR(3) NOT NULL DEFAULT 'BRL',
  valuation_date  DATE NOT NULL,
  source          TEXT NOT NULL DEFAULT 'manual',   -- manual|pericia|market_feed
  evidence_ref    JSONB,
  notes           TEXT,
  created_by      UUID REFERENCES users(id),
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX market_valuation_title_idx ON market_valuation (title_id, valuation_date DESC);

-- ---------- Parametro de tokenizacao (versionado; 1 active por titulo) ----------
CREATE TABLE tokenization_parameter (
  id                    UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  title_id              UUID NOT NULL REFERENCES security_title(id) ON DELETE CASCADE,
  version               INT NOT NULL,
  tokens_per_share      INT NOT NULL CHECK (tokens_per_share > 0),  -- fator; imutavel pos-1a emissao
  unit_face_value       NUMERIC(18,2) NOT NULL CHECK (unit_face_value > 0),
  currency              CHAR(3) NOT NULL DEFAULT 'BRL',
  based_on_valuation_id UUID REFERENCES market_valuation(id),
  status                TEXT NOT NULL DEFAULT 'draft'
    CHECK (status IN ('draft','active','superseded')),
  effective_from        TIMESTAMPTZ,
  effective_to          TIMESTAMPTZ,
  created_by            UUID REFERENCES users(id),
  approved_by           UUID REFERENCES users(id),
  created_at            TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (title_id, version)
);
-- no maximo 1 parametro `active` por titulo
CREATE UNIQUE INDEX tokenization_parameter_one_active ON tokenization_parameter (title_id) WHERE status = 'active';

-- ---------- Emissao (lote) ----------
CREATE TABLE token_batch (
  id                          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  title_id                    UUID NOT NULL REFERENCES security_title(id) ON DELETE CASCADE,
  parameter_id                UUID NOT NULL REFERENCES tokenization_parameter(id),
  quantity                    BIGINT NOT NULL CHECK (quantity > 0),
  unit_face_value_at_issuance NUMERIC(18,2) NOT NULL,
  chain_network               TEXT NOT NULL DEFAULT 'sim',
  chain_contract_address      TEXT,
  chain_tx_hash               TEXT,
  ledger_sync_state           TEXT NOT NULL DEFAULT 'pending'
    CHECK (ledger_sync_state IN ('pending','confirmed','failed')),
  status                      TEXT NOT NULL DEFAULT 'pending'
    CHECK (status IN ('pending','minted','failed','burned')),
  issued_at                   TIMESTAMPTZ,
  created_by                  UUID REFERENCES users(id),
  created_at                  TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- ---------- Carteiras + posicao fungivel por lote ----------
CREATE TABLE wallets (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id       UUID REFERENCES users(id),          -- NULL apenas na treasury do emissor
  kind          TEXT NOT NULL DEFAULT 'custodial'
    CHECK (kind IN ('custodial','external','treasury')),
  chain_address TEXT,
  label         TEXT,
  status        TEXT NOT NULL DEFAULT 'active',
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE wallet_position (
  wallet_id UUID NOT NULL REFERENCES wallets(id),
  batch_id  UUID NOT NULL REFERENCES token_batch(id),
  quantity  BIGINT NOT NULL CHECK (quantity >= 0),
  PRIMARY KEY (wallet_id, batch_id)
);

-- ledger interno append-only (mint/transfer/substitute); wallet_position e a projecao
CREATE TABLE token_movement (
  id           BIGSERIAL PRIMARY KEY,
  batch_id     UUID NOT NULL REFERENCES token_batch(id),
  from_wallet  UUID REFERENCES wallets(id),
  to_wallet    UUID REFERENCES wallets(id),
  quantity     BIGINT NOT NULL CHECK (quantity > 0),
  reason       TEXT NOT NULL,                        -- mint|transfer|substitute_burn|substitute_mint
  contract_id  UUID,
  occurred_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  actor_user_id UUID REFERENCES users(id)
);

-- ---------- Contrato de token (valor de face TRAVADO; imutavel exceto status/close) ----------
CREATE TABLE contract_substitution (
  id                   UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  old_contract_id      UUID UNIQUE NOT NULL,
  new_contract_id      UUID UNIQUE,
  reason               TEXT NOT NULL DEFAULT 'title_defeated',
  preserved_face_value NUMERIC(18,2) NOT NULL,
  residual_value       NUMERIC(18,2) NOT NULL DEFAULT 0,
  decided_by_user      BOOLEAN NOT NULL DEFAULT false,
  executed_at          TIMESTAMPTZ,
  executed_by          UUID REFERENCES users(id)
);

CREATE TABLE token_contract (
  id                     UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  contract_number        TEXT UNIQUE NOT NULL,
  holder_user_id         UUID NOT NULL REFERENCES users(id),
  wallet_id              UUID NOT NULL REFERENCES wallets(id),
  title_id               UUID NOT NULL REFERENCES security_title(id),
  batch_id               UUID NOT NULL REFERENCES token_batch(id),
  parameter_id           UUID NOT NULL REFERENCES tokenization_parameter(id),
  quantity               BIGINT NOT NULL CHECK (quantity > 0),
  unit_face_value_frozen NUMERIC(18,2) NOT NULL CHECK (unit_face_value_frozen > 0),
  total_face_value       NUMERIC(18,2) NOT NULL,
  currency               CHAR(3) NOT NULL DEFAULT 'BRL',
  purpose                TEXT NOT NULL DEFAULT 'purchase'
    CHECK (purpose IN ('purchase','collateral','lease_backing')),
  status                 TEXT NOT NULL DEFAULT 'active'
    CHECK (status IN ('active','suspended','substituted','written_off','settled','terminated')),
  contracted_at          TIMESTAMPTZ NOT NULL DEFAULT now(),
  closed_at              TIMESTAMPTZ,
  substitution_id        UUID REFERENCES contract_substitution(id),
  created_by             UUID REFERENCES users(id),
  CONSTRAINT total_matches_frozen CHECK (total_face_value = unit_face_value_frozen * quantity)
);
ALTER TABLE contract_substitution
  ADD CONSTRAINT cs_old_fk FOREIGN KEY (old_contract_id) REFERENCES token_contract(id) DEFERRABLE INITIALLY DEFERRED,
  ADD CONSTRAINT cs_new_fk FOREIGN KEY (new_contract_id) REFERENCES token_contract(id) DEFERRABLE INITIALLY DEFERRED;

-- Defesa em profundidade: nenhuma coluna monetaria/quantidade do contrato muda apos criado.
-- So status/closed_at/substitution_id evoluem (correcao = estorno, nunca UPDATE de valor).
CREATE OR REPLACE FUNCTION token_contract_freeze() RETURNS trigger AS $$
BEGIN
  IF NEW.unit_face_value_frozen <> OLD.unit_face_value_frozen
     OR NEW.total_face_value <> OLD.total_face_value
     OR NEW.quantity <> OLD.quantity
     OR NEW.parameter_id <> OLD.parameter_id THEN
    RAISE EXCEPTION 'token_contract: valor/quantidade travados são imutáveis (correção = estorno)';
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;
CREATE TRIGGER token_contract_freeze_trg
  BEFORE UPDATE ON token_contract
  FOR EACH ROW EXECUTE FUNCTION token_contract_freeze();

-- ---------- Historico juridico do titulo (APPEND-ONLY; verdade da maquina) ----------
CREATE TABLE legal_status_history (
  id            BIGSERIAL PRIMARY KEY,
  title_id      UUID NOT NULL REFERENCES security_title(id) ON DELETE CASCADE,
  from_status   TEXT NOT NULL,
  to_status     TEXT NOT NULL,
  reason        TEXT NOT NULL,
  evidence_ref  JSONB,
  source        TEXT NOT NULL DEFAULT 'manual',      -- manual|court_integration
  actor_user_id UUID REFERENCES users(id),
  occurred_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX legal_status_history_title_idx ON legal_status_history (title_id, id);

-- ---------- Parametros do sistema (chave/valor tipado, versionado) ----------
CREATE TABLE system_parameters (
  key         TEXT PRIMARY KEY,
  value       JSONB NOT NULL,
  updated_by  UUID REFERENCES users(id),
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);
INSERT INTO system_parameters (key, value) VALUES
  ('resolution_window_days', '30'::jsonb),
  ('default_resolution', '"write_off"'::jsonb)
ON CONFLICT (key) DO NOTHING;

-- ---------- Outbox transacional p/ o ledger (dispatcher idempotente) ----------
CREATE TABLE ledger_outbox (
  id              BIGSERIAL PRIMARY KEY,
  operation       TEXT NOT NULL,
  params          JSONB NOT NULL,
  idempotency_key UUID NOT NULL UNIQUE DEFAULT gen_random_uuid(),
  state           TEXT NOT NULL DEFAULT 'pending'
    CHECK (state IN ('pending','submitted','confirmed','failed','abandoned')),
  attempts        INT NOT NULL DEFAULT 0,
  ledger_tx_hash  TEXT,
  chain_id        TEXT,
  block_number    BIGINT,
  last_error      TEXT,
  entity_type     TEXT,
  entity_id       TEXT,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX ledger_outbox_pending_idx ON ledger_outbox (state, id) WHERE state IN ('pending','submitted');

-- ---------- SimulatedLedgerAdapter: estado + txs deterministicas ----------
CREATE TABLE sim_ledger_tx (
  tx_hash      TEXT PRIMARY KEY,                    -- sha256(operacao canonica) — determinismo
  block_number BIGSERIAL,
  chain_id     TEXT NOT NULL DEFAULT 'sim:1',
  operation    TEXT NOT NULL,
  params       JSONB NOT NULL,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE TABLE sim_ledger_state (
  title_id   UUID PRIMARY KEY,
  paused     BOOLEAN NOT NULL DEFAULT false,
  total_supply BIGINT NOT NULL DEFAULT 0
);

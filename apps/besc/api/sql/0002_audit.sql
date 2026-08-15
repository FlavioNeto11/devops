-- Fase 0 — trilha de auditoria imutavel (docs/evolution/07-trilha-auditoria.md).
-- Hash-chain SHA-256 calculada NO BANCO (append_audit_event, advisory xact lock);
-- imutabilidade por trigger (nenhum UPDATE/DELETE passa, nem de superuser distraido).
CREATE EXTENSION IF NOT EXISTS pgcrypto;

CREATE TABLE audit_event (
  id             BIGSERIAL PRIMARY KEY,
  event_uid      UUID NOT NULL UNIQUE DEFAULT gen_random_uuid(),
  occurred_at    TIMESTAMPTZ NOT NULL,
  recorded_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  actor_user_id  UUID,
  actor_role     TEXT NOT NULL,
  actor_ip_hash  TEXT,
  event_type     TEXT NOT NULL,
  entity_type    TEXT NOT NULL,
  entity_id      TEXT NOT NULL,
  payload        JSONB NOT NULL,
  schema_version SMALLINT NOT NULL DEFAULT 1,
  payload_hash   TEXT NOT NULL,
  prev_hash      TEXT NOT NULL,
  event_hash     TEXT NOT NULL
);
CREATE INDEX audit_event_entity_idx ON audit_event (entity_type, entity_id);
CREATE INDEX audit_event_type_time_idx ON audit_event (event_type, occurred_at);
CREATE INDEX audit_event_actor_idx ON audit_event (actor_user_id, occurred_at);

CREATE OR REPLACE FUNCTION raise_immutable() RETURNS trigger AS $$
BEGIN
  RAISE EXCEPTION 'audit_event é append-only (imutável): % negado', TG_OP;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER audit_event_immutable
  BEFORE UPDATE OR DELETE ON audit_event
  FOR EACH ROW EXECUTE FUNCTION raise_immutable();

-- Escrita canonica da cadeia. Encoding do pre-hash (normativo, schema_version=1):
--   sha256( prev_hash || '|' || id || '|' || event_uid || '|' ||
--           to_char(occurred_at AT TIME ZONE 'UTC','YYYY-MM-DD"T"HH24:MI:SS.US"Z"') || '|' ||
--           event_type || '|' || entity_type || '|' || entity_id || '|' || payload_hash )
-- payload_hash = sha256(payload::text) — jsonb normaliza a ordem das chaves (determinístico).
CREATE OR REPLACE FUNCTION append_audit_event(
  p_occurred_at   TIMESTAMPTZ,
  p_actor_user_id UUID,
  p_actor_role    TEXT,
  p_actor_ip_hash TEXT,
  p_event_type    TEXT,
  p_entity_type   TEXT,
  p_entity_id     TEXT,
  p_payload       JSONB
) RETURNS BIGINT AS $$
DECLARE
  v_id           BIGINT;
  v_uid          UUID := gen_random_uuid();
  v_prev         TEXT;
  v_payload_hash TEXT;
  v_event_hash   TEXT;
  v_occurred     TIMESTAMPTZ := COALESCE(p_occurred_at, now());
BEGIN
  -- serializa a cadeia (prev_hash sem corrida) dentro da transacao corrente
  PERFORM pg_advisory_xact_lock(77223302);
  SELECT event_hash INTO v_prev FROM audit_event ORDER BY id DESC LIMIT 1;
  IF v_prev IS NULL THEN
    v_prev := repeat('0', 64); -- genesis
  END IF;
  v_id := nextval(pg_get_serial_sequence('audit_event', 'id'));
  v_payload_hash := encode(digest(p_payload::text, 'sha256'), 'hex');
  v_event_hash := encode(digest(
    v_prev || '|' || v_id::text || '|' || v_uid::text || '|' ||
    to_char(v_occurred AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.US"Z"') || '|' ||
    p_event_type || '|' || p_entity_type || '|' || p_entity_id || '|' || v_payload_hash,
    'sha256'), 'hex');
  INSERT INTO audit_event (id, event_uid, occurred_at, actor_user_id, actor_role, actor_ip_hash,
                           event_type, entity_type, entity_id, payload, payload_hash, prev_hash, event_hash)
  VALUES (v_id, v_uid, v_occurred, p_actor_user_id, p_actor_role, p_actor_ip_hash,
          p_event_type, p_entity_type, p_entity_id, p_payload, v_payload_hash, v_prev, v_event_hash);
  RETURN v_id;
END;
$$ LANGUAGE plpgsql;

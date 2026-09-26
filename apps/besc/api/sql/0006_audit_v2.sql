-- ADR-010 / Passo 14 — trilha de auditoria v2.
-- Toda alteração crítica registra: ator, ação, entidade, hash anterior, hash do payload, instante,
-- FONTE, MOTIVO e REFERÊNCIA DE EVIDÊNCIA. Correção = novo evento que aponta o evento corrigido
-- (corrects_event_uid); nunca UPDATE. A cadeia v1 continua válida e a v2 encadeia sobre ela.

ALTER TABLE audit_event
  ADD COLUMN source             TEXT,
  ADD COLUMN reason             TEXT,
  ADD COLUMN evidence_ref       TEXT,
  ADD COLUMN corrects_event_uid UUID REFERENCES audit_event (event_uid);

-- Mensagem genérica para qualquer tabela append-only (nomeia a tabela e a operação).
CREATE OR REPLACE FUNCTION raise_append_only() RETURNS trigger AS $$
BEGIN
  RAISE EXCEPTION '% é append-only (imutável): % negado', TG_TABLE_NAME, TG_OP;
END;
$$ LANGUAGE plpgsql;

-- TRUNCATE não dispara trigger de linha: sem este trigger a trilha podia ser zerada.
CREATE TRIGGER audit_event_no_truncate
  BEFORE TRUNCATE ON audit_event
  FOR EACH STATEMENT EXECUTE FUNCTION raise_append_only();

-- Pré-imagem canônica v2: jsonb ordena as chaves e codifica NULL explicitamente, então NULL e ''
-- produzem hashes diferentes (um adulterador não "apaga" um campo sem quebrar a cadeia).
CREATE OR REPLACE FUNCTION audit_v2_preimage(
  p_prev TEXT, p_id BIGINT, p_uid UUID, p_occurred TIMESTAMPTZ,
  p_actor UUID, p_role TEXT, p_ip TEXT, p_type TEXT, p_entity TEXT, p_entity_id TEXT,
  p_payload_hash TEXT, p_source TEXT, p_reason TEXT, p_evidence_ref TEXT, p_corrects UUID
) RETURNS TEXT AS $$
  SELECT jsonb_build_object(
    'v', 2, 'prev', p_prev, 'id', p_id, 'uid', p_uid,
    'at', to_char(p_occurred AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.US"Z"'),
    'actor', p_actor, 'role', p_role, 'ip', p_ip,
    'type', p_type, 'entity', p_entity, 'entity_id', p_entity_id,
    'payload_hash', p_payload_hash, 'source', p_source, 'reason', p_reason,
    'evidence_ref', p_evidence_ref, 'corrects', p_corrects
  )::text;
$$ LANGUAGE sql IMMUTABLE;

-- Escrita v2. Mesma trava consultiva da v1 (77223302): os dois escritores serializam juntos
-- durante a transição, e prev_hash vem da última linha por id, qualquer que seja a versão.
CREATE OR REPLACE FUNCTION append_audit_event_v2(
  p_occurred_at   TIMESTAMPTZ,
  p_actor_user_id UUID,
  p_actor_role    TEXT,
  p_actor_ip_hash TEXT,
  p_event_type    TEXT,
  p_entity_type   TEXT,
  p_entity_id     TEXT,
  p_payload       JSONB,
  p_source        TEXT,
  p_reason        TEXT,
  p_evidence_ref  TEXT,
  p_corrects_event_uid UUID
) RETURNS TABLE (event_id BIGINT, event_uid UUID, event_hash TEXT) AS $$
DECLARE
  v_id           BIGINT;
  v_uid          UUID := gen_random_uuid();
  v_prev         TEXT;
  v_payload_hash TEXT;
  v_hash         TEXT;
  v_occurred     TIMESTAMPTZ := COALESCE(p_occurred_at, now());
BEGIN
  IF p_source IS NULL OR length(trim(p_source)) = 0 THEN
    RAISE EXCEPTION 'auditoria v2 exige source';
  END IF;
  IF p_corrects_event_uid IS NOT NULL THEN
    IF p_event_type NOT LIKE '%.corrected' THEN
      RAISE EXCEPTION 'evento que corrige outro deve ser do tipo *.corrected (recebido: %)', p_event_type;
    END IF;
    IF p_reason IS NULL OR length(trim(p_reason)) < 10 THEN
      RAISE EXCEPTION 'correção exige motivo (mín. 10 caracteres)';
    END IF;
  END IF;
  PERFORM pg_advisory_xact_lock(77223302);
  SELECT a.event_hash INTO v_prev FROM audit_event a ORDER BY a.id DESC LIMIT 1;
  IF v_prev IS NULL THEN
    v_prev := repeat('0', 64);
  END IF;
  v_id := nextval(pg_get_serial_sequence('audit_event', 'id'));
  v_payload_hash := encode(digest(p_payload::text, 'sha256'), 'hex');
  v_hash := encode(digest(audit_v2_preimage(
    v_prev, v_id, v_uid, v_occurred, p_actor_user_id, p_actor_role, p_actor_ip_hash,
    p_event_type, p_entity_type, p_entity_id, v_payload_hash, p_source, p_reason, p_evidence_ref, p_corrects_event_uid
  ), 'sha256'), 'hex');
  INSERT INTO audit_event (id, event_uid, occurred_at, actor_user_id, actor_role, actor_ip_hash,
                           event_type, entity_type, entity_id, payload, schema_version, payload_hash,
                           prev_hash, event_hash, source, reason, evidence_ref, corrects_event_uid)
  VALUES (v_id, v_uid, v_occurred, p_actor_user_id, p_actor_role, p_actor_ip_hash,
          p_event_type, p_entity_type, p_entity_id, p_payload, 2, v_payload_hash,
          v_prev, v_hash, p_source, p_reason, p_evidence_ref, p_corrects_event_uid);
  RETURN QUERY SELECT v_id, v_uid, v_hash;
END;
$$ LANGUAGE plpgsql;

-- Verificador da cadeia no banco (a microsegundo, como foi hasheado). Recalcula payload_hash,
-- encadeamento e event_hash por schema_version e devolve o primeiro id quebrado.
CREATE OR REPLACE FUNCTION audit_chain_verify(p_from_id BIGINT DEFAULT NULL)
RETURNS TABLE (checked BIGINT, first_broken_id BIGINT, problem TEXT) AS $$
DECLARE
  r      RECORD;
  v_prev TEXT;
  v_ph   TEXT;
  v_calc TEXT;
  v_n    BIGINT := 0;
BEGIN
  IF p_from_id IS NULL THEN
    v_prev := repeat('0', 64);
  ELSE
    SELECT a.event_hash INTO v_prev FROM audit_event a WHERE a.id < p_from_id ORDER BY a.id DESC LIMIT 1;
    IF v_prev IS NULL THEN v_prev := repeat('0', 64); END IF;
  END IF;
  FOR r IN SELECT * FROM audit_event a WHERE p_from_id IS NULL OR a.id >= p_from_id ORDER BY a.id LOOP
    v_n := v_n + 1;
    IF r.prev_hash IS DISTINCT FROM v_prev THEN
      RETURN QUERY SELECT v_n, r.id, 'prev_hash'::text; RETURN;
    END IF;
    v_ph := encode(digest(r.payload::text, 'sha256'), 'hex');
    IF v_ph IS DISTINCT FROM r.payload_hash THEN
      RETURN QUERY SELECT v_n, r.id, 'payload_hash'::text; RETURN;
    END IF;
    IF r.schema_version = 1 THEN
      v_calc := encode(digest(
        r.prev_hash || '|' || r.id::text || '|' || r.event_uid::text || '|' ||
        to_char(r.occurred_at AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.US"Z"') || '|' ||
        r.event_type || '|' || r.entity_type || '|' || r.entity_id || '|' || r.payload_hash,
        'sha256'), 'hex');
    ELSE
      v_calc := encode(digest(audit_v2_preimage(
        r.prev_hash, r.id, r.event_uid, r.occurred_at, r.actor_user_id, r.actor_role, r.actor_ip_hash,
        r.event_type, r.entity_type, r.entity_id, r.payload_hash, r.source, r.reason, r.evidence_ref, r.corrects_event_uid
      ), 'sha256'), 'hex');
    END IF;
    IF v_calc IS DISTINCT FROM r.event_hash THEN
      RETURN QUERY SELECT v_n, r.id, 'event_hash'::text; RETURN;
    END IF;
    v_prev := r.event_hash;
  END LOOP;
  RETURN QUERY SELECT v_n, NULL::bigint, NULL::text;
END;
$$ LANGUAGE plpgsql;

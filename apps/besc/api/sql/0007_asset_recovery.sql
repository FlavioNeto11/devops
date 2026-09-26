-- ADR-010 — domínio de Legacy Asset Recovery (F1: correção de domínio; F2: ingestão de evidência).
-- As invariantes vivem aqui E no serviço (api/src/recovery/domain/*): o serviço recusa primeiro,
-- com mensagem útil; o banco recusa sempre, mesmo que alguém escreva SQL direto.
--
--   LegacyEvidence != Asset · Claim != Asset · RecognizedRight != RegisteredAsset
--   NO EXTERNAL CONFIRMATION = NO REGISTERED ASSET
--   estado muda SÓ por INSERT em entity_transition (append-only), validado contra
--   allowed_transition (cópia exata de api/src/recovery/domain/model.js)
--
-- O marketplace legado (0003–0005) NÃO é alterado nem apagado: fica como histórico somente leitura.

-- ---------------------------------------------------------------------------------------------
-- Helpers genéricos
-- ---------------------------------------------------------------------------------------------
-- Projeções só mudam de estado dentro do trigger de entity_transition (flag local à transação).
CREATE OR REPLACE FUNCTION recovery_in_transition() RETURNS boolean AS $$
  SELECT coalesce(current_setting('besc.recovery_transition', true), '') = 'on';
$$ LANGUAGE sql STABLE;

-- Bloqueia UPDATE de estado fora do trigger de transição e de colunas imutáveis (lista por TG_ARGV).
CREATE OR REPLACE FUNCTION recovery_guard_update() RETURNS trigger AS $$
DECLARE
  col TEXT;
  o JSONB := to_jsonb(OLD);
  n JSONB := to_jsonb(NEW);
BEGIN
  IF (n -> 'state') IS DISTINCT FROM (o -> 'state') AND NOT recovery_in_transition() THEN
    RAISE EXCEPTION '%: estado só muda por entity_transition (append-only)', TG_TABLE_NAME;
  END IF;
  FOREACH col IN ARRAY TG_ARGV LOOP
    IF (n -> col) IS DISTINCT FROM (o -> col) THEN
      RAISE EXCEPTION '%: coluna % é imutável (correção = novo registro/evento)', TG_TABLE_NAME, col;
    END IF;
  END LOOP;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- ---------------------------------------------------------------------------------------------
-- Gates de governança e quatro-olhos
-- ---------------------------------------------------------------------------------------------
CREATE TABLE approval_request (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  action          TEXT NOT NULL CHECK (action IN ('ASSET_MANUAL_CONFIRMATION', 'CHAIN_OF_TITLE_CHANGE', 'LEGAL_OPINION',
                                                  'RECOGNIZED_VALUATION', 'GATE_CHANGE', 'COLLATERAL_CREATION')),
  subject_type    TEXT NOT NULL,
  subject_id      TEXT NOT NULL,
  payload         JSONB NOT NULL DEFAULT '{}'::jsonb,
  reason          TEXT NOT NULL CHECK (length(trim(reason)) >= 10),
  state           TEXT NOT NULL DEFAULT 'REQUESTED' CHECK (state IN ('REQUESTED', 'IN_REVIEW', 'APPROVED', 'REJECTED', 'CANCELLED')),
  requested_by    UUID NOT NULL,
  requested_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  reviewed_by     UUID,
  reviewed_at     TIMESTAMPTZ,
  review_notes    TEXT,
  approved_by     UUID,
  approved_at     TIMESTAMPTZ,
  decision        TEXT CHECK (decision IN ('APPROVED', 'REJECTED')),
  decision_notes  TEXT,
  CONSTRAINT approval_no_self_review   CHECK (reviewed_by IS NULL OR reviewed_by <> requested_by),
  CONSTRAINT approval_no_self_approval CHECK (approved_by IS NULL OR approved_by <> requested_by),
  CONSTRAINT approval_review_first     CHECK (approved_at IS NULL OR reviewed_at IS NOT NULL),
  CONSTRAINT approval_review_pair      CHECK ((reviewed_at IS NULL) = (reviewed_by IS NULL)),
  CONSTRAINT approval_decision_pair    CHECK ((approved_at IS NULL) = (approved_by IS NULL)),
  CONSTRAINT approval_decision_actor   CHECK (decision IS NULL OR approved_by IS NOT NULL),
  CONSTRAINT approval_state_decision   CHECK ((state IN ('APPROVED', 'REJECTED')) = (decision IS NOT NULL))
);
CREATE INDEX approval_request_subject_idx ON approval_request (subject_type, subject_id);

CREATE OR REPLACE FUNCTION approval_request_guard() RETURNS trigger AS $$
BEGIN
  IF OLD.decision IS NOT NULL OR OLD.state = 'CANCELLED' THEN
    RAISE EXCEPTION 'approval_request %: pedido decidido/cancelado é imutável', OLD.id;
  END IF;
  IF NEW.action <> OLD.action OR NEW.subject_type <> OLD.subject_type OR NEW.subject_id <> OLD.subject_id
     OR NEW.payload <> OLD.payload OR NEW.reason <> OLD.reason OR NEW.requested_by <> OLD.requested_by
     OR NEW.requested_at <> OLD.requested_at THEN
    RAISE EXCEPTION 'approval_request %: conteúdo do pedido é imutável', OLD.id;
  END IF;
  IF NOT ((OLD.state = 'REQUESTED' AND NEW.state IN ('IN_REVIEW', 'CANCELLED'))
       OR (OLD.state = 'IN_REVIEW' AND NEW.state IN ('APPROVED', 'REJECTED', 'CANCELLED'))) THEN
    RAISE EXCEPTION 'approval_request %: transição % -> % inválida', OLD.id, OLD.state, NEW.state;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;
CREATE TRIGGER approval_request_guard_trg BEFORE UPDATE ON approval_request FOR EACH ROW EXECUTE FUNCTION approval_request_guard();
CREATE TRIGGER approval_request_no_delete BEFORE DELETE ON approval_request FOR EACH ROW EXECUTE FUNCTION raise_append_only();
CREATE TRIGGER approval_request_no_truncate BEFORE TRUNCATE ON approval_request FOR EACH STATEMENT EXECUTE FUNCTION raise_append_only();

CREATE TABLE governance_gate (
  key                    TEXT PRIMARY KEY,
  state                  TEXT NOT NULL CHECK (state IN ('CLOSED', 'OPEN')),
  purpose                TEXT NOT NULL,
  changed_by_approval_id UUID UNIQUE REFERENCES approval_request (id),
  updated_at             TIMESTAMPTZ NOT NULL DEFAULT now()
);
-- Escala multi-emissor NÃO comprovada (repo besc, docs/reconciliation/12): nasce fechado.
INSERT INTO governance_gate (key, state, purpose)
VALUES ('multi_issuer_research_gate', 'CLOSED', 'aceitar Claims de origens além da família BESC');

CREATE OR REPLACE FUNCTION governance_gate_guard() RETURNS trigger AS $$
DECLARE
  a approval_request%ROWTYPE;
BEGIN
  IF NEW.key <> OLD.key OR NEW.purpose <> OLD.purpose THEN
    RAISE EXCEPTION 'governance_gate: chave e propósito são imutáveis';
  END IF;
  SELECT * INTO a FROM approval_request WHERE id = NEW.changed_by_approval_id;
  -- IS DISTINCT FROM (não <>): com decision NULL, '<>' daria NULL e o IF deixaria passar um pedido não aprovado
  IF NOT FOUND OR a.action IS DISTINCT FROM 'GATE_CHANGE' OR a.decision IS DISTINCT FROM 'APPROVED' OR a.subject_id IS DISTINCT FROM NEW.key
     OR a.reviewed_by IS NULL OR a.approved_by IS NULL OR a.reviewed_by = a.requested_by OR a.approved_by = a.requested_by
     OR (a.payload ->> 'toState') IS DISTINCT FROM NEW.state THEN
    RAISE EXCEPTION 'governance_gate %: mudança exige aprovação quatro-olhos GATE_CHANGE aprovada para este gate e estado', NEW.key;
  END IF;
  IF NEW.changed_by_approval_id IS NOT DISTINCT FROM OLD.changed_by_approval_id THEN
    RAISE EXCEPTION 'governance_gate %: aprovação já utilizada', NEW.key;
  END IF;
  NEW.updated_at := now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;
CREATE TRIGGER governance_gate_guard_trg BEFORE UPDATE ON governance_gate FOR EACH ROW EXECUTE FUNCTION governance_gate_guard();
CREATE TRIGGER governance_gate_no_delete BEFORE DELETE ON governance_gate FOR EACH ROW EXECUTE FUNCTION raise_append_only();
CREATE TRIGGER governance_gate_no_truncate BEFORE TRUNCATE ON governance_gate FOR EACH STATEMENT EXECUTE FUNCTION raise_append_only();

-- ---------------------------------------------------------------------------------------------
-- PII segregada: nome e documento do reclamante vivem SÓ aqui. Tudo o mais usa claimant_id.
-- ---------------------------------------------------------------------------------------------
CREATE TABLE claimant (
  id             UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  person_type    TEXT NOT NULL CHECK (person_type IN ('PF', 'PJ', 'ESTATE', 'UNKNOWN')),
  display_name   TEXT NOT NULL,
  tax_id         TEXT,
  contact        TEXT,
  legacy_case_id TEXT UNIQUE,
  created_at     TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_by     UUID
);
CREATE TRIGGER claimant_no_truncate BEFORE TRUNCATE ON claimant FOR EACH STATEMENT EXECUTE FUNCTION raise_append_only();

-- ---------------------------------------------------------------------------------------------
-- Evidence (LegacyEvidence = evidence_class LEGACY_EVIDENCE). Conteúdo imutável; nunca apagada.
-- EXTERNAL_EVIDENCE é o documento vindo do system of record (extrato, ofício, certidão): é a
-- ÚNICA classe aceita como evidência de ExternalConfirmation — um extrato enviado pelo reclamante
-- é LEGACY_EVIDENCE e não confirma nada.
-- ---------------------------------------------------------------------------------------------
CREATE TABLE evidence (
  id                   UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  evidence_class       TEXT NOT NULL CHECK (evidence_class IN ('LEGACY_EVIDENCE', 'EXTERNAL_EVIDENCE', 'OPINION', 'INTERNAL')),
  origin               TEXT NOT NULL CHECK (origin IN ('CLAIMANT_UPLOAD', 'OPERATOR_UPLOAD', 'LEGACY_CASE_MIGRATION', 'EXTERNAL_SYSTEM')),
  claimant_id          UUID REFERENCES claimant (id),
  legacy_case_id       TEXT,
  legacy_doc_key       TEXT,
  original_filename    TEXT,
  mime                 TEXT,
  size_bytes           BIGINT,
  storage_uri          TEXT,
  sha256               CHAR(64),
  hash_status          TEXT NOT NULL CHECK (hash_status IN ('HASHED', 'FILE_MISSING')),
  duplicate_of         UUID REFERENCES evidence (id),
  state                TEXT NOT NULL DEFAULT 'RECEIVED' CHECK (state IN ('RECEIVED', 'CLASSIFIED', 'LINKED', 'SUSPECT', 'ARCHIVED')),
  received_at          TIMESTAMPTZ NOT NULL DEFAULT now(),
  received_by          UUID,
  CONSTRAINT evidence_hash_consistent CHECK ((hash_status = 'HASHED') = (sha256 IS NOT NULL))
);
-- Antifraude: o mesmo arquivo só existe uma vez como original; cópias exigem duplicate_of.
CREATE UNIQUE INDEX evidence_sha256_original_uniq ON evidence (sha256) WHERE sha256 IS NOT NULL AND duplicate_of IS NULL;
CREATE INDEX evidence_claimant_idx ON evidence (claimant_id);
CREATE INDEX evidence_legacy_case_idx ON evidence (legacy_case_id);

CREATE OR REPLACE FUNCTION evidence_insert_guard() RETURNS trigger AS $$
BEGIN
  IF NEW.state <> 'RECEIVED' THEN RAISE EXCEPTION 'evidence: nasce em RECEIVED'; END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;
CREATE TRIGGER evidence_insert_guard_trg BEFORE INSERT ON evidence FOR EACH ROW EXECUTE FUNCTION evidence_insert_guard();
CREATE TRIGGER evidence_guard_update BEFORE UPDATE ON evidence FOR EACH ROW EXECUTE FUNCTION recovery_guard_update(
  'evidence_class', 'origin', 'claimant_id', 'legacy_case_id', 'legacy_doc_key', 'original_filename', 'mime', 'size_bytes',
  'storage_uri', 'sha256', 'hash_status', 'duplicate_of', 'received_at', 'received_by');
CREATE TRIGGER evidence_no_delete BEFORE DELETE ON evidence FOR EACH ROW EXECUTE FUNCTION raise_append_only();
CREATE TRIGGER evidence_no_truncate BEFORE TRUNCATE ON evidence FOR EACH STATEMENT EXECUTE FUNCTION raise_append_only();

-- Classificação é append-only: reclassificar = nova linha que supera a anterior (correção).
CREATE TABLE evidence_classification (
  id                     UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  evidence_id            UUID NOT NULL REFERENCES evidence (id),
  document_kind          TEXT NOT NULL CHECK (document_kind IN ('CERTIFICATE', 'OLD_STATEMENT', 'DIVIDEND_NOTICE', 'COURT_DECISION', 'PROBATE',
                                                                'ASSIGNMENT_CONTRACT', 'PRIVATE_APPRAISAL', 'POWER_OF_ATTORNEY', 'IDENTITY',
                                                                'CORRESPONDENCE', 'OTHER')),
  source_nature          TEXT NOT NULL,
  origin_candidate       TEXT,
  security_class_written TEXT,
  certificate_number     TEXT,
  quantity_written       TEXT,
  document_date_written  TEXT,
  notes                  TEXT,
  supersedes_id          UUID UNIQUE REFERENCES evidence_classification (id),
  reason                 TEXT,
  classified_by          UUID,
  classified_at          TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT classification_correction_reason CHECK (supersedes_id IS NULL OR length(trim(coalesce(reason, ''))) >= 10)
);
CREATE INDEX evidence_classification_evidence_idx ON evidence_classification (evidence_id);
CREATE INDEX evidence_classification_cert_idx ON evidence_classification (origin_candidate, certificate_number);
CREATE TRIGGER evidence_classification_immutable BEFORE UPDATE OR DELETE ON evidence_classification FOR EACH ROW EXECUTE FUNCTION raise_append_only();
CREATE TRIGGER evidence_classification_no_truncate BEFORE TRUNCATE ON evidence_classification FOR EACH STATEMENT EXECUTE FUNCTION raise_append_only();

-- ---------------------------------------------------------------------------------------------
-- Claim (possível direito). Conteúdo imutável; correção = novo Claim que supera o anterior.
-- ---------------------------------------------------------------------------------------------
CREATE TABLE claim (
  id                          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  claimant_id                 UUID NOT NULL REFERENCES claimant (id),
  asset_origin_id             TEXT NOT NULL,
  claim_kind                  TEXT NOT NULL CHECK (claim_kind IN ('BOOK_ENTRY_POSITION', 'UNCONVERTED_POSITION', 'UNPAID_PROCEEDS',
                                                                  'FRACTION_PROCEEDS', 'DAMAGES', 'UNKNOWN')),
  claimed_security_class      TEXT,
  claimed_quantity_written    TEXT,
  legacy_case_id              TEXT UNIQUE,
  legacy_status               TEXT,
  supersedes_claim_id         UUID REFERENCES claim (id),
  state                       TEXT NOT NULL DEFAULT 'DRAFT' CHECK (state IN ('DRAFT', 'OPEN', 'EVIDENCE_GATHERING', 'UNDER_ANALYSIS', 'VALIDATION_REQUESTED',
                                                                            'INCONCLUSIVE', 'LITIGATION', 'RECOGNIZED', 'REJECTED', 'WITHDRAWN')),
  created_at                  TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_by                  UUID
);
CREATE INDEX claim_claimant_idx ON claim (claimant_id);

CREATE OR REPLACE FUNCTION claim_insert_guard() RETURNS trigger AS $$
DECLARE
  g TEXT;
BEGIN
  IF NEW.state <> 'DRAFT' THEN RAISE EXCEPTION 'claim: nasce em DRAFT'; END IF;
  SELECT state INTO g FROM governance_gate WHERE key = 'multi_issuer_research_gate';
  IF NEW.asset_origin_id <> 'BESC' AND g IS DISTINCT FROM 'OPEN' THEN
    RAISE EXCEPTION 'claim: multi_issuer_research_gate CLOSED — origem % não aceita', NEW.asset_origin_id;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;
CREATE TRIGGER claim_insert_guard_trg BEFORE INSERT ON claim FOR EACH ROW EXECUTE FUNCTION claim_insert_guard();
CREATE TRIGGER claim_guard_update BEFORE UPDATE ON claim FOR EACH ROW EXECUTE FUNCTION recovery_guard_update(
  'claimant_id', 'asset_origin_id', 'claim_kind', 'claimed_security_class', 'claimed_quantity_written',
  'legacy_case_id', 'legacy_status', 'supersedes_claim_id', 'created_at', 'created_by');
CREATE TRIGGER claim_no_delete BEFORE DELETE ON claim FOR EACH ROW EXECUTE FUNCTION raise_append_only();
CREATE TRIGGER claim_no_truncate BEFORE TRUNCATE ON claim FOR EACH STATEMENT EXECUTE FUNCTION raise_append_only();

CREATE TABLE claim_evidence (
  claim_id    UUID NOT NULL REFERENCES claim (id),
  evidence_id UUID NOT NULL REFERENCES evidence (id),
  role        TEXT NOT NULL DEFAULT 'SUPPORTING' CHECK (role IN ('SUPPORTING', 'IDENTITY', 'SUCCESSION', 'ASSIGNMENT', 'CONTRARY')),
  linked_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
  linked_by   UUID,
  PRIMARY KEY (claim_id, evidence_id)
);
CREATE TRIGGER claim_evidence_immutable BEFORE UPDATE OR DELETE ON claim_evidence FOR EACH ROW EXECUTE FUNCTION raise_append_only();
CREATE TRIGGER claim_evidence_no_truncate BEFORE TRUNCATE ON claim_evidence FOR EACH STATEMENT EXECUTE FUNCTION raise_append_only();

-- ---------------------------------------------------------------------------------------------
-- ExternalConfirmation (confirmação externa) e ClaimValidation
-- ---------------------------------------------------------------------------------------------
CREATE TABLE external_confirmation (
  id                 UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  purpose            TEXT NOT NULL CHECK (purpose IN ('RIGHT_RECOGNITION', 'REGISTRATION')),
  subject_type       TEXT NOT NULL CHECK (subject_type IN ('claim', 'registration_request')),
  subject_id         UUID NOT NULL,
  source             TEXT NOT NULL CHECK (source IN ('BOOKKEEPER', 'CENTRAL_DEPOSITORY', 'CUSTODIAN', 'ISSUER', 'SUCCESSOR_ISSUER',
                                                     'REGISTRAR', 'COURT', 'REGULATED_ENTITY', 'SIMULATION')),
  method             TEXT NOT NULL CHECK (method IN ('API', 'FILE', 'OFFICIAL_CORRESPONDENCE', 'COURT_SYSTEM', 'MANUAL_ENTRY', 'SIMULATED')),
  external_reference TEXT,
  confirmed_by_body  TEXT,
  evidence_id        UUID REFERENCES evidence (id),
  approval_id        UUID REFERENCES approval_request (id),
  expires_at         TIMESTAMPTZ,
  state              TEXT NOT NULL DEFAULT 'REQUESTED' CHECK (state IN ('REQUESTED', 'PENDING', 'CONFIRMED', 'REJECTED', 'INCONCLUSIVE', 'EXPIRED')),
  requested_at       TIMESTAMPTZ NOT NULL DEFAULT now(),
  requested_by       UUID,
  CONSTRAINT confirmation_simulation_consistent CHECK ((source = 'SIMULATION') = (method = 'SIMULATED'))
);
CREATE INDEX external_confirmation_subject_idx ON external_confirmation (subject_type, subject_id);

CREATE OR REPLACE FUNCTION external_confirmation_guard() RETURNS trigger AS $$
BEGIN
  IF TG_OP = 'INSERT' THEN
    IF NEW.state <> 'REQUESTED' THEN RAISE EXCEPTION 'external_confirmation: nasce em REQUESTED'; END IF;
    RETURN NEW;
  END IF;
  IF (NEW.state IS DISTINCT FROM OLD.state) AND NOT recovery_in_transition() THEN
    RAISE EXCEPTION 'external_confirmation: estado só muda por entity_transition';
  END IF;
  IF NEW.purpose <> OLD.purpose OR NEW.subject_type <> OLD.subject_type OR NEW.subject_id <> OLD.subject_id
     OR NEW.source <> OLD.source OR NEW.method <> OLD.method OR NEW.requested_at <> OLD.requested_at
     OR NEW.requested_by IS DISTINCT FROM OLD.requested_by THEN
    RAISE EXCEPTION 'external_confirmation: identidade da confirmação é imutável';
  END IF;
  -- dados de prova só podem ser preenchidos antes da decisão; depois ficam congelados
  IF OLD.state NOT IN ('REQUESTED', 'PENDING') AND (
       NEW.external_reference IS DISTINCT FROM OLD.external_reference OR NEW.evidence_id IS DISTINCT FROM OLD.evidence_id
       OR NEW.approval_id IS DISTINCT FROM OLD.approval_id OR NEW.expires_at IS DISTINCT FROM OLD.expires_at
       OR NEW.confirmed_by_body IS DISTINCT FROM OLD.confirmed_by_body) THEN
    RAISE EXCEPTION 'external_confirmation: prova congelada após decisão (%)', OLD.state;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;
CREATE TRIGGER external_confirmation_guard_ins BEFORE INSERT ON external_confirmation FOR EACH ROW EXECUTE FUNCTION external_confirmation_guard();
CREATE TRIGGER external_confirmation_guard_upd BEFORE UPDATE ON external_confirmation FOR EACH ROW EXECUTE FUNCTION external_confirmation_guard();
CREATE TRIGGER external_confirmation_no_delete BEFORE DELETE ON external_confirmation FOR EACH ROW EXECUTE FUNCTION raise_append_only();
CREATE TRIGGER external_confirmation_no_truncate BEFORE TRUNCATE ON external_confirmation FOR EACH STATEMENT EXECUTE FUNCTION raise_append_only();

-- O gate. Espelho EXATO de evaluateAssetGate() em api/src/recovery/domain/external-confirmation.js.
-- SIMULATION pode chegar a CONFIRMED na tabela (fluxos de desenvolvimento), mas nunca satisfaz o gate.
CREATE OR REPLACE FUNCTION external_confirmation_satisfies_gate(p_id UUID, p_purpose TEXT, p_subject_type TEXT, p_subject_id UUID)
RETURNS boolean AS $$
DECLARE
  c  external_confirmation%ROWTYPE;
  ev evidence%ROWTYPE;
  a  approval_request%ROWTYPE;
BEGIN
  SELECT * INTO c FROM external_confirmation WHERE id = p_id;
  IF NOT FOUND THEN RETURN false; END IF;
  IF c.state <> 'CONFIRMED' THEN RETURN false; END IF;
  IF c.source = 'SIMULATION' OR c.method = 'SIMULATED' THEN RETURN false; END IF;
  IF c.expires_at IS NOT NULL AND c.expires_at <= now() THEN RETURN false; END IF;
  IF c.external_reference IS NULL OR length(trim(c.external_reference)) = 0 THEN RETURN false; END IF;
  IF c.evidence_id IS NULL THEN RETURN false; END IF;
  SELECT * INTO ev FROM evidence WHERE id = c.evidence_id;
  IF NOT FOUND OR ev.evidence_class <> 'EXTERNAL_EVIDENCE' THEN RETURN false; END IF;
  IF p_purpose IS NOT NULL AND c.purpose <> p_purpose THEN RETURN false; END IF;
  IF c.purpose = 'REGISTRATION' AND c.source NOT IN ('BOOKKEEPER', 'CENTRAL_DEPOSITORY', 'REGISTRAR', 'CUSTODIAN') THEN RETURN false; END IF;
  IF p_subject_type IS NOT NULL AND (c.subject_type <> p_subject_type OR c.subject_id <> p_subject_id) THEN RETURN false; END IF;
  IF c.method = 'MANUAL_ENTRY' THEN
    SELECT * INTO a FROM approval_request WHERE id = c.approval_id;
    IF NOT FOUND OR a.action IS DISTINCT FROM 'ASSET_MANUAL_CONFIRMATION' OR a.decision IS DISTINCT FROM 'APPROVED'
       OR a.subject_id IS DISTINCT FROM c.id::text OR a.reviewed_by IS NULL OR a.approved_by IS NULL
       OR a.approved_by = a.requested_by OR a.reviewed_by = a.requested_by THEN
      RETURN false;
    END IF;
  END IF;
  RETURN true;
END;
$$ LANGUAGE plpgsql STABLE;

CREATE TABLE claim_validation (
  id                       UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  claim_id                 UUID NOT NULL REFERENCES claim (id),
  external_confirmation_id UUID NOT NULL UNIQUE REFERENCES external_confirmation (id),
  state                    TEXT NOT NULL DEFAULT 'REQUESTED' CHECK (state IN ('REQUESTED', 'CONFIRMED', 'DENIED', 'INCONCLUSIVE', 'CANCELLED')),
  requested_at             TIMESTAMPTZ NOT NULL DEFAULT now(),
  requested_by             UUID
);
CREATE OR REPLACE FUNCTION claim_validation_insert_guard() RETURNS trigger AS $$
DECLARE
  c external_confirmation%ROWTYPE;
BEGIN
  IF NEW.state <> 'REQUESTED' THEN RAISE EXCEPTION 'claim_validation: nasce em REQUESTED'; END IF;
  SELECT * INTO c FROM external_confirmation WHERE id = NEW.external_confirmation_id;
  IF NOT FOUND OR c.purpose IS DISTINCT FROM 'RIGHT_RECOGNITION' OR c.subject_type IS DISTINCT FROM 'claim' OR c.subject_id IS DISTINCT FROM NEW.claim_id THEN
    RAISE EXCEPTION 'claim_validation: a confirmação deve ter propósito RIGHT_RECOGNITION e sujeito = este claim';
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;
CREATE TRIGGER claim_validation_insert_guard_trg BEFORE INSERT ON claim_validation FOR EACH ROW EXECUTE FUNCTION claim_validation_insert_guard();
CREATE TRIGGER claim_validation_guard_update BEFORE UPDATE ON claim_validation FOR EACH ROW EXECUTE FUNCTION recovery_guard_update(
  'claim_id', 'external_confirmation_id', 'requested_at', 'requested_by');
CREATE TRIGGER claim_validation_no_delete BEFORE DELETE ON claim_validation FOR EACH ROW EXECUTE FUNCTION raise_append_only();
CREATE TRIGGER claim_validation_no_truncate BEFORE TRUNCATE ON claim_validation FOR EACH STATEMENT EXECUTE FUNCTION raise_append_only();

-- ---------------------------------------------------------------------------------------------
-- RecognizedRight, RegistrationRequest, RegisteredAsset
-- ---------------------------------------------------------------------------------------------
CREATE TABLE recognized_right (
  id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  claim_id            UUID NOT NULL UNIQUE REFERENCES claim (id),
  claim_validation_id UUID NOT NULL UNIQUE REFERENCES claim_validation (id),
  right_kind          TEXT NOT NULL CHECK (right_kind IN ('BOOK_ENTRY_SHARES', 'CASH_CREDIT_AGAINST_ISSUER', 'LITIGIOUS_CREDIT')),
  security_ref        TEXT,
  quantity            NUMERIC(30, 8),
  state               TEXT NOT NULL DEFAULT 'RECOGNIZED' CHECK (state IN ('RECOGNIZED', 'REGISTRATION_REQUESTED', 'REGISTERED', 'REVOKED')),
  created_at          TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_by          UUID
);
CREATE OR REPLACE FUNCTION recognized_right_insert_guard() RETURNS trigger AS $$
DECLARE
  cl claim%ROWTYPE;
  v  claim_validation%ROWTYPE;
BEGIN
  IF NEW.state <> 'RECOGNIZED' THEN RAISE EXCEPTION 'recognized_right: nasce em RECOGNIZED'; END IF;
  SELECT * INTO cl FROM claim WHERE id = NEW.claim_id;
  IF NOT FOUND OR cl.state IS DISTINCT FROM 'RECOGNIZED' THEN
    RAISE EXCEPTION 'recognized_right: claim % está em % (exige RECOGNIZED)', NEW.claim_id, cl.state;
  END IF;
  SELECT * INTO v FROM claim_validation WHERE id = NEW.claim_validation_id;
  IF NOT FOUND OR v.claim_id IS DISTINCT FROM NEW.claim_id OR v.state IS DISTINCT FROM 'CONFIRMED'
     OR NOT external_confirmation_satisfies_gate(v.external_confirmation_id, 'RIGHT_RECOGNITION', 'claim', NEW.claim_id) THEN
    RAISE EXCEPTION 'recognized_right: sem confirmação externa válida — Claim não vira direito reconhecido';
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;
CREATE TRIGGER recognized_right_insert_guard_trg BEFORE INSERT ON recognized_right FOR EACH ROW EXECUTE FUNCTION recognized_right_insert_guard();
CREATE TRIGGER recognized_right_guard_update BEFORE UPDATE ON recognized_right FOR EACH ROW EXECUTE FUNCTION recovery_guard_update(
  'claim_id', 'claim_validation_id', 'right_kind', 'security_ref', 'quantity', 'created_at', 'created_by');
CREATE TRIGGER recognized_right_no_delete BEFORE DELETE ON recognized_right FOR EACH ROW EXECUTE FUNCTION raise_append_only();
CREATE TRIGGER recognized_right_no_truncate BEFORE TRUNCATE ON recognized_right FOR EACH STATEMENT EXECUTE FUNCTION raise_append_only();

CREATE TABLE registration_request (
  id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  recognized_right_id UUID NOT NULL REFERENCES recognized_right (id),
  target_registry     TEXT NOT NULL CHECK (target_registry IN ('BOOKKEEPER', 'CENTRAL_DEPOSITORY', 'REGISTRAR', 'CUSTODIAN')),
  state               TEXT NOT NULL DEFAULT 'REQUESTED' CHECK (state IN ('REQUESTED', 'PENDING', 'COMPLETED', 'REJECTED', 'CANCELLED')),
  created_at          TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_by          UUID
);
CREATE OR REPLACE FUNCTION registration_request_insert_guard() RETURNS trigger AS $$
DECLARE
  rr recognized_right%ROWTYPE;
BEGIN
  IF NEW.state <> 'REQUESTED' THEN RAISE EXCEPTION 'registration_request: nasce em REQUESTED'; END IF;
  SELECT * INTO rr FROM recognized_right WHERE id = NEW.recognized_right_id;
  IF NOT FOUND OR rr.right_kind IS DISTINCT FROM 'BOOK_ENTRY_SHARES' THEN
    RAISE EXCEPTION 'registration_request: só direito sobre ações escriturais é registrável (recebido %)', rr.right_kind;
  END IF;
  IF rr.state NOT IN ('RECOGNIZED', 'REGISTRATION_REQUESTED') THEN
    RAISE EXCEPTION 'registration_request: direito em % não aceita pedido de registro', rr.state;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;
CREATE TRIGGER registration_request_insert_guard_trg BEFORE INSERT ON registration_request FOR EACH ROW EXECUTE FUNCTION registration_request_insert_guard();
CREATE TRIGGER registration_request_guard_update BEFORE UPDATE ON registration_request FOR EACH ROW EXECUTE FUNCTION recovery_guard_update(
  'recognized_right_id', 'target_registry', 'created_at', 'created_by');
CREATE TRIGGER registration_request_no_delete BEFORE DELETE ON registration_request FOR EACH ROW EXECUTE FUNCTION raise_append_only();
CREATE TRIGGER registration_request_no_truncate BEFORE TRUNCATE ON registration_request FOR EACH STATEMENT EXECUTE FUNCTION raise_append_only();

CREATE TABLE registered_asset (
  id                       UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  recognized_right_id      UUID NOT NULL UNIQUE REFERENCES recognized_right (id),
  registration_request_id  UUID NOT NULL UNIQUE REFERENCES registration_request (id),
  external_confirmation_id UUID NOT NULL UNIQUE REFERENCES external_confirmation (id),
  system_of_record         TEXT NOT NULL,
  account_reference        TEXT NOT NULL CHECK (length(trim(account_reference)) > 0),
  security_ref             TEXT,
  quantity                 NUMERIC(30, 8),
  state                    TEXT NOT NULL DEFAULT 'REGISTERED' CHECK (state IN ('REGISTERED', 'CLOSED')),
  created_at               TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_by               UUID
);
-- NO EXTERNAL CONFIRMATION = NO REGISTERED ASSET.
CREATE OR REPLACE FUNCTION registered_asset_insert_guard() RETURNS trigger AS $$
DECLARE
  rr  recognized_right%ROWTYPE;
  req registration_request%ROWTYPE;
  cl  claim%ROWTYPE;
  c   external_confirmation%ROWTYPE;
BEGIN
  IF NEW.state <> 'REGISTERED' THEN RAISE EXCEPTION 'registered_asset: nasce em REGISTERED'; END IF;
  SELECT * INTO req FROM registration_request WHERE id = NEW.registration_request_id;
  IF NOT FOUND OR req.recognized_right_id <> NEW.recognized_right_id THEN
    RAISE EXCEPTION 'registered_asset: pedido de registro não pertence ao direito';
  END IF;
  IF req.state IS NULL OR req.state NOT IN ('REQUESTED', 'PENDING') THEN
    RAISE EXCEPTION 'registered_asset: pedido de registro em %', req.state;
  END IF;
  SELECT * INTO rr FROM recognized_right WHERE id = NEW.recognized_right_id;
  IF NOT FOUND OR rr.state IS DISTINCT FROM 'REGISTRATION_REQUESTED' OR rr.right_kind IS DISTINCT FROM 'BOOK_ENTRY_SHARES' THEN
    RAISE EXCEPTION 'registered_asset: direito em %/% não é registrável', rr.state, rr.right_kind;
  END IF;
  SELECT * INTO cl FROM claim WHERE id = rr.claim_id;
  IF NOT FOUND OR cl.state IN ('REJECTED', 'WITHDRAWN') THEN
    RAISE EXCEPTION 'registered_asset: claim encerrado (%)', cl.state;
  END IF;
  IF NOT external_confirmation_satisfies_gate(NEW.external_confirmation_id, 'REGISTRATION', 'registration_request', NEW.registration_request_id) THEN
    RAISE EXCEPTION 'registered_asset: NO EXTERNAL CONFIRMATION = NO REGISTERED ASSET (confirmação ausente, não confirmada, simulada, vencida, sem evidência externa ou de fonte que não mantém registro)';
  END IF;
  SELECT * INTO c FROM external_confirmation WHERE id = NEW.external_confirmation_id;
  NEW.system_of_record := c.source;
  NEW.security_ref := rr.security_ref;
  NEW.quantity := rr.quantity;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;
CREATE TRIGGER registered_asset_insert_guard_trg BEFORE INSERT ON registered_asset FOR EACH ROW EXECUTE FUNCTION registered_asset_insert_guard();
CREATE TRIGGER registered_asset_guard_update BEFORE UPDATE ON registered_asset FOR EACH ROW EXECUTE FUNCTION recovery_guard_update(
  'recognized_right_id', 'registration_request_id', 'external_confirmation_id', 'system_of_record', 'account_reference',
  'security_ref', 'quantity', 'created_at', 'created_by');
CREATE TRIGGER registered_asset_no_delete BEFORE DELETE ON registered_asset FOR EACH ROW EXECUTE FUNCTION raise_append_only();
CREATE TRIGGER registered_asset_no_truncate BEFORE TRUNCATE ON registered_asset FOR EACH STATEMENT EXECUTE FUNCTION raise_append_only();

-- ---------------------------------------------------------------------------------------------
-- Máquinas de estado: allowed_transition (cópia de model.js) + entity_transition (append-only)
-- ---------------------------------------------------------------------------------------------
CREATE TABLE allowed_transition (
  entity_type TEXT NOT NULL,
  from_state  TEXT NOT NULL,
  to_state    TEXT NOT NULL,
  PRIMARY KEY (entity_type, from_state, to_state)
);
INSERT INTO allowed_transition (entity_type, from_state, to_state) VALUES
  ('legacy_evidence', 'RECEIVED', 'CLASSIFIED'),
  ('legacy_evidence', 'RECEIVED', 'SUSPECT'),
  ('legacy_evidence', 'RECEIVED', 'ARCHIVED'),
  ('legacy_evidence', 'CLASSIFIED', 'LINKED'),
  ('legacy_evidence', 'CLASSIFIED', 'SUSPECT'),
  ('legacy_evidence', 'CLASSIFIED', 'ARCHIVED'),
  ('legacy_evidence', 'LINKED', 'SUSPECT'),
  ('legacy_evidence', 'LINKED', 'ARCHIVED'),
  ('legacy_evidence', 'SUSPECT', 'CLASSIFIED'),
  ('legacy_evidence', 'SUSPECT', 'ARCHIVED'),
  ('claim', 'DRAFT', 'OPEN'),
  ('claim', 'DRAFT', 'WITHDRAWN'),
  ('claim', 'OPEN', 'EVIDENCE_GATHERING'),
  ('claim', 'OPEN', 'UNDER_ANALYSIS'),
  ('claim', 'OPEN', 'REJECTED'),
  ('claim', 'OPEN', 'WITHDRAWN'),
  ('claim', 'EVIDENCE_GATHERING', 'UNDER_ANALYSIS'),
  ('claim', 'EVIDENCE_GATHERING', 'REJECTED'),
  ('claim', 'EVIDENCE_GATHERING', 'WITHDRAWN'),
  ('claim', 'UNDER_ANALYSIS', 'EVIDENCE_GATHERING'),
  ('claim', 'UNDER_ANALYSIS', 'VALIDATION_REQUESTED'),
  ('claim', 'UNDER_ANALYSIS', 'LITIGATION'),
  ('claim', 'UNDER_ANALYSIS', 'REJECTED'),
  ('claim', 'UNDER_ANALYSIS', 'WITHDRAWN'),
  ('claim', 'VALIDATION_REQUESTED', 'RECOGNIZED'),
  ('claim', 'VALIDATION_REQUESTED', 'INCONCLUSIVE'),
  ('claim', 'VALIDATION_REQUESTED', 'LITIGATION'),
  ('claim', 'VALIDATION_REQUESTED', 'REJECTED'),
  ('claim', 'INCONCLUSIVE', 'UNDER_ANALYSIS'),
  ('claim', 'INCONCLUSIVE', 'LITIGATION'),
  ('claim', 'INCONCLUSIVE', 'REJECTED'),
  ('claim', 'LITIGATION', 'VALIDATION_REQUESTED'),
  ('claim', 'LITIGATION', 'REJECTED'),
  ('claim_validation', 'REQUESTED', 'CONFIRMED'),
  ('claim_validation', 'REQUESTED', 'DENIED'),
  ('claim_validation', 'REQUESTED', 'INCONCLUSIVE'),
  ('claim_validation', 'REQUESTED', 'CANCELLED'),
  ('external_confirmation', 'REQUESTED', 'PENDING'),
  ('external_confirmation', 'REQUESTED', 'REJECTED'),
  ('external_confirmation', 'REQUESTED', 'EXPIRED'),
  ('external_confirmation', 'PENDING', 'CONFIRMED'),
  ('external_confirmation', 'PENDING', 'REJECTED'),
  ('external_confirmation', 'PENDING', 'INCONCLUSIVE'),
  ('external_confirmation', 'PENDING', 'EXPIRED'),
  ('external_confirmation', 'CONFIRMED', 'EXPIRED'),
  ('recognized_right', 'RECOGNIZED', 'REGISTRATION_REQUESTED'),
  ('recognized_right', 'RECOGNIZED', 'REVOKED'),
  ('recognized_right', 'REGISTRATION_REQUESTED', 'RECOGNIZED'),
  ('recognized_right', 'REGISTRATION_REQUESTED', 'REGISTERED'),
  ('recognized_right', 'REGISTRATION_REQUESTED', 'REVOKED'),
  ('recognized_right', 'REGISTERED', 'REVOKED'),
  ('registration_request', 'REQUESTED', 'PENDING'),
  ('registration_request', 'REQUESTED', 'CANCELLED'),
  ('registration_request', 'REQUESTED', 'REJECTED'),
  ('registration_request', 'PENDING', 'COMPLETED'),
  ('registration_request', 'PENDING', 'REJECTED'),
  ('registration_request', 'PENDING', 'CANCELLED'),
  ('registered_asset', 'REGISTERED', 'CLOSED');
CREATE TRIGGER allowed_transition_immutable BEFORE UPDATE OR DELETE ON allowed_transition FOR EACH ROW EXECUTE FUNCTION raise_append_only();
CREATE TRIGGER allowed_transition_no_truncate BEFORE TRUNCATE ON allowed_transition FOR EACH STATEMENT EXECUTE FUNCTION raise_append_only();

CREATE TABLE entity_transition (
  seq             BIGSERIAL PRIMARY KEY,
  entity_type     TEXT NOT NULL,
  entity_id       UUID NOT NULL,
  from_state      TEXT NOT NULL,
  to_state        TEXT NOT NULL,
  actor_user_id   UUID,
  source          TEXT NOT NULL,
  reason          TEXT NOT NULL CHECK (length(trim(reason)) >= 3),
  evidence_ref    TEXT,
  approval_id     UUID REFERENCES approval_request (id),
  audit_event_uid UUID REFERENCES audit_event (event_uid),
  occurred_at     TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX entity_transition_entity_idx ON entity_transition (entity_type, entity_id, seq);

CREATE OR REPLACE FUNCTION recovery_projection_table(p_entity TEXT) RETURNS TEXT AS $$
  SELECT CASE p_entity
    WHEN 'legacy_evidence' THEN 'evidence'
    WHEN 'claim' THEN 'claim'
    WHEN 'claim_validation' THEN 'claim_validation'
    WHEN 'external_confirmation' THEN 'external_confirmation'
    WHEN 'recognized_right' THEN 'recognized_right'
    WHEN 'registration_request' THEN 'registration_request'
    WHEN 'registered_asset' THEN 'registered_asset'
  END;
$$ LANGUAGE sql IMMUTABLE;

CREATE OR REPLACE FUNCTION entity_transition_guard() RETURNS trigger AS $$
DECLARE
  tbl     TEXT := recovery_projection_table(NEW.entity_type);
  current TEXT;
  cls     TEXT;
  v       claim_validation%ROWTYPE;
BEGIN
  IF tbl IS NULL THEN RAISE EXCEPTION 'entity_transition: entidade desconhecida %', NEW.entity_type; END IF;
  IF NOT EXISTS (SELECT 1 FROM allowed_transition WHERE entity_type = NEW.entity_type AND from_state = NEW.from_state AND to_state = NEW.to_state) THEN
    RAISE EXCEPTION 'entity_transition: % % -> % não é permitida', NEW.entity_type, NEW.from_state, NEW.to_state;
  END IF;
  EXECUTE format('SELECT state FROM %I WHERE id = $1 FOR UPDATE', tbl) INTO current USING NEW.entity_id;
  IF current IS NULL THEN RAISE EXCEPTION 'entity_transition: % % não existe', NEW.entity_type, NEW.entity_id; END IF;
  IF current <> NEW.from_state THEN
    RAISE EXCEPTION 'entity_transition: % % está em % (from_state informado %)', NEW.entity_type, NEW.entity_id, current, NEW.from_state;
  END IF;
  IF NEW.entity_type = 'legacy_evidence' THEN
    SELECT evidence_class INTO cls FROM evidence WHERE id = NEW.entity_id;
    IF cls <> 'LEGACY_EVIDENCE' THEN RAISE EXCEPTION 'entity_transition: workflow de evidência legada só para LEGACY_EVIDENCE'; END IF;
  END IF;
  -- destinos guardados: exigem prova externa (GUARDED_TRANSITIONS em model.js)
  IF NEW.entity_type = 'claim_validation' AND NEW.to_state = 'CONFIRMED' THEN
    SELECT * INTO v FROM claim_validation WHERE id = NEW.entity_id;
    IF NOT external_confirmation_satisfies_gate(v.external_confirmation_id, 'RIGHT_RECOGNITION', 'claim', v.claim_id) THEN
      RAISE EXCEPTION 'entity_transition: validação só é CONFIRMED com confirmação externa válida (SIMULATION não vale)';
    END IF;
  END IF;
  IF NEW.entity_type = 'claim' AND NEW.to_state = 'RECOGNIZED' THEN
    IF NOT EXISTS (SELECT 1 FROM claim_validation WHERE claim_id = NEW.entity_id AND state = 'CONFIRMED') THEN
      RAISE EXCEPTION 'entity_transition: claim só é RECOGNIZED com ClaimValidation CONFIRMED';
    END IF;
  END IF;
  IF NEW.entity_type = 'registration_request' AND NEW.to_state = 'COMPLETED' THEN
    IF NOT EXISTS (SELECT 1 FROM registered_asset WHERE registration_request_id = NEW.entity_id) THEN
      RAISE EXCEPTION 'entity_transition: pedido de registro só é COMPLETED com RegisteredAsset confirmado';
    END IF;
  END IF;
  IF NEW.entity_type = 'recognized_right' AND NEW.to_state = 'REGISTERED' THEN
    IF NOT EXISTS (SELECT 1 FROM registered_asset WHERE recognized_right_id = NEW.entity_id) THEN
      RAISE EXCEPTION 'entity_transition: direito só é REGISTERED com RegisteredAsset confirmado';
    END IF;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE OR REPLACE FUNCTION entity_transition_apply() RETURNS trigger AS $$
BEGIN
  PERFORM set_config('besc.recovery_transition', 'on', true);
  EXECUTE format('UPDATE %I SET state = $1 WHERE id = $2', recovery_projection_table(NEW.entity_type)) USING NEW.to_state, NEW.entity_id;
  PERFORM set_config('besc.recovery_transition', 'off', true);
  RETURN NULL;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER entity_transition_guard_trg BEFORE INSERT ON entity_transition FOR EACH ROW EXECUTE FUNCTION entity_transition_guard();
CREATE TRIGGER entity_transition_apply_trg AFTER INSERT ON entity_transition FOR EACH ROW EXECUTE FUNCTION entity_transition_apply();
CREATE TRIGGER entity_transition_immutable BEFORE UPDATE OR DELETE ON entity_transition FOR EACH ROW EXECUTE FUNCTION raise_append_only();
CREATE TRIGGER entity_transition_no_truncate BEFORE TRUNCATE ON entity_transition FOR EACH STATEMENT EXECUTE FUNCTION raise_append_only();

-- ---------------------------------------------------------------------------------------------
-- Valuation 2.0 (espelho de api/src/recovery/domain/valuation.js). Append-only.
-- ---------------------------------------------------------------------------------------------
CREATE TABLE valuation (
  id                    UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  value_type            TEXT NOT NULL CHECK (value_type IN ('claimed_value', 'historical_value', 'expert_estimate', 'recognized_value',
                                                           'market_value', 'collateral_value', 'liquidation_value')),
  subject_type          TEXT NOT NULL,
  subject_id            TEXT NOT NULL,
  amount                NUMERIC(24, 8) NOT NULL,
  currency              TEXT NOT NULL DEFAULT 'BRL',
  source                TEXT NOT NULL CHECK (source IN ('CLAIMANT', 'PRIVATE_APPRAISAL', 'COURT_EXPERT', 'PETITION', 'COMMERCIAL_MATERIAL',
                                                       'CORPORATE_DOCUMENT', 'HISTORICAL_QUOTE', 'EXTERNAL_CONFIRMATION', 'MARKET_DATA', 'EXECUTION')),
  methodology           TEXT NOT NULL,
  evidence_id           UUID REFERENCES evidence (id),
  author                TEXT NOT NULL,
  confidence            NUMERIC(4, 3) NOT NULL CHECK (confidence >= 0 AND confidence <= 1),
  legal_status          TEXT NOT NULL CHECK (legal_status IN ('SOURCE_CLAIM', 'HISTORICAL_FACT', 'EXTERNALLY_CONFIRMED', 'MARKET_OBSERVED', 'EXECUTED')),
  effective_at          TIMESTAMPTZ NOT NULL,
  created_at            TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_by            UUID,
  derived_from_id       UUID REFERENCES valuation (id),
  supersedes_id         UUID REFERENCES valuation (id),
  basis_confirmation_id UUID REFERENCES external_confirmation (id),
  approval_id           UUID REFERENCES approval_request (id),
  legacy_case_id        TEXT,
  CONSTRAINT valuation_opinion_is_claim  CHECK (value_type NOT IN ('claimed_value', 'expert_estimate') OR legal_status = 'SOURCE_CLAIM'),
  CONSTRAINT valuation_evidence_required CHECK (value_type = 'claimed_value' OR evidence_id IS NOT NULL OR legacy_case_id IS NOT NULL),
  CONSTRAINT valuation_recognized_basis  CHECK (value_type <> 'recognized_value'
                                                OR (source = 'EXTERNAL_CONFIRMATION' AND legal_status = 'EXTERNALLY_CONFIRMED'
                                                    AND basis_confirmation_id IS NOT NULL AND approval_id IS NOT NULL)),
  CONSTRAINT valuation_asset_only        CHECK (value_type NOT IN ('market_value', 'collateral_value', 'liquidation_value')
                                                OR (subject_type = 'registered_asset'
                                                    AND source = CASE WHEN value_type = 'liquidation_value' THEN 'EXECUTION' ELSE 'MARKET_DATA' END)),
  CONSTRAINT valuation_historical_source CHECK (value_type <> 'historical_value' OR source IN ('CORPORATE_DOCUMENT', 'HISTORICAL_QUOTE'))
);
CREATE INDEX valuation_subject_idx ON valuation (subject_type, subject_id);

CREATE OR REPLACE FUNCTION valuation_insert_guard() RETURNS trigger AS $$
DECLARE
  src valuation%ROWTYPE;
  a   approval_request%ROWTYPE;
BEGIN
  IF NEW.derived_from_id IS NOT NULL THEN
    SELECT * INTO src FROM valuation WHERE id = NEW.derived_from_id;
    IF src.value_type IN ('claimed_value', 'expert_estimate')
       AND NEW.value_type IN ('recognized_value', 'market_value', 'collateral_value', 'liquidation_value') THEN
      RAISE EXCEPTION 'valuation: % não pode originar % (opinião/alegação não confirma titularidade nem valor)', src.value_type, NEW.value_type;
    END IF;
    IF src.value_type = 'historical_value' AND NEW.value_type IN ('market_value', 'collateral_value', 'liquidation_value') THEN
      RAISE EXCEPTION 'valuation: valor histórico não é valor de mercado de ativo registrado';
    END IF;
  END IF;
  IF NEW.value_type = 'recognized_value' THEN
    SELECT * INTO a FROM approval_request WHERE id = NEW.approval_id;
    IF NOT FOUND OR a.action IS DISTINCT FROM 'RECOGNIZED_VALUATION' OR a.decision IS DISTINCT FROM 'APPROVED'
       OR a.reviewed_by IS NULL OR a.approved_by = a.requested_by OR a.reviewed_by = a.requested_by THEN
      RAISE EXCEPTION 'valuation: recognized_value exige aprovação quatro-olhos RECOGNIZED_VALUATION';
    END IF;
    IF NOT external_confirmation_satisfies_gate(NEW.basis_confirmation_id, NULL, NULL, NULL) THEN
      RAISE EXCEPTION 'valuation: recognized_value exige confirmação externa válida';
    END IF;
  END IF;
  IF NEW.value_type IN ('market_value', 'collateral_value', 'liquidation_value')
     AND NOT EXISTS (SELECT 1 FROM registered_asset WHERE id::text = NEW.subject_id AND state = 'REGISTERED') THEN
    RAISE EXCEPTION 'valuation: % só existe sobre RegisteredAsset ativo', NEW.value_type;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;
CREATE TRIGGER valuation_insert_guard_trg BEFORE INSERT ON valuation FOR EACH ROW EXECUTE FUNCTION valuation_insert_guard();
CREATE TRIGGER valuation_immutable BEFORE UPDATE OR DELETE ON valuation FOR EACH ROW EXECUTE FUNCTION raise_append_only();
CREATE TRIGGER valuation_no_truncate BEFORE TRUNCATE ON valuation FOR EACH STATEMENT EXECUTE FUNCTION raise_append_only();

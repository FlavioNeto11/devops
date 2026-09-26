// Repositório Postgres do domínio de recuperação. Fino de propósito: as regras de negócio vivem
// no serviço (recovery/service.js) e o banco repete as invariantes por trigger (0007). A ÚNICA
// primitiva que muda estado é transition(), que insere em entity_transition (append-only).
import { query, tx } from '../../db.js';
import { appendAuditTx } from '../../foundation/audit.js';

const camel = (row) => {
  if (!row) return null;
  const out = {};
  for (const [k, v] of Object.entries(row)) out[k.replace(/_([a-z])/g, (_, c) => c.toUpperCase())] = v;
  return out;
};
const rows = (r) => r.rows.map(camel);
const first = (r) => camel(r.rows[0]);

function ops(client) {
  const q = (text, params) => client.query(text, params);
  return {
    kind: 'pg',
    audit: (evt) => appendAuditTx(client, evt),

    async getGate(key) { return first(await q(`SELECT key, state, purpose, changed_by_approval_id, updated_at FROM governance_gate WHERE key = $1`, [key])); },
    async listGates() { return rows(await q(`SELECT key, state, purpose, changed_by_approval_id, updated_at FROM governance_gate ORDER BY key`)); },

    async insertClaimant(c) {
      return first(await q(
        `INSERT INTO claimant (id, person_type, display_name, tax_id, contact, legacy_case_id, created_by)
         VALUES (COALESCE($1, gen_random_uuid()), $2, $3, $4, $5, $6, $7)
         ON CONFLICT DO NOTHING RETURNING *`,
        [c.id || null, c.personType, c.displayName, c.taxId || null, c.contact || null, c.legacyCaseId || null, c.createdBy || null]));
    },
    async getClaimant(id) { return first(await q(`SELECT * FROM claimant WHERE id = $1`, [id])); },
    async findClaimantByLegacyCase(legacyCaseId) { return first(await q(`SELECT * FROM claimant WHERE legacy_case_id = $1`, [legacyCaseId])); },

    async insertClaim(c) {
      return first(await q(
        `INSERT INTO claim (id, claimant_id, asset_origin_id, claim_kind, claimed_security_class, claimed_quantity_written,
                            legacy_case_id, legacy_status, supersedes_claim_id, created_by)
         VALUES (COALESCE($1, gen_random_uuid()), $2, $3, $4, $5, $6, $7, $8, $9, $10)
         ON CONFLICT DO NOTHING RETURNING *`,
        [c.id || null, c.claimantId, c.assetOriginId, c.claimKind, c.claimedSecurityClass || null, c.claimedQuantityWritten || null,
          c.legacyCaseId || null, c.legacyStatus || null, c.supersedesClaimId || null, c.createdBy || null]));
    },
    async getClaim(id) { return first(await q(`SELECT * FROM claim WHERE id = $1`, [id])); },
    async findClaimByLegacyCase(legacyCaseId) { return first(await q(`SELECT * FROM claim WHERE legacy_case_id = $1`, [legacyCaseId])); },
    async listClaims() {
      return rows(await q(
        `SELECT c.*, (SELECT count(*)::int FROM claim_evidence ce WHERE ce.claim_id = c.id) AS evidence_count,
                EXISTS (SELECT 1 FROM recognized_right rr JOIN registered_asset ra ON ra.recognized_right_id = rr.id
                        WHERE rr.claim_id = c.id AND ra.state = 'REGISTERED') AS has_registered_asset
         FROM claim c ORDER BY c.created_at DESC`));
    },
    async hasRegisteredAsset(claimId) {
      return (await q(`SELECT EXISTS (SELECT 1 FROM recognized_right rr JOIN registered_asset ra ON ra.recognized_right_id = rr.id
                                     WHERE rr.claim_id = $1 AND ra.state = 'REGISTERED') AS x`, [claimId])).rows[0].x;
    },

    async insertEvidence(e) {
      return first(await q(
        `INSERT INTO evidence (id, evidence_class, origin, claimant_id, legacy_case_id, legacy_doc_key, original_filename, mime,
                               size_bytes, storage_uri, sha256, hash_status, duplicate_of, received_by)
         VALUES (COALESCE($1, gen_random_uuid()), $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14)
         ON CONFLICT (id) DO NOTHING RETURNING *`,
        [e.id || null, e.evidenceClass, e.origin, e.claimantId || null, e.legacyCaseId || null, e.legacyDocKey || null,
          e.originalFilename || null, e.mime || null, e.sizeBytes ?? null, e.storageUri || null, e.sha256 || null, e.hashStatus,
          e.duplicateOf || null, e.receivedBy || null]));
    },
    async getEvidence(id) { return first(await q(`SELECT * FROM evidence WHERE id = $1`, [id])); },
    async findOriginalEvidenceBySha(sha256) {
      return first(await q(`SELECT * FROM evidence WHERE sha256 = $1 AND duplicate_of IS NULL`, [sha256]));
    },
    async listEvidence({ claimantId = null, claimId = null } = {}) {
      if (claimId) {
        return rows(await q(`SELECT e.*, ce.role AS link_role FROM evidence e JOIN claim_evidence ce ON ce.evidence_id = e.id
                             WHERE ce.claim_id = $1 ORDER BY e.received_at`, [claimId]));
      }
      if (claimantId) return rows(await q(`SELECT * FROM evidence WHERE claimant_id = $1 ORDER BY received_at`, [claimantId]));
      return rows(await q(`SELECT * FROM evidence ORDER BY received_at DESC LIMIT 500`));
    },
    async isLinked(evidenceId) { return (await q(`SELECT EXISTS (SELECT 1 FROM claim_evidence WHERE evidence_id = $1) AS x`, [evidenceId])).rows[0].x; },
    async linkEvidence({ claimId, evidenceId, role, linkedBy }) {
      return !!first(await q(
        `INSERT INTO claim_evidence (claim_id, evidence_id, role, linked_by) VALUES ($1,$2,$3,$4) ON CONFLICT DO NOTHING RETURNING claim_id`,
        [claimId, evidenceId, role, linkedBy || null]));
    },

    async insertClassification(c) {
      return first(await q(
        `INSERT INTO evidence_classification (evidence_id, document_kind, source_nature, origin_candidate, security_class_written,
                                              certificate_number, quantity_written, document_date_written, notes, supersedes_id, reason, classified_by)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12) RETURNING *`,
        [c.evidenceId, c.documentKind, c.sourceNature, c.originCandidate || null, c.securityClassWritten || null, c.certificateNumber || null,
          c.quantityWritten || null, c.documentDateWritten || null, c.notes || null, c.supersedesId || null, c.reason || null, c.classifiedBy || null]));
    },
    async latestClassification(evidenceId) {
      return first(await q(
        `SELECT * FROM evidence_classification ec WHERE ec.evidence_id = $1
           AND NOT EXISTS (SELECT 1 FROM evidence_classification s WHERE s.supersedes_id = ec.id)
         ORDER BY ec.classified_at DESC LIMIT 1`, [evidenceId]));
    },
    async listClassifications(evidenceId) {
      return rows(await q(`SELECT * FROM evidence_classification WHERE evidence_id = $1 ORDER BY classified_at`, [evidenceId]));
    },
    // Usos vigentes de um número de cautela numa origem (classificações não superadas).
    async findCertificateUses(originCandidate, certificateNumber) {
      return rows(await q(
        `SELECT ec.evidence_id, e.claimant_id, e.duplicate_of FROM evidence_classification ec JOIN evidence e ON e.id = ec.evidence_id
         WHERE ec.origin_candidate IS NOT DISTINCT FROM $1 AND ec.certificate_number = $2
           AND NOT EXISTS (SELECT 1 FROM evidence_classification s WHERE s.supersedes_id = ec.id)`,
        [originCandidate || null, certificateNumber]));
    },

    async transition({ entityType, entityId, from, to, actorUserId = null, source, reason, evidenceRef = null, approvalId = null, auditEventUid = null }) {
      return first(await q(
        `INSERT INTO entity_transition (entity_type, entity_id, from_state, to_state, actor_user_id, source, reason, evidence_ref, approval_id, audit_event_uid)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10) RETURNING *`,
        [entityType, entityId, from, to, actorUserId, source, reason, evidenceRef, approvalId, auditEventUid]));
    },
    async listTransitions(entityType, entityId) {
      return rows(await q(`SELECT * FROM entity_transition WHERE entity_type = $1 AND entity_id = $2 ORDER BY seq`, [entityType, entityId]));
    },

    async insertValuation(v) {
      return first(await q(
        `INSERT INTO valuation (value_type, subject_type, subject_id, amount, currency, source, methodology, evidence_id, author, confidence,
                                legal_status, effective_at, created_by, derived_from_id, supersedes_id, basis_confirmation_id, approval_id, legacy_case_id)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18) RETURNING *`,
        [v.valueType, v.subjectType, v.subjectId, v.amount, v.currency || 'BRL', v.source, v.methodology, v.evidenceId || null, v.author,
          v.confidence, v.legalStatus, v.effectiveAt, v.createdBy || null, v.derivedFromId || null, v.supersedesId || null,
          v.basisConfirmationId || null, v.approvalId || null, v.legacyCaseId || null]));
    },
    async listValuations(subjectType, subjectId) {
      return rows(await q(`SELECT * FROM valuation WHERE subject_type = $1 AND subject_id = $2 ORDER BY created_at`, [subjectType, String(subjectId)]));
    },
    async findValuationByLegacy(legacyCaseId, valueType) {
      return first(await q(`SELECT * FROM valuation WHERE legacy_case_id = $1 AND value_type = $2 LIMIT 1`, [legacyCaseId, valueType]));
    },

    async insertApproval(a) {
      return first(await q(
        `INSERT INTO approval_request (action, subject_type, subject_id, payload, reason, requested_by)
         VALUES ($1,$2,$3,$4,$5,$6) RETURNING *`,
        [a.action, a.subjectType, a.subjectId, JSON.stringify(a.payload || {}), a.reason, a.requestedBy]));
    },
    async getApproval(id) { return first(await q(`SELECT * FROM approval_request WHERE id = $1`, [id])); },
    async listApprovals() { return rows(await q(`SELECT * FROM approval_request ORDER BY requested_at DESC LIMIT 200`)); },
    async saveApprovalReview(a) {
      return first(await q(`UPDATE approval_request SET state = $2, reviewed_by = $3, reviewed_at = $4, review_notes = $5 WHERE id = $1 RETURNING *`,
        [a.id, a.state, a.reviewedBy, a.reviewedAt, a.reviewNotes || null]));
    },
    async saveApprovalDecision(a) {
      return first(await q(`UPDATE approval_request SET state = $2, decision = $3, approved_by = $4, approved_at = $5, decision_notes = $6 WHERE id = $1 RETURNING *`,
        [a.id, a.state, a.decision, a.approvedBy, a.approvedAt, a.decisionNotes || null]));
    },
  };
}

export function createPgRecoveryRepo() {
  return {
    kind: 'pg',
    withTx: (fn) => tx((client) => fn(ops(client))),
    read: (fn) => fn(ops({ query: (t, p) => query(t, p) })),
  };
}

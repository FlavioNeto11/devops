// Repositório em memória para testes de contrato do serviço (sem Docker). Fino de propósito:
// guarda mapas e reproduz só o que o serviço não checa sozinho — unicidades (hash original,
// legacy_case_id, vínculo claim×evidência, id), o from_state da transição contra a projeção e
// o rollback da transação. As guardas de negócio vivem no serviço; as de defesa em profundidade,
// no banco (0007) e são testadas em test/recovery-db.pg.test.mjs.
import { randomUUID } from 'node:crypto';
import { canTransition } from '../domain/model.js';
import { DomainInvariantError } from '../domain/errors.js';

const TABLE = {
  legacy_evidence: 'evidence', claim: 'claim', claim_validation: 'claimValidation', external_confirmation: 'externalConfirmation',
  recognized_right: 'recognizedRight', registration_request: 'registrationRequest', registered_asset: 'registeredAsset',
};
const nowIso = () => new Date().toISOString();

export function createMemoryRecoveryRepo() {
  let db = {
    gate: new Map([['multi_issuer_research_gate', { key: 'multi_issuer_research_gate', state: 'CLOSED', purpose: 'aceitar Claims de origens além da família BESC' }]]),
    claimant: new Map(), claim: new Map(), evidence: new Map(), classification: [], claimEvidence: [], transitions: [], valuation: [],
    approval: new Map(), claimValidation: new Map(), externalConfirmation: new Map(), recognizedRight: new Map(),
    registrationRequest: new Map(), registeredAsset: new Map(), audit: [],
  };
  let seq = 0;

  const clone = (x) => structuredClone(x);
  const ops = {
    kind: 'memory',
    async audit(evt) { const uid = randomUUID(); db.audit.push({ ...evt, uid, at: nowIso() }); return { id: db.audit.length, uid, hash: null }; },

    async getGate(key) { return db.gate.get(key) || null; },
    async listGates() { return [...db.gate.values()]; },

    async insertClaimant(c) {
      if (c.legacyCaseId && [...db.claimant.values()].some((x) => x.legacyCaseId === c.legacyCaseId)) return null;
      const row = { id: c.id || randomUUID(), personType: c.personType, displayName: c.displayName, taxId: c.taxId || null, contact: c.contact || null, legacyCaseId: c.legacyCaseId || null, createdAt: nowIso(), createdBy: c.createdBy || null };
      if (db.claimant.has(row.id)) return null;
      db.claimant.set(row.id, row); return row;
    },
    async getClaimant(id) { return db.claimant.get(id) || null; },
    async findClaimantByLegacyCase(id) { return [...db.claimant.values()].find((x) => x.legacyCaseId === id) || null; },

    async insertClaim(c) {
      if (c.legacyCaseId && [...db.claim.values()].some((x) => x.legacyCaseId === c.legacyCaseId)) return null;
      const row = { id: c.id || randomUUID(), claimantId: c.claimantId, assetOriginId: c.assetOriginId, claimKind: c.claimKind, claimedSecurityClass: c.claimedSecurityClass || null, claimedQuantityWritten: c.claimedQuantityWritten || null, legacyCaseId: c.legacyCaseId || null, legacyStatus: c.legacyStatus || null, supersedesClaimId: c.supersedesClaimId || null, state: 'DRAFT', createdAt: nowIso(), createdBy: c.createdBy || null };
      if (db.claim.has(row.id)) return null;
      db.claim.set(row.id, row); return row;
    },
    async getClaim(id) { return db.claim.get(id) || null; },
    async findClaimByLegacyCase(id) { return [...db.claim.values()].find((x) => x.legacyCaseId === id) || null; },
    async listClaims() {
      return [...db.claim.values()].map((c) => ({ ...c, evidenceCount: db.claimEvidence.filter((l) => l.claimId === c.id).length, hasRegisteredAsset: false }))
        .sort((a, b) => b.createdAt.localeCompare(a.createdAt));
    },
    async hasRegisteredAsset() { return false; },

    async insertEvidence(e) {
      if (e.id && db.evidence.has(e.id)) return null;
      if (e.sha256 && !e.duplicateOf && [...db.evidence.values()].some((x) => x.sha256 === e.sha256 && !x.duplicateOf)) {
        throw new DomainInvariantError('DUPLICATE_SHA256', 'duplicate key value violates unique constraint "evidence_sha256_original_uniq"');
      }
      const row = { id: e.id || randomUUID(), evidenceClass: e.evidenceClass, origin: e.origin, claimantId: e.claimantId || null, legacyCaseId: e.legacyCaseId || null, legacyDocKey: e.legacyDocKey || null, originalFilename: e.originalFilename || null, mime: e.mime || null, sizeBytes: e.sizeBytes ?? null, storageUri: e.storageUri || null, sha256: e.sha256 || null, hashStatus: e.hashStatus, duplicateOf: e.duplicateOf || null, state: 'RECEIVED', receivedAt: nowIso(), receivedBy: e.receivedBy || null };
      db.evidence.set(row.id, row); return row;
    },
    async getEvidence(id) { return db.evidence.get(id) || null; },
    async findOriginalEvidenceBySha(sha) { return [...db.evidence.values()].find((x) => x.sha256 === sha && !x.duplicateOf) || null; },
    async listEvidence({ claimantId = null, claimId = null } = {}) {
      if (claimId) return db.claimEvidence.filter((l) => l.claimId === claimId).map((l) => ({ ...db.evidence.get(l.evidenceId), linkRole: l.role }));
      return [...db.evidence.values()].filter((e) => !claimantId || e.claimantId === claimantId);
    },
    async isLinked(evidenceId) { return db.claimEvidence.some((l) => l.evidenceId === evidenceId); },
    async linkEvidence({ claimId, evidenceId, role, linkedBy }) {
      if (db.claimEvidence.some((l) => l.claimId === claimId && l.evidenceId === evidenceId)) return false;
      db.claimEvidence.push({ claimId, evidenceId, role, linkedBy, linkedAt: nowIso() }); return true;
    },

    async insertClassification(c) {
      const row = { id: randomUUID(), ...c, classifiedAt: nowIso() };
      if (c.supersedesId && db.classification.some((x) => x.supersedesId === c.supersedesId)) throw new DomainInvariantError('CLASSIFICATION_ALREADY_SUPERSEDED', 'classificação já superada');
      db.classification.push(row); return row;
    },
    async latestClassification(evidenceId) {
      const superseded = new Set(db.classification.map((x) => x.supersedesId).filter(Boolean));
      return db.classification.filter((x) => x.evidenceId === evidenceId && !superseded.has(x.id)).at(-1) || null;
    },
    async listClassifications(evidenceId) { return db.classification.filter((x) => x.evidenceId === evidenceId); },
    async findCertificateUses(originCandidate, certificateNumber) {
      const superseded = new Set(db.classification.map((x) => x.supersedesId).filter(Boolean));
      return db.classification
        .filter((x) => !superseded.has(x.id) && (x.originCandidate || null) === (originCandidate || null) && x.certificateNumber === certificateNumber)
        .map((x) => { const e = db.evidence.get(x.evidenceId); return { evidenceId: x.evidenceId, claimantId: e.claimantId, duplicateOf: e.duplicateOf }; });
    },

    async transition({ entityType, entityId, from, to, actorUserId = null, source, reason, evidenceRef = null, approvalId = null, auditEventUid = null }) {
      const table = db[TABLE[entityType]];
      const row = table && table.get(entityId);
      if (!row) throw new DomainInvariantError('NOT_FOUND', `${entityType} ${entityId} não existe`);
      if (!canTransition(entityType, from, to)) throw new DomainInvariantError('TRANSITION_NOT_ALLOWED', `${entityType} ${from} -> ${to} não é permitida`);
      if (row.state !== from) throw new DomainInvariantError('STALE_STATE', `${entityType} ${entityId} está em ${row.state} (from_state informado ${from})`);
      if (!reason || String(reason).trim().length < 3) throw new DomainInvariantError('REASON_REQUIRED', 'transição exige motivo');
      const t = { seq: ++seq, entityType, entityId, fromState: from, toState: to, actorUserId, source, reason, evidenceRef, approvalId, auditEventUid, occurredAt: nowIso() };
      db.transitions.push(t); row.state = to; return t;
    },
    async listTransitions(entityType, entityId) { return db.transitions.filter((t) => t.entityType === entityType && t.entityId === entityId); },

    async insertValuation(v) { const row = { id: randomUUID(), ...v, createdAt: nowIso() }; db.valuation.push(row); return row; },
    async listValuations(subjectType, subjectId) { return db.valuation.filter((v) => v.subjectType === subjectType && String(v.subjectId) === String(subjectId)); },
    async findValuationByLegacy(legacyCaseId, valueType) { return db.valuation.find((v) => v.legacyCaseId === legacyCaseId && v.valueType === valueType) || null; },

    async insertApproval(a) { const row = { id: randomUUID(), ...a, state: 'REQUESTED', requestedAt: nowIso(), reviewedBy: null, approvedBy: null, decision: null }; db.approval.set(row.id, row); return row; },
    async getApproval(id) { return db.approval.get(id) || null; },
    async listApprovals() { return [...db.approval.values()]; },
    async saveApprovalReview(a) { const row = { ...db.approval.get(a.id), ...a }; db.approval.set(a.id, row); return row; },
    async saveApprovalDecision(a) { const row = { ...db.approval.get(a.id), ...a }; db.approval.set(a.id, row); return row; },
  };

  return {
    kind: 'memory',
    _state: () => db,
    async withTx(fn) {
      const snapshot = clone(db); // structuredClone copia Map em profundidade
      const seqBefore = seq;
      try {
        return await fn(ops);
      } catch (e) {
        db = snapshot;
        seq = seqBefore;
        throw e;
      }
    },
    read: (fn) => fn(ops),
  };
}

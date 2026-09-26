// Serviço de Legacy Asset Recovery (F1/F2). Toda regra de negócio passa por aqui ANTES do
// repositório; o banco repete as invariantes (defesa em profundidade). Cada operação de escrita
// roda numa transação: auditoria v2 primeiro, depois a mudança, tudo ou nada.
//
// A plataforma não responde "quanto vale esta cautela?". Responde: que evidência é esta, que
// direito ela poderia representar, esse direito ainda existe, quem o reconhece e onde está
// registrado. Nesta fase (F2) a resposta para "quem reconhece" é sempre "ninguém ainda":
// validação externa, cadeia de titularidade e registro são F3–F5.
import { createHash } from 'node:crypto';
import { createReadStream, existsSync } from 'node:fs';
import { KIND, JOURNEY, STAGE, canTransition, claimStage, isTerminal } from './domain/model.js';
import { DomainInvariantError, fail } from './domain/errors.js';
import { assertOriginAcceptsClaims } from './domain/governance-gates.js';
import { getOrigin, detectOriginCandidates } from './domain/asset-origins.js';
import { createValuation } from './domain/valuation.js';
import { createApprovalRequest, review, decide } from './domain/four-eyes.js';
import {
  validateClassification, classificationForLegacyDocKey, missingEvidence, CLAIM_KINDS, PERSON_TYPES, LINK_ROLES, DOCUMENT_KIND_LABELS,
} from './domain/evidence.js';

export const SOURCE = 'besc-api';

// Destinos de Claim abertos nesta fase. VALIDATION_REQUESTED e RECOGNIZED dependem de validação
// externa real (F4) e são recusados, sem simulação.
export const F2_CLAIM_DESTINATIONS = Object.freeze(['OPEN', 'EVIDENCE_GATHERING', 'UNDER_ANALYSIS', 'LITIGATION', 'REJECTED', 'WITHDRAWN']);
export const F2_EVIDENCE_DESTINATIONS = Object.freeze(['SUSPECT', 'ARCHIVED', 'CLASSIFIED']);
export const F2_VALUATION_TYPES = Object.freeze(['claimed_value', 'historical_value', 'expert_estimate']);

export async function sha256OfFile(filePath) {
  if (!filePath || !existsSync(filePath)) return null;
  const h = createHash('sha256');
  await new Promise((resolve, reject) => {
    createReadStream(filePath).on('data', (d) => h.update(d)).on('end', resolve).on('error', reject);
  });
  return h.digest('hex');
}

const who = (actor) => ({ actorUserId: actor?.userId || null, actorRole: actor?.role || 'system', ip: actor?.ip || null });
const isUniqueViolation = (e) => e && (e.code === '23505' || e.code === 'DUPLICATE_SHA256');
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const reasonOk = (r, min = 3) => typeof r === 'string' && r.trim().length >= min;

// Converte valor pt-BR informado ("R$ 1.234,56") em número. Ilegível -> null (nunca inventa zero).
export function parseBRL(input) {
  if (input === null || input === undefined || input === '') return null;
  if (typeof input === 'number') return Number.isFinite(input) && input > 0 ? input : null;
  let s = String(input).replace(/[^\d.,-]/g, '');
  if (!s) return null;
  if (s.includes(',')) s = s.replace(/\./g, '').replace(',', '.');
  const n = Number(s);
  return Number.isFinite(n) && n > 0 ? n : null;
}

export function createRecoveryService({ repo, hashFile = sha256OfFile }) {
  async function transition(r, { entityType, entityId, from, to, reason, actor, evidenceRef = null, approvalId = null }) {
    const a = who(actor);
    const evt = await r.audit({
      ...a, eventType: 'recovery.transition.recorded', entityType, entityId,
      payload: { from, to }, source: SOURCE, reason, evidenceRef,
    });
    return r.transition({ entityType, entityId, from, to, actorUserId: a.actorUserId, source: SOURCE, reason, evidenceRef, approvalId, auditEventUid: evt.uid });
  }

  async function requireClaim(r, id) {
    const c = await r.getClaim(id);
    if (!c) fail('NOT_FOUND', 'claim não encontrado');
    return { ...c, kind: KIND.claim };
  }
  async function requireEvidence(r, id) {
    const e = await r.getEvidence(id);
    if (!e) fail('NOT_FOUND', 'evidência não encontrada');
    return { ...e, kind: KIND.legacy_evidence };
  }

  async function markSuspect(r, ev, reason, actor) {
    if (ev.state === 'SUSPECT' || ev.state === 'ARCHIVED') return ev.state;
    await transition(r, { entityType: 'legacy_evidence', entityId: ev.id, from: ev.state, to: 'SUSPECT', reason, actor });
    return 'SUSPECT';
  }

  const service = {
    repo,

    async createClaimant({ personType = 'UNKNOWN', displayName, taxId = null, contact = null, legacyCaseId = null, id = null }, actor) {
      if (!PERSON_TYPES.includes(personType)) fail('PERSON_TYPE', `tipo de pessoa desconhecido: ${personType}`);
      if (!displayName || !String(displayName).trim()) fail('DISPLAY_NAME_REQUIRED', 'reclamante exige nome');
      return repo.withTx(async (r) => {
        const row = await r.insertClaimant({ id, personType, displayName: String(displayName).trim(), taxId, contact, legacyCaseId, createdBy: actor?.userId });
        if (!row) return null;
        // payload SEM PII: só o tipo de pessoa
        await r.audit({ ...who(actor), eventType: 'recovery.claimant.created', entityType: 'claimant', entityId: row.id, payload: { personType }, source: SOURCE });
        return row;
      });
    },

    async createClaim({ claimantId, assetOriginId = 'BESC', claimKind = 'UNKNOWN', claimedSecurityClass = null, claimedQuantityWritten = null }, actor) {
      if (!CLAIM_KINDS.includes(claimKind)) fail('CLAIM_KIND', `tipo de reivindicação desconhecido: ${claimKind}`);
      return repo.withTx(async (r) => {
        if (!(await r.getClaimant(claimantId))) fail('NOT_FOUND', 'reclamante não encontrado');
        const gate = await r.getGate('multi_issuer_research_gate');
        assertOriginAcceptsClaims(assetOriginId, { multiIssuerGate: gate?.state || 'CLOSED' });
        const row = await r.insertClaim({ claimantId, assetOriginId, claimKind, claimedSecurityClass, claimedQuantityWritten, createdBy: actor?.userId });
        await r.audit({ ...who(actor), eventType: 'recovery.claim.created', entityType: 'claim', entityId: row.id, payload: { assetOriginId, claimKind }, source: SOURCE, reason: 'nova reivindicação (possível direito)' });
        await transition(r, { entityType: 'claim', entityId: row.id, from: 'DRAFT', to: 'OPEN', reason: 'reivindicação aberta para levantamento de evidências', actor });
        return { ...row, state: 'OPEN' };
      });
    },

    async transitionClaim(claimId, toState, reason, actor) {
      if (!reasonOk(reason, 10)) fail('REASON_REQUIRED', 'mudança de estado exige motivo (mín. 10 caracteres)');
      if (['VALIDATION_REQUESTED', 'RECOGNIZED', 'INCONCLUSIVE'].includes(toState)) {
        throw new DomainInvariantError('NOT_AVAILABLE_IN_PHASE', `${toState} exige validação externa real (fase F4); nenhuma confirmação é simulada`, { phase: 'F4' });
      }
      if (!F2_CLAIM_DESTINATIONS.includes(toState)) fail('TRANSITION_NOT_ALLOWED', `destino ${toState} não disponível`);
      return repo.withTx(async (r) => {
        const c = await requireClaim(r, claimId);
        if (isTerminal('claim', c.state)) fail('CLAIM_CLOSED', `claim ${c.state} não continua o workflow (correção = novo claim que supera este)`);
        if (!canTransition('claim', c.state, toState)) fail('TRANSITION_NOT_ALLOWED', `claim ${c.state} -> ${toState} não é permitida`);
        await transition(r, { entityType: 'claim', entityId: claimId, from: c.state, to: toState, reason, actor });
        return { ...c, state: toState };
      });
    },

    async ingestEvidence({ id = null, filePath, storageUri = null, originalFilename = null, mime = null, sizeBytes = null, claimantId = null, claimId = null, origin = 'OPERATOR_UPLOAD', notes = '' }, actor) {
      const sha256 = await hashFile(filePath);
      const attempt = (duplicateOf) => repo.withTx(async (r) => {
        if (claimantId && !(await r.getClaimant(claimantId))) fail('NOT_FOUND', 'reclamante não encontrado');
        let claim = null;
        if (claimId) {
          claim = await requireClaim(r, claimId);
          if (isTerminal('claim', claim.state)) fail('CLAIM_CLOSED', `claim ${claim.state} não recebe evidência`);
        }
        const original = sha256 && !duplicateOf ? await r.findOriginalEvidenceBySha(sha256) : null;
        const dup = duplicateOf || (original ? original.id : null);
        const ev = await r.insertEvidence({
          id, evidenceClass: 'LEGACY_EVIDENCE', origin, claimantId: claimantId || claim?.claimantId || null, originalFilename, mime, sizeBytes, storageUri,
          sha256, hashStatus: sha256 ? 'HASHED' : 'FILE_MISSING', duplicateOf: dup, receivedBy: actor?.userId,
        });
        if (!ev) return { evidence: await r.getEvidence(id), alreadyExisted: true };
        await r.audit({ ...who(actor), eventType: 'recovery.evidence.received', entityType: 'evidence', entityId: ev.id,
          payload: { sha256, hashStatus: ev.hashStatus, duplicateOf: dup, origin }, source: SOURCE });
        let state = 'RECEIVED';
        if (dup) state = await markSuspect(r, { ...ev, state }, `arquivo idêntico (SHA-256) já apresentado como evidência ${dup}`, actor);
        if (claim) {
          await r.linkEvidence({ claimId: claim.id, evidenceId: ev.id, role: 'SUPPORTING', linkedBy: actor?.userId });
          await r.audit({ ...who(actor), eventType: 'recovery.claim.evidence_linked', entityType: 'claim', entityId: claim.id, payload: { evidenceId: ev.id, role: 'SUPPORTING' }, source: SOURCE });
        }
        return { evidence: { ...ev, state }, duplicateOf: dup };
      });
      let out;
      try {
        out = await attempt(null);
      } catch (e) {
        if (!isUniqueViolation(e) || !sha256) throw e;
        // corrida: outro upload do mesmo arquivo gravou o original primeiro — registra como duplicata
        const original = await repo.read((r) => r.findOriginalEvidenceBySha(sha256));
        out = await attempt(original.id);
      }
      out.originCandidates = detectOriginCandidates(`${originalFilename || ''} ${notes || ''}`);
      return out;
    },

    async classifyEvidence(evidenceId, input, actor) {
      validateClassification(input);
      return repo.withTx(async (r) => {
        const ev = await requireEvidence(r, evidenceId);
        if (ev.evidenceClass !== 'LEGACY_EVIDENCE') fail('NOT_LEGACY_EVIDENCE', 'só evidência legada é classificada neste fluxo');
        if (ev.state === 'ARCHIVED') fail('EVIDENCE_ARCHIVED', 'evidência arquivada não é reclassificada');
        const latest = await r.latestClassification(evidenceId);
        if (latest && !reasonOk(input.reason, 10)) fail('REASON_REQUIRED', 'reclassificação é correção: exige motivo (mín. 10 caracteres)');
        const row = await r.insertClassification({
          evidenceId, documentKind: input.documentKind, sourceNature: input.sourceNature, originCandidate: input.originCandidate || null,
          securityClassWritten: input.securityClassWritten || null, certificateNumber: input.certificateNumber ? String(input.certificateNumber).trim() : null,
          quantityWritten: input.quantityWritten || null, documentDateWritten: input.documentDateWritten || null, notes: input.notes || null,
          supersedesId: latest ? latest.id : null, reason: latest ? input.reason : (input.reason || null), classifiedBy: actor?.userId,
        });
        await r.audit({ ...who(actor), eventType: latest ? 'recovery.evidence.classification.corrected' : 'recovery.evidence.classified', entityType: 'evidence', entityId: evidenceId,
          payload: { classificationId: row.id, documentKind: row.documentKind, sourceNature: row.sourceNature, supersedesId: row.supersedesId }, source: SOURCE, reason: latest ? input.reason : null });
        let state = ev.state;
        if (state === 'RECEIVED') {
          await transition(r, { entityType: 'legacy_evidence', entityId: evidenceId, from: 'RECEIVED', to: 'CLASSIFIED', reason: 'classificação registrada', actor });
          state = 'CLASSIFIED';
        }
        // Antifraude: o mesmo número de cautela apresentado por outro reclamante é suspeito.
        if (row.certificateNumber) {
          const uses = await r.findCertificateUses(row.originCandidate, row.certificateNumber);
          const conflict = uses.find((u) => u.evidenceId !== evidenceId && u.duplicateOf !== evidenceId && ev.duplicateOf !== u.evidenceId
            && (u.claimantId || null) !== (ev.claimantId || null));
          if (conflict) state = await markSuspect(r, { ...ev, state }, `número de cautela ${row.certificateNumber} já apresentado por outro reclamante (evidência ${conflict.evidenceId})`, actor);
        }
        if (state === 'CLASSIFIED' && (await r.isLinked(evidenceId))) {
          await transition(r, { entityType: 'legacy_evidence', entityId: evidenceId, from: 'CLASSIFIED', to: 'LINKED', reason: 'evidência classificada vinculada a reivindicação', actor });
          state = 'LINKED';
        }
        return { classification: row, state };
      });
    },

    async linkEvidence(claimId, evidenceId, role = 'SUPPORTING', actor) {
      if (!LINK_ROLES.includes(role)) fail('LINK_ROLE', `papel de vínculo desconhecido: ${role}`);
      return repo.withTx(async (r) => {
        const c = await requireClaim(r, claimId);
        if (isTerminal('claim', c.state)) fail('CLAIM_CLOSED', `claim ${c.state} não recebe evidência`);
        const ev = await requireEvidence(r, evidenceId);
        if (ev.state === 'ARCHIVED') fail('EVIDENCE_ARCHIVED', 'evidência arquivada não é vinculada');
        const created = await r.linkEvidence({ claimId, evidenceId, role, linkedBy: actor?.userId });
        if (created) await r.audit({ ...who(actor), eventType: 'recovery.claim.evidence_linked', entityType: 'claim', entityId: claimId, payload: { evidenceId, role }, source: SOURCE });
        if (ev.state === 'CLASSIFIED') await transition(r, { entityType: 'legacy_evidence', entityId: evidenceId, from: 'CLASSIFIED', to: 'LINKED', reason: 'evidência classificada vinculada a reivindicação', actor });
        return { linked: created, evidenceState: ev.state === 'CLASSIFIED' ? 'LINKED' : ev.state };
      });
    },

    async transitionEvidence(evidenceId, toState, reason, actor) {
      if (!reasonOk(reason, 10)) fail('REASON_REQUIRED', 'mudança de estado exige motivo (mín. 10 caracteres)');
      if (!F2_EVIDENCE_DESTINATIONS.includes(toState)) fail('TRANSITION_NOT_ALLOWED', `destino ${toState} não disponível (classificar e vincular têm fluxo próprio)`);
      return repo.withTx(async (r) => {
        const ev = await requireEvidence(r, evidenceId);
        if (toState === 'CLASSIFIED' && ev.state !== 'SUSPECT') fail('TRANSITION_NOT_ALLOWED', 'volta a CLASSIFIED só a partir de SUSPECT (suspeita afastada)');
        if (!canTransition('legacy_evidence', ev.state, toState)) fail('TRANSITION_NOT_ALLOWED', `evidência ${ev.state} -> ${toState} não é permitida`);
        await transition(r, { entityType: 'legacy_evidence', entityId: evidenceId, from: ev.state, to: toState, reason, actor });
        return { ...ev, state: toState };
      });
    },

    async recordValuation(claimId, input, actor) {
      if (!F2_VALUATION_TYPES.includes(input.valueType)) {
        throw new DomainInvariantError('NOT_AVAILABLE_IN_PHASE', `${input.valueType} exige confirmação externa ou ativo registrado (F4/F5)`, { phase: 'F4' });
      }
      return repo.withTx(async (r) => {
        await requireClaim(r, claimId);
        if (input.evidenceId) await requireEvidence(r, input.evidenceId);
        const v = createValuation({ ...input, subjectType: 'claim', subjectId: claimId, author: input.author || 'não informado', effectiveAt: input.effectiveAt || new Date().toISOString(), createdBy: actor?.userId });
        const row = await r.insertValuation(v);
        await r.audit({ ...who(actor), eventType: 'recovery.valuation.recorded', entityType: 'claim', entityId: claimId,
          payload: { valuationId: row.id, valueType: row.valueType, legalStatus: row.legalStatus, source: row.source }, source: SOURCE, evidenceRef: input.evidenceId || null });
        return row;
      });
    },

    // --- quatro-olhos (REQUEST -> REVIEW -> APPROVAL) ---
    async requestApproval({ action, subjectType, subjectId, payload = {}, reason }, actor) {
      const draft = createApprovalRequest({ id: 'pending', action, subjectType, subjectId, payload, reason }, actor);
      return repo.withTx(async (r) => {
        const row = await r.insertApproval({ action: draft.action, subjectType, subjectId: String(subjectId), payload, reason, requestedBy: draft.requestedBy });
        await r.audit({ ...who(actor), eventType: 'recovery.approval.requested', entityType: 'approval_request', entityId: row.id, payload: { action, subjectType, subjectId: String(subjectId) }, source: SOURCE, reason });
        return row;
      });
    },
    async reviewApproval(id, { notes } = {}, actor) {
      return repo.withTx(async (r) => {
        const current = await r.getApproval(id);
        if (!current) fail('NOT_FOUND', 'pedido de aprovação não encontrado');
        const next = review(current, actor, { notes });
        const row = await r.saveApprovalReview(next);
        await r.audit({ ...who(actor), eventType: 'recovery.approval.reviewed', entityType: 'approval_request', entityId: id, payload: { state: next.state }, source: SOURCE, reason: notes || null });
        return row;
      });
    },
    async decideApproval(id, { decision, notes } = {}, actor) {
      return repo.withTx(async (r) => {
        const current = await r.getApproval(id);
        if (!current) fail('NOT_FOUND', 'pedido de aprovação não encontrado');
        const next = decide(current, actor, { decision, notes });
        const row = await r.saveApprovalDecision(next);
        await r.audit({ ...who(actor), eventType: 'recovery.approval.decided', entityType: 'approval_request', entityId: id, payload: { decision }, source: SOURCE, reason: notes || null });
        return row;
      });
    },
    listApprovals: () => repo.read((r) => r.listApprovals()),
    listGates: () => repo.read((r) => r.listGates()),

    // --- leitura ---
    async listClaims() {
      const list = await repo.read((r) => r.listClaims());
      return list.map((c) => ({ ...c, stage: claimStage(c.state, { hasRegisteredAsset: c.hasRegisteredAsset }), stageLabel: STAGE[claimStage(c.state, { hasRegisteredAsset: c.hasRegisteredAsset })] }));
    },

    async getClaimView(claimId) {
      return repo.read(async (r) => {
        const claim = await requireClaim(r, claimId);
        const claimant = await r.getClaimant(claim.claimantId);
        const evidence = [];
        for (const e of await r.listEvidence({ claimId })) {
          const classification = await r.latestClassification(e.id);
          evidence.push({ ...e, classification, documentKindLabel: classification ? DOCUMENT_KIND_LABELS[classification.documentKind] : null });
        }
        const transitions = await r.listTransitions('claim', claimId);
        const valuations = await r.listValuations('claim', claimId);
        const hasRegisteredAsset = await r.hasRegisteredAsset(claimId);
        const origin = getOrigin(claim.assetOriginId);
        const stage = claimStage(claim.state, { hasRegisteredAsset });
        const missing = missingEvidence({ claim, claimant, evidence });
        const allClassified = evidence.length > 0 && evidence.every((e) => e.classification);
        const stepStatus = {
          upload: evidence.length ? 'DONE' : 'PENDING',
          identification: allClassified ? 'DONE' : evidence.length ? 'IN_PROGRESS' : 'PENDING',
          origin: origin ? 'DONE' : 'PENDING',
          corporate_events: origin && origin.corporateEvents.length ? 'DONE' : 'RESEARCH_PENDING',
          successor: origin && origin.successor ? 'DONE' : 'RESEARCH_PENDING',
          missing_evidence: missing.some((m) => !m.phase) ? 'PENDING' : 'DONE',
        };
        const journey = JOURNEY.map((s) => ({
          ...s,
          status: s.phase === 'F2' ? (stepStatus[s.key] || 'PENDING') : 'NOT_AVAILABLE_IN_PHASE',
        }));
        return {
          claim: { ...claim, stage, stageLabel: STAGE[stage] },
          claimant: claimant ? { id: claimant.id, personType: claimant.personType, displayName: claimant.displayName } : null,
          origin: origin ? { id: origin.id, name: origin.name, status: origin.status, successor: origin.successor, corporateEvents: origin.corporateEvents, notes: origin.notes } : null,
          evidence, transitions, valuations, missingEvidence: missing, journey,
          allowedTransitions: F2_CLAIM_DESTINATIONS.filter((to) => canTransition('claim', claim.state, to)),
          notice: 'Possível direito: nenhuma confirmação externa foi obtida. Documento antigo não é ativo.',
        };
      });
    },

    async getEvidenceView(evidenceId) {
      return repo.read(async (r) => {
        const ev = await requireEvidence(r, evidenceId);
        return { evidence: ev, classifications: await r.listClassifications(evidenceId), transitions: await r.listTransitions('legacy_evidence', evidenceId) };
      });
    },

    // --- migração LegacyCase -> Claimant/Claim/LegacyEvidence (idempotente, preserva ids) ---
    // seededCases: 'skip' (padrão) | 'migrate'. Casos marcados "[caso-fonte:" foram criados pelo
    // carregador do operador (seed/seed-cases.mjs) a partir de clientes citados no acervo. NÃO é
    // demonstração embutida: a escolha de migrá-los é do operador (BESC_MIGRATE_SEEDED_CASES).
    async migrateLegacyCase(legacyCase, { attachmentPath, attachmentUri, seededCases = 'skip' }) {
      const c = legacyCase;
      if (/\[caso-fonte:/.test(c.notes || '') && seededCases !== 'migrate') {
        return { caseId: c.id, status: 'SKIPPED_SEEDED_CASE', note: 'caso criado pelo carregador seed-cases (marca [caso-fonte:]); não migrado sem decisão explícita do operador (BESC_MIGRATE_SEEDED_CASES=migrate)' };
      }
      const system = { userId: null, role: 'system', ip: null };
      return repo.withTx(async (r) => {
        const counts = { evidence: 0, duplicates: 0, filesMissing: 0, valuations: 0, valuationsUnparseable: 0, invalidIds: 0 };
        let claimant = await r.findClaimantByLegacyCase(c.id);
        if (!claimant) {
          const personType = { pessoa_fisica: 'PF', herdeiro: 'PF', cessionario: 'PF', empresa: 'PJ', espolio: 'ESTATE' }[c.holder_type] || 'UNKNOWN';
          claimant = await r.insertClaimant({ personType, displayName: c.holder_name || '(sem titular informado)', taxId: c.holder_tax_id || null, contact: c.contact || null, legacyCaseId: c.id });
          await r.audit({ ...who(system), eventType: 'recovery.claimant.created', entityType: 'claimant', entityId: claimant.id, payload: { personType, legacy: true }, source: 'legacy-case-migration' });
        }
        let claim = await r.findClaimByLegacyCase(c.id);
        const created = !claim;
        if (!claim) {
          const claimKind = { acionario_remanescente: 'BOOK_ENTRY_POSITION', creditorio_indenizatorio: 'DAMAGES' }[c.right_type] || 'UNKNOWN';
          claim = await r.insertClaim({ id: UUID_RE.test(String(c.id)) ? c.id : null, claimantId: claimant.id, assetOriginId: 'BESC', claimKind, claimedSecurityClass: c.share_class && c.share_class !== 'unknown' ? c.share_class : null,
            claimedQuantityWritten: c.share_quantity ? String(c.share_quantity) : null, legacyCaseId: c.id, legacyStatus: c.status || null });
          const why = `migração do caso legado (status legado: ${c.status || 'n/d'})`;
          const early = ['new', 'docs_incomplete'];
          const analysis = ['legal_review', 'awaiting_calculation', 'awaiting_opinion', 'ready_for_structuring', 'ready_with_caveats'];
          // not_eligible e archived ficam em DRAFT: a migração não toma decisão de domínio por ninguém
          if (early.includes(c.status) || analysis.includes(c.status)) {
            await transition(r, { entityType: 'claim', entityId: claim.id, from: 'DRAFT', to: 'OPEN', reason: why, actor: system });
            const to = early.includes(c.status) ? 'EVIDENCE_GATHERING' : 'UNDER_ANALYSIS';
            await transition(r, { entityType: 'claim', entityId: claim.id, from: 'OPEN', to, reason: why, actor: system });
          }
        }
        for (const doc of c.documents || []) {
          for (const att of doc.attachments || []) {
            if (!UUID_RE.test(String(att.id))) { counts.invalidIds++; continue; } // id legado fora do padrão: não migra, conta
            if (await r.getEvidence(att.id)) continue; // já migrado (idempotente)
            const filePath = attachmentPath(c.id, att.id, att.ext);
            const sha256 = await hashFile(filePath);
            if (!sha256) counts.filesMissing++;
            const original = sha256 ? await r.findOriginalEvidenceBySha(sha256) : null;
            const ev = await r.insertEvidence({ id: att.id, evidenceClass: 'LEGACY_EVIDENCE', origin: 'LEGACY_CASE_MIGRATION', claimantId: claimant.id, legacyCaseId: c.id,
              legacyDocKey: doc.key, originalFilename: att.filename || null, mime: att.mime || null, sizeBytes: att.size ?? null, storageUri: attachmentUri(c.id, att.id, att.ext),
              sha256, hashStatus: sha256 ? 'HASHED' : 'FILE_MISSING', duplicateOf: original ? original.id : null });
            counts.evidence++;
            await r.audit({ ...who(system), eventType: 'recovery.evidence.received', entityType: 'evidence', entityId: ev.id, payload: { sha256, hashStatus: ev.hashStatus, duplicateOf: ev.duplicateOf, origin: 'LEGACY_CASE_MIGRATION' }, source: 'legacy-case-migration' });
            const cls = classificationForLegacyDocKey(doc.key);
            await r.insertClassification({ evidenceId: ev.id, documentKind: cls.documentKind, sourceNature: cls.sourceNature, originCandidate: 'BESC', notes: `checklist legado: ${doc.key}`, classifiedBy: null });
            const role = { IDENTITY: 'IDENTITY', PROBATE: 'SUCCESSION', ASSIGNMENT_CONTRACT: 'ASSIGNMENT' }[cls.documentKind] || 'SUPPORTING';
            await r.linkEvidence({ claimId: claim.id, evidenceId: ev.id, role, linkedBy: null });
            if (ev.duplicateOf) {
              counts.duplicates++;
              await transition(r, { entityType: 'legacy_evidence', entityId: ev.id, from: 'RECEIVED', to: 'SUSPECT', reason: `arquivo idêntico (SHA-256) já apresentado como evidência ${ev.duplicateOf}`, actor: system });
            } else {
              await transition(r, { entityType: 'legacy_evidence', entityId: ev.id, from: 'RECEIVED', to: 'CLASSIFIED', reason: 'classificação derivada do checklist legado', actor: system });
              await transition(r, { entityType: 'legacy_evidence', entityId: ev.id, from: 'CLASSIFIED', to: 'LINKED', reason: 'vinculada à reivindicação migrada', actor: system });
            }
          }
        }
        // Perícia vira expert_estimate (SOURCE_CLAIM); valor estimado do caso vira claimed_value.
        const per = c.pericia || {};
        const perValue = parseBRL(per.updated_value_pericial);
        if (per.updated_value_pericial && perValue === null) counts.valuationsUnparseable++;
        if (perValue !== null && !(await r.findValuationByLegacy(c.id, 'expert_estimate'))) {
          const v = createValuation({ valueType: 'expert_estimate', subjectType: 'claim', subjectId: claim.id, amount: perValue, source: 'PRIVATE_APPRAISAL',
            methodology: 'laudo informado no levantamento legado (campo pericia.updated_value_pericial); não confirma titularidade nem valor', author: per.perito || 'não informado',
            confidence: 0, legalStatus: 'SOURCE_CLAIM', effectiveAt: per.updatedAt || c.updatedAt || new Date().toISOString(), legacyCaseId: c.id });
          await r.insertValuation(v); counts.valuations++;
        }
        const est = parseBRL(c.estimated_value);
        if (c.estimated_value && est === null) counts.valuationsUnparseable++;
        if (est !== null && !(await r.findValuationByLegacy(c.id, 'claimed_value'))) {
          const v = createValuation({ valueType: 'claimed_value', subjectType: 'claim', subjectId: claim.id, amount: est, source: 'CLAIMANT',
            methodology: 'valor estimado informado no levantamento legado', author: 'reclamante (via operador)', confidence: 0, legalStatus: 'SOURCE_CLAIM',
            effectiveAt: c.updatedAt || new Date().toISOString(), legacyCaseId: c.id });
          await r.insertValuation(v); counts.valuations++;
        }
        const changed = created || counts.evidence > 0 || counts.valuations > 0;
        if (changed) {
          await r.audit({ ...who(system), eventType: 'recovery.legacy_case.migrated', entityType: 'claim', entityId: claim.id, payload: { created, ...counts }, source: 'legacy-case-migration' });
        }
        return { caseId: c.id, claimId: claim.id, status: created ? 'MIGRATED' : (changed ? 'UPDATED' : 'ALREADY_MIGRATED'), counts };
      });
    },
  };
  return service;
}

// Quatro-olhos (Passo 13): REQUEST -> REVIEW -> APPROVAL. Quem cria nunca revisa nem aprova o
// próprio ato. Espelhado por CHECKs e trigger de congelamento na tabela approval_request
// (sql/0007_asset_recovery.sql). Funções puras: devolvem o novo objeto, não mutam.
import { fail } from './errors.js';

export const ACTIONS = Object.freeze([
  'ASSET_MANUAL_CONFIRMATION', // confirmação externa registrada manualmente
  'CHAIN_OF_TITLE_CHANGE',     // alteração da cadeia de titularidade
  'LEGAL_OPINION',             // registro/aceite de parecer jurídico
  'RECOGNIZED_VALUATION',      // valuation reconhecido (recognized_value)
  'GATE_CHANGE',               // mudança de gate de governança (ex.: multi_issuer_research_gate)
  'COLLATERAL_CREATION',       // futura criação de garantia (F6)
]);

export const STATES = Object.freeze(['REQUESTED', 'IN_REVIEW', 'APPROVED', 'REJECTED', 'CANCELLED']);

const actorId = (a) => (typeof a === 'string' ? a : a && a.userId);

export function createApprovalRequest({ id, action, subjectType, subjectId, payload = {}, reason }, requester) {
  if (!ACTIONS.includes(action)) fail('UNKNOWN_ACTION', `ação sensível desconhecida: ${action}`);
  if (!subjectType || !subjectId) fail('SUBJECT_REQUIRED', 'pedido de aprovação exige sujeito');
  if (!reason || String(reason).trim().length < 10) fail('REASON_REQUIRED', 'pedido de aprovação exige justificativa (mín. 10 caracteres)');
  const requestedBy = actorId(requester);
  if (!requestedBy) fail('ACTOR_REQUIRED', 'pedido de aprovação exige ator identificado');
  return {
    id, action, subjectType, subjectId, payload, reason,
    state: 'REQUESTED', requestedBy, requestedAt: new Date().toISOString(),
    reviewedBy: null, reviewedAt: null, reviewNotes: null,
    approvedBy: null, approvedAt: null, decision: null, decisionNotes: null,
  };
}

export function review(req, reviewer, { notes } = {}) {
  const reviewedBy = actorId(reviewer);
  if (req.state !== 'REQUESTED') fail('INVALID_STATE', `revisão só a partir de REQUESTED (atual: ${req.state})`);
  if (!reviewedBy) fail('ACTOR_REQUIRED', 'revisão exige ator identificado');
  if (reviewedBy === req.requestedBy) fail('SELF_REVIEW', 'quem criou o pedido não pode revisá-lo');
  return { ...req, state: 'IN_REVIEW', reviewedBy, reviewedAt: new Date().toISOString(), reviewNotes: notes || null };
}

export function decide(req, approver, { decision, notes } = {}) {
  const approvedBy = actorId(approver);
  if (req.state !== 'IN_REVIEW') fail('INVALID_STATE', `decisão só após revisão (atual: ${req.state})`);
  if (!['APPROVED', 'REJECTED'].includes(decision)) fail('INVALID_DECISION', 'decisão deve ser APPROVED ou REJECTED');
  if (!approvedBy) fail('ACTOR_REQUIRED', 'decisão exige ator identificado');
  if (approvedBy === req.requestedBy) fail('SELF_APPROVAL', 'quem criou o pedido não pode aprovar o próprio ato sensível');
  return { ...req, state: decision, decision, approvedBy, approvedAt: new Date().toISOString(), decisionNotes: notes || null };
}

export function isApproved(req, { action, subjectId } = {}) {
  return !!req && req.decision === 'APPROVED' && req.state === 'APPROVED'
    && (!action || req.action === action) && (!subjectId || req.subjectId === subjectId)
    && req.approvedBy && req.approvedBy !== req.requestedBy && req.reviewedBy && req.reviewedBy !== req.requestedBy;
}

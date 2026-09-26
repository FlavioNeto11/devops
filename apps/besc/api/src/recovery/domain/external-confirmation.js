// ExternalConfirmation: a única prova que move um direito para frente. Regra do ADR-010:
//   NO EXTERNAL CONFIRMATION = NO REGISTERED ASSET.
// Este módulo espelha EXATAMENTE a função SQL external_confirmation_satisfies_gate()
// (sql/0007_asset_recovery.sql). Qualquer mudança aqui exige a mesma mudança lá e o teste de
// contrato (test/recovery-pg.test.mjs) roda o mesmo conjunto de casos nas duas implementações.

// Fontes futuras de confirmação. SIMULATION existe apenas para desenvolvimento e NUNCA satisfaz
// o gate de ativo real — ela pode chegar a CONFIRMED na própria tabela para os fluxos de dev
// rodarem, mas o gate a recusa sempre.
export const SOURCES = Object.freeze([
  'BOOKKEEPER', 'CENTRAL_DEPOSITORY', 'CUSTODIAN', 'ISSUER', 'SUCCESSOR_ISSUER', 'REGISTRAR', 'COURT', 'REGULATED_ENTITY', 'SIMULATION',
]);
export const REAL_SOURCES = Object.freeze(SOURCES.filter((s) => s !== 'SIMULATION'));

// Quem pode confirmar o REGISTRO de uma posição (system of record jurídico). Um tribunal pode
// reconhecer um direito, mas o registro da posição é confirmado por quem mantém o registro.
export const REGISTRATION_SOURCES = Object.freeze(['BOOKKEEPER', 'CENTRAL_DEPOSITORY', 'REGISTRAR', 'CUSTODIAN']);

export const PURPOSES = Object.freeze(['RIGHT_RECOGNITION', 'REGISTRATION']);

// Como a confirmação chegou. MANUAL_ENTRY (alguém digitou o resultado de um ofício, e-mail,
// extrato) exige aprovação quatro-olhos ASSET_MANUAL_CONFIRMATION.
export const METHODS = Object.freeze(['API', 'FILE', 'OFFICIAL_CORRESPONDENCE', 'COURT_SYSTEM', 'MANUAL_ENTRY', 'SIMULATED']);

export const STATES = Object.freeze(['REQUESTED', 'PENDING', 'CONFIRMED', 'REJECTED', 'INCONCLUSIVE', 'EXPIRED']);

// Avalia o gate para um propósito e um sujeito. Retorna { ok, reasons[] } (sem exceção) para que
// a UI e o log mostrem POR QUE algo não avança.
export function evaluateAssetGate(confirmation, { purpose, subjectType, subjectId, approval = null, now = new Date() } = {}) {
  const reasons = [];
  if (!confirmation) return { ok: false, reasons: ['NO_EXTERNAL_CONFIRMATION'] };
  const c = confirmation;
  if (c.state !== 'CONFIRMED') reasons.push('NOT_CONFIRMED');
  if (!c.source || c.source === 'SIMULATION' || !REAL_SOURCES.includes(c.source)) reasons.push('SOURCE_NOT_REAL');
  if (c.method === 'SIMULATED') reasons.push('SIMULATED_METHOD');
  if (c.expiresAt && new Date(c.expiresAt).getTime() <= new Date(now).getTime()) reasons.push('EXPIRED');
  if (!c.evidenceId) reasons.push('NO_EVIDENCE');
  // Extrato/ofício enviado pelo reclamante é LEGACY_EVIDENCE e não confirma nada: só documento
  // vindo do system of record (EXTERNAL_EVIDENCE) sustenta uma confirmação.
  else if (c.evidenceClass !== 'EXTERNAL_EVIDENCE') reasons.push('EVIDENCE_NOT_EXTERNAL');
  if (!c.externalReference || !String(c.externalReference).trim()) reasons.push('NO_EXTERNAL_REFERENCE');
  if (purpose && c.purpose !== purpose) reasons.push('WRONG_PURPOSE');
  if (purpose === 'REGISTRATION' && !REGISTRATION_SOURCES.includes(c.source)) reasons.push('SOURCE_CANNOT_CONFIRM_REGISTRATION');
  if (subjectType && (c.subjectType !== subjectType || c.subjectId !== subjectId)) reasons.push('SUBJECT_MISMATCH');
  if (c.method === 'MANUAL_ENTRY') {
    const approved = approval && approval.id === c.approvalId && approval.action === 'ASSET_MANUAL_CONFIRMATION'
      && approval.decision === 'APPROVED' && approval.subjectId === c.id
      && approval.approvedBy && approval.approvedBy !== approval.requestedBy
      && approval.reviewedBy && approval.reviewedBy !== approval.requestedBy;
    if (!approved) reasons.push('MANUAL_ENTRY_WITHOUT_FOUR_EYES');
  }
  return { ok: reasons.length === 0, reasons };
}

export function satisfiesAssetGate(confirmation, ctx) {
  return evaluateAssetGate(confirmation, ctx).ok;
}

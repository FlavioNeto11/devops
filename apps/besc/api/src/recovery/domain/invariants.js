// Invariantes de classe (Passo 5). Nenhum código consegue pular etapas:
//   LegacyEvidence != Asset · Claim != Asset · RecognizedRight != RegisteredAsset
// As funções de promoção abaixo são as ÚNICAS que produzem RecognizedRight e RegisteredAsset;
// o banco repete as mesmas guardas por trigger (sql/0007_asset_recovery.sql).
import { KIND } from './model.js';
import { evaluateAssetGate } from './external-confirmation.js';
import { fail } from './errors.js';

export function kindOf(obj) {
  return obj && typeof obj === 'object' ? obj.kind || null : null;
}

// Porta de entrada de toda capacidade futura que consome ativo (garantia, custódia,
// liquidação, representação regulada). Qualquer outra classe é recusada com o motivo.
export function assertRegisteredAsset(obj) {
  const k = kindOf(obj);
  if (k !== KIND.registered_asset) {
    const why = {
      [KIND.legacy_evidence]: 'evidência legada (documento) não é ativo',
      [KIND.claim]: 'reivindicação (possível direito) não é ativo',
      [KIND.recognized_right]: 'direito reconhecido ainda não registrado não é ativo registrado',
      [KIND.registration_request]: 'pedido de registro não é ativo',
      [KIND.external_confirmation]: 'confirmação não é ativo',
    }[k] || 'objeto sem classe de ativo registrado';
    fail('NOT_A_REGISTERED_ASSET', why, { kind: k });
  }
  if (obj.state !== 'REGISTERED') fail('ASSET_NOT_ACTIVE', `ativo registrado em estado ${obj.state}`);
  if (!obj.externalConfirmationId) fail('ASSET_WITHOUT_CONFIRMATION', 'ativo registrado sem confirmação externa');
  return obj;
}

// Claim -> RecognizedRight: exige Claim em VALIDATION_REQUESTED e confirmação externa válida
// para RIGHT_RECOGNITION cujo sujeito é o próprio Claim.
export function recognizeRight({ id, claim, confirmation, approval = null, rightKind, quantity = null, securityRef = null, now }) {
  if (kindOf(claim) !== KIND.claim) fail('NOT_A_CLAIM', 'reconhecimento de direito parte de um Claim');
  if (claim.state === 'REJECTED' || claim.state === 'WITHDRAWN') fail('CLAIM_CLOSED', `claim ${claim.state} não continua o workflow`);
  if (claim.state !== 'VALIDATION_REQUESTED') fail('CLAIM_NOT_READY', `claim precisa estar em VALIDATION_REQUESTED (atual: ${claim.state})`);
  const gate = evaluateAssetGate(confirmation, { purpose: 'RIGHT_RECOGNITION', subjectType: 'claim', subjectId: claim.id, approval, now });
  if (!gate.ok) fail('EXTERNAL_CONFIRMATION_REQUIRED', 'direito só é reconhecido com confirmação externa válida', { reasons: gate.reasons });
  if (!['BOOK_ENTRY_SHARES', 'CASH_CREDIT_AGAINST_ISSUER', 'LITIGIOUS_CREDIT'].includes(rightKind)) fail('RIGHT_KIND', `tipo de direito desconhecido: ${rightKind}`);
  return {
    kind: KIND.recognized_right, id, claimId: claim.id, confirmationId: confirmation.id,
    rightKind, quantity, securityRef, state: 'RECOGNIZED', recognizedAt: new Date().toISOString(),
  };
}

// RecognizedRight -> RegisteredAsset: exige direito de ações escriturais, pedido de registro
// pendente/concluído do mesmo direito e confirmação externa de REGISTRO (fonte que mantém o
// registro: escriturador, depositário central, registradora, custodiante), nunca SIMULATION.
export function registerAsset({ id, recognizedRight, registrationRequest, confirmation, claim, approval = null, accountReference, now }) {
  if (kindOf(recognizedRight) !== KIND.recognized_right) fail('NOT_A_RECOGNIZED_RIGHT', 'ativo registrado parte de um RecognizedRight');
  if (claim && (claim.state === 'REJECTED' || claim.state === 'WITHDRAWN')) fail('CLAIM_CLOSED', 'claim encerrado não gera ativo');
  if (recognizedRight.state !== 'REGISTRATION_REQUESTED') fail('RIGHT_NOT_IN_REGISTRATION', `direito precisa estar em REGISTRATION_REQUESTED (atual: ${recognizedRight.state})`);
  if (recognizedRight.rightKind !== 'BOOK_ENTRY_SHARES') fail('RIGHT_NOT_REGISTRABLE', 'somente direito sobre ações escriturais vira ativo registrado; crédito litigioso não');
  if (kindOf(registrationRequest) !== KIND.registration_request || registrationRequest.recognizedRightId !== recognizedRight.id) {
    fail('REGISTRATION_REQUEST_REQUIRED', 'ativo exige pedido de registro do mesmo direito');
  }
  if (!['REQUESTED', 'PENDING'].includes(registrationRequest.state)) fail('REGISTRATION_REQUEST_STATE', `pedido de registro em ${registrationRequest.state}`);
  const gate = evaluateAssetGate(confirmation, { purpose: 'REGISTRATION', subjectType: 'registration_request', subjectId: registrationRequest.id, approval, now });
  if (!gate.ok) fail('EXTERNAL_CONFIRMATION_REQUIRED', 'NO EXTERNAL CONFIRMATION = NO REGISTERED ASSET', { reasons: gate.reasons });
  if (!accountReference) fail('ACCOUNT_REFERENCE_REQUIRED', 'ativo registrado exige a referência da conta no system of record');
  return {
    kind: KIND.registered_asset, id, recognizedRightId: recognizedRight.id, registrationRequestId: registrationRequest.id,
    externalConfirmationId: confirmation.id, systemOfRecord: confirmation.source, accountReference,
    securityRef: recognizedRight.securityRef, quantity: recognizedRight.quantity, state: 'REGISTERED', registeredAt: new Date().toISOString(),
  };
}

// Converter documento ou reivindicação diretamente em ativo é sempre erro — existe para que
// qualquer atalho futuro falhe com mensagem explícita, e para o teste provar a regra.
export function toAsset(obj) {
  const k = kindOf(obj);
  if (k === KIND.registered_asset) return assertRegisteredAsset(obj);
  fail('NO_SHORTCUT_TO_ASSET', `${k || 'objeto'} não vira ativo: percorra Claim -> validação externa -> direito reconhecido -> registro confirmado`, { kind: k });
}

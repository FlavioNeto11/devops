// Domínio de Legacy Asset Recovery (ADR-010). Fonte ÚNICA das máquinas de estado: a migração
// sql/0007_asset_recovery.sql semeia `allowed_transition` com exatamente estas tuplas, e o teste
// test/recovery-pg.test.mjs falha se o banco e este módulo divergirem.
//
// Cadeia de classes (nenhuma etapa pode ser pulada):
//   LegacyEvidence -> Claim -> ClaimValidation (ExternalConfirmation) -> RecognizedRight
//     -> RegistrationRequest -> ExternalConfirmation (registro) -> RegisteredAsset
// Somente RegisteredAsset pode alimentar, no futuro, Collateral, Custody, Settlement e
// RegulatedRepresentation (ver ports/). LegacyEvidence != Asset; Claim != Asset;
// RecognizedRight != RegisteredAsset.

export const ENTITY = Object.freeze({
  LEGACY_EVIDENCE: 'legacy_evidence',
  CLAIM: 'claim',
  CLAIM_VALIDATION: 'claim_validation',
  EXTERNAL_CONFIRMATION: 'external_confirmation',
  RECOGNIZED_RIGHT: 'recognized_right',
  REGISTRATION_REQUEST: 'registration_request',
  REGISTERED_ASSET: 'registered_asset',
});

// Etiqueta de classe carregada por todo objeto de domínio (kind). É ela que as portas de
// garantia/custódia/liquidação/representação verificam.
export const KIND = Object.freeze({
  legacy_evidence: 'LegacyEvidence',
  claim: 'Claim',
  claim_validation: 'ClaimValidation',
  external_confirmation: 'ExternalConfirmation',
  recognized_right: 'RecognizedRight',
  registration_request: 'RegistrationRequest',
  registered_asset: 'RegisteredAsset',
});

export const STATES = Object.freeze({
  legacy_evidence: ['RECEIVED', 'CLASSIFIED', 'LINKED', 'SUSPECT', 'ARCHIVED'],
  claim: ['DRAFT', 'OPEN', 'EVIDENCE_GATHERING', 'UNDER_ANALYSIS', 'VALIDATION_REQUESTED', 'INCONCLUSIVE', 'LITIGATION', 'RECOGNIZED', 'REJECTED', 'WITHDRAWN'],
  claim_validation: ['REQUESTED', 'CONFIRMED', 'DENIED', 'INCONCLUSIVE', 'CANCELLED'],
  external_confirmation: ['REQUESTED', 'PENDING', 'CONFIRMED', 'REJECTED', 'INCONCLUSIVE', 'EXPIRED'],
  recognized_right: ['RECOGNIZED', 'REGISTRATION_REQUESTED', 'REGISTERED', 'REVOKED'],
  registration_request: ['REQUESTED', 'PENDING', 'COMPLETED', 'REJECTED', 'CANCELLED'],
  registered_asset: ['REGISTERED', 'CLOSED'],
});

export const INITIAL_STATE = Object.freeze({
  legacy_evidence: 'RECEIVED',
  claim: 'DRAFT',
  claim_validation: 'REQUESTED',
  external_confirmation: 'REQUESTED',
  recognized_right: 'RECOGNIZED',
  registration_request: 'REQUESTED',
  registered_asset: 'REGISTERED',
});

// [from, to] permitidos. Estados sem saída são terminais: REJECTED/WITHDRAWN do Claim nunca
// voltam ao fluxo (uma rejeição equivocada se corrige com um NOVO Claim que referencia o antigo).
export const TRANSITIONS = Object.freeze({
  legacy_evidence: [
    ['RECEIVED', 'CLASSIFIED'], ['RECEIVED', 'SUSPECT'], ['RECEIVED', 'ARCHIVED'],
    ['CLASSIFIED', 'LINKED'], ['CLASSIFIED', 'SUSPECT'], ['CLASSIFIED', 'ARCHIVED'],
    ['LINKED', 'SUSPECT'], ['LINKED', 'ARCHIVED'],
    ['SUSPECT', 'CLASSIFIED'], ['SUSPECT', 'ARCHIVED'],
  ],
  claim: [
    ['DRAFT', 'OPEN'], ['DRAFT', 'WITHDRAWN'],
    ['OPEN', 'EVIDENCE_GATHERING'], ['OPEN', 'UNDER_ANALYSIS'], ['OPEN', 'REJECTED'], ['OPEN', 'WITHDRAWN'],
    ['EVIDENCE_GATHERING', 'UNDER_ANALYSIS'], ['EVIDENCE_GATHERING', 'REJECTED'], ['EVIDENCE_GATHERING', 'WITHDRAWN'],
    ['UNDER_ANALYSIS', 'EVIDENCE_GATHERING'], ['UNDER_ANALYSIS', 'VALIDATION_REQUESTED'], ['UNDER_ANALYSIS', 'LITIGATION'],
    ['UNDER_ANALYSIS', 'REJECTED'], ['UNDER_ANALYSIS', 'WITHDRAWN'],
    ['VALIDATION_REQUESTED', 'RECOGNIZED'], ['VALIDATION_REQUESTED', 'INCONCLUSIVE'], ['VALIDATION_REQUESTED', 'LITIGATION'],
    ['VALIDATION_REQUESTED', 'REJECTED'],
    ['INCONCLUSIVE', 'UNDER_ANALYSIS'], ['INCONCLUSIVE', 'LITIGATION'], ['INCONCLUSIVE', 'REJECTED'],
    ['LITIGATION', 'VALIDATION_REQUESTED'], ['LITIGATION', 'REJECTED'],
  ],
  claim_validation: [
    ['REQUESTED', 'CONFIRMED'], ['REQUESTED', 'DENIED'], ['REQUESTED', 'INCONCLUSIVE'], ['REQUESTED', 'CANCELLED'],
  ],
  external_confirmation: [
    ['REQUESTED', 'PENDING'], ['REQUESTED', 'REJECTED'], ['REQUESTED', 'EXPIRED'],
    ['PENDING', 'CONFIRMED'], ['PENDING', 'REJECTED'], ['PENDING', 'INCONCLUSIVE'], ['PENDING', 'EXPIRED'],
    ['CONFIRMED', 'EXPIRED'],
  ],
  recognized_right: [
    ['RECOGNIZED', 'REGISTRATION_REQUESTED'], ['RECOGNIZED', 'REVOKED'],
    ['REGISTRATION_REQUESTED', 'RECOGNIZED'], ['REGISTRATION_REQUESTED', 'REGISTERED'], ['REGISTRATION_REQUESTED', 'REVOKED'],
    ['REGISTERED', 'REVOKED'],
  ],
  registration_request: [
    ['REQUESTED', 'PENDING'], ['REQUESTED', 'CANCELLED'], ['REQUESTED', 'REJECTED'],
    ['PENDING', 'COMPLETED'], ['PENDING', 'REJECTED'], ['PENDING', 'CANCELLED'],
  ],
  registered_asset: [
    ['REGISTERED', 'CLOSED'],
  ],
});

// Transições que só o serviço de domínio pode executar, porque exigem prova externa. As rotas
// genéricas de transição recusam estes destinos; o banco reforça com as funções de gate.
export const GUARDED_TRANSITIONS = Object.freeze({
  claim: { RECOGNIZED: 'exige ClaimValidation CONFIRMED com ExternalConfirmation válida' },
  claim_validation: { CONFIRMED: 'exige ExternalConfirmation válida (não SIMULATION)' },
  recognized_right: { REGISTERED: 'exige RegisteredAsset criado a partir de ExternalConfirmation de registro' },
  registration_request: { COMPLETED: 'exige ExternalConfirmation de registro válida' },
});

const TRANSITION_SET = Object.fromEntries(
  Object.entries(TRANSITIONS).map(([entity, pairs]) => [entity, new Set(pairs.map(([f, t]) => `${f}>${t}`))]),
);

export function isKnownState(entity, state) {
  return Array.isArray(STATES[entity]) && STATES[entity].includes(state);
}

export function canTransition(entity, from, to) {
  return !!TRANSITION_SET[entity] && TRANSITION_SET[entity].has(`${from}>${to}`);
}

export function isTerminal(entity, state) {
  return isKnownState(entity, state) && !TRANSITIONS[entity].some(([f]) => f === state);
}

// Etapas da jornada exibidas ao usuário (Passo 9). `phase` marca o que está disponível nesta
// rodada (F1/F2) e o que só existirá depois (F3–F5) — a UI nunca finge integração.
export const JOURNEY = Object.freeze([
  { key: 'upload', label: 'Upload / cadastro do documento', phase: 'F2', stage: 'POSSIBLE_RIGHT' },
  { key: 'identification', label: 'Identificação (tipo, natureza da fonte, origem candidata)', phase: 'F2', stage: 'POSSIBLE_RIGHT' },
  { key: 'origin', label: 'Origem do ativo (AssetOrigin candidata)', phase: 'F2', stage: 'POSSIBLE_RIGHT' },
  { key: 'corporate_events', label: 'Eventos societários da origem', phase: 'F2', stage: 'POSSIBLE_RIGHT' },
  { key: 'successor', label: 'Sucessor e escriturador atual', phase: 'F2', stage: 'POSSIBLE_RIGHT' },
  { key: 'chain_of_title', label: 'Cadeia de titularidade (chain of title)', phase: 'F3', stage: 'POSSIBLE_RIGHT' },
  { key: 'legal_issues', label: 'Questões jurídicas (prescrição, sucessão, cessão)', phase: 'F3', stage: 'POSSIBLE_RIGHT' },
  { key: 'missing_evidence', label: 'Evidências faltantes', phase: 'F2', stage: 'POSSIBLE_RIGHT' },
  { key: 'external_validation_request', label: 'Pedido de validação externa', phase: 'F4', stage: 'POSSIBLE_RIGHT' },
  { key: 'regularization', label: 'Processo de regularização', phase: 'F4', stage: 'POSSIBLE_RIGHT' },
  { key: 'external_confirmation', label: 'Confirmação externa (escriturador, depositário, tribunal)', phase: 'F4', stage: 'CONFIRMED_RIGHT' },
  { key: 'registered_asset', label: 'Ativo registrado', phase: 'F5', stage: 'REGISTERED_ASSET' },
]);

// Os três rótulos que a interface precisa distinguir sem ambiguidade.
export const STAGE = Object.freeze({
  POSSIBLE_RIGHT: 'POSSÍVEL DIREITO',
  CONFIRMED_RIGHT: 'DIREITO CONFIRMADO',
  REGISTERED_ASSET: 'ATIVO REGISTRADO',
});

// Estágio exibível de um Claim. Um Claim nunca é "ativo": no máximo DIREITO CONFIRMADO.
export function claimStage(claimState, { hasRegisteredAsset = false } = {}) {
  if (hasRegisteredAsset) return 'REGISTERED_ASSET';
  if (claimState === 'RECOGNIZED') return 'CONFIRMED_RIGHT';
  return 'POSSIBLE_RIGHT';
}

// Valuation 2.0 (Passo 7). Elimina a relação PERÍCIA -> VALOR DO ATIVO do marketplace antigo.
// Cada tipo de valor responde a uma pergunta diferente e NENHUM é convertido automaticamente em
// outro. Espelhado por CHECKs e trigger na tabela valuation (sql/0007_asset_recovery.sql).
import { fail } from './errors.js';

export const VALUE_TYPES = Object.freeze([
  'claimed_value',     // o que o reclamante (ou seu laudo, petição, vendedor) afirma
  'historical_value',  // valor documental de época (face da cautela, cotação/reembolso histórico)
  'expert_estimate',   // estimativa de perito (privado ou judicial) — opinião, não confirmação
  'recognized_value',  // valor reconhecido a partir de confirmação externa + quatro-olhos
  'market_value',      // valor de mercado de um ativo REGISTRADO (fonte de mercado)
  'collateral_value',  // valor elegível como garantia de um ativo REGISTRADO (futuro, F6)
  'liquidation_value', // produto efetivo de uma execução/venda (futuro)
]);

// Natureza jurídica do número. SOURCE_CLAIM = alegação de terceiro; nunca vira fato da plataforma.
export const LEGAL_STATUSES = Object.freeze(['SOURCE_CLAIM', 'HISTORICAL_FACT', 'EXTERNALLY_CONFIRMED', 'MARKET_OBSERVED', 'EXECUTED']);

export const SOURCES = Object.freeze([
  'CLAIMANT', 'PRIVATE_APPRAISAL', 'COURT_EXPERT', 'PETITION', 'COMMERCIAL_MATERIAL',
  'CORPORATE_DOCUMENT', 'HISTORICAL_QUOTE', 'EXTERNAL_CONFIRMATION', 'MARKET_DATA', 'EXECUTION',
]);

// Rótulo jurídico e fonte AMARRADOS ao tipo (hardening ADR-010): um número de alegação não pode
// carregar o rótulo "confirmado externamente", "observado no mercado" ou "fato histórico" por escolha
// de quem registra. Espelhado por CHECK em sql/0011_valuation_label_binding.sql.
export const LEGAL_STATUS_BY_TYPE = Object.freeze({
  claimed_value: 'SOURCE_CLAIM', expert_estimate: 'SOURCE_CLAIM', historical_value: 'HISTORICAL_FACT',
  recognized_value: 'EXTERNALLY_CONFIRMED', market_value: 'MARKET_OBSERVED', collateral_value: 'MARKET_OBSERVED',
  liquidation_value: 'EXECUTED',
});
export const SOURCES_BY_TYPE = Object.freeze({
  claimed_value: ['CLAIMANT', 'PETITION', 'COMMERCIAL_MATERIAL'],
  expert_estimate: ['PRIVATE_APPRAISAL', 'COURT_EXPERT'],
  historical_value: ['CORPORATE_DOCUMENT', 'HISTORICAL_QUOTE'],
  recognized_value: ['EXTERNAL_CONFIRMATION'],
  market_value: ['MARKET_DATA'], collateral_value: ['MARKET_DATA'], liquidation_value: ['EXECUTION'],
});

const REQUIRED = ['valueType', 'subjectType', 'subjectId', 'amount', 'currency', 'source', 'methodology', 'author', 'effectiveAt', 'confidence', 'legalStatus'];

// Tipos que só podem existir sobre um RegisteredAsset e com fonte de mercado/execução.
const ASSET_ONLY = ['market_value', 'collateral_value', 'liquidation_value'];
const OPINION_TYPES = ['claimed_value', 'expert_estimate'];

export function validateValuation(v) {
  for (const f of REQUIRED) if (v[f] === undefined || v[f] === null || v[f] === '') fail('VALUATION_FIELD_REQUIRED', `valuation exige ${f}`);
  if (!VALUE_TYPES.includes(v.valueType)) fail('VALUATION_TYPE', `tipo de valor desconhecido: ${v.valueType}`);
  if (!LEGAL_STATUSES.includes(v.legalStatus)) fail('VALUATION_LEGAL_STATUS', `legal_status desconhecido: ${v.legalStatus}`);
  if (!SOURCES.includes(v.source)) fail('VALUATION_SOURCE', `fonte desconhecida: ${v.source}`);
  if (!(Number(v.confidence) >= 0 && Number(v.confidence) <= 1)) fail('VALUATION_CONFIDENCE', 'confidence deve estar entre 0 e 1');
  // Proveniência obrigatória: documento (evidenceId) ou, para valores migrados, o caso legado de origem.
  if (!v.evidenceId && !v.legacyCaseId && v.valueType !== 'claimed_value') fail('VALUATION_EVIDENCE', 'valuation exige evidência (evidenceId)');
  if (OPINION_TYPES.includes(v.valueType) && v.legalStatus !== 'SOURCE_CLAIM') {
    fail('OPINION_IS_SOURCE_CLAIM', `${v.valueType} é sempre SOURCE_CLAIM (opinião/alegação), nunca fato da plataforma`);
  }
  if (v.valueType === 'historical_value' && !['CORPORATE_DOCUMENT', 'HISTORICAL_QUOTE'].includes(v.source)) {
    fail('HISTORICAL_SOURCE', 'historical_value exige documento societário ou cotação histórica');
  }
  if (v.valueType === 'recognized_value') {
    if (v.source !== 'EXTERNAL_CONFIRMATION' || v.legalStatus !== 'EXTERNALLY_CONFIRMED') fail('RECOGNIZED_NEEDS_CONFIRMATION', 'recognized_value exige fonte EXTERNAL_CONFIRMATION');
    if (!v.basisConfirmationId) fail('RECOGNIZED_NEEDS_CONFIRMATION', 'recognized_value exige basisConfirmationId');
    if (!v.approvalId) fail('RECOGNIZED_NEEDS_FOUR_EYES', 'recognized_value exige aprovação quatro-olhos RECOGNIZED_VALUATION');
  }
  if (ASSET_ONLY.includes(v.valueType)) {
    if (v.subjectType !== 'registered_asset') fail('VALUE_REQUIRES_REGISTERED_ASSET', `${v.valueType} só existe sobre RegisteredAsset`);
    const okSource = v.valueType === 'liquidation_value' ? 'EXECUTION' : 'MARKET_DATA';
    if (v.source !== okSource) fail('VALUE_SOURCE', `${v.valueType} exige fonte ${okSource}`);
  }
  // por último: amarração geral rótulo/fonte (as regras específicas acima explicam melhor o erro)
  if (v.legalStatus !== LEGAL_STATUS_BY_TYPE[v.valueType]) {
    fail('VALUATION_LABEL_MISMATCH', `${v.valueType} só pode ter legal_status ${LEGAL_STATUS_BY_TYPE[v.valueType]} (recebido ${v.legalStatus})`);
  }
  if (!SOURCES_BY_TYPE[v.valueType].includes(v.source)) {
    fail('VALUATION_SOURCE_MISMATCH', `${v.valueType} exige fonte em ${SOURCES_BY_TYPE[v.valueType].join('/')} (recebido ${v.source})`);
  }
  return true;
}

// Derivar um valor de outro. A regra central: expert_estimate e claimed_value NUNCA viram
// recognized_value, market_value ou collateral_value — nem por cálculo, nem por "atualização".
export function assertDerivationAllowed(from, toType) {
  if (!from) return true;
  if (OPINION_TYPES.includes(from.valueType) && ['recognized_value', ...ASSET_ONLY].includes(toType)) {
    fail('OPINION_CANNOT_BECOME_FACT', `${from.valueType} não pode originar ${toType}: opinião/alegação não confirma titularidade nem valor`);
  }
  if (from.valueType === 'historical_value' && ASSET_ONLY.includes(toType)) {
    fail('HISTORICAL_CANNOT_BECOME_MARKET', 'valor histórico não é valor de mercado de ativo registrado');
  }
  return true;
}

export function createValuation(input, { derivedFrom = null } = {}) {
  const v = {
    currency: 'BRL', createdAt: new Date().toISOString(), ...input,
    derivedFromId: derivedFrom ? derivedFrom.id : input.derivedFromId || null,
  };
  assertDerivationAllowed(derivedFrom, v.valueType);
  validateValuation(v);
  return v;
}

// Perícia privada NÃO confirma titularidade: serve apenas como SOURCE_CLAIM.
export function fromPrivateAppraisal({ subjectType, subjectId, amount, author, methodology, evidenceId, effectiveAt }) {
  return createValuation({
    valueType: 'expert_estimate', subjectType, subjectId, amount, author, methodology: methodology || 'laudo privado (metodologia declarada pelo autor)',
    evidenceId, effectiveAt: effectiveAt || new Date().toISOString(), source: 'PRIVATE_APPRAISAL', confidence: 0, legalStatus: 'SOURCE_CLAIM',
  });
}

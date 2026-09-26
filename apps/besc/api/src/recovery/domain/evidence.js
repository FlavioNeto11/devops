// Evidência legada (F2). Um documento entra como LegacyEvidence: hash, origem e classificação.
// A classificação diz O QUE o documento é e QUAL a natureza da fonte — nunca que existe um ativo.
import { SOURCE_NATURES } from './source-claims.js';
import { fail } from './errors.js';

export const DOCUMENT_KINDS = Object.freeze([
  'CERTIFICATE', 'OLD_STATEMENT', 'DIVIDEND_NOTICE', 'COURT_DECISION', 'PROBATE', 'ASSIGNMENT_CONTRACT',
  'PRIVATE_APPRAISAL', 'POWER_OF_ATTORNEY', 'IDENTITY', 'CORRESPONDENCE', 'OTHER',
]);

export const DOCUMENT_KIND_LABELS = Object.freeze({
  CERTIFICATE: 'Cautela / certificado de ações',
  OLD_STATEMENT: 'Extrato ou comprovante antigo',
  DIVIDEND_NOTICE: 'Aviso de proventos',
  COURT_DECISION: 'Decisão judicial',
  PROBATE: 'Inventário / partilha / óbito',
  ASSIGNMENT_CONTRACT: 'Contrato de cessão',
  PRIVATE_APPRAISAL: 'Laudo privado',
  POWER_OF_ATTORNEY: 'Procuração',
  IDENTITY: 'Documento de identificação',
  CORRESPONDENCE: 'Correspondência / ofício',
  OTHER: 'Outro',
});

export const CLAIM_KINDS = Object.freeze(['BOOK_ENTRY_POSITION', 'UNCONVERTED_POSITION', 'UNPAID_PROCEEDS', 'FRACTION_PROCEEDS', 'DAMAGES', 'UNKNOWN']);
export const PERSON_TYPES = Object.freeze(['PF', 'PJ', 'ESTATE', 'UNKNOWN']);
export const LINK_ROLES = Object.freeze(['SUPPORTING', 'IDENTITY', 'SUCCESSION', 'ASSIGNMENT', 'CONTRARY']);

export function validateClassification(input) {
  if (!DOCUMENT_KINDS.includes(input.documentKind)) fail('DOCUMENT_KIND', `tipo de documento desconhecido: ${input.documentKind}`);
  if (!SOURCE_NATURES[input.sourceNature]) fail('SOURCE_NATURE', `natureza de fonte desconhecida: ${input.sourceNature}`);
  // Laudo privado nunca é "documento primário"; decisão sem trânsito verificado nunca é "definitiva".
  // Trânsito em julgado só se verifica com certidão/consulta oficial (fase F4): em F1/F2 nenhuma
  // evidência é classificada como decisão definitiva (natureza que poderia virar fato da plataforma).
  if (input.sourceNature === 'FINAL_COURT_DECISION') {
    fail('FINALITY_NOT_VERIFIED', 'decisão definitiva exige verificação de trânsito em julgado (fase F4); classifique como NON_FINAL_COURT_DECISION');
  }
  if (input.documentKind === 'PRIVATE_APPRAISAL' && input.sourceNature !== 'PRIVATE_APPRAISAL') {
    fail('APPRAISAL_NATURE', 'laudo privado tem natureza PRIVATE_APPRAISAL (alegação), não fonte primária');
  }
  return true;
}

// Mapeamento do checklist do levantamento legado (domain.js DOCUMENT_TEMPLATE) para a nova
// classificação. Decisões judiciais do levantamento entram como NON_FINAL_COURT_DECISION: o
// trânsito em julgado nunca foi verificado pelo sistema legado.
export const LEGACY_DOC_KEY_MAP = Object.freeze({
  besc_share_certificate: { documentKind: 'CERTIFICATE', sourceNature: 'PRIMARY_CORPORATE_DOCUMENT' },
  share_statement: { documentKind: 'OLD_STATEMENT', sourceNature: 'PRIMARY_CORPORATE_DOCUMENT' },
  acquisition_docs: { documentKind: 'OTHER', sourceNature: 'UNKNOWN' },
  ownership_docs: { documentKind: 'OTHER', sourceNature: 'UNKNOWN' },
  assignability_docs: { documentKind: 'OTHER', sourceNature: 'UNKNOWN' },
  valuation_report: { documentKind: 'PRIVATE_APPRAISAL', sourceNature: 'PRIVATE_APPRAISAL' },
  legal_opinion: { documentKind: 'OTHER', sourceNature: 'EXPERT_OPINION' },
  initial_petition: { documentKind: 'OTHER', sourceNature: 'PETITION' },
  sentence: { documentKind: 'COURT_DECISION', sourceNature: 'NON_FINAL_COURT_DECISION' },
  appellate_decision: { documentKind: 'COURT_DECISION', sourceNature: 'NON_FINAL_COURT_DECISION' },
  appeals: { documentKind: 'OTHER', sourceNature: 'PETITION' },
  judicial_calculations: { documentKind: 'OTHER', sourceNature: 'NON_FINAL_COURT_DECISION' },
  death_certificate: { documentKind: 'PROBATE', sourceNature: 'OFFICIAL_PUBLICATION' },
  formal_partition: { documentKind: 'PROBATE', sourceNature: 'OFFICIAL_PUBLICATION' },
  assignment_contract: { documentKind: 'ASSIGNMENT_CONTRACT', sourceNature: 'UNKNOWN' },
  power_of_attorney: { documentKind: 'POWER_OF_ATTORNEY', sourceNature: 'UNKNOWN' },
  identity_doc: { documentKind: 'IDENTITY', sourceNature: 'OFFICIAL_PUBLICATION' },
  address_proof: { documentKind: 'IDENTITY', sourceNature: 'UNKNOWN' },
});

export function classificationForLegacyDocKey(key) {
  return LEGACY_DOC_KEY_MAP[key] || { documentKind: 'OTHER', sourceNature: 'UNKNOWN' };
}

// Evidências faltantes para um possível direito (F2: regras de completude, não de mérito).
export function missingEvidence({ claim, claimant, evidence }) {
  const kinds = new Set(evidence.filter((e) => e.state !== 'ARCHIVED' && e.classification).map((e) => e.classification.documentKind));
  const out = [];
  if (!kinds.has('CERTIFICATE') && !kinds.has('OLD_STATEMENT') && !kinds.has('DIVIDEND_NOTICE')) {
    out.push({ key: 'position_evidence', label: 'Documento que indique a posição histórica (cautela, extrato ou aviso de proventos)' });
  }
  if (!kinds.has('IDENTITY')) out.push({ key: 'identity', label: 'Identificação do reclamante' });
  if (claimant && claimant.personType === 'ESTATE' && !kinds.has('PROBATE')) {
    out.push({ key: 'probate', label: 'Formal de partilha, alvará ou nomeação de inventariante' });
  }
  if (evidence.some((e) => e.classification && e.classification.documentKind === 'ASSIGNMENT_CONTRACT') && claim) {
    out.push({ key: 'assignment_registry', label: 'Prova de averbação da cessão no escriturador (cessão por instrumento particular não transfere ação escritural)' });
  }
  out.push({ key: 'bookkeeper_statement', label: 'Extrato atual do escriturador/depositário (só obtido por canal oficial — fase F4)', phase: 'F4' });
  return out;
}

// Camadas editoriais aplicadas na LEITURA do acervo (ADR-010, Passo 2 + hardening P1).
// O seed e o store não são alterados: `outcome`, títulos e textos originais continuam lá. Aqui se
// anexa a classificação e se decide a PUBLICAÇÃO, com uma regra só:
//
//     UNKNOWN ≠ PUBLIC. Conteúdo sem natureza/proveniência classificada é RESTRITO por padrão.
//     Só aparece sem autenticação o que estiver explicitamente marcado PUBLIC_SAFE — e PUBLIC_SAFE
//     nunca vale para natureza UNKNOWN.
//
// Precedência: curadoria gravada no item (PUT /…/:id/curation) → arquivo de classificação do seed
// (content-classification.json / jurisprudence-reassessment.json) → padrão RESTRICTED.
import { readFileSync } from 'node:fs';
import { SOURCE_NATURES } from '../recovery/domain/source-claims.js';

const load = (name) => {
  try { return JSON.parse(readFileSync(new URL(`../../seed/${name}`, import.meta.url), 'utf8')); } catch { return null; }
};
const REASSESSMENT = load('jurisprudence-reassessment.json') || { entries: {} };
const CLASSIFICATION = load('content-classification.json') || { library: {} };

export const PUBLICATION = Object.freeze({ PUBLIC_SAFE: 'PUBLIC_SAFE', RESTRICTED: 'RESTRICTED' });
// Publicar material de terceiros ou laudo exige referência de autorização (ADR-009).
export const NEEDS_AUTHORIZATION = new Set(['COMMERCIAL_MATERIAL', 'CONSULTANCY', 'PRIVATE_APPRAISAL', 'PETITION']);

export const JURIS_DISCLAIMER = REASSESSMENT.disclaimer
  || 'Decisão não reavaliada. Nenhuma decisão do acervo prova que ações BESC existem hoje, têm valor, são líquidas ou transferíveis.';

function decidePublication(nature, requested) {
  if (!nature || nature === 'UNKNOWN') return PUBLICATION.RESTRICTED;
  return requested === PUBLICATION.PUBLIC_SAFE ? PUBLICATION.PUBLIC_SAFE : PUBLICATION.RESTRICTED;
}

// ---- validação da curadoria (usada pelas rotas PUT /library/:id/curation e /jurisprudence/:id/curation)
export function validateCuration(body = {}) {
  const errors = [];
  const { sourceNature, publication, reason, authorizationRef } = body;
  if (!SOURCE_NATURES[sourceNature]) errors.push('sourceNature desconhecida');
  if (!Object.values(PUBLICATION).includes(publication)) errors.push('publication deve ser PUBLIC_SAFE ou RESTRICTED');
  if (!reason || String(reason).trim().length < 10) errors.push('motivo obrigatório (mín. 10 caracteres)');
  if (publication === PUBLICATION.PUBLIC_SAFE) {
    if (sourceNature === 'UNKNOWN') errors.push('natureza UNKNOWN nunca é pública');
    if (sourceNature === 'FINAL_COURT_DECISION') errors.push('decisão definitiva exige verificação de trânsito, fora desta fase');
    if (NEEDS_AUTHORIZATION.has(sourceNature) && !(authorizationRef && String(authorizationRef).trim().length >= 5)) {
      errors.push('publicar material de terceiro, petição ou laudo exige referência de autorização (authorizationRef)');
    }
  }
  return errors;
}

// ---- biblioteca
export function libraryClassification(item) {
  const cur = item && item.curation;
  const base = (item && CLASSIFICATION.library[item.id]) || null;
  const sourceNature = (cur && cur.sourceNature) || (base && base.sourceNature) || 'UNKNOWN';
  const publication = decidePublication(sourceNature, (cur && cur.publication) || (base && base.publication));
  return {
    sourceNature, publication,
    classificationBasis: cur ? 'curator' : base ? 'classification-file' : 'default-restricted',
    warning: (base && base.warning) || (cur ? null : 'Item sem classificação editorial: restrito até a curadoria definir natureza e publicação.'),
    labelCorrection: base && base.labelCorrection,
  };
}

export function withLibraryClassification(item, view = item) {
  const c = libraryClassification(item);
  return {
    ...view, sourceNature: c.sourceNature, verification: 'SOURCE_CLAIM', publication: c.publication,
    classificationBasis: c.classificationBasis, warning: c.warning, ...(c.labelCorrection ? { labelCorrection: c.labelCorrection } : {}),
  };
}

// ---- jurisprudência
const UNASSESSED = Object.freeze({
  verification: 'SOURCE_CLAIM', assessed: false, isDecision: null, sourceNature: 'UNKNOWN',
  finality: 'NOT_VERIFIED', finalityBasis: 'item fora da reavaliação de 25/09/2026', provisional: null,
});

export function jurisAssessment(id) {
  const e = REASSESSMENT.entries[id];
  if (!e) return UNASSESSED;
  return { assessed: true, reassessedAt: REASSESSMENT.reassessedAt, basis: REASSESSMENT.basis, ...e };
}

export function jurisPublication(item) {
  const cur = item && item.curation;
  const a = jurisAssessment(item.id);
  const sourceNature = (cur && cur.sourceNature) || a.sourceNature || 'UNKNOWN';
  return decidePublication(sourceNature, (cur && cur.publication) || a.publication);
}

// Resultado a exibir: o corrigido quando a reavaliação verificou; senão o do seed, sempre ao lado.
export function assessedOutcome(item) {
  const a = jurisAssessment(item.id);
  return Object.prototype.hasOwnProperty.call(a, 'correctedOutcome') ? a.correctedOutcome : item.outcome;
}

export function withJurisAssessment(item, view = item) {
  const a = jurisAssessment(item.id);
  return { ...view, outcomeAssessed: assessedOutcome(item), assessment: a, publication: jurisPublication(item), disclaimer: JURIS_DISCLAIMER };
}

// ---- quem vê o quê
// Conteúdo restrito só para quem cura o conteúdo; o público não o vê em lista, detalhe nem arquivo.
export function canSeeResearch(req) {
  const a = req && req.auth;
  if (!a || a.user.approvalStatus !== 'active') return false;
  return !!(a.perms.get('content:write') || a.perms.get('*'));
}

export function libraryVisibleTo(req, item) {
  return libraryClassification(item).publication === PUBLICATION.PUBLIC_SAFE || canSeeResearch(req);
}

export function jurisVisibleTo(req, item) {
  return jurisPublication(item) === PUBLICATION.PUBLIC_SAFE || canSeeResearch(req);
}

export const REASSESSMENT_META = Object.freeze({ reassessedAt: REASSESSMENT.reassessedAt, basis: REASSESSMENT.basis, count: Object.keys(REASSESSMENT.entries).length });

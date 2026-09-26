// Camadas editoriais aplicadas na LEITURA do acervo (ADR-010, Passo 2).
// O seed e o store não são alterados: `outcome`, títulos e textos originais continuam lá, e as
// edições do operador também. Aqui só se anexa a classificação da reconciliação:
//   - jurisprudence-reassessment.json  (gerado por tools/gen-jurisprudence-assessment.mjs)
//   - content-classification.json      (natureza e visibilidade de cada item da biblioteca)
// Item sem classificação é tratado de forma conservadora: natureza UNKNOWN, alegação de fonte.
import { readFileSync } from 'node:fs';

const load = (name) => {
  try { return JSON.parse(readFileSync(new URL(`../../seed/${name}`, import.meta.url), 'utf8')); } catch { return null; }
};
const REASSESSMENT = load('jurisprudence-reassessment.json') || { entries: {} };
const CLASSIFICATION = load('content-classification.json') || { library: {} };

export const JURIS_DISCLAIMER = REASSESSMENT.disclaimer
  || 'Decisão não reavaliada. Nenhuma decisão do acervo prova que ações BESC existem hoje, têm valor, são líquidas ou transferíveis.';

const UNASSESSED = Object.freeze({
  verification: 'SOURCE_CLAIM', assessed: false, isDecision: null, sourceNature: 'UNKNOWN',
  finality: 'NOT_VERIFIED', finalityBasis: 'item fora da reavaliação de 25/09/2026', provisional: null,
});

export function jurisAssessment(id) {
  const e = REASSESSMENT.entries[id];
  if (!e) return UNASSESSED;
  return { assessed: true, reassessedAt: REASSESSMENT.reassessedAt, basis: REASSESSMENT.basis, ...e };
}

// Resultado a exibir: o corrigido quando a reavaliação verificou; senão o do seed, sempre ao lado.
export function assessedOutcome(item) {
  const a = jurisAssessment(item.id);
  return Object.prototype.hasOwnProperty.call(a, 'correctedOutcome') ? a.correctedOutcome : item.outcome;
}

export function withJurisAssessment(item) {
  const a = jurisAssessment(item.id);
  return { ...item, outcomeAssessed: assessedOutcome(item), assessment: a, disclaimer: JURIS_DISCLAIMER };
}

export function libraryClassification(id) {
  return CLASSIFICATION.library[id] || { sourceNature: 'UNKNOWN', visibility: 'public', warning: 'Item sem classificação editorial: trate como alegação de fonte.' };
}

export function withLibraryClassification(item) {
  const c = libraryClassification(item.id);
  return { ...item, sourceNature: c.sourceNature, verification: 'SOURCE_CLAIM', visibility: c.visibility, warning: c.warning, ...(c.labelCorrection ? { labelCorrection: c.labelCorrection } : {}) };
}

// Itens de pesquisa só para quem cura o conteúdo; o público não os vê em lista, detalhe nem arquivo.
export function canSeeResearch(req) {
  const a = req && req.auth;
  if (!a || a.user.approvalStatus !== 'active') return false;
  return !!(a.perms.get('content:write') || a.perms.get('*'));
}

export function libraryVisibleTo(req, item) {
  return libraryClassification(item.id).visibility !== 'research' || canSeeResearch(req);
}

export const REASSESSMENT_META = Object.freeze({ reassessedAt: REASSESSMENT.reassessedAt, basis: REASSESSMENT.basis, count: Object.keys(REASSESSMENT.entries).length });

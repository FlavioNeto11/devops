// source_claim × platform_verified_fact (Passo 2). O histórico e a pesquisa continuam
// armazenados, mas uma afirmação só é servida como fato da plataforma quando tem fonte primária
// verificável. Tudo que vem de petição, consultoria, material comercial, laudo privado ou decisão
// não definitiva é servido como ALEGAÇÃO DE FONTE, com a natureza explícita.
import { fail } from './errors.js';

export const VERIFICATION = Object.freeze({ PLATFORM_VERIFIED_FACT: 'PLATFORM_VERIFIED_FACT', SOURCE_CLAIM: 'SOURCE_CLAIM' });

// Natureza da fonte, na ordem de hierarquia usada na reconciliação.
export const SOURCE_NATURES = Object.freeze({
  PRIMARY_CORPORATE_DOCUMENT: { label: 'Documento societário primário', canBeFact: true },
  REGULATOR_RECORD: { label: 'Registro/ato de regulador', canBeFact: true },
  STATUTE: { label: 'Norma legal', canBeFact: true },
  OFFICIAL_PUBLICATION: { label: 'Publicação oficial', canBeFact: true },
  FINAL_COURT_DECISION: { label: 'Decisão judicial definitiva', canBeFact: true },
  NON_FINAL_COURT_DECISION: { label: 'Decisão judicial não definitiva', canBeFact: false },
  EXPERT_OPINION: { label: 'Parecer', canBeFact: false },
  PETITION: { label: 'Petição/alegação de parte', canBeFact: false },
  PRIVATE_APPRAISAL: { label: 'Laudo privado', canBeFact: false },
  CONSULTANCY: { label: 'Material de consultoria', canBeFact: false },
  COMMERCIAL_MATERIAL: { label: 'Material comercial de terceiros', canBeFact: false },
  PRESS: { label: 'Imprensa', canBeFact: false },
  INTERNAL_HYPOTHESIS: { label: 'Hipótese interna', canBeFact: false },
  UNKNOWN: { label: 'Fonte não identificada', canBeFact: false },
});

export function statement({ id, text, nature, sourceRef = null, attributedTo = null, verification, finality = null, warning = null }) {
  if (!SOURCE_NATURES[nature]) fail('UNKNOWN_SOURCE_NATURE', `natureza de fonte desconhecida: ${nature}`);
  const v = verification || (SOURCE_NATURES[nature].canBeFact && sourceRef ? VERIFICATION.PLATFORM_VERIFIED_FACT : VERIFICATION.SOURCE_CLAIM);
  if (v === VERIFICATION.PLATFORM_VERIFIED_FACT) {
    if (!SOURCE_NATURES[nature].canBeFact) fail('CLAIM_CANNOT_BE_FACT', `afirmação de natureza ${nature} não pode ser servida como fato da plataforma`);
    if (!sourceRef) fail('FACT_NEEDS_SOURCE', 'fato da plataforma exige referência de fonte');
  }
  return Object.freeze({
    id, text, nature, natureLabel: SOURCE_NATURES[nature].label, sourceRef, attributedTo, verification: v, finality,
    warning: v === VERIFICATION.SOURCE_CLAIM ? (warning || `Alegação de fonte (${SOURCE_NATURES[nature].label}). Não é afirmação da plataforma.`) : warning,
  });
}

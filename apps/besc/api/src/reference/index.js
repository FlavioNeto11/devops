// Agrega os dados de referencia estaticos servidos em /meta.reference e /glossary.
// Tabela de custas de cartorio removida na curadoria 2026-07-10 (varia por Estado/ano,
// inviavel manter atualizada — docs/evolution/11-curadoria-conteudo.md).
import { GLOSSARY } from './glossary.js';
import { VALUE_PROPOSITION, HISTORY_TIMELINE, MECHANISMS, LEGAL_BASIS, JURISPRUDENCE_PATTERN, SHARE_CONVERSION } from './portal-content.js';

export const REFERENCE = {
  glossary: GLOSSARY,
  valueProposition: VALUE_PROPOSITION,
  historyTimeline: HISTORY_TIMELINE,
  mechanisms: MECHANISMS,
  legalBasis: LEGAL_BASIS,
  shareConversion: SHARE_CONVERSION,
  jurisprudencePattern: JURISPRUDENCE_PATTERN,
};

export { GLOSSARY };

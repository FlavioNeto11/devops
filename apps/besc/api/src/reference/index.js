// Agrega os dados de referência estáticos servidos em /meta.reference e /glossary (ADR-010).
// Fatos da plataforma no topo; afirmações de terceiros só sob `thirdPartyClaims`, com aviso.
// Tabela de custas de cartório removida na curadoria 2026-07-10 (docs/evolution/11-curadoria-conteudo.md).
import { GLOSSARY } from './glossary.js';
import { POSITIONING, PLATFORM_FACTS, THIRD_PARTY_CLAIMS } from './portal-content.js';

export const REFERENCE = Object.freeze({
  positioning: POSITIONING,
  glossary: GLOSSARY,
  historyTimeline: PLATFORM_FACTS.historyTimeline,
  shareConversion: PLATFORM_FACTS.shareConversion,
  legalBasis: PLATFORM_FACTS.legalBasis,
  thirdPartyClaims: THIRD_PARTY_CLAIMS,
});

export { GLOSSARY };

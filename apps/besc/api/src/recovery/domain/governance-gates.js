// Gates de governança do domínio (Passo 11). O multi_issuer_research_gate nasce CLOSED: a escala
// multi-emissor NÃO está comprovada (repo besc, docs/reconciliation/12: floats remanescentes de
// 0,15% a 2,5% nos pares verificados; 15 pares não pesquisados). Nenhum número de TAM é usado
// como justificativa enquanto o gate estiver fechado. Mudar um gate exige aprovação quatro-olhos
// GATE_CHANGE (espelhado por trigger em governance_gate, sql/0007_asset_recovery.sql).
import { getOrigin } from './asset-origins.js';
import { fail } from './errors.js';

export const GATES = Object.freeze({
  multi_issuer_research_gate: Object.freeze({ initial: 'CLOSED', states: ['CLOSED', 'OPEN'], purpose: 'aceitar Claims de origens além da família BESC' }),
});

// Um Claim só pode apontar para origem ACTIVE; origens RESEARCH_PENDING exigem, além do status,
// o gate multi-emissor aberto. Com o gate CLOSED, só a família BESC é aceita.
export function assertOriginAcceptsClaims(originId, { multiIssuerGate = 'CLOSED' } = {}) {
  const origin = getOrigin(originId);
  if (!origin) fail('UNKNOWN_ORIGIN', `origem desconhecida: ${originId}`);
  if (origin.status !== 'ACTIVE') {
    fail('ORIGIN_RESEARCH_PENDING', `origem ${originId} está ${origin.status}: sem pesquisa com fonte primária, não recebe Claims`, { multiIssuerGate });
  }
  if (origin.id !== 'BESC' && multiIssuerGate !== 'OPEN') {
    fail('MULTI_ISSUER_GATE_CLOSED', 'multi_issuer_research_gate CLOSED: somente a família BESC é aceita nesta fase');
  }
  return origin;
}

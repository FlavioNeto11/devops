/**
 * Tipos e constantes da verificação de regularidade RNTRC (PR-C1, DL-103).
 *
 * Bounded context TRANSPORTE — espelha 1:1 os CHECKs da migration
 * `027_transport_rntrc_verifications.sql` — mudou lá, muda aqui no mesmo PR (e vice-versa).
 *
 * Distinção central deste PR (guia do programa, pendência P4): dado aberto é CACHE INFORMATIVO,
 * não prova de regularidade — `resultStatus`/`dataReferenceDate` vivem separados do
 * `rntrc_status` declarado em `transport_parties`; a composição "active (open_data,
 * dataDate=...)" acontece na camada de relatório (evaluators/serviço), nunca aqui.
 */

export const RNTRC_VERIFICATION_STRATEGIES = ['open_data', 'manual', 'antt'] as const;
export type RntrcVerificationStrategy = (typeof RNTRC_VERIFICATION_STRATEGIES)[number];

/** Estratégias aceitas HOJE via API (`antt` fica reservada — sem credenciais nesta fase). */
export const RNTRC_VERIFICATION_REQUESTABLE_STRATEGIES = ['open_data', 'manual'] as const;
export type RntrcVerificationRequestableStrategy = (typeof RNTRC_VERIFICATION_REQUESTABLE_STRATEGIES)[number];

export const RNTRC_VERIFICATION_REQUESTED_STATUSES = ['pending', 'succeeded', 'failed'] as const;
export type RntrcVerificationRequestedStatus = (typeof RNTRC_VERIFICATION_REQUESTED_STATUSES)[number];

/**
 * Resultado de UMA verificação — universo MAIOR que `RntrcStatus` (`transport-party-types.ts`):
 * inclui `not_found` (documento ausente do dado consultado) e `unknown` (dado encontrado, mas sem
 * situação clara — ex.: `PENDENTE` no dado aberto da ANTT, que não é nem regular nem irregular).
 */
export const RNTRC_VERIFICATION_RESULT_STATUSES = [
  'active',
  'suspended',
  'cancelled',
  'expired',
  'not_found',
  'unknown'
] as const;
export type RntrcVerificationResultStatus = (typeof RNTRC_VERIFICATION_RESULT_STATUSES)[number];

export const RNTRC_VERIFICATION_RESULT_CATEGORIES = ['TAC', 'ETC', 'CTC'] as const;
export type RntrcVerificationResultCategory = (typeof RNTRC_VERIFICATION_RESULT_CATEGORIES)[number];

/** Linha de `rntrc_verifications` já mapeada para camelCase. */
export interface RntrcVerification {
  id: string;
  integrationAccountId: string;
  partyId: string;
  rntrcNumber: string | null;
  requestedStatus: RntrcVerificationRequestedStatus;
  strategy: RntrcVerificationStrategy;
  resultStatus: RntrcVerificationResultStatus | null;
  resultCategory: RntrcVerificationResultCategory | null;
  dataReferenceDate: string | null;
  evidence: Record<string, unknown>;
  evidenceSource: string | null;
  verifiedBy: string | null;
  jobId: string | null;
  correlationId: string;
  createdAt: string;
  completedAt: string | null;
}

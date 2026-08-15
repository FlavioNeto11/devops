/**
 * Tipos e constantes do Regulatory Watch (PR-H1, DL-103).
 *
 * Bounded context Transporte — nada aqui referencia manifests/CETESB. As constantes espelham 1:1 os
 * CHECKs da migration `033_transport_regulatory_watch.sql` — mudou lá, muda aqui no mesmo PR (e
 * vice-versa), mesmo padrão de `regulatory-types.ts` (PR-A1).
 */

/**
 * Fluxo declarado pelo guia do programa: DETECTED → INGESTED → AI_ANALYZED/AI_SKIPPED →
 * HUMAN_REVIEW → APPROVED/REJECTED → TESTED → SCHEDULED → ACTIVE_APPLIED.
 *
 * `tested`/`scheduled` são RESERVADOS para uma fase futura (nenhuma rota deste PR os alcança — mesmo
 * desenho de `GATES_WITHOUT_RULE_YET`/`RULES_WITHOUT_EVALUATOR_YET`, item declarado antes da
 * capacidade que o usa de verdade). Este PR só produz `detected` → `ingested` →
 * `ai_analyzed`/`ai_skipped` → `human_review` (todos pelo worker) e `approved`/`rejected` (por
 * `revisar`) / `active_applied` (por `aplicar`).
 */
export const REGULATORY_WATCH_ITEM_STATUSES = [
  'detected',
  'ingested',
  'ai_analyzed',
  'ai_skipped',
  'human_review',
  'approved',
  'rejected',
  'tested',
  'scheduled',
  'active_applied'
] as const;

export type RegulatoryWatchItemStatus = (typeof REGULATORY_WATCH_ITEM_STATUSES)[number];

/** Estados TERMINAIS — não avançam mais no fluxo. */
export const REGULATORY_WATCH_TERMINAL_STATUSES: readonly RegulatoryWatchItemStatus[] = [
  'rejected',
  'active_applied'
];

/**
 * Estados "em aberto" (aguardando alguma decisão/ação) — usado pelo job de varredura para NÃO criar
 * um item duplicado quando a mesma mudança (mesmo `source_id` + `newHash`) já está sendo
 * acompanhada por um item não-terminal. Ver `runRegulatoryWatchCheckJob`
 * (`transport-regulatory-watch-service.ts`).
 */
export const REGULATORY_WATCH_PENDING_STATUSES: readonly RegulatoryWatchItemStatus[] =
  REGULATORY_WATCH_ITEM_STATUSES.filter(
    (status) => !REGULATORY_WATCH_TERMINAL_STATUSES.includes(status)
  );

export const REGULATORY_WATCH_EVENT_TYPES = [
  ...REGULATORY_WATCH_ITEM_STATUSES,
  'check_run_no_change'
] as const;

export type RegulatoryWatchEventType = (typeof REGULATORY_WATCH_EVENT_TYPES)[number];

export const REGULATORY_WATCH_REVIEW_DECISIONS = ['approved', 'rejected'] as const;

export type RegulatoryWatchReviewDecision = (typeof REGULATORY_WATCH_REVIEW_DECISIONS)[number];

/** Fato bruto da detecção — NUNCA uma interpretação (a interpretação, quando houver, é `aiAnalysis`). */
export type RegulatoryWatchDetectedChange = {
  previousHash: string | null;
  newHash: string;
  httpStatus: number;
  etag?: string | null;
  lastModified?: string | null;
};

/** Resumo mínimo opcional da IA — nunca uma decisão (a decisão é sempre humana). */
export type RegulatoryWatchAiAnalysis = {
  summary: string;
  model: string;
  analyzedAt: string;
};

export interface RegulatoryWatchItem {
  id: string;
  sourceId: string;
  status: RegulatoryWatchItemStatus;
  detectedChange: RegulatoryWatchDetectedChange | Record<string, never>;
  ingestedContentRef: string | null;
  aiAnalysis: RegulatoryWatchAiAnalysis | Record<string, never>;
  humanReviewNotes: string | null;
  reviewedBy: string | null;
  reviewedAt: string | null;
  appliedRuleVersionId: string | null;
  jobId: string | null;
  correlationId: string;
  version: number;
  createdAt: string;
  updatedAt: string;
}

export interface RegulatoryWatchEvent {
  id: string;
  watchItemId: string | null;
  sourceId: string;
  eventType: RegulatoryWatchEventType;
  detail: Record<string, unknown>;
  correlationId: string;
  createdAt: string;
}

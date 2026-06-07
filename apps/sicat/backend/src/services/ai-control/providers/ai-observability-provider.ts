/** Interface comum de provider de observabilidade externa (Langfuse / local fallback / noop). */
import type {
  AiControlLangfuseStatus,
  AiLangfuseMetrics,
  AiLangfuseObservation,
  AiLangfuseTraceSummary,
  AiLangfuseTraceTree
} from '../ai-control-types.js';

export type ObservabilityTraceFilters = {
  conversationSessionId?: string | null;
  conversationTurnId?: string | null;
  correlationId?: string | null;
  toolName?: string | null;
  userId?: string | null;
  status?: string | null;
  limit?: number;
};

export type ObservabilityObservationFilters = {
  traceId?: string | null;
  type?: string | null;
  limit?: number;
};

export type ObservabilityPromptSummary = {
  name: string;
  version: number | null;
  labels: string[];
  type: string | null;
  updatedAt: string | null;
};

export interface AiObservabilityProvider {
  readonly name: string;
  getStatus(): Promise<AiControlLangfuseStatus>;
  listTraces(filters: ObservabilityTraceFilters): Promise<AiLangfuseTraceSummary[]>;
  getTraceTree(traceId: string): Promise<AiLangfuseTraceTree | null>;
  listObservations(filters: ObservabilityObservationFilters): Promise<AiLangfuseObservation[]>;
  listPrompts(): Promise<ObservabilityPromptSummary[]>;
  getMetrics(): Promise<AiLangfuseMetrics>;
  buildDeepLink(traceId: string): string | null;
}

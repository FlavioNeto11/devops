/**
 * Shapes brutos (permissivos) da API pública do Langfuse.
 * Permissivos de propósito: a API externa pode variar entre versões; o mapper
 * normaliza para os DTOs do SICAT e degrada com segurança em campos ausentes.
 */

export type LangfuseUsage = {
  input?: number | null;
  output?: number | null;
  total?: number | null;
  promptTokens?: number | null;
  completionTokens?: number | null;
  totalTokens?: number | null;
};

export type LangfuseRawObservation = {
  id: string;
  traceId?: string | null;
  type?: string | null;
  name?: string | null;
  startTime?: string | null;
  endTime?: string | null;
  level?: string | null;
  statusMessage?: string | null;
  model?: string | null;
  usage?: LangfuseUsage | null;
  calculatedTotalCost?: number | null;
  totalCost?: number | null;
  parentObservationId?: string | null;
  input?: unknown;
  output?: unknown;
  metadata?: Record<string, unknown> | null;
  [key: string]: unknown;
};

export type LangfuseRawTrace = {
  id: string;
  name?: string | null;
  timestamp?: string | null;
  userId?: string | null;
  sessionId?: string | null;
  release?: string | null;
  version?: string | null;
  metadata?: Record<string, unknown> | null;
  tags?: string[] | null;
  input?: unknown;
  output?: unknown;
  latency?: number | null;
  totalCost?: number | null;
  cost?: number | null;
  usage?: LangfuseUsage | null;
  inputTokens?: number | null;
  outputTokens?: number | null;
  observations?: LangfuseRawObservation[] | null;
  htmlPath?: string | null;
  [key: string]: unknown;
};

export type LangfuseRawPrompt = {
  name: string;
  version?: number | null;
  labels?: string[] | null;
  tags?: string[] | null;
  type?: string | null;
  config?: Record<string, unknown> | null;
  updatedAt?: string | null;
  [key: string]: unknown;
};

export type LangfuseListMeta = {
  page?: number;
  limit?: number;
  totalItems?: number;
  totalPages?: number;
};

export type LangfuseListResponse<T> = {
  data?: T[] | null;
  meta?: LangfuseListMeta | null;
};

export type LangfuseDailyMetricRow = {
  date?: string | null;
  countTraces?: number | null;
  totalCost?: number | null;
  countObservations?: number | null;
  usage?: Array<{ model?: string; inputUsage?: number; outputUsage?: number; totalUsage?: number; totalCost?: number }> | null;
  [key: string]: unknown;
};

export type LangfuseDailyMetricsResponse = {
  data?: LangfuseDailyMetricRow[] | null;
  meta?: LangfuseListMeta | null;
};

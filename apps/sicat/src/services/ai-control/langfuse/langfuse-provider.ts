/** Provider de observabilidade Langfuse (externo). Degrada com segurança — nunca lança. */
import type {
  AiControlLangfuseStatus,
  AiLangfuseMetrics,
  AiLangfuseObservation,
  AiLangfuseTraceSummary,
  AiLangfuseTraceTree
} from '../ai-control-types.js';
import type { LangfuseConfig } from '../ai-control-config.js';
import { LangfuseClient } from './langfuse-client.js';
import { buildLangfuseTraceDeepLink } from './langfuse-deeplink.js';
import { mapObservation, mapTraceSummary, mapTraceTree, type LangfuseMapContext } from './langfuse-mapper.js';
import type {
  AiObservabilityProvider,
  ObservabilityObservationFilters,
  ObservabilityPromptSummary,
  ObservabilityTraceFilters
} from '../providers/ai-observability-provider.js';

function num(value: unknown): number {
  return typeof value === 'number' && Number.isFinite(value) ? value : 0;
}

export class LangfuseObservabilityProvider implements AiObservabilityProvider {
  readonly name = 'langfuse';
  private readonly client: LangfuseClient;
  private readonly ctx: LangfuseMapContext;

  constructor(private readonly config: LangfuseConfig) {
    this.client = new LangfuseClient(config);
    // ctx.baseUrl é usado SÓ para deep links (browser) → usa a URL pública.
    this.ctx = { baseUrl: config.publicBaseUrl, projectId: config.projectId };
  }

  async getStatus(): Promise<AiControlLangfuseStatus> {
    const health = await this.client.health();
    const base = {
      enabled: this.config.enabled,
      baseUrl: this.config.publicBaseUrl,
      projectId: this.config.projectId,
      publicKeyConfigured: this.config.publicKeyConfigured,
      secretKeyConfigured: this.config.secretKeyConfigured
    };
    if (health.ok) {
      return { ...base, status: 'ready', lastSyncAt: new Date().toISOString(), error: null };
    }
    return { ...base, status: 'degraded', lastSyncAt: null, error: health.error };
  }

  async listTraces(filters: ObservabilityTraceFilters): Promise<AiLangfuseTraceSummary[]> {
    const result = await this.client.listTraces({
      limit: filters.limit ?? 50,
      sessionId: filters.conversationSessionId ?? undefined,
      userId: filters.userId ?? undefined
    });
    if (!result.ok) return [];
    const rows = Array.isArray(result.data.data) ? result.data.data : [];
    let mapped = rows.map((trace) => mapTraceSummary(trace, this.ctx));
    if (filters.conversationTurnId) {
      mapped = mapped.filter((trace) => trace.conversationTurnId === filters.conversationTurnId);
    }
    if (filters.correlationId) {
      mapped = mapped.filter((trace) => trace.correlationId === filters.correlationId);
    }
    if (filters.status) {
      mapped = mapped.filter((trace) => trace.status === filters.status);
    }
    if (filters.toolName) {
      mapped = mapped.filter((trace) => (trace.name || '').includes(filters.toolName as string));
    }
    return mapped;
  }

  async getTraceTree(traceId: string): Promise<AiLangfuseTraceTree | null> {
    const result = await this.client.getTrace(traceId);
    if (!result.ok) return null;
    return mapTraceTree(result.data, this.ctx);
  }

  async listObservations(filters: ObservabilityObservationFilters): Promise<AiLangfuseObservation[]> {
    const result = await this.client.listObservations({
      traceId: filters.traceId ?? undefined,
      type: filters.type ?? undefined,
      limit: filters.limit ?? 100
    });
    if (!result.ok) return [];
    const rows = Array.isArray(result.data.data) ? result.data.data : [];
    return rows.map(mapObservation);
  }

  async listPrompts(): Promise<ObservabilityPromptSummary[]> {
    const result = await this.client.listPrompts({ limit: 100 });
    if (!result.ok) return [];
    const rows = Array.isArray(result.data.data) ? result.data.data : [];
    return rows.map((prompt) => ({
      name: prompt.name,
      version: typeof prompt.version === 'number' ? prompt.version : null,
      labels: Array.isArray(prompt.labels) ? prompt.labels.filter((label): label is string => typeof label === 'string') : [],
      type: typeof prompt.type === 'string' ? prompt.type : null,
      updatedAt: typeof prompt.updatedAt === 'string' ? prompt.updatedAt : null
    }));
  }

  async getMetrics(): Promise<AiLangfuseMetrics> {
    const result = await this.client.dailyMetrics({ limit: 30 });
    if (!result.ok) {
      return {
        available: false,
        window: null,
        totalTraces: null,
        totalCost: null,
        inputTokens: null,
        outputTokens: null,
        avgLatencyMs: null
      };
    }
    const rows = Array.isArray(result.data.data) ? result.data.data : [];
    let totalTraces = 0;
    let totalCost = 0;
    let inputTokens = 0;
    let outputTokens = 0;
    for (const row of rows) {
      totalTraces += num(row.countTraces);
      totalCost += num(row.totalCost);
      if (Array.isArray(row.usage)) {
        for (const usage of row.usage) {
          inputTokens += num(usage.inputUsage);
          outputTokens += num(usage.outputUsage);
        }
      }
    }
    return {
      available: true,
      window: '30d',
      totalTraces,
      totalCost,
      inputTokens,
      outputTokens,
      avgLatencyMs: null
    };
  }

  buildDeepLink(traceId: string): string | null {
    return buildLangfuseTraceDeepLink(this.config.publicBaseUrl, this.config.projectId, traceId);
  }
}

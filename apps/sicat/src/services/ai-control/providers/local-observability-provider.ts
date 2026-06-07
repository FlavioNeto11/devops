/**
 * Provider local: serve a tela de traces a partir de `ai_trace_events` (SICAT),
 * agrupando eventos por turn. É o FALLBACK visual quando o Langfuse está
 * desabilitado — a tela continua mostrando os traces locais em tempo quase real.
 */
import type {
  AiControlLangfuseStatus,
  AiLangfuseMetrics,
  AiLangfuseObservation,
  AiLangfuseTraceSummary,
  AiLangfuseTraceTree,
  AiLangfuseTraceTreeNode,
  AiTraceEvent
} from '../ai-control-types.js';
import type { LangfuseConfig } from '../ai-control-config.js';
import { listAiTraceEvents, listAiTraceEventsByTurn } from '../../../repositories/ai-trace-event-repo.js';
import type {
  AiObservabilityProvider,
  ObservabilityObservationFilters,
  ObservabilityPromptSummary,
  ObservabilityTraceFilters
} from './ai-observability-provider.js';

function sumField(events: AiTraceEvent[], field: 'latencyMs' | 'tokenInput' | 'tokenOutput' | 'cost'): number | null {
  let total = 0;
  let seen = false;
  for (const event of events) {
    const value = event[field];
    if (typeof value === 'number' && Number.isFinite(value)) {
      total += value;
      seen = true;
    }
  }
  return seen ? total : null;
}

function nodeTypeForEvent(eventType: string): string {
  if (eventType.includes('generation') || eventType.includes('planner') || eventType.includes('synthesis')) return 'generation';
  if (eventType.includes('policy') || eventType.includes('dispatch') || eventType.includes('check')) return 'span';
  if (eventType.includes('result') || eventType.includes('.done') || eventType.includes('.failed')) return 'event';
  return 'span';
}

export class LocalObservabilityProvider implements AiObservabilityProvider {
  readonly name = 'local';

  constructor(private readonly config: LangfuseConfig) {}

  async getStatus(): Promise<AiControlLangfuseStatus> {
    return {
      enabled: this.config.enabled,
      status: 'disabled',
      baseUrl: this.config.publicBaseUrl,
      projectId: this.config.projectId,
      publicKeyConfigured: this.config.publicKeyConfigured,
      secretKeyConfigured: this.config.secretKeyConfigured,
      lastSyncAt: null,
      error: null
    };
  }

  async listTraces(filters: ObservabilityTraceFilters): Promise<AiLangfuseTraceSummary[]> {
    const limit = filters.limit ?? 50;
    const events = await listAiTraceEvents({
      conversationSessionId: filters.conversationSessionId,
      conversationTurnId: filters.conversationTurnId,
      correlationId: filters.correlationId,
      toolName: filters.toolName,
      userId: filters.userId,
      status: filters.status,
      limit: Math.min(500, limit * 10)
    });

    const byTurn = new Map<string, AiTraceEvent[]>();
    const order: string[] = [];
    for (const event of events) {
      const key = event.conversationTurnId || event.traceId || event.id;
      if (!byTurn.has(key)) {
        byTurn.set(key, []);
        order.push(key);
      }
      byTurn.get(key)!.push(event);
    }

    const summaries: AiLangfuseTraceSummary[] = [];
    for (const key of order) {
      const turnEvents = byTurn.get(key) ?? [];
      const newest = turnEvents[0];
      const oldest = turnEvents[turnEvents.length - 1];
      if (!newest || !oldest) continue;
      summaries.push({
        traceId: key,
        name: 'conversation.turn',
        conversationSessionId: newest.conversationSessionId,
        conversationTurnId: newest.conversationTurnId,
        correlationId: newest.correlationId,
        userId: newest.userId,
        status: newest.status,
        startedAt: oldest.createdAt,
        durationMs: sumField(turnEvents, 'latencyMs'),
        inputTokens: sumField(turnEvents, 'tokenInput'),
        outputTokens: sumField(turnEvents, 'tokenOutput'),
        cost: sumField(turnEvents, 'cost'),
        deepLink: null
      });
    }
    return summaries.slice(0, limit);
  }

  async getTraceTree(traceId: string): Promise<AiLangfuseTraceTree | null> {
    const events = await listAiTraceEventsByTurn(traceId);
    if (events.length === 0) return null;
    const newest = events[events.length - 1];
    const oldest = events[0];
    if (!newest || !oldest) return null;
    const nodes: AiLangfuseTraceTreeNode[] = events.map((event) => ({
      id: event.id,
      type: nodeTypeForEvent(event.eventType),
      name: event.eventType,
      status: event.status,
      durationMs: event.latencyMs,
      model: null,
      inputTokens: event.tokenInput,
      outputTokens: event.tokenOutput,
      cost: event.cost,
      children: []
    }));
    return {
      traceId,
      name: 'conversation.turn',
      conversationSessionId: newest.conversationSessionId,
      conversationTurnId: newest.conversationTurnId,
      correlationId: newest.correlationId,
      userId: newest.userId,
      status: newest.status,
      startedAt: oldest.createdAt,
      durationMs: sumField(events, 'latencyMs'),
      inputTokens: sumField(events, 'tokenInput'),
      outputTokens: sumField(events, 'tokenOutput'),
      cost: sumField(events, 'cost'),
      deepLink: null,
      nodes
    };
  }

  async listObservations(filters: ObservabilityObservationFilters): Promise<AiLangfuseObservation[]> {
    if (!filters.traceId) return [];
    const events = await listAiTraceEventsByTurn(filters.traceId);
    return events.map((event) => ({
      id: event.id,
      traceId: filters.traceId as string,
      type: nodeTypeForEvent(event.eventType),
      name: event.eventType,
      status: event.status,
      startedAt: event.createdAt,
      durationMs: event.latencyMs,
      model: null,
      inputTokens: event.tokenInput,
      outputTokens: event.tokenOutput,
      cost: event.cost
    }));
  }

  async listPrompts(): Promise<ObservabilityPromptSummary[]> {
    return [];
  }

  async getMetrics(): Promise<AiLangfuseMetrics> {
    const events = await listAiTraceEvents({ limit: 500 });
    if (events.length === 0) {
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
    const turns = new Set<string>();
    let totalCost = 0;
    let inputTokens = 0;
    let outputTokens = 0;
    let latencySum = 0;
    let latencyCount = 0;
    for (const event of events) {
      if (event.conversationTurnId) turns.add(event.conversationTurnId);
      if (typeof event.cost === 'number') totalCost += event.cost;
      if (typeof event.tokenInput === 'number') inputTokens += event.tokenInput;
      if (typeof event.tokenOutput === 'number') outputTokens += event.tokenOutput;
      if (typeof event.latencyMs === 'number') {
        latencySum += event.latencyMs;
        latencyCount += 1;
      }
    }
    return {
      available: true,
      window: 'recent-500',
      totalTraces: turns.size,
      totalCost,
      inputTokens,
      outputTokens,
      avgLatencyMs: latencyCount > 0 ? Math.round(latencySum / latencyCount) : null
    };
  }

  buildDeepLink(): string | null {
    return null;
  }
}

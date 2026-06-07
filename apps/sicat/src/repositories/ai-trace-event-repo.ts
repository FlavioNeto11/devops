import { query } from '../db/pool.js';
import { createPrefixedId } from '../lib/ids.js';
import type { AiTraceEvent } from '../services/ai-control/ai-control-types.js';

type JsonObject = Record<string, unknown>;
type IsoLike = Date | string | null | undefined;

type AiTraceEventRow = {
  id: string;
  trace_source: string;
  trace_id: string | null;
  observation_id: string | null;
  conversation_session_id: string | null;
  conversation_turn_id: string | null;
  correlation_id: string | null;
  user_id: string | null;
  tool_name: string | null;
  event_type: string;
  status: string | null;
  latency_ms: number | null;
  token_input: number | null;
  token_output: number | null;
  cost: string | number | null;
  payload_json: JsonObject | null;
  created_at: IsoLike;
};

function toIso(value: IsoLike): string | null {
  if (value == null) return null;
  if (value instanceof Date) return value.toISOString();
  return String(value);
}

function toNumberOrNull(value: unknown): number | null {
  if (value == null) return null;
  const parsed = typeof value === 'number' ? value : Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function mapAiTraceEvent(row: AiTraceEventRow): AiTraceEvent {
  return {
    id: row.id,
    traceSource: row.trace_source === 'langfuse' ? 'langfuse' : 'sicat',
    traceId: row.trace_id,
    observationId: row.observation_id,
    conversationSessionId: row.conversation_session_id,
    conversationTurnId: row.conversation_turn_id,
    correlationId: row.correlation_id,
    userId: row.user_id,
    toolName: row.tool_name,
    eventType: row.event_type,
    status: row.status,
    latencyMs: toNumberOrNull(row.latency_ms),
    tokenInput: toNumberOrNull(row.token_input),
    tokenOutput: toNumberOrNull(row.token_output),
    cost: toNumberOrNull(row.cost),
    payload: row.payload_json || {},
    createdAt: toIso(row.created_at)
  };
}

export type AiTraceEventInput = {
  traceSource?: 'sicat' | 'langfuse';
  traceId?: string | null;
  observationId?: string | null;
  conversationSessionId?: string | null;
  conversationTurnId?: string | null;
  correlationId?: string | null;
  userId?: string | null;
  toolName?: string | null;
  eventType: string;
  status?: string | null;
  latencyMs?: number | null;
  tokenInput?: number | null;
  tokenOutput?: number | null;
  cost?: number | null;
  payload?: JsonObject;
};

export async function insertAiTraceEvent(input: AiTraceEventInput): Promise<AiTraceEvent | null> {
  const result = await query<AiTraceEventRow>(
    `insert into ai_trace_events(
      id, trace_source, trace_id, observation_id,
      conversation_session_id, conversation_turn_id, correlation_id, user_id,
      tool_name, event_type, status, latency_ms, token_input, token_output, cost, payload_json
    ) values ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16::jsonb)
    returning *`,
    [
      createPrefixedId('aitrace'),
      input.traceSource || 'sicat',
      input.traceId || null,
      input.observationId || null,
      input.conversationSessionId || null,
      input.conversationTurnId || null,
      input.correlationId || null,
      input.userId || null,
      input.toolName || null,
      input.eventType,
      input.status || null,
      input.latencyMs ?? null,
      input.tokenInput ?? null,
      input.tokenOutput ?? null,
      input.cost ?? null,
      JSON.stringify(input.payload || {})
    ]
  );
  const row = result.rows[0];
  return row ? mapAiTraceEvent(row) : null;
}

export type AiTraceEventFilters = {
  conversationSessionId?: string | null;
  conversationTurnId?: string | null;
  correlationId?: string | null;
  toolName?: string | null;
  userId?: string | null;
  status?: string | null;
  traceSource?: string | null;
  limit?: number;
};

export async function listAiTraceEvents(filters: AiTraceEventFilters = {}): Promise<AiTraceEvent[]> {
  const conditions: string[] = [];
  const params: unknown[] = [];

  const pushEq = (column: string, value: string | null | undefined) => {
    if (typeof value === 'string' && value.trim()) {
      params.push(value.trim());
      conditions.push(`${column} = $${params.length}`);
    }
  };

  pushEq('conversation_session_id', filters.conversationSessionId);
  pushEq('conversation_turn_id', filters.conversationTurnId);
  pushEq('correlation_id', filters.correlationId);
  pushEq('tool_name', filters.toolName);
  pushEq('user_id', filters.userId);
  pushEq('status', filters.status);
  pushEq('trace_source', filters.traceSource);

  const safeLimit = Number.isFinite(filters.limit)
    ? Math.max(1, Math.min(500, Math.trunc(filters.limit as number)))
    : 100;
  params.push(safeLimit);

  const whereClause = conditions.length > 0 ? `where ${conditions.join(' and ')}` : '';
  const result = await query<AiTraceEventRow>(
    `select * from ai_trace_events ${whereClause} order by created_at desc limit $${params.length}`,
    params
  );
  return result.rows.map(mapAiTraceEvent);
}

export async function listAiTraceEventsByTurn(conversationTurnId: string): Promise<AiTraceEvent[]> {
  const result = await query<AiTraceEventRow>(
    `select * from ai_trace_events where conversation_turn_id = $1 order by created_at asc limit 500`,
    [conversationTurnId]
  );
  return result.rows.map(mapAiTraceEvent);
}

export type AiToolUsageStat = {
  toolName: string;
  total: number;
  executed: number;
  blocked: number;
  failed: number;
  lastUsedAt: string | null;
};

export async function getAiToolUsageStats(): Promise<AiToolUsageStat[]> {
  const result = await query<{
    tool_name: string;
    total: number;
    executed: number;
    blocked: number;
    failed: number;
    last_used_at: IsoLike;
  }>(`select tool_name, total, executed, blocked, failed, last_used_at from v_ai_control_tool_usage`);
  return result.rows.map((row) => ({
    toolName: row.tool_name,
    total: toNumberOrNull(row.total) || 0,
    executed: toNumberOrNull(row.executed) || 0,
    blocked: toNumberOrNull(row.blocked) || 0,
    failed: toNumberOrNull(row.failed) || 0,
    lastUsedAt: toIso(row.last_used_at)
  }));
}

export async function pruneAiTraceEvents(retentionDays: number): Promise<number> {
  const days = Number.isFinite(retentionDays) ? Math.max(1, Math.trunc(retentionDays)) : 30;
  const result = await query(
    `delete from ai_trace_events where created_at < now() - ($1 || ' days')::interval`,
    [String(days)]
  );
  return result.rowCount ?? 0;
}

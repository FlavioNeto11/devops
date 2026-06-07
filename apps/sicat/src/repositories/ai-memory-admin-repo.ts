import { query } from '../db/pool.js';
import { createPrefixedId } from '../lib/ids.js';

type JsonObject = Record<string, unknown>;
type IsoLike = Date | string | null | undefined;

function toIso(value: IsoLike): string | null {
  if (value == null) return null;
  if (value instanceof Date) return value.toISOString();
  return String(value);
}

type AiMemoryAdminEventRow = {
  id: string;
  conversation_session_id: string;
  action: string;
  before_payload: JsonObject | null;
  after_payload: JsonObject | null;
  requested_by: string | null;
  correlation_id: string | null;
  created_at: IsoLike;
};

export type AiMemoryAdminEventRecord = {
  id: string;
  conversationSessionId: string;
  action: string;
  beforePayload: JsonObject;
  afterPayload: JsonObject;
  requestedBy: string | null;
  correlationId: string | null;
  createdAt: string | null;
};

function mapAiMemoryAdminEvent(row: AiMemoryAdminEventRow): AiMemoryAdminEventRecord {
  return {
    id: row.id,
    conversationSessionId: row.conversation_session_id,
    action: row.action,
    beforePayload: row.before_payload || {},
    afterPayload: row.after_payload || {},
    requestedBy: row.requested_by,
    correlationId: row.correlation_id,
    createdAt: toIso(row.created_at)
  };
}

export async function insertAiMemoryAdminEvent(input: {
  conversationSessionId: string;
  action: string;
  beforePayload?: JsonObject;
  afterPayload?: JsonObject;
  requestedBy?: string | null;
  correlationId?: string | null;
}): Promise<AiMemoryAdminEventRecord | null> {
  const result = await query<AiMemoryAdminEventRow>(
    `insert into ai_memory_admin_events(
      id, conversation_session_id, action, before_payload, after_payload, requested_by, correlation_id
    ) values ($1,$2,$3,$4::jsonb,$5::jsonb,$6,$7) returning *`,
    [
      createPrefixedId('aimemev'),
      input.conversationSessionId,
      input.action,
      JSON.stringify(input.beforePayload || {}),
      JSON.stringify(input.afterPayload || {}),
      input.requestedBy ?? null,
      input.correlationId ?? null
    ]
  );
  const row = result.rows[0];
  return row ? mapAiMemoryAdminEvent(row) : null;
}

export async function listAiMemoryAdminEvents(conversationSessionId: string, limit = 50): Promise<AiMemoryAdminEventRecord[]> {
  const safeLimit = Number.isFinite(limit) ? Math.max(1, Math.min(200, Math.trunc(limit))) : 50;
  const result = await query<AiMemoryAdminEventRow>(
    `select * from ai_memory_admin_events
      where conversation_session_id = $1
      order by created_at desc limit $2`,
    [conversationSessionId, safeLimit]
  );
  return result.rows.map(mapAiMemoryAdminEvent);
}

/**
 * Operação administrativa destrutiva: limpa a memória (working + patch + vetorial)
 * de uma sessão. Não apaga mensagens (histórico de auditoria preservado).
 */
export async function clearSessionMemory(
  conversationSessionId: string,
  integrationAccountId: string | null
): Promise<{ memoryRows: number; semanticRows: number }> {
  const memoryResult = await query(
    `delete from conversation_memory where conversation_session_id = $1`,
    [conversationSessionId]
  );
  const semanticResult = await query(
    `delete from conversation_semantic_memory
       where conversation_session_id = $1
         and integration_account_id is not distinct from $2`,
    [conversationSessionId, integrationAccountId]
  );
  return {
    memoryRows: memoryResult.rowCount ?? 0,
    semanticRows: semanticResult.rowCount ?? 0
  };
}

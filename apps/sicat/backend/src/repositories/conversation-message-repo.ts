import { query } from '../db/pool.js';

type JsonObject = Record<string, unknown>;
type IsoLike = Date | string | null | undefined;

type ConversationMessageRow = {
  id: string;
  conversation_session_id: string;
  conversation_turn_id: string;
  role: 'user' | 'assistant' | 'tool' | 'system';
  message_text: string | null;
  structured_payload: JsonObject | null;
  tool_calls: unknown[] | null;
  correlation_id: string | null;
  job_id: string | null;
  integration_account_id: string | null;
  session_context_id: string | null;
  created_at: IsoLike;
};

function toIso(value: IsoLike): string | null {
  if (value == null) return null;
  if (value instanceof Date) return value.toISOString();
  return value;
}

function mapConversationMessage(row?: ConversationMessageRow) {
  if (!row) return null;
  return {
    id: row.id,
    conversationSessionId: row.conversation_session_id,
    conversationTurnId: row.conversation_turn_id,
    role: row.role,
    messageText: row.message_text,
    structuredPayload: row.structured_payload || {},
    toolCalls: row.tool_calls || [],
    correlationId: row.correlation_id,
    jobId: row.job_id,
    integrationAccountId: row.integration_account_id,
    sessionContextId: row.session_context_id,
    createdAt: toIso(row.created_at)
  };
}

export async function insertConversationMessage(input: {
  id: string;
  conversationSessionId: string;
  conversationTurnId: string;
  role: 'user' | 'assistant' | 'tool' | 'system';
  messageText?: string | null;
  structuredPayload?: JsonObject;
  toolCalls?: unknown[];
  correlationId?: string | null;
  jobId?: string | null;
  integrationAccountId?: string | null;
  sessionContextId?: string | null;
}) {
  const result = await query<ConversationMessageRow>(
    `insert into conversation_messages(
      id,
      conversation_session_id,
      conversation_turn_id,
      role,
      message_text,
      structured_payload,
      tool_calls,
      correlation_id,
      job_id,
      integration_account_id,
      session_context_id
    ) values ($1,$2,$3,$4,$5,$6::jsonb,$7::jsonb,$8,$9,$10,$11)
    returning *`,
    [
      input.id,
      input.conversationSessionId,
      input.conversationTurnId,
      input.role,
      input.messageText || null,
      JSON.stringify(input.structuredPayload || {}),
      JSON.stringify(input.toolCalls || []),
      input.correlationId || null,
      input.jobId || null,
      input.integrationAccountId || null,
      input.sessionContextId || null
    ]
  );

  return mapConversationMessage(result.rows[0]);
}

export async function listConversationMessages(
  conversationSessionId: string,
  integrationAccountId: string | null,
  limit = 50
) {
  const safeLimit = Number.isFinite(limit) ? Math.max(1, Math.min(200, Math.trunc(limit))) : 50;
  const result = await query<ConversationMessageRow>(
    `select *
       from conversation_messages
      where conversation_session_id = $1
        and integration_account_id is not distinct from $2
      order by created_at desc
      limit $3`,
    [conversationSessionId, integrationAccountId, safeLimit]
  );
  return result.rows.map((row) => mapConversationMessage(row)).filter(Boolean);
}

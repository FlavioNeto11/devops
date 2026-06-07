import { query } from '../db/pool.js';

type JsonObject = Record<string, unknown>;
type IsoLike = Date | string | null | undefined;

type ConversationMemoryRow = {
  id: string;
  conversation_session_id: string;
  summary_kind: string;
  summary_text: string;
  summary_payload: JsonObject | null;
  valid_until: IsoLike;
  created_at: IsoLike;
  updated_at: IsoLike;
};

function toIso(value: IsoLike): string | null {
  if (value == null) return null;
  if (value instanceof Date) return value.toISOString();
  return value;
}

function mapConversationMemory(row?: ConversationMemoryRow) {
  if (!row) return null;
  return {
    id: row.id,
    conversationSessionId: row.conversation_session_id,
    summaryKind: row.summary_kind,
    summaryText: row.summary_text,
    summaryPayload: row.summary_payload || {},
    validUntil: toIso(row.valid_until),
    createdAt: toIso(row.created_at),
    updatedAt: toIso(row.updated_at)
  };
}

export async function upsertConversationMemory(input: {
  id: string;
  conversationSessionId: string;
  summaryKind: string;
  summaryText: string;
  summaryPayload?: JsonObject;
  validUntil?: string | null;
}) {
  const result = await query<ConversationMemoryRow>(
    `insert into conversation_memory(
      id,
      conversation_session_id,
      summary_kind,
      summary_text,
      summary_payload,
      valid_until
    ) values ($1,$2,$3,$4,$5::jsonb,$6)
    on conflict (conversation_session_id, summary_kind) do update set
      summary_text = excluded.summary_text,
      summary_payload = coalesce(excluded.summary_payload, conversation_memory.summary_payload),
      valid_until = excluded.valid_until,
      updated_at = now()
    returning *`,
    [
      input.id,
      input.conversationSessionId,
      input.summaryKind,
      input.summaryText,
      JSON.stringify(input.summaryPayload || {}),
      input.validUntil || null
    ]
  );

  return mapConversationMemory(result.rows[0]);
}

export async function findConversationMemory(
  conversationSessionId: string,
  integrationAccountId: string | null,
  summaryKind: string
) {
  const result = await query<ConversationMemoryRow>(
    `select *
       from conversation_memory cm
       join conversation_sessions cs on cs.id = cm.conversation_session_id
      where cm.conversation_session_id = $1
        and cs.integration_account_id is not distinct from $2
        and cm.summary_kind = $3
      limit 1`,
    [conversationSessionId, integrationAccountId, summaryKind]
  );
  return mapConversationMemory(result.rows[0]);
}

export async function listActiveConversationMemory(
  conversationSessionId: string,
  integrationAccountId: string | null
) {
  const result = await query<ConversationMemoryRow>(
    `select *
       from conversation_memory cm
       join conversation_sessions cs on cs.id = cm.conversation_session_id
      where cm.conversation_session_id = $1
        and cs.integration_account_id is not distinct from $2
        and (cm.valid_until is null or cm.valid_until > now())
      order by cm.updated_at desc`,
    [conversationSessionId, integrationAccountId]
  );
  return result.rows.map((row) => mapConversationMemory(row)).filter(Boolean);
}

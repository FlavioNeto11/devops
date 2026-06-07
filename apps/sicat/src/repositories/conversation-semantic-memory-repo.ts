import { query } from '../db/pool.js';

type SemanticRow = {
  id: string;
  role: string;
  text: string;
  embedding: unknown;
  created_at: Date | string | null;
};

export type SemanticMemoryRecord = {
  id: string;
  role: string;
  text: string;
  embedding: number[];
};

export async function insertConversationSemanticMemory(input: {
  id: string;
  conversationSessionId: string;
  integrationAccountId: string | null;
  role: string;
  text: string;
  embedding: number[];
  validUntil?: string | null;
}): Promise<void> {
  await query(
    `insert into conversation_semantic_memory(
       id, conversation_session_id, integration_account_id, role, text, embedding, valid_until
     ) values ($1,$2,$3,$4,$5,$6::jsonb,$7)
     on conflict (id) do nothing`,
    [
      input.id,
      input.conversationSessionId,
      input.integrationAccountId,
      input.role,
      input.text,
      JSON.stringify(input.embedding),
      input.validUntil || null
    ]
  );
}

export async function listConversationSemanticMemory(
  conversationSessionId: string,
  integrationAccountId: string | null,
  limit = 200
): Promise<SemanticMemoryRecord[]> {
  const result = await query<SemanticRow>(
    `select id, role, text, embedding
       from conversation_semantic_memory
      where conversation_session_id = $1
        and integration_account_id is not distinct from $2
        and (valid_until is null or valid_until > now())
      order by created_at desc
      limit $3`,
    [conversationSessionId, integrationAccountId, limit]
  );
  return result.rows.map((row) => ({
    id: row.id,
    role: row.role,
    text: row.text,
    embedding: Array.isArray(row.embedding) ? (row.embedding as number[]) : []
  }));
}

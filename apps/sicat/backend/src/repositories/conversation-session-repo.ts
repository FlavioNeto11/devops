import { query } from '../db/pool.js';

type JsonObject = Record<string, unknown>;
type IsoLike = Date | string | null | undefined;

type ConversationSessionRow = {
  id: string;
  channel_type: string;
  channel_session_key: string | null;
  user_id: string | null;
  account_id: string | null;
  integration_account_id: string | null;
  session_context_id: string | null;
  current_screen: string | null;
  current_manifest_id: string | null;
  status: string;
  metadata: JsonObject | null;
  last_correlation_id: string | null;
  last_turn_at: IsoLike;
  created_at: IsoLike;
  updated_at: IsoLike;
};

function toIso(value: IsoLike): string | null {
  if (value == null) return null;
  if (value instanceof Date) return value.toISOString();
  return value;
}

function mapConversationSession(row?: ConversationSessionRow) {
  if (!row) return null;
  return {
    id: row.id,
    channelType: row.channel_type,
    channelSessionKey: row.channel_session_key,
    userId: row.user_id,
    accountId: row.account_id,
    integrationAccountId: row.integration_account_id,
    sessionContextId: row.session_context_id,
    currentScreen: row.current_screen,
    currentManifestId: row.current_manifest_id,
    status: row.status,
    metadata: row.metadata || {},
    lastCorrelationId: row.last_correlation_id,
    lastTurnAt: toIso(row.last_turn_at),
    createdAt: toIso(row.created_at),
    updatedAt: toIso(row.updated_at)
  };
}

export async function upsertConversationSession(input: {
  id: string;
  channelType: string;
  channelSessionKey?: string | null;
  userId?: string | null;
  accountId?: string | null;
  integrationAccountId?: string | null;
  sessionContextId?: string | null;
  currentScreen?: string | null;
  currentManifestId?: string | null;
  status?: string | null;
  metadata?: JsonObject;
  lastCorrelationId?: string | null;
  lastTurnAt?: string | null;
}) {
  // O índice único é PARCIAL: ux_conversation_sessions_channel_key (channel_type, channel_session_key)
  // WHERE channel_session_key IS NOT NULL. Quando HÁ channelSessionKey, a IDENTIDADE da sessão é
  // (channel_type, channel_session_key) — um id novo a cada turno colidiria nesse índice, e um
  // ON CONFLICT (id) NÃO trataria esse conflito: a query lançaria, a sessão não seria criada e
  // TODAS as escritas filhas cairiam por FK. Por isso, com chave, conflitamos no índice de canal e
  // REUTILIZAMOS a linha existente (id canônico preservado e devolvido em RETURNING). Sem chave,
  // o índice parcial não se aplica → conflito por id (comportamento legado).
  const hasChannelKey = typeof input.channelSessionKey === 'string' && input.channelSessionKey.trim().length > 0;
  const conflictClause = hasChannelKey
    ? 'on conflict (channel_type, channel_session_key) where channel_session_key is not null'
    : 'on conflict (id)';

  const result = await query<ConversationSessionRow>(
    `insert into conversation_sessions(
      id,
      channel_type,
      channel_session_key,
      user_id,
      account_id,
      integration_account_id,
      session_context_id,
      current_screen,
      current_manifest_id,
      status,
      metadata,
      last_correlation_id,
      last_turn_at
    ) values ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11::jsonb,$12,$13)
    ${conflictClause} do update set
      channel_type = excluded.channel_type,
      channel_session_key = coalesce(excluded.channel_session_key, conversation_sessions.channel_session_key),
      user_id = coalesce(excluded.user_id, conversation_sessions.user_id),
      account_id = coalesce(excluded.account_id, conversation_sessions.account_id),
      integration_account_id = coalesce(excluded.integration_account_id, conversation_sessions.integration_account_id),
      session_context_id = coalesce(excluded.session_context_id, conversation_sessions.session_context_id),
      current_screen = coalesce(excluded.current_screen, conversation_sessions.current_screen),
      current_manifest_id = coalesce(excluded.current_manifest_id, conversation_sessions.current_manifest_id),
      status = coalesce(excluded.status, conversation_sessions.status),
      metadata = coalesce(excluded.metadata, conversation_sessions.metadata),
      last_correlation_id = coalesce(excluded.last_correlation_id, conversation_sessions.last_correlation_id),
      last_turn_at = coalesce(excluded.last_turn_at, conversation_sessions.last_turn_at),
      updated_at = now()
    returning *`,
    [
      input.id,
      input.channelType,
      input.channelSessionKey || null,
      input.userId || null,
      input.accountId || null,
      input.integrationAccountId || null,
      input.sessionContextId || null,
      input.currentScreen || null,
      input.currentManifestId || null,
      input.status || 'active',
      input.metadata ? JSON.stringify(input.metadata) : JSON.stringify({}),
      input.lastCorrelationId || null,
      input.lastTurnAt || new Date().toISOString()
    ]
  );

  return mapConversationSession(result.rows[0]);
}

export async function findConversationSessionById(id: string) {
  const result = await query<ConversationSessionRow>(
    `select * from conversation_sessions where id = $1`,
    [id]
  );
  return mapConversationSession(result.rows[0]);
}

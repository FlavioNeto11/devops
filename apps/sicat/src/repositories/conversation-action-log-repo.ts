import { query } from '../db/pool.js';

type JsonObject = Record<string, unknown>;
type IsoLike = Date | string | null | undefined;

type ConversationActionLogRow = {
  id: string;
  conversation_session_id: string;
  conversation_turn_id: string;
  user_id: string | null;
  channel_type: string;
  action_type: string;
  action_status: string;
  risk_level: string | null;
  requires_confirmation: boolean;
  confirmed_at: IsoLike;
  blocked_reason: string | null;
  tool_name: string | null;
  tool_arguments: JsonObject | null;
  result_payload: JsonObject | null;
  correlation_id: string;
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

function mapConversationActionLog(row?: ConversationActionLogRow) {
  if (!row) return null;
  return {
    id: row.id,
    conversationSessionId: row.conversation_session_id,
    conversationTurnId: row.conversation_turn_id,
    userId: row.user_id,
    channelType: row.channel_type,
    actionType: row.action_type,
    actionStatus: row.action_status,
    riskLevel: row.risk_level,
    requiresConfirmation: row.requires_confirmation,
    confirmedAt: toIso(row.confirmed_at),
    blockedReason: row.blocked_reason,
    toolName: row.tool_name,
    toolArguments: row.tool_arguments || {},
    resultPayload: row.result_payload || {},
    correlationId: row.correlation_id,
    jobId: row.job_id,
    integrationAccountId: row.integration_account_id,
    sessionContextId: row.session_context_id,
    createdAt: toIso(row.created_at)
  };
}

export async function insertConversationActionLog(input: {
  id: string;
  conversationSessionId: string;
  conversationTurnId: string;
  userId?: string | null;
  channelType: string;
  actionType: string;
  actionStatus?: string;
  riskLevel?: string | null;
  requiresConfirmation?: boolean;
  confirmedAt?: string | null;
  blockedReason?: string | null;
  toolName?: string | null;
  toolArguments?: JsonObject;
  resultPayload?: JsonObject;
  correlationId: string;
  jobId?: string | null;
  integrationAccountId?: string | null;
  sessionContextId?: string | null;
}) {
  const result = await query<ConversationActionLogRow>(
    `insert into conversation_action_logs(
      id,
      conversation_session_id,
      conversation_turn_id,
      user_id,
      channel_type,
      action_type,
      action_status,
      risk_level,
      requires_confirmation,
      confirmed_at,
      blocked_reason,
      tool_name,
      tool_arguments,
      result_payload,
      correlation_id,
      job_id,
      integration_account_id,
      session_context_id
    ) values ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13::jsonb,$14::jsonb,$15,$16,$17,$18)
    returning *`,
    [
      input.id,
      input.conversationSessionId,
      input.conversationTurnId,
      input.userId || null,
      input.channelType,
      input.actionType,
      input.actionStatus || 'recorded',
      input.riskLevel || null,
      Boolean(input.requiresConfirmation),
      input.confirmedAt || null,
      input.blockedReason || null,
      input.toolName || null,
      JSON.stringify(input.toolArguments || {}),
      JSON.stringify(input.resultPayload || {}),
      input.correlationId,
      input.jobId || null,
      input.integrationAccountId || null,
      input.sessionContextId || null
    ]
  );
  return mapConversationActionLog(result.rows[0]);
}

export async function listConversationActionLogs(
  conversationSessionId: string,
  integrationAccountId: string | null,
  limit = 100
) {
  const safeLimit = Number.isFinite(limit) ? Math.max(1, Math.min(300, Math.trunc(limit))) : 100;
  const result = await query<ConversationActionLogRow>(
    `select *
       from conversation_action_logs
      where conversation_session_id = $1
        and integration_account_id is not distinct from $2
      order by created_at desc
      limit $3`,
    [conversationSessionId, integrationAccountId, safeLimit]
  );
  return result.rows.map((row) => mapConversationActionLog(row)).filter(Boolean);
}

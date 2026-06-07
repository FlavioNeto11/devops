import { query } from '../db/pool.js';

type JsonObject = Record<string, unknown>;
type IsoLike = Date | string | null | undefined;

type ConversationDeterministicTrailRow = {
  id: string;
  conversation_session_id: string;
  conversation_turn_id: string;
  phase: 'snapshot' | 'plan' | 'result';
  intent: string | null;
  execution_status: 'processing' | 'available' | 'partial' | 'failed' | 'expired' | 'blocked';
  snapshot_token: string | null;
  snapshot_payload: JsonObject | null;
  plan_payload: JsonObject | null;
  result_payload: JsonObject | null;
  metadata: JsonObject | null;
  manifest_ids: string[] | null;
  cdf_ids: string[] | null;
  correlation_id: string;
  job_id: string | null;
  command_id: string | null;
  integration_account_id: string | null;
  session_context_id: string | null;
  created_at: IsoLike;
  updated_at: IsoLike;
};

function toIso(value: IsoLike): string | null {
  if (value == null) return null;
  if (value instanceof Date) return value.toISOString();
  return value;
}

function mapTrail(row?: ConversationDeterministicTrailRow) {
  if (!row) return null;

  return {
    id: row.id,
    conversationSessionId: row.conversation_session_id,
    conversationTurnId: row.conversation_turn_id,
    phase: row.phase,
    intent: row.intent,
    executionStatus: row.execution_status,
    snapshotToken: row.snapshot_token,
    snapshotPayload: row.snapshot_payload || {},
    planPayload: row.plan_payload || {},
    resultPayload: row.result_payload || {},
    metadata: row.metadata || {},
    manifestIds: Array.isArray(row.manifest_ids) ? row.manifest_ids : [],
    cdfIds: Array.isArray(row.cdf_ids) ? row.cdf_ids : [],
    correlationId: row.correlation_id,
    jobId: row.job_id,
    commandId: row.command_id,
    integrationAccountId: row.integration_account_id,
    sessionContextId: row.session_context_id,
    createdAt: toIso(row.created_at),
    updatedAt: toIso(row.updated_at)
  };
}

export async function insertConversationDeterministicTrail(input: {
  id: string;
  conversationSessionId: string;
  conversationTurnId: string;
  phase: 'snapshot' | 'plan' | 'result';
  intent?: string | null;
  executionStatus?: 'processing' | 'available' | 'partial' | 'failed' | 'expired' | 'blocked';
  snapshotToken?: string | null;
  snapshotPayload?: JsonObject;
  planPayload?: JsonObject;
  resultPayload?: JsonObject;
  metadata?: JsonObject;
  manifestIds?: string[];
  cdfIds?: string[];
  correlationId: string;
  jobId?: string | null;
  commandId?: string | null;
  integrationAccountId?: string | null;
  sessionContextId?: string | null;
}) {
  const result = await query<ConversationDeterministicTrailRow>(
    `insert into conversation_deterministic_trails(
      id,
      conversation_session_id,
      conversation_turn_id,
      phase,
      intent,
      execution_status,
      snapshot_token,
      snapshot_payload,
      plan_payload,
      result_payload,
      metadata,
      manifest_ids,
      cdf_ids,
      correlation_id,
      job_id,
      command_id,
      integration_account_id,
      session_context_id
    ) values (
      $1,$2,$3,$4,$5,$6,$7,$8::jsonb,$9::jsonb,$10::jsonb,$11::jsonb,$12::jsonb,$13::jsonb,$14,$15,$16,$17,$18
    ) returning *`,
    [
      input.id,
      input.conversationSessionId,
      input.conversationTurnId,
      input.phase,
      input.intent || null,
      input.executionStatus || 'processing',
      input.snapshotToken || null,
      JSON.stringify(input.snapshotPayload || {}),
      JSON.stringify(input.planPayload || {}),
      JSON.stringify(input.resultPayload || {}),
      JSON.stringify(input.metadata || {}),
      JSON.stringify(input.manifestIds || []),
      JSON.stringify(input.cdfIds || []),
      input.correlationId,
      input.jobId || null,
      input.commandId || null,
      input.integrationAccountId || null,
      input.sessionContextId || null
    ]
  );

  return mapTrail(result.rows[0]);
}

// conversation-feedback-service.ts — feedback explícito 👍/👎 do usuário (F5).
//
// Grava em conversation_feedback (1 por usuário+turno; último clique vence) e
// encaminha o evento ao ai-control-plane (rollup cross-app) em best-effort:
// falha de rede NUNCA afeta a resposta ao usuário.

import { createPrefixedId } from '../../lib/ids.js';
import { query } from '../../db/pool.js';
import { aiMetrics } from '../../lib/ai-metrics.js';

export type ConversationFeedbackInput = {
  conversationSessionId?: string | null;
  correlationId: string;
  channel?: string | null;
  feedbackType: 'positive' | 'negative';
  userId?: string | null;
  toolName?: string | null;
  userComment?: string | null;
};

export type ConversationFeedbackRecord = {
  id: string;
  correlationId: string;
  feedbackType: 'positive' | 'negative';
};

function controlPlaneUrl(): string | null {
  const raw = (process.env.AI_CONTROL_PLANE_URL || '').trim();
  return raw ? raw.replace(/\/+$/, '') : null;
}

/** Encaminha ao ai-control-plane (fire-and-forget; timeout curto). */
function forwardToControlPlane(input: ConversationFeedbackInput): void {
  const base = controlPlaneUrl();
  if (!base) return;
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 2000);
  void fetch(`${base}/v1/feedback`, {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      authorization: `Bearer ${(process.env.AI_CONTROL_PLANE_TOKEN || '').trim()}`
    },
    body: JSON.stringify({
      app: 'sicat',
      surface: input.channel === 'inapp' ? 'copilot' : 'chat',
      kind: input.feedbackType === 'positive' ? 'thumbs_up' : 'thumbs_down',
      refId: input.correlationId,
      toolName: input.toolName || null,
      comment: input.userComment || null
    }),
    signal: controller.signal
  })
    .catch(() => { /* rollup é best-effort */ })
    .finally(() => clearTimeout(timer));
}

export async function recordConversationFeedback(
  input: ConversationFeedbackInput
): Promise<ConversationFeedbackRecord> {
  const id = createPrefixedId('cfbk');
  const correlationId = String(input.correlationId || '').trim();
  if (!correlationId) {
    throw Object.assign(new Error('correlationId obrigatorio para feedback'), { statusCode: 400 });
  }
  const feedbackType = input.feedbackType === 'negative' ? 'negative' : 'positive';

  await query(
    `insert into conversation_feedback
       (id, conversation_session_id, correlation_id, channel_type, feedback_type, user_id, tool_name, user_comment)
     values ($1, $2, $3, $4, $5, $6, $7, $8)
     on conflict (correlation_id, coalesce(user_id, ''))
     do update set feedback_type = excluded.feedback_type,
                   user_comment  = excluded.user_comment,
                   created_at    = now()`,
    [
      id,
      input.conversationSessionId || null,
      correlationId,
      input.channel || 'native_chat',
      feedbackType,
      input.userId || null,
      input.toolName || null,
      input.userComment || null
    ]
  );

  aiMetrics.countFeedback(
    input.channel === 'inapp' ? 'copilot' : 'chat',
    feedbackType === 'positive' ? 'thumbs_up' : 'thumbs_down'
  );
  forwardToControlPlane({ ...input, feedbackType, correlationId });

  return { id, correlationId, feedbackType };
}

/** Resumo agregado (consumo do AI Control Center / dashboards). */
export async function summarizeConversationFeedback(days = 7): Promise<{
  positive: number;
  negative: number;
  total: number;
}> {
  const result = await query<{ feedback_type: string; total: string }>(
    `select feedback_type, count(*)::text as total
       from conversation_feedback
      where created_at >= now() - ($1 || ' days')::interval
      group by feedback_type`,
    [String(Math.max(1, days))]
  );
  let positive = 0;
  let negative = 0;
  for (const row of result.rows) {
    if (row.feedback_type === 'positive') positive = Number(row.total) || 0;
    if (row.feedback_type === 'negative') negative = Number(row.total) || 0;
  }
  return { positive, negative, total: positive + negative };
}

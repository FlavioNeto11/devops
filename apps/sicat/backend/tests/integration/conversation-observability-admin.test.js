import { after, before, beforeEach, describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { pool, query } from '../../src/db/pool.js';
import { createConversationService } from '../../src/services/conversation/conversation-service.js';

const ACCOUNT_ID = 'acc_test_conv_obs_001';
const SESSION_ID = 'csn_test_conv_obs_001';
const CORRELATION_ID = 'corr_test_conv_obs_001';
const SESSION_CONTEXT_ID = 'scx_test_conv_obs_001';

describe('conversation observability admin integration', () => {
  before(async () => {
    await pool.connect().then((client) => client.release());
  });

  beforeEach(async () => {
    await query('DELETE FROM conversation_action_logs WHERE conversation_session_id = $1', [SESSION_ID]);
    await query('DELETE FROM conversation_messages WHERE conversation_session_id = $1', [SESSION_ID]);
    await query('DELETE FROM conversation_sessions WHERE id = $1', [SESSION_ID]);
    await query('DELETE FROM audit_logs WHERE correlation_id = $1', [CORRELATION_ID]);
    await query('DELETE FROM session_contexts WHERE id = $1', [SESSION_CONTEXT_ID]);
    await query('DELETE FROM integration_accounts WHERE id = $1', [ACCOUNT_ID]);
    await query(
      'INSERT INTO integration_accounts(id, account_name, is_active) VALUES ($1, $2, $3)',
      [ACCOUNT_ID, 'Conversation Observability QA Account', true]
    );
    await query(
      `INSERT INTO session_contexts(id, integration_account_id, status, user_name, metadata)
       VALUES ($1, $2, $3, $4, $5::jsonb)`,
      [SESSION_CONTEXT_ID, ACCOUNT_ID, 'active', 'QA Tester Obs', JSON.stringify({ source: 'test' })]
    );
  });

  after(async () => {
    await query('DELETE FROM conversation_action_logs WHERE conversation_session_id = $1', [SESSION_ID]);
    await query('DELETE FROM conversation_messages WHERE conversation_session_id = $1', [SESSION_ID]);
    await query('DELETE FROM conversation_sessions WHERE id = $1', [SESSION_ID]);
    await query('DELETE FROM audit_logs WHERE correlation_id = $1', [CORRELATION_ID]);
    await query('DELETE FROM session_contexts WHERE id = $1', [SESSION_CONTEXT_ID]);
    await query('DELETE FROM integration_accounts WHERE id = $1', [ACCOUNT_ID]);
    await pool.end();
  });

  it('persiste trilha operacional sanitizada por turno e tool quando a policy bloqueia execucao', async () => {
    const service = createConversationService({
      llmProvider: {
        async plan() {
          return {
            provider: 'mock-llm',
            confidence: 0.98,
            outputText: 'Vou preparar a impressao.',
            toolCall: {
              name: 'print_manifest',
              arguments: {
                manifestId: 'man_obs_001',
                password: 'super-secret-password',
                authorization: 'Bearer abc.def.ghi',
                apiKey: 'api-key-123',
                nested: {
                  token: 'qa-placeholder-token-value-1234567890',
                  note: 'password=secret-inline token=inline-token'
                }
              },
              confirmed: false
            }
          };
        }
      }
    });

    const result = await service.processTurn({
      body: {
        channel: 'inapp',
        conversationSessionId: SESSION_ID,
        message: { text: 'imprima o manifesto man_obs_001' },
        context: {
          integrationAccountId: ACCOUNT_ID,
          sessionContextId: SESSION_CONTEXT_ID,
          requestedBy: 'qa_tester_obs'
        },
        options: {
          allowActions: true
        }
      },
      correlationId: CORRELATION_ID,
      headers: {},
      idempotencyKey: 'idem_test_conv_obs_001'
    });

    assert.equal(result.status, 'blocked');
    assert.equal(result.policy.reasonCode, 'CONFIRMATION_REQUIRED');

    const actionLogResult = await query(
      `select tool_arguments, result_payload, blocked_reason, requires_confirmation, confirmed_at
         from conversation_action_logs
        where conversation_turn_id = $1
        limit 1`,
      [result.conversationTurnId]
    );
    assert.equal(actionLogResult.rowCount, 1);

    const actionLog = actionLogResult.rows[0];
    assert.equal(actionLog.requires_confirmation, true);
    assert.equal(actionLog.confirmed_at, null);
    assert.match(String(actionLog.blocked_reason || ''), /confirm/i);

    const toolArguments = actionLog.tool_arguments || {};
    assert.equal(toolArguments.password, '[REDACTED]');
    assert.equal(toolArguments.authorization, '[REDACTED]');
    assert.equal(toolArguments.apiKey, '[REDACTED]');
    assert.equal(toolArguments.nested.token, '[REDACTED]');
    assert.match(String(toolArguments.nested.note || ''), /\[REDACTED\]/i);

    const tracePayload = actionLog.result_payload || {};
    assert.equal(tracePayload.traceVersion, 'conversation-operational-observability.v1');
    assert.equal(tracePayload.conversation.conversationSessionId, SESSION_ID);
    assert.equal(tracePayload.conversation.conversationTurnId, result.conversationTurnId);
    assert.equal(tracePayload.conversation.correlationId, CORRELATION_ID);
    assert.equal(tracePayload.conversation.userId, 'qa_tester_obs');
    assert.equal(tracePayload.conversation.integrationAccountId, ACCOUNT_ID);
    assert.equal(tracePayload.conversation.sessionContextId, SESSION_CONTEXT_ID);
    assert.equal(tracePayload.tool.name, 'print_manifest');
    assert.equal(tracePayload.tool.arguments.password, '[REDACTED]');
    assert.equal(tracePayload.policy.reasonCode, 'CONFIRMATION_REQUIRED');
    assert.equal(tracePayload.confirmation.required, true);
    assert.equal(tracePayload.confirmation.provided, false);
    assert.equal(tracePayload.outcome.status, 'blocked');
    assert.equal(tracePayload.outcome.reasonCode, 'CONFIRMATION_REQUIRED');

    const auditResult = await query(
      `select sanitized_body
         from audit_logs
        where correlation_id = $1
        order by occurred_at desc, id desc
        limit 1`,
      [CORRELATION_ID]
    );
    assert.equal(auditResult.rowCount, 1);

    const auditPayload = auditResult.rows[0].sanitized_body || {};
    assert.equal(auditPayload.conversation.conversationTurnId, result.conversationTurnId);
    assert.equal(auditPayload.tool.arguments.password, '[REDACTED]');
    assert.equal(auditPayload.tool.arguments.authorization, '[REDACTED]');
    assert.equal(auditPayload.outcome.status, 'blocked');

    const serialized = JSON.stringify({ actionLog, auditPayload });
    assert.doesNotMatch(serialized, /super-secret-password/i);
    assert.doesNotMatch(serialized, /api-key-123/i);
    assert.doesNotMatch(serialized, /abc\.def\.ghi/i);
    assert.doesNotMatch(serialized, /inline-token/i);
  });
});
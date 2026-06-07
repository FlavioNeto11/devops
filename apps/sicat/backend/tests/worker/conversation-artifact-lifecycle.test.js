import { after, before, beforeEach, describe, it } from 'node:test';
import assert from 'node:assert';
import { query, pool } from '../../src/db/pool.js';
import { findConversationArtifactById } from '../../src/repositories/conversation-artifact-repo.js';
import { applyConversationArtifactTerminalFailureSideEffect } from '../../src/workers/operation-handlers.js';

describe('applyConversationArtifactTerminalFailureSideEffect', () => {
  const sessionId = 'csn_test_conv_art_001';
  const artifactId = 'cart_test_conv_art_001';

  before(async () => {
    await pool.connect().then((client) => client.release());
  });

  beforeEach(async () => {
    await query('DELETE FROM jobs WHERE job_id LIKE $1', ['job_test_conv_art_%']);
    await query('DELETE FROM conversation_artifacts WHERE id LIKE $1', ['cart_test_conv_art_%']);
    await query('DELETE FROM conversation_sessions WHERE id LIKE $1', ['csn_test_conv_art_%']);

    await query(
      `INSERT INTO conversation_sessions(id, channel_type, status, metadata)
       VALUES ($1, $2, $3, $4::jsonb)`,
      [sessionId, 'inapp', 'active', JSON.stringify({ seededBy: 'test' })]
    );

    await query(
      `INSERT INTO conversation_artifacts(
        id, conversation_session_id, conversation_turn_id, artifact_type, source_kind,
        status, title, source_refs, metadata, progress_total, progress_completed,
        progress_failed, correlation_id, job_id
      ) VALUES (
        $1,$2,$3,$4,$5,$6,$7,$8::jsonb,$9::jsonb,$10,$11,$12,$13,$14
      )`,
      [
        artifactId,
        sessionId,
        'ctrn_test_conv_art_001',
        'document',
        'manifest.print',
        'processing',
        'PDF de teste',
        JSON.stringify({ manifestId: 'man_test_conv_art_001' }),
        JSON.stringify({ seededBy: 'test' }),
        1,
        0,
        0,
        'corr_test_conv_art_001',
        'job_test_conv_art_source_001'
      ]
    );
  });

  after(async () => {
    await query('DELETE FROM jobs WHERE job_id LIKE $1', ['job_test_conv_art_%']);
    await query('DELETE FROM conversation_artifacts WHERE id LIKE $1', ['cart_test_conv_art_%']);
    await query('DELETE FROM conversation_sessions WHERE id LIKE $1', ['csn_test_conv_art_%']);
    await pool.end();
  });

  it('marca artifact como failed quando job terminal falha', async () => {
    await applyConversationArtifactTerminalFailureSideEffect(
      {
        jobId: 'job_test_conv_art_001',
        commandId: 'cmd_test_conv_art_001',
        entityType: 'manifest',
        entityId: 'man_test_conv_art_001',
        operation: 'manifest.print',
        status: 'failed',
        attempts: 2,
        maxAttempts: 3,
        payload: { conversationArtifactId: artifactId },
        correlationId: 'corr_test_conv_art_001',
        lastErrorCode: 'GATEWAY_TIMEOUT',
        lastErrorMessage: 'Gateway timeout while printing',
        claimedBy: 'worker-test'
      },
      {
        action: 'failed',
        patch: {
          lastErrorCode: 'GATEWAY_TIMEOUT',
          lastErrorMessage: 'Gateway timeout while printing'
        }
      }
    );

    const artifact = await findConversationArtifactById(artifactId);

    assert.strictEqual(artifact.status, 'failed');
    assert.strictEqual(artifact.progressFailed, 1);
    assert.strictEqual(artifact.metadata.failure.reasonCode, 'GATEWAY_TIMEOUT');
    assert.match(String(artifact.metadata.failure.reasonMessage || ''), /timeout/i);
  });
});

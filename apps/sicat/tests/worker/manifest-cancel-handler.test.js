import { after, before, beforeEach, describe, it } from 'node:test';
import assert from 'node:assert';
import { query, pool } from '../../src/db/pool.js';
import { applyManifestCancelTerminalFailureSideEffect } from '../../src/workers/operation-handlers.js';
import { findJobById } from '../../src/repositories/job-repo.js';
import { findManifestById } from '../../src/repositories/manifest-repo.js';

describe('applyManifestCancelTerminalFailureSideEffect', () => {
  const integrationAccountId = 'acc_test_cancel_wrk_001';
  const sessionContextId = 'scx_test_cancel_wrk_001';
  const manifestId = 'man_test_cancel_wrk_001';
  const jobId = 'job_test_cancel_wrk_001';

  before(async () => {
    await pool.connect().then((client) => client.release());
  });

  beforeEach(async () => {
    await query('DELETE FROM audit_logs WHERE correlation_id LIKE $1', ['corr_test_cancel_%']);
    await query('DELETE FROM jobs WHERE entity_id LIKE $1', ['man_test_cancel_wrk_%']);
    await query('DELETE FROM manifests WHERE id LIKE $1', ['man_test_cancel_wrk_%']);
    await query('DELETE FROM session_contexts WHERE id LIKE $1', ['scx_test_cancel_wrk_%']);
    await query('DELETE FROM integration_accounts WHERE id LIKE $1', ['acc_test_cancel_wrk_%']);

    await query(
      'INSERT INTO integration_accounts(id, account_name, is_active) VALUES ($1, $2, $3)',
      [integrationAccountId, 'Cancel Worker Account', true]
    );

    await query(
      `INSERT INTO session_contexts(
        id, integration_account_id, status, partner_document, partner_type,
        partner_code, user_access_code, user_name, email, jwt_token_ref,
        expires_at, last_validated_at, metadata
      ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13::jsonb)`,
      [
        sessionContextId,
        integrationAccountId,
        'active',
        '31913781000139',
        'J',
        176163,
        333948,
        'Flavio Padilha Neto',
        'flavio_padilha_neto@msn.com',
        'vault://mtr/session-contexts/scx_test_cancel_wrk_001',
        '2030-01-01T00:00:00Z',
        '2026-03-08T00:00:00Z',
        JSON.stringify({ stateCode: 26 })
      ]
    );

    await query(
      `INSERT INTO manifests(
        id, integration_account_id, session_context_id, status,
        external_status, external_reference, external_hash_code, payload, correlation_id
      ) VALUES ($1,$2,$3,$4,$5,$6::jsonb,$7,$8::jsonb,$9)`,
      [
        manifestId,
        integrationAccountId,
        sessionContextId,
        'submitted',
        'salvo',
        JSON.stringify({ manCodigo: 22169012, manNumero: '260010679516' }),
        'hash_cancel_worker_001',
        JSON.stringify({ responsibleName: 'Teste Cancelamento' }),
        'corr_test_cancel_setup_001'
      ]
    );

    await query(
      `INSERT INTO jobs(
        job_id, command_id, entity_type, entity_id, operation, payload,
        status, max_attempts, attempts, correlation_id, started_at, claimed_at, claim_heartbeat_at, claimed_by
      ) VALUES ($1,$2,$3,$4,$5,$6::jsonb,$7,$8,$9,$10,now(),now(),now(),$11)`,
      [
        jobId,
        'cmd_test_cancel_wrk_001',
        'manifest',
        manifestId,
        'manifest.cancel',
        JSON.stringify({ reason: 'cancelamento solicitado' }),
        'running',
        3,
        1,
        'corr_test_cancel_job_001',
        'worker-test'
      ]
    );
  });

  after(async () => {
    await query('DELETE FROM audit_logs WHERE correlation_id LIKE $1', ['corr_test_cancel_%']);
    await query('DELETE FROM jobs WHERE entity_id LIKE $1', ['man_test_cancel_wrk_%']);
    await query('DELETE FROM manifests WHERE id LIKE $1', ['man_test_cancel_wrk_%']);
    await query('DELETE FROM session_contexts WHERE id LIKE $1', ['scx_test_cancel_wrk_%']);
    await query('DELETE FROM integration_accounts WHERE id LIKE $1', ['acc_test_cancel_wrk_%']);
    await pool.end();
  });

  it('preserva status do manifesto e registra mensagem amigável quando o cancel não é confirmado', async () => {
    const job = await findJobById(jobId);

    await applyManifestCancelTerminalFailureSideEffect(job, {
      action: 'failed',
      patch: {
        lastErrorCode: 'MANIFEST_CANCEL_NOT_CONFIRMED',
        lastErrorMessage: 'CETESB ainda não confirmou o cancelamento do manifesto. O status remoto continua "Salvo".'
      }
    });

    const manifest = await findManifestById(manifestId);
    assert.strictEqual(manifest.status, 'submitted');
    assert.strictEqual(manifest.externalStatus, 'salvo');
    assert.strictEqual(manifest.payload.jobResults['manifest.cancel'].outcome, 'manifest_cancel_failed');
    assert.strictEqual(manifest.payload.jobResults['manifest.cancel'].lastErrorCode, 'MANIFEST_CANCEL_NOT_CONFIRMED');
    assert.match(manifest.payload.jobResults['manifest.cancel'].userMessage, /ainda não confirmado pela CETESB/i);
  });
});

import { describe, it, before, after, beforeEach } from 'node:test';
import assert from 'node:assert';
import { query, pool } from '../../src/db/pool.js';
import { getManifest } from '../../src/services/manifest-service.js';
import { validManifestDraft } from '../fixtures/manifests.js';

describe('getManifest - Reconciliation', () => {
  before(async () => {
    await pool.connect().then(client => client.release());
  });

  beforeEach(async () => {
    await query('DELETE FROM jobs WHERE entity_id LIKE $1', ['man_test_rec_%']);
    await query('DELETE FROM manifests WHERE id LIKE $1', ['man_test_rec_%']);
    await query('DELETE FROM integration_accounts WHERE id LIKE $1', ['acc_test_rec_%']);

    await query(
      'INSERT INTO integration_accounts(id, account_name, is_active) VALUES ($1, $2, $3)',
      ['acc_test_rec_001', 'Test Reconciliation Account', true]
    );
  });

  after(async () => {
    await query('DELETE FROM jobs WHERE entity_id LIKE $1', ['man_test_rec_%']);
    await query('DELETE FROM manifests WHERE id LIKE $1', ['man_test_rec_%']);
    await query('DELETE FROM integration_accounts WHERE id LIKE $1', ['acc_test_rec_%']);
    await pool.end();
  });

  it('deve reconciliar manifesto órfão de submitting para failed', async () => {
    await query(
      `INSERT INTO manifests(
        id, integration_account_id, session_context_id, status,
        external_status, external_reference, external_hash_code, payload, correlation_id
      ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8::jsonb,$9)`,
      [
        'man_test_rec_orphan_001',
        'acc_test_rec_001',
        null,
        'submitting',
        'aguardando processamento',
        null,
        null,
        JSON.stringify(validManifestDraft.payload),
        'corr_test_rec_orphan_001'
      ]
    );

    const manifest = await getManifest('man_test_rec_orphan_001');

    assert.strictEqual(manifest.status, 'failed');
    assert.match(manifest.externalStatus, /job de submit não encontrado/i);
    assert.match(manifest.externalStatus, /reenvie o manifesto/i);
  });

  it('deve refletir job terminal dlq quando manifesto está processing', async () => {
    await query(
      `INSERT INTO manifests(
        id, integration_account_id, session_context_id, status,
        external_status, external_reference, external_hash_code, payload, correlation_id
      ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8::jsonb,$9)`,
      [
        'man_test_rec_dlq_001',
        'acc_test_rec_001',
        null,
        'processing',
        'aguardando confirmação CETESB',
        null,
        null,
        JSON.stringify(validManifestDraft.payload),
        'corr_test_rec_dlq_001'
      ]
    );

    await query(
      `INSERT INTO jobs(
        job_id, command_id, entity_type, entity_id, operation, payload,
        status, max_attempts, attempts, correlation_id,
        last_error_code, last_error_message, dlq_reason, finished_at
      ) VALUES ($1,$2,$3,$4,$5,$6::jsonb,$7,$8,$9,$10,$11,$12,$13,now())`,
      [
        'job_test_rec_dlq_001',
        'cmd_test_rec_dlq_001',
        'manifest',
        'man_test_rec_dlq_001',
        'manifest.submit',
        JSON.stringify({ validateOnly: false }),
        'dlq',
        3,
        3,
        'corr_test_rec_dlq_001',
        'CETESB_VALIDATION_ERROR',
        'Resíduo informado com unidade incorreta!',
        'Max attempts exceeded. Last error: Resíduo informado com unidade incorreta!'
      ]
    );

    const manifest = await getManifest('man_test_rec_dlq_001');

    assert.strictEqual(manifest.status, 'failed');
    assert.match(manifest.externalStatus, /DLQ/i);
    assert.match(manifest.externalStatus, /Resíduo informado com unidade incorreta/i);
  });
});

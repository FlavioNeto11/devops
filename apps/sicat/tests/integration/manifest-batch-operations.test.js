import { describe, it, before, after, beforeEach } from 'node:test';
import assert from 'node:assert';
import { query, pool } from '../../src/db/pool.js';
import { setConfigOverride } from '../../src/lib/config.js';
import { createPrefixedId } from '../../src/lib/ids.js';

describe('Manifest batch operations (integration)', () => {
  let createManifestBatch;
  let replicateManifest;
  let enqueueManifestBatchSubmit;
  let enqueueManifestBatchCancel;

  before(async () => {
    setConfigOverride('cetesbGatewayMode', 'real');

    const services = await import('../../src/services/manifest-service.js');
    createManifestBatch = services.createManifestBatch;
    replicateManifest = services.replicateManifest;
    enqueueManifestBatchSubmit = services.enqueueManifestBatchSubmit;
    enqueueManifestBatchCancel = services.enqueueManifestBatchCancel;
    await pool.connect().then((client) => client.release());
  });

  beforeEach(async () => {
    await query('DELETE FROM jobs WHERE entity_id LIKE $1', ['man_batch_%']);
    await query('DELETE FROM manifests WHERE integration_account_id LIKE $1', ['acc_batch_%']);
    await query('DELETE FROM session_contexts WHERE id LIKE $1', ['scx_batch_%']);
    await query('DELETE FROM integration_accounts WHERE id LIKE $1', ['acc_batch_%']);

    await query(
      `INSERT INTO integration_accounts(id, account_name, partner_code, state_code, is_active)
       VALUES ($1,$2,$3,$4,$5)`,
      ['acc_batch_001', 'Batch Test Account', 176163, 26, true]
    );

    await query(
      `INSERT INTO session_contexts(
         id, integration_account_id, status, partner_document, partner_type,
         partner_code, user_access_code, user_name, email, auth_mode,
         jwt_token, jwt_token_ref, expires_at, last_validated_at, metadata
       ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15::jsonb)`,
      [
        'scx_batch_001',
        'acc_batch_001',
        'active',
        '31913781000139',
        'J',
        176163,
        333948,
        'Flavio Padilha Neto',
        'flavio_padilha_neto@msn.com',
        'manual-token',
        'eyJhbGciOiJIUzUxMiJ9.eyJzdWIiOiIxNzYxNjMsMzMzOTQ4Iiwicm9sZSI6MSwiZXhwIjoxODkzNDU2MDAwfQ.abc',
        'vault://mtr/session-contexts/scx_batch_001',
        '2030-01-01T00:00:00Z',
        '2026-03-08T00:00:00Z',
        JSON.stringify({ stateCode: 26 })
      ]
    );
  });

  after(async () => {
    await query('DELETE FROM jobs WHERE entity_id LIKE $1', ['man_batch_%']);
    await query('DELETE FROM manifests WHERE integration_account_id LIKE $1', ['acc_batch_%']);
    await query('DELETE FROM session_contexts WHERE id LIKE $1', ['scx_batch_%']);
    await query('DELETE FROM integration_accounts WHERE id LIKE $1', ['acc_batch_%']);
    await pool.end();
  });

  it('creates a homogeneous batch of draft manifests with the same groupId', async () => {
    const result = await createManifestBatch({
      integrationAccountId: 'acc_batch_001',
      sessionContextId: 'scx_batch_001',
      requestedBy: 'flavio.padilha',
      count: 3,
      template: {
        integrationAccountId: 'acc_batch_001',
        sessionContextId: 'scx_batch_001',
        requestedBy: 'flavio.padilha',
        manifestType: 1,
        state: { code: 26, abbreviation: 'SP' },
        responsibleName: 'Flavio Padilha Neto',
        expeditionDate: '2026-03-07',
        hasTemporaryStorage: false,
        hasCadriInResidueList: false,
        generator: { partnerCode: 176163, description: 'Nova IT' },
        carrier: { partnerCode: 160627, description: 'CASAMAX' },
        receiver: { partnerCode: 40110, description: 'MARDAN' },
        residues: [
          {
            lineNumber: 1,
            quantity: 18,
            weightTon: 18,
            unit: { code: 3, description: 'Tonelada' },
            residue: { code: 731, description: 'RCC' },
            treatment: { code: 51, description: 'Aterro' },
            class: { code: 11, description: 'Classe A' },
            stateType: { code: 4, description: 'SOLIDO' },
            packagingType: { code: 4, description: 'CAÇAMBA ABERTA' }
          }
        ]
      }
    }, 'corr_batch_create_001');

    assert.ok(result.groupId, 'Deve retornar groupId');
    assert.strictEqual(result.total, 3, 'Deve retornar total criado');
    assert.strictEqual(result.items.length, 3, 'Deve retornar os itens criados');
    assert.ok(result.items.every((item) => item.groupId === result.groupId), 'Todos os itens devem compartilhar o mesmo groupId');
  });

  it('replicates an existing manifest and marks the source manifest id', async () => {
    const sourceManifestId = createPrefixedId('man_batch');

    await query(
      `INSERT INTO manifests(
         id, integration_account_id, session_context_id, status, external_status, payload, requested_by, correlation_id
       ) VALUES ($1,$2,$3,$4,$5,$6::jsonb,$7,$8)`,
      [
        sourceManifestId,
        'acc_batch_001',
        'scx_batch_001',
        'draft',
        'pending_submission',
        JSON.stringify({
          integrationAccountId: 'acc_batch_001',
          sessionContextId: 'scx_batch_001',
          requestedBy: 'flavio.padilha',
          manifestType: 1,
          state: { code: 26, abbreviation: 'SP' },
          responsibleName: 'Flavio Padilha Neto',
          expeditionDate: '2026-03-07',
          hasTemporaryStorage: false,
          hasCadriInResidueList: false,
          generator: { partnerCode: 176163, description: 'Nova IT' },
          carrier: { partnerCode: 160627, description: 'CASAMAX' },
          receiver: { partnerCode: 40110, description: 'MARDAN' },
          residues: [
            {
              lineNumber: 1,
              quantity: 18,
              weightTon: 18,
              unit: { code: 3, description: 'Tonelada' },
              residue: { code: 731, description: 'RCC' },
              treatment: { code: 51, description: 'Aterro' },
              class: { code: 11, description: 'Classe A' },
              stateType: { code: 4, description: 'SOLIDO' },
              packagingType: { code: 4, description: 'CAÇAMBA ABERTA' }
            }
          ]
        }),
        'flavio.padilha',
        'corr_batch_source_001'
      ]
    );

    const result = await replicateManifest(sourceManifestId, {
      requestedBy: 'flavio.padilha',
      count: 2,
      overrides: {
        expeditionDate: '2026-03-08',
        notes: 'Réplica em lote'
      }
    }, 'corr_batch_replicate_001');

    assert.strictEqual(result.total, 2, 'Deve criar duas cópias');
    assert.strictEqual(result.sourceManifestId, sourceManifestId, 'Deve informar manifesto base');
    assert.ok(result.items.every((item) => item.sourceManifestId === sourceManifestId), 'Cada cópia deve carregar sourceManifestId');
    assert.ok(result.items.every((item) => item.expeditionDate === '2026-03-08'), 'As cópias devem receber os overrides informados');
  });

  it('enqueues batch cancel jobs for selected manifests', async () => {
    const manifestA = createPrefixedId('man_batch');
    const manifestB = createPrefixedId('man_batch');

    for (const manifestId of [manifestA, manifestB]) {
      await query(
        `INSERT INTO manifests(
           id, integration_account_id, session_context_id, status, external_reference, external_hash_code, payload, requested_by, correlation_id
         ) VALUES ($1,$2,$3,$4,$5::jsonb,$6,$7::jsonb,$8,$9)`,
        [
          manifestId,
          'acc_batch_001',
          'scx_batch_001',
          'submitted',
          JSON.stringify({ manCodigo: 22169012, manNumero: '260010679516' }),
          `hash_${manifestId}`,
          JSON.stringify({ integrationAccountId: 'acc_batch_001' }),
          'flavio.padilha',
          `corr_${manifestId}`
        ]
      );
    }

    const result = await enqueueManifestBatchCancel({
      manifestIds: [manifestA, manifestB],
      requestedBy: 'flavio.padilha',
      reason: 'erro no cadastro'
    }, { 'idempotency-key': 'batch-cancel-001' }, 'corr_batch_cancel_001');

    assert.ok(result.groupId, 'Deve retornar groupId do cancelamento');
    assert.strictEqual(result.total, 2, 'Deve enfileirar dois cancelamentos');
    assert.strictEqual(result.items.length, 2, 'Deve retornar comandos aceitos dos dois manifestos');

    const queuedJobs = await query(
      `SELECT entity_id, operation, status FROM jobs WHERE entity_id = ANY($1::text[]) ORDER BY entity_id`,
      [[manifestA, manifestB]]
    );

    assert.strictEqual(queuedJobs.rowCount, 2, 'Deve criar dois jobs');
    assert.ok(queuedJobs.rows.every((row) => row.operation === 'manifest.cancel'), 'Todos os jobs devem ser de cancelamento');
    assert.ok(
      queuedJobs.rows.every((row) => ['queued', 'running', 'retry_wait', 'failed', 'dlq'].includes(row.status)),
      'Todos os jobs devem permanecer em estado valido do ciclo assincrono'
    );
  });

  it('enqueues batch submit jobs for selected draft manifests', async () => {
    const manifestA = createPrefixedId('man_batch');
    const manifestB = createPrefixedId('man_batch');

    for (const manifestId of [manifestA, manifestB]) {
      await query(
        `INSERT INTO manifests(
           id, integration_account_id, session_context_id, status, external_status, payload, requested_by, correlation_id
         ) VALUES ($1,$2,$3,$4,$5,$6::jsonb,$7,$8)`,
        [
          manifestId,
          'acc_batch_001',
          'scx_batch_001',
          'draft',
          'pending_submission',
          JSON.stringify({ integrationAccountId: 'acc_batch_001', sessionContextId: 'scx_batch_001' }),
          'flavio.padilha',
          `corr_${manifestId}`
        ]
      );
    }

    const result = await enqueueManifestBatchSubmit({
      manifestIds: [manifestA, manifestB],
      sessionContextId: 'scx_batch_001',
      requestedBy: 'flavio.padilha',
      validateOnly: false,
      printAfterSubmit: false
    }, { 'idempotency-key': 'batch-submit-001' }, 'corr_batch_submit_001');

    assert.ok(result.groupId, 'Deve retornar groupId do envio');
    assert.strictEqual(result.total, 2, 'Deve enfileirar dois envios');
    assert.strictEqual(result.items.length, 2, 'Deve retornar comandos aceitos dos dois manifestos');

    const queuedJobs = await query(
      `SELECT entity_id, operation, status FROM jobs WHERE entity_id = ANY($1::text[]) ORDER BY entity_id`,
      [[manifestA, manifestB]]
    );

    assert.strictEqual(queuedJobs.rowCount, 2, 'Deve criar dois jobs');
    assert.ok(queuedJobs.rows.every((row) => row.operation === 'manifest.submit'), 'Todos os jobs devem ser de envio');
    assert.ok(
      queuedJobs.rows.every((row) => ['queued', 'running'].includes(row.status)),
      'Todos os jobs devem estar queued ou running'
    );
  });
});

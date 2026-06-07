import { describe, it, before, after, beforeEach } from 'node:test';
import assert from 'node:assert';
import { query, pool } from '../../src/db/pool.js';
import {
  enqueueManifestReceive,
  enqueueCdfGenerate,
  enqueueCdfDownload
} from '../../src/services/manifest-service.js';
import { findJobById } from '../../src/repositories/job-repo.js';
import { findAsyncOperationEntity } from '../../src/repositories/async-operation-repo.js';
import { validSessionContext } from '../fixtures/session-contexts.js';

function assertAsyncLifecycleStatus(status) {
  assert.ok(['queued', 'running', 'succeeded'].includes(status));
}

describe('Detached async operations enqueue (integration)', () => {
  const accountPrefix = 'acc_async_int_';
  const sessionPrefix = 'scx_async_int_';
  const receivePrefix = 'mrc_async_int_';

  async function cleanupAsyncArtifacts() {
    await query(
      `DELETE FROM async_operation_documents doc
       USING async_operation_entities entity
       WHERE doc.owner_entity_type = entity.entity_type
         AND doc.owner_entity_id = entity.entity_id
         AND entity.integration_account_id LIKE $1`,
      [`${accountPrefix}%`]
    );
    await query(
      `DELETE FROM jobs job
       USING async_operation_entities entity
       WHERE job.entity_type = entity.entity_type
         AND job.entity_id = entity.entity_id
         AND entity.integration_account_id LIKE $1`,
      [`${accountPrefix}%`]
    );
    await query(
      `DELETE FROM idempotency_registry
       WHERE entity_type IN ('manifestReceipt', 'cdf')
         AND entity_id IN (
           SELECT entity_id
           FROM async_operation_entities
           WHERE integration_account_id LIKE $1
         )`,
      [`${accountPrefix}%`]
    );
    await query('DELETE FROM async_operation_entities WHERE integration_account_id LIKE $1', [`${accountPrefix}%`]);
    await query('DELETE FROM session_contexts WHERE id LIKE $1', [`${sessionPrefix}%`]);
    await query('DELETE FROM integration_accounts WHERE id LIKE $1', [`${accountPrefix}%`]);
  }

  before(async () => {
    await pool.connect().then((client) => client.release());
  });

  beforeEach(async () => {
    await cleanupAsyncArtifacts();

    await query(
      `INSERT INTO integration_accounts(id, account_name, partner_code, state_code, is_active)
       VALUES ($1,$2,$3,$4,$5)`,
      [`${accountPrefix}001`, 'Async Integration Account', validSessionContext.partnerCode, 26, true]
    );

    await query(
      `INSERT INTO session_contexts(
        id, integration_account_id, status, partner_document, partner_type,
        partner_code, user_access_code, user_name, email, jwt_token_ref,
        expires_at, last_validated_at, metadata
      ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13::jsonb)`,
      [
        `${sessionPrefix}001`,
        `${accountPrefix}001`,
        validSessionContext.status,
        validSessionContext.partnerDocument,
        validSessionContext.partnerType,
        validSessionContext.partnerCode,
        validSessionContext.userAccessCode,
        validSessionContext.userName,
        validSessionContext.email,
        validSessionContext.jwtTokenRef,
        validSessionContext.expiresAt,
        validSessionContext.lastValidatedAt,
        JSON.stringify(validSessionContext.metadata)
      ]
    );
  });

  after(async () => {
    await cleanupAsyncArtifacts();
    await pool.end();
  });

  it('enqueues manifest.receive and persists detached async entity', async () => {
    const result = await enqueueManifestReceive(
      {
        integrationAccountId: `${accountPrefix}001`,
        sessionContextId: `${sessionPrefix}001`,
        requestedBy: 'test.user',
        printReceiptAfterReceive: true,
        receiptPayload: {
          dateFrom: '2026-04-01',
          dateTo: '2026-04-30',
          rrmCodigo: 456,
          manifesto: {
            manCodigo: 22169012,
            manNumero: '260010679516',
            manHashCode: `${receivePrefix}hash_001`
          }
        }
      },
      { 'idempotency-key': 'idem_receive_001' },
      'corr_receive_001'
    );

    assert.ok(result.commandId);
    assert.ok(result.jobId);
    assert.strictEqual(result.entityType, 'manifestReceipt');
    assert.strictEqual(result.operation, 'manifest.receive');
    assert.strictEqual(result.status, 'queued');

    const job = await findJobById(result.jobId);
    assertAsyncLifecycleStatus(job.status);
    assert.strictEqual(job.entityType, 'manifestReceipt');
    assert.strictEqual(job.operation, 'manifest.receive');
    assert.strictEqual(job.correlationId, 'corr_receive_001');
    assert.strictEqual(job.payload.sessionContextId, `${sessionPrefix}001`);
    assert.strictEqual(job.payload.integrationAccountId, `${accountPrefix}001`);
    assert.strictEqual(job.payload.printReceiptAfterReceive, true);

    const entity = await findAsyncOperationEntity(result.entityType, result.entityId);
    assert.ok(entity);
  assertAsyncLifecycleStatus(entity.status);
    assert.strictEqual(entity.integrationAccountId, `${accountPrefix}001`);
    assert.strictEqual(entity.sessionContextId, `${sessionPrefix}001`);
    assert.strictEqual(entity.payload.printReceiptAfterReceive, true);
    assert.strictEqual(entity.payload.receiptPayload.manifesto.manNumero, '260010679516');
  });

  it('reuses manifest.receive response for the same idempotency key', async () => {
    const body = {
      integrationAccountId: `${accountPrefix}001`,
      sessionContextId: `${sessionPrefix}001`,
      requestedBy: 'test.user',
      receiptPayload: {
        rrmCodigo: 456,
        manifesto: {
          manCodigo: 22169012,
          manNumero: '260010679516'
        }
      }
    };

    const first = await enqueueManifestReceive(body, { 'idempotency-key': 'idem_receive_reuse_001' }, 'corr_receive_002');
    const second = await enqueueManifestReceive(body, { 'idempotency-key': 'idem_receive_reuse_001' }, 'corr_receive_003');

    assert.strictEqual(first.commandId, second.commandId);
    assert.strictEqual(first.jobId, second.jobId);

    const jobCount = await query(
      `SELECT COUNT(*)
       FROM jobs job
       JOIN async_operation_entities entity
         ON entity.entity_type = job.entity_type
        AND entity.entity_id = job.entity_id
       WHERE job.operation = $1
         AND job.entity_type = $2
         AND entity.integration_account_id LIKE $3`,
      ['manifest.receive', 'manifestReceipt', `${accountPrefix}%`]
    );
    assert.strictEqual(Number.parseInt(jobCount.rows[0].count, 10), 1);
  });

  it('enqueues cdf.generate and persists generator payload for worker processing', async () => {
    const result = await enqueueCdfGenerate(
      {
        integrationAccountId: `${accountPrefix}001`,
        sessionContextId: `${sessionPrefix}001`,
        requestedBy: 'test.user',
        cdfPayload: {
          cerDataInicial: '2026-04-01',
          cerDataFinal: '2026-04-30',
          cerObservacao: 'geracao automatizada',
          parceiroDestinador: { parCodigo: validSessionContext.partnerCode },
          responsavel: { cdrCodigo: 789 },
          listaParceiroGerador: [{ parCodigo: 321, parCnpj: '12345678000199' }],
          listaManifesto: [{ manCodigo: 22169012, manNumero: '260010679516', manHashCode: 'hash-cdf-001' }]
        }
      },
      { 'idempotency-key': 'idem_cdf_generate_001' },
      'corr_cdf_generate_001'
    );

    assert.strictEqual(result.entityType, 'cdf');
    assert.strictEqual(result.operation, 'cdf.generate');
    assert.strictEqual(result.status, 'queued');

    const job = await findJobById(result.jobId);
  assertAsyncLifecycleStatus(job.status);
    assert.strictEqual(job.payload.integrationAccountId, `${accountPrefix}001`);
    assert.strictEqual(job.payload.cdfPayload.cerObservacao, 'geracao automatizada');

    const entity = await findAsyncOperationEntity('cdf', result.entityId);
    assert.ok(entity);
  assertAsyncLifecycleStatus(entity.status);
    assert.strictEqual(entity.payload.cdfPayload.responsavel.cdrCodigo, 789);
    assert.strictEqual(entity.payload.cdfPayload.listaManifesto[0].manHashCode, 'hash-cdf-001');
  });

  it('enqueues cdf.download and normalizes certificate criteria from document identifier aliases', async () => {
    const result = await enqueueCdfDownload(
      {
        integrationAccountId: `${accountPrefix}001`,
        sessionContextId: `${sessionPrefix}001`,
        requestedBy: 'test.user',
        certificateHashCode: 'cdf-download-hash-001',
        cerCodigo: 98765,
        dateFrom: '2026-04-01',
        dateTo: '2026-04-30'
      },
      { 'idempotency-key': 'idem_cdf_download_001' },
      'corr_cdf_download_001'
    );

    assert.strictEqual(result.entityType, 'cdf');
    assert.strictEqual(result.operation, 'cdf.download');

    const job = await findJobById(result.jobId);
    assert.strictEqual(job.payload.documentId, 'cdf-download-hash-001');
    assert.strictEqual(job.payload.certificateCriteria.cerHashCode, 'cdf-download-hash-001');
    assert.strictEqual(job.payload.certificateCriteria.cerCodigo, 98765);
    assert.strictEqual(job.payload.certificateCriteria.dateFrom, '2026-04-01');
    assert.strictEqual(job.payload.certificateCriteria.dateTo, '2026-04-30');

    const entity = await findAsyncOperationEntity('cdf', result.entityId);
    assert.ok(entity);
    assert.strictEqual(entity.payload.documentId, 'cdf-download-hash-001');
    assert.strictEqual(entity.payload.certificateCriteria.cerHashCode, 'cdf-download-hash-001');
  });
});
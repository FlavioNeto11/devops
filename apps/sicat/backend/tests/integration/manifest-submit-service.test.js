import { describe, it, before, after, beforeEach } from 'node:test';
import assert from 'node:assert';
import { query, pool } from '../../src/db/pool.js';
import { enqueueManifestSubmit } from '../../src/services/manifest-service.js';
import { findJobById } from '../../src/repositories/job-repo.js';
import { findManifestById } from '../../src/repositories/manifest-repo.js';
import { validManifestDraft, validManifestWithoutSessionContext } from '../fixtures/manifests.js';
import { validSessionContext } from '../fixtures/session-contexts.js';

/**
 * Testes de integração para enqueueManifestSubmit
 * 
 * Cobertura:
 * - criação de job e atualização de status
 * - persistência de idempotência
 * - validações de negócio
 * - propagação de correlationId
 * - comportamento com diferentes payloads
 */

describe('enqueueManifestSubmit - Integration', () => {
  const accountPrefix = 'acc_submit_int_';
  const sessionPrefix = 'scx_submit_int_';
  const manifestPrefix = 'man_submit_int_';

  let testManifestId;
  let testManifestNoSessionId;
  let testSessionContextId;

  before(async () => {
    await pool.connect().then(client => client.release());
  });

  beforeEach(async () => {
    // Limpa tabelas na ordem correta de FK
    await query('DELETE FROM jobs WHERE entity_id LIKE $1', [`${manifestPrefix}%`]);
    await query('DELETE FROM idempotency_registry WHERE entity_id LIKE $1', [`${manifestPrefix}%`]);
    await query('DELETE FROM manifests WHERE id LIKE $1', [`${manifestPrefix}%`]);
    await query('DELETE FROM session_contexts WHERE id LIKE $1', [`${sessionPrefix}%`]);
    await query('DELETE FROM integration_accounts WHERE id LIKE $1', [`${accountPrefix}%`]);

    // Cria integration account
    await query(
      `INSERT INTO integration_accounts(id, account_name, is_active) VALUES ($1, $2, $3)`,
      [`${accountPrefix}001`, 'Test Integration Account', true]
    );

    // Cria session context
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
    testSessionContextId = `${sessionPrefix}001`;

    // Cria manifesto com session context
    await query(
      `INSERT INTO manifests(
        id, integration_account_id, session_context_id, status,
        external_status, external_reference, external_hash_code, payload, correlation_id
      ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8::jsonb,$9)`,
      [
        `${manifestPrefix}draft_001`,
        `${accountPrefix}001`,
        `${sessionPrefix}001`,
        validManifestDraft.status,
        validManifestDraft.externalStatus,
        validManifestDraft.externalReference,
        validManifestDraft.externalHashCode,
        JSON.stringify(validManifestDraft.payload),
        'corr_test_setup_001'
      ]
    );
    testManifestId = `${manifestPrefix}draft_001`;

    // Cria manifesto sem session context
    await query(
      `INSERT INTO manifests(
        id, integration_account_id, session_context_id, status,
        external_status, external_reference, external_hash_code, payload, correlation_id
      ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8::jsonb,$9)`,
      [
        `${manifestPrefix}nosession_001`,
        `${accountPrefix}001`,
        null,
        validManifestWithoutSessionContext.status,
        validManifestWithoutSessionContext.externalStatus,
        validManifestWithoutSessionContext.externalReference,
        validManifestWithoutSessionContext.externalHashCode,
        JSON.stringify(validManifestWithoutSessionContext.payload),
        'corr_test_setup_002'
      ]
    );
    testManifestNoSessionId = `${manifestPrefix}nosession_001`;
  });

  after(async () => {
    await query('DELETE FROM jobs WHERE entity_id LIKE $1', [`${manifestPrefix}%`]);
    await query('DELETE FROM idempotency_registry WHERE entity_id LIKE $1', [`${manifestPrefix}%`]);
    await query('DELETE FROM manifests WHERE id LIKE $1', [`${manifestPrefix}%`]);
    await query('DELETE FROM session_contexts WHERE id LIKE $1', [`${sessionPrefix}%`]);
    await query('DELETE FROM integration_accounts WHERE id LIKE $1', [`${accountPrefix}%`]);
    await pool.end();
  });

  it('deve criar job e atualizar status do manifesto para queued_submit', async () => {
    const body = {
      sessionContextId: testSessionContextId,
      validateOnly: false,
      printAfterSubmit: false,
      requestedBy: 'test.user'
    };
    const headers = { 'idempotency-key': 'idem_int_001' };
    const correlationId = 'corr_int_001';

    const result = await enqueueManifestSubmit(testManifestId, body, headers, correlationId);

    assert.ok(result.commandId);
    assert.ok(result.jobId);
    assert.strictEqual(result.correlationId, correlationId);
    assert.strictEqual(result.entityType, 'manifest');
    assert.strictEqual(result.entityId, testManifestId);
    assert.strictEqual(result.operation, 'manifest.submit');
    assert.strictEqual(result.status, 'queued');

    // Valida manifesto
    const manifest = await findManifestById(testManifestId);
    assert.strictEqual(manifest.status, 'queued_submit');
    assert.strictEqual(manifest.sessionContextId, testSessionContextId);

    // Valida job
    const job = await findJobById(result.jobId);
    assert.strictEqual(job.operation, 'manifest.submit');
    assert.strictEqual(job.status, 'queued');
    assert.strictEqual(job.entityId, testManifestId);
    assert.strictEqual(job.correlationId, correlationId);
    assert.strictEqual(job.payload.sessionContextId, testSessionContextId);
    assert.strictEqual(job.payload.validateOnly, false);
    assert.strictEqual(job.payload.printAfterSubmit, false);
  });

  it('deve usar sessionContextId do manifesto quando não fornecido no body', async () => {
    const body = {
      validateOnly: false,
      requestedBy: 'test.user'
    };
    const headers = {};
    const correlationId = 'corr_int_002';

    const result = await enqueueManifestSubmit(testManifestId, body, headers, correlationId);

    const job = await findJobById(result.jobId);
    assert.strictEqual(job.payload.sessionContextId, testSessionContextId);
  });

  it('deve retornar mesma resposta para mesma idempotency-key', async () => {
    const body = {
      sessionContextId: testSessionContextId,
      validateOnly: false,
      requestedBy: 'test.user'
    };
    const headers = { 'idempotency-key': 'idem_int_reuse_001' };
    const correlationId = 'corr_int_003';

    const result1 = await enqueueManifestSubmit(testManifestId, body, headers, correlationId);
    const result2 = await enqueueManifestSubmit(testManifestId, body, headers, correlationId);

    assert.strictEqual(result1.commandId, result2.commandId);
    assert.strictEqual(result1.jobId, result2.jobId);

    // Deve criar apenas 1 job
    const jobCount = await query('SELECT COUNT(*) FROM jobs WHERE entity_id = $1', [testManifestId]);
    assert.strictEqual(parseInt(jobCount.rows[0].count), 1);
  });

  it('deve reutilizar job ativo existente para mesma operação de submit', async () => {
    await query(
      `INSERT INTO jobs(
        job_id, command_id, entity_type, entity_id, operation, payload,
        status, max_attempts, correlation_id, priority, retry_strategy, base_delay_ms, max_delay_ms, tags
      ) VALUES ($1,$2,$3,$4,$5,$6::jsonb,$7,$8,$9,$10,$11,$12,$13,$14::jsonb)`,
      [
        'job_test_int_existing_submit_001',
        'cmd_test_int_existing_submit_001',
        'manifest',
        testManifestId,
        'manifest.submit',
        JSON.stringify({ sessionContextId: testSessionContextId }),
        'queued',
        5,
        'corr_existing_submit_001',
        8,
        'exponential',
        2000,
        300000,
        JSON.stringify(['category:manifest', 'entity:manifest', 'status:queued'])
      ]
    );

    const body = {
      sessionContextId: testSessionContextId,
      validateOnly: false,
      requestedBy: 'test.user'
    };

    const result = await enqueueManifestSubmit(
      testManifestId,
      body,
      { 'idempotency-key': 'idem_int_existing_active_001' },
      'corr_int_existing_active_001'
    );

    assert.strictEqual(result.jobId, 'job_test_int_existing_submit_001');
    assert.strictEqual(result.commandId, 'cmd_test_int_existing_submit_001');

    const activeCount = await query(
      `SELECT COUNT(*)::int AS count
         FROM jobs
        WHERE entity_id = $1
          AND operation = 'manifest.submit'
          AND status IN ('queued', 'running', 'retry_wait')`,
      [testManifestId]
    );
    assert.strictEqual(activeCount.rows[0].count, 1);
  });

  it('deve lançar erro 404 quando manifesto não existe', async () => {
    const body = { sessionContextId: testSessionContextId };
    const headers = {};
    const correlationId = 'corr_int_004';

    await assert.rejects(
      async () => {
        await enqueueManifestSubmit('man_inexistente_999', body, headers, correlationId);
      },
      (err) => {
        assert.strictEqual(err.statusCode, 404);
        assert.match(err.message, /not found/i);
        return true;
      }
    );
  });

  it('deve lançar erro 400 quando sessionContextId não existe', async () => {
    const body = { sessionContextId: 'scx_inexistente_999' };
    const headers = {};
    const correlationId = 'corr_int_005';

    await assert.rejects(
      async () => {
        await enqueueManifestSubmit(testManifestId, body, headers, correlationId);
      },
      (err) => {
        assert.strictEqual(err.statusCode, 400);
        assert.match(err.message, /was not found/i);
        return true;
      }
    );
  });

  it('deve lançar erro 400 quando sessionContextId está ausente', async () => {
    const body = { validateOnly: false };
    const headers = {};
    const correlationId = 'corr_int_006';

    await assert.rejects(
      async () => {
        await enqueueManifestSubmit(testManifestNoSessionId, body, headers, correlationId);
      },
      (err) => {
        assert.strictEqual(err.statusCode, 400);
        assert.match(err.message, /obrigatório/i);
        return true;
      }
    );
  });

  it('deve persistir validateOnly=true no payload do job', async () => {
    const body = {
      sessionContextId: testSessionContextId,
      validateOnly: true,
      requestedBy: 'test.user'
    };
    const headers = {};
    const correlationId = 'corr_int_007';

    const result = await enqueueManifestSubmit(testManifestId, body, headers, correlationId);

    const job = await findJobById(result.jobId);
    assert.strictEqual(job.payload.validateOnly, true);
  });

  it('deve persistir printAfterSubmit=true no payload do job', async () => {
    const body = {
      sessionContextId: testSessionContextId,
      validateOnly: false,
      printAfterSubmit: true,
      requestedBy: 'test.user'
    };
    const headers = {};
    const correlationId = 'corr_int_008';

    const result = await enqueueManifestSubmit(testManifestId, body, headers, correlationId);

    const job = await findJobById(result.jobId);
    assert.strictEqual(job.payload.printAfterSubmit, true);
  });

  it('deve propagar correlationId para job', async () => {
    const body = { sessionContextId: testSessionContextId };
    const headers = {};
    const correlationId = 'corr_int_propagate_001';

    const result = await enqueueManifestSubmit(testManifestId, body, headers, correlationId);

    const job = await findJobById(result.jobId);
    assert.strictEqual(job.correlationId, correlationId);
  });

  it('deve incluir links corretos na resposta', async () => {
    const body = { sessionContextId: testSessionContextId };
    const headers = {};
    const correlationId = 'corr_int_links_001';

    const result = await enqueueManifestSubmit(testManifestId, body, headers, correlationId);

    assert.ok(result.links);
    assert.strictEqual(result.links.job, `/v1/jobs/${result.jobId}`);
    assert.strictEqual(result.links.entity, `/v1/manifestos/${testManifestId}`);
    assert.strictEqual(result.links.audit, `/v1/audit/${correlationId}`);
  });
});

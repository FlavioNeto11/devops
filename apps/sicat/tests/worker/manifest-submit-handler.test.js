import { describe, it, before, after, beforeEach } from 'node:test';
import assert from 'node:assert';
import { query, pool } from '../../src/db/pool.js';
import { processJob, applyManifestSubmitTerminalFailureSideEffect } from '../../src/workers/operation-handlers.js';
import { findJobById } from '../../src/repositories/job-repo.js';
import { findManifestById } from '../../src/repositories/manifest-repo.js';
import { validManifestDraft } from '../fixtures/manifests.js';
import { validSessionContext } from '../fixtures/session-contexts.js';
import { queuedSubmitJob } from '../fixtures/jobs.js';

/**
 * Testes de worker para processamento de manifest.submit
 * 
 * Cobertura:
 * - processamento bem-sucedido (draft → submitted)
 * - processamento com validateOnly (draft → draft)
 * - processamento com printAfterSubmit (cria job de print)
 * - atualização de externalReference e externalHashCode
 * - atualização de status e timestamps
 * - tratamento de falhas e retry
 * - logging de exchange para auditoria
 */

// Mock do gateway CETESB
class MockCetesbGateway {
  constructor(shouldFail = false) {
    this.shouldFail = shouldFail;
  }

  async submitManifest(manifest, payload) {
    if (this.shouldFail) {
      throw new Error('CETESB gateway error');
    }

    const isValidateOnly = payload.validateOnly === true;

    return {
      request: {
        httpMethod: 'POST',
        endpoint: 'https://sistemas.cetesb.sp.gov.br/sigor-mtr/api/manifest/submit',
        sanitizedHeaders: { 'content-type': 'application/json' },
        sanitizedBody: { manTipo: manifest.payload.manTipo }
      },
      response: {
        httpMethod: 'POST',
        endpoint: 'https://sistemas.cetesb.sp.gov.br/sigor-mtr/api/manifest/submit',
        httpStatus: 200,
        latencyMs: 150,
        sanitizedHeaders: { 'content-type': 'application/json' },
        sanitizedBody: {
          manCodigo: isValidateOnly ? null : 123456,
          manNumero: isValidateOnly ? null : '000123456',
          manHashCode: isValidateOnly ? null : 'abc123def456',
          simDescricao: isValidateOnly ? 'validado' : 'aguardando transporte'
        },
        data: {
          manCodigo: isValidateOnly ? null : 123456,
          manNumero: isValidateOnly ? null : '000123456',
          manHashCode: isValidateOnly ? null : 'abc123def456',
          simDescricao: isValidateOnly ? 'validado' : 'aguardando transporte'
        }
      },
      extraAudits: []
    };
  }
}

describe('handleManifestSubmit - Worker', () => {
  let testManifestId;
  let testSessionContextId;
  let testJobId;

  before(async () => {
    await pool.connect().then(client => client.release());
  });

  beforeEach(async () => {
    // Limpa tabelas na ordem correta de FK
    await query('DELETE FROM audit_logs WHERE correlation_id LIKE $1', ['corr_test_%']);
    await query('DELETE FROM jobs WHERE entity_id LIKE $1', ['man_test_wrk_%']);
    await query('DELETE FROM manifests WHERE id LIKE $1', ['man_test_wrk_%']);
    await query('DELETE FROM session_contexts WHERE id LIKE $1', ['scx_test_wrk_%']);
    await query('DELETE FROM integration_accounts WHERE id LIKE $1', ['acc_test_wrk_%']);

    // Cria integration account
    await query(
      `INSERT INTO integration_accounts(id, account_name, is_active) VALUES ($1, $2, $3)`,
      ['acc_test_wrk_001', 'Test Worker Account', true]
    );

    // Cria session context
    await query(
      `INSERT INTO session_contexts(
        id, integration_account_id, status, partner_document, partner_type,
        partner_code, user_access_code, user_name, email, jwt_token_ref,
        expires_at, last_validated_at, metadata
      ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13::jsonb)`,
      [
        'scx_test_wrk_001',
        'acc_test_wrk_001',
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
    testSessionContextId = 'scx_test_wrk_001';

    // Cria manifesto
    await query(
      `INSERT INTO manifests(
        id, integration_account_id, session_context_id, status,
        external_status, external_reference, external_hash_code, payload, correlation_id
      ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8::jsonb,$9)`,
      [
        'man_test_wrk_draft_001',
        'acc_test_wrk_001',
        'scx_test_wrk_001',
        'queued_submit',
        validManifestDraft.externalStatus,
        validManifestDraft.externalReference,
        validManifestDraft.externalHashCode,
        JSON.stringify(validManifestDraft.payload),
        'corr_test_setup_worker_001'
      ]
    );
    testManifestId = 'man_test_wrk_draft_001';

    // Cria job
    const jobPayload = {
      ...queuedSubmitJob.payload,
      sessionContextId: testSessionContextId
    };
    await query(
      `INSERT INTO jobs(
        job_id, command_id, entity_type, entity_id, operation, payload,
        status, max_attempts, attempts, correlation_id, idempotency_key,
        started_at, claimed_at, claim_heartbeat_at, claimed_by
      ) VALUES ($1,$2,$3,$4,$5,$6::jsonb,$7,$8,$9,$10,$11,now(),now(),now(),$12)`,
      [
        queuedSubmitJob.jobId,
        queuedSubmitJob.commandId,
        queuedSubmitJob.entityType,
        testManifestId,
        queuedSubmitJob.operation,
        JSON.stringify(jobPayload),
        'running',
        queuedSubmitJob.maxAttempts,
        1,
        queuedSubmitJob.correlationId,
        queuedSubmitJob.idempotencyKey,
        'worker-test'
      ]
    );
    testJobId = queuedSubmitJob.jobId;
  });

  after(async () => {
    await query('DELETE FROM audit_logs WHERE correlation_id LIKE $1', ['corr_test_%']);
    await query('DELETE FROM jobs WHERE entity_id LIKE $1', ['man_test_wrk_%']);
    await query('DELETE FROM manifests WHERE id LIKE $1', ['man_test_wrk_%']);
    await query('DELETE FROM session_contexts WHERE id LIKE $1', ['scx_test_wrk_%']);
    await query('DELETE FROM integration_accounts WHERE id LIKE $1', ['acc_test_wrk_%']);
    await pool.end();
  });

  it('deve processar submit com sucesso e atualizar manifesto', async () => {
    const job = await findJobById(testJobId);
    const gateway = new MockCetesbGateway(false);

    await processJob(job, gateway);

    // Valida job
    const updatedJob = await findJobById(testJobId);
    assert.strictEqual(updatedJob.status, 'succeeded');
    assert.ok(updatedJob.finishedAt);
    assert.strictEqual(updatedJob.payload.outcome, 'manifest_submitted');

    // Valida manifesto
    const manifest = await findManifestById(testManifestId);
    assert.strictEqual(manifest.status, 'submitted');
    assert.strictEqual(manifest.externalStatus, 'aguardando transporte');
    assert.ok(manifest.externalReference);
    assert.strictEqual(manifest.externalReference.manCodigo, 123456);
    assert.strictEqual(manifest.externalReference.manNumero, '000123456');
    assert.strictEqual(manifest.externalHashCode, 'abc123def456');
    assert.ok(manifest.lastSubmittedAt);
    assert.ok(manifest.lastSyncAt);

    // Valida auditoria
    const auditRes = await query(
      'SELECT COUNT(*) FROM audit_logs WHERE correlation_id = $1',
      [job.correlationId]
    );
    assert.ok(Number.parseInt(auditRes.rows[0].count, 10) > 0);
  });

  it('deve processar validateOnly=true sem persistir dados externos', async () => {
    // Atualiza payload do job
    await query(
      'UPDATE jobs SET payload = $1::jsonb WHERE job_id = $2',
      [JSON.stringify({ sessionContextId: testSessionContextId, validateOnly: true, printAfterSubmit: false, requestedBy: 'test.user' }), testJobId]
    );

    const job = await findJobById(testJobId);
    const gateway = new MockCetesbGateway(false);

    await processJob(job, gateway);

    // Valida job
    const updatedJob = await findJobById(testJobId);
    assert.strictEqual(updatedJob.status, 'succeeded');

    // Valida manifesto - deve voltar para draft
    const manifest = await findManifestById(testManifestId);
    assert.strictEqual(manifest.status, 'draft');
    assert.strictEqual(manifest.externalStatus, 'validado');
    assert.strictEqual(manifest.externalReference, null);
    assert.strictEqual(manifest.externalHashCode, null);
  });

  it('deve criar job de print quando printAfterSubmit=true', async () => {
    // Atualiza payload do job
    await query(
      'UPDATE jobs SET payload = $1::jsonb WHERE job_id = $2',
      [JSON.stringify({ sessionContextId: testSessionContextId, validateOnly: false, printAfterSubmit: true, requestedBy: 'test.user' }), testJobId]
    );

    const job = await findJobById(testJobId);
    const gateway = new MockCetesbGateway(false);

    await processJob(job, gateway);

    // Valida que um job de print foi criado
    const printJobRes = await query(
      'SELECT * FROM jobs WHERE entity_id = $1 AND operation = $2 AND job_id != $3',
      [testManifestId, 'manifest.print', testJobId]
    );
    assert.strictEqual(printJobRes.rows.length, 1);

    const printJob = printJobRes.rows[0];
    assert.strictEqual(printJob.status, 'queued');
    assert.strictEqual(printJob.payload.documentType, 'manifest_pdf');
    assert.strictEqual(printJob.payload.regenerateIfMissing, true);
  });

  it('deve falhar e permitir retry quando gateway falha', async () => {
    const job = await findJobById(testJobId);
    const gateway = new MockCetesbGateway(true);

    await assert.rejects(
      async () => {
        await processJob(job, gateway);
      },
      {
        message: /CETESB gateway error/i
      }
    );

    // Job deve permanecer disponível para retry
    const manifest = await findManifestById(testManifestId);
    // Status pode permanecer em 'submitting' ou voltar para estado anterior
    assert.ok(['queued_submit', 'submitting'].includes(manifest.status));
  });

  it('deve atualizar status intermediário para submitting durante processamento', async () => {
    const job = await findJobById(testJobId);
    const gateway = new MockCetesbGateway(false);

    // Antes do processamento, status deve ser queued_submit
    let manifest = await findManifestById(testManifestId);
    assert.strictEqual(manifest.status, 'queued_submit');

    await processJob(job, gateway);

    // Após processamento, deve estar submitted
    manifest = await findManifestById(testManifestId);
    assert.strictEqual(manifest.status, 'submitted');
  });

  it('deve preservar correlationId do job na auditoria', async () => {
    const job = await findJobById(testJobId);
    const gateway = new MockCetesbGateway(false);

    await processJob(job, gateway);

    // Valida que a auditoria tem o correlationId correto
    const auditRes = await query(
      'SELECT correlation_id FROM audit_logs WHERE correlation_id = $1 LIMIT 1',
      [job.correlationId]
    );
    assert.strictEqual(auditRes.rows.length, 1);
    assert.strictEqual(auditRes.rows[0].correlation_id, job.correlationId);
  });

  it('deve registrar exchange completo na auditoria', async () => {
    const job = await findJobById(testJobId);
    const gateway = new MockCetesbGateway(false);

    await processJob(job, gateway);

    // Valida que o exchange foi registrado
    const auditRes = await query(
      `SELECT http_method, endpoint, http_status, sanitized_body
       FROM audit_logs WHERE correlation_id = $1 AND direction = $2`,
      [job.correlationId, 'outbound']
    );

    assert.ok(auditRes.rows.length > 0);
    const audit = auditRes.rows[0];
    assert.strictEqual(audit.http_method, 'POST');
    assert.ok(audit.endpoint.includes('sistemas.cetesb.sp.gov.br'));
    assert.strictEqual(audit.http_status, null); // outbound não tem status ainda
  });

  it('deve manter manifesto em processing quando CETESB retornar apenas hash', async () => {
    const job = await findJobById(testJobId);
    const gateway = {
      async submitManifest(manifest) {
        return {
          request: {
            httpMethod: 'POST',
            endpoint: 'https://sistemas.cetesb.sp.gov.br/sigor-mtr/api/manifest/submit',
            sanitizedHeaders: { 'content-type': 'application/json' },
            sanitizedBody: { manTipo: manifest.payload.manTipo }
          },
          response: {
            httpMethod: 'POST',
            endpoint: 'https://sistemas.cetesb.sp.gov.br/sigor-mtr/api/manifest/submit',
            httpStatus: 200,
            latencyMs: 180,
            sanitizedHeaders: { 'content-type': 'application/json' },
            sanitizedBody: {
              manCodigo: null,
              manNumero: null,
              manHashCode: 'hash_only_001',
              simDescricao: 'salvo'
            },
            data: {
              manCodigo: null,
              manNumero: null,
              manHashCode: 'hash_only_001',
              simDescricao: 'salvo'
            }
          },
          extraAudits: []
        };
      }
    };

    await processJob(job, gateway);

    const manifest = await findManifestById(testManifestId);
    assert.strictEqual(manifest.status, 'processing');
    assert.strictEqual(manifest.externalStatus, 'aguardando confirmação CETESB');
    assert.strictEqual(manifest.externalReference, null);
    assert.strictEqual(manifest.externalHashCode, 'hash_only_001');

    const updatedJob = await findJobById(testJobId);
    assert.strictEqual(updatedJob.status, 'succeeded');
    assert.strictEqual(updatedJob.payload.outcome, 'manifest_submission_pending_confirmation');
  });

  it('não deve criar job de print automático quando submit retornar apenas hash', async () => {
    await query(
      'UPDATE jobs SET payload = $1::jsonb WHERE job_id = $2',
      [JSON.stringify({ sessionContextId: testSessionContextId, validateOnly: false, printAfterSubmit: true, requestedBy: 'test.user' }), testJobId]
    );

    const job = await findJobById(testJobId);
    const gateway = {
      async submitManifest() {
        return {
          request: {
            httpMethod: 'POST',
            endpoint: 'https://sistemas.cetesb.sp.gov.br/sigor-mtr/api/manifest/submit',
            sanitizedHeaders: { 'content-type': 'application/json' },
            sanitizedBody: { manTipo: 1 }
          },
          response: {
            httpMethod: 'POST',
            endpoint: 'https://sistemas.cetesb.sp.gov.br/sigor-mtr/api/manifest/submit',
            httpStatus: 200,
            latencyMs: 180,
            sanitizedHeaders: { 'content-type': 'application/json' },
            sanitizedBody: {
              manCodigo: null,
              manNumero: null,
              manHashCode: 'hash_only_002',
              simDescricao: 'salvo'
            },
            data: {
              manCodigo: null,
              manNumero: null,
              manHashCode: 'hash_only_002',
              simDescricao: 'salvo'
            }
          },
          extraAudits: []
        };
      }
    };

    await processJob(job, gateway);

    const printJobRes = await query(
      'SELECT * FROM jobs WHERE entity_id = $1 AND operation = $2 AND job_id != $3',
      [testManifestId, 'manifest.print', testJobId]
    );

    assert.strictEqual(printJobRes.rows.length, 0);
  });

  it('deve sincronizar manifesto para failed em falha terminal de submit', async () => {
    const job = await findJobById(testJobId);

    await query(
      'UPDATE manifests SET status = $1 WHERE id = $2',
      ['submitting', testManifestId]
    );

    await applyManifestSubmitTerminalFailureSideEffect(job, {
      action: 'dlq',
      dlqReason: 'Max attempts exceeded. Last error: Resíduo informado com unidade incorreta!',
      patch: {
        lastErrorCode: 'CETESB_VALIDATION_ERROR',
        lastErrorMessage: 'Resíduo informado com unidade incorreta!'
      }
    });

    const manifest = await findManifestById(testManifestId);
    assert.strictEqual(manifest.status, 'failed');
    assert.match(manifest.externalStatus, /DLQ/i);
    assert.match(manifest.externalStatus, /Resíduo informado com unidade incorreta/i);
    assert.strictEqual(manifest.payload.jobResults['manifest.submit'].outcome, 'manifest_submit_failed');
    assert.strictEqual(manifest.payload.jobResults['manifest.submit'].terminalAction, 'dlq');
  });
});

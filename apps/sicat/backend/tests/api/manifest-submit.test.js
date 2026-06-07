import { describe, it, before, after, beforeEach } from 'node:test';
import assert from 'node:assert';
import { query, pool } from '../../src/db/pool.js';
import { ensureStartup } from '../../src/bootstrap/startup.js';
import { createApp } from '../../src/app.js';
import { validManifestDraft, validManifestWithoutSessionContext } from '../fixtures/manifests.js';
import { validSessionContext } from '../fixtures/session-contexts.js';

/**
 * Testes de API para POST /v1/manifestos/:id/submit
 * 
 * Cobertura:
 * - submit básico com sessionContextId no body
 * - submit com sessionContextId herdado do manifesto
 * - idempotência via idempotency-key
 * - validateOnly=true
 * - printAfterSubmit=true
 * - manifesto inexistente (404)
 * - sessionContextId inexistente (400)
 * - sessionContextId ausente (400)
 * - correlationId propagado para job
 */

let API_BASE = process.env.API_URL || '';
let server;

describe('POST /v1/manifestos/:id/submit - API Routes', { concurrency: 1 }, () => {
  const runSuffix = `${process.pid}_${Date.now().toString(36)}`;
  const idempotencyPrefix = `idem_submit_api_${runSuffix}_`;
  const accountPrefix = `acc_submit_api_${runSuffix}_`;
  const sessionPrefix = `scx_submit_api_${runSuffix}_`;
  const manifestPrefix = `man_submit_api_${runSuffix}_`;

  let testManifestId;
  let testManifestNoSessionId;
  let testSessionContextId;

  before(async () => {
    await ensureStartup();

    if (!process.env.API_URL) {
      const app = createApp();
      server = await new Promise((resolve) => {
        const instance = app.listen(0, '127.0.0.1', () => resolve(instance));
      });

      const address = server.address();
      API_BASE = `http://127.0.0.1:${address.port}`;
    }

    // Garante que o banco está pronto
    await pool.connect().then(client => client.release());
  });

  beforeEach(async () => {
    // Limpa tabelas na ordem correta de FK
    await query('DELETE FROM jobs WHERE entity_id LIKE $1', [`${manifestPrefix}%`]);
    await query('DELETE FROM idempotency_registry WHERE entity_id LIKE $1', [`${manifestPrefix}%`]);
    await query('DELETE FROM manifests WHERE id LIKE $1', [`${manifestPrefix}%`]);
    await query('DELETE FROM session_contexts WHERE id LIKE $1', [`${sessionPrefix}%`]);
    await query('DELETE FROM integration_accounts WHERE id LIKE $1', [`${accountPrefix}%`]);

    // Cria integration account de teste
    await query(
      `INSERT INTO integration_accounts(id, account_name, is_active) VALUES ($1, $2, $3)`,
      [`${accountPrefix}001`, 'Test API Account', true]
    );

    // Cria session context de teste
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
        validManifestWithoutSessionContext.sessionContextId,
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
    // Limpa após todos os testes na ordem correta
    await query('DELETE FROM jobs WHERE entity_id LIKE $1', [`${manifestPrefix}%`]);
    await query('DELETE FROM idempotency_registry WHERE entity_id LIKE $1', [`${manifestPrefix}%`]);
    await query('DELETE FROM manifests WHERE id LIKE $1', [`${manifestPrefix}%`]);
    await query('DELETE FROM session_contexts WHERE id LIKE $1', [`${sessionPrefix}%`]);
    await query('DELETE FROM integration_accounts WHERE id LIKE $1', [`${accountPrefix}%`]);
    await new Promise((resolve, reject) => {
      if (!server) {
        resolve();
        return;
      }

      server.close((error) => {
        if (error) {
          reject(error);
          return;
        }

        resolve();
      });
    });

    await pool.end();
  });

  it('deve enfileirar submit básico com sessionContextId no body', async () => {
    const response = await fetch(`${API_BASE}/v1/manifestos/${testManifestId}/submit`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-Correlation-Id': 'test_corr_001',
        'Idempotency-Key': `${idempotencyPrefix}001`
      },
      body: JSON.stringify({
        sessionContextId: testSessionContextId,
        validateOnly: false,
        printAfterSubmit: false,
        requestedBy: 'test.user'
      })
    });

    assert.strictEqual(response.status, 202);
    const body = await response.json();

    assert.ok(body.commandId);
    assert.ok(body.jobId);
    assert.strictEqual(body.correlationId, 'test_corr_001');
    assert.strictEqual(body.entityType, 'manifest');
    assert.strictEqual(body.entityId, testManifestId);
    assert.strictEqual(body.operation, 'manifest.submit');
    assert.strictEqual(body.status, 'queued');
    assert.ok(body.submittedAt);
    assert.ok(body.links.job);
    assert.ok(body.links.entity);
    assert.ok(body.links.audit);

    // Valida persistência
    const manifestRes = await query('SELECT status, session_context_id FROM manifests WHERE id = $1', [testManifestId]);
    assert.strictEqual(manifestRes.rows[0].status, 'queued_submit');
    assert.strictEqual(manifestRes.rows[0].session_context_id, testSessionContextId);

    const jobRes = await query('SELECT operation, status, correlation_id FROM jobs WHERE job_id = $1', [body.jobId]);
    assert.strictEqual(jobRes.rows[0].operation, 'manifest.submit');
    assert.strictEqual(jobRes.rows[0].status, 'queued');
    assert.strictEqual(jobRes.rows[0].correlation_id, 'test_corr_001');
  });

  it('deve reaproveitar sessionContextId do manifesto quando não enviado no body', async () => {
    const response = await fetch(`${API_BASE}/v1/manifestos/${testManifestId}/submit`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-Correlation-Id': 'test_corr_002'
      },
      body: JSON.stringify({
        validateOnly: false,
        printAfterSubmit: false,
        requestedBy: 'test.user'
      })
    });

    assert.strictEqual(response.status, 202);
    const body = await response.json();

    // Valida que o job foi criado com o sessionContextId do manifesto
    const jobRes = await query('SELECT payload FROM jobs WHERE job_id = $1', [body.jobId]);
    const payload = jobRes.rows[0].payload;
    assert.strictEqual(payload.sessionContextId, testSessionContextId);
  });

  it('deve retornar mesma resposta quando usar mesma idempotency-key', async () => {
    const idempotencyKey = `${idempotencyPrefix}reuse_001`;

    // Primeira requisição
    const response1 = await fetch(`${API_BASE}/v1/manifestos/${testManifestId}/submit`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Idempotency-Key': idempotencyKey
      },
      body: JSON.stringify({
        sessionContextId: testSessionContextId,
        validateOnly: false,
        requestedBy: 'test.user'
      })
    });

    assert.strictEqual(response1.status, 202);
    const body1 = await response1.json();

    // Segunda requisição com mesma key
    const response2 = await fetch(`${API_BASE}/v1/manifestos/${testManifestId}/submit`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Idempotency-Key': idempotencyKey
      },
      body: JSON.stringify({
        sessionContextId: testSessionContextId,
        validateOnly: false,
        requestedBy: 'test.user'
      })
    });

    assert.strictEqual(response2.status, 202);
    const body2 = await response2.json();

    // Deve retornar exatamente a mesma resposta
    assert.strictEqual(body1.commandId, body2.commandId);
    assert.strictEqual(body1.jobId, body2.jobId);

    // Deve criar apenas 1 job
    const jobCount = await query('SELECT COUNT(*) FROM jobs WHERE entity_id = $1', [testManifestId]);
    assert.strictEqual(Number.parseInt(jobCount.rows[0].count, 10), 1);
  });

  it('deve retornar 404 quando manifesto não existe', async () => {
    const response = await fetch(`${API_BASE}/v1/manifestos/man_inexistente_999/submit`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        sessionContextId: testSessionContextId,
        validateOnly: false,
        requestedBy: 'test.user'
      })
    });

    assert.strictEqual(response.status, 404);
    const body = await response.json();
    assert.ok(body.title);
    assert.ok(body.detail);
  });

  it('deve retornar 400 quando sessionContextId não existe', async () => {
    const response = await fetch(`${API_BASE}/v1/manifestos/${testManifestId}/submit`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        sessionContextId: 'scx_inexistente_999',
        validateOnly: false,
        requestedBy: 'test.user'
      })
    });

    assert.strictEqual(response.status, 400);
    const body = await response.json();
    assert.ok(body.title);
    assert.ok(body.detail.includes('was not found'));
  });

  it('deve retornar 400 quando sessionContextId está ausente', async () => {
    const response = await fetch(`${API_BASE}/v1/manifestos/${testManifestNoSessionId}/submit`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        validateOnly: false,
        requestedBy: 'test.user'
      })
    });

    assert.strictEqual(response.status, 400);
    const body = await response.json();
    assert.ok(body.title);
    assert.ok(body.detail.includes('obrigatório'));
  });

  it('deve propagar correlationId para job e permitir auditoria', async () => {
    const correlationId = 'test_corr_audit_001';

    const response = await fetch(`${API_BASE}/v1/manifestos/${testManifestId}/submit`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-Correlation-Id': correlationId
      },
      body: JSON.stringify({
        sessionContextId: testSessionContextId,
        validateOnly: false,
        requestedBy: 'test.user'
      })
    });

    assert.strictEqual(response.status, 202);
    const body = await response.json();

    // Valida que o job tem o correlationId
    const jobRes = await query('SELECT correlation_id FROM jobs WHERE job_id = $1', [body.jobId]);
    assert.strictEqual(jobRes.rows[0].correlation_id, correlationId);

    // Valida que o link de audit aponta para o correlationId correto
    assert.ok(body.links.audit.includes(correlationId));
  });

  it('deve aceitar validateOnly=true', async () => {
    const response = await fetch(`${API_BASE}/v1/manifestos/${testManifestId}/submit`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        sessionContextId: testSessionContextId,
        validateOnly: true,
        requestedBy: 'test.user'
      })
    });

    assert.strictEqual(response.status, 202);
    const body = await response.json();

    // Valida que o payload contém validateOnly
    const jobRes = await query('SELECT payload FROM jobs WHERE job_id = $1', [body.jobId]);
    const payload = jobRes.rows[0].payload;
    assert.strictEqual(payload.validateOnly, true);
  });

  it('deve aceitar printAfterSubmit=true', async () => {
    const response = await fetch(`${API_BASE}/v1/manifestos/${testManifestId}/submit`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        sessionContextId: testSessionContextId,
        validateOnly: false,
        printAfterSubmit: true,
        requestedBy: 'test.user'
      })
    });

    assert.strictEqual(response.status, 202);
    const body = await response.json();

    // Valida que o payload contém printAfterSubmit
    const jobRes = await query('SELECT payload FROM jobs WHERE job_id = $1', [body.jobId]);
    const payload = jobRes.rows[0].payload;
    assert.strictEqual(payload.printAfterSubmit, true);
  });
});

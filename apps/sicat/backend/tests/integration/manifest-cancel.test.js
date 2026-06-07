import { describe, it, before, after, beforeEach } from 'node:test';
import assert from 'node:assert';
import { query, pool } from '../../src/db/pool.js';
import { setConfigOverride } from '../../src/lib/config.js';
import { createPrefixedId } from '../../src/lib/ids.js';

describe('POST /v1/manifestos/{id}/cancel (integration)', () => {
  let enqueueManifestCancel;
  let findManifestById;
  let originalFetch;
  let cancelFetchCount = 0;

  before(async () => {
    setConfigOverride('cetesbGatewayMode', 'real');
    setConfigOverride('cetesbBaseUrl', 'https://mtrr.cetesb.sp.gov.br');

    originalFetch = global.fetch;
    global.fetch = async (url) => {
      const urlString = String(url);

      // Mock POST cancelaManifesto response
      if (urlString.includes('/api/mtr/manifesto/cancelaManifesto')) {
        cancelFetchCount += 1;
        return new Response(JSON.stringify({
          mensagem: null,
          erro: false,
          objetoResposta: {
            manCodigo: 22169012,
            manNumero: '260010679516',
            situacaoManifesto: { simCodigo: 4, simDescricao: 'Cancelado', simOrdem: 4 }
          }
        }), {
          status: 200,
          headers: { 'content-type': 'application/json' }
        });
      }

      return originalFetch(url);
    };

    const services = await import('../../src/services/manifest-service.js');
    enqueueManifestCancel = services.enqueueManifestCancel;
    findManifestById = services.findManifestById || (async (id) => {
      const result = await query('SELECT * FROM manifests WHERE id = $1', [id]);
      return result.rows[0] || null;
    });
    await pool.connect().then((client) => client.release());
  });

  beforeEach(async () => {
    cancelFetchCount = 0;
    await query('DELETE FROM jobs WHERE entity_id LIKE $1', ['man_cancel_%']);
    await query('DELETE FROM manifests WHERE integration_account_id LIKE $1', ['acc_cancel_%']);
    await query('DELETE FROM session_contexts WHERE id LIKE $1', ['scx_cancel_%']);
    await query('DELETE FROM integration_accounts WHERE id LIKE $1', ['acc_cancel_%']);

    await query(
      `INSERT INTO integration_accounts(id, account_name, partner_code, state_code, is_active)
       VALUES ($1,$2,$3,$4,$5)`,
      ['acc_cancel_001', 'Cancel Test Account', 176163, 26, true]
    );

    await query(
      `INSERT INTO session_contexts(
         id, integration_account_id, status, partner_document, partner_type,
         partner_code, user_access_code, user_name, email, auth_mode,
         jwt_token, jwt_token_ref, expires_at, last_validated_at, metadata
       ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15::jsonb)`,
      [
        'scx_cancel_001',
        'acc_cancel_001',
        'active',
        '31913781000139',
        'J',
        176163,
        333948,
        'Flavio Padilha Neto',
        'flavio_padilha_neto@msn.com',
        'manual-token',
        'eyJhbGciOiJIUzUxMiJ9.eyJzdWIiOiIxNzYxNjMsMzMzOTQ4Iiwicm9sZSI6MSwiZXhwIjoxODkzNDU2MDAwfQ.abc',
        'vault://mtr/session-contexts/scx_cancel_001',
        '2030-01-01T00:00:00Z',
        '2026-03-08T00:00:00Z',
        JSON.stringify({ stateCode: 26 })
      ]
    );
  });

  after(async () => {
    global.fetch = originalFetch;
    await query('DELETE FROM jobs WHERE entity_id LIKE $1', ['man_cancel_%']);
    await query('DELETE FROM manifests WHERE integration_account_id LIKE $1', ['acc_cancel_%']);
    await query('DELETE FROM session_contexts WHERE id LIKE $1', ['scx_cancel_%']);
    await query('DELETE FROM integration_accounts WHERE id LIKE $1', ['acc_cancel_%']);
    await pool.end();
  });

  it('deve enfileirar cancelamento de manifesto com justificativa', async () => {
    const manifestId = createPrefixedId('man_cancel');
    const externalHashCode = `mhc_${manifestId}`;
    
    // Inserir manifesto
    await query(
      `INSERT INTO manifests(
         id, integration_account_id, session_context_id, status, external_reference, external_hash_code, payload, correlation_id
       ) VALUES ($1,$2,$3,$4,$5::jsonb,$6,$7::jsonb,$8)`,
      [
        manifestId,
        'acc_cancel_001',
        'scx_cancel_001',
        'submitted',
        JSON.stringify({ manCodigo: 22169012, manNumero: '260010679516' }),
        externalHashCode,
        JSON.stringify({ driverName: 'Test', vehiclePlate: 'AAA1111' }),
        'corr_cancel_001_setup'
      ]
    );

    const result = await enqueueManifestCancel(
      manifestId,
      { reason: 'erro no cadastro' },
      { 'idempotency-key': 'cancel-001' },
      'corr_cancel_001'
    );

    assert.ok(result.commandId, 'Deve retornar commandId');
    assert.ok(result.jobId, 'Deve retornar jobId');
    assert.strictEqual(result.operation, 'manifest.cancel', 'Deve retornar operação correta');
  });

  it('deve atualizar status para queued_cancel', async () => {
    const manifestId = createPrefixedId('man_cancel');
    const externalHashCode = `mhc_${manifestId}`;
    
    await query(
      `INSERT INTO manifests(
         id, integration_account_id, session_context_id, status, external_reference, external_hash_code, payload, correlation_id
       ) VALUES ($1,$2,$3,$4,$5::jsonb,$6,$7::jsonb,$8)`,
      [
        manifestId,
        'acc_cancel_001',
        'scx_cancel_001',
        'submitted',
        JSON.stringify({ manCodigo: 22169012, manNumero: '260010679516' }),
        externalHashCode,
        JSON.stringify({ driverName: 'Test', vehiclePlate: 'AAA1111' }),
        'corr_cancel_002_setup'
      ]
    );

    await enqueueManifestCancel(
      manifestId,
      { reason: 'cancelamento solicitado' },
      { 'idempotency-key': 'cancel-002' },
      'corr_cancel_002'
    );

    const manifest = await findManifestById(manifestId);
    assert.strictEqual(manifest.status, 'queued_cancel', 'Status deve ser queued_cancel');
  });

  it('deve retornar erro 404 para manifesto não encontrado', async () => {
    try {
      await enqueueManifestCancel(
        'man_inexistente_001',
        { reason: 'erro' },
        { 'idempotency-key': 'cancel-003' },
        'corr_cancel_003'
      );
      assert.fail('Deve lançar erro para manifesto não encontrado');
    } catch (err) {
      assert.strictEqual(err.statusCode, 404, 'Deve retornar 404 para manifesto não encontrado');
    }
  });

  it('deve respeitar idempotência para cancelamento', async () => {
    const manifestId = createPrefixedId('man_cancel');
    const externalHashCode = `mhc_${manifestId}`;
    const key = 'cancel-idempotent-001';
    
    await query(
      `INSERT INTO manifests(
         id, integration_account_id, session_context_id, status, external_reference, external_hash_code, payload, correlation_id
       ) VALUES ($1,$2,$3,$4,$5::jsonb,$6,$7::jsonb,$8)`,
      [
        manifestId,
        'acc_cancel_001',
        'scx_cancel_001',
        'submitted',
        JSON.stringify({ manCodigo: 22169012, manNumero: '260010679516' }),
        externalHashCode,
        JSON.stringify({ driverName: 'Test', vehiclePlate: 'AAA1111' }),
        'corr_cancel_004_setup'
      ]
    );

    const firstResult = await enqueueManifestCancel(
      manifestId,
      { reason: 'razão 1' },
      { 'idempotency-key': key },
      'corr_cancel_004'
    );

    const secondResult = await enqueueManifestCancel(
      manifestId,
      { reason: 'razão diferente' },
      { 'idempotency-key': key },
      'corr_cancel_005'
    );

    assert.strictEqual(firstResult.commandId, secondResult.commandId, 'Deve retornar mesmo commandId para mesma key');
  });

  it('deve criar job com status pending', async () => {
    const manifestId = createPrefixedId('man_cancel');
    const externalHashCode = `mhc_${manifestId}`;
    
    await query(
      `INSERT INTO manifests(
         id, integration_account_id, session_context_id, status, external_reference, external_hash_code, payload, correlation_id
       ) VALUES ($1,$2,$3,$4,$5::jsonb,$6,$7::jsonb,$8)`,
      [
        manifestId,
        'acc_cancel_001',
        'scx_cancel_001',
        'submitted',
        JSON.stringify({ manCodigo: 22169012, manNumero: '260010679516' }),
        externalHashCode,
        JSON.stringify({ driverName: 'Test', vehiclePlate: 'AAA1111' }),
        'corr_cancel_006_setup'
      ]
    );

    const result = await enqueueManifestCancel(
      manifestId,
      { reason: 'job test' },
      { 'idempotency-key': 'cancel-job-001' },
      'corr_cancel_006'
    );

    const jobs = await query(
      'SELECT * FROM jobs WHERE job_id = $1',
      [result.jobId]
    );

    assert.ok(jobs.rowCount > 0, 'Deve criar job');
    assert.ok(
      ['queued', 'running'].includes(jobs.rows[0].status),
      `Job deve estar queued ou running, recebido: ${jobs.rows[0].status}`
    );
    assert.strictEqual(jobs.rows[0].operation, 'manifest.cancel', 'Job deve ter operação correta');
  });
});

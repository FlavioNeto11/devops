import { describe, it, before, after, beforeEach } from 'node:test';
import assert from 'node:assert';
import { query, pool } from '../../src/db/pool.js';
import { setConfigOverride } from '../../src/lib/config.js';

describe('POST /v1/manifestos create (integration)', () => {
  let createManifest;
  let originalFetch;

  const manifestPayload = {
    integrationAccountId: 'acc_create_001',
    sessionContextId: 'scx_create_001',
    state: { code: 26, abbreviation: 'SP' },
    expeditionDate: '2026-03-07',
    driverName: 'Osvaldo',
    vehiclePlate: 'ETA26D1',
    notes: '',
    generator: {
      partnerCode: 176163,
      description: 'Nova IT'
    },
    carrier: {
      partnerCode: 160627,
      description: 'CASAMAX COMERCIAL LTDA.'
    },
    receiver: {
      partnerCode: 40110,
      description: 'MARDAN FIRE ENGENHARIA, CONSTRUCAO E EXTINTORES LTDA.'
    }
  };

  before(async () => {
    setConfigOverride('cetesbGatewayMode', 'real');
    setConfigOverride('cetesbBaseUrl', 'https://mtrr.cetesb.sp.gov.br');

    originalFetch = global.fetch;
    global.fetch = async (url) => {
      const urlString = String(url);
      // Não precisa mockar PUT aqui, apenas deixa o fetch padrão
      return originalFetch(url);
    };

    const services = await import('../../src/services/manifest-service.js');
    createManifest = services.createManifest;
    await pool.connect().then((client) => client.release());
  });

  beforeEach(async () => {
    await query('DELETE FROM manifests WHERE integration_account_id LIKE $1', ['acc_create_%']);
    await query('DELETE FROM session_contexts WHERE id LIKE $1', ['scx_create_%']);
    await query('DELETE FROM integration_accounts WHERE id LIKE $1', ['acc_create_%']);

    await query(
      `INSERT INTO integration_accounts(id, account_name, partner_code, state_code, is_active)
       VALUES ($1,$2,$3,$4,$5)`,
      ['acc_create_001', 'Create Test Account', 176163, 26, true]
    );

    await query(
      `INSERT INTO session_contexts(
         id, integration_account_id, status, partner_document, partner_type,
         partner_code, user_access_code, user_name, email, auth_mode,
         jwt_token, jwt_token_ref, expires_at, last_validated_at, metadata
       ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15::jsonb)`,
      [
        'scx_create_001',
        'acc_create_001',
        'active',
        '31913781000139',
        'J',
        176163,
        333948,
        'Flavio Padilha Neto',
        'flavio_padilha_neto@msn.com',
        'manual-token',
        'eyJhbGciOiJIUzUxMiJ9.eyJzdWIiOiIxNzYxNjMsMzMzOTQ4Iiwicm9sZSI6MSwiZXhwIjoxODkzNDU2MDAwfQ.abc',
        'vault://mtr/session-contexts/scx_create_001',
        '2030-01-01T00:00:00Z',
        '2026-03-08T00:00:00Z',
        JSON.stringify({ stateCode: 26 })
      ]
    );
  });

  after(async () => {
    global.fetch = originalFetch;
    await query('DELETE FROM manifests WHERE integration_account_id LIKE $1', ['acc_create_%']);
    await query('DELETE FROM session_contexts WHERE id LIKE $1', ['scx_create_%']);
    await query('DELETE FROM integration_accounts WHERE id LIKE $1', ['acc_create_%']);
    await pool.end();
  });

  it('deve criar manifesto com status draft', async () => {
    const result = await createManifest(manifestPayload, 'corr_create_001');

    assert.ok(result.id, 'Deve retornar ID do manifesto');
    assert.strictEqual(result.status, 'draft', 'Novo manifesto deve ter status draft');
    assert.strictEqual(result.externalStatus, 'pending_submission', 'ExternalStatus deve ser pending_submission');
    assert.ok(result.createdAt, 'Deve retornar createdAt');
  });

  it('deve persistir dados do manifesto no banco', async () => {
    const result = await createManifest(manifestPayload, 'corr_create_002');

    const manifestResult = await query(
      'SELECT * FROM manifests WHERE id = $1',
      [result.id]
    );

    assert.ok(manifestResult.rowCount > 0, 'Manifesto deve estar persistido no banco');
    const manifest = manifestResult.rows[0];
    assert.strictEqual(manifest.integration_account_id, 'acc_create_001', 'Deve manter account ID');
    assert.strictEqual(manifest.session_context_id, 'scx_create_001', 'Deve manter session context ID');
    assert.strictEqual(manifest.status, 'draft', 'Deve manter status draft');
  });

  it('deve armazenar payload completo no manifesto', async () => {
    const result = await createManifest(manifestPayload, 'corr_create_003');

    const manifestResult = await query(
      'SELECT payload FROM manifests WHERE id = $1',
      [result.id]
    );

    const payload = manifestResult.rows[0].payload;
    assert.strictEqual(payload.driverName, 'Osvaldo', 'Deve armazenar nome do motorista');
    assert.strictEqual(payload.vehiclePlate, 'ETA26D1', 'Deve armazenar placa');
    assert.strictEqual(payload.generator.partnerCode, 176163, 'Deve armazenar gerador');
  });

  it('deve validar integrationAccountId obrigatório', async () => {
    const invalidPayload = { ...manifestPayload };
    delete invalidPayload.integrationAccountId;

    try {
      await createManifest(invalidPayload, 'corr_create_004');
      assert.fail('Deve lançar erro para integrationAccountId faltante');
    } catch (err) {
      assert.strictEqual(err.statusCode, 400, 'Deve validar integrationAccountId obrigatório');
    }
  });

  it('deve validar sessionContextId quando fornecido', async () => {
    const invalidPayload = {
      ...manifestPayload,
      sessionContextId: 'scx_inexistente_001'
    };

    try {
      await createManifest(invalidPayload, 'corr_create_005');
      assert.fail('Deve lançar erro para sessionContextId inválido');
    } catch (err) {
      assert.strictEqual(err.statusCode, 400, 'Deve validar sessionContextId quando fornecido');
    }
  });
});

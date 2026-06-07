import { describe, it, before, after, beforeEach } from 'node:test';
import assert from 'node:assert';
import https from 'node:https';
import { EventEmitter } from 'node:events';
import { query, pool } from '../../src/db/pool.js';
import { setConfigOverride } from '../../src/lib/config.js';

describe('GET /v1/manifestos fallback + upsert (service)', () => {
  let listManifests;
  let originalHttpsRequest;
  let fetchCallCount = 0;

  before(async () => {
    // Set config overrides for this test
    setConfigOverride('cetesbGatewayMode', 'real');
    setConfigOverride('cetesbBaseUrl', 'https://mtrr.cetesb.sp.gov.br');

    originalHttpsRequest = https.request;
    https.request = (options, callback) => {
      const request = new EventEmitter();
      request.write = () => {};
      request.destroy = () => {};
      request.end = () => {
        const path = String(options?.path || '');
        if (!path.includes('/api/mtr/pesquisaManifesto/')) {
          request.emit('error', new Error(`Unexpected CETESB request during test: ${path}`));
          return;
        }

        fetchCallCount += 1;
        const payload = {
          mensagem: null,
          erro: false,
          objetoResposta: [
            {
              manCodigo: 22169012,
              manResponsavel: 'Flavio Padilha Neto',
              manNumero: '260010679516',
              manData: 1772911898711,
              manDataExpedicao: 1772852400000,
              manNomeMotorista: 'Osvaldo',
              manPlacaVeiculo: 'ETA26D1',
              manObservacao: '',
              manHashCode: '0Ydw6T0Mu8eQWMfqXmMzUaaj8XiPJh',
              estado: { estCodigo: 26, estAbreviacao: 'SP' },
              parceiroGerador: { parCodigo: 176163, parDescricao: 'Nova IT' },
              parceiroTransportador: { parCodigo: 160627, parDescricao: 'CASAMAX COMERCIAL LTDA.' },
              parceiroDestinador: { parCodigo: 40110, parDescricao: 'MARDAN FIRE ENGENHARIA, CONSTRUCAO E EXTINTORES LTDA.' },
              situacaoManifesto: { simCodigo: 4, simDescricao: 'Cancelado', simOrdem: 4 }
            }
          ]
        };

        const response = new EventEmitter();
        response.statusCode = 200;
        response.headers = { 'content-type': 'application/json' };
        callback(response);
        response.emit('data', Buffer.from(JSON.stringify(payload), 'utf-8'));
        response.emit('end');
      };

      return request;
    };

    ({ listManifests } = await import('../../src/services/manifest-service.js'));
    await pool.connect().then((client) => client.release());
  });

  beforeEach(async () => {
    fetchCallCount = 0;

    await query('DELETE FROM manifests WHERE integration_account_id LIKE $1', ['acc_sync_%']);
    await query('DELETE FROM session_contexts WHERE id LIKE $1', ['scx_sync_%']);
    await query('DELETE FROM integration_accounts WHERE id LIKE $1', ['acc_sync_%']);

    await query(
      `INSERT INTO integration_accounts(id, account_name, partner_code, state_code, is_active)
       VALUES ($1,$2,$3,$4,$5)`,
      ['acc_sync_001', 'Sync Test Account', 176163, 26, true]
    );

    await query(
      `INSERT INTO session_contexts(
         id, integration_account_id, status, partner_document, partner_type,
         partner_code, user_access_code, user_name, email, auth_mode,
         jwt_token, jwt_token_ref, expires_at, last_validated_at, metadata
       ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15::jsonb)`,
      [
        'scx_sync_001',
        'acc_sync_001',
        'active',
        '31913781000139',
        'J',
        176163,
        333948,
        'Flavio Padilha Neto',
        'flavio_padilha_neto@msn.com',
        'manual-token',
        'eyJhbGciOiJIUzUxMiJ9.eyJzdWIiOiIxNzYxNjMsMzMzOTQ4Iiwicm9sZSI6MSwiZXhwIjoxODkzNDU2MDAwfQ.abc',
        'vault://mtr/session-contexts/scx_sync_001',
        '2030-01-01T00:00:00Z',
        '2026-03-08T00:00:00Z',
        JSON.stringify({ stateCode: 26 })
      ]
    );
  });

  after(async () => {
    https.request = originalHttpsRequest;
    await query('DELETE FROM manifests WHERE integration_account_id LIKE $1', ['acc_sync_%']);
    await query('DELETE FROM session_contexts WHERE id LIKE $1', ['scx_sync_%']);
    await query('DELETE FROM integration_accounts WHERE id LIKE $1', ['acc_sync_%']);
    await pool.end();
  });

  it('deve buscar na CETESB quando local está vazio e persistir manifesto para próximas consultas', async () => {
    const first = await listManifests(
      {
        integrationAccountId: 'acc_sync_001',
        sessionContextId: 'scx_sync_001',
        page: 1,
        pageSize: 20,
        dateFrom: '2026-02-21',
        dateTo: '2026-03-08'
      },
      'corr_sync_test_001'
    );

    assert.ok(fetchCallCount >= 1, 'Deve consultar CETESB ao menos uma vez');
    assert.strictEqual(first.totalItems, 1);
    assert.strictEqual(first.items[0].manifestNumber, '260010679516');
    assert.strictEqual(first.items[0].externalCode, 22169012);
    assert.strictEqual(first.items[0].externalHashCode, '0Ydw6T0Mu8eQWMfqXmMzUaaj8XiPJh');
    assert.strictEqual(first.items[0].externalStatus, 'Cancelado');
    assert.strictEqual(first.items[0].status, 'cancelled');

    const persisted = await query(
      `SELECT id, integration_account_id, status, external_status, external_reference, external_hash_code
         FROM manifests
        WHERE integration_account_id = $1
          AND external_hash_code = $2`,
      ['acc_sync_001', '0Ydw6T0Mu8eQWMfqXmMzUaaj8XiPJh']
    );

    assert.strictEqual(persisted.rowCount, 1);
    assert.strictEqual(persisted.rows[0].status, 'cancelled');
    assert.strictEqual(persisted.rows[0].external_status, 'Cancelado');
    assert.strictEqual(persisted.rows[0].external_reference.manCodigo, 22169012);
    assert.strictEqual(persisted.rows[0].external_reference.manNumero, '260010679516');

    const second = await listManifests(
      {
        integrationAccountId: 'acc_sync_001',
        sessionContextId: 'scx_sync_001',
        page: 1,
        pageSize: 20
      },
      'corr_sync_test_002'
    );

    assert.ok(fetchCallCount >= 1, 'Consulta subsequente deve permanecer funcional');
    assert.strictEqual(second.totalItems, 1);
    assert.strictEqual(second.items[0].manifestNumber, '260010679516');
  });
});

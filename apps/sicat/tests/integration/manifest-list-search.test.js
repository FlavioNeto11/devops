import { describe, it, before, after, beforeEach } from 'node:test';
import assert from 'node:assert';
import https from 'node:https';
import { EventEmitter } from 'node:events';
import { query, pool } from '../../src/db/pool.js';
import { setConfigOverride } from '../../src/lib/config.js';

describe('GET /v1/manifestos search (integration)', () => {
  let listManifests;
  let upsertManifestFromExternalSearch;
  let reportsMtrSearch;
  let originalHttpsRequest;
  let fetchCallCount = 0;

  before(async () => {
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
    ({ upsertManifestFromExternalSearch } = await import('../../src/repositories/manifest-repo.js'));
    ({ reportsMtrSearch } = await import('../../src/services/operations-service.js'));
    await pool.connect().then((client) => client.release());
  });

  beforeEach(async () => {
    fetchCallCount = 0;
    await query('DELETE FROM manifests WHERE integration_account_id LIKE $1', ['acc_search_%']);
    await query('DELETE FROM session_contexts WHERE id LIKE $1', ['scx_search_%']);
    await query('DELETE FROM integration_accounts WHERE id LIKE $1', ['acc_search_%']);

    await query(
      `INSERT INTO integration_accounts(id, account_name, partner_code, state_code, is_active)
       VALUES ($1,$2,$3,$4,$5)`,
      ['acc_search_001', 'Search Test Account', 176163, 26, true]
    );

    await query(
      `INSERT INTO session_contexts(
         id, integration_account_id, status, partner_document, partner_type,
         partner_code, user_access_code, user_name, email, auth_mode,
         jwt_token, jwt_token_ref, expires_at, last_validated_at, metadata
       ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15::jsonb)`,
      [
        'scx_search_001',
        'acc_search_001',
        'active',
        '31913781000139',
        'J',
        176163,
        333948,
        'Flavio Padilha Neto',
        'flavio_padilha_neto@msn.com',
        'manual-token',
        'eyJhbGciOiJIUzUxMiJ9.eyJzdWIiOiIxNzYxNjMsMzMzOTQ4Iiwicm9sZSI6MSwiZXhwIjoxODkzNDU2MDAwfQ.abc',
        'vault://mtr/session-contexts/scx_search_001',
        '2030-01-01T00:00:00Z',
        '2026-03-08T00:00:00Z',
        JSON.stringify({ stateCode: 26 })
      ]
    );
  });

  after(async () => {
    https.request = originalHttpsRequest;
    await query('DELETE FROM manifests WHERE integration_account_id LIKE $1', ['acc_search_%']);
    await query('DELETE FROM session_contexts WHERE id LIKE $1', ['scx_search_%']);
    await query('DELETE FROM integration_accounts WHERE id LIKE $1', ['acc_search_%']);
    await pool.end();
  });

  it('deve listar manifestos da CETESB quando local está vazio', async () => {
    const result = await listManifests(
      {
        integrationAccountId: 'acc_search_001',
        sessionContextId: 'scx_search_001',
        page: 1,
        pageSize: 20,
        dateFrom: '2026-02-21',
        dateTo: '2026-03-08'
      },
      'corr_search_001'
    );

    assert.ok(fetchCallCount >= 1, 'Deve consultar CETESB ao menos uma vez');
    assert.strictEqual(result.totalItems, 1, 'Deve retornar 1 manifesto');
    assert.strictEqual(result.items[0].manifestNumber, '260010679516', 'Deve mapear número correto');
    assert.strictEqual(result.items[0].externalCode, 22169012, 'Deve mapear código externo');
    assert.strictEqual(result.items[0].status, 'cancelled', 'Deve normalizar status para cancelled');
  });

  it('deve retornar manifestos em cache na segunda consulta', async () => {
    // Primeira consulta
    await listManifests(
      {
        integrationAccountId: 'acc_search_001',
        sessionContextId: 'scx_search_001',
        page: 1,
        pageSize: 20
      },
      'corr_search_002'
    );

    // Segunda consulta sem filtros
    const result = await listManifests(
      {
        integrationAccountId: 'acc_search_001',
        sessionContextId: 'scx_search_001',
        page: 1,
        pageSize: 20
      },
      'corr_search_003'
    );

    const persistedCount = await query(
      `SELECT COUNT(*)::int AS count
         FROM manifests
        WHERE integration_account_id = $1
          AND external_hash_code = $2`,
      ['acc_search_001', '0Ydw6T0Mu8eQWMfqXmMzUaaj8XiPJh']
    );

    assert.strictEqual(persistedCount.rows[0].count, 1, 'Não deve duplicar manifesto sincronizado');
    assert.strictEqual(result.totalItems, 1, 'Deve retornar 1 manifesto do cache');
  });

  it('deve limpar espelho local cetesb.search no forceSync e recarregar com resultado remoto atual', async () => {
    await query(
      `INSERT INTO manifests(
        id, integration_account_id, session_context_id, status,
        external_status, external_reference, external_hash_code, payload, requested_by, correlation_id, last_sync_at
      ) VALUES
      ($1,$2,$3,$4,$5,$6::jsonb,$7,$8::jsonb,$9,$10,now()),
      ($11,$12,$13,$14,$15,$16::jsonb,$17,$18::jsonb,$19,$20,now())`,
      [
        'man_local_old_001',
        'acc_search_001',
        'scx_search_001',
        'submitted',
        'Salvo',
        JSON.stringify({ manCodigo: 9999991, manNumero: '260019999991' }),
        'hash_local_old_001',
        JSON.stringify({ expeditionDate: '2026-03-05' }),
        'cetesb.search',
        'corr_local_old_001',
        'man_local_keep_001',
        'acc_search_001',
        'scx_search_001',
        'cancelled',
        'Cancelado',
        JSON.stringify({ manCodigo: 22169012, manNumero: '260010679516' }),
        '0Ydw6T0Mu8eQWMfqXmMzUaaj8XiPJh',
        JSON.stringify({ expeditionDate: '2026-03-05' }),
        'cetesb.search',
        'corr_local_keep_001'
      ]
    );

    const result = await listManifests(
      {
        integrationAccountId: 'acc_search_001',
        sessionContextId: 'scx_search_001',
        page: 1,
        pageSize: 20,
        forceSync: 'true'
      },
      'corr_search_force_sync_001'
    );

    const persistedMirror = await query(
      `SELECT external_hash_code
         FROM manifests
        WHERE integration_account_id = $1
          AND requested_by = 'cetesb.search'
        ORDER BY external_hash_code`,
      ['acc_search_001']
    );

    assert.strictEqual(fetchCallCount >= 1, true, 'Deve consultar CETESB no forceSync');
    assert.strictEqual(persistedMirror.rowCount, 1, 'Deve manter apenas os itens retornados na recarga forçada');
    assert.strictEqual(persistedMirror.rows[0].external_hash_code, '0Ydw6T0Mu8eQWMfqXmMzUaaj8XiPJh');
    assert.strictEqual(result.totalItems, 1);
    assert.strictEqual(result.syncSummary?.mode, 'force');
    assert.strictEqual(Number(result.syncSummary?.deletedLocalMirrorCount) >= 1, true);
    assert.strictEqual(result.syncSummary?.remoteItemsCount, 1);
  });

  it('deve filtrar por status quando fornecido', async () => {
    // Listar todos
    let result = await listManifests(
      {
        integrationAccountId: 'acc_search_001',
        sessionContextId: 'scx_search_001'
      },
      'corr_search_004'
    );

    assert.strictEqual(result.totalItems, 1, 'Deve retornar 1 manifesto');

    // Filtrar por status 'submitted' não deve retornar nada
    result = await listManifests(
      {
        integrationAccountId: 'acc_search_001',
        sessionContextId: 'scx_search_001',
        status: 'submitted'
      },
      'corr_search_005'
    );

    assert.strictEqual(result.totalItems, 0, 'Não deve retornar manifestos com status submitted');
  });

  it('deve preservar cache local em autosync vazio e manter consistencia entre recorte curto e amplo', async () => {
    await query(
      `INSERT INTO manifests(
        id, integration_account_id, session_context_id, status,
        external_status, external_reference, external_hash_code, payload, requested_by, correlation_id, last_sync_at
      ) VALUES ($1,$2,$3,$4,$5,$6::jsonb,$7,$8::jsonb,$9,$10,$11)` ,
      [
        'man_test_preserve_001',
        'acc_search_001',
        'scx_search_001',
        'submitted',
        'Salvo',
        JSON.stringify({ manCodigo: 555001, manNumero: '2600555001' }),
        'hash_preserve_001',
        JSON.stringify({ expeditionDate: '2026-03-05' }),
        'cetesb.search',
        'corr_search_preserve_seed_001',
        '2026-03-05T00:00:00.000Z'
      ]
    );

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
        const response = new EventEmitter();
        response.statusCode = 200;
        response.headers = { 'content-type': 'application/json' };
        callback(response);
        response.emit('data', Buffer.from(JSON.stringify({ mensagem: null, erro: false, objetoResposta: [] }), 'utf-8'));
        response.emit('end');
      };

      return request;
    };

    const broad = await listManifests(
      {
        integrationAccountId: 'acc_search_001',
        sessionContextId: 'scx_search_001',
        dateFrom: '2026-03-01',
        dateTo: '2026-03-31',
        page: 1,
        pageSize: 20
      },
      'corr_search_preserve_broad_001'
    );

    assert.equal(fetchCallCount >= 1, true, 'Deve consultar CETESB no autosync');
    assert.equal(broad.totalItems, 1, 'Nao deve apagar cache local quando retorno remoto vier vazio em autosync');
    assert.equal(broad.syncWarning?.code, 'CETESB_SYNC_EMPTY_PRESERVED');

    const short = await listManifests(
      {
        integrationAccountId: 'acc_search_001',
        sessionContextId: 'scx_search_001',
        dateFrom: '2026-03-05',
        dateTo: '2026-03-05',
        page: 1,
        pageSize: 20
      },
      'corr_search_preserve_short_001'
    );

    assert.equal(short.totalItems, 1, 'Recorte curto deve manter item existente no cache local');
    assert.equal(broad.totalItems >= short.totalItems, true, 'Recorte amplo deve conter recorte curto quando a base local ja possui os dados');

    const reportBroad = await reportsMtrSearch({
      integrationAccountId: 'acc_search_001',
      dateFrom: '2026-03-01',
      dateTo: '2026-03-31',
      page: 1,
      pageSize: 20
    });

    const reportShort = await reportsMtrSearch({
      integrationAccountId: 'acc_search_001',
      dateFrom: '2026-03-05',
      dateTo: '2026-03-05',
      page: 1,
      pageSize: 20
    });

    assert.equal(reportShort.items.length, 1, 'Relatorio MTR curto deve encontrar o manifesto esperado');
    assert.equal(reportBroad.items.length >= reportShort.items.length, true, 'Relatorio MTR amplo deve conter resultado do curto');

    const persistedCount = await query(
      `SELECT COUNT(*)::int AS count
         FROM manifests
        WHERE integration_account_id = $1
          AND external_hash_code = $2`,
      ['acc_search_001', 'hash_preserve_001']
    );

    assert.equal(persistedCount.rows[0].count, 1, 'Manifesto local deve permanecer persistido apos autosync vazio');
  });

  it('deve reconciliar ghost local como failed quando forceSync não o encontra na CETESB', async () => {
    await query(
      `INSERT INTO manifests(
        id, integration_account_id, session_context_id, status,
        external_status, external_reference, external_hash_code, payload, requested_by, correlation_id, last_submitted_at
      ) VALUES ($1,$2,$3,$4,$5,$6::jsonb,$7,$8::jsonb,$9,$10,now())`,
      [
        'man_test_rec_sync_001',
        'acc_search_001',
        'scx_search_001',
        'submitted',
        'salvo',
        JSON.stringify(null),
        'hash_ghost_sync_001',
        JSON.stringify({ expeditionDate: '2026-03-05' }),
        'test.user',
        'corr_search_ghost_001'
      ]
    );

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
        const response = new EventEmitter();
        response.statusCode = 200;
        response.headers = { 'content-type': 'application/json' };
        callback(response);
        response.emit('data', Buffer.from(JSON.stringify({ mensagem: null, erro: false, objetoResposta: [] }), 'utf-8'));
        response.emit('end');
      };

      return request;
    };

    const result = await listManifests(
      {
        integrationAccountId: 'acc_search_001',
        sessionContextId: 'scx_search_001',
        page: 1,
        pageSize: 20,
        dateFrom: '2026-03-05',
        dateTo: '2026-03-08',
        forceSync: 'true'
      },
      'corr_search_ghost_002'
    );

    const ghostManifest = await query(
      'SELECT status, external_status FROM manifests WHERE id = $1',
      ['man_test_rec_sync_001']
    );

    assert.strictEqual(fetchCallCount >= 1, true, 'Deve consultar CETESB no forceSync');
    assert.strictEqual(ghostManifest.rows[0].status, 'failed');
    assert.match(ghostManifest.rows[0].external_status, /não localizado na pesquisa CETESB/i);
    assert.strictEqual(result.items.some((item) => item.id === 'man_test_rec_sync_001' && item.status === 'failed'), true);
  });

  it('deve rejeitar sessionContextId que não pertence ao integrationAccountId informado', async () => {
    await assert.rejects(
      () => listManifests(
        {
          integrationAccountId: 'acc_search_missing_fk',
          sessionContextId: 'scx_search_001',
          page: 1,
          pageSize: 20,
          dateFrom: '2026-02-21',
          dateTo: '2026-03-08'
        },
        'corr_search_invalid_context_001'
      ),
      (error) => {
        assert.strictEqual(error?.statusCode, 400);
        assert.match(String(error?.message || ''), /does not belong to integrationAccountId/i);
        return true;
      }
    );

    assert.strictEqual(fetchCallCount, 0, 'Não deve consultar CETESB quando o contexto operacional é inválido');

    const manifestsPersisted = await query(
      'SELECT COUNT(*)::int AS count FROM manifests WHERE integration_account_id = $1',
      ['acc_search_missing_fk']
    );

    assert.strictEqual(manifestsPersisted.rows[0].count, 0, 'Não deve persistir manifests para integrationAccountId inválido');
  });

  it('deve rejeitar upsert remoto quando sessionContextId não pertence à integrationAccountId', async () => {
    await assert.rejects(
      () => upsertManifestFromExternalSearch({
        id: 'man_search_invalid_remote_001',
        integrationAccountId: 'acc_search_missing_fk',
        sessionContextId: 'scx_search_001',
        status: 'submitted',
        externalStatus: 'Recebido',
        externalReference: { manCodigo: 22169999, manNumero: '260019999999' },
        externalHashCode: 'hash_invalid_remote_001',
        payload: { expeditionDate: '2026-03-08' },
        requestedBy: 'cetesb.search',
        correlationId: 'corr_search_invalid_remote_001',
        lastSyncAt: '2026-03-08T00:00:00Z'
      }),
      (error) => {
        assert.strictEqual(error?.statusCode, 400);
        assert.match(String(error?.message || ''), /does not belong to integrationAccountId/i);
        return true;
      }
    );

    const manifestsPersisted = await query(
      'SELECT COUNT(*)::int AS count FROM manifests WHERE external_hash_code = $1',
      ['hash_invalid_remote_001']
    );

    assert.strictEqual(manifestsPersisted.rows[0].count, 0, 'Não deve persistir manifesto remoto com contexto inconsistente');
  });
});

import test from 'node:test';
import assert from 'node:assert/strict';
import { EventEmitter } from 'node:events';
import https from 'node:https';
import { createCetesbGateway } from '../../src/gateways/cetesb-gateway.js';
import { setConfigOverride } from '../../src/lib/config.js';
import { AppError } from '../../src/lib/problem.js';

function configureGatewayForTests() {
  setConfigOverride('cetesbGatewayMode', 'real');
  setConfigOverride('cetesbBaseUrl', 'https://example.test');
  setConfigOverride('cetesbRequestTimeoutMs', 100);
  setConfigOverride('cetesbRetryAttempts', 3);
  setConfigOverride('cetesbRetryBackoffBaseMs', 0);
  setConfigOverride('cetesbRetryBackoffMaxMs', 0);
  setConfigOverride('cetesbCatalogThrottleMs', 0);
}

function installHttpsRequestMock(t, responder) {
  const originalRequest = https.request;

  https.request = (options, callback) => {
    const request = new EventEmitter();
    let body = '';

    request.write = (chunk) => {
      body += String(chunk || '');
    };

    request.end = () => {
      process.nextTick(async () => {
        try {
          const response = await responder({ options, body });
          if (response?.error) {
            request.emit('error', response.error);
            return;
          }

          const payloadText = response?.rawText ?? (response?.payload == null ? '' : JSON.stringify(response.payload));
          const payloadBuffer = Buffer.from(payloadText, 'utf-8');
          const result = new EventEmitter();
          result.statusCode = response?.status ?? 200;
          result.headers = response?.headers ?? { 'content-type': 'application/json' };

          callback(result);

          if (payloadBuffer.length > 0) {
            result.emit('data', payloadBuffer);
          }
          result.emit('end');
        } catch (error) {
          request.emit('error', error);
        }
      });
    };

    request.destroy = () => {};
    request.setTimeout = () => request;

    return request;
  };

  t.after(() => {
    https.request = originalRequest;
  });
}

test('requestRaw faz retry em timeout de rede', async (t) => {
  configureGatewayForTests();
  const gateway = createCetesbGateway();
  let calls = 0;

  installHttpsRequestMock(t, async () => {
    calls += 1;
    if (calls === 1) {
      const timeoutError = new Error('Request timed out');
      timeoutError.name = 'TimeoutError';
      return { error: timeoutError };
    }

    return { status: 200, payload: { ok: true } };
  });

  const exchange = await gateway.requestJson({ method: 'GET', path: '/api/test-timeout' });

  assert.equal(calls, 2);
  assert.equal(exchange.response.httpStatus, 200);
  assert.equal(exchange.response.attempt, 2);
  assert.equal(exchange.response.maxAttempts, 3);
});

test('requestRaw faz retry em HTTP 5xx e não retry em 4xx definitivo', async (t) => {
  configureGatewayForTests();
  const gateway = createCetesbGateway();
  let calls = 0;

  installHttpsRequestMock(t, async () => {
    calls += 1;
    if (calls === 1) {
      return { status: 503, payload: { erro: false, mensagem: 'temporario' } };
    }

    return { status: 200, payload: { ok: true } };
  });

  const exchange = await gateway.requestJson({ method: 'GET', path: '/api/test-5xx' });
  assert.equal(calls, 2);
  assert.equal(exchange.response.httpStatus, 200);
  assert.equal(exchange.response.attempt, 2);

  calls = 0;
  installHttpsRequestMock(t, async () => {
    calls += 1;
    return { status: 400, payload: { erro: true, mensagem: 'bad request' } };
  });

  await assert.rejects(
    gateway.requestJson({ method: 'GET', path: '/api/test-4xx' }),
    (error) => {
      assert.equal(error.code, 'CETESB_HTTP_ERROR');
      assert.equal(error.remoteStatus, 400);
      return true;
    }
  );

  assert.equal(calls, 1);
});

test('requestRaw inclui X-Correlation-Id quando informado', async (t) => {
  configureGatewayForTests();
  const gateway = createCetesbGateway();
  let capturedHeaders = null;

  installHttpsRequestMock(t, async ({ options }) => {
    capturedHeaders = options.headers;
    return { status: 200, payload: { ok: true } };
  });

  const exchange = await gateway.requestJson({
    method: 'GET',
    path: '/api/test-correlation',
    correlationId: 'corr-123'
  });

  assert.equal(exchange.response.httpStatus, 200);
  assert.equal(capturedHeaders['X-Correlation-Id'], 'corr-123');
});

test('fetchCatalogs mantém processamento com falha parcial', async (t) => {
  configureGatewayForTests();
  setConfigOverride('cetesbRetryAttempts', 1);
  const gateway = createCetesbGateway();
  let calls = 0;

  installHttpsRequestMock(t, async () => {
    calls += 1;
    if (calls === 1) {
      return { status: 500, payload: { erro: true, mensagem: 'erro temporario' } };
    }

    return {
      status: 200,
      payload: {
        erro: false,
        objetoResposta: [{ tpaCodigo: 5, tpaDescricao: 'Transportador' }]
      }
    };
  });

  const result = await gateway.fetchCatalogs(['states', 'partnerTypes']);

  assert.equal(result.length, 2);
  assert.equal(result[0].name, 'states');
  assert.equal(result[0].source, 'cetesb-real');
  assert.ok(result[0].error);
  assert.equal(result[0].error.status, 502);
  assert.equal(result[1].name, 'partnerTypes');
  assert.equal(result[1].source, 'cetesb-real');
  assert.equal(result[1].items.length, 1);
  assert.equal(result[1].items[0].code, 5);
});

test('fetchCatalogs enriquece residueClasses com descrições de resíduo e classe', async (t) => {
  configureGatewayForTests();
  setConfigOverride('cetesbResidueSearchSeedTerms', ['Classe A']);
  const gateway = createCetesbGateway();

  installHttpsRequestMock(t, async ({ options }) => {
    const href = `https://${options.hostname}${options.path}`;

    if (href.includes('/api/residuo/residuoClasse')) {
      return { status: 200, payload: { erro: false, objetoResposta: [{ resCodigo: 517, claCodigo: 11 }] } };
    }

    if (href.includes('/api/residuo/pesquisa/')) {
      return {
        status: 200,
        payload: {
          erro: false,
          objetoResposta: [{ resCodigo: 517, resDescricao: 'Concreto britado', resCodigoIbama: '170101', grrDescricao: 'RCC Classe A' }]
        }
      };
    }

    if (href.includes('/api/classes')) {
      return { status: 200, payload: { erro: false, objetoResposta: [{ claCodigo: 11, claDescricao: 'CLASSE A (RCC)' }] } };
    }

    throw new Error(`unexpected url: ${href}`);
  });

  const result = await gateway.fetchCatalogs(['residueClasses']);

  assert.equal(result.length, 1);
  assert.equal(result[0].name, 'residueClasses');
  assert.equal(result[0].items.length, 1);
  assert.equal(result[0].items[0].code, '517');
  assert.equal(result[0].items[0].name, 'Concreto britado');
  assert.equal(result[0].items[0].shortName, '170101');
  assert.equal(result[0].items[0].group, 'CLASSE A (RCC)');
  assert.equal(result[0].items[0].raw.resCodigo, 517);
  assert.equal(result[0].items[0].raw.claCodigo, 11);
  assert.equal(result[0].items[0].raw.claDescricao, 'CLASSE A (RCC)');
});

test('cancelManifest força refresh de sessão após CETESB_AUTH_FAILED e repete com sucesso', async () => {
  configureGatewayForTests();
  const gateway = createCetesbGateway();

  let refreshCalls = 0;
  let cancelCalls = 0;

  gateway.resolveSession = async () => ({
    sessionContext: {
      id: 'scx_test_cancel_auth',
      jwtToken: 'token-expirado',
      metadata: {}
    }
  });

  gateway.ensureAuthForSession = async () => {
    refreshCalls += 1;
    return {
      id: 'scx_test_cancel_auth',
      jwtToken: 'token-renovado',
      metadata: {}
    };
  };

  gateway.requestJson = async ({ path, headers, token }) => {
    if (path !== '/api/mtr/manifesto/cancelaManifesto') {
      throw new Error(`path inesperado no teste: ${path}`);
    }

    cancelCalls += 1;
    const currentToken = token || headers?.['x-access-token'] || headers?.Authorization || '';
    if (String(currentToken).includes('token-expirado')) {
      throw new AppError(502, 'CETESB Authentication Error', '401 no cancelamento', {
        code: 'CETESB_AUTH_FAILED',
        remoteStatus: 401
      });
    }

    return {
      request: {
        endpoint: 'https://example.test/api/mtr/manifesto/cancelaManifesto',
        httpMethod: 'POST',
        sanitizedHeaders: headers || {},
        sanitizedBody: {}
      },
      response: {
        endpoint: 'https://example.test/api/mtr/manifesto/cancelaManifesto',
        httpMethod: 'POST',
        httpStatus: 200,
        sanitizedHeaders: {},
        sanitizedBody: {},
        data: {
          erro: false,
          mensagem: 'cancelado',
          objetoResposta: {
            manCodigo: 123,
            manNumero: '260000000123',
            situacaoManifesto: {
              simCodigo: 4,
              simDescricao: 'Cancelado'
            }
          }
        }
      }
    };
  };

  const result = await gateway.cancelManifest(
    {
      integrationAccountId: 'acc_test_cancel_auth',
      sessionContextId: 'scx_test_cancel_auth',
      externalReference: {
        manCodigo: 123,
        manNumero: '260000000123'
      },
      externalHashCode: null,
      payload: {}
    },
    {
      reason: 'cancelamento por teste'
    }
  );

  assert.equal(refreshCalls, 1);
  assert.ok(cancelCalls >= 4);
  assert.equal(result.response.data.manCodigo, 123);
  assert.equal(result.response.data.manNumero, '260000000123');
});

test('cancelManifest falha quando CETESB não confirma status cancelado após o POST', async () => {
  configureGatewayForTests();
  const gateway = createCetesbGateway();

  const originalSetTimeout = globalThis.setTimeout;
  globalThis.setTimeout = (callback, _delay, ...args) => {
    callback(...args);
    return 0;
  };

  gateway.resolveSession = async () => ({
    sessionContext: {
      id: 'scx_test_cancel_verify',
      jwtToken: 'token-valido',
      metadata: {}
    }
  });

  gateway.requestJson = async ({ path }) => {
    if (path !== '/api/mtr/manifesto/cancelaManifesto') {
      throw new Error(`path inesperado no teste: ${path}`);
    }

    return {
      request: {
        endpoint: 'https://example.test/api/mtr/manifesto/cancelaManifesto',
        httpMethod: 'POST',
        sanitizedHeaders: {},
        sanitizedBody: {}
      },
      response: {
        endpoint: 'https://example.test/api/mtr/manifesto/cancelaManifesto',
        httpMethod: 'POST',
        httpStatus: 200,
        sanitizedHeaders: {},
        sanitizedBody: {},
        data: {
          erro: false,
          mensagem: 'requisição recebida',
          objetoResposta: {
            manCodigo: 123,
            manNumero: '260000000123',
            situacaoManifesto: {
              simCodigo: 1,
              simDescricao: 'Salvo'
            }
          }
        }
      }
    };
  };

  gateway.lookupManifestByHash = async () => ({
    exchange: null,
    item: {
      manCodigo: 123,
      manNumero: '260000000123',
      situacaoManifesto: {
        simCodigo: 1,
        simDescricao: 'Salvo'
      }
    }
  });

  try {
    await assert.rejects(
      async () => gateway.cancelManifest(
        {
          integrationAccountId: 'acc_test_cancel_verify',
          sessionContextId: 'scx_test_cancel_verify',
          externalReference: {
            manCodigo: 123,
            manNumero: '260000000123'
          },
          externalHashCode: 'hash_test_cancel_verify',
          payload: {}
        },
        {
          reason: 'cancelamento por teste'
        }
      ),
      {
        code: 'MANIFEST_CANCEL_NOT_CONFIRMED'
      }
    );
  } finally {
    globalThis.setTimeout = originalSetTimeout;
  }
});

test('searchManifests faz fallback de kind=all para kind=0 quando CETESB retorna 500', async () => {
  configureGatewayForTests();
  const gateway = createCetesbGateway();

  gateway.resolveSession = async () => ({
    sessionContext: {
      id: 'scx_test_search_kind',
      jwtToken: 'token-valido',
      partnerCode: 176163,
      metadata: {}
    },
    integrationAccount: {
      id: 'acc_test_search_kind',
      partner_code: 176163,
      state_code: 26
    }
  });

  const calledPaths = [];
  gateway.requestJson = async ({ path }) => {
    calledPaths.push(path);

    if (path.endsWith('/all')) {
      throw new AppError(502, 'CETESB HTTP Error', 'falha em kind=all', {
        code: 'CETESB_HTTP_ERROR',
        remoteStatus: 500
      });
    }

    if (path.endsWith('/0')) {
      return {
        request: {
          endpoint: `https://example.test${path}`,
          httpMethod: 'GET',
          sanitizedHeaders: {},
          sanitizedBody: {}
        },
        response: {
          endpoint: `https://example.test${path}`,
          httpMethod: 'GET',
          httpStatus: 200,
          latencyMs: 10,
          sanitizedHeaders: {},
          sanitizedBody: {},
          data: {
            erro: false,
            mensagem: null,
            objetoResposta: [{ manCodigo: 1, manNumero: '260010000001' }]
          }
        }
      };
    }

    throw new Error(`path inesperado no teste: ${path}`);
  };

  const result = await gateway.searchManifests({
    integrationAccountId: 'acc_test_search_kind',
    sessionContextId: 'scx_test_search_kind',
    dateFrom: '2026-03-13',
    dateTo: '2026-03-13',
    statusFilter: 0,
    kind: 'all'
  });

  assert.equal(calledPaths.length, 2);
  assert.ok(calledPaths[0].endsWith('/all'));
  assert.ok(calledPaths[1].endsWith('/0'));
  assert.equal(Array.isArray(result), true);
  assert.equal(result.length, 1);
  assert.equal(result[0].manNumero, '260010000001');
});

test('lookupManifestByHash faz fallback de kind=all para kind=0 quando CETESB retorna 500', async () => {
  configureGatewayForTests();
  const gateway = createCetesbGateway();

  const calledPaths = [];
  gateway.requestJson = async ({ path }) => {
    calledPaths.push(path);

    if (path.endsWith('/all')) {
      throw new AppError(502, 'CETESB HTTP Error', 'falha em kind=all', {
        code: 'CETESB_HTTP_ERROR',
        remoteStatus: 500
      });
    }

    if (path.endsWith('/0')) {
      return {
        response: {
          data: {
            erro: false,
            mensagem: null,
            objetoResposta: [{ manHashCode: 'hash_123', manNumero: '260010000123' }]
          }
        }
      };
    }

    throw new Error(`path inesperado no teste: ${path}`);
  };

  const manifest = {
    integrationAccountId: 'acc_test_lookup_kind',
    externalHashCode: 'hash_123',
    payload: {
      expeditionDate: '2026-03-13'
    }
  };

  const sessionContext = {
    jwtToken: 'token-valido',
    partnerCode: 176163,
    metadata: {
      stateCode: 26,
      manifestSearch: {
        tipoManifesto: 8,
        statusFilter: 0,
        kind: 'all'
      }
    }
  };

  const result = await gateway.lookupManifestByHash(manifest, sessionContext);

  assert.equal(calledPaths.length, 2);
  assert.ok(calledPaths[0].endsWith('/all'));
  assert.ok(calledPaths[1].endsWith('/0'));
  assert.equal(result.item?.manHashCode, 'hash_123');
});

test('searchManifests força refresh de sessão e reexecuta busca após 500 persistente', async () => {
  configureGatewayForTests();
  const gateway = createCetesbGateway();

  let refreshCalls = 0;
  gateway.resolveSession = async () => ({
    sessionContext: {
      id: 'scx_test_refresh_search',
      jwtToken: 'token-antigo',
      partnerCode: 176163,
      metadata: {}
    },
    integrationAccount: {
      id: 'acc_test_refresh_search',
      partner_code: 176163,
      state_code: 26
    }
  });

  gateway.ensureAuthForSession = async () => {
    refreshCalls += 1;
    return {
      id: 'scx_test_refresh_search',
      jwtToken: 'token-novo'
    };
  };

  const calledTokens = [];
  const calledPaths = [];
  gateway.requestJson = async ({ path, token }) => {
    calledTokens.push(token);
    calledPaths.push(path);

    if (token === 'token-antigo') {
      throw new AppError(502, 'CETESB HTTP Error', 'falha persistente antes do refresh', {
        code: 'CETESB_HTTP_ERROR',
        remoteStatus: 500
      });
    }

    return {
      request: {
        endpoint: `https://example.test${path}`,
        httpMethod: 'GET',
        sanitizedHeaders: {},
        sanitizedBody: {}
      },
      response: {
        endpoint: `https://example.test${path}`,
        httpMethod: 'GET',
        httpStatus: 200,
        latencyMs: 12,
        sanitizedHeaders: {},
        sanitizedBody: {},
        data: {
          erro: false,
          mensagem: null,
          objetoResposta: [{ manCodigo: 2, manNumero: '260010000002' }]
        }
      }
    };
  };

  const result = await gateway.searchManifests({
    integrationAccountId: 'acc_test_refresh_search',
    sessionContextId: 'scx_test_refresh_search',
    dateFrom: '2026-03-13',
    dateTo: '2026-03-13',
    statusFilter: 0,
    kind: 'all'
  });

  assert.equal(refreshCalls, 1);
  assert.ok(calledPaths.some((path) => path.endsWith('/all')));
  assert.ok(calledPaths.some((path) => path.endsWith('/0')));
  assert.equal(calledTokens.at(-1), 'token-novo');
  assert.equal(Array.isArray(result), true);
  assert.equal(result.length, 1);
  assert.equal(result[0].manNumero, '260010000002');
});

test('searchManifests agrega range dia a dia e preserva dias válidos quando CETESB falha parcialmente', async () => {
  configureGatewayForTests();
  const gateway = createCetesbGateway();

  gateway.resolveSession = async () => ({
    sessionContext: {
      id: 'scx_test_range_partial',
      jwtToken: 'token-valido',
      partnerCode: 176163,
      metadata: {}
    },
    integrationAccount: {
      id: 'acc_test_range_partial',
      partner_code: 176163,
      state_code: 26
    }
  });

  const calledPaths = [];
  gateway.requestJson = async ({ path }) => {
    calledPaths.push(path);

    if (path.includes('/07-03-2026/07-03-2026/')) {
      return {
        request: {
          endpoint: `https://example.test${path}`,
          httpMethod: 'GET',
          sanitizedHeaders: {},
          sanitizedBody: {}
        },
        response: {
          endpoint: `https://example.test${path}`,
          httpMethod: 'GET',
          httpStatus: 200,
          latencyMs: 9,
          sanitizedHeaders: {},
          sanitizedBody: {},
          data: {
            erro: false,
            mensagem: null,
            objetoResposta: [{ manCodigo: 7, manNumero: '260010000007', manHashCode: 'hash-day-7' }]
          }
        }
      };
    }

    if (path.includes('/08-03-2026/08-03-2026/')) {
      throw new AppError(502, 'CETESB HTTP Error', 'erro interno CETESB no dia 8', {
        code: 'CETESB_HTTP_ERROR',
        remoteStatus: 404
      });
    }

    throw new Error(`path inesperado no teste: ${path}`);
  };

  const result = await gateway.searchManifests({
    integrationAccountId: 'acc_test_range_partial',
    sessionContextId: 'scx_test_range_partial',
    dateFrom: '2026-03-07',
    dateTo: '2026-03-08',
    statusFilter: 0,
    kind: 'all'
  });

  const day7Calls = calledPaths.filter((path) => path.includes('/07-03-2026/07-03-2026/')).length;
  const day8Calls = calledPaths.filter((path) => path.includes('/08-03-2026/08-03-2026/')).length;

  assert.equal(day7Calls > 0, true);
  assert.equal(day8Calls > 0, true);
  assert.equal(Array.isArray(result), true);
  assert.equal(result.length, 1);
  assert.equal(result[0].manNumero, '260010000007');
});

function stubCdfOperationContext(gateway) {
  gateway.resolveAuthenticatedOperationContext = async () => ({
    sessionContext: { id: 'scx_cdf', jwtToken: 'token-valido', partnerCode: 176163, metadata: {} },
    integrationAccount: { id: 'acc_cdf', partner_code: 176163, state_code: 26 },
    partnerCode: 176163,
    stateCode: 26
  });
}

function buildCdfRequestResponse(path, objetoResposta) {
  return {
    request: { endpoint: `https://example.test${path}`, httpMethod: 'GET', sanitizedHeaders: {}, sanitizedBody: {} },
    response: {
      endpoint: `https://example.test${path}`,
      httpMethod: 'GET',
      httpStatus: 200,
      latencyMs: 8,
      sanitizedHeaders: {},
      sanitizedBody: {},
      data: { erro: false, mensagem: null, objetoResposta }
    }
  };
}

test('searchCdfCertificates fatia ranges > 31 dias em janelas e mescla/deduplica por cerHashCode', async () => {
  configureGatewayForTests();
  const gateway = createCetesbGateway();
  stubCdfOperationContext(gateway);

  const calledPaths = [];
  gateway.requestJson = async ({ path }) => {
    calledPaths.push(path);
    if (path.includes('/01-01-2026/31-01-2026')) {
      return buildCdfRequestResponse(path, [
        { cerHashCode: 'A', cerCodigo: 1 },
        { cerHashCode: 'B', cerCodigo: 2 }
      ]);
    }
    if (path.includes('/01-02-2026/03-03-2026')) {
      // 'B' repetido entre janelas deve ser deduplicado.
      return buildCdfRequestResponse(path, [
        { cerHashCode: 'B', cerCodigo: 2 },
        { cerHashCode: 'C', cerCodigo: 3 }
      ]);
    }
    if (path.includes('/04-03-2026/15-03-2026')) {
      return buildCdfRequestResponse(path, [{ cerHashCode: 'D', cerCodigo: 4 }]);
    }
    throw new Error(`path inesperado no teste: ${path}`);
  };

  const exchange = await gateway.searchCdfCertificates({
    integrationAccountId: 'acc_cdf',
    sessionContextId: 'scx_cdf',
    dateFrom: '2026-01-01',
    dateTo: '2026-03-15'
  });

  // 74 dias => 3 janelas de <= 31 dias.
  assert.equal(calledPaths.length, 3);
  const items = exchange.response.data.items;
  assert.equal(Array.isArray(items), true);
  assert.equal(items.length, 4);
  assert.deepEqual(items.map((item) => item.cerHashCode).sort(), ['A', 'B', 'C', 'D']);
  assert.equal(exchange.response.data.search.segmented, true);
  assert.equal(exchange.response.data.search.windowCount, 3);
});

test('searchCdfCertificates mantém uma única chamada para ranges <= 31 dias', async () => {
  configureGatewayForTests();
  const gateway = createCetesbGateway();
  stubCdfOperationContext(gateway);

  const calledPaths = [];
  gateway.requestJson = async ({ path }) => {
    calledPaths.push(path);
    return buildCdfRequestResponse(path, [{ cerHashCode: 'X', cerCodigo: 10 }]);
  };

  const exchange = await gateway.searchCdfCertificates({
    integrationAccountId: 'acc_cdf',
    sessionContextId: 'scx_cdf',
    dateFrom: '2026-03-01',
    dateTo: '2026-03-15'
  });

  assert.equal(calledPaths.length, 1);
  assert.equal(exchange.response.data.items.length, 1);
  assert.notEqual(exchange.response.data.search.segmented, true);
});

test('searchCdfCertificates rejeita período muito amplo com CDF_SEARCH_RANGE_TOO_WIDE', async () => {
  configureGatewayForTests();
  const gateway = createCetesbGateway();
  stubCdfOperationContext(gateway);

  let calls = 0;
  gateway.requestJson = async () => {
    calls += 1;
    return buildCdfRequestResponse('/api/mtr/certificadoDestinacao', []);
  };

  await assert.rejects(
    gateway.searchCdfCertificates({
      integrationAccountId: 'acc_cdf',
      sessionContextId: 'scx_cdf',
      dateFrom: '2020-01-01',
      dateTo: '2026-01-01'
    }),
    (error) => {
      assert.equal(error.code, 'CDF_SEARCH_RANGE_TOO_WIDE');
      return true;
    }
  );

  // A guarda dispara antes de qualquer chamada à CETESB.
  assert.equal(calls, 0);
});

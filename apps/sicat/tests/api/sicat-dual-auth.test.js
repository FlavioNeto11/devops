import { describe, it, before, beforeEach, after } from 'node:test';
import assert from 'node:assert';
import { query, pool } from '../../src/db/pool.js';
import { hashPassword } from '../../src/lib/sicat-security.js';
import { setConfigOverride } from '../../src/lib/config.js';
import { ensureStartup } from '../../src/bootstrap/startup.js';
import { createApp } from '../../src/app.js';
import { setAuthGatewayOverrideForTests } from '../../src/services/auth-service.js';
import { setManifestGatewayOverrideForTests } from '../../src/services/manifest-service.js';
import { setSicatAccountGatewayOverrideForTests } from '../../src/services/sicat-account-service.js';

let API_BASE = '';
let server;

const TEST_USER = {
  id: 'usr_test_sicat_api_001',
  email: 'qa.sicat.api@example.com',
  password: 'Sicat@123',
  name: 'QA SICAT API'
};

const TEST_ACCOUNT_PAYLOAD = {
  login: '31913781000139',
  password: 'senha-cetesb-mock',
  email: 'cetesb.account@example.com',
  partnerCode: 176163,
  recaptchaToken: ''
};

function buildJwtTestToken() {
  const header = Buffer.from(JSON.stringify({ alg: 'HS256', typ: 'JWT' })).toString('base64url');
  const payload = Buffer.from(JSON.stringify({
    sub: '176163,333948',
    role: 1,
    exp: 4102444800,
    iat: 1704067200
  })).toString('base64url');
  return `${header}.${payload}.signature`;
}

const FIXED_CETESB_TOKEN = buildJwtTestToken();

async function loginAndGetTokens() {
  const response = await fetch(`${API_BASE}/v1/sicat/auth/login`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'X-Correlation-Id': 'test_sicat_login_success'
    },
    body: JSON.stringify({
      email: TEST_USER.email,
      password: TEST_USER.password
    })
  });

  assert.strictEqual(response.status, 200);
  const payload = await response.json();

  assert.ok(payload.accessToken);
  assert.ok(payload.refreshToken);
  assert.ok(payload.expiresAt);
  assert.strictEqual(payload.user?.email, TEST_USER.email);

  return payload;
}

function authHeaders(accessToken, correlationId) {
  return {
    Authorization: `Bearer ${accessToken}`,
    'Content-Type': 'application/json',
    'X-Correlation-Id': correlationId
  };
}

function uniqueTestEmail(prefix = 'novo.usuario.sicat') {
  return `${prefix}.${Date.now()}.${Math.floor(Math.random() * 100000)}@example.com`;
}

async function resetTestData() {
  await query('DELETE FROM session_contexts WHERE integration_account_id LIKE $1', ['acc_acc_test_sicat_api_%']);
  await query('DELETE FROM integration_accounts WHERE id LIKE $1', ['acc_acc_test_sicat_api_%']);
  await query('DELETE FROM sicat_cetesb_accounts WHERE id LIKE $1 OR user_id = $2', ['acc_test_sicat_api_%', TEST_USER.id]);
  await query('DELETE FROM sicat_sessions WHERE user_id = $1', [TEST_USER.id]);
  await query('DELETE FROM sicat_users WHERE id = $1 OR email = $2', [TEST_USER.id, TEST_USER.email]);
}

async function seedSicatUser() {
  await query(
    `INSERT INTO sicat_users(id, email, password_hash, name, is_active)
     VALUES ($1, $2, $3, $4, $5)`,
    [
      TEST_USER.id,
      TEST_USER.email,
      hashPassword(TEST_USER.password),
      TEST_USER.name,
      true
    ]
  );
}

describe('SICAT Dual Auth + CETESB Accounts API', { concurrency: 1 }, () => {
  before(async () => {
    setConfigOverride('cetesbGatewayMode', 'real');
    setConfigOverride('cetesbBaseUrl', 'https://mtrr.cetesb.sp.gov.br');
    setConfigOverride('cetesbApiBaseUrl', 'https://mtrr.cetesb.sp.gov.br');
    setConfigOverride('cetesbPortalOrigin', 'https://mtr.cetesb.sp.gov.br');
    setConfigOverride('cetesbPortalReferer', 'https://mtr.cetesb.sp.gov.br/');
    setConfigOverride('cetesbRetryAttempts', 1);
    setAuthGatewayOverrideForTests(() => ({
      async requestJson(args) {
        const path = typeof args?.path === 'string' ? args.path : '';
        const body = args?.body && typeof args.body === 'object' && !Array.isArray(args.body)
          ? args.body
          : {};

        if (path.startsWith('/api/mtr/consultaParceiro/J/')) {
          const document = path.split('/').pop() || TEST_ACCOUNT_PAYLOAD.login;
          return {
            response: {
              data: {
                erro: false,
                objetoResposta: {
                  parCodigo: 176163,
                  parDescricao: 'Nova IT',
                  parNomeFantasia: 'Nova IT Ambiental',
                  parCnpj: document,
                  parTipoPessoa: 'J',
                  estCodigo: 26,
                  estAbreviacao: 'SP',
                  paaCodigo: 333948,
                  paaNome: 'Flavio Padilha Neto',
                  paaEmail: 'cetesb.account@example.com',
                  paaCpf: '12345678901'
                }
              }
            }
          };
        }

        if (path === '/api/mtr/carregaDadosLogin') {
          const loginValue = typeof body.login === 'string' ? body.login : TEST_ACCOUNT_PAYLOAD.login;
          return {
            response: {
              data: {
                erro: false,
                objetoResposta: {
                  token: FIXED_CETESB_TOKEN,
                  paaCodigo: 'usr_mock_001',
                  paaNome: 'Conta CETESB SICAT',
                  email: 'cetesb.account@example.com',
                  jurCnp: loginValue,
                  parCodigo: '176163',
                  parDescricao: 'Nova IT (Integration)',
                  isGerador: true
                }
              }
            }
          };
        }

        throw new Error(`Unexpected auth gateway request in sicat-dual-auth.test: ${path}`);
      }
    }));
    setSicatAccountGatewayOverrideForTests(() => ({
      async bootstrapSession() {
        return {
          token: FIXED_CETESB_TOKEN,
          expiresAt: '2099-12-31T00:00:00.000Z',
          authPayload: {
            cookieHeader: 'SESSION=mocked',
            paaCodigo: 333948,
            paaNome: 'Conta CETESB SICAT'
          }
        };
      }
    }));

    await ensureStartup();

    const app = createApp();
    server = await new Promise((resolve) => {
      const instance = app.listen(0, '127.0.0.1', () => resolve(instance));
    });

    const address = server.address();
    API_BASE = `http://127.0.0.1:${address.port}`;

    await pool.connect().then((client) => client.release());
  });

  beforeEach(async () => {
    await resetTestData();
    await seedSicatUser();
  });

  after(async () => {
    await resetTestData();
    setAuthGatewayOverrideForTests(null);
    setManifestGatewayOverrideForTests(null);
    setSicatAccountGatewayOverrideForTests(null);

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

  it('POST /v1/sicat/auth/login deve retornar sucesso básico', async () => {
    const response = await fetch(`${API_BASE}/v1/sicat/auth/login`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-Correlation-Id': 'test_sicat_login_basic'
      },
      body: JSON.stringify({
        email: TEST_USER.email,
        password: TEST_USER.password
      })
    });

    assert.strictEqual(response.status, 200);
    const payload = await response.json();

    assert.ok(payload.accessToken);
    assert.ok(payload.refreshToken);
    assert.ok(payload.expiresAt);
    assert.strictEqual(payload.user?.email, TEST_USER.email);
  });

  it('POST /v1/sicat/auth/register deve retornar sucesso básico', async () => {
    const registerEmail = uniqueTestEmail();

    const response = await fetch(`${API_BASE}/v1/sicat/auth/register`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-Correlation-Id': 'test_sicat_register_basic'
      },
      body: JSON.stringify({
        name: 'Novo Usuário SICAT',
        email: registerEmail,
        password: 'Senha@1234'
      })
    });

    assert.strictEqual(response.status, 201);
    const payload = await response.json();

    assert.ok(payload.accessToken);
    assert.ok(payload.refreshToken);
    assert.ok(payload.expiresAt);
    assert.strictEqual(payload.user?.email, registerEmail);
  });

  it('POST /v1/sicat/auth/register deve retornar 409 para e-mail já existente', async () => {
    const response = await fetch(`${API_BASE}/v1/sicat/auth/register`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-Correlation-Id': 'test_sicat_register_conflict'
      },
      body: JSON.stringify({
        name: TEST_USER.name,
        email: TEST_USER.email,
        password: TEST_USER.password
      })
    });

    assert.strictEqual(response.status, 409);
    assert.match(response.headers.get('content-type') || '', /application\/problem\+json/i);
  });

  it('POST /v1/sicat/auth/login deve retornar 400 para payload inválido', async () => {
    const response = await fetch(`${API_BASE}/v1/sicat/auth/login`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-Correlation-Id': 'test_sicat_login_invalid_payload'
      },
      body: JSON.stringify({
        password: TEST_USER.password
      })
    });

    assert.strictEqual(response.status, 400);
    assert.match(response.headers.get('content-type') || '', /application\/problem\+json/i);
  });

  it('POST /v1/sicat/auth/refresh deve retornar sucesso básico', async () => {
    const loginPayload = await loginAndGetTokens();

    const response = await fetch(`${API_BASE}/v1/sicat/auth/refresh`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-Correlation-Id': 'test_sicat_refresh_basic'
      },
      body: JSON.stringify({
        refreshToken: loginPayload.refreshToken
      })
    });

    assert.strictEqual(response.status, 200);
    const payload = await response.json();

    assert.ok(payload.accessToken);
    assert.ok(payload.refreshToken);
    assert.ok(payload.expiresAt);
    assert.notStrictEqual(payload.refreshToken, loginPayload.refreshToken);
  });

  it('POST /v1/sicat/auth/refresh deve retornar 400 para payload inválido', async () => {
    const response = await fetch(`${API_BASE}/v1/sicat/auth/refresh`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-Correlation-Id': 'test_sicat_refresh_invalid_payload'
      },
      body: JSON.stringify({})
    });

    assert.strictEqual(response.status, 400);
    assert.match(response.headers.get('content-type') || '', /application\/problem\+json/i);
  });

  it('rotas protegidas SICAT devem retornar 401 sem Bearer token', async () => {
    const unauthorizedCases = [
      { method: 'GET', path: '/v1/sicat/cetesb-accounts' },
      { method: 'POST', path: '/v1/sicat/cetesb-accounts', body: { login: 'x', password: 'y' } },
      { method: 'POST', path: '/v1/sicat/cetesb-accounts/acc_test_sicat_api_404/activate' },
      { method: 'GET', path: '/v1/sicat/session' }
    ];

    for (const testCase of unauthorizedCases) {
      const response = await fetch(`${API_BASE}${testCase.path}`, {
        method: testCase.method,
        headers: {
          'Content-Type': 'application/json',
          'X-Correlation-Id': `test_sicat_unauthorized_${testCase.method}_${testCase.path}`
        },
        body: testCase.body ? JSON.stringify(testCase.body) : undefined
      });

      assert.strictEqual(response.status, 401, `${testCase.method} ${testCase.path} deve retornar 401`);
      assert.match(response.headers.get('content-type') || '', /application\/problem\+json/i);
    }
  });

  it('GET /v1/sicat/cetesb-accounts deve retornar sucesso básico com auth', async () => {
    const loginPayload = await loginAndGetTokens();

    const response = await fetch(`${API_BASE}/v1/sicat/cetesb-accounts`, {
      method: 'GET',
      headers: authHeaders(loginPayload.accessToken, 'test_sicat_accounts_list_basic')
    });

    assert.strictEqual(response.status, 200);
    const payload = await response.json();

    assert.ok(Array.isArray(payload.accounts));
    assert.strictEqual(payload.activeAccountId, null);
  });

  it('POST /v1/sicat/cetesb-accounts deve retornar 400 para payload inválido', async () => {
    const loginPayload = await loginAndGetTokens();

    const response = await fetch(`${API_BASE}/v1/sicat/cetesb-accounts`, {
      method: 'POST',
      headers: authHeaders(loginPayload.accessToken, 'test_sicat_accounts_add_invalid_payload'),
      body: JSON.stringify({ email: 'sem.login.e.password@example.com' })
    });

    assert.strictEqual(response.status, 400);
    assert.match(response.headers.get('content-type') || '', /application\/problem\+json/i);
  });

  it('POST /v1/sicat/cetesb-accounts deve retornar sucesso básico', async () => {
    const loginPayload = await loginAndGetTokens();

    const response = await fetch(`${API_BASE}/v1/sicat/cetesb-accounts`, {
      method: 'POST',
      headers: authHeaders(loginPayload.accessToken, 'test_sicat_accounts_add_basic'),
      body: JSON.stringify(TEST_ACCOUNT_PAYLOAD)
    });

    assert.strictEqual(response.status, 201);
    const payload = await response.json();

    assert.ok(payload.accountId);
    assert.strictEqual(Number(payload.partnerCode), Number(TEST_ACCOUNT_PAYLOAD.partnerCode));
    assert.strictEqual(payload.isActive, false);
  });

  it('POST /v1/sicat/cetesb-accounts/:accountId/activate deve retornar sucesso básico', async () => {
    const loginPayload = await loginAndGetTokens();

    const addResponse = await fetch(`${API_BASE}/v1/sicat/cetesb-accounts`, {
      method: 'POST',
      headers: authHeaders(loginPayload.accessToken, 'test_sicat_accounts_add_for_activate'),
      body: JSON.stringify(TEST_ACCOUNT_PAYLOAD)
    });
    assert.strictEqual(addResponse.status, 201);
    const addedAccount = await addResponse.json();

    const activateResponse = await fetch(`${API_BASE}/v1/sicat/cetesb-accounts/${addedAccount.accountId}/activate`, {
      method: 'POST',
      headers: authHeaders(loginPayload.accessToken, 'test_sicat_accounts_activate_basic')
    });

    assert.strictEqual(activateResponse.status, 200);
    const payload = await activateResponse.json();

    assert.strictEqual(payload.activeAccount?.accountId, addedAccount.accountId);
    assert.ok(payload.sessionContext?.sessionContextId);
    assert.ok(payload.sessionContext?.integrationAccountId);
  });

  it('GET /v1/sicat/session deve retornar sucesso básico com auth', async () => {
    const loginPayload = await loginAndGetTokens();

    const addResponse = await fetch(`${API_BASE}/v1/sicat/cetesb-accounts`, {
      method: 'POST',
      headers: authHeaders(loginPayload.accessToken, 'test_sicat_accounts_add_for_session'),
      body: JSON.stringify(TEST_ACCOUNT_PAYLOAD)
    });
    assert.strictEqual(addResponse.status, 201);
    const addedAccount = await addResponse.json();

    const activateResponse = await fetch(`${API_BASE}/v1/sicat/cetesb-accounts/${addedAccount.accountId}/activate`, {
      method: 'POST',
      headers: authHeaders(loginPayload.accessToken, 'test_sicat_accounts_activate_for_session')
    });
    assert.strictEqual(activateResponse.status, 200);

    const sessionResponse = await fetch(`${API_BASE}/v1/sicat/session`, {
      method: 'GET',
      headers: authHeaders(loginPayload.accessToken, 'test_sicat_session_basic')
    });

    assert.strictEqual(sessionResponse.status, 200);
    const payload = await sessionResponse.json();

    assert.ok(payload.user?.userId);
    assert.strictEqual(payload.activeAccount?.accountId, addedAccount.accountId);
    assert.ok(payload.sessionContext?.sessionContextId);
  });

  it('GET /v1/cdf/certificates deve preservar o fallback de partnerCode do sessionContext no fluxo SICAT', async () => {
    const loginPayload = await loginAndGetTokens();

    const addResponse = await fetch(`${API_BASE}/v1/sicat/cetesb-accounts`, {
      method: 'POST',
      headers: authHeaders(loginPayload.accessToken, 'test_sicat_accounts_add_for_cdf_certificates'),
      body: JSON.stringify(TEST_ACCOUNT_PAYLOAD)
    });
    assert.strictEqual(addResponse.status, 201);
    const addedAccount = await addResponse.json();

    const activateResponse = await fetch(`${API_BASE}/v1/sicat/cetesb-accounts/${addedAccount.accountId}/activate`, {
      method: 'POST',
      headers: authHeaders(loginPayload.accessToken, 'test_sicat_accounts_activate_for_cdf_certificates')
    });
    assert.strictEqual(activateResponse.status, 200);
    const activatePayload = await activateResponse.json();

    let capturedOptions;
    setManifestGatewayOverrideForTests({
      searchManifests: async () => {
        throw new Error('searchManifests should not be called in this test');
      },
      printManifest: async () => {
        throw new Error('printManifest should not be called in this test');
      },
      searchCdfCertificates: async (options = {}) => {
        capturedOptions = options;
        return { items: [] };
      },
      printCdfCertificate: async () => {
        throw new Error('printCdfCertificate should not be called in this test');
      }
    });

    try {
      const integrationAccountId = activatePayload.sessionContext?.integrationAccountId;
      const sessionContextId = activatePayload.sessionContext?.sessionContextId;

      assert.ok(integrationAccountId);
      assert.ok(sessionContextId);

      const certificatesResponse = await fetch(
        `${API_BASE}/v1/cdf/certificates?integrationAccountId=${encodeURIComponent(integrationAccountId)}&sessionContextId=${encodeURIComponent(sessionContextId)}&dateFrom=2026-04-01&dateTo=2026-04-19`,
        {
          method: 'GET',
          headers: {
            Authorization: `Bearer ${loginPayload.accessToken}`,
            'X-Correlation-Id': 'test_sicat_cdf_certificates_session_partner_fallback'
          }
        }
      );

      assert.strictEqual(certificatesResponse.status, 200);
      const payload = await certificatesResponse.json();

      assert.strictEqual(payload.integrationAccountId, integrationAccountId);
      assert.strictEqual(payload.sessionContextId, sessionContextId);
      assert.deepStrictEqual(payload.items, []);
      assert.ok(capturedOptions);
      assert.strictEqual(capturedOptions.integrationAccountId, integrationAccountId);
      assert.strictEqual(capturedOptions.sessionContextId, sessionContextId);
      assert.strictEqual(capturedOptions.jwtToken, null);
      assert.strictEqual(capturedOptions.partnerCode, undefined);
    } finally {
      setManifestGatewayOverrideForTests(null);
    }
  });

  it('GET /v1/cdf/certificates deve persistir auditoria recuperável quando o gateway retorna exchange síncrono', async () => {
    const loginPayload = await loginAndGetTokens();

    const addResponse = await fetch(`${API_BASE}/v1/sicat/cetesb-accounts`, {
      method: 'POST',
      headers: authHeaders(loginPayload.accessToken, 'test_sicat_accounts_add_for_cdf_audit'),
      body: JSON.stringify(TEST_ACCOUNT_PAYLOAD)
    });
    assert.strictEqual(addResponse.status, 201);
    const addedAccount = await addResponse.json();

    const activateResponse = await fetch(`${API_BASE}/v1/sicat/cetesb-accounts/${addedAccount.accountId}/activate`, {
      method: 'POST',
      headers: authHeaders(loginPayload.accessToken, 'test_sicat_accounts_activate_for_cdf_audit')
    });
    assert.strictEqual(activateResponse.status, 200);
    const activatePayload = await activateResponse.json();

    const integrationAccountId = activatePayload.sessionContext?.integrationAccountId;
    const sessionContextId = activatePayload.sessionContext?.sessionContextId;
    const correlationId = `corr_test_cdf_audit_${Date.now()}`;
    const certificateEndpoint = 'https://mtrr.cetesb.sp.gov.br/api/mtr/certificadoDestinacao/9/176163/0/all/01-04-2026/19-04-2026';

    assert.ok(integrationAccountId);
    assert.ok(sessionContextId);

    await query('DELETE FROM audit_logs WHERE correlation_id = $1', [correlationId]);

    setManifestGatewayOverrideForTests({
      searchManifests: async () => {
        throw new Error('searchManifests should not be called in this test');
      },
      printManifest: async () => {
        throw new Error('printManifest should not be called in this test');
      },
      searchCdfCertificates: async () => ({
        request: {
          endpoint: certificateEndpoint,
          httpMethod: 'GET',
          sanitizedHeaders: { accept: 'application/json' },
          sanitizedBody: {}
        },
        response: {
          endpoint: certificateEndpoint,
          httpMethod: 'GET',
          httpStatus: 200,
          latencyMs: 27,
          sanitizedHeaders: { 'content-type': 'application/json' },
          sanitizedBody: {
            erro: false,
            objetoResposta: [
              {
                cerCodigo: 9988,
                cerHashCode: 'cdf-hash-audit-001',
                cerData: '19-04-2026',
                cerDataInicial: '01-04-2026',
                cerDataFinal: '19-04-2026',
                cerObservacao: 'consulta auditada',
                parceiroDestinador: {
                  parCodigo: 176163,
                  parDescricao: 'Nova IT Ambiental'
                },
                tipoCertificadoDestinacao: {
                  tcdCodigo: 1,
                  tcdDescricao: 'CDF'
                },
                responsavel: {
                  cdrNome: 'Conta CETESB SICAT'
                }
              }
            ]
          },
          data: {
            message: 'consulta auditada',
            items: [
              {
                cerCodigo: 9988,
                cerHashCode: 'cdf-hash-audit-001',
                cerData: '19-04-2026',
                cerDataInicial: '01-04-2026',
                cerDataFinal: '19-04-2026',
                cerObservacao: 'consulta auditada',
                parceiroDestinador: {
                  parCodigo: 176163,
                  parDescricao: 'Nova IT Ambiental'
                },
                tipoCertificadoDestinacao: {
                  tcdCodigo: 1,
                  tcdDescricao: 'CDF'
                },
                responsavel: {
                  cdrNome: 'Conta CETESB SICAT'
                }
              }
            ]
          }
        }
      }),
      printCdfCertificate: async () => {
        throw new Error('printCdfCertificate should not be called in this test');
      }
    });

    try {
      const certificatesResponse = await fetch(
        `${API_BASE}/v1/cdf/certificates?integrationAccountId=${encodeURIComponent(integrationAccountId)}&sessionContextId=${encodeURIComponent(sessionContextId)}&dateFrom=2026-04-01&dateTo=2026-04-19`,
        {
          method: 'GET',
          headers: {
            Authorization: `Bearer ${loginPayload.accessToken}`,
            'X-Correlation-Id': correlationId
          }
        }
      );

      assert.strictEqual(certificatesResponse.status, 200);
      const certificatesPayload = await certificatesResponse.json();

      assert.strictEqual(certificatesPayload.message, 'consulta auditada');
      assert.strictEqual(certificatesPayload.totalItems, 1);
      assert.strictEqual(certificatesPayload.items[0]?.documentId, 'cdf-hash-audit-001');

      const auditResponse = await fetch(`${API_BASE}/v1/audit/${encodeURIComponent(correlationId)}`);
      assert.strictEqual(auditResponse.status, 200);
      const auditPayload = await auditResponse.json();

      assert.strictEqual(auditPayload.correlationId, correlationId);
      assert.strictEqual(auditPayload.entityType, 'cdf.certificate.search');
      assert.strictEqual(auditPayload.entries.length, 1);
      assert.strictEqual(auditPayload.entries[0]?.endpoint, certificateEndpoint);
      assert.strictEqual(auditPayload.entries[0]?.httpStatus, 200);
      assert.strictEqual(auditPayload.entries[0]?.sanitizedBody?.response?.erro, false);
    } finally {
      setManifestGatewayOverrideForTests(null);
      await query('DELETE FROM audit_logs WHERE correlation_id = $1', [correlationId]);
    }
  });
});

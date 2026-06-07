import { describe, it, before, after } from 'node:test';
import assert from 'node:assert';
import { ensureStartup } from '../../src/bootstrap/startup.js';
import { createApp } from '../../src/app.js';
import { setConfigOverride } from '../../src/lib/config.js';
import { setAuthGatewayOverrideForTests } from '../../src/services/auth-service.js';

/**
 * Testes de contrato para endpoints de autenticação
 * Valida que POST /v1/auth/login retorna schema esperado do OpenAPI
 */

let API_BASE = process.env.API_BASE_URL || '';

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

const FIXED_TOKEN = buildJwtTestToken();

describe('Auth Contract Tests', () => {
  let server;

  before(async () => {
    const externalApiBaseUrl = process.env.API_BASE_URL;

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
          const document = path.split('/').pop() || '31913781000139';
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
                  paaEmail: 'flavio_padilha_neto@msn.com',
                  paaCpf: '12345678901'
                }
              }
            }
          };
        }

        if (path === '/api/mtr/carregaDadosLogin') {
          const loginValue = typeof body.login === 'string' ? body.login : '31913781000139';
          const isInvalid = loginValue === '00000000000000';
          if (isInvalid) {
            return {
              response: {
                data: {
                  erro: true,
                  mensagem: 'Erro no login: Email ou senha inválidos.'
                }
              }
            };
          }

          return {
            response: {
              data: {
                erro: false,
                objetoResposta: {
                  token: FIXED_TOKEN,
                  paaCodigo: 'usr_mock_001',
                  paaNome: 'Flavio Padilha (Contract)',
                  email: 'flavio_padilha_neto@msn.com',
                  jurCnp: loginValue,
                  parCodigo: '176163',
                  parDescricao: 'Nova IT (Contract)',
                  isGerador: true
                }
              }
            }
          };
        }

        throw new Error(`Unexpected auth gateway request in auth-contract.test: ${path}`);
      }
    }));

    if (externalApiBaseUrl) {
      API_BASE = externalApiBaseUrl;
    } else {
      await ensureStartup();
      const app = createApp();
      server = await new Promise((resolve) => {
        const instance = app.listen(0, '127.0.0.1', () => resolve(instance));
      });
      const address = server.address();
      API_BASE = `http://127.0.0.1:${address.port}`;
    }
  });

  after(async () => {
    setAuthGatewayOverrideForTests(null);
    if (server) {
      await new Promise(resolve => server.close(resolve));
    }
  });

  it('POST /v1/auth/login retorna 200 com schema válido (credenciais válidas)', async () => {
    const payload = {
      document: '31913781000139',
      password: '2dlzft',
      recaptchaToken: '' // opcional
    };

    const response = await fetch(`${API_BASE}/v1/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload)
    });

    const data = await response.json();

    assert.strictEqual(response.status, 200, 'Status deve ser 200');
    assert.ok(data.token, 'token deve estar presente');
    assert.ok(data.expiresAt, 'expiresAt deve estar presente');
    assert.ok(data.user, 'user deve estar presente');
    assert.ok(data.partner, 'partner deve estar presente');

    // Validar estrutura de user
    assert.ok(data.user.userId || data.user.accessCode, 'user.userId ou user.accessCode deve estar presente');
    assert.ok(data.user.name, 'user.name deve estar presente');
    assert.ok(data.user.email, 'user.email deve estar presente');
    assert.ok(data.user.document, 'user.document deve estar presente');

    // Validar estrutura de partner
    assert.ok(data.partner.partnerCode || data.partner.code, 'partner.partnerCode ou partner.code deve estar presente');
    assert.ok(data.partner.description, 'partner.description deve estar presente');
    assert.ok(data.partner.document, 'partner.document deve estar presente');

    // Validar token JWT
    assert.ok(data.token.startsWith('eyJ'), 'token deve ser JWT válido');

    // Validar expiresAt é data ISO futura
    const expiresAt = new Date(data.expiresAt);
    assert.ok(expiresAt > new Date(), 'expiresAt deve ser no futuro');
  });

  it('POST /v1/auth/login aceita recaptchaToken como opcional', async () => {
    const payloadSemRecaptcha = {
      document: '31913781000139',
      password: '2dlzft'
    };

    const response = await fetch(`${API_BASE}/v1/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payloadSemRecaptcha)
    });

    assert.strictEqual(response.status, 200, 'Deve aceitar request sem recaptchaToken');
    const data = await response.json();
    assert.ok(data.token, 'Deve retornar token mesmo sem recaptchaToken');
  });

  it('POST /v1/auth/login retorna 400 quando document está ausente', async () => {
    const payload = {
      password: '2dlzft'
    };

    const response = await fetch(`${API_BASE}/v1/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload)
    });

    const data = await response.json();

    assert.strictEqual(response.status, 400, 'Status deve ser 400');
    assert.strictEqual(data.type, 'about:blank', 'type deve ser about:blank');
    assert.strictEqual(data.title, 'Bad Request', 'title deve ser Bad Request');
    assert.ok(data.detail, 'detail deve estar presente');
    assert.strictEqual(data.code, 'MISSING_CREDENTIALS', 'code deve ser MISSING_CREDENTIALS');
  });

  it('POST /v1/auth/login retorna 400 quando password está ausente', async () => {
    const payload = {
      document: '31913781000139'
    };

    const response = await fetch(`${API_BASE}/v1/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload)
    });

    const data = await response.json();

    assert.strictEqual(response.status, 400, 'Status deve ser 400');
    assert.strictEqual(data.code, 'MISSING_CREDENTIALS', 'code deve ser MISSING_CREDENTIALS');
  });

  it('POST /v1/auth/login retorna 400 quando credenciais são inválidas (modo mock)', async () => {
    const payload = {
      document: '00000000000000',
      password: 'senhaerrada',
      email: 'flavio_padilha_neto@msn.com'
    };

    const response = await fetch(`${API_BASE}/v1/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload)
    });

    const data = await response.json();
    assert.strictEqual(response.status, 400, 'Status deve ser 400');
    assert.strictEqual(data.type, 'about:blank', 'type deve ser about:blank');
    assert.strictEqual(data.title, 'Bad Request', 'title deve ser Bad Request');
    assert.ok(['INVALID_CREDENTIALS', 'CETESB_AUTH_ERROR'].includes(data.code),
      'code deve ser INVALID_CREDENTIALS ou CETESB_AUTH_ERROR');
  });

  it('POST /v1/auth/login retorna application/problem+json em erros', async () => {
    const payload = { document: '123' }; // sem password

    const response = await fetch(`${API_BASE}/v1/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload)
    });

    const contentType = response.headers.get('content-type');
    assert.ok(
      contentType?.includes('application/problem+json') || contentType?.includes('application/json'),
      'Content-Type deve ser application/problem+json ou application/json em erros'
    );
  });

  it('POST /v1/auth/login valida que expiresAt é ISO 8601', async () => {
    const payload = {
      document: '31913781000139',
      password: '2dlzft'
    };

    const response = await fetch(`${API_BASE}/v1/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload)
    });

    const data = await response.json();
    assert.strictEqual(response.status, 200, 'Status deve ser 200');
    
    // Validar formato ISO 8601
    const isoRegex = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(\.\d{3})?Z$/;
    assert.ok(isoRegex.test(data.expiresAt), 'expiresAt deve estar em formato ISO 8601');
  });

  it('POST /v1/auth/login retorna token JWT válido', async () => {
    const payload = {
      document: '31913781000139',
      password: '2dlzft'
    };

    const response = await fetch(`${API_BASE}/v1/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload)
    });

    const data = await response.json();
    assert.strictEqual(response.status, 200, 'Status deve ser 200');
    
    // JWT deve ter 3 partes separadas por ponto
    const parts = data.token.split('.');
    assert.strictEqual(parts.length, 3, 'JWT deve ter 3 partes (header.payload.signature)');
    
    // Cada parte deve ser base64url
    parts.forEach((part, index) => {
      assert.ok(part.length > 0, `Parte ${index} do JWT não pode ser vazia`);
    });
  });
});

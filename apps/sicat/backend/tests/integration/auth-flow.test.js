import { describe, it, before, after } from 'node:test';
import assert from 'node:assert';
import {
  login,
  getPartnerInfo,
  setAuthGatewayOverrideForTests
} from '../../src/services/auth-service.js';
import { setConfigOverride } from '../../src/lib/config.js';

/**
 * Testes de integração para fluxo de autenticação
 * Validam comportamento do auth-service em modo real com doubles controlados de fetch.
 */

describe('Auth Flow Integration Tests', () => {
  const fixedToken = [
    Buffer.from(JSON.stringify({ alg: 'HS256', typ: 'JWT' })).toString('base64url'),
    Buffer.from(JSON.stringify({ sub: '176163,333948', role: 1, exp: 4102444800, iat: 1704067200 })).toString('base64url'),
    'signature'
  ].join('.');

  before(() => {
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
          return {
            response: {
              data: {
                erro: false,
                objetoResposta: {
                  token: fixedToken,
                  paaCodigo: 'usr_mock_001',
                  paaNome: 'Flavio Padilha (Integration)',
                  email: 'flavio_padilha_neto@msn.com',
                  jurCnp: loginValue,
                  parCodigo: '176163',
                  parDescricao: 'Nova IT (Integration)',
                  isGerador: true
                }
              }
            }
          };
        }

        throw new Error(`Unexpected gateway request in auth-flow.test: ${path}`);
      }
    }));
  });

  after(() => {
    setAuthGatewayOverrideForTests(null);
  });

  describe('login()', () => {
    it('deve retornar token JWT com credenciais válidas', async () => {
      const payload = {
        document: '31913781000139',
        password: '2dlzft',
        recaptchaToken: ''
      };

      const result = await login(payload);

      assert.ok(result.token, 'token deve estar presente');
      assert.ok(result.expiresAt, 'expiresAt deve estar presente');
      assert.ok(result.user, 'user deve estar presente');
      assert.ok(result.partner, 'partner deve estar presente');
    });

    it('deve retornar dados de usuário populados', async () => {
      const payload = {
        document: '31913781000139',
        password: 'qualquersenha'
      };

      const result = await login(payload);

      assert.strictEqual(result.user.userId, 'usr_mock_001', 'userId deve ser mockado');
      assert.strictEqual(result.user.name, 'Flavio Padilha (Integration)', 'name deve refletir o retorno mockado do gateway');
      assert.strictEqual(result.user.email, 'flavio_padilha_neto@msn.com', 'email deve ser mockado');
      assert.strictEqual(result.user.document, payload.document, 'document deve corresponder ao input');
    });

    it('deve retornar dados de parceiro populados', async () => {
      const payload = {
        document: '31913781000139',
        password: '2dlzft'
      };

      const result = await login(payload);

      assert.strictEqual(result.partner.partnerCode, '176163', 'partnerCode deve ser mockado');
      assert.strictEqual(result.partner.description, 'Nova IT (Integration)', 'description deve refletir o retorno mockado do gateway');
      assert.strictEqual(result.partner.document, payload.document, 'document deve corresponder ao input');
      assert.strictEqual(result.partner.accountType, 'generator', 'accountType deve ser derivado do payload CETESB');
    });

    it('deve retornar token JWT fixo do gateway mockado', async () => {
      const payload = {
        document: '31913781000139',
        password: '2dlzft'
      };

      const result = await login(payload);

      assert.strictEqual(result.token, fixedToken, 'token mockado deve ser fixo');
    });

    it('deve retornar expiresAt no futuro', async () => {
      const payload = {
        document: '31913781000139',
        password: '2dlzft'
      };

      const result = await login(payload);

      const expiresAt = new Date(result.expiresAt);
      const now = new Date();
      assert.ok(expiresAt > now, 'expiresAt deve ser no futuro');
    });

    it('deve aceitar recaptchaToken como opcional', async () => {
      const payloadSemRecaptcha = {
        document: '31913781000139',
        password: '2dlzft'
      };

      const result = await login(payloadSemRecaptcha);

      assert.ok(result.token, 'Deve retornar token sem recaptchaToken');
    });

    it('deve aceitar recaptchaToken vazio', async () => {
      const payloadComRecaptchaVazio = {
        document: '31913781000139',
        password: '2dlzft',
        recaptchaToken: ''
      };

      const result = await login(payloadComRecaptchaVazio);

      assert.ok(result.token, 'Deve retornar token com recaptchaToken vazio');
    });

    it('deve aceitar recaptchaToken null', async () => {
      const payloadComRecaptchaNull = {
        document: '31913781000139',
        password: '2dlzft',
        recaptchaToken: null
      };

      const result = await login(payloadComRecaptchaNull);

      assert.ok(result.token, 'Deve retornar token com recaptchaToken null');
    });

    it('deve rejeitar quando document está ausente', async () => {
      const payload = {
        password: '2dlzft'
      };

      await assert.rejects(
        async () => await login(payload),
        {
          name: 'AppError',
          status: 400,
          code: 'MISSING_CREDENTIALS'
        },
        'Deve rejeitar quando document está ausente'
      );
    });

    it('deve rejeitar quando password está ausente', async () => {
      const payload = {
        document: '31913781000139'
      };

      await assert.rejects(
        async () => await login(payload),
        {
          name: 'AppError',
          status: 400,
          code: 'MISSING_CREDENTIALS'
        },
        'Deve rejeitar quando password está ausente'
      );
    });

    it('deve rejeitar quando payload está vazio', async () => {
      await assert.rejects(
        async () => await login({}),
        {
          name: 'AppError',
          status: 400,
          code: 'MISSING_CREDENTIALS'
        },
        'Deve rejeitar quando payload está vazio'
      );
    });

    it('deve preservar document no response', async () => {
      const testDocument = '12345678000190';
      const payload = {
        document: testDocument,
        password: 'senha123'
      };

      const result = await login(payload);

      assert.strictEqual(result.user.document, testDocument, 'user.document deve corresponder ao input');
      assert.strictEqual(result.partner.document, testDocument, 'partner.document deve corresponder ao input');
    });

    it('deve retornar structure idêntica ao example file', async () => {
      const payload = {
        document: '31913781000139',
        password: '2dlzft'
      };

      const result = await login(payload);

      // Validar que campos obrigatórios existem
      const requiredTopLevelFields = ['token', 'expiresAt', 'user', 'partner'];
      requiredTopLevelFields.forEach(field => {
        assert.ok(result[field], `Campo ${field} deve estar presente`);
      });

      // Validar que user tem campos esperados
      assert.ok(result.user.userId, 'user.userId deve estar presente');
      assert.ok(result.user.name, 'user.name deve estar presente');
      assert.ok(result.user.email, 'user.email deve estar presente');
      assert.ok(result.user.document, 'user.document deve estar presente');

      // Validar que partner tem campos esperados
      assert.ok(result.partner.partnerCode, 'partner.partnerCode deve estar presente');
      assert.ok(result.partner.description, 'partner.description deve estar presente');
      assert.ok(result.partner.document, 'partner.document deve estar presente');
    });
  });

  describe('getPartnerInfo()', () => {
    it('deve retornar informações de parceiro por documento', async () => {
      const document = '31913781000139';

      const result = await getPartnerInfo(document);

      assert.strictEqual(result.partnerCode, 176163);
      assert.strictEqual(result.description, 'Nova IT');
      assert.strictEqual(result.document, document);
      assert.strictEqual(result.state.abbreviation, 'SP');
      assert.strictEqual(result.registeredUsers.length, 1);
    });

    it('deve rejeitar quando document está ausente', async () => {
      await assert.rejects(
        async () => await getPartnerInfo(''),
        {
          name: 'AppError',
          status: 400,
          code: 'MISSING_DOCUMENT'
        },
        'Deve rejeitar quando document está vazio'
      );
    });

    it('deve rejeitar quando document é null', async () => {
      await assert.rejects(
        async () => await getPartnerInfo(null),
        {
          name: 'AppError',
          status: 400,
          code: 'MISSING_DOCUMENT'
        },
        'Deve rejeitar quando document é null'
      );
    });
  });
});

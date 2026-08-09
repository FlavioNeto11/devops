import { describe, it, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { config, setConfigOverride } from '../../src/lib/config.js';
import { authMiddleware } from '../../src/middlewares/auth.js';
import { errorHandlerMiddleware } from '../../src/middlewares/error-handler.js';
import { isChannelRequestUrl, captureChannelRawBody } from '../../src/lib/raw-body.js';
import { setWhatsAppProviderOverrideForTests } from '../../src/services/conversation/channel/whatsapp/index.js';
import {
  setWhatsAppInboundDependenciesForTests,
  resetWhatsAppInboundLimitersForTests
} from '../../src/services/conversation/channel/whatsapp/whatsapp-inbound-service.js';
import {
  WHATSAPP_WEBHOOK_PATH,
  handleWhatsAppWebhookInbound,
  handleWhatsAppWebhookVerification,
  resetChannelWebhookLimitersForTests
} from '../../src/routes/channel-webhook-routes.js';

/**
 * SUPERFÍCIE PÚBLICA do canal (fase 3 da cadeia `whatsapp-channel-sicat`).
 *
 * Não existe `supertest` no `backend/package.json` e nenhum teste desta fase boota o app real — os
 * handlers são exportados e exercitados com `req`/`res` falsos.
 *
 * Critério de aceitação de cada caso: **remova mentalmente a guarda que ele protege e o teste tem de
 * QUEBRAR.** Os doubles aqui são fonte de dado e espião de argumento; nenhum reimplementa a decisão
 * que o código deveria estar tomando (um double que concorda consigo mesmo não testa nada).
 */

const HERE = path.dirname(fileURLToPath(import.meta.url));
const BACKEND_ROOT = path.resolve(HERE, '../..');

/* -------------------------------------------------------------------------------------------- */
/* Harness                                                                                       */
/* -------------------------------------------------------------------------------------------- */

function createRes() {
  const res = {
    statusCode: null,
    body: undefined,
    contentType: null,
    ended: false,
    jsonUsed: false,
    locals: {}
  };
  res.status = (code) => { res.statusCode = code; return res; };
  res.type = (value) => { res.contentType = value; return res; };
  res.send = (value) => { res.body = value; res.ended = true; return res; };
  res.json = (value) => { res.body = value; res.jsonUsed = true; res.ended = true; return res; };
  res.end = () => { res.ended = true; return res; };
  return res;
}

function createReq(overrides = {}) {
  return {
    method: 'POST',
    url: WHATSAPP_WEBHOOK_PATH,
    // O Traefik strippa `/sicat/api`, então o processo enxerga o caminho na raiz — é este o valor
    // que os predicados de caminho recebem em produção.
    originalUrl: WHATSAPP_WEBHOOK_PATH,
    path: WHATSAPP_WEBHOOK_PATH,
    query: {},
    body: {},
    headers: {},
    protocol: 'http',
    get: () => 'dev.nvit.com.br',
    header: () => undefined,
    ...overrides
  };
}

/**
 * Provedor falso. `verifyWebhookSignature` devolve um booleano DECLARADO pelo caso e registra o
 * `input` — é o registro do `input.url` que prova de onde veio a URL do HMAC. `parseInboundMessages`
 * devolve a lista que o caso declarou: dado, não lógica.
 */
function createFakeProvider(options = {}) {
  const calls = { verify: [], parse: [], sendText: [], challenge: [] };
  return {
    name: options.name || 'meta',
    calls,
    verifyWebhookSignature(input) {
      calls.verify.push(input);
      return options.verified !== false;
    },
    parseInboundMessages({ body }) {
      calls.parse.push(body);
      return options.messages ? options.messages.slice() : [];
    },
    async sendText(input) {
      calls.sendText.push(input);
      return { providerMessageId: 'wamid.sent' };
    },
    async sendMedia() { throw new Error('sendMedia não deveria ser chamado nesta fase'); },
    async sendTemplate() { throw new Error('sendTemplate não deveria ser chamado nesta fase'); },
    handleVerificationChallenge(query) {
      calls.challenge.push(query);
      return Object.prototype.hasOwnProperty.call(options, 'challenge') ? options.challenge : null;
    }
  };
}

function buildInboundMessage(overrides = {}) {
  return {
    providerMessageId: 'wamid.001',
    from: '5511987654321',
    to: '5511300000000',
    timestamp: new Date().toISOString(),
    type: 'text',
    rawType: 'text',
    text: 'meus MTRs de hoje',
    media: null,
    ...overrides
  };
}

function buildVerifiedLink(overrides = {}) {
  return {
    id: 'cclk_1',
    userId: 'usr_1',
    externalUserKey: '5511987654321',
    verificationStatus: 'verified',
    integrationAccountId: 'iac_de_outra_pessoa',
    ...overrides
  };
}

/**
 * Harness de dependências: tabela de vínculos indexada pela chave EXATA + coletor de inserts.
 * Nenhuma canonicalização acontece aqui — se o código sob teste procurar pela chave errada, não acha.
 */
function installDependencies({ links = [], insertBehaviour } = {}) {
  const table = new Map(links.map((link) => [link.externalUserKey, link]));
  const state = { lookups: [], inserted: [] };

  setWhatsAppInboundDependenciesForTests({
    findConversationChannelLink: async (channelType, externalUserKey) => {
      state.lookups.push({ channelType, externalUserKey });
      return table.get(externalUserKey) || null;
    },
    insertJob: async (input) => {
      if (insertBehaviour) {
        const outcome = insertBehaviour(input, state);
        if (outcome instanceof Error) throw outcome;
      }
      state.inserted.push(input);
      return { jobId: input.jobId };
    }
  });

  return state;
}

const OVERRIDDEN_KEYS = [
  'authRequired',
  'whatsappProvider',
  'whatsappBusinessNumber',
  'whatsappUnlinkedNoticeEnabled',
  'whatsappInboundGlobalPerMinute',
  'whatsappInboundMaxMessagesPerPost'
];
let savedConfig = {};

beforeEach(() => {
  savedConfig = Object.fromEntries(OVERRIDDEN_KEYS.map((key) => [key, config[key]]));
  setWhatsAppProviderOverrideForTests(null);
  setWhatsAppInboundDependenciesForTests(null);
  resetWhatsAppInboundLimitersForTests();
  resetChannelWebhookLimitersForTests();
});

afterEach(() => {
  for (const key of OVERRIDDEN_KEYS) setConfigOverride(key, savedConfig[key]);
  setWhatsAppProviderOverrideForTests(null);
  setWhatsAppInboundDependenciesForTests(null);
  resetWhatsAppInboundLimitersForTests();
  resetChannelWebhookLimitersForTests();
});

/* -------------------------------------------------------------------------------------------- */
/* 1. Isenção do authMiddleware                                                                  */
/* -------------------------------------------------------------------------------------------- */

describe('authMiddleware — isenção da família /v1/channels/', () => {
  it('deixa passar o webhook sem Authorization quando AUTH_REQUIRED=true', () => {
    // Sem a isenção isto responde 401 SÓ EM PRODUÇÃO (`authRequired` tem default `false`), e o
    // sintoma remoto é "a Meta desativou meu webhook".
    setConfigOverride('authRequired', true);
    const req = createReq({ header: () => undefined });
    const res = createRes();
    let nextCalled = 0;

    authMiddleware(req, res, () => { nextCalled += 1; });

    assert.equal(nextCalled, 1);
    assert.equal(res.statusCode, null, 'nenhuma resposta deveria ter sido escrita');
  });

  it('CONTROLE NEGATIVO: a superfície autenticada de vínculo continua exigindo Bearer', () => {
    // Prova que o teste acima não passa porque o middleware virou no-op. `/v1/sicat/channel-links` é
    // o cadastro do número pelo próprio dono (fase 2) e NUNCA pode ser isentado.
    setConfigOverride('authRequired', true);
    const req = createReq({ path: '/v1/sicat/channel-links', header: () => undefined });
    const res = createRes();
    let nextCalled = 0;

    authMiddleware(req, res, () => { nextCalled += 1; });

    assert.equal(nextCalled, 0);
    assert.equal(res.statusCode, 401);
  });

  it('a isenção é comparada em minúsculas (o Express roteia case-insensitive)', () => {
    setConfigOverride('authRequired', true);
    const req = createReq({ path: '/V1/Channels/whatsapp/webhook', header: () => undefined });
    const res = createRes();
    let nextCalled = 0;

    authMiddleware(req, res, () => { nextCalled += 1; });

    assert.equal(nextCalled, 1);
  });
});

/* -------------------------------------------------------------------------------------------- */
/* 2. GET — desafio de verificação                                                                */
/* -------------------------------------------------------------------------------------------- */

describe('GET /v1/channels/whatsapp/webhook', () => {
  it('canal desligado responde 404 vazio (a rota se comporta como inexistente)', async () => {
    setWhatsAppProviderOverrideForTests(null);
    setConfigOverride('whatsappProvider', 'disabled');
    const res = createRes();

    await handleWhatsAppWebhookVerification(createReq({ method: 'GET' }), res);

    assert.equal(res.statusCode, 404);
    assert.equal(res.body, undefined, 'nada pode vazar no corpo — nem o nome das env vars que faltam');
    setConfigOverride('whatsappProvider', undefined);
  });

  it('ecoa o challenge CRU em text/plain (res.json reprovaria a verificação do Meta)', async () => {
    setWhatsAppProviderOverrideForTests(createFakeProvider({ challenge: 'abc-123_XYZ' }));
    const res = createRes();

    await handleWhatsAppWebhookVerification(createReq({ method: 'GET' }), res);

    assert.equal(res.statusCode, 200);
    assert.equal(res.contentType, 'text/plain');
    assert.equal(res.body, 'abc-123_XYZ');
    assert.equal(res.jsonUsed, false, 'o Meta compara byte a byte; as aspas do JSON quebram');
  });

  it('challenge fora do padrão (HTML) não é refletido — 403', async () => {
    setWhatsAppProviderOverrideForTests(createFakeProvider({ challenge: '<script>alert(1)</script>' }));
    const res = createRes();

    await handleWhatsAppWebhookVerification(createReq({ method: 'GET' }), res);

    assert.equal(res.statusCode, 403);
    assert.equal(res.body, undefined);
  });

  it('token que não confere (provider devolve null) — 403 vazio', async () => {
    setWhatsAppProviderOverrideForTests(createFakeProvider({ challenge: null }));
    const res = createRes();

    await handleWhatsAppWebhookVerification(createReq({ method: 'GET' }), res);

    assert.equal(res.statusCode, 403);
  });
});

/* -------------------------------------------------------------------------------------------- */
/* 3. POST — assinatura                                                                           */
/* -------------------------------------------------------------------------------------------- */

describe('POST /v1/channels/whatsapp/webhook — assinatura', () => {
  it('assinatura inválida → 403 e ZERO jobs, sem tocar o banco', async () => {
    const provider = createFakeProvider({ verified: false, messages: [buildInboundMessage()] });
    setWhatsAppProviderOverrideForTests(provider);
    const state = installDependencies({ links: [buildVerifiedLink()] });
    const res = createRes();

    await handleWhatsAppWebhookInbound(createReq({ body: { entry: [] } }), res);

    assert.equal(res.statusCode, 403);
    assert.equal(state.inserted.length, 0, 'nenhum job pode ser enfileirado');
    assert.equal(state.lookups.length, 0, 'nenhuma leitura de banco antes da assinatura');
    assert.equal(provider.calls.parse.length, 0, 'nem sequer o parse das mensagens');
  });

  it('a URL do HMAC vem SÓ de config.whatsappWebhookUrl, nunca reconstruída do request', async () => {
    // Reconstruir de `req.protocol`/`req.get('host')`/`req.originalUrl` daria esquema errado
    // (`trust proxy` não está setado) e caminho errado (o Traefik strippa `/sicat/api`).
    const provider = createFakeProvider({ verified: true, messages: [] });
    setWhatsAppProviderOverrideForTests(provider);
    installDependencies();
    const req = createReq({ body: {} });

    await handleWhatsAppWebhookInbound(req, createRes());

    assert.equal(provider.calls.verify.length, 1);
    const usedUrl = provider.calls.verify[0].url;
    assert.equal(usedUrl, config.whatsappWebhookUrl);
    assert.notEqual(usedUrl, req.originalUrl);
    assert.ok(!usedUrl.startsWith('http://'), 'reconstrução de request produziria http:// (X-Forwarded-Proto é ignorado)');
    assert.ok(!usedUrl.includes(`${req.protocol}://${req.get('host')}`), 'nada derivado de req pode aparecer');
  });

  it('WHATSAPP_WEBHOOK_PATH é sufixo EXATO de config.whatsappWebhookUrl', () => {
    // O Twilio assina a URL CONFIGURADA por inteiro. Montar a rota noutro caminho quebra o HMAC em
    // silêncio e só em produção.
    assert.ok(
      config.whatsappWebhookUrl.endsWith(WHATSAPP_WEBHOOK_PATH),
      `${config.whatsappWebhookUrl} deve terminar em ${WHATSAPP_WEBHOOK_PATH}`
    );
  });

  it('o rawBody capturado pelo body-parser é repassado ao verificador', async () => {
    const provider = createFakeProvider({ verified: true });
    setWhatsAppProviderOverrideForTests(provider);
    installDependencies();
    const raw = Buffer.from('{"entry":[]}');

    await handleWhatsAppWebhookInbound(createReq({ rawBody: raw, body: { entry: [] } }), createRes());

    assert.ok(Buffer.isBuffer(provider.calls.verify[0].rawBody));
    assert.equal(provider.calls.verify[0].rawBody.toString(), raw.toString());
  });
});

/* -------------------------------------------------------------------------------------------- */
/* 4. POST — absorção de falha e regra estreita de 500                                            */
/* -------------------------------------------------------------------------------------------- */

describe('POST /v1/channels/whatsapp/webhook — códigos de resposta', () => {
  it('canal desligado → 404 vazio', async () => {
    setWhatsAppProviderOverrideForTests(null);
    setConfigOverride('whatsappProvider', 'disabled');
    const res = createRes();

    await handleWhatsAppWebhookInbound(createReq(), res);

    assert.equal(res.statusCode, 404);
    setConfigOverride('whatsappProvider', undefined);
  });

  it('recibo de status (lista vazia) → 200 com corpo vazio', async () => {
    setWhatsAppProviderOverrideForTests(createFakeProvider({ messages: [] }));
    installDependencies();
    const res = createRes();

    await handleWhatsAppWebhookInbound(createReq(), res);

    assert.equal(res.statusCode, 200);
    assert.equal(res.body, undefined, 'JSON aqui rende o erro 12300 no console do Twilio');
    assert.equal(res.jsonUsed, false);
  });

  it('número não vinculado → 200 e ZERO jobs (sem oráculo de enumeração)', async () => {
    setWhatsAppProviderOverrideForTests(createFakeProvider({ messages: [buildInboundMessage()] }));
    const state = installDependencies({ links: [] });
    const res = createRes();

    await handleWhatsAppWebhookInbound(createReq(), res);

    assert.equal(res.statusCode, 200);
    assert.equal(state.inserted.length, 0);
  });

  it('erro SEMÂNTICO de banco → 200 vazio (reentregar não conserta)', async () => {
    setWhatsAppProviderOverrideForTests(createFakeProvider({ messages: [buildInboundMessage()] }));
    const semantic = Object.assign(new Error('violates check constraint'), { code: '23514' });
    const state = installDependencies({ links: [buildVerifiedLink()], insertBehaviour: () => semantic });
    const res = createRes();

    await handleWhatsAppWebhookInbound(createReq(), res);

    assert.equal(res.statusCode, 200);
    assert.equal(state.inserted.length, 0);
  });

  it('zero enfileirados + falha de conexão → 500', async () => {
    setWhatsAppProviderOverrideForTests(createFakeProvider({ messages: [buildInboundMessage()] }));
    const outage = Object.assign(new Error('connection refused'), { code: 'ECONNREFUSED' });
    installDependencies({ links: [buildVerifiedLink()], insertBehaviour: () => outage });
    const res = createRes();

    await handleWhatsAppWebhookInbound(createReq(), res);

    assert.equal(res.statusCode, 500, 'é o único caso em que a reentrega do provedor é uma FEATURE');
  });

  it('lote PARCIAL — uma entrou, a outra caiu por conexão → 500 (a que caiu não pode sumir)', async () => {
    // Este caso já foi o inverso: respondia 200 e a mensagem perdida NUNCA era reentregue — a
    // pergunta da pessoa evaporava sem rastro nenhum. Reentregar o lote é seguro porque o `unique` de
    // `jobs.command_id` transforma a reentrega do que já gravou num no-op.
    const messages = [
      buildInboundMessage({ providerMessageId: 'wamid.a' }),
      buildInboundMessage({ providerMessageId: 'wamid.b' })
    ];
    setWhatsAppProviderOverrideForTests(createFakeProvider({ messages }));
    const outage = Object.assign(new Error('connection refused'), { code: 'ECONNREFUSED' });
    const state = installDependencies({
      links: [buildVerifiedLink()],
      insertBehaviour: (_input, current) => (current.inserted.length === 0 ? null : outage)
    });
    const res = createRes();

    await handleWhatsAppWebhookInbound(createReq(), res);

    assert.equal(state.inserted.length, 1, 'o que entrou continua na fila');
    assert.equal(res.statusCode, 500, 'sem o 500 a mensagem que caiu por conexão é perdida para sempre');
  });

  it('CONTROLE NEGATIVO: lote parcial com falha SEMÂNTICA continua 200 (Meta desativa webhook)', async () => {
    const messages = [
      buildInboundMessage({ providerMessageId: 'wamid.a' }),
      buildInboundMessage({ providerMessageId: 'wamid.b' })
    ];
    setWhatsAppProviderOverrideForTests(createFakeProvider({ messages }));
    const semantic = Object.assign(new Error('violates check constraint'), { code: '23514' });
    const state = installDependencies({
      links: [buildVerifiedLink()],
      insertBehaviour: (_input, current) => (current.inserted.length === 0 ? null : semantic)
    });
    const res = createRes();

    await handleWhatsAppWebhookInbound(createReq(), res);

    assert.equal(state.inserted.length, 1);
    assert.equal(res.statusCode, 200, 'reentregar não conserta erro semântico');
  });

  it('teto global da rota estourado → 200 vazio (NUNCA 429) e nada enfileirado', async () => {
    setConfigOverride('whatsappInboundGlobalPerMinute', 1);
    resetChannelWebhookLimitersForTests();
    setWhatsAppProviderOverrideForTests(createFakeProvider({ messages: [buildInboundMessage()] }));
    const state = installDependencies({ links: [buildVerifiedLink()] });

    const first = createRes();
    await handleWhatsAppWebhookInbound(createReq(), first);
    const second = createRes();
    await handleWhatsAppWebhookInbound(createReq(), second);

    assert.equal(first.statusCode, 200);
    assert.equal(second.statusCode, 200, 'não-2xx sustentado faz o Meta desativar o webhook');
    assert.equal(state.inserted.length, 1, 'a segunda leva foi descartada');
  });

  it('o teto global só é consultado DEPOIS da assinatura (senão seria oráculo grátis)', async () => {
    setConfigOverride('whatsappInboundGlobalPerMinute', 1);
    resetChannelWebhookLimitersForTests();
    const provider = createFakeProvider({ verified: false, messages: [buildInboundMessage()] });
    setWhatsAppProviderOverrideForTests(provider);
    installDependencies({ links: [buildVerifiedLink()] });

    // Duas requisições FORJADAS não podem gastar a cota de tráfego legítimo.
    await handleWhatsAppWebhookInbound(createReq(), createRes());
    await handleWhatsAppWebhookInbound(createReq(), createRes());

    const legit = createFakeProvider({ verified: true, messages: [buildInboundMessage()] });
    setWhatsAppProviderOverrideForTests(legit);
    const state = installDependencies({ links: [buildVerifiedLink()] });
    const res = createRes();
    await handleWhatsAppWebhookInbound(createReq(), res);

    assert.equal(res.statusCode, 200);
    assert.equal(state.inserted.length, 1, 'a cota não foi consumida por tráfego forjado');
  });
});

/* -------------------------------------------------------------------------------------------- */
/* 5. errorHandlerMiddleware — ramo de canal                                                      */
/* -------------------------------------------------------------------------------------------- */

describe('errorHandlerMiddleware — corpo inválido em rota de canal', () => {
  it('JSON malformado em /v1/channels/ vira 200 vazio, não 400 problem+json', () => {
    // O `express.json` GLOBAL lança ANTES da rota; sem este ramo o Meta reentrega por dias.
    const err = Object.assign(new SyntaxError('Unexpected token'), { type: 'entity.parse.failed', body: '{oops', status: 400 });
    const res = createRes();

    errorHandlerMiddleware(err, createReq(), res, () => {});

    assert.equal(res.statusCode, 200);
    assert.equal(res.jsonUsed, false);
  });

  it('corpo acima do limite em /v1/channels/ vira 200 vazio', () => {
    const err = Object.assign(new Error('request entity too large'), { type: 'entity.too.large', status: 413 });
    const res = createRes();

    errorHandlerMiddleware(err, createReq(), res, () => {});

    assert.equal(res.statusCode, 200);
  });

  it('CONTROLE NEGATIVO: o mesmo erro fora de /v1/channels/ continua problem+json', () => {
    const err = Object.assign(new SyntaxError('Unexpected token'), { type: 'entity.parse.failed', body: '{oops', status: 400 });
    const res = createRes();

    errorHandlerMiddleware(err, createReq({ originalUrl: '/v1/manifestos' }), res, () => {});

    assert.equal(res.statusCode, 400);
    assert.equal(res.jsonUsed, true);
  });

  it('CONTROLE NEGATIVO: erro de negócio EM /v1/channels/ não é mascarado como 200', () => {
    const err = Object.assign(new Error('boom'), { status: 500 });
    const res = createRes();

    errorHandlerMiddleware(err, createReq(), res, () => {});

    assert.equal(res.statusCode, 500);
  });
});

/* -------------------------------------------------------------------------------------------- */
/* 6. Predicado de caminho + captura de rawBody                                                   */
/* -------------------------------------------------------------------------------------------- */

describe('lib/raw-body', () => {
  it('reconhece a família de canal em qualquer caixa', () => {
    assert.equal(isChannelRequestUrl('/v1/channels/whatsapp/webhook'), true);
    assert.equal(isChannelRequestUrl('/V1/Channels/whatsapp/webhook'), true);
    assert.equal(isChannelRequestUrl('/v1/manifestos'), false);
    assert.equal(isChannelRequestUrl(undefined), false);
  });

  it('captura o corpo bruto SÓ nas rotas de canal', () => {
    const channelReq = { url: WHATSAPP_WEBHOOK_PATH };
    captureChannelRawBody(channelReq, {}, Buffer.from('{"a":1}'));
    assert.equal(channelReq.rawBody.toString(), '{"a":1}');

    const otherReq = { url: '/v1/manifestos' };
    captureChannelRawBody(otherReq, {}, Buffer.from('{"a":1}'));
    assert.equal(otherReq.rawBody, undefined, 'reter 2 MB em toda requisição seria custo puro');
  });
});

/* -------------------------------------------------------------------------------------------- */
/* 7. Contrato de FONTE: o side effect terminal nos DOIS pontos do job-runner                      */
/* -------------------------------------------------------------------------------------------- */

describe('job-runner — side effect terminal do canal', () => {
  const source = readFileSync(path.join(BACKEND_ROOT, 'src/workers/job-runner.ts'), 'utf8');

  function extractFunctionBody(name) {
    const marker = `function ${name}(`;
    const start = source.indexOf(marker);
    assert.ok(start >= 0, `função ${name} não encontrada em job-runner.ts`);

    // A lista de parâmetros contém chaves (`Extract<FailureTransition, { action: 'dlq' }>`), então o
    // primeiro `{` do arquivo NÃO é o início do corpo. Fecha-se a lista de parâmetros primeiro.
    const parenStart = source.indexOf('(', start);
    let parenDepth = 0;
    let parenEnd = -1;
    for (let index = parenStart; index < source.length; index += 1) {
      if (source[index] === '(') parenDepth += 1;
      else if (source[index] === ')') {
        parenDepth -= 1;
        if (parenDepth === 0) { parenEnd = index; break; }
      }
    }
    assert.ok(parenEnd > 0, `lista de parâmetros de ${name} não delimitada`);

    const braceStart = source.indexOf('{', parenEnd);
    let depth = 0;
    for (let index = braceStart; index < source.length; index += 1) {
      const char = source[index];
      if (char === '{') depth += 1;
      else if (char === '}') {
        depth -= 1;
        if (depth === 0) return source.slice(braceStart, index + 1);
      }
    }
    throw new Error(`corpo de ${name} não delimitado`);
  }

  it('registrado em handleDlqTransition', () => {
    assert.match(extractFunctionBody('handleDlqTransition'), /applyWhatsAppInboundTerminalFailureSideEffect\(/);
  });

  it('registrado em handleFailedTransition, DENTRO do ramo action === "failed"', () => {
    // Registrar em só um dos dois produz a assimetria mais difícil de enxergar em produção: falha
    // definitiva avisa, DLQ não (ou o inverso).
    const body = extractFunctionBody('handleFailedTransition');
    const branchIndex = body.indexOf("transition.action === 'failed'");
    const callIndex = body.indexOf('applyWhatsAppInboundTerminalFailureSideEffect(');
    assert.ok(branchIndex >= 0, 'ramo de falha definitiva não encontrado');
    assert.ok(callIndex > branchIndex, 'a chamada tem de estar dentro do ramo de falha definitiva');
  });

  it('claimJobs é chamado com a raia resolvida (a raia default não pode ficar inerte por engano)', () => {
    assert.match(source, /claimJobs\(config\.workerBatchSize,\s*\{\s*lane:\s*resolveWorkerLane\(\)\s*\}\)/);
  });
});

import { describe, it, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { config, setConfigOverride } from '../../src/lib/config.js';
import { calculateJobPriority, getRetryConfig } from '../../src/lib/retry.js';
import { patchJobPayload } from '../../src/workers/job-payload-patch.js';
import { resolveWorkerLane, CHANNEL_LANE_OPERATIONS } from '../../src/lib/job-lanes.js';
import { canonicalizeChannelUserKey, maskChannelUserKey } from '../../src/services/conversation/channel/whatsapp/types.js';
import {
  WHATSAPP_INBOUND_ENTITY_TYPE,
  WHATSAPP_INBOUND_OPERATION,
  buildInboundIdempotencyKey,
  classifyInboundMessage,
  ingestWhatsAppWebhook,
  isInfrastructureError,
  isWhatsAppSticker,
  resetWhatsAppInboundLimitersForTests,
  setWhatsAppInboundDependenciesForTests
} from '../../src/services/conversation/channel/whatsapp/whatsapp-inbound-service.js';
import {
  runWhatsAppInboundTurn,
  setWhatsAppTurnDependenciesForTests
} from '../../src/services/conversation/channel/whatsapp/whatsapp-turn-service.js';
import {
  composeStaticWhatsAppReply,
  composeWhatsAppReply,
  WHATSAPP_RATE_LIMIT_NOTICE,
  WHATSAPP_UNLINKED_NOTICE
} from '../../src/services/conversation/channel/whatsapp/whatsapp-reply-composer.js';
import {
  readChannelInboundMetricsForTests,
  resetChannelInboundMetricsForTests
} from '../../src/lib/channel-metrics.js';

/**
 * ADAPTADOR DE CANAL do WhatsApp — recepção (porteiro) e execução (worker).
 *
 * As duas guardas mais caras do módulo estão aqui, e as duas falham em SILÊNCIO se caírem:
 *
 *  1. **canonicalização divergente** — a mensagem chega, não casa com vínculo nenhum, e não há erro
 *     em lugar nenhum. O caso é alimentado pelo fixture COMPARTILHADO
 *     `tests/fixtures/phone-canonicalization.json`, o mesmo que a fase 2 usa para o cadastro: se as
 *     duas pontas divergirem, o fixture acusa;
 *  2. **vínculo `pending` aceito como `verified`** — "pedi um código OTP para o telefone de alguém"
 *     viraria "converso como aquele usuário". O repositório NÃO filtra status e o upsert cria linha
 *     `pending`, então a guarda tem de ser explícita no código.
 *
 * Regra de escrita: nenhum double reimplementa a decisão sob teste. A tabela de vínculos é indexada
 * pela chave EXATA (se o código procurar errado, não acha); os espiões afirmam sobre os ARGUMENTOS
 * passados e sobre a ORDEM das chamadas, nunca sobre um resultado que o próprio double calculou.
 */

const HERE = path.dirname(fileURLToPath(import.meta.url));
const FIXTURE = JSON.parse(
  readFileSync(path.resolve(HERE, '../../../tests/fixtures/phone-canonicalization.json'), 'utf8')
);

/* -------------------------------------------------------------------------------------------- */
/* Harness                                                                                       */
/* -------------------------------------------------------------------------------------------- */

function buildMessage(overrides = {}) {
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

function buildLink(overrides = {}) {
  return {
    id: 'cclk_1',
    userId: 'usr_1',
    externalUserKey: '5511987654321',
    verificationStatus: 'verified',
    // Propositalmente presente e propositalmente ALHEIO: nenhum caminho desta fase pode propagá-lo.
    integrationAccountId: 'iac_de_outra_pessoa',
    ...overrides
  };
}

function createProvider(messages, options = {}) {
  const calls = { sendText: [] };
  return {
    name: options.name || 'meta',
    calls,
    verifyWebhookSignature: () => true,
    parseInboundMessages: () => messages.slice(),
    async sendText(input) {
      calls.sendText.push(input);
      if (options.sendError) throw options.sendError;
      return { providerMessageId: 'wamid.reply' };
    },
    async sendMedia() { throw new Error('não usado'); },
    async sendTemplate() { throw new Error('não usado'); },
    handleVerificationChallenge: () => null
  };
}

function installIngestDependencies({ links = [], insertBehaviour } = {}) {
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

async function ingest(messages, options = {}) {
  const provider = options.provider || createProvider(messages);
  const state = installIngestDependencies(options);
  const summary = await ingestWhatsAppWebhook({
    provider,
    body: {},
    correlationId: 'corr_test',
    now: options.now
  });
  return { summary, state, provider };
}

const OVERRIDDEN_KEYS = [
  'whatsappBusinessNumber',
  'whatsappInboundMaxMessagesPerPost',
  'whatsappInboundMaxAgeSeconds',
  'whatsappAnswerMaxAgeSeconds',
  'whatsappInboundPerLink',
  'whatsappInboundMaxTextChars',
  'whatsappReplyMaxChars',
  'whatsappTurnTimeoutMs',
  'whatsappMaxSendAttempts',
  'whatsappUnlinkedNoticeEnabled'
];
let savedConfig = {};

/**
 * Console capturado em TODOS os casos: a recepção agora loga cada descarte e uma linha-resumo por
 * lote (a rodada anterior era muda por dentro e por fora). Capturar mantém a saída da suíte legível
 * E dá aos casos de observabilidade um alvo real — nenhum double formata a linha no lugar do código.
 */
let capturedLogs = [];
let originalConsole = null;

function logText() {
  return capturedLogs.map((entry) => entry.text).join('\n');
}

beforeEach(() => {
  savedConfig = Object.fromEntries(OVERRIDDEN_KEYS.map((key) => [key, config[key]]));
  capturedLogs = [];
  originalConsole = { info: console.info, warn: console.warn, error: console.error };
  for (const level of ['info', 'warn', 'error']) {
    console[level] = (...args) => { capturedLogs.push({ level, text: args.map((arg) => String(arg)).join(' ') }); };
  }
  setWhatsAppInboundDependenciesForTests(null);
  setWhatsAppTurnDependenciesForTests(null);
  resetWhatsAppInboundLimitersForTests();
  resetChannelInboundMetricsForTests();
});

afterEach(() => {
  for (const key of OVERRIDDEN_KEYS) setConfigOverride(key, savedConfig[key]);
  if (originalConsole) Object.assign(console, originalConsole);
  originalConsole = null;
  setWhatsAppInboundDependenciesForTests(null);
  setWhatsAppTurnDependenciesForTests(null);
  resetWhatsAppInboundLimitersForTests();
  resetChannelInboundMetricsForTests();
});

/* -------------------------------------------------------------------------------------------- */
/* 1. CANONICALIZAÇÃO — pendência 1 da fase 2                                                     */
/* -------------------------------------------------------------------------------------------- */

describe('recepção — canonicalização do `from`', () => {
  it('casa o vínculo quando o usuário cadastrou sem DDI e o provedor reporta com DDI', async () => {
    // Trocar `requireChannelUserKey` por `normalizePhone` faz o lookup usar '11987654321', a tabela
    // devolve `undefined` e ZERO jobs entram na fila — sem erro visível em lugar nenhum.
    const { state } = await ingest(
      [buildMessage({ from: '11987654321' })],
      { links: [buildLink({ externalUserKey: '5511987654321' })] }
    );

    assert.equal(state.lookups.length, 1);
    assert.equal(state.lookups[0].externalUserKey, '5511987654321');
    assert.equal(state.inserted.length, 1);
  });

  it('todos os casos do fixture compartilhado casam o vínculo gravado pelo cadastro', async () => {
    for (const testCase of FIXTURE.cases) {
      resetWhatsAppInboundLimitersForTests();
      const { state } = await ingest(
        [buildMessage({ from: testCase.input, providerMessageId: `wamid.${testCase.expected}` })],
        { links: [buildLink({ externalUserKey: testCase.expected })] }
      );

      // Só faz sentido cobrar o casamento quando a chave é aceitável para vínculo (12–15 dígitos):
      // o fixture também traz entradas que o cadastro recusa.
      const acceptable = testCase.expected.length >= 12 && testCase.expected.length <= 15;
      if (!acceptable) continue;

      assert.equal(
        state.inserted.length,
        1,
        `entrada ${testCase.input} deveria casar o vínculo ${testCase.expected} (${testCase.nota || ''})`
      );
      assert.equal(state.lookups[0].externalUserKey, canonicalizeChannelUserKey(testCase.input, FIXTURE.defaultCountryCode));
    }
  });

  it('telefone inválido é DESCARTE, nunca erro 400 devolvido ao provedor', async () => {
    // `requireChannelUserKey` lança AppError 400; deixar escapar viraria reentrega perpétua.
    const { summary, state } = await ingest(
      [buildMessage({ from: '11' })],
      { links: [buildLink()] }
    );

    assert.equal(summary.dropped.invalid_phone, 1);
    assert.equal(state.inserted.length, 0);
  });
});

/* -------------------------------------------------------------------------------------------- */
/* 2. VÍNCULO VERIFICADO                                                                          */
/* -------------------------------------------------------------------------------------------- */

describe('recepção — guarda de vínculo verificado', () => {
  it('vínculo `pending` NÃO enfileira (o repo não filtra status; o upsert cria pending)', async () => {
    const { summary, state } = await ingest(
      [buildMessage()],
      { links: [buildLink({ verificationStatus: 'pending' })] }
    );

    // Afirma também que o fluxo CHEGOU ao ponto em que enfileiraria: a linha FOI encontrada.
    assert.equal(state.lookups.length, 1, 'o lookup precisa ter acontecido');
    assert.equal(state.inserted.length, 0, 'iniciar um OTP contra terceiro não pode dar acesso conversacional');
    assert.equal(summary.dropped.link_pending, 1);
  });

  it('vínculo verificado sem userId (linha órfã) também não enfileira', async () => {
    const { state } = await ingest([buildMessage()], { links: [buildLink({ userId: null })] });
    assert.equal(state.inserted.length, 0);
  });

  it('número desconhecido não enfileira e não distingue do `pending` na saída', async () => {
    const { summary, state } = await ingest([buildMessage()], { links: [] });
    assert.equal(state.inserted.length, 0);
    assert.equal(summary.dropped.unlinked, 1);
  });
});

/* -------------------------------------------------------------------------------------------- */
/* 3. Contrato do job enfileirado                                                                 */
/* -------------------------------------------------------------------------------------------- */

describe('recepção — contrato do job', () => {
  it('grava operação, entityType e chaves de idempotência corretas', async () => {
    const { state } = await ingest([buildMessage()], { links: [buildLink()] });
    const job = state.inserted[0];

    assert.equal(job.operation, WHATSAPP_INBOUND_OPERATION);
    assert.equal(job.entityType, WHATSAPP_INBOUND_ENTITY_TYPE);
    // `jobs.command_id` é `unique` GLOBAL — barreira permanente de reentrega, ao contrário do índice
    // parcial que `insertJobDeduplicated` usaria (só cobre queued|running|retry_wait). O valor é o
    // sha256 da chave de idempotência, nunca ela mesma (ver o caso de vazamento logo abaixo).
    assert.match(job.commandId, /^wa:whatsapp:[0-9a-f]{64}$/);
    assert.equal(job.correlationId, 'corr_test');
    assert.equal(job.status, 'queued');
  });

  it('NENHUMA coluna pública de /v1/jobs carrega o wamid cru (ele decodifica para o telefone)', async () => {
    // O `wamid.<base64>` do Meta decodifica para estrutura que CONTÉM o telefone do remetente, e
    // `command_id`/`idempotency_key` voltam em `GET /v1/jobs/search`, `GET /v1/jobs/:jobId` e
    // `GET /v1/health/jobs/dlq` — rotas que hoje passam com token inventado. Gravá-lo cru ali anulava
    // a opacidade do `entityId`.
    const wamid = 'wamid.HBgNNTUxMTk4NzY1NDMyMRUCABIYFDNBMDRCRDNFRkYzRDlBQzhBQjBGAA==';
    const { state } = await ingest([buildMessage({ providerMessageId: wamid })], { links: [buildLink()] });
    const job = state.inserted[0];

    const publicColumns = [job.commandId, job.entityId, job.idempotencyKey, job.correlationId, (job.tags || []).join(',')];
    for (const column of publicColumns) {
      assert.equal(String(column ?? '').includes(wamid), false, `wamid cru vazou em ${column}`);
      assert.equal(String(column ?? '').includes('wamid'), false, `resíduo de wamid em ${column}`);
    }
    assert.equal(job.idempotencyKey, null, 'a coluna é informativa e não tem unique — não vale o vazamento');
    // CONTROLE POSITIVO: o id do provedor continua existindo onde o worker precisa dele. Sem isto, o
    // caso passaria trivialmente se alguém simplesmente parasse de propagar o id.
    assert.equal(job.payload.providerMessageId, wamid);
  });

  it('o commandId hasheado continua sendo barreira de reentrega: determinístico e distinto', async () => {
    // Se o hash não fosse determinístico, o `unique` de `command_id` deixaria de barrar a reentrega e
    // a MESMA mensagem viraria dois turnos (duas respostas, dois custos de LLM).
    const first = await ingest([buildMessage({ providerMessageId: 'wamid.aaa' })], { links: [buildLink()] });
    resetWhatsAppInboundLimitersForTests();
    const again = await ingest([buildMessage({ providerMessageId: 'wamid.aaa' })], { links: [buildLink()] });
    resetWhatsAppInboundLimitersForTests();
    const other = await ingest([buildMessage({ providerMessageId: 'wamid.bbb' })], { links: [buildLink()] });

    assert.equal(first.state.inserted[0].commandId, again.state.inserted[0].commandId);
    assert.notEqual(first.state.inserted[0].commandId, other.state.inserted[0].commandId);
  });

  it('entityId é OPACO — nunca telefone, nunca wamid (superfície pública em /v1/jobs)', async () => {
    const { state } = await ingest([buildMessage()], { links: [buildLink()] });
    const job = state.inserted[0];

    assert.match(job.entityId, /^cimsg_[0-9a-f]{26}$/);
    assert.ok(!job.entityId.includes('5511987654321'));
    assert.ok(!job.entityId.includes('wamid'));
  });

  it('payload NÃO carrega telefone em claro, userId, permissões nem conta de integração', async () => {
    const { state } = await ingest([buildMessage()], { links: [buildLink()] });
    const payload = state.inserted[0].payload;

    assert.equal(payload.channelLinkId, 'cclk_1');
    assert.equal(payload.maskedUserKey, maskChannelUserKey('5511987654321'));
    assert.equal(JSON.stringify(payload).includes('5511987654321'), false, 'PII em claro no payload vaza para a DLQ');
    assert.equal('userId' in payload, false, 'o vínculo é RELIDO no worker — revogação tem de ser efetiva');
    assert.equal('permissionKeys' in payload, false);
    assert.equal('integrationAccountId' in payload, false);
  });

  it('reentrega do mesmo providerMessageId (23505) é contada como duplicata e não lança', async () => {
    const seen = new Set();
    const { summary, state } = await ingest(
      [buildMessage(), buildMessage()],
      {
        links: [buildLink()],
        insertBehaviour: (input) => {
          if (seen.has(input.commandId)) {
            return Object.assign(new Error('duplicate key value violates unique constraint'), { code: '23505' });
          }
          seen.add(input.commandId);
          return null;
        }
      }
    );

    assert.equal(state.inserted.length, 1);
    assert.equal(summary.dropped.duplicate, 1);
    assert.equal(summary.enqueued, 1);
  });

  it('mensagem sem providerMessageId ganha id sintético estável por minuto', () => {
    const message = buildMessage({ providerMessageId: '', timestamp: null });
    const at = new Date('2026-08-06T10:15:30.000Z');
    const other = new Date('2026-08-06T10:15:59.000Z');
    const nextMinute = new Date('2026-08-06T10:16:01.000Z');

    const key = buildInboundIdempotencyKey(message, at);
    assert.match(key, /^syn:[0-9a-f]{40}$/);
    assert.equal(buildInboundIdempotencyKey(message, other), key, 'mesmo minuto → mesma chave');
    assert.notEqual(buildInboundIdempotencyKey(message, nextMinute), key, 'a janela de dedup é de 1 minuto');
  });
});

/* -------------------------------------------------------------------------------------------- */
/* 4. Guardas de lote, número de negócio, frescor e teto por vínculo                               */
/* -------------------------------------------------------------------------------------------- */

describe('recepção — guardas de volume e endereçamento', () => {
  it('cap de lote descarta o excedente com contador próprio', async () => {
    setConfigOverride('whatsappInboundMaxMessagesPerPost', 2);
    const messages = [1, 2, 3, 4, 5].map((n) => buildMessage({ providerMessageId: `wamid.${n}` }));

    const { summary, state } = await ingest(messages, { links: [buildLink()] });

    assert.equal(state.inserted.length, 2, 'um corpo assinado de 2 MB viraria milhares de jobs');
    assert.equal(summary.dropped.batch_overflow, 3);
  });

  it('mensagem endereçada a OUTRO número de negócio da mesma WABA é descartada', async () => {
    setConfigOverride('whatsappBusinessNumber', '5511300000000');

    const { summary, state } = await ingest(
      [buildMessage({ to: '5511999999999' })],
      { links: [buildLink()] }
    );

    assert.equal(state.inserted.length, 0);
    assert.equal(summary.dropped.foreign_business_number, 1);
  });

  it('com WHATSAPP_BUSINESS_NUMBER vazio a guarda é pulada (sandbox não conhece o próprio número)', async () => {
    setConfigOverride('whatsappBusinessNumber', '');
    const { state } = await ingest([buildMessage({ to: '5511999999999' })], { links: [buildLink()] });
    assert.equal(state.inserted.length, 1);
  });

  it('FAIL-CLOSED: com o número configurado e `to` AUSENTE a mensagem é descartada, não aceita', async () => {
    // A guarda antiga exigia `normalizePhone(message.to)` para ser acionada — ou seja, era PULADA
    // exatamente quando o provedor não informava o destinatário. Numa mudança de forma do `metadata`
    // do Graph, toda mensagem de toda WABA da app passaria a ser aceita com
    // `WHATSAPP_BUSINESS_NUMBER` configurado, e ninguém veria.
    setConfigOverride('whatsappBusinessNumber', '5511300000000');

    for (const missing of ['', null, undefined]) {
      resetWhatsAppInboundLimitersForTests();
      const { summary, state } = await ingest([buildMessage({ to: missing })], { links: [buildLink()] });
      assert.equal(state.inserted.length, 0, `to=${JSON.stringify(missing)} deveria ser descartado`);
      assert.equal(summary.dropped.foreign_business_number, 1);
    }
  });

  it('mensagem mais velha que a janela de 24 h é descartada (replay de payload assinado)', async () => {
    const old = new Date('2026-08-01T00:00:00.000Z').toISOString();
    const { summary, state } = await ingest(
      [buildMessage({ timestamp: old })],
      { links: [buildLink()], now: () => new Date('2026-08-06T00:00:00.000Z') }
    );

    assert.equal(state.inserted.length, 0);
    assert.equal(summary.dropped.stale, 1);
  });

  it('teto por vínculo corta o excesso sem gastar LLM', async () => {
    setConfigOverride('whatsappInboundPerLink', 2);
    resetWhatsAppInboundLimitersForTests();
    const messages = [1, 2, 3, 4].map((n) => buildMessage({ providerMessageId: `wamid.${n}` }));

    const { summary, state } = await ingest(messages, { links: [buildLink()] });

    assert.equal(state.inserted.length, 2);
    assert.equal(summary.dropped.rate_limited, 2);
  });
});

/* -------------------------------------------------------------------------------------------- */
/* 4b. Teto por vínculo — O QUE consome cota (e o aviso que a pessoa recebe)                       */
/* -------------------------------------------------------------------------------------------- */

describe('recepção — a cota do teto só é cobrada de quem vira turno', () => {
  it('reação com emoji NÃO consome cota (é o comportamento mais cotidiano do WhatsApp)', async () => {
    // Cenário real: a pessoa reage com emoji às mensagens do bot e a pergunta seguinte cai em
    // silêncio total. Com o débito ANTES da classificação, a reação sozinha esgota a cota.
    setConfigOverride('whatsappInboundPerLink', 1);
    resetWhatsAppInboundLimitersForTests();

    const reaction = buildMessage({ providerMessageId: 'wamid.reacao', type: 'unsupported', rawType: 'reaction', text: '' });
    const question = buildMessage({ providerMessageId: 'wamid.pergunta', text: 'meus MTRs de hoje' });

    const { summary, state } = await ingest([reaction, question], { links: [buildLink()] });

    assert.equal(summary.dropped.empty, 1, 'a reação continua sendo descarte silencioso');
    assert.equal(state.inserted.length, 1, 'a pergunta de verdade tem de entrar');
    assert.equal(state.inserted[0].payload.text, 'meus MTRs de hoje');
    assert.equal(summary.dropped.rate_limited, 0);
  });

  it('o critério da cota é PRODUZIR SAÍDA — e a figurinha produz (por isso é cobrada)', async () => {
    // Tabela do que consome e do que não consome, medida pelo efeito colateral que importa: se a
    // PERGUNTA seguinte, com cota de 1, ainda entra. O critério não é "chegou mensagem", é "houve
    // saída paga": reação e mensagem vazia morrem em `ignore_silent` e não geram nada; figurinha vira
    // job e rende uma resposta estática — que é uma mensagem paga como qualquer outra, e um flood de
    // figurinhas sem cota seria saída ilimitada. Este caso prende a linha nos DOIS sentidos: se o
    // débito voltar para antes da classificação, a reação passa a cobrar; se a figurinha deixar de
    // cobrar, o flood volta a ser grátis.
    const cases = [
      { nome: 'reação com emoji', overrides: { type: 'unsupported', rawType: 'reaction', text: '' }, consomeCota: false },
      { nome: 'mensagem só com espaços', overrides: { type: 'text', rawType: 'text', text: '   ' }, consomeCota: false },
      { nome: 'figurinha', overrides: { type: 'unsupported', rawType: 'sticker', text: null }, consomeCota: true }
    ];

    for (const testCase of cases) {
      setConfigOverride('whatsappInboundPerLink', 1);
      resetWhatsAppInboundLimitersForTests();

      const primeira = buildMessage({ providerMessageId: 'wamid.primeira', ...testCase.overrides });
      const pergunta = buildMessage({ providerMessageId: 'wamid.pergunta', text: 'meus MTRs de hoje' });
      const { summary, state } = await ingest([primeira, pergunta], { links: [buildLink()] });

      const perguntaEntrou = state.inserted.some((job) => job.payload.text === 'meus MTRs de hoje');
      assert.equal(
        perguntaEntrou,
        !testCase.consomeCota,
        `${testCase.nome}: consomeCota=${testCase.consomeCota} deveria ${testCase.consomeCota ? 'barrar' : 'deixar passar'} a pergunta seguinte`
      );
      assert.equal(summary.dropped.rate_limited, testCase.consomeCota ? 1 : 0, testCase.nome);
      // Justifica a cobrança: a figurinha só paga cota porque ELA MESMA virou job (e portanto saída).
      assert.equal(
        state.inserted.some((job) => job.payload.disposition === 'sticker'),
        testCase.consomeCota,
        `${testCase.nome}: quem cobra cota tem de ter gerado trabalho`
      );
    }
  });

  it('REENTREGA duplicada (23505) NÃO consome cota', async () => {
    // O provedor reentrega por dias; a duplicata morre no `unique` de `command_id` e não vira turno
    // nenhum. Cobrar cota por ela é cobrar a pessoa por um trabalho que não aconteceu.
    setConfigOverride('whatsappInboundPerLink', 1);
    resetWhatsAppInboundLimitersForTests();

    const duplicate = buildMessage({ providerMessageId: 'wamid.ja_processada' });
    const fresh = buildMessage({ providerMessageId: 'wamid.nova' });
    const { summary, state } = await ingest([duplicate, fresh], {
      links: [buildLink()],
      insertBehaviour: (input) => (
        input.payload.providerMessageId === 'wamid.ja_processada'
          ? Object.assign(new Error('duplicate key'), { code: '23505' })
          : null
      )
    });

    assert.equal(summary.dropped.duplicate, 1);
    assert.equal(state.inserted.length, 1, 'a mensagem nova não pode ser barrada pela cota da duplicata');
    assert.equal(summary.dropped.rate_limited, 0);
  });

  it('mensagem endereçada a outro número da WABA não consome cota (é barrada antes)', async () => {
    setConfigOverride('whatsappInboundPerLink', 1);
    setConfigOverride('whatsappBusinessNumber', '5511300000000');
    resetWhatsAppInboundLimitersForTests();

    const foreign = buildMessage({ providerMessageId: 'wamid.alheia', to: '5511999999999' });
    const mine = buildMessage({ providerMessageId: 'wamid.minha' });

    const { summary, state } = await ingest([foreign, mine], { links: [buildLink()] });

    assert.equal(summary.dropped.foreign_business_number, 1);
    assert.equal(state.inserted.length, 1, 'tráfego de outra WABA não pode esgotar a cota de quem é do canal');
    assert.equal(summary.dropped.rate_limited, 0);
  });

  it('teto estourado AVISA a pessoa — uma vez por janela, mesmo com a cortesia de não-vinculado OFF', async () => {
    // Sem o aviso, o `WHATSAPP_RATE_LIMIT_NOTICE` era código morto e a pessoa simplesmente sumia do
    // canal achando que ele quebrou. O flag `whatsappUnlinkedNoticeEnabled` protege contra responder
    // a tráfego ARBITRÁRIO; aqui o destinatário é um vínculo VERIFICADO.
    setConfigOverride('whatsappInboundPerLink', 1);
    setConfigOverride('whatsappUnlinkedNoticeEnabled', false);
    resetWhatsAppInboundLimitersForTests();

    const messages = [1, 2, 3, 4].map((n) => buildMessage({ providerMessageId: `wamid.${n}` }));
    const { provider, summary } = await ingest(messages, { links: [buildLink()] });

    assert.equal(summary.dropped.rate_limited, 3);
    assert.equal(provider.calls.sendText.length, 1, 'um aviso por janela — senão o aviso amplifica o flood');
    assert.equal(provider.calls.sendText[0].text, WHATSAPP_RATE_LIMIT_NOTICE);
    assert.equal(provider.calls.sendText[0].to, '5511987654321');
  });
});

/* -------------------------------------------------------------------------------------------- */
/* 5. Cortesia de número não vinculado                                                            */
/* -------------------------------------------------------------------------------------------- */

describe('recepção — número não vinculado', () => {
  it('por default responde SILÊNCIO (nada é enviado)', async () => {
    setConfigOverride('whatsappUnlinkedNoticeEnabled', false);
    const provider = createProvider([buildMessage()]);

    await ingest([buildMessage()], { links: [], provider });

    assert.equal(provider.calls.sendText.length, 0);
  });

  it('com o flag ligado envia UMA vez por janela e com texto idêntico entre estados', async () => {
    setConfigOverride('whatsappUnlinkedNoticeEnabled', true);
    resetWhatsAppInboundLimitersForTests();

    const unknownProvider = createProvider([]);
    await ingestWhatsAppWebhook({ provider: unknownProvider, body: {}, correlationId: 'c1' });

    // Desconhecido
    const p1 = createProvider([buildMessage({ providerMessageId: 'wamid.x' })]);
    installIngestDependencies({ links: [] });
    await ingestWhatsAppWebhook({ provider: p1, body: {}, correlationId: 'c2' });

    // `pending` — MESMO número, mesma janela: não deve enviar de novo.
    const p2 = createProvider([buildMessage({ providerMessageId: 'wamid.y' })]);
    installIngestDependencies({ links: [buildLink({ verificationStatus: 'pending' })] });
    await ingestWhatsAppWebhook({ provider: p2, body: {}, correlationId: 'c3' });

    assert.equal(p1.calls.sendText.length, 1);
    assert.equal(p2.calls.sendText.length, 0, '1 aviso por 24 h por número');
    assert.ok(p1.calls.sendText[0].text.includes('ainda não está liberado'));
    assert.ok(!p1.calls.sendText[0].text.toLowerCase().includes('cadastrado'), 'não confirma nem nega cadastro');
  });

  it('o texto é BYTE A BYTE o mesmo entre desconhecido, `pending`, vínculo órfão e telefone inválido', async () => {
    // O caso acima NÃO pega uma variante por estado: ele usa o MESMO número para os dois estados, e o
    // limitador de 1-por-24 h engole o segundo envio. Um texto especial para `pending` ("seu número já
    // está cadastrado, falta concluir a verificação") passaria batido — e confirmaria a um terceiro,
    // que só precisa mandar "oi", que aquele número está em cadastro no SICAT. Aqui cada estado usa um
    // número PRÓPRIO, então todos os envios acontecem de verdade.
    setConfigOverride('whatsappUnlinkedNoticeEnabled', true);

    const states = [
      { nome: 'desconhecido', phone: '5511900000001', links: [] },
      { nome: 'pending', phone: '5511900000002', links: [buildLink({ externalUserKey: '5511900000002', verificationStatus: 'pending' })] },
      { nome: 'órfão', phone: '5511900000003', links: [buildLink({ externalUserKey: '5511900000003', userId: null })] },
      { nome: 'telefone inválido', phone: '11', links: [] }
    ];

    const sent = [];
    for (const state of states) {
      resetWhatsAppInboundLimitersForTests();
      const provider = createProvider([buildMessage({ from: state.phone, providerMessageId: `wamid.${state.phone}` })]);
      installIngestDependencies({ links: state.links });
      await ingestWhatsAppWebhook({ provider, body: {}, correlationId: 'corr_oraculo' });

      assert.equal(provider.calls.sendText.length, 1, `estado ${state.nome} deveria ter recebido o aviso`);
      sent.push({ nome: state.nome, text: provider.calls.sendText[0].text });
    }

    const distinct = new Set(sent.map((entry) => entry.text));
    assert.equal(
      distinct.size,
      1,
      `todo estado não-verificado responde o MESMO texto; recebi ${JSON.stringify(sent.map((e) => e.nome + ':' + e.text.slice(0, 40)))}`
    );
    assert.equal(sent[0].text, WHATSAPP_UNLINKED_NOTICE);
  });
});

/* -------------------------------------------------------------------------------------------- */
/* 5a. Falha de infraestrutura em lote PARCIAL                                                    */
/* -------------------------------------------------------------------------------------------- */

describe('recepção — lote parcialmente gravado', () => {
  it('falha de INFRAESTRUTURA em UMA mensagem faz o lote inteiro pedir reentrega', async () => {
    // A regra antiga (`enqueued === 0 && infra`) devolvia 200 quando a primeira mensagem entrava e a
    // segunda caía por conexão: o provedor nunca mais reentregava e a pergunta da pessoa SUMIA para
    // sempre, sem rastro. O 500 é seguro no caso parcial pelo mesmo motivo que era no total — o
    // `unique` de `command_id` torna a reentrega no-op para o que já gravou.
    const outage = Object.assign(new Error('connection terminated'), { code: 'ECONNRESET' });
    const state = installIngestDependencies({
      links: [buildLink()],
      insertBehaviour: (input) => (input.payload.providerMessageId === 'wamid.b' ? outage : null)
    });
    const provider = createProvider([
      buildMessage({ providerMessageId: 'wamid.a' }),
      buildMessage({ providerMessageId: 'wamid.b' })
    ]);

    await assert.rejects(
      () => ingestWhatsAppWebhook({ provider, body: {}, correlationId: 'corr_parcial' }),
      (error) => error.code === 'ECONNRESET'
    );
    assert.equal(state.inserted.length, 1, 'o que entrou continua na fila — a reentrega colide no unique');
  });

  it('CONTROLE NEGATIVO: falha SEMÂNTICA em lote parcial continua sendo 200 absorvido', async () => {
    // Reentregar não conserta violação de check/tipo/coluna, e não-2xx persistente faz o Meta
    // DESATIVAR o webhook. Sem este controle, o caso acima passaria com um `throw` incondicional.
    const semantic = Object.assign(new Error('violates check constraint'), { code: '23514' });
    const { summary, state } = await ingest(
      [buildMessage({ providerMessageId: 'wamid.a' }), buildMessage({ providerMessageId: 'wamid.b' })],
      {
        links: [buildLink()],
        insertBehaviour: (input) => (input.payload.providerMessageId === 'wamid.b' ? semantic : null)
      }
    );

    assert.equal(state.inserted.length, 1);
    assert.equal(summary.dropped.enqueue_failed, 1);
  });

  it('a linha-resumo do lote é emitida MESMO no caminho que lança (é onde ela mais importa)', async () => {
    const outage = Object.assign(new Error('connection refused'), { code: 'ECONNREFUSED' });
    installIngestDependencies({ links: [buildLink()], insertBehaviour: () => outage });
    const provider = createProvider([buildMessage()]);

    await assert.rejects(() => ingestWhatsAppWebhook({ provider, body: {}, correlationId: 'corr_queda' }));

    const summaryLine = capturedLogs.find((entry) => entry.text.includes('] lote '));
    assert.ok(summaryLine, 'observabilidade que evapora no throw não observa a queda');
    assert.match(summaryLine.text, /enqueue_failed=1/);
    assert.match(summaryLine.text, /correlationId=corr_queda/);
  });
});

/* -------------------------------------------------------------------------------------------- */
/* 5b. Observabilidade do descarte (o canal é mudo por fora — não pode ser mudo por dentro)        */
/* -------------------------------------------------------------------------------------------- */

describe('recepção — observabilidade', () => {
  it('cada DropReason vira contador Prometheus no registro REAL', async () => {
    // `unlinked` em alta é o ÚNICO sinal de canonicalização divergente entre cadastro e recepção — o
    // modo de falha mais perigoso do módulo. Sem contador, ele é indistinguível de "ninguém mandou
    // mensagem".
    const messages = [
      buildMessage({ providerMessageId: 'wamid.1', from: '5511900000009' }),   // unlinked
      buildMessage({ providerMessageId: 'wamid.2', from: '11' }),              // invalid_phone
      buildMessage({ providerMessageId: 'wamid.3' })                           // enfileirada
    ];

    await ingest(messages, { links: [buildLink()] });
    const metrics = await readChannelInboundMetricsForTests('whatsapp');

    assert.equal(metrics.received, 3);
    assert.equal(metrics.enqueued, 1);
    assert.equal(metrics.dropped.unlinked, 1);
    assert.equal(metrics.dropped.invalid_phone, 1);
    assert.equal(metrics.dropped.rate_limited, undefined, 'motivo que não ocorreu não pode aparecer');
  });

  it('o lote é resumido em UMA linha com received/enqueued e os motivos que ocorreram', async () => {
    const messages = [
      buildMessage({ providerMessageId: 'wamid.a' }),
      buildMessage({ providerMessageId: 'wamid.b', from: '5511900000009' })
    ];

    await ingest(messages, { links: [buildLink()] });

    const summaryLine = capturedLogs.find((entry) => entry.text.includes('] lote '));
    assert.ok(summaryLine, 'o IngestSummary era montado com precisão e jogado fora');
    assert.match(summaryLine.text, /received=2/);
    assert.match(summaryLine.text, /enqueued=1/);
    assert.match(summaryLine.text, /unlinked=1/);
    assert.match(summaryLine.text, /correlationId=corr_test/);
  });

  it('o descarte individual loga o motivo — com o telefone SEMPRE mascarado', async () => {
    await ingest([buildMessage({ from: '5511987654321' })], { links: [] });

    const dropLine = capturedLogs.find((entry) => entry.text.includes('reason=unlinked'));
    assert.ok(dropLine, 'descarte sem log é o canal mudo por fora E por dentro');
    assert.ok(dropLine.text.includes(maskChannelUserKey('5511987654321')), 'o operador precisa saber QUAL número');
    assert.equal(
      logText().includes('5511987654321'),
      false,
      'telefone em claro em log é PII no Loki — a máscara é obrigatória'
    );
  });

  it('CONTROLE NEGATIVO: recibo de status (zero mensagens) não gera linha de lote', async () => {
    await ingest([], { links: [buildLink()] });
    assert.equal(capturedLogs.filter((entry) => entry.text.includes('] lote ')).length, 0, 'seria ruído puro');
  });
});

/* -------------------------------------------------------------------------------------------- */
/* 6. Classificação                                                                               */
/* -------------------------------------------------------------------------------------------- */

describe('recepção — classificação (disposition)', () => {
  it('saudação e ajuda são interceptadas antes do LLM', () => {
    for (const text of ['oi', 'Olá', 'BOM DIA', 'ajuda', 'menu', 'help', '?']) {
      assert.equal(classifyInboundMessage(buildMessage({ text })).disposition, 'greeting', text);
    }
  });

  it('allowlist é conservadora: frase que CONTÉM saudação vai para o turno', () => {
    const long = 'oi, me mostra meus MTRs de hoje por favor';
    assert.equal(classifyInboundMessage(buildMessage({ text: long })).disposition, 'process_turn');
  });

  it('figurinha é normalizada entre provedores', () => {
    const meta = buildMessage({ type: 'unsupported', rawType: 'sticker', text: null, media: null });
    const twilio = buildMessage({
      type: 'image',
      rawType: 'image/webp',
      text: null,
      media: { mediaId: null, mediaUrl: 'https://x', mimeType: 'image/webp', fileName: null }
    });

    assert.equal(isWhatsAppSticker(meta), true);
    assert.equal(isWhatsAppSticker(twilio), true);
    assert.equal(classifyInboundMessage(meta).disposition, 'sticker');
    assert.equal(classifyInboundMessage(twilio).disposition, 'sticker');
  });

  it('reação/mensagem vazia é descarte SILENCIOSO (sem job, sem resposta)', async () => {
    const reaction = buildMessage({ type: 'unsupported', rawType: 'reaction', text: null });
    assert.equal(classifyInboundMessage(reaction).disposition, 'ignore_silent');

    const { summary, state } = await ingest([reaction], { links: [buildLink()] });
    assert.equal(state.inserted.length, 0);
    assert.equal(summary.dropped.empty, 1);
  });

  it('áudio tem disposição própria (a expectativa de quem manda áudio é forte)', () => {
    const audio = buildMessage({ type: 'audio', rawType: 'audio', text: null, media: { mediaId: 'a', mediaUrl: null, mimeType: 'audio/ogg', fileName: null } });
    assert.equal(classifyInboundMessage(audio).disposition, 'unsupported_audio');
  });

  it('mídia COM legenda vira turno com aviso; SEM legenda não gasta LLM', () => {
    const media = { mediaId: 'm1', mediaUrl: null, mimeType: 'application/pdf', fileName: 'mtr.pdf' };
    const withCaption = classifyInboundMessage(buildMessage({ type: 'document', rawType: 'document', text: 'é esse MTR?', media }));
    const withoutCaption = classifyInboundMessage(buildMessage({ type: 'document', rawType: 'document', text: null, media }));

    assert.equal(withCaption.disposition, 'process_turn');
    assert.equal(withCaption.mediaIgnored, true);
    assert.equal(withoutCaption.disposition, 'unsupported_media');
  });

  it('texto acima do teto é truncado na ENTRADA e marcado', () => {
    setConfigOverride('whatsappInboundMaxTextChars', 50);
    const classified = classifyInboundMessage(buildMessage({ text: 'a'.repeat(500) }));

    assert.equal(classified.disposition, 'process_turn');
    assert.equal(classified.textTruncated, true);
    assert.equal(classified.text.length, 50, 'sem isto o texto inflado vai direto para o prompt e para o banco');
  });
});

/* -------------------------------------------------------------------------------------------- */
/* 7. WORKER — livro-razão de entrega e identidade                                                */
/* -------------------------------------------------------------------------------------------- */

function buildJob(payloadOverrides = {}) {
  return {
    jobId: 'job_1',
    entityId: 'cimsg_abc',
    correlationId: 'corr_test',
    claimedBy: 'worker-channel',
    payload: {
      channel: 'whatsapp',
      providerName: 'meta',
      providerMessageId: 'wamid.001',
      channelLinkId: 'cclk_1',
      disposition: 'process_turn',
      messageType: 'text',
      mediaIgnored: false,
      textTruncated: false,
      text: 'meus MTRs de hoje',
      receivedAt: new Date().toISOString(),
      maskedUserKey: maskChannelUserKey('5511987654321'),
      ...payloadOverrides
    }
  };
}

function installTurnDependencies(options = {}) {
  const state = { principalCalls: [], turnCalls: [], audits: [], patches: [] };
  const provider = options.provider || createProvider([]);

  setWhatsAppTurnDependenciesForTests({
    findLink: async () => (options.link === undefined ? buildLink() : options.link),
    resolveChannelPrincipal: async (input) => {
      state.principalCalls.push(input);
      return {
        channel: 'whatsapp',
        userId: input.userId,
        integrationAccountId: 'iac_da_conta_ativa',
        sessionContextId: 'sess_1',
        channelSessionKey: `whatsapp:${input.externalUserKey}`,
        permissionKeys: [],
        requestedBy: input.requestedBy || input.externalUserKey
      };
    },
    processTurn: async (input) => {
      state.turnCalls.push(input);
      if (options.turnError) throw options.turnError;
      if (options.turnDelayMs) await new Promise((resolve) => setTimeout(resolve, options.turnDelayMs));
      return options.turnOutput || {
        conversationSessionId: 'cs_1',
        conversationTurnId: 'ct_1',
        status: 'responded',
        responseText: 'Você tem 3 MTRs hoje.',
        policy: { reasonCode: null }
      };
    },
    resolveProvider: () => (options.providerDisabled ? null : provider),
    insertAuditEntry: async (entry) => { state.audits.push(entry); },
    now: options.now || (() => Date.now())
  });

  const patchJobPayloadSpy = async (job, patch) => {
    state.patches.push({ ...patch });
    Object.assign(job.payload, patch);
  };

  return { state, provider, patchJobPayload: patchJobPayloadSpy };
}

describe('worker — identidade do turno', () => {
  it('NUNCA passa link.integrationAccountId para resolveChannelPrincipal', async () => {
    // A coluna ainda não tem dono definido e `resolveChannelPrincipal` prioriza o valor recebido
    // sobre a conta ATIVA do usuário: herdar amarraria o novo dono do número à conta CETESB alheia.
    const harness = installTurnDependencies();

    await runWhatsAppInboundTurn({ job: buildJob(), patchJobPayload: harness.patchJobPayload });

    assert.equal(harness.state.principalCalls.length, 1);
    const call = harness.state.principalCalls[0];
    assert.equal('integrationAccountId' in call, false);
    assert.equal(JSON.stringify(call).includes('iac_de_outra_pessoa'), false);
  });

  it('requestedBy é explícito e MASCARADO (o default seria o E.164 cru)', async () => {
    const harness = installTurnDependencies();

    await runWhatsAppInboundTurn({ job: buildJob(), patchJobPayload: harness.patchJobPayload });

    const call = harness.state.principalCalls[0];
    assert.equal(call.requestedBy, `whatsapp:${maskChannelUserKey('5511987654321')}`);
    assert.ok(!call.requestedBy.includes('5511987654321'), 'iria para conversation_action_logs e para as tools');
  });

  it('o turno é sempre montado com allowActions:false e sem toolRequest', async () => {
    const harness = installTurnDependencies();

    await runWhatsAppInboundTurn({ job: buildJob(), patchJobPayload: harness.patchJobPayload });

    const turn = harness.state.turnCalls[0];
    assert.equal(turn.body.options.allowActions, false, 'o default de toBoolean(...) é true — a omissão NÃO é neutra');
    assert.equal('toolRequest' in turn.body, false, 'parseExplicitToolRequest pularia o planner e aceitaria confirmed:true');
    assert.deepEqual(turn.headers, {}, 'headers do webhook jamais são repassados');
    assert.equal(turn.body.metadata.source, 'whatsapp');
  });

  it('vínculo revogado entre o enqueue e a execução: não envia NADA', async () => {
    const harness = installTurnDependencies({ link: { ...buildLink(), verificationStatus: 'pending' } });

    const result = await runWhatsAppInboundTurn({ job: buildJob(), patchJobPayload: harness.patchJobPayload });

    assert.equal(result.outcome, 'whatsapp_inbound_link_revoked');
    assert.equal(harness.provider.calls.sendText.length, 0, 'mandar texto para quem se desvinculou é o oposto do pedido');
    assert.equal(harness.state.turnCalls.length, 0);
  });
});

describe('worker — livro-razão de entrega (o retry é de ENTREGA, nunca de LLM)', () => {
  it('resposta já preparada e NÃO enviada: pula o turno e só reenvia', async () => {
    const harness = installTurnDependencies();
    const job = buildJob({ replyText: 'Você tem 3 MTRs hoje.', replyPreparedAt: new Date().toISOString() });

    await runWhatsAppInboundTurn({ job, patchJobPayload: harness.patchJobPayload });

    assert.equal(harness.state.turnCalls.length, 0, 'sem isto, 3 tentativas = 3 respostas DIFERENTES');
    assert.equal(harness.provider.calls.sendText.length, 1);
    assert.equal(harness.provider.calls.sendText[0].text, 'Você tem 3 MTRs hoje.');
  });

  it('resposta já ENVIADA: termina sem reenviar e sem LLM', async () => {
    const harness = installTurnDependencies();
    const job = buildJob({ replyText: 'x', replySentAt: new Date().toISOString() });

    const result = await runWhatsAppInboundTurn({ job, patchJobPayload: harness.patchJobPayload });

    assert.equal(result.outcome, 'whatsapp_inbound_already_answered');
    assert.equal(harness.provider.calls.sendText.length, 0);
    assert.equal(harness.state.turnCalls.length, 0);
  });

  it('a resposta é PERSISTIDA antes de sair e sendAttempts sobe antes da chamada ao provedor', async () => {
    const order = [];
    const harness = installTurnDependencies();
    const provider = harness.provider;
    const originalSend = provider.sendText.bind(provider);
    provider.sendText = async (input) => { order.push('send'); return originalSend(input); };

    const trackingPatch = async (job, patch) => {
      order.push(Object.keys(patch).join('+'));
      Object.assign(job.payload, patch);
    };

    await runWhatsAppInboundTurn({ job: buildJob(), patchJobPayload: trackingPatch });

    assert.deepEqual(order, [
      'replyText+replyPreparedAt',
      'sendAttempts',
      'send',
      'replySentAt+replyProviderMessageId+userNotified'
    ]);
  });

  it('falha de envio grava o código e LANÇA (quem decide retry/DLQ é o job-runner)', async () => {
    const provider = createProvider([], { sendError: Object.assign(new Error('rate limited'), { code: 'WHATSAPP_SEND_FAILED' }) });
    const harness = installTurnDependencies({ provider });
    const job = buildJob();

    await assert.rejects(
      () => runWhatsAppInboundTurn({ job, patchJobPayload: harness.patchJobPayload }),
      /rate limited/
    );

    assert.equal(job.payload.lastSendErrorCode, 'WHATSAPP_SEND_FAILED');
    assert.equal(job.payload.replyText, 'Você tem 3 MTRs hoje.', 'o reenvio tem de ser byte-idêntico');
    assert.equal(job.payload.replySentAt, undefined);
  });

  it('teto de tentativas de envio encerra sem novo envio', async () => {
    setConfigOverride('whatsappMaxSendAttempts', 2);
    const harness = installTurnDependencies();
    const job = buildJob({ replyText: 'x', sendAttempts: 2 });

    const result = await runWhatsAppInboundTurn({ job, patchJobPayload: harness.patchJobPayload });

    assert.equal(result.outcome, 'whatsapp_inbound_reply_undeliverable');
    assert.equal(harness.provider.calls.sendText.length, 0);
  });

  it('caminho feliz zera text/replyText no patch final (o payload vai inteiro para a DLQ)', async () => {
    const harness = installTurnDependencies();

    const result = await runWhatsAppInboundTurn({ job: buildJob(), patchJobPayload: harness.patchJobPayload });

    assert.equal(result.patch.text, null);
    assert.equal(result.patch.replyText, null);
    assert.equal(result.patch.userNotified, true);
  });
});

describe('worker — pendência funcional × falha técnica', () => {
  it('backlog: mensagem velha demais não roda LLM', async () => {
    setConfigOverride('whatsappAnswerMaxAgeSeconds', 60);
    const harness = installTurnDependencies();
    const job = buildJob({ receivedAt: new Date(Date.now() - 10 * 60 * 1000).toISOString() });

    const result = await runWhatsAppInboundTurn({ job, patchJobPayload: harness.patchJobPayload });

    assert.equal(result.outcome, 'whatsapp_inbound_expired');
    assert.equal(harness.state.turnCalls.length, 0);
  });

  it('mas um reenvio legítimo de resposta JÁ PREPARADA não é abortado pelo frescor', async () => {
    setConfigOverride('whatsappAnswerMaxAgeSeconds', 60);
    const harness = installTurnDependencies();
    const job = buildJob({
      receivedAt: new Date(Date.now() - 10 * 60 * 1000).toISOString(),
      replyText: 'Você tem 3 MTRs hoje.'
    });

    await runWhatsAppInboundTurn({ job, patchJobPayload: harness.patchJobPayload });

    assert.equal(harness.provider.calls.sendText.length, 1);
  });

  it('disposição estática não gasta LLM e responde texto próprio', async () => {
    const harness = installTurnDependencies();
    const job = buildJob({ disposition: 'unsupported_audio', text: null });

    const result = await runWhatsAppInboundTurn({ job, patchJobPayload: harness.patchJobPayload });

    assert.equal(harness.state.turnCalls.length, 0);
    assert.equal(result.outcome, 'whatsapp_inbound_unsupported_audio');
    assert.match(harness.provider.calls.sendText[0].text, /áudios/);
  });

  it('timeout do turno vira pendência funcional (sem retry), com texto próprio', async () => {
    setConfigOverride('whatsappTurnTimeoutMs', 20);
    const harness = installTurnDependencies({ turnDelayMs: 200 });

    const result = await runWhatsAppInboundTurn({ job: buildJob(), patchJobPayload: harness.patchJobPayload });

    assert.equal(result.outcome, 'whatsapp_inbound_timeout');
    assert.equal(harness.provider.calls.sendText.length, 1, 'retentar um timeout custa outros 120 s');
    assert.match(harness.provider.calls.sendText[0].text, /Demorei demais/);
  });

  it('exceção real de processTurn SOBE (falha técnica retentável)', async () => {
    const harness = installTurnDependencies({ turnError: Object.assign(new Error('planning state failed'), { code: 'PLANNING_FAILED' }) });

    await assert.rejects(
      () => runWhatsAppInboundTurn({ job: buildJob(), patchJobPayload: harness.patchJobPayload }),
      /planning state failed/
    );
    assert.equal(harness.provider.calls.sendText.length, 0);
  });

  it('auditoria usa component whatsapp-channel e nunca o texto do usuário', async () => {
    const harness = installTurnDependencies();

    await runWhatsAppInboundTurn({ job: buildJob(), patchJobPayload: harness.patchJobPayload });

    assert.ok(harness.state.audits.length >= 1);
    for (const entry of harness.state.audits) {
      assert.equal(entry.component, 'whatsapp-channel');
      assert.equal(entry.entityType, 'channel_inbound_message');
      assert.equal(JSON.stringify(entry.sanitizedBody).includes('meus MTRs de hoje'), false);
      assert.equal(JSON.stringify(entry.sanitizedBody).includes('5511987654321'), false);
    }
  });
});

/* -------------------------------------------------------------------------------------------- */
/* 8. Compositor de resposta (ALLOWLIST)                                                          */
/* -------------------------------------------------------------------------------------------- */

describe('compositor — allowlist de saída', () => {
  it('INTEGRATION_ACCOUNT_REQUIRED nunca repassa o responseText do motor', () => {
    // O texto original é ou "selecione uma conta ativa NO CHAT" (UI que não existe aqui), ou ~700
    // caracteres de prévia de ação com 'responda "confirmo manifest.list_recent_top"' — para uma
    // CONSULTA.
    const output = {
      status: 'blocked',
      responseText: 'Prévia da ação: efeitos irreversíveis... responda "confirmo manifest.list_recent_top"',
      policy: { reasonCode: 'INTEGRATION_ACCOUNT_REQUIRED' }
    };

    const reply = composeWhatsAppReply(output, { correlationId: 'corr_1' });

    assert.ok(!reply.includes('Prévia da ação'));
    assert.ok(!reply.toLowerCase().includes('confirmo'));
    assert.match(reply, /conta CETESB ativa/);
  });

  it('CHANNEL_BLOCKED explica o read-only sem instruir uma confirmação impossível', () => {
    const reply = composeWhatsAppReply({
      status: 'blocked',
      responseText: 'responda "confirmo manifest.cancel"',
      policy: { reasonCode: 'CHANNEL_BLOCKED' }
    });

    assert.ok(!reply.toLowerCase().includes('confirmo'));
    assert.match(reply, /só consulto/);
  });

  it('reasonCode DESCONHECIDO cai no genérico, nunca no responseText (fail-closed)', () => {
    const reply = composeWhatsAppReply({
      status: 'blocked',
      responseText: 'texto interno que não pode sair',
      policy: { reasonCode: 'REASON_QUE_AINDA_NAO_EXISTE' }
    });

    assert.ok(!reply.includes('texto interno'));
    assert.match(reply, /Tente pelo SICAT no navegador/);
  });

  it('failed/PROVIDER_UNAVAILABLE não vaza reasonCode nem correlationId no corpo', () => {
    const reply = composeWhatsAppReply({
      status: 'failed',
      responseText: 'Provedor LLM indisponivel no momento. reasonCode=PROVIDER_UNAVAILABLE correlationId=corr_abc.',
      policy: { reasonCode: 'PROVIDER_UNAVAILABLE' }
    }, { correlationId: 'corr_abc' });

    assert.ok(!reply.includes('reasonCode='));
    assert.ok(!reply.includes('correlationId='));
    assert.match(reply, /Protocolo: corr_abc/);
  });

  it('responded entrega o texto do LLM com higiene de markdown', () => {
    const reply = composeWhatsAppReply({
      status: 'responded',
      responseText: '## Resumo\n**3 MTRs** hoje\n- MTR 1\n- MTR 2',
      policy: { reasonCode: null }
    });

    assert.ok(!reply.includes('**'), '`**x**` aparece LITERAL na tela do WhatsApp');
    assert.ok(!reply.includes('## '));
    assert.match(reply, /• MTR 1/);
    assert.match(reply, /\*3 MTRs\*/);
  });

  it('resposta acima do teto é truncada com sufixo honesto', () => {
    setConfigOverride('whatsappReplyMaxChars', 200);
    const reply = composeWhatsAppReply({
      status: 'responded',
      responseText: 'a'.repeat(5000),
      policy: { reasonCode: null }
    });

    assert.ok(reply.length <= 200, 'acima de ~4096 o provedor REJEITA e o usuário fica MUDO');
    assert.match(reply, /foi cortada aqui/);
  });

  it('rodapés de mídia e truncagem vão na MESMA mensagem, depois da resposta útil', () => {
    const reply = composeWhatsAppReply(
      { status: 'responded', responseText: 'Resposta útil.', policy: { reasonCode: null } },
      { mediaIgnored: true, textTruncated: true }
    );

    assert.ok(reply.indexOf('Resposta útil.') < reply.indexOf('não consigo abrir arquivos'));
    assert.match(reply, /sua mensagem era longa/);
  });

  it('saudação apresenta o canal como read-only e traz o cardápio', () => {
    const reply = composeStaticWhatsAppReply('greeting');
    assert.match(reply, /\*consulto\*/);
    assert.match(reply, /não emito, não imprimo e não cancelo/);
    assert.match(reply, /meus MTRs de hoje/);
  });

  it('mídia sem legenda promete o chat web, que de fato lê PDF e imagem', () => {
    assert.match(composeStaticWhatsAppReply('unsupported_media'), /lê PDF e imagem/);
  });
});

/* -------------------------------------------------------------------------------------------- */
/* 9. patchJobPayload — a mutação in place é LOAD-BEARING                                          */
/* -------------------------------------------------------------------------------------------- */

describe('patchJobPayload', () => {
  it('persiste o payload MESCLADO e muta o objeto in place', async () => {
    // Sem a mutação, `handleDlqTransition`/`handleFailedTransition` — que montam
    // `{ ...job, payload: job.payload ?? {} }` a partir do objeto ORIGINAL do runner — leriam o
    // payload do momento do claim: sem `userNotified`, o usuário seria avisado duas vezes.
    const writes = [];
    const job = { jobId: 'job_1', claimedBy: 'worker-channel', payload: { a: 1 } };

    await patchJobPayload(job, { userNotified: true }, {
      updateJob: async () => { throw new Error('não deveria usar updateJob com claimedBy presente'); },
      updateJobIfOwned: async (jobId, claimedBy, patch) => { writes.push({ jobId, claimedBy, patch }); return { jobId }; }
    });

    assert.equal(writes.length, 1);
    assert.deepEqual(writes[0].patch.payload, { a: 1, userNotified: true });
    assert.equal(job.payload.userNotified, true, 'a mutação in place é o que o side effect terminal enxerga');
    assert.equal(job.payload.a, 1);
  });

  it('sem claimedBy usa updateJob', async () => {
    const writes = [];
    const job = { jobId: 'job_1', claimedBy: null, payload: {} };

    await patchJobPayload(job, { replyText: 'x' }, {
      updateJob: async (jobId, patch) => { writes.push({ jobId, patch }); return { jobId }; },
      updateJobIfOwned: async () => { throw new Error('não deveria usar updateJobIfOwned sem claimedBy'); }
    });

    assert.equal(writes.length, 1);
    assert.equal(job.payload.replyText, 'x');
  });

  it('ownership perdido lança JOB_OWNERSHIP_LOST e NÃO muta o payload local', async () => {
    const job = { jobId: 'job_1', claimedBy: 'worker-channel', payload: {} };

    await assert.rejects(
      () => patchJobPayload(job, { replySentAt: 'now' }, {
        updateJob: async () => null,
        updateJobIfOwned: async () => null
      }),
      (error) => error.code === 'JOB_OWNERSHIP_LOST'
    );
    assert.equal(job.payload.replySentAt, undefined);
  });
});

/* -------------------------------------------------------------------------------------------- */
/* 10. Fila: prioridade, retry e raia                                                             */
/* -------------------------------------------------------------------------------------------- */

describe('fila — configuração da operação de canal', () => {
  const DEFAULT_CONFIG = getRetryConfig('operacao.que.nao.existe');
  const DEFAULT_PRIORITY = calculateJobPriority('operacao.que.nao.existe');

  it('a configuração de retry DIFERE do default em todos os campos', () => {
    // Uma entrada igual ao default passaria no teste mesmo depois de DELETADA do mapa — o teste seria
    // decorativo. Aqui cada campo diverge de propósito.
    const actual = getRetryConfig(WHATSAPP_INBOUND_OPERATION);

    assert.deepEqual(actual, { maxAttempts: 3, strategy: 'fixed', baseDelayMs: 5000, maxDelayMs: 15000 });
    assert.notEqual(actual.maxAttempts, DEFAULT_CONFIG.maxAttempts);
    assert.notEqual(actual.strategy, DEFAULT_CONFIG.strategy);
    assert.notEqual(actual.baseDelayMs, DEFAULT_CONFIG.baseDelayMs);
    assert.notEqual(actual.maxDelayMs, DEFAULT_CONFIG.maxDelayMs);
  });

  it('prioridade 2 — abaixo de catalog.sync, para nunca preemptar MTR no modo degradado', () => {
    const priority = calculateJobPriority(WHATSAPP_INBOUND_OPERATION);

    assert.equal(priority, 2);
    assert.notEqual(priority, DEFAULT_PRIORITY);
    assert.ok(priority < calculateJobPriority('catalog.sync'));
    assert.ok(priority < calculateJobPriority('manifest.submit'));
  });

  it('a raia é INERTE por default (WORKER_LANE ausente = comportamento atual)', () => {
    assert.equal(resolveWorkerLane(undefined), 'all');
    assert.equal(resolveWorkerLane(''), 'all');
    assert.equal(resolveWorkerLane('lixo'), 'all');
    assert.equal(resolveWorkerLane('channel'), 'channel');
    assert.equal(resolveWorkerLane('DEFAULT'), 'default');
  });

  it('as duas metades do predicado saem da MESMA constante', () => {
    const source = readFileSync(path.resolve(HERE, '../../src/repositories/job-repo.ts'), 'utf8');
    const start = source.indexOf('function buildLanePredicate');
    const end = source.indexOf('export async function claimJobs');
    const body = source.slice(start, end);

    assert.match(body, /operation <> all\(\$3::text\[\]\)/);
    assert.match(body, /operation = any\(\$3::text\[\]\)/);
    // Nenhuma lista literal duplicada: as duas metades usam CHANNEL_LANE_OPERATIONS.
    assert.equal((body.match(/CHANNEL_LANE_OPERATIONS/g) || []).length, 2);
    assert.ok(!body.includes("'whatsapp.inbound_message'"), 'a operação não pode ser repetida literalmente aqui');
    assert.ok(CHANNEL_LANE_OPERATIONS.includes(WHATSAPP_INBOUND_OPERATION));
  });
});

/* -------------------------------------------------------------------------------------------- */
/* 11. Classificação de erro de infraestrutura                                                    */
/* -------------------------------------------------------------------------------------------- */

describe('isInfrastructureError', () => {
  it('reconhece a classe 08 e os erros de socket', () => {
    for (const code of ['08000', '08003', '08006', '57P01', 'ECONNREFUSED', 'ETIMEDOUT']) {
      assert.equal(isInfrastructureError({ code }), true, code);
    }
    assert.equal(isInfrastructureError(new Error('timeout exceeded when trying to connect')), true);
  });

  it('NÃO reconhece erro semântico de banco (reentregar não conserta)', () => {
    for (const code of ['23505', '23514', '42P01', '22P02']) {
      assert.equal(isInfrastructureError({ code }), false, code);
    }
    assert.equal(isInfrastructureError(new Error('coluna inexistente')), false);
  });
});

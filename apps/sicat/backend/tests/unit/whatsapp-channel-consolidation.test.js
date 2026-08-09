import { describe, it, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert/strict';

import { config, setConfigOverride } from '../../src/lib/config.js';
import {
  readChannelOutboundNoticeMetricsForTests,
  resetChannelOutboundNoticeMetricsForTests
} from '../../src/lib/channel-metrics.js';
import {
  processJob,
  applyWhatsAppInboundTerminalFailureSideEffect,
  setWhatsAppTerminalNoticeDependenciesForTests
} from '../../src/workers/operation-handlers.js';
import {
  runWhatsAppOutboundNotice,
  setWhatsAppNoticeDependenciesForTests
} from '../../src/services/conversation/channel/whatsapp/whatsapp-outbound-notice-service.js';
import { setWhatsAppProviderOverrideForTests } from '../../src/services/conversation/channel/whatsapp/index.js';
import { truncateWhatsAppReply } from '../../src/services/conversation/channel/whatsapp/whatsapp-reply-composer.js';
import { createTwilioWhatsAppProvider } from '../../src/services/conversation/channel/whatsapp/twilio-provider.js';
import { classifyInboundMessage } from '../../src/services/conversation/channel/whatsapp/whatsapp-inbound-service.js';

/**
 * RODADA DE CONSOLIDAÇÃO — mutantes sobreviventes da fase 6 + defeitos que a validação Fable 5 achou.
 *
 * ┌─ DISCIPLINA DOS DOUBLES (a lição da cadeia) ──────────────────────────────────────────────────┐
 * │ Todo double devolve DADO CRU e responde valor DISTINTO por identidade — nunca reimplementa a    │
 * │ decisão sob teste. Cada guarda tem CONTROLE NEGATIVO: o mesmo cenário com o eixo invertido deve │
 * │ mudar o resultado, senão o teste passa por construção. Comentário não é evidência: para cada    │
 * │ correção, o teste tem de MORRER quando a guarda é removida (mutação), não só quando o arquivo   │
 * │ some.                                                                                            │
 * └───────────────────────────────────────────────────────────────────────────────────────────────┘
 */

const HOUR = 3600_000;
const PHONE = '5511987654321';
const PHONE_MID = '987654321';
const PHONE_MASKED = '+55 11 ****-4321';
const LINK_ID = 'clnk_a1b2c3';
const TICKET_ID = 'cvfy_8f2c1d';
const USER_ID = 'usr_1';

// ---------------------------------------------------------------------------------------------
// Harness do handler de aviso — cópia da disciplina de whatsapp-outbound-notice.test.js: `jobs` é
// MAPA id→linha crua, o double responde valor por identidade (e `null` para id ausente), `now` entra
// como parâmetro. Nenhum double decide janela, prazo, dono ou escopo.
// ---------------------------------------------------------------------------------------------

function createFakeProvider(name = 'meta') {
  const calls = { sendText: [], sendTemplate: [], sendMedia: [] };
  return {
    calls,
    provider: {
      name,
      verifyWebhookSignature: () => true,
      parseInboundMessages: () => [],
      handleVerificationChallenge: () => null,
      async sendText(input) { calls.sendText.push(input); return { providerMessageId: 'wamid.TEXT' }; },
      async sendMedia(input) { calls.sendMedia.push(input); return { providerMessageId: 'wamid.MEDIA' }; },
      async sendTemplate(input) { calls.sendTemplate.push(input); return { providerMessageId: 'wamid.TEMPLATE' }; }
    }
  };
}

function jobRow(jobId, status, extra = {}) {
  return {
    jobId,
    status,
    attempts: extra.attempts ?? 1,
    lastErrorCode: extra.lastErrorCode ?? null,
    payload: extra.payload ?? {}
  };
}

function noticeJob(overrides = {}) {
  const payload = {
    channel: 'whatsapp',
    ticketId: TICKET_ID,
    userId: USER_ID,
    channelLinkId: LINK_ID,
    riskTier: 'N1',
    actionKey: 'print_manifest',
    headline: '2a via de 1 MTR',
    itemCount: 1,
    labels: ['MTR 202600123456'],
    dispatchedJobIds: ['job_1'],
    integrationAccountId: 'iac_1',
    sessionContextId: 'sct_1',
    confirmedAt: new Date(1_000_000).toISOString(),
    deadlineAt: new Date(1_000_000 + 600_000).toISOString(),
    ...(overrides.payload || {})
  };
  return {
    jobId: 'job_notice',
    attempts: overrides.attempts ?? 1,
    maxAttempts: overrides.maxAttempts ?? 8,
    correlationId: 'corr_1',
    claimedBy: 'worker-1',
    payload
  };
}

function createHarness(options = {}) {
  const patches = [];
  const enqueuedDebt = [];
  const ticketPatches = [];
  const readCalls = [];
  const statCalls = [];
  const fake = createFakeProvider(options.providerName || 'meta');

  const jobs = options.jobs || { job_1: jobRow('job_1', 'succeeded') };
  const link = options.link === null
    ? null
    : { id: LINK_ID, userId: USER_ID, externalUserKey: PHONE, verificationStatus: 'verified', ...(options.link || {}) };

  setWhatsAppNoticeDependenciesForTests({
    findLink: async (id) => (link && link.id === id ? link : null),
    findJobById: async (id) => jobs[id] || null,
    getArtifactContent: async (input) => {
      readCalls.push(input);
      const artifact = (options.artifacts || {})[input.artifactId];
      if (!artifact) throw new Error('artifact ausente');
      return artifact;
    },
    patchTicketMetadata: async (input) => { ticketPatches.push(input); return true; },
    enqueuePendingNotice: async (input) => { enqueuedDebt.push(input); return true; },
    resolveProvider: () => fake.provider,
    statFile: async (path) => { statCalls.push(path); return { size: options.fileSize ?? 1024 }; },
    readFile: async (path) => { readCalls.push({ readFile: path }); return Buffer.alloc(options.fileSize ?? 1024, 1); },
    now: () => options.now ?? 1_000_000 + 60_000
  });

  const patchJobPayload = async (job, patch) => { patches.push(patch); Object.assign(job.payload, patch); };
  return { fake, patches, enqueuedDebt, ticketPatches, statCalls, readCalls, patchJobPayload };
}

const PHASE_6_CONFIG_KEYS = [
  'whatsappMediaDeliveryEnabled',
  'whatsappNoticeMaxDocuments',
  'whatsappMediaMaxBytes',
  'whatsappNoticeWindowMs',
  'whatsappNoticeDeadlineMs',
  'whatsappMaxSendAttempts',
  'whatsappProvider',
  'whatsappTwilioAccountSid',
  'whatsappTwilioAuthToken',
  'whatsappTwilioFrom',
  'whatsappInboundMaxTextChars'
];

// Captura de console: os defeitos M12a/M12c e o discriminador do filtro por operação são observáveis
// SÓ pelo que o handler realmente loga/emite — nunca chamando o registrador direto.
let capturedWarns = [];
let originalWarn = null;

beforeEach(() => {
  resetChannelOutboundNoticeMetricsForTests();
  for (const key of PHASE_6_CONFIG_KEYS) setConfigOverride(key, undefined);
  capturedWarns = [];
  originalWarn = console.warn;
  console.warn = (...args) => { capturedWarns.push(args.map((a) => String(a)).join(' ')); };
});

afterEach(() => {
  if (originalWarn) console.warn = originalWarn;
  originalWarn = null;
  setWhatsAppNoticeDependenciesForTests(null);
  setWhatsAppTerminalNoticeDependenciesForTests(null);
  setWhatsAppProviderOverrideForTests(null);
  resetChannelOutboundNoticeMetricsForTests();
  for (const key of PHASE_6_CONFIG_KEYS) setConfigOverride(key, undefined);
});

// =================================================================================================
// FASE 6 — M06: `processJob` DESPACHA `whatsapp.outbound_notice` para o handler (não basta existir)
// =================================================================================================

describe('consolidação/fase6 — M06: o case do aviso no processJob', () => {
  it('um job whatsapp.outbound_notice CHEGA a runWhatsAppOutboundNotice (sentinela lançada de dentro)', async () => {
    // Molde do T3 da fase 3 (whatsapp-worker-hardening.test.js:474). Só há UM caminho até a sentinela:
    // o `case 'whatsapp.outbound_notice'` do `processJob`. Apagar o case cai no `default:` e lança
    // "Unsupported job operation ..." (mensagem DIFERENTE); trocar o corpo por no-op não lança. Os dois
    // quebram aqui. A sentinela sai de `findLink`, que é a 1ª dependência que o handler toca.
    const sentinela = Object.assign(new Error('SENTINELA_DO_HANDLER_DE_AVISO'), { code: 'SENTINELA' });
    const vistos = [];
    setWhatsAppNoticeDependenciesForTests({
      findLink: async (id) => { vistos.push(id); throw sentinela; },
      now: () => 1_000_000 + 60_000
    });

    const job = {
      jobId: 'job_notice',
      operation: 'whatsapp.outbound_notice',
      attempts: 1,
      maxAttempts: 8,
      correlationId: 'corr_1',
      claimedBy: 'worker-1',
      payload: { channelLinkId: LINK_ID, ticketId: TICKET_ID, userId: USER_ID, dispatchedJobIds: ['job_1'], confirmedAt: new Date(1_000_000).toISOString(), deadlineAt: new Date(1_600_000).toISOString() }
    };

    await assert.rejects(
      () => processJob(job, {}),
      (error) => {
        assert.equal(error, sentinela, `o job de aviso não chegou ao handler: ${error?.message}`);
        return true;
      }
    );
    // Prova que o PAYLOAD foi repassado (o id do vínculo, não um objeto vazio).
    assert.deepEqual(vistos, [LINK_ID]);
  });

  it('CONTROLE NEGATIVO: operação desconhecida cai no default e é rejeitada com mensagem própria', async () => {
    // É este caso que mostra COMO se parece a ausência do `case` — e prova que a asserção acima sabe
    // distinguir a sentinela do "Unsupported".
    await assert.rejects(
      () => processJob({ operation: 'whatsapp.operacao_que_nao_existe', payload: {} }, {}),
      /Unsupported job operation whatsapp\.operacao_que_nao_existe/
    );
  });
});

// =================================================================================================
// FASE 6 — CRÍTICO/M12a: o side effect de falha terminal FILTRA por operação
// =================================================================================================

describe('consolidação/fase6 — CRÍTICO: applyWhatsAppInboundTerminalFailureSideEffect só age no inbound', () => {
  // ┌─ POR QUE ESTE BLOCO FOI REESCRITO ────────────────────────────────────────────────────────────┐
  // │ A versão anterior tomava a causa EMPRESTADA DO AMBIENTE: `findConversationChannelLinkForChannel`│
  // │ ia direto no pool do Postgres e o teste contava com a rejeição da conexão para produzir o warn  │
  // │ que media. Com o banco no ar (que é o que a receita de verificação manda) a query resolvia      │
  // │ `null` em silêncio e o CONTROLE NEGATIVO falhava — a suíte "passava" só com o banco FORA. Pior  │
  // │ que ambiental: a prova positiva inteira se apoiava num erro de conexão, e o caminho com um      │
  // │ vínculo VÁLIDO — o único em que uma mensagem PAGA sairia de verdade — nunca era exercitado.     │
  // │ Agora a dependência entra por `setWhatsAppTerminalNoticeDependenciesForTests` e o double é      │
  // │ fonte de DADO CRU: devolve a linha do vínculo, ou rejeita quando o TESTE quer que rejeite.      │
  // └───────────────────────────────────────────────────────────────────────────────────────────────┘
  const TERMINAL = { action: 'dlq' };

  function terminalJob(operation) {
    return {
      jobId: `job_${operation}`,
      operation,
      correlationId: 'corr_1',
      payload: { channelLinkId: LINK_ID }
    };
  }

  // Vínculo VERIFICADO e do dono — nada aqui decide se o aviso sai; quem decide é o código sob teste.
  function createLinkHarness(options = {}) {
    const fake = createFakeProvider('meta');
    const findLinkCalls = [];
    setWhatsAppTerminalNoticeDependenciesForTests({
      resolveProvider: () => fake.provider,
      findLink: async (id) => {
        findLinkCalls.push(id);
        if (options.failWith) throw options.failWith;
        return { id: LINK_ID, userId: USER_ID, externalUserKey: PHONE, verificationStatus: 'verified' };
      }
    });
    return { fake, findLinkCalls };
  }

  it('job whatsapp.outbound_notice em transição terminal NÃO dispara o aviso de "última mensagem"', async () => {
    // Vínculo PERFEITAMENTE entregável disponível: se algo sair, foi o filtro por operação que caiu.
    const { fake, findLinkCalls } = createLinkHarness();

    const result = await applyWhatsAppInboundTerminalFailureSideEffect(terminalJob('whatsapp.outbound_notice'), TERMINAL, new Error('db hiccup'));

    assert.equal(result, null, 'o aviso de conclusão morrendo na DLQ é silêncio por desenho');
    assert.equal(fake.calls.sendText.length, 0, 'nunca envia "Não consegui processar sua última mensagem" para um AVISO');
    // Mais forte que "não enviou": o filtro retorna ANTES de sequer reler o vínculo.
    assert.deepEqual(findLinkCalls, [], 'o outbound_notice chegou a reler o vínculo — o filtro por operação foi removido');
  });

  it('CONTROLE NEGATIVO: um whatsapp.inbound_message terminal ENVIA de fato o aviso (prova que a raia flui)', async () => {
    // Mesmo cenário, MESMO vínculo, só a operação muda — o que torna o filtro o ÚNICO discriminador.
    const { fake, findLinkCalls } = createLinkHarness();

    const result = await applyWhatsAppInboundTerminalFailureSideEffect(terminalJob('whatsapp.inbound_message'), TERMINAL, new Error('db hiccup'));

    assert.deepEqual(result, { notified: true });
    assert.deepEqual(findLinkCalls, [LINK_ID], 'o inbound_message tem de reler o vínculo pelo id do payload');
    assert.equal(fake.calls.sendText.length, 1, 'sem envio aqui, o caso positivo passaria por construção');
    assert.equal(fake.calls.sendText[0].to, PHONE, 'o destino sai do vínculo relido, não do payload do job');
    assert.ok(fake.calls.sendText[0].text.length > 0);
  });

  it('vínculo NÃO verificado não recebe aviso, mesmo sendo inbound (o filtro não é o único portão)', async () => {
    const fake = createFakeProvider('meta');
    setWhatsAppTerminalNoticeDependenciesForTests({
      resolveProvider: () => fake.provider,
      findLink: async () => ({ id: LINK_ID, userId: USER_ID, externalUserKey: PHONE, verificationStatus: 'pending' })
    });

    const result = await applyWhatsAppInboundTerminalFailureSideEffect(terminalJob('whatsapp.inbound_message'), TERMINAL, null);

    assert.equal(result, null);
    assert.equal(fake.calls.sendText.length, 0, 'aviso para vínculo não verificado é mensagem PAGA para destino não provado');
  });

  it('releitura do vínculo que EXPLODE não mata o worker: vira warn e null (causa injetada, não ambiental)', async () => {
    // A causa é do TESTE — não do Postgres estar fora. É esta a diferença entre medir a guarda e
    // medir a rede: `handleDlqTransition` é awaited dentro de um catch sem catch externo, então um
    // throw daqui subiria até o `while` de `runWorkerLoop` e derrubaria o worker.
    const falha = Object.assign(new Error('FALHA_INJETADA_NA_RELEITURA_DO_VINCULO'), { code: 'SENTINELA_DB' });
    const { fake, findLinkCalls } = createLinkHarness({ failWith: falha });

    const result = await applyWhatsAppInboundTerminalFailureSideEffect(terminalJob('whatsapp.inbound_message'), TERMINAL, null);

    assert.equal(result, null, 'falha na releitura tem de virar silêncio, nunca throw');
    assert.deepEqual(findLinkCalls, [LINK_ID]);
    assert.equal(fake.calls.sendText.length, 0);
    assert.ok(
      capturedWarns.some((line) => line.includes('aviso de falha terminal do canal WhatsApp')
        && line.includes('job_whatsapp.inbound_message')
        && line.includes('FALHA_INJETADA_NA_RELEITURA_DO_VINCULO')),
      `o catch não registrou a causa injetada: ${JSON.stringify(capturedWarns)}`
    );
  });
});

// =================================================================================================
// FASE 6 — ALTO: TETO DE TENTATIVAS DE ENVIO (o 5º "comentário-mentira" desta cadeia)
// =================================================================================================

describe('consolidação/fase6 — ALTO: teto de tentativas de envio impede mídia/texto PAGO duplicado', () => {
  it('sendAttempts NO TETO (2) sem noticeSentAt: conclui undeliverable e NÃO chama o provedor', async () => {
    // Sem artefato de documento nos jobs ⇒ 0 documentos ⇒ teto = whatsappMaxSendAttempts(2) + 0 = 2.
    const job = noticeJob({ payload: { sendAttempts: 2 } });
    const harness = createHarness();

    const result = await runWhatsAppOutboundNotice({ job, patchJobPayload: harness.patchJobPayload });

    assert.equal(result.outcome, 'whatsapp_notice_undeliverable');
    assert.equal(result.patch.userNotified, false);
    assert.equal(harness.fake.calls.sendText.length, 0, 'reenvio PAGO na janela de crash-dentro-do-fetch');
    assert.equal(harness.fake.calls.sendMedia.length, 0);
    // Trilha obrigatória: sem a métrica a degradação é invisível.
    const metrics = await readChannelOutboundNoticeMetricsForTests();
    assert.ok(metrics.some((entry) => entry.path === 'skipped_undeliverable' && entry.value === 1));
    // E o ticket para de mentir mesmo neste desfecho.
    assert.equal(harness.ticketPatches.length, 1);
  });

  it('CONTROLE NEGATIVO: sendAttempts ABAIXO do teto (1) envia normalmente', async () => {
    const job = noticeJob({ payload: { sendAttempts: 1 } });
    const harness = createHarness();

    const result = await runWhatsAppOutboundNotice({ job, patchJobPayload: harness.patchJobPayload });

    assert.equal(harness.fake.calls.sendText.length, 1, 'abaixo do teto o aviso TEM de sair — senão o teto está zoando com o caminho feliz');
    assert.equal(result.patch.userNotified, true);
  });

  it('o teto ESCALA com o nº de documentos: 1 doc ⇒ teto 3, então sendAttempts=2 ainda anexa a mídia', async () => {
    // Prova o termo `+ documents.length`. Sem ele o teto seria 2 e sendAttempts=2 concluiria
    // undeliverable — cortando um envio legítimo (1 texto/legenda + as mídias contam como tentativas).
    setConfigOverride('whatsappMediaDeliveryEnabled', true);
    const belowJob = noticeJob({ payload: { sendAttempts: 2 } });
    const belowHarness = createHarness({
      jobs: { job_1: jobRow('job_1', 'succeeded', { payload: { conversationArtifactId: 'cart_1' } }) },
      artifacts: { cart_1: { artifactId: 'cart_1', mimeType: 'application/pdf', fileName: 'mtr.pdf', storagePath: '/data/mtr.pdf', status: 'available' } }
    });

    const below = await runWhatsAppOutboundNotice({ job: belowJob, patchJobPayload: belowHarness.patchJobPayload });
    assert.equal(belowHarness.fake.calls.sendMedia.length, 1, 'sendAttempts=2 < teto 3 (2+1 doc) — a mídia tem de sair');
    assert.equal(below.patch.userNotified, true);

    // No teto escalado (3): undeliverable, sem mídia.
    setConfigOverride('whatsappMediaDeliveryEnabled', true);
    const atJob = noticeJob({ payload: { sendAttempts: 3 } });
    const atHarness = createHarness({
      jobs: { job_1: jobRow('job_1', 'succeeded', { payload: { conversationArtifactId: 'cart_1' } }) },
      artifacts: { cart_1: { artifactId: 'cart_1', mimeType: 'application/pdf', fileName: 'mtr.pdf', storagePath: '/data/mtr.pdf', status: 'available' } }
    });
    const at = await runWhatsAppOutboundNotice({ job: atJob, patchJobPayload: atHarness.patchJobPayload });
    assert.equal(at.outcome, 'whatsapp_notice_undeliverable');
    assert.equal(atHarness.fake.calls.sendMedia.length, 0);
  });
});

// =================================================================================================
// FASE 6 — M04a: o desfecho `failed` GERA aviso (não é silêncio)
// =================================================================================================

describe('consolidação/fase6 — M04a: aggregate `failed` produz um aviso honesto por sendText', () => {
  it('todos os jobs em `failed` ⇒ o handler COMPÕE e ENVIA o texto de falha (nunca some)', async () => {
    // O double devolve a linha CRUA `failed`; a classificação e o roteamento até o envio são do código.
    const job = noticeJob();
    const harness = createHarness({
      jobs: { job_1: jobRow('job_1', 'failed', { attempts: 3, lastErrorCode: 'CETESB_HTTP_ERROR' }) }
    });

    const result = await runWhatsAppOutboundNotice({ job, patchJobPayload: harness.patchJobPayload });

    assert.equal(result.outcome, 'whatsapp_notice_failed');
    assert.equal(result.patch.userNotified, true, 'falha da ação ainda tem de virar um desfecho entregue');
    assert.equal(harness.fake.calls.sendText.length, 1, 'o aviso de falha não pode ser silêncio');
    assert.equal(harness.fake.calls.sendMedia.length, 0);
    assert.equal(harness.fake.calls.sendTemplate.length, 0);
    // Texto de FALHA N1 (não sucesso): "me peca de novo daqui a pouco" é do desfecho `failed`.
    const sent = harness.fake.calls.sendText[0].text;
    assert.ok(sent.includes('me peca de novo daqui a pouco'), `texto não é o de falha: ${sent}`);
  });

  it('CONTROLE NEGATIVO: os mesmos jobs em `succeeded` produzem TEXTO DIFERENTE (o outcome dirige o conteúdo)', async () => {
    const job = noticeJob();
    const harness = createHarness({ jobs: { job_1: jobRow('job_1', 'succeeded') } });

    const result = await runWhatsAppOutboundNotice({ job, patchJobPayload: harness.patchJobPayload });

    assert.equal(result.outcome, 'whatsapp_notice_succeeded');
    const sent = harness.fake.calls.sendText[0].text;
    assert.equal(sent.includes('me peca de novo daqui a pouco'), false, 'sucesso não pode falar como falha');
  });
});

// =================================================================================================
// FASE 6 — M12a/M12c: telefone CRU não aparece no que o handler LOGA nem como LABEL de métrica
// =================================================================================================

describe('consolidação/fase6 — M12a/M12c: telefone só mascarado no log, ausente da métrica', () => {
  it('caminho de vínculo TRANSFERIDO: o warn traz a máscara, nunca os dígitos crus; a métrica não leva telefone', async () => {
    // Vínculo trocou de dono ⇒ o handler console.warn com maskChannelUserKey e emite a métrica
    // `skipped_link_transferred`. Espiamos o valor REAL emitido — nunca chamamos o registrador direto.
    const job = noticeJob();
    const harness = createHarness({ link: { userId: 'usr_OUTRO' } });

    const result = await runWhatsAppOutboundNotice({ job, patchJobPayload: harness.patchJobPayload });
    assert.equal(result.outcome, 'whatsapp_notice_link_transferred');

    const warnText = capturedWarns.join('\n');
    assert.ok(warnText.includes('trocou de dono'), 'o warn do vínculo transferido não saiu');
    // O telefone É referenciado (mascarado), provando que a linha fala DELE — mas nunca cru.
    assert.ok(warnText.includes(PHONE_MASKED), 'a máscara do telefone deveria aparecer no log');
    assert.equal(warnText.includes(PHONE), false, 'telefone cru vazou no log do handler');
    assert.equal(warnText.includes(PHONE_MID), false, 'miolo do telefone vazou no log do handler');

    // A métrica REAL emitida pelo handler: só {outcome, path, value}, jamais telefone.
    const metrics = await readChannelOutboundNoticeMetricsForTests();
    assert.ok(metrics.length >= 1);
    for (const entry of metrics) {
      const serialized = JSON.stringify(entry);
      assert.equal(serialized.includes(PHONE), false, 'telefone cru virou label de métrica');
      assert.equal(serialized.includes(PHONE_MID), false);
      assert.equal(serialized.includes(PHONE_MASKED), false, 'até a máscara é cardinalidade proibida em label');
      assert.equal(serialized.includes(LINK_ID), false);
      assert.deepEqual(Object.keys(entry).sort(), ['outcome', 'path', 'value']);
    }
  });
});

// =================================================================================================
// FABLE 5 — Twilio inbound: discriminador ROBUSTO de status-callback × mensagem de entrada
// =================================================================================================

describe('consolidação/fable5 — twilio parseInboundMessages não descarta entrada legítima', () => {
  const provider = createTwilioWhatsAppProvider();

  it('From + Body + MessageSid é MANTIDO mesmo com SmsStatus=received (o filtro antigo o descartava)', () => {
    const messages = provider.parseInboundMessages({
      body: {
        MessageSid: 'SM777',
        From: 'whatsapp:+5511999999999',
        Body: 'quero a 2a via',
        SmsStatus: 'received'
      }
    });

    assert.equal(messages.length, 1, 'mensagem de entrada com SmsStatus=received foi descartada');
    assert.equal(messages[0].text, 'quero a 2a via');
    assert.equal(messages[0].providerMessageId, 'SM777');
  });

  it('From + Body + MessageSid é MANTIDO mesmo quando o status é de ENTREGA (delivered) — decide o CONTEÚDO, não o status', () => {
    // `delivered` está no set de status de entrega; a regra só descarta quando NÃO há conteúdo. Com
    // Body presente, `hasInboundContent` é verdadeiro e a mensagem sobrevive. Isto mata a mutação que
    // remove o `&& !hasInboundContent`.
    const messages = provider.parseInboundMessages({
      body: {
        MessageSid: 'SM778',
        From: 'whatsapp:+5511999999999',
        Body: 'oi',
        SmsStatus: 'delivered'
      }
    });

    assert.equal(messages.length, 1);
    assert.equal(messages[0].text, 'oi');
  });

  it('CONTROLE NEGATIVO: status-callback puro (delivered, SEM Body/mídia) devolve []', () => {
    const messages = provider.parseInboundMessages({
      body: {
        MessageSid: 'SM779',
        From: 'whatsapp:+5511888888888',
        SmsStatus: 'delivered'
      }
    });
    assert.deepEqual(messages, [], 'recibo de status virou turno de usuário');
  });

  it('CONTROLE NEGATIVO: sem From (nem conteúdo) devolve []', () => {
    assert.deepEqual(provider.parseInboundMessages({ body: { MessageSid: 'SM780', SmsStatus: 'delivered' } }), []);
  });
});

// =================================================================================================
// FABLE 5 — classifyInboundMessage: truncagem da ENTRADA por grafema, nunca `slice` cru
// =================================================================================================

describe('consolidação/fable5 — a entrada é cortada por grafema (surrogate partido → enqueue_failed)', () => {
  // Detector de surrogate ÓRFÃO: high sem low a seguir, ou low sem high antes. É exatamente o que um
  // `slice` cru produziria ao cortar no meio de um emoji — e o que `cutAtGrapheme` evita.
  const LONE_SURROGATE = /[\uD800-\uDBFF](?![\uDC00-\uDFFF])|(?<![\uD800-\uDBFF])[\uDC00-\uDFFF]/;

  it('emoji na fronteira do teto: o corte cai ANTES do par, sem deixar surrogate órfão', () => {
    setConfigOverride('whatsappInboundMaxTextChars', 5);
    // 'abcd' (4) + '😀' (índices UTF-16 4 e 5) + 'xyz' — `slice(0,5)` partiria o emoji entre 4 e 5.
    const rawText = 'abcd\u{1F600}xyz';

    const result = classifyInboundMessage({ type: 'text', text: rawText, media: null });

    assert.equal(result.textTruncated, true);
    assert.equal(LONE_SURROGATE.test(result.text), false, 'surrogate órfão no texto — `slice` cru em vez de cutAtGrapheme');
    assert.ok(result.text.length <= 5);
    // O emoji inteiro foi excluído por não caber; o conteúdo ASCII anterior sobrevive.
    assert.equal(result.text, 'abcd');
  });

  it('CONTROLE NEGATIVO: texto dentro do teto passa intacto e não é marcado como truncado', () => {
    setConfigOverride('whatsappInboundMaxTextChars', 2000);
    const result = classifyInboundMessage({ type: 'text', text: 'quero a 2a via do MTR', media: null });
    assert.equal(result.textTruncated, false);
    assert.equal(result.text, 'quero a 2a via do MTR');
  });
});

// =================================================================================================
// FABLE 5 — truncateWhatsAppReply: teto baixo demais SUPRIME o sufixo em vez de perder a resposta
// =================================================================================================

describe('consolidação/fable5 — truncateWhatsAppReply nunca degenera para "só o sufixo"', () => {
  it('teto abaixo do sufixo+margem: corta só o CONTEÚDO no teto e SUPRIME o sufixo (não estoura o teto)', () => {
    const conteudo = 'a'.repeat(500);
    // Teto 100 < len(sufixo ~106) + 24 ⇒ sufixo suprimido.
    const out = truncateWhatsAppReply(conteudo, 100);

    assert.ok(out.length <= 100, `a truncagem estourou o próprio teto (${out.length} > 100)`);
    assert.equal(out.includes('[...]'), false, 'devolveu o sufixo num teto que não o comporta — 100% do conteúdo perdido');
    assert.ok(out.startsWith('aaaa'), 'o conteúdo real tem de sobreviver, não o aviso de corte');
    assert.equal(out, 'a'.repeat(100));
  });

  it('CONTROLE NEGATIVO: teto normal (4096) corta o conteúdo e ANEXA o sufixo honesto', () => {
    const conteudo = 'a'.repeat(6000);
    const out = truncateWhatsAppReply(conteudo, 4096);

    assert.ok(out.length <= 4096);
    assert.ok(out.includes('[...]'), 'com espaço, o corte tem de avisar que cortou');
    assert.ok(out.startsWith('aaaa'));
  });

  it('texto DENTRO do teto passa intacto (sem sufixo, sem corte)', () => {
    assert.equal(truncateWhatsAppReply('curto', 100), 'curto');
  });
});

// =================================================================================================
// FABLE 5 — Twilio sendTemplate: replacement como FUNÇÃO, imune a `$&`/`$\``/`$$` num valor em R$
// =================================================================================================

describe('consolidação/fable5 — twilio sendTemplate renderiza variável LITERAL (sem interpretar `$`)', () => {
  let originalFetch;
  let capturedBody;

  beforeEach(() => {
    originalFetch = globalThis.fetch;
    capturedBody = null;
    globalThis.fetch = async (_url, init) => {
      capturedBody = new URLSearchParams(init.body);
      return { ok: true, status: 200, json: async () => ({ sid: 'SMxyz' }) };
    };
    setConfigOverride('whatsappTwilioAccountSid', 'AC0000000000000000000000000000000');
    setConfigOverride('whatsappTwilioAuthToken', 'token-twilio-de-teste');
    setConfigOverride('whatsappTwilioFrom', '5511300000000');
  });

  afterEach(() => {
    globalThis.fetch = originalFetch;
  });

  it('um valor com `$&`, `` $` `` e `$$` (o `$` de R$) entra LITERAL no corpo, não interpretado', async () => {
    const provider = createTwilioWhatsAppProvider();
    // `templateName` não começa com `HX` ⇒ cai no fallback de texto livre com render de `{{n}}`.
    await provider.sendTemplate({
      to: '5511999999999',
      templateName: 'Cobranca de {{1}} confirmada',
      variables: ['R$ 5,00 $& $` $$']
    });

    assert.ok(capturedBody, 'o fetch não foi chamado');
    const body = capturedBody.get('Body');
    assert.equal(
      body,
      'Cobranca de R$ 5,00 $& $` $$ confirmada',
      'o replacement interpretou padrões de `$` — valor corrompido'
    );
  });
});

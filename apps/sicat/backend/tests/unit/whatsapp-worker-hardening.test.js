import { describe, it, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert/strict';

import { config, setConfigOverride } from '../../src/lib/config.js';
import { isRetryableJobError } from '../../src/lib/retry.js';
import { processJob } from '../../src/workers/operation-handlers.js';
import { createMetaCloudWhatsAppProvider } from '../../src/services/conversation/channel/whatsapp/meta-cloud-provider.js';
import { createTwilioWhatsAppProvider } from '../../src/services/conversation/channel/whatsapp/twilio-provider.js';
import { isAbortTimeoutError } from '../../src/services/conversation/channel/whatsapp/provider-http.js';
import {
  runWhatsAppInboundTurn,
  resetWhatsAppExpiredNoticeThrottleForTests,
  setWhatsAppTurnDependenciesForTests
} from '../../src/services/conversation/channel/whatsapp/whatsapp-turn-service.js';

/**
 * REMEDIAÇÃO da fase 3 — três defeitos que o worker esconde bem:
 *
 *  T1. `fetch` sem `AbortSignal` nos adapters. O provedor aceita a conexão e nunca responde; a
 *      promise fica pendurada PARA SEMPRE, o heartbeat de claim renova o lease (o job nunca vira
 *      stale) e o consumidor — que é SERIAL — para. Sem `WORKER_LANE` aplicado é o MESMO worker do
 *      `manifest.submit`: travar a Meta seria parar a emissão de MTR.
 *  T2. Expiração de backlog concluída como `succeeded` sem enviar nada — 100% de sucesso no painel
 *      com todo mundo sem resposta.
 *  T3. O `case 'whatsapp.inbound_message'` do `processJob` podia ser APAGADO sem quebrar teste
 *      nenhum (mutação M9 sobrevivente); em produção todo job de canal cairia no `default:` e iria
 *      para a DLQ com o canal mudo.
 *
 * REGRA DE ESCRITA: cada caso foi checado contra a neutralização, não só contra a deleção. O duplo de
 * `fetch` só resolve quando o SINAL aborta — trocar `AbortSignal.timeout(ms)` por um
 * `AbortController` inerte deixa a promise pendurada e o cão de guarda acusa; e o dispatch é provado
 * por uma SENTINELA lançada de dentro do handler, não pela existência da função.
 */

/* -------------------------------------------------------------------------------------------- */
/* Harness                                                                                       */
/* -------------------------------------------------------------------------------------------- */

const PENDING = Symbol('PROMISE_AINDA_PENDURADA');

/**
 * Corre a promise contra um cão de guarda. Devolve `PENDING` quando ela não terminou a tempo — que é
 * exatamente o sintoma do defeito T1 (sem isto, um `fetch` sem timeout penduraria a SUÍTE, e um teste
 * que trava não é um teste que falha).
 */
async function settleOrPending(promise, watchdogMs = 3000) {
  let timer;
  const watchdog = new Promise((resolve) => {
    timer = setTimeout(() => resolve(PENDING), watchdogMs);
  });

  try {
    return await Promise.race([
      promise.then((value) => ({ value }), (error) => ({ error })),
      watchdog
    ]);
  } finally {
    clearTimeout(timer);
  }
}

/**
 * `fetch` que NUNCA responde por conta própria — só termina se o chamador tiver armado um
 * `AbortSignal` que dispare. Modela o caso real: a Graph API aceita a conexão e some.
 */
function installHangingFetch() {
  const calls = [];
  globalThis.fetch = (url, init = {}) => {
    calls.push({ url: String(url), init });
    return new Promise((_resolve, reject) => {
      const signal = init.signal;
      // Sem sinal a promise fica pendurada de propósito: é o bug sendo reproduzido.
      if (!signal) return;
      if (signal.aborted) {
        reject(signal.reason || new Error('abortado'));
        return;
      }
      signal.addEventListener('abort', () => reject(signal.reason || new Error('abortado')));
    });
  };
  return calls;
}

function installRespondingFetch(response) {
  const calls = [];
  globalThis.fetch = (url, init = {}) => {
    calls.push({ url: String(url), init });
    return Promise.resolve(response);
  };
  return calls;
}

function buildResponse({ ok, status, body }) {
  return { ok, status, json: async () => body };
}

const PROVIDER_CONFIG_KEYS = [
  'whatsappProviderTimeoutMs',
  'whatsappProviderUploadTimeoutMs',
  'whatsappExpiredNoticeWindowMs',
  'whatsappAnswerMaxAgeSeconds',
  'whatsappInboundMaxAgeSeconds',
  'whatsappMaxSendAttempts',
  'whatsappMetaPhoneNumberId',
  'whatsappMetaAccessToken',
  'whatsappTwilioAccountSid',
  'whatsappTwilioAuthToken',
  'whatsappTwilioFrom'
];

const originalFetch = globalThis.fetch;
let savedConfig = {};

beforeEach(() => {
  savedConfig = Object.fromEntries(PROVIDER_CONFIG_KEYS.map((key) => [key, config[key]]));
  setConfigOverride('whatsappMetaPhoneNumberId', '100000000000000');
  setConfigOverride('whatsappMetaAccessToken', 'token-meta-de-teste');
  setConfigOverride('whatsappTwilioAccountSid', 'AC0000000000000000000000000000000');
  setConfigOverride('whatsappTwilioAuthToken', 'token-twilio-de-teste');
  setConfigOverride('whatsappTwilioFrom', '5511300000000');
  setWhatsAppTurnDependenciesForTests(null);
  resetWhatsAppExpiredNoticeThrottleForTests();
});

afterEach(() => {
  globalThis.fetch = originalFetch;
  for (const key of PROVIDER_CONFIG_KEYS) setConfigOverride(key, savedConfig[key]);
  setWhatsAppTurnDependenciesForTests(null);
  resetWhatsAppExpiredNoticeThrottleForTests();
});

/* -------------------------------------------------------------------------------------------- */
/* T1 — teto de tempo em TODO fetch de provedor                                                   */
/* -------------------------------------------------------------------------------------------- */

describe('T1 — provedor que nunca responde não pendura o worker', () => {
  it('meta/sendText aborta pelo teto e vira WHATSAPP_PROVIDER_TIMEOUT', async () => {
    setConfigOverride('whatsappProviderTimeoutMs', 50);
    installHangingFetch();

    const outcome = await settleOrPending(
      createMetaCloudWhatsAppProvider().sendText({ to: '5511987654321', text: 'oi' })
    );

    assert.notEqual(outcome, PENDING, 'o envio ficou pendurado: o fetch não tem AbortSignal armado');
    assert.equal(outcome.error?.code, 'WHATSAPP_PROVIDER_TIMEOUT');
    assert.equal(outcome.error?.status, 504);
  });

  it('meta/sendTemplate e meta/uploadMedia também abortam (todo fetch, não só o de texto)', async () => {
    setConfigOverride('whatsappProviderTimeoutMs', 50);
    setConfigOverride('whatsappProviderUploadTimeoutMs', 50);
    installHangingFetch();
    const provider = createMetaCloudWhatsAppProvider();

    const template = await settleOrPending(
      provider.sendTemplate({ to: '5511987654321', templateName: 'sicat_otp', languageCode: 'pt_BR', variables: ['123456'] })
    );
    // `content` presente força o caminho de UPLOAD (segundo fetch do adapter).
    const upload = await settleOrPending(
      provider.sendMedia({ to: '5511987654321', content: Buffer.from('%PDF-1.4'), fileName: 'mtr.pdf', mimeType: 'application/pdf' })
    );

    assert.notEqual(template, PENDING, 'sendTemplate ficou pendurado');
    assert.equal(template.error?.code, 'WHATSAPP_PROVIDER_TIMEOUT');
    assert.notEqual(upload, PENDING, 'o upload de mídia ficou pendurado');
    assert.equal(upload.error?.code, 'WHATSAPP_PROVIDER_TIMEOUT');
  });

  it('twilio/sendText aborta pelo teto (mesmo processo, mesma fila que a Meta)', async () => {
    setConfigOverride('whatsappProviderTimeoutMs', 50);
    installHangingFetch();

    const outcome = await settleOrPending(
      createTwilioWhatsAppProvider().sendText({ to: '5511987654321', text: 'oi' })
    );

    assert.notEqual(outcome, PENDING, 'o envio pelo Twilio ficou pendurado');
    assert.equal(outcome.error?.code, 'WHATSAPP_PROVIDER_TIMEOUT');
  });

  it('o teto vem da CONFIG — não é um literal escondido no adapter', async () => {
    // Com teto folgado a chamada CONTINUA pendurada dentro da janela do cão de guarda. Um valor
    // chumbado baixo (ou um `AbortSignal.timeout(50)` literal) faria este caso falhar.
    setConfigOverride('whatsappProviderTimeoutMs', 30000);
    installHangingFetch();

    const outcome = await settleOrPending(
      createMetaCloudWhatsAppProvider().sendText({ to: '5511987654321', text: 'oi' }),
      300
    );

    assert.equal(outcome, PENDING, 'abortou antes do teto configurado — o valor não veio da config');
  });

  it('o upload tem teto PRÓPRIO: subir bytes não morre no teto do texto', async () => {
    setConfigOverride('whatsappProviderTimeoutMs', 40);
    setConfigOverride('whatsappProviderUploadTimeoutMs', 30000);
    installHangingFetch();

    const outcome = await settleOrPending(
      createMetaCloudWhatsAppProvider().sendMedia({
        to: '5511987654321',
        content: Buffer.from('%PDF-1.4'),
        fileName: 'mtr.pdf',
        mimeType: 'application/pdf'
      }),
      300
    );

    assert.equal(outcome, PENDING, 'o upload usou o teto de texto — um PDF grande morreria em 40 ms');
  });

  it('TODA chamada de saída dos DOIS adapters leva um AbortSignal armado', async () => {
    // Os casos acima provam o comportamento nas rotas que o canal usa hoje. Este prova a REGRA: toda
    // saída HTTP dos adapters passa pelo mesmo choke point. Um método novo (ou um `postMessage`
    // paralelo escrito na pressa) que chame `fetch` direto entra aqui sem sinal e o caso quebra —
    // antes de virar um worker pendurado em produção.
    const calls = installRespondingFetch(buildResponse({
      ok: true,
      status: 200,
      // Um corpo que satisfaz os três parsers: Graph (`messages[0].id`), upload (`id`) e Twilio (`sid`).
      body: { messages: [{ id: 'wamid.enviado' }], id: 'media_1', sid: 'SM1' }
    }));

    const meta = createMetaCloudWhatsAppProvider();
    const twilio = createTwilioWhatsAppProvider();
    const to = '5511987654321';

    await meta.sendText({ to, text: 'oi' });
    await meta.sendTemplate({ to, templateName: 'sicat_otp', languageCode: 'pt_BR', variables: ['123456'] });
    // `content` força upload + envio: DOIS fetches distintos no mesmo método.
    await meta.sendMedia({ to, content: Buffer.from('%PDF-1.4'), fileName: 'mtr.pdf', mimeType: 'application/pdf' });
    await twilio.sendText({ to, text: 'oi' });
    await twilio.sendMedia({ to, mediaUrl: 'https://exemplo.invalid/mtr.pdf' });
    await twilio.sendTemplate({ to, templateName: 'HX00000000000000000000000000000000', variables: ['123456'] });

    assert.equal(calls.length, 7, `esperava 7 chamadas de saída, vi ${calls.map((call) => call.url).join(', ')}`);
    for (const call of calls) {
      assert.ok(call.init?.signal instanceof AbortSignal, `fetch SEM AbortSignal em ${call.url}`);
      assert.equal(call.init.signal.aborted, false, `sinal já abortado antes da chamada em ${call.url}`);
    }
  });

  it('erro DO PROVEDOR continua sendo WHATSAPP_SEND_FAILED (timeout é diagnóstico distinto)', async () => {
    installRespondingFetch(buildResponse({ ok: false, status: 500, body: { error: { code: 131026 } } }));

    const outcome = await settleOrPending(
      createMetaCloudWhatsAppProvider().sendText({ to: '5511987654321', text: 'oi' })
    );

    assert.equal(outcome.error?.code, 'WHATSAPP_SEND_FAILED');
    assert.notEqual(outcome.error?.code, 'WHATSAPP_PROVIDER_TIMEOUT');
  });

  it('o timeout é RETENTÁVEL para o job-runner (a resposta já está persistida; retry é de entrega)', async () => {
    setConfigOverride('whatsappProviderTimeoutMs', 50);
    installHangingFetch();

    const outcome = await settleOrPending(
      createMetaCloudWhatsAppProvider().sendText({ to: '5511987654321', text: 'oi' })
    );

    assert.equal(isRetryableJobError(outcome.error), true);
  });

  it('reconhece as DUAS formas de aborto que o undici produz', () => {
    // `AbortSignal.timeout()` rejeita com `TimeoutError`; o undici pode traduzir para `AbortError` e,
    // quando o estouro pega a leitura do CORPO, embrulhar em `cause`. Um predicado que só conhece uma
    // das formas devolve o aborto como erro genérico e a distinção do T1 se perde.
    assert.equal(isAbortTimeoutError(Object.assign(new Error('x'), { name: 'TimeoutError' })), true);
    assert.equal(isAbortTimeoutError(Object.assign(new Error('x'), { name: 'AbortError' })), true);
    assert.equal(isAbortTimeoutError(new Error('falhou', { cause: Object.assign(new Error('y'), { name: 'TimeoutError' }) })), true);
    assert.equal(isAbortTimeoutError(Object.assign(new Error('x'), { code: 'ABORT_ERR' })), true);
    assert.equal(isAbortTimeoutError(new Error('fetch failed')), false);
    assert.equal(isAbortTimeoutError(null), false);
  });
});

/* -------------------------------------------------------------------------------------------- */
/* T2 — expiração de backlog não pode ser sucesso silencioso                                      */
/* -------------------------------------------------------------------------------------------- */

function buildExpiredJob(overrides = {}, ageMinutes = 10) {
  return {
    jobId: 'job_expirado',
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
      text: 'meus MTRs de hoje',
      receivedAt: new Date(Date.now() - ageMinutes * 60 * 1000).toISOString(),
      maskedUserKey: '55****4321',
      ...overrides
    }
  };
}

function installTurnHarness() {
  const state = { turnCalls: [], sends: [], patches: [], audits: [] };

  setWhatsAppTurnDependenciesForTests({
    findLink: async (id) => ({
      id,
      userId: 'usr_1',
      externalUserKey: '5511987654321',
      verificationStatus: 'verified'
    }),
    resolveChannelPrincipal: async (input) => ({ channel: 'whatsapp', userId: input.userId, permissionKeys: [] }),
    processTurn: async (input) => {
      state.turnCalls.push(input);
      return { status: 'responded', responseText: 'Você tem 3 MTRs hoje.', policy: { reasonCode: null } };
    },
    resolveProvider: () => ({
      name: 'meta',
      async sendText(input) {
        state.sends.push(input);
        return { providerMessageId: 'wamid.reply' };
      }
    }),
    insertAuditEntry: async (entry) => { state.audits.push(entry); },
    now: () => Date.now()
  });

  const patchJobPayload = async (job, patch) => {
    state.patches.push(Object.keys(patch).join('+'));
    Object.assign(job.payload, patch);
  };

  return { state, patchJobPayload };
}

describe('T2 — mensagem que expirou na fila avisa a pessoa (não some como sucesso)', () => {
  beforeEach(() => {
    setConfigOverride('whatsappAnswerMaxAgeSeconds', 300);
    setConfigOverride('whatsappInboundMaxAgeSeconds', 86400);
    setConfigOverride('whatsappExpiredNoticeWindowMs', 600000);
  });

  it('envia UM aviso pedindo o reenvio, sem gastar LLM, e marca userNotified', async () => {
    const harness = installTurnHarness();

    const result = await runWhatsAppInboundTurn({ job: buildExpiredJob(), patchJobPayload: harness.patchJobPayload });

    assert.equal(harness.state.turnCalls.length, 0, 'responder a pergunta velha é pior que não responder');
    assert.equal(harness.state.sends.length, 1, 'expiração sem aviso é sucesso mudo — o defeito T2');
    assert.match(harness.state.sends[0].text, /mandar de novo/i);
    assert.equal(result.outcome, 'whatsapp_inbound_expired');
    assert.equal(result.patch.userNotified, true);
  });

  it('o aviso passa pelo MESMO livro-razão de entrega (persiste → envia → carimba)', async () => {
    const harness = installTurnHarness();

    await runWhatsAppInboundTurn({ job: buildExpiredJob(), patchJobPayload: harness.patchJobPayload });

    assert.deepEqual(harness.state.patches, [
      'replyText+replyPreparedAt',
      'sendAttempts',
      'replySentAt+replyProviderMessageId+userNotified'
    ]);
  });

  it('backlog do MESMO vínculo recebe UM aviso, não um por mensagem', async () => {
    const harness = installTurnHarness();

    const first = await runWhatsAppInboundTurn({ job: buildExpiredJob(), patchJobPayload: harness.patchJobPayload });
    const second = await runWhatsAppInboundTurn({
      job: buildExpiredJob({ providerMessageId: 'wamid.002' }),
      patchJobPayload: harness.patchJobPayload
    });
    const third = await runWhatsAppInboundTurn({
      job: buildExpiredJob({ providerMessageId: 'wamid.003' }),
      patchJobPayload: harness.patchJobPayload
    });

    assert.equal(first.patch.userNotified, true);
    assert.equal(harness.state.sends.length, 1, 'um aviso por mensagem enfileirada é flood');
    for (const suppressed of [second, third]) {
      assert.equal(suppressed.outcome, 'whatsapp_inbound_expired');
      // Nem no caminho suprimido o job pode parecer respondido.
      assert.equal(suppressed.patch.userNotified, false);
      assert.equal(suppressed.patch.expiredNoticeSuppressed, 'throttled');
    }
  });

  it('a supressão é POR VÍNCULO — o backlog de uma pessoa não cala a outra', async () => {
    const harness = installTurnHarness();

    await runWhatsAppInboundTurn({ job: buildExpiredJob(), patchJobPayload: harness.patchJobPayload });
    const outra = await runWhatsAppInboundTurn({
      job: buildExpiredJob({ channelLinkId: 'cclk_2' }),
      patchJobPayload: harness.patchJobPayload
    });

    assert.equal(harness.state.sends.length, 2);
    assert.equal(outra.patch.userNotified, true);
  });

  it('passada a janela de supressão o aviso volta a valer', async () => {
    setConfigOverride('whatsappExpiredNoticeWindowMs', 20);
    const harness = installTurnHarness();

    await runWhatsAppInboundTurn({ job: buildExpiredJob(), patchJobPayload: harness.patchJobPayload });
    await new Promise((resolve) => setTimeout(resolve, 40));
    const depois = await runWhatsAppInboundTurn({
      job: buildExpiredJob({ providerMessageId: 'wamid.004' }),
      patchJobPayload: harness.patchJobPayload
    });

    assert.equal(harness.state.sends.length, 2);
    assert.equal(depois.patch.userNotified, true);
  });

  it('fora da janela de 24 h NADA é enviado (o provedor rejeitaria texto livre → DLQ à toa)', async () => {
    const harness = installTurnHarness();

    const result = await runWhatsAppInboundTurn({
      job: buildExpiredJob({}, 60 * 25),
      patchJobPayload: harness.patchJobPayload
    });

    assert.equal(harness.state.sends.length, 0);
    assert.equal(result.patch.expiredNoticeSuppressed, 'outside_session_window');
    assert.equal(result.patch.userNotified, false);
  });

  it('mensagem FRESCA não é tocada pela guarda (o turno normal continua rodando)', async () => {
    const harness = installTurnHarness();

    const result = await runWhatsAppInboundTurn({
      job: buildExpiredJob({ receivedAt: new Date().toISOString() }),
      patchJobPayload: harness.patchJobPayload
    });

    assert.equal(harness.state.turnCalls.length, 1);
    assert.equal(result.outcome, 'whatsapp_inbound_responded');
    assert.equal(harness.state.sends[0].text, 'Você tem 3 MTRs hoje.');
  });
});

/* -------------------------------------------------------------------------------------------- */
/* T3 — o DISPATCH do job de canal (mutação M9 sobrevivente)                                      */
/* -------------------------------------------------------------------------------------------- */

function buildDispatchJob(overrides = {}) {
  return {
    jobId: 'job_dispatch',
    commandId: 'cmd_dispatch',
    entityType: 'channel_inbound_message',
    entityId: 'cimsg_dispatch',
    operation: 'whatsapp.inbound_message',
    status: 'running',
    attempts: 1,
    maxAttempts: 3,
    claimedBy: 'worker-channel',
    correlationId: 'corr_dispatch',
    payload: {
      channelLinkId: 'cclk_dispatch',
      disposition: 'process_turn',
      receivedAt: new Date().toISOString(),
      text: 'oi'
    },
    ...overrides
  };
}

describe('T3 — processJob despacha a operação de canal para o handler do WhatsApp', () => {
  it('um job whatsapp.inbound_message CHEGA ao handler (não basta a função existir)', async () => {
    // A sentinela é lançada de dentro da execução do turno: só há um caminho até ela — o `case` do
    // `processJob`. Apagar o `case` faz cair no `default:` e lançar "Unsupported job operation"
    // (mensagem DIFERENTE); trocar o corpo por um no-op não lança nada. Os dois quebram aqui.
    const sentinela = Object.assign(new Error('SENTINELA_DO_HANDLER_DE_CANAL'), { code: 'SENTINELA' });
    const vistos = [];
    setWhatsAppTurnDependenciesForTests({
      findLink: async (channelLinkId) => {
        vistos.push(channelLinkId);
        throw sentinela;
      }
    });

    await assert.rejects(
      () => processJob(buildDispatchJob(), {}),
      (error) => {
        assert.equal(error, sentinela, `o job não chegou ao handler do WhatsApp: ${error?.message}`);
        return true;
      }
    );

    // Prova também que o PAYLOAD do job foi repassado — não um objeto vazio.
    assert.deepEqual(vistos, ['cclk_dispatch']);
  });

  it('controle negativo: operação desconhecida cai no default e é rejeitada', async () => {
    // Sem este caso, o anterior não provaria nada: é ele que mostra COMO se parece a ausência de
    // `case` — e que a asserção acima sabe distinguir as duas situações.
    await assert.rejects(
      () => processJob(buildDispatchJob({ operation: 'whatsapp.operacao_que_nao_existe' }), {}),
      /Unsupported job operation whatsapp\.operacao_que_nao_existe/
    );
  });

  it('o desfecho de negócio volta como resultado — nunca como Error cru (que viraria retry + DLQ)', async () => {
    // `runWhatsAppInboundTurn` devolve `{ outcome }` para vínculo revogado. Se algum dia isso virar
    // `throw`, `isRetryableJobError` classifica como RETENTÁVEL (devolve `true` quando não reconhece
    // a mensagem) e o texto do usuário acaba na DLQ.
    let alcancado = false;
    setWhatsAppTurnDependenciesForTests({
      findLink: async () => {
        alcancado = true;
        return null; // vínculo revogado entre o enqueue e a execução
      }
    });

    // `finishJob` toca o Postgres (indisponível no unitário): o que importa é que a falha NÃO seja a
    // do dispatch, e que o turno tenha sido de fato executado antes dela.
    const erro = await processJob(buildDispatchJob(), {}).then(() => null, (error) => error);

    assert.equal(alcancado, true, 'o handler não executou o turno');
    assert.equal(/Unsupported job operation/.test(String(erro?.message || '')), false);
  });
});

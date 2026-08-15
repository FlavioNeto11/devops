import { describe, it, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert/strict';

import { setConfigOverride } from '../../src/lib/config.js';
import { CHANNEL_LANE_OPERATIONS } from '../../src/lib/job-lanes.js';
import { calculateJobPriority, getRetryConfig } from '../../src/lib/retry.js';
import {
  recordChannelOutboundNotice,
  readChannelOutboundNoticeMetricsForTests,
  resetChannelOutboundNoticeMetricsForTests
} from '../../src/lib/channel-metrics.js';
import { authorizeArtifactScope } from '../../src/services/conversation/conversation-persistence-service.js';
import { buildWhatsAppConfirmedText } from '../../src/services/conversation/channel/whatsapp/whatsapp-confirmation-texts.js';
import {
  buildWhatsAppNoticeText,
  buildWhatsAppPendingNoticeBlock,
  describeNoticeFailureCause
} from '../../src/services/conversation/channel/whatsapp/whatsapp-notice-texts.js';
import { attachPendingNoticeBlock } from '../../src/services/conversation/channel/whatsapp/whatsapp-reply-composer.js';
import {
  readPendingNoticesFromMetadata,
  enqueuePendingChannelNotice,
  setPendingNoticeDependenciesForTests
} from '../../src/services/conversation/channel/whatsapp/whatsapp-pending-notices.js';
import {
  WHATSAPP_OUTBOUND_NOTICE_OPERATION,
  aggregateNoticeOutcome,
  enqueueWhatsAppOutboundNotice,
  isChannelWindowOpen,
  runWhatsAppOutboundNotice,
  setWhatsAppNoticeDependenciesForTests
} from '../../src/services/conversation/channel/whatsapp/whatsapp-outbound-notice-service.js';

/**
 * FASE 6 da cadeia `whatsapp-channel-sicat` — aviso de conclusão e entrega de arquivo.
 *
 * ┌─ DISCIPLINA DOS DOUBLES ──────────────────────────────────────────────────────────────────────┐
 * │ Os doubles aqui devolvem DADO CRU e respondem VALORES DISTINTOS POR IDENTIDADE: `findJobById`  │
 * │ devolve o job daquele id (e `null` para id que não existe), `findLink` devolve a linha daquele │
 * │ vínculo. NENHUM deles decide janela, prazo, escopo ou destinatário — se decidissem, a guarda    │
 * │ testada ficaria invisível e o teste concordaria consigo mesmo. Foi exatamente esse o erro da    │
 * │ fase 5 (um double de busca que filtrava por telefone ANTES da guarda).                          │
 * │                                                                                                │
 * │ `now`, `confirmedAt`, `deadlineAt` e o estado dos jobs entram como PARÂMETRO do código sob      │
 * │ teste, nunca como esperteza do double.                                                          │
 * └───────────────────────────────────────────────────────────────────────────────────────────────┘
 *
 * Cada caso nomeia a guarda que ele protege e, onde a mutação é interessante, ela é NEUTRA (mover a
 * margem de 23 h para 24 h), não grosseira (desligar a checagem) — mutação grosseira mascara.
 */

const HOUR = 3600_000;
const PHONE = '5511987654321';
const LINK_ID = 'clnk_a1b2c3';
const TICKET_ID = 'cvfy_8f2c1d';
const USER_ID = 'usr_1';

function createFakeProvider(name = 'meta', overrides = {}) {
  const calls = { sendText: [], sendTemplate: [], sendMedia: [] };
  return {
    calls,
    provider: {
      name,
      verifyWebhookSignature: () => true,
      parseInboundMessages: () => [],
      handleVerificationChallenge: () => null,
      async sendText(input) {
        calls.sendText.push(input);
        if (overrides.sendText) return overrides.sendText(input);
        return { providerMessageId: 'wamid.TEXT' };
      },
      async sendMedia(input) {
        calls.sendMedia.push(input);
        if (overrides.sendMedia) return overrides.sendMedia(input);
        return { providerMessageId: 'wamid.MEDIA' };
      },
      async sendTemplate(input) {
        calls.sendTemplate.push(input);
        return { providerMessageId: 'wamid.TEMPLATE' };
      }
    }
  };
}

/** Linha CRUA de `jobs`, como o repositório devolveria. Não sabe nada de aviso. */
function jobRow(jobId, status, extra = {}) {
  return {
    jobId,
    status,
    attempts: extra.attempts ?? 1,
    lastErrorCode: extra.lastErrorCode ?? null,
    payload: extra.payload ?? {}
  };
}

/**
 * Base do job de aviso. `attempts`/`maxAttempts` são do JOB (o runner os incrementa), e o handler os
 * lê para saber se é a última chance.
 */
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

/**
 * Harness do handler. `jobs` é um MAPA id → linha crua; o double responde valor DISTINTO por
 * identidade e `null` para id ausente — nunca "o mesmo job para qualquer id", que tornaria a
 * agregação invisível.
 */
function createHarness(options = {}) {
  const patches = [];
  const enqueuedDebt = [];
  const ticketPatches = [];
  const readCalls = [];
  const statCalls = [];
  const fake = createFakeProvider(options.providerName || 'meta', options.providerOverrides);

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
    readFile: async (path) => {
      readCalls.push({ readFile: path });
      return Buffer.alloc(options.fileSize ?? 1024, 1);
    },
    now: () => options.now ?? 1_000_000 + 60_000
  });

  const patchJobPayload = async (job, patch) => {
    patches.push(patch);
    Object.assign(job.payload, patch);
  };

  return { fake, patches, enqueuedDebt, ticketPatches, statCalls, readCalls, patchJobPayload };
}

/**
 * As chaves da fase 6 voltam ao DEFAULT antes de cada caso (`undefined` faz `getConfigValue` cair no
 * default), e NÃO são fixadas em valor literal aqui.
 *
 * Isso é deliberado: pinar `whatsappNoticeWindowMs` em 82800000 no `beforeEach` tornaria a mutação
 * neutra "23 h → 24 h no default" INVISÍVEL para a suíte inteira — o teste passaria a exercitar o
 * override, não o código. O caso que exercita cada default é o de baixo.
 */
const PHASE_6_CONFIG_KEYS = [
  'whatsappMediaDeliveryEnabled',
  'whatsappNoticeMaxDocuments',
  'whatsappMediaMaxBytes',
  'whatsappNoticeWindowMs',
  'whatsappNoticeDeadlineMs',
  'whatsappPendingNoticeMax',
  'whatsappPendingNoticeTtlMs'
];

beforeEach(() => {
  resetChannelOutboundNoticeMetricsForTests();
  for (const key of PHASE_6_CONFIG_KEYS) setConfigOverride(key, undefined);
});

afterEach(() => {
  setWhatsAppNoticeDependenciesForTests(null);
  setPendingNoticeDependenciesForTests(null);
  for (const key of PHASE_6_CONFIG_KEYS) setConfigOverride(key, undefined);
});

describe('fase 6 — os DEFAULTS são parte do contrato', () => {
  it('a política de arquivo nasce LIGADA (decisão do operador) e os tetos são os justificados no desenho', async () => {
    const { config } = await import('../../src/lib/config.js');

    // POLÍTICA, não capacidade: continua sendo a organização quem decide, e ela decidiu ligar.
    // `WHATSAPP_MEDIA_DELIVERY_ENABLED=false` segue desligando sem tocar em código. Ligada, a
    // entrega ainda depende de CAPACIDADE (só a Meta aceita bytes) e dos tetos abaixo — cada recusa
    // tem rótulo próprio de métrica, testado mais adiante neste arquivo.
    assert.equal(config.whatsappMediaDeliveryEnabled, true);

    // 23 h, não 24: a margem cobre relógio do provedor × relógio do pod, latência de fila e a âncora
    // ser limite inferior. Mudar este número para 86400000 quebra também o caso da janela.
    assert.equal(config.whatsappNoticeWindowMs, 82800000);
    assert.equal(config.whatsappNoticeDeadlineMs, 600000);
    assert.equal(config.whatsappNoticeMaxDocuments, 5);
    // Defensável pela MEMÓRIA DO POD, não por medição do arquivo: o PDF de produção vem do gateway
    // sem `maxContentLength` e o tamanho é desconhecido e ilimitado.
    assert.equal(config.whatsappMediaMaxBytes, 8388608);
    assert.equal(config.whatsappPendingNoticeMax, 3);
    assert.equal(config.whatsappPendingNoticeTtlMs, 259200000);
  });
});

// =================================================================================================
// REGISTROS ESTRUTURAIS — a única guarda desta fase que não tem rede do compilador
// =================================================================================================

describe('fase 6 — registros da operação', () => {
  it('MUTAÇÃO (e): a operação está em CHANNEL_LANE_OPERATIONS, e o assert de import derruba o processo se sair', async () => {
    // A presença aqui é o que faz o job ser reivindicado. Sem ela, numa instalação
    // `WORKER_LANE=default`+`channel`, NENHUMA raia enxerga o job: ele fica órfão para sempre, sem
    // erro nenhum no log — silêncio absoluto, que é o defeito que esta fase existe para matar.
    assert.ok(
      CHANNEL_LANE_OPERATIONS.includes(WHATSAPP_OUTBOUND_NOTICE_OPERATION),
      'a operação do aviso saiu da raia de canal'
    );

    // CONTROLE POSITIVO da mutação: o assert de import do serviço é literalmente este predicado. Se
    // alguém remover a operação da constante, o `throw` no topo do módulo impede o processo de subir
    // — a api e os dois workers. Aqui provamos que o predicado é o mesmo, e não uma cópia que possa
    // divergir em silêncio.
    const laneNames = [...CHANNEL_LANE_OPERATIONS];
    assert.equal(laneNames.filter((name) => name === WHATSAPP_OUTBOUND_NOTICE_OPERATION).length, 1);
    assert.ok(laneNames.includes('whatsapp.inbound_message'), 'a raia perdeu a operação da fase 3');
  });

  it('retry e prioridade são EXPLÍCITOS — o default de operação desconhecida seria um defeito herdado', () => {
    const retry = getRetryConfig(WHATSAPP_OUTBOUND_NOTICE_OPERATION);
    assert.equal(retry.maxAttempts, 8);
    assert.equal(retry.strategy, 'exponential');
    assert.equal(retry.baseDelayMs, 15000);
    // O default herdaria 300000 (5 min) — o mesmo defeito que o comentário de
    // `whatsapp.inbound_message` já nomeou.
    assert.equal(retry.maxDelayMs, 120000);
    assert.notEqual(retry.maxDelayMs, getRetryConfig('operacao.inexistente').maxDelayMs);

    // ACIMA do turno de conversa (2), ABAIXO de qualquer operação CETESB: o aviso nunca preempta o
    // trabalho que ele descreve.
    assert.equal(calculateJobPriority(WHATSAPP_OUTBOUND_NOTICE_OPERATION), 3);
    assert.ok(calculateJobPriority(WHATSAPP_OUTBOUND_NOTICE_OPERATION) > calculateJobPriority('whatsapp.inbound_message'));
    assert.ok(calculateJobPriority(WHATSAPP_OUTBOUND_NOTICE_OPERATION) < calculateJobPriority('manifest.print'));
  });
});

// =================================================================================================
// ENFILEIRAMENTO — dedupe pelo BANCO e promessa soldada ao mecanismo
// =================================================================================================

describe('fase 6 — enfileiramento do aviso', () => {
  it('um TICKET = um job de aviso, com `command_id` derivado do ticket (restrições 3 e 5 na mesma linha)', async () => {
    const inserts = [];
    setWhatsAppNoticeDependenciesForTests({
      // O double é o BANCO: devolve `created: false` quando o `command_id` já existe, que é
      // exatamente o que `on conflict (command_id) do nothing` faz.
      insertJobIfCommandAbsent: async (input) => {
        const duplicated = inserts.some((entry) => entry.commandId === input.commandId);
        inserts.push(input);
        return { job: duplicated ? null : { jobId: input.jobId }, created: !duplicated };
      },
      now: () => 5_000_000
    });

    const base = {
      ticketId: TICKET_ID,
      userId: USER_ID,
      channelLinkId: LINK_ID,
      riskTier: 'N1',
      actionKey: 'manifest.batch_print_selected',
      headline: '2a via de 5 MTRs',
      itemCount: 5,
      labels: ['MTR 1', 'MTR 2', 'MTR 3', 'MTR 4', 'MTR 5'],
      // LOTE DE 5: cinco jobs de ação, UM aviso — não cinco mensagens pagas.
      dispatchedJobIds: ['job_1', 'job_2', 'job_3', 'job_4', 'job_5'],
      correlationId: 'corr_1',
      integrationAccountId: 'iac_1',
      sessionContextId: 'sct_1'
    };

    assert.equal(await enqueueWhatsAppOutboundNotice(base), true);
    // Reprocesso do turno de confirmação (retry do `whatsapp.inbound_message`): o INSERT devolve
    // `created: false` e nenhum segundo aviso nasce. Não há `if` para neutralizar.
    assert.equal(await enqueueWhatsAppOutboundNotice(base), true);

    assert.equal(inserts.length, 2, 'as duas tentativas chegaram ao banco');
    assert.equal(inserts[0].commandId, `wa:notice:${TICKET_ID}`);
    assert.equal(inserts[1].commandId, inserts[0].commandId, 'a chave é a MESMA — é o unique que decide');
    assert.equal(inserts[0].operation, WHATSAPP_OUTBOUND_NOTICE_OPERATION);
    assert.equal(inserts[0].entityId, TICKET_ID);
  });

  it('o TELEFONE não entra no payload do aviso — nem cru, nem mascarado (restrição 4)', async () => {
    let captured = null;
    setWhatsAppNoticeDependenciesForTests({
      insertJobIfCommandAbsent: async (input) => { captured = input; return { job: { jobId: 'j' }, created: true }; },
      now: () => 5_000_000
    });

    await enqueueWhatsAppOutboundNotice({
      ticketId: TICKET_ID,
      userId: USER_ID,
      channelLinkId: LINK_ID,
      riskTier: 'N1',
      actionKey: 'print_manifest',
      headline: '2a via de 1 MTR',
      itemCount: 1,
      labels: ['MTR 202600123456'],
      dispatchedJobIds: ['job_1'],
      correlationId: 'corr_1',
      integrationAccountId: 'iac_1',
      sessionContextId: 'sct_1'
    });

    const serialized = JSON.stringify(captured);
    // AUSÊNCIA da string CRUA — não só a presença de algo mascarado.
    assert.equal(serialized.includes(PHONE), false, 'telefone cru no payload do job de aviso');
    assert.equal(serialized.includes('987654321'), false);
    assert.equal(captured.payload.channelLinkId, LINK_ID, 'o destinatário viaja como id opaco');
    // O prazo é RELÓGIO DE PAREDE, gravado na criação: contar por tentativas mentiria depois de uma
    // parada da plataforma.
    assert.equal(captured.payload.confirmedAt, new Date(5_000_000).toISOString());
    assert.equal(captured.payload.deadlineAt, new Date(5_600_000).toISOString());
  });

  it('sem job despachado NÃO nasce aviso — `manifest.replicate_segmented` cai de graça, sem `if` por intent', async () => {
    let called = false;
    setWhatsAppNoticeDependenciesForTests({
      insertJobIfCommandAbsent: async () => { called = true; return { job: null, created: true }; }
    });

    const enqueued = await enqueueWhatsAppOutboundNotice({
      ticketId: TICKET_ID,
      userId: USER_ID,
      channelLinkId: LINK_ID,
      riskTier: 'N1',
      actionKey: 'manifest.replicate_segmented',
      headline: 'Replicar em 2 rascunhos',
      itemCount: 2,
      labels: [],
      dispatchedJobIds: [],
      correlationId: null,
      integrationAccountId: null,
      sessionContextId: null
    });

    assert.equal(enqueued, false);
    assert.equal(called, false, 'nada foi para a fila');
  });

  it('INSERT que falha devolve `false` — e é esse booleano que impede a promessa', async () => {
    setWhatsAppNoticeDependenciesForTests({
      insertJobIfCommandAbsent: async () => { throw new Error('conexao caiu'); }
    });

    const enqueued = await enqueueWhatsAppOutboundNotice({
      ticketId: TICKET_ID,
      userId: USER_ID,
      channelLinkId: LINK_ID,
      riskTier: 'N1',
      actionKey: 'print_manifest',
      headline: '2a via de 1 MTR',
      itemCount: 1,
      labels: [],
      dispatchedJobIds: ['job_1'],
      correlationId: null,
      integrationAccountId: null,
      sessionContextId: null
    });

    assert.equal(enqueued, false, 'falhar no INSERT não pode derrubar a confirmação, mas muda o texto');
  });
});

// =================================================================================================
// MUTAÇÃO (g) — PROMESSA SOLDADA AO MECANISMO
// =================================================================================================

describe('fase 6 — o texto de confirmação só promete com mecanismo', () => {
  it('MUTAÇÃO (g): sem job de aviso o texto NÃO promete; com job, promete', () => {
    const base = { headline: '2a via de 1 MTR', itemCount: 1, ticketId: TICKET_ID };

    const semAviso = buildWhatsAppConfirmedText({ ...base, noticeEnqueued: false });
    assert.ok(semAviso.includes('Ainda nao consigo te avisar por aqui quando terminar'));
    assert.equal(semAviso.includes('Te aviso aqui'), false, 'prometeu sem mecanismo');

    const comAviso = buildWhatsAppConfirmedText({ ...base, noticeEnqueued: true });
    assert.ok(comAviso.includes('Te aviso aqui assim que terminar'));
    assert.ok(comAviso.includes('deu certo ou nao'), 'a promessa cobre falha, não só sucesso');
    assert.equal(comAviso.includes('Ainda nao consigo'), false);

    // CONTROLE NEGATIVO: `undefined` (chamador antigo, ou refactor que perde o parâmetro) NÃO
    // promete. Passar `true` fixo é a porta dos fundos que esta asserção fecha.
    const semParametro = buildWhatsAppConfirmedText(base);
    assert.equal(semParametro, semAviso, 'a ausência do parâmetro tem de cair no texto honesto');

    // Nenhuma das duas versões inventa prazo: a duração da chamada à CETESB não é medida no repo.
    for (const text of [semAviso, comAviso]) {
      assert.equal(/\b\d+\s*(minuto|segundo|hora)/i.test(text), false, 'prometeu prazo que ninguém mediu');
    }
  });
});

// =================================================================================================
// MUTAÇÃO (a) — JANELA DE 24 h COM MARGEM
// =================================================================================================

describe('fase 6 — janela de 24 h', () => {
  it('MUTAÇÃO NEUTRA (a): mover a margem de 23 h para 24 h quebra este caso', () => {
    const confirmedAt = new Date(0).toISOString();

    assert.equal(isChannelWindowOpen(confirmedAt, 1 * HOUR), true, 'uma hora depois a janela está aberta');
    assert.equal(isChannelWindowOpen(confirmedAt, 22.9 * HOUR), true);

    // ⚠️ AQUI mora a mutação NEUTRA. Com margem de 24 h este ponto passaria a ser "aberta" e o caso
    // quebra. Uma mutação GROSSEIRA (desligar a checagem inteira) mascararia isto — por isso o ponto
    // é 23,5 h e não 30 h.
    assert.equal(isChannelWindowOpen(confirmedAt, 23.5 * HOUR), false, 'a margem de 1 h sumiu');
    assert.equal(isChannelWindowOpen(confirmedAt, 25 * HOUR), false);

    // FAIL-CLOSED: âncora ilegível é janela FECHADA. A direção do erro é escolhida — errar para
    // "fechada" custa um aviso que ia de graça; errar para "aberta" custa recusa do provedor, retry
    // inútil e silêncio.
    assert.equal(isChannelWindowOpen(null, 0), false);
    assert.equal(isChannelWindowOpen('nao-e-data', 0), false);
    assert.equal(isChannelWindowOpen(undefined, 0), false);
  });

  it('janela ABERTA: sai `sendText`; `sendTemplate` fica ZERADO', async () => {
    const job = noticeJob();
    const harness = createHarness({ now: 1_000_000 + 60_000 });

    const result = await runWhatsAppOutboundNotice({ job, patchJobPayload: harness.patchJobPayload });

    assert.equal(harness.fake.calls.sendText.length, 1);
    assert.equal(harness.fake.calls.sendText[0].to, PHONE);
    // ⚠️ SEM ESTA ASSERÇÃO o fallback do adapter Twilio (que renderiza `{{n}}` e posta como texto
    // livre quando o nome do template não é um SID `HX…`) deixaria a suíte verde e a produção muda.
    assert.equal(harness.fake.calls.sendTemplate.length, 0, 'sendTemplate JAMAIS é chamado nesta fase');
    assert.equal(harness.fake.calls.sendMedia.length, 0, 'sem artefato de documento não existe mídia a enviar');
    assert.equal(result.outcome, 'whatsapp_notice_succeeded');
    assert.equal(result.patch.userNotified, true);
    // O texto some de `jobs` no caminho feliz: ele nomeia MTR, gerador e datas.
    assert.equal(result.patch.noticeText, null);
  });

  it('janela FECHADA: NENHUM envio, skip no livro-razão, dívida enfileirada, e o job SUCEDE', async () => {
    const job = noticeJob();
    // 30 h depois da confirmação.
    const harness = createHarness({ now: 1_000_000 + 30 * HOUR });

    const result = await runWhatsAppOutboundNotice({ job, patchJobPayload: harness.patchJobPayload });

    assert.equal(harness.fake.calls.sendText.length, 0, 'texto livre fora da janela é recusado pelo provedor');
    assert.equal(harness.fake.calls.sendTemplate.length, 0, 'o caminho de template foi RECUSADO nesta fase');
    assert.equal(harness.fake.calls.sendMedia.length, 0);

    assert.equal(result.outcome, 'whatsapp_notice_outside_window');
    assert.equal(result.patch.noticeSkipped, 'outside_window');
    assert.equal(result.patch.userNotified, false);

    // A dívida existe, e carrega o TEXTO (não o telefone).
    assert.equal(harness.enqueuedDebt.length, 1);
    assert.equal(harness.enqueuedDebt[0].channelLinkId, LINK_ID);
    assert.ok(harness.enqueuedDebt[0].text.includes('2a via de 1 MTR'));
    assert.equal(harness.enqueuedDebt[0].text.includes(PHONE), false);

    const metrics = await readChannelOutboundNoticeMetricsForTests();
    assert.ok(metrics.some((entry) => entry.path === 'skipped_outside_window' && entry.value === 1));
  });
});

// =================================================================================================
// MUTAÇÃO (b) — NÃO NOTIFICAR DUAS VEZES
// =================================================================================================

describe('fase 6 — livro-razão de entrega', () => {
  it('MUTAÇÃO (b): rodar o handler DUAS vezes sobre o mesmo payload envia EXATAMENTE UMA vez', async () => {
    const job = noticeJob();
    const harness = createHarness();

    const first = await runWhatsAppOutboundNotice({ job, patchJobPayload: harness.patchJobPayload });
    assert.equal(harness.fake.calls.sendText.length, 1);

    // `finishJob` faz MERGE de `result.patch` no payload (`{ ...job.payload, ...patch }`) — é assim
    // que `noticeSentAt` chega ao banco. Simular isso é o que torna a segunda execução um RETRY de
    // verdade (`requeueStaleRunningJobs`, ou reivindicação depois de um crash pós-conclusão).
    Object.assign(job.payload, first.patch);

    const second = await runWhatsAppOutboundNotice({ job, patchJobPayload: harness.patchJobPayload });

    assert.equal(harness.fake.calls.sendText.length, 1, 'o retry reenviou o aviso');
    assert.equal(harness.fake.calls.sendTemplate.length, 0);
    assert.equal(second.outcome, 'whatsapp_notice_already_sent');
  });

  it('crash ENTRE o envio e a conclusão não reenvia: `noticeTextSentAt` é carimbo próprio do texto', async () => {
    const job = noticeJob();
    const harness = createHarness();

    // Primeira execução vai até o fim, mas o `finishJob` NÃO acontece (o processo morreu): o payload
    // fica com o que foi patcheado INCREMENTALMENTE — `noticeText`, `sendAttempts`, `noticeTextSentAt`
    // — e SEM `noticeSentAt`. O caminho rápido não dispara, e é o carimbo do texto que segura.
    await runWhatsAppOutboundNotice({ job, patchJobPayload: harness.patchJobPayload });
    assert.ok(job.payload.noticeTextSentAt, 'o carimbo do texto tem de ser incremental, não do finishJob');
    assert.equal(job.payload.noticeSentAt, undefined);

    const retry = await runWhatsAppOutboundNotice({ job, patchJobPayload: harness.patchJobPayload });

    assert.equal(harness.fake.calls.sendText.length, 1, 'mensagem paga duplicada dizendo a mesma coisa');
    assert.equal(retry.patch.userNotified, true);
  });

  it('PERSISTE → ENVIA → CARIMBA: `noticeText` antes do envio, `sendAttempts` antes da chamada', async () => {
    const order = [];
    const job = noticeJob();
    const harness = createHarness({
      providerOverrides: {
        sendText: () => { order.push('send'); return { providerMessageId: 'wamid.X' }; }
      }
    });
    const patchJobPayload = async (target, patch) => {
      if (patch.noticeText) order.push('prepare');
      if (patch.sendAttempts) order.push(`attempts:${patch.sendAttempts}`);
      if (patch.noticeTextSentAt) order.push('stamp');
      Object.assign(target.payload, patch);
      harness.patches.push(patch);
    };

    await runWhatsAppOutboundNotice({ job, patchJobPayload });

    assert.deepEqual(order, ['prepare', 'attempts:1', 'send', 'stamp'],
      'inverter qualquer par transforma retry de ENTREGA em retry de composição');
  });

  it('falha de envio ANTES da última tentativa LANÇA (retry de entrega); na ÚLTIMA, conclui sem DLQ', async () => {
    const explode = () => { const error = new Error('provider indisponivel'); error.code = 'ETIMEDOUT'; throw error; };

    const job = noticeJob({ attempts: 2, maxAttempts: 8 });
    const harness = createHarness({ providerOverrides: { sendText: explode } });
    await assert.rejects(
      () => runWhatsAppOutboundNotice({ job, patchJobPayload: harness.patchJobPayload }),
      /provider indisponivel/
    );

    // ÚLTIMA tentativa: `shouldMoveToDLQ` é `attempts >= maxAttempts`. Lançar aqui mandaria o AVISO
    // para a DLQ — silêncio sobre o silêncio.
    const lastJob = noticeJob({ attempts: 8, maxAttempts: 8 });
    const lastHarness = createHarness({ providerOverrides: { sendText: explode } });
    const result = await runWhatsAppOutboundNotice({ job: lastJob, patchJobPayload: lastHarness.patchJobPayload });

    assert.equal(result.outcome, 'whatsapp_notice_undeliverable');
    assert.equal(result.patch.userNotified, false);
  });

  it('jobs pendentes com prazo de pé REAGENDAM sem enviar nada; prazo vencido entrega o parcial e SUCEDE', async () => {
    const jobs = { job_1: jobRow('job_1', 'succeeded'), job_2: jobRow('job_2', 'running') };

    const pendingJob = noticeJob({ payload: { dispatchedJobIds: ['job_1', 'job_2'], itemCount: 2 } });
    const pendingHarness = createHarness({ jobs, now: 1_000_000 + 60_000 });
    await assert.rejects(
      () => runWhatsAppOutboundNotice({ job: pendingJob, patchJobPayload: pendingHarness.patchJobPayload }),
      /Aguardando 1 job/
    );
    assert.equal(pendingHarness.fake.calls.sendText.length, 0, 'reagendar não pode enviar nada');

    // Mesmo estado, prazo de PAREDE vencido (o job dormiu porque a plataforma esteve fora).
    const expiredJob = noticeJob({ payload: { dispatchedJobIds: ['job_1', 'job_2'], itemCount: 2 } });
    const expiredHarness = createHarness({ jobs, now: 1_000_000 + 12 * HOUR });
    const result = await runWhatsAppOutboundNotice({ job: expiredJob, patchJobPayload: expiredHarness.patchJobPayload });

    assert.equal(result.outcome, 'whatsapp_notice_timeout');
    assert.equal(expiredHarness.fake.calls.sendText.length, 1);
    assert.ok(expiredHarness.fake.calls.sendText[0].text.includes('ainda nao terminou'));
    assert.ok(expiredHarness.fake.calls.sendText[0].text.includes('1 de 2'));
  });
});

// =================================================================================================
// VÍNCULO — revogação e TRANSFERÊNCIA DE POSSE
// =================================================================================================

describe('fase 6 — releitura do vínculo', () => {
  it('vínculo revogado/pendente NÃO recebe aviso', async () => {
    for (const link of [null, { verificationStatus: 'pending' }, { userId: null }]) {
      const job = noticeJob();
      const harness = createHarness({ link });
      const result = await runWhatsAppOutboundNotice({ job, patchJobPayload: harness.patchJobPayload });

      assert.equal(harness.fake.calls.sendText.length, 0);
      assert.equal(harness.fake.calls.sendMedia.length, 0);
      assert.equal(result.outcome, 'whatsapp_notice_link_revoked');
    }
  });

  it('vínculo TRANSFERIDO (o chip trocou de dono) NÃO recebe aviso — seria vazamento de documento fiscal alheio', async () => {
    const job = noticeJob();
    // A fase 2 permite transferência por posse comprovada, e o número é reciclado por operadora.
    const harness = createHarness({ link: { userId: 'usr_OUTRO' } });

    const result = await runWhatsAppOutboundNotice({ job, patchJobPayload: harness.patchJobPayload });

    assert.equal(result.outcome, 'whatsapp_notice_link_transferred');
    assert.equal(harness.fake.calls.sendText.length, 0);
    assert.equal(harness.fake.calls.sendMedia.length, 0);
    assert.equal(harness.fake.calls.sendTemplate.length, 0);

    // CONTROLE NEGATIVO: o MESMO cenário com o dono certo entrega.
    const okJob = noticeJob();
    const okHarness = createHarness();
    await runWhatsAppOutboundNotice({ job: okJob, patchJobPayload: okHarness.patchJobPayload });
    assert.equal(okHarness.fake.calls.sendText.length, 1);
  });
});

// =================================================================================================
// ENTREGA DE ARQUIVO — MUTAÇÃO (d) e as recusas conscientes
// =================================================================================================

describe('fase 6 — entrega de arquivo', () => {
  const ARTIFACT = {
    artifactId: 'cart_1',
    mimeType: 'application/pdf',
    fileName: 'mtr_202600123456.pdf',
    storagePath: '/data/storage/documents/man_1/mtr.pdf',
    status: 'available'
  };

  function mediaHarness(extra = {}) {
    setConfigOverride('whatsappMediaDeliveryEnabled', true);
    return createHarness({
      jobs: { job_1: jobRow('job_1', 'succeeded', { payload: { conversationArtifactId: 'cart_1' } }) },
      artifacts: { cart_1: ARTIFACT },
      ...extra
    });
  }

  it('com a política LIGADA e provedor Meta: 1 documento ⇒ UMA mensagem (o texto é a legenda)', async () => {
    const job = noticeJob();
    const harness = mediaHarness();

    const result = await runWhatsAppOutboundNotice({ job, patchJobPayload: harness.patchJobPayload });

    assert.equal(harness.fake.calls.sendMedia.length, 1);
    assert.equal(harness.fake.calls.sendText.length, 0, '1 documento não pode custar duas mensagens');
    assert.equal(harness.fake.calls.sendTemplate.length, 0);
    assert.ok(harness.fake.calls.sendMedia[0].caption.includes('anexado nesta mensagem'));
    assert.ok(Buffer.isBuffer(harness.fake.calls.sendMedia[0].content), 'bytes, nunca URL');
    assert.equal(harness.fake.calls.sendMedia[0].mediaUrl, undefined, 'nenhuma URL pública é construída');
    assert.equal(result.patch.userNotified, true);

    // O escopo do artefato veio do PRINCIPAL DO TICKET e exigiu eixo POSITIVO.
    const artifactRead = harness.readCalls.find((entry) => entry.artifactId);
    assert.equal(artifactRead.requirePositiveAxis, true);
    assert.equal(artifactRead.integrationAccountId, 'iac_1');
  });

  it('MUTAÇÃO (d): `fs.stat` roda ANTES do `readFile` — trocar por `readFile`+`.length` quebra este caso', async () => {
    setConfigOverride('whatsappMediaDeliveryEnabled', true);
    const job = noticeJob();
    // Arquivo ACIMA do teto. `readFile` deste harness registra a chamada; se o código lesse antes de
    // medir, o registro apareceria — e num pod de 2Gi compartilhado com o turno de LLM isso é o OOM
    // que este módulo já teve.
    const harness = createHarness({
      jobs: { job_1: jobRow('job_1', 'succeeded', { payload: { conversationArtifactId: 'cart_1' } }) },
      artifacts: { cart_1: ARTIFACT },
      fileSize: 20 * 1024 * 1024
    });

    const result = await runWhatsAppOutboundNotice({ job, patchJobPayload: harness.patchJobPayload });

    assert.equal(harness.statCalls.length, 1, 'o arquivo não foi MEDIDO');
    assert.equal(
      harness.readCalls.some((entry) => entry.readFile),
      false,
      'leu o arquivo inteiro em memória antes de saber o tamanho'
    );

    // Degrada para o texto honesto, não para meia entrega.
    assert.equal(harness.fake.calls.sendMedia.length, 0);
    assert.equal(harness.fake.calls.sendText.length, 1);
    assert.ok(harness.fake.calls.sendText[0].text.includes('nao consigo te mandar o arquivo desta vez'));
    assert.equal(result.patch.userNotified, true);

    // A métrica é OBRIGATÓRIA: sem ela a degradação é invisível e o teto nunca é calibrado.
    const metrics = await readChannelOutboundNoticeMetricsForTests();
    assert.ok(metrics.some((entry) => entry.path === 'skipped_media_oversize' && entry.value === 1));
  });

  it('política DESLIGADA por env: `sendMedia` ZERADO, texto honesto, e o rótulo é o de POLÍTICA', async () => {
    setConfigOverride('whatsappMediaDeliveryEnabled', false);
    const job = noticeJob();
    const harness = createHarness({
      jobs: { job_1: jobRow('job_1', 'succeeded', { payload: { conversationArtifactId: 'cart_1' } }) },
      artifacts: { cart_1: ARTIFACT }
    });

    await runWhatsAppOutboundNotice({ job, patchJobPayload: harness.patchJobPayload });

    assert.equal(harness.fake.calls.sendMedia.length, 0);
    assert.equal(harness.fake.calls.sendText.length, 1);
    assert.ok(harness.fake.calls.sendText[0].text.includes('o download fica em *MTRs* no SICAT'));

    // MUTAÇÃO (discriminador de path): este caso e o do Twilio abaixo se testam UM CONTRA O OUTRO.
    // Colapsar os dois ramos num rótulo só (o defeito que este par existe para matar) quebra um dos
    // dois `equal(..., false)`.
    const metrics = await readChannelOutboundNoticeMetricsForTests();
    assert.ok(metrics.some((entry) => entry.path === 'skipped_media_disabled' && entry.value === 1));
    assert.equal(metrics.some((entry) => entry.path === 'skipped_media_provider_unsupported'), false,
      'política desligada não pode se disfarçar de provedor incapaz');
  });

  it('`WHATSAPP_NOTICE_MAX_DOCUMENTS=0` desliga arquivo sem tocar em código — e conta como POLÍTICA', async () => {
    setConfigOverride('whatsappMediaDeliveryEnabled', true);
    setConfigOverride('whatsappNoticeMaxDocuments', 0);
    const job = noticeJob();
    const harness = createHarness({
      jobs: { job_1: jobRow('job_1', 'succeeded', { payload: { conversationArtifactId: 'cart_1' } }) },
      artifacts: { cart_1: ARTIFACT }
    });

    await runWhatsAppOutboundNotice({ job, patchJobPayload: harness.patchJobPayload });
    assert.equal(harness.fake.calls.sendMedia.length, 0);
    assert.equal(harness.fake.calls.sendText.length, 1);

    // Teto 0 é desligamento POR CONFIG, não excesso de itens: o rótulo é o de política.
    const metrics = await readChannelOutboundNoticeMetricsForTests();
    assert.ok(metrics.some((entry) => entry.path === 'skipped_media_disabled' && entry.value === 1));
    assert.equal(metrics.some((entry) => entry.path === 'skipped_media_over_cap'), false);
  });

  it('TWILIO com documento disponível: texto (2), rótulo de PROVEDOR INCAPAZ e warn mascarado', async () => {
    setConfigOverride('whatsappMediaDeliveryEnabled', true);
    const job = noticeJob();
    // O adapter real lança 501 `WHATSAPP_MEDIA_URL_REQUIRED` sem `mediaUrl`; a capacidade é conferida
    // ANTES de montar o texto, então nem se chega lá.
    const harness = createHarness({
      providerName: 'twilio',
      jobs: { job_1: jobRow('job_1', 'succeeded', { payload: { conversationArtifactId: 'cart_1' } }) },
      artifacts: { cart_1: ARTIFACT }
    });

    const warns = [];
    const originalWarn = console.warn;
    console.warn = (...args) => { warns.push(args.map((entry) => String(entry)).join(' ')); };
    let result;
    try {
      result = await runWhatsAppOutboundNotice({ job, patchJobPayload: harness.patchJobPayload });
    } finally {
      console.warn = originalWarn;
    }

    assert.equal(harness.fake.calls.sendMedia.length, 0);
    assert.equal(harness.fake.calls.sendText.length, 1);
    assert.ok(harness.fake.calls.sendText[0].text.includes('nao consigo te mandar o arquivo desta vez'));
    assert.equal(result.patch.userNotified, true);

    // MUTAÇÃO (discriminador de path): é o par deste caso com o de "política DESLIGADA" acima. Antes
    // do rótulo próprio, o operador que ligava a flag numa instalação Twilio via o comportamento não
    // mudar e a métrica dizer "disabled" — indistinguível de a flag não ter sido lida.
    const metrics = await readChannelOutboundNoticeMetricsForTests();
    assert.ok(metrics.some((entry) => entry.path === 'skipped_media_provider_unsupported' && entry.value === 1));
    assert.equal(metrics.some((entry) => entry.path === 'skipped_media_disabled'), false,
      'provedor incapaz não pode se disfarçar de política desligada');

    // O warn é o sinal humano do mesmo ramo — com o telefone SEMPRE mascarado por maskChannelUserKey.
    const warn = warns.find((line) => line.includes('nao aceita bytes'));
    assert.ok(warn, 'o ramo do provedor incapaz tem de deixar sinal no log');
    assert.ok(warn.includes('twilio'), 'o warn nomeia o provedor incapaz');
    assert.ok(warn.includes('+55 11 ****-4321'), 'telefone mascarado no formato de maskChannelUserKey');
    assert.equal(warn.includes(PHONE), false, 'telefone cru no log');
  });

  it('acima do teto de ITENS degrada para texto — e a degradação é CONTADA, não invisível', async () => {
    setConfigOverride('whatsappMediaDeliveryEnabled', true);
    setConfigOverride('whatsappNoticeMaxDocuments', 1);
    const job = noticeJob({ payload: { dispatchedJobIds: ['job_1', 'job_2'], itemCount: 2 } });
    const harness = createHarness({
      jobs: {
        job_1: jobRow('job_1', 'succeeded', { payload: { conversationArtifactId: 'cart_1' } }),
        job_2: jobRow('job_2', 'succeeded', { payload: { conversationArtifactId: 'cart_2' } })
      },
      artifacts: {
        cart_1: ARTIFACT,
        cart_2: { ...ARTIFACT, artifactId: 'cart_2', fileName: 'mtr_202600123457.pdf' }
      }
    });

    const result = await runWhatsAppOutboundNotice({ job, patchJobPayload: harness.patchJobPayload });

    assert.equal(harness.fake.calls.sendMedia.length, 0, 'acima do teto é texto — nunca meia entrega');
    assert.equal(harness.fake.calls.sendText.length, 1);
    assert.equal(result.patch.userNotified, true);
    // A decisão é tomada ANTES de abrir qualquer artefato: nada é lido nem medido.
    assert.equal(harness.readCalls.length, 0, 'artefato aberto num ramo que já decidiu degradar');
    assert.equal(harness.statCalls.length, 0);

    // MUTAÇÃO: remover este registro devolve o ramo à degradação INVISÍVEL que ele tinha (retornava
    // `[]` sem métrica nenhuma). O rótulo é PRÓPRIO — não o de política nem o de provedor.
    const metrics = await readChannelOutboundNoticeMetricsForTests();
    assert.ok(metrics.some((entry) => entry.path === 'skipped_media_over_cap' && entry.value === 1));
    assert.equal(
      metrics.some((entry) => entry.path === 'skipped_media_disabled' || entry.path === 'skipped_media_provider_unsupported'),
      false,
      'excesso de itens não pode se disfarçar de política nem de capacidade'
    );
  });

  it('o ZIP do lote NUNCA vai para o celular', async () => {
    setConfigOverride('whatsappMediaDeliveryEnabled', true);
    const job = noticeJob();
    const harness = createHarness({
      jobs: { job_1: jobRow('job_1', 'succeeded', { payload: { conversationArtifactId: 'cart_zip' } }) },
      artifacts: {
        cart_zip: { ...ARTIFACT, artifactId: 'cart_zip', mimeType: 'application/zip', fileName: 'chat.zip' }
      }
    });

    await runWhatsAppOutboundNotice({ job, patchJobPayload: harness.patchJobPayload });

    // ZIP no celular é beco sem saída: a pessoa precisa repassar o MTR para cada motorista.
    assert.equal(harness.fake.calls.sendMedia.length, 0);
    assert.equal(harness.fake.calls.sendText.length, 1);
  });

  it('artefato fora de escopo/expirado degrada para texto — nunca derruba o aviso', async () => {
    setConfigOverride('whatsappMediaDeliveryEnabled', true);
    const job = noticeJob();
    const harness = createHarness({
      jobs: { job_1: jobRow('job_1', 'succeeded', { payload: { conversationArtifactId: 'cart_sumiu' } }) },
      artifacts: {}
    });

    const result = await runWhatsAppOutboundNotice({ job, patchJobPayload: harness.patchJobPayload });

    assert.equal(harness.fake.calls.sendMedia.length, 0);
    assert.equal(harness.fake.calls.sendText.length, 1);
    assert.equal(result.patch.userNotified, true, 'o desfecho ainda tem de chegar');
  });
});

// =================================================================================================
// MUTAÇÃO (c) — `authorizeArtifactScope`
// =================================================================================================

describe('fase 6 — escopo do artefato (a metade da L6 que estava aberta)', () => {
  const scopedArtifact = {
    id: 'cart_1',
    integrationAccountId: 'iac_A',
    sessionContextId: 'sct_A'
  };

  it('MUTAÇÃO (c1): artefato COM conta + chamador SEM conta ⇒ 403 (antes passava em branco)', async () => {
    await assert.rejects(
      () => authorizeArtifactScope({
        artifact: { ...scopedArtifact, sessionContextId: null },
        integrationAccountId: null,
        sessionContextId: 'sct_QUALQUER'
      }),
      (error) => error.code === 'CONVERSATION_ARTIFACT_SCOPE_FORBIDDEN'
    );

    // CONTROLE NEGATIVO desta mutação: a MESMA chamada com a conta certa passa. É isso que garante
    // que o fechamento é ASSIMÉTRICO e não pode negar chamador corretamente escopado.
    await authorizeArtifactScope({
      artifact: { ...scopedArtifact, sessionContextId: null },
      integrationAccountId: 'iac_A',
      sessionContextId: null
    });
  });

  it('MUTAÇÃO (c2): artefato COM sessão + chamador SEM sessão ⇒ 403 — teste DISTINTO do eixo de conta', async () => {
    await assert.rejects(
      () => authorizeArtifactScope({
        artifact: { ...scopedArtifact, integrationAccountId: null },
        integrationAccountId: 'iac_QUALQUER',
        sessionContextId: null
      }),
      (error) => error.code === 'CONVERSATION_ARTIFACT_SCOPE_FORBIDDEN'
    );

    await authorizeArtifactScope({
      artifact: { ...scopedArtifact, integrationAccountId: null },
      integrationAccountId: null,
      sessionContextId: 'sct_A'
    });
  });

  it('conta DIFERENTE continua sendo 403 (a guarda antiga não foi perdida)', async () => {
    await assert.rejects(
      () => authorizeArtifactScope({ artifact: scopedArtifact, integrationAccountId: 'iac_B', sessionContextId: 'sct_A' }),
      (error) => error.code === 'CONVERSATION_ARTIFACT_SCOPE_FORBIDDEN'
    );
  });

  it('CONTROLE NEGATIVO GLOBAL: artefato legado sem escopo + chamador in-app sem conta CONTINUA passando', async () => {
    // Esta é a restrição de não quebrar o chat nativo. Exigir eixo positivo GLOBALMENTE negaria
    // artefatos legados com os três eixos nulos, que o copiloto in-app acessa. Contar essas linhas e
    // decidir com NÚMERO é item de fase 7 — até lá, a guarda global é só a assimétrica.
    await authorizeArtifactScope({
      artifact: { id: 'cart_legado', integrationAccountId: null, sessionContextId: null },
      integrationAccountId: null,
      sessionContextId: null
    });
  });

  it('NO CANAL a exigência é de EIXO POSITIVO: zero comparações efetivas ⇒ recusa', async () => {
    await assert.rejects(
      () => authorizeArtifactScope({
        artifact: { id: 'cart_legado', integrationAccountId: null, sessionContextId: null },
        integrationAccountId: 'iac_A',
        sessionContextId: 'sct_A',
        requirePositiveAxis: true
      }),
      (error) => error.code === 'CONVERSATION_ARTIFACT_SCOPE_FORBIDDEN'
    );

    // CONTROLE NEGATIVO: um eixo positivo basta.
    await authorizeArtifactScope({
      artifact: { id: 'cart_1', integrationAccountId: 'iac_A', sessionContextId: null },
      integrationAccountId: 'iac_A',
      sessionContextId: null,
      requirePositiveAxis: true
    });
  });

  it('artefato inexistente é 404, nunca 200', async () => {
    await assert.rejects(
      () => authorizeArtifactScope({ artifact: null, integrationAccountId: 'iac_A', sessionContextId: 'sct_A' }),
      (error) => error.code === 'CONVERSATION_ARTIFACT_NOT_FOUND'
    );
  });
});

// =================================================================================================
// MUTAÇÃO (f) — TEXTOS
// =================================================================================================

describe('fase 6 — textos do aviso', () => {
  const base = {
    headline: '2a via de 1 MTR',
    ticketId: TICKET_ID,
    itemTotal: 1,
    itemCompleted: 0,
    labels: ['MTR 202600123456'],
    documentCount: 0,
    attempts: 5,
    errorCode: 'CETESB_HTTP_ERROR'
  };

  it('MUTAÇÃO (f): trocar o texto de falha N2 pelo de N1 quebra — "*Nada mudou na CETESB*" é SÓ N1', () => {
    const n1 = buildWhatsAppNoticeText('failed', { ...base, tier: 'N1' });
    const n2 = buildWhatsAppNoticeText('failed', { ...base, tier: 'N2', headline: 'Emitir 1 MTR na CETESB' });

    // Em N1 o código SABE: `manifest.print` busca 2ª via de documento que já existe.
    assert.ok(n1.includes('*Nada mudou na CETESB*'));
    assert.ok(n1.includes('nenhum MTR foi criado'));

    // Em N2 a MESMA frase seria potencialmente MENTIRA: o MTR pode ter nascido e o job ter falhado
    // depois, no parse ou na persistência — e o código não sabe a diferença.
    assert.equal(n2.includes('Nada mudou na CETESB'), false, 'afirmou sobre a CETESB sem evidência');
    assert.ok(n2.includes('A CETESB nao confirmou a emissao'));
    assert.ok(n2.includes('Confira em MTRs no SICAT antes de emitir de novo'));
    assert.ok(n2.includes('cancelar nao tem volta'));
  });

  it('DLQ diz que NÃO vai se resolver sozinho; falha diz que costuma ser passageiro', () => {
    const failed = buildWhatsAppNoticeText('failed', { ...base, tier: 'N1' });
    const dlq = buildWhatsAppNoticeText('dlq', { ...base, tier: 'N1' });

    assert.ok(failed.includes('me peca de novo daqui a pouco'));
    assert.ok(dlq.includes('parei de tentar'));
    assert.ok(dlq.includes('Nao precisa esperar por mim'));
    assert.notEqual(failed, dlq, 'a diferença que importa não é técnica, é de ação');
  });

  it('a contagem parcial vem da FONTE (`itemCompleted`/`itemTotal`), nunca de `labels.length`', () => {
    const text = buildWhatsAppNoticeText('partial', {
      ...base,
      tier: 'N1',
      itemTotal: 3,
      itemCompleted: 2,
      // Só UM rótulo conhecido para três itens: usar `labels.length` diria "1 de 1".
      labels: ['MTR 202600123456']
    });

    assert.ok(text.includes('2 de 3 ficaram prontos'));
    assert.equal(text.includes('1 de 1'), false);
  });

  it('`{attempts}` é o número REAL do job, nunca um literal', () => {
    assert.ok(buildWhatsAppNoticeText('failed', { ...base, tier: 'N1', attempts: 3 }).includes('Tentei 3 vezes'));
    assert.ok(buildWhatsAppNoticeText('failed', { ...base, tier: 'N1', attempts: 1 }).includes('Tentei 1 vez'));
  });

  it('a causa da falha sai de ALLOWLIST — `lastErrorCode` cru nunca vira texto', () => {
    const conhecido = buildWhatsAppNoticeText('failed', { ...base, tier: 'N1', errorCode: 'CETESB_TIMEOUT' });
    assert.ok(conhecido.includes('demorou demais'));
    assert.equal(conhecido.includes('CETESB_TIMEOUT'), false);

    const desconhecido = buildWhatsAppNoticeText('failed', { ...base, tier: 'N1', errorCode: 'PG_23505_WEIRD' });
    assert.ok(desconhecido.includes('Nao consegui concluir'));
    assert.equal(desconhecido.includes('PG_23505_WEIRD'), false, 'código de erro cru na tela de quem está no pátio');

    assert.equal(describeNoticeFailureCause(null), 'Nao consegui concluir');
  });

  it('CONVENÇÕES DO CANAL: `Protocolo:` uma única vez e no fim, sem URL, sem telefone, sem id interno', () => {
    const outcomes = ['succeeded', 'partial', 'failed', 'dlq', 'timeout'];
    for (const tier of ['N1', 'N2']) {
      for (const outcome of outcomes) {
        const text = buildWhatsAppNoticeText(outcome, {
          ...base,
          tier,
          itemTotal: 3,
          itemCompleted: 1,
          documentCount: 0
        });

        const protocolos = text.split('\n').filter((line) => line.startsWith('Protocolo:'));
        assert.equal(protocolos.length, 1, `${tier}/${outcome}: protocolo repetido`);
        assert.ok(text.trimEnd().endsWith(`Protocolo: ${TICKET_ID}`), `${tier}/${outcome}: protocolo fora do fim`);

        assert.equal(/https?:\/\//.test(text), false, `${tier}/${outcome}: URL nua — o WhatsApp auto-linka e a rota devolve 401`);
        assert.equal(text.includes(PHONE), false, `${tier}/${outcome}: telefone no texto`);
        assert.equal(/\bman_[0-9a-f]{6}/.test(text), false, `${tier}/${outcome}: id interno no texto`);
        assert.equal(text.includes('reasonCode'), false);
        assert.equal(text.includes('correlationId'), false);
        // AUTOSSUFICIENTE: nunca referencia a conversa.
        assert.equal(/conforme voc[eê]|como voc[eê] (pediu|perguntou)/i.test(text), false);
      }
    }
  });

  it('sucesso COM anexo × SEM anexo dizem coisas diferentes, e nenhum promete o que não sai', () => {
    const comAnexo = buildWhatsAppNoticeText('succeeded', { ...base, tier: 'N1', itemCompleted: 1, documentCount: 1 });
    const semAnexo = buildWhatsAppNoticeText('succeeded', { ...base, tier: 'N1', itemCompleted: 1, documentCount: 0 });

    assert.ok(comAnexo.includes('O PDF vai anexado nesta mensagem'));
    assert.equal(semAnexo.includes('anexado'), false, 'prometeu anexo que não vai sair');
    assert.ok(semAnexo.includes('o download fica em *MTRs* no SICAT'));

    const lote = buildWhatsAppNoticeText('succeeded', {
      ...base, tier: 'N1', itemTotal: 3, itemCompleted: 3, documentCount: 3
    });
    assert.ok(lote.includes('Mando os 3 PDFs nas proximas mensagens'));
  });
});

// =================================================================================================
// AGREGAÇÃO
// =================================================================================================

describe('fase 6 — agregação do desfecho', () => {
  it('classifica sucesso, parcial, falha, DLQ e timeout a partir das linhas CRUAS de `jobs`', () => {
    const todos = aggregateNoticeOutcome([jobRow('a', 'succeeded'), jobRow('b', 'succeeded')], { expired: true });
    assert.equal(todos.outcome, 'succeeded');
    assert.equal(todos.completed, 2);

    const parcial = aggregateNoticeOutcome([jobRow('a', 'succeeded'), jobRow('b', 'failed')], { expired: true });
    assert.equal(parcial.outcome, 'partial');

    const falhou = aggregateNoticeOutcome([jobRow('a', 'failed', { lastErrorCode: 'CETESB_TIMEOUT' })], { expired: true });
    assert.equal(falhou.outcome, 'failed');
    assert.equal(falhou.errorCode, 'CETESB_TIMEOUT');

    const dlq = aggregateNoticeOutcome([jobRow('a', 'dlq')], { expired: true });
    assert.equal(dlq.outcome, 'dlq');

    // Pendente + prazo vencido = timeout, que tem texto próprio. Pendente sem prazo vencido é decidido
    // pelo chamador (reagenda) — aqui só a classificação.
    const timeout = aggregateNoticeOutcome([jobRow('a', 'succeeded'), jobRow('b', 'running')], { expired: true });
    assert.equal(timeout.outcome, 'timeout');
    assert.equal(timeout.pending, 1);

    // Job que SUMIU da tabela não pode virar sucesso.
    const sumiu = aggregateNoticeOutcome([null], { expired: true });
    assert.equal(sumiu.outcome, 'failed');
    assert.equal(sumiu.completed, 0);

    // `attempts` é o do PIOR job, e sai do dado cru.
    const attempts = aggregateNoticeOutcome(
      [jobRow('a', 'succeeded', { attempts: 1 }), jobRow('b', 'failed', { attempts: 5 })],
      { expired: true }
    );
    assert.equal(attempts.attempts, 5);
  });
});

// =================================================================================================
// `dispatchStatus` DEIXA DE MENTIR
// =================================================================================================

describe('fase 6 — o ticket para de mentir', () => {
  it('o desfecho REAL é carimbado em `metadata.dispatchStatus` ao concluir o aviso', async () => {
    const job = noticeJob({ payload: { dispatchedJobIds: ['job_1'] } });
    const harness = createHarness({ jobs: { job_1: jobRow('job_1', 'dlq') } });

    await runWhatsAppOutboundNotice({ job, patchJobPayload: harness.patchJobPayload });

    assert.equal(harness.ticketPatches.length, 1);
    const patch = harness.ticketPatches[0];
    assert.equal(patch.id, TICKET_ID);
    assert.equal(patch.userId, USER_ID);
    // Antes desta fase o ticket ficava `dispatched` PARA SEMPRE, inclusive depois da DLQ: quem
    // auditava lia "despachado" e a verdade era "morreu".
    assert.equal(patch.metadataPatch.dispatchStatus, 'dlq');
    assert.equal(patch.metadataPatch.noticeDelivery, 'text');
    assert.ok(patch.metadataPatch.outcomeAt);
  });
});

// =================================================================================================
// DÍVIDA — teto, TTL e carona
// =================================================================================================

describe('fase 6 — dívida de aviso', () => {
  it('teto e TTL são aplicados ANTES de materializar, e o descarte é CONTADO', async () => {
    const patched = [];
    let metadata = { pendingNotices: [] };
    setPendingNoticeDependenciesForTests({
      findLinkMetadata: async () => metadata,
      patchLinkMetadata: async (id, patch) => {
        patched.push(patch);
        metadata = { ...metadata, ...patch };
        return true;
      },
      now: () => 10_000_000
    });

    for (const text of ['aviso 1', 'aviso 2', 'aviso 3', 'aviso 4']) {
      await enqueuePendingChannelNotice({ channelLinkId: LINK_ID, text });
    }

    const last = patched[patched.length - 1];
    assert.equal(last.pendingNotices.length, 3, 'o teto de 3 não segurou');
    assert.equal(last.pendingNotices[2].text, 'aviso 4');
    assert.equal(last.pendingNotices[0].text, 'aviso 2', 'o mais antigo é quem sai');
    // Sem o contador, o descarte seria silencioso e ninguém saberia que alguém perdeu um desfecho.
    assert.equal(last.pendingNoticesDropped, 1);
  });

  it('entrada VENCIDA pelo TTL é descartada na leitura', () => {
    const nowMs = 10_000_000;
    const metadata = {
      pendingNotices: [
        { noticeId: 'p1', text: 'velho', createdAt: new Date(nowMs - 4 * 24 * HOUR).toISOString() },
        { noticeId: 'p2', text: 'novo', createdAt: new Date(nowMs - 1 * HOUR).toISOString() },
        { noticeId: 'p3', text: '   ', createdAt: new Date(nowMs).toISOString() }
      ]
    };

    const notices = readPendingNoticesFromMetadata(metadata, nowMs);
    assert.deepEqual(notices.map((entry) => entry.noticeId), ['p2']);
    assert.deepEqual(readPendingNoticesFromMetadata(null, nowMs), []);
    assert.deepEqual(readPendingNoticesFromMetadata({ pendingNotices: 'nao-e-array' }, nowMs), []);
  });

  it('o turno leva a dívida DE CARONA e só a limpa DEPOIS da entrega', async () => {
    const { runWhatsAppInboundTurn, setWhatsAppTurnDependenciesForTests } = await import(
      '../../src/services/conversation/channel/whatsapp/whatsapp-turn-service.js'
    );

    const nowMs = 20_000_000;
    const cleared = [];
    setPendingNoticeDependenciesForTests({
      // Double do repositório: devolve o `metadata` CRU da linha, sem saber nada de dívida.
      findLinkMetadata: async () => ({
        pendingNotices: [{ noticeId: 'p1', text: '*2a via de 1 MTR* — pronto.', createdAt: new Date(nowMs - HOUR).toISOString() }]
      }),
      patchLinkMetadata: async (id, patch) => { cleared.push({ id, patch }); return true; },
      now: () => nowMs
    });

    const fake = createFakeProvider('meta');
    const patches = [];
    setWhatsAppTurnDependenciesForTests({
      findLink: async () => ({
        id: LINK_ID,
        userId: USER_ID,
        externalUserKey: PHONE,
        verificationStatus: 'verified',
        // A dívida vem do metadata que o turno JÁ leu — nenhuma consulta nova por turno.
        metadata: {
          pendingNotices: [{ noticeId: 'p1', text: '*2a via de 1 MTR* — pronto.', createdAt: new Date(nowMs - HOUR).toISOString() }]
        }
      }),
      resolveProvider: () => fake.provider,
      insertAuditEntry: async () => ({}),
      now: () => nowMs
    });

    try {
      const result = await runWhatsAppInboundTurn({
        job: { jobId: 'job_turn', entityId: 'cimsg_1', correlationId: 'corr_1', claimedBy: 'w', payload: {
          channelLinkId: LINK_ID,
          disposition: 'greeting',
          receivedAt: new Date(nowMs).toISOString(),
          maskedUserKey: '+55 11 ****-4321'
        } },
        patchJobPayload: async (job, patch) => { patches.push(patch); Object.assign(job.payload, patch); }
      });

      // UMA mensagem: a dívida foi colada na resposta que já ia sair, sem bolha própria.
      assert.equal(fake.calls.sendText.length, 1);
      assert.equal(fake.calls.sendTemplate.length, 0);
      assert.ok(fake.calls.sendText[0].text.includes('Enquanto isso'));
      assert.ok(fake.calls.sendText[0].text.includes('2a via de 1 MTR'));

      // Limpeza SÓ DEPOIS da entrega. Inverter a ordem apagaria o desfecho antes de ele chegar.
      assert.equal(cleared.length, 1);
      assert.deepEqual(cleared[0].patch.pendingNotices, []);
      assert.equal(result.patch.userNotified, true);
    } finally {
      setWhatsAppTurnDependenciesForTests(null);
    }
  });

  it('a CARONA não gera mensagem paga e NUNCA danifica a resposta', () => {
    const block = buildWhatsAppPendingNoticeBlock(['*2a via de 1 MTR* — pronto.']);
    assert.ok(block.includes('Enquanto isso'));

    const segments = ['Resposta util da consulta.'];
    const withDebt = attachPendingNoticeBlock(segments, block);
    assert.equal(withDebt.length, 1, 'um segmento novo seria um sendText dedicado — mensagem paga');
    assert.ok(withDebt[0].startsWith('Resposta util da consulta.'));
    assert.ok(withDebt[0].includes('Enquanto isso'));

    // NÃO COUBE ⇒ `null`, e quem chama não limpa a dívida. Truncar para caber cortaria a cauda da
    // resposta que a pessoa acabou de pedir — troca ruim.
    const gigante = ['x'.repeat(3490)];
    assert.equal(attachPendingNoticeBlock(gigante, block), null);

    assert.equal(attachPendingNoticeBlock([], block), null);
    assert.equal(attachPendingNoticeBlock(segments, null), null);
    assert.equal(buildWhatsAppPendingNoticeBlock([]), null);
    assert.equal(buildWhatsAppPendingNoticeBlock(['   ']), null);
  });
});

// =================================================================================================
// A LINHA DO RENDERER — deixou de ser incondicional, mas continua honesta no default
// =================================================================================================

describe('fase 6 — a nota de arquivo do renderer', () => {
  async function renderArtifactNote() {
    const { renderStructuredResultForWhatsApp } = await import(
      '../../src/services/conversation/channel/whatsapp/whatsapp-result-renderer.js'
    );
    const rendered = renderStructuredResultForWhatsApp({
      type: 'artifact_list',
      data: { manifestId: 'm1', items: [] },
      artifacts: [{
        type: 'document',
        title: 'PDF do MTR',
        payload: {
          artifactId: 'art_1',
          status: 'available',
          fileName: 'mtr_202600123456.pdf',
          progress: { total: 1, completed: 1, failed: 0, pending: 0 }
        }
      }],
      actions: []
    }, { correlationId: 'corr_1', timeZone: 'America/Sao_Paulo' });
    return rendered.blocks.map((block) => block.text).join('\n');
  }

  it('no DEFAULT continua dizendo a frase honesta de hoje — nunca promete anexo que não sai', async () => {
    const text = await renderArtifactNote();
    assert.ok(String(text).includes('ainda não consigo enviar arquivos'));
    // E nunca cita a rota: o WhatsApp auto-linka URL nua e a rota devolve 401, fazendo o operador
    // concluir que o SICAT quebrou.
    assert.equal(/https?:\/\//.test(String(text)), false);
  });

  it('só muda quando a capacidade é REAL (provedor Meta + política ligada + teto > 0)', async () => {
    // Política ligada mas provedor sem bytes: a frase NÃO pode mudar.
    setConfigOverride('whatsappMediaDeliveryEnabled', true);
    setConfigOverride('whatsappProvider', 'twilio');
    assert.ok(String(await renderArtifactNote()).includes('ainda não consigo enviar arquivos'));

    // Provedor certo mas teto zerado: idem.
    setConfigOverride('whatsappProvider', 'meta');
    setConfigOverride('whatsappNoticeMaxDocuments', 0);
    assert.ok(String(await renderArtifactNote()).includes('ainda não consigo enviar arquivos'));

    // Capacidade real: a frase deixa de ser mentira, e fala do AVISO (o arquivo não sai num turno de
    // consulta — ele sai no desfecho da ação confirmada).
    setConfigOverride('whatsappNoticeMaxDocuments', 5);
    const ligado = String(await renderArtifactNote());
    assert.ok(ligado.includes('eu te mando o PDF por aqui'));
    assert.equal(ligado.includes('ainda não consigo enviar arquivos'), false);

    setConfigOverride('whatsappProvider', undefined);
  });
});

// =================================================================================================
// MÉTRICA
// =================================================================================================

describe('fase 6 — métrica do aviso', () => {
  it('telefone NUNCA vira label — nem cru (dado pessoal) nem mascarado (cardinalidade)', async () => {
    recordChannelOutboundNotice('succeeded', 'text');
    recordChannelOutboundNotice('succeeded', 'media');

    const entries = await readChannelOutboundNoticeMetricsForTests();
    assert.equal(entries.length, 2);
    for (const entry of entries) {
      const serialized = JSON.stringify(entry);
      assert.equal(serialized.includes(PHONE), false);
      assert.equal(serialized.includes('****'), false);
      assert.equal(serialized.includes(LINK_ID), false);
      assert.deepEqual(Object.keys(entry).sort(), ['outcome', 'path', 'value']);
    }
  });
});

// =================================================================================================
// AUSÊNCIA DO TELEFONE CRU — em todo o rastro
// =================================================================================================

describe('fase 6 — o telefone cru não aparece em lugar nenhum do rastro', () => {
  it('ledger, patch de ticket, dívida e erro não contêm a string crua de dígitos', async () => {
    const job = noticeJob();
    const harness = createHarness({ now: 1_000_000 + 30 * HOUR });

    const result = await runWhatsAppOutboundNotice({ job, patchJobPayload: harness.patchJobPayload });

    const rastro = JSON.stringify({
      patches: harness.patches,
      ticketPatches: harness.ticketPatches,
      debt: harness.enqueuedDebt,
      result,
      // O payload FINAL do job, que é o que fica em repouso em `jobs` (e o que a DLQ copiaria).
      payload: job.payload
    });

    // AUSÊNCIA do cru, não só presença do mascarado.
    assert.equal(rastro.includes(PHONE), false, 'telefone cru no rastro do aviso');
    assert.equal(rastro.includes('987654321'), false);
    assert.equal(rastro.includes('11987654321'), false);
  });
});

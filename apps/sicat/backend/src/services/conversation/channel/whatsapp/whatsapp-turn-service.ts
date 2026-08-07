/**
 * Execução do turno de WhatsApp — o lado do WORKER.
 *
 * Vive fora de `operation-handlers.ts` por duas razões: aquele módulo já passa de 3.000 linhas, e
 * aqui o turno fica testável sem o `job-runner` inteiro. Só o wrapper em `operation-handlers`
 * conhece `finishJob`, que é privado daquele módulo.
 *
 * ┌─ O LIVRO-RAZÃO DE ENTREGA ────────────────────────────────────────────────────────────────────┐
 * │ O `jobs.payload` é o livro-razão: `replyText` é gravado ANTES de chamar o provedor e            │
 * │ `replySentAt` DEPOIS. Numa re-execução (retry, ou `requeueStaleRunningJobs` após o worker       │
 * │ morrer), `claimJobs` relê a linha e o payload FRESCO decide:                                    │
 * │   · `replySentAt` presente ......... termina, não reenvia, não roda LLM;                        │
 * │   · `replyText` sem `replySentAt` .. SÓ reenvia;                                                │
 * │   · nada preparado ................. roda o turno.                                              │
 * │ É isto que torna o retry do job um retry de ENTREGA e nunca de LLM. Sem ele, `maxAttempts: 3`   │
 * │ significaria até 3 chamadas de LLM e 3 respostas DIFERENTES para a mesma pergunta.              │
 * └───────────────────────────────────────────────────────────────────────────────────────────────┘
 *
 * ┌─ FASE 4: O MESMO LIVRO-RAZÃO, AGORA POR SEGMENTO ─────────────────────────────────────────────┐
 * │ Com N mensagens, os escalares `(replyText, replySentAt)` só admitem DOIS desfechos: carimbar   │
 * │ no fim → o retry reenvia tudo e a pessoa recebe duplicata; carimbar na primeira → as demais    │
 * │ nunca saem e o job fecha como SUCESSO MUDO. O segundo é exatamente a falha que a fase 3 gastou │
 * │ o bloco de EXPIRAÇÃO DE BACKLOG para eliminar. O terceiro desfecho — RETOMAR do índice — só    │
 * │ existe se o índice do último entregue for persistido DEPOIS DE CADA envio.                     │
 * │                                                                                                │
 * │ REGRA DE OURO DA MIGRAÇÃO: com **N === 1**, a sequência de patches, os NOMES DE CHAVE e o      │
 * │ texto enviado são BYTE-IDÊNTICOS à fase 3. `replySegments`/`sentSegmentCount`/                 │
 * │ `segmentMessageIds`/`replyFullyDelivered` só aparecem no payload quando N >= 2. Isso é         │
 * │ requisito de projeto, não consequência feliz: é o que faz os testes-âncora do livro-razão      │
 * │ passarem SEM EDIÇÃO. Editar um deles é sinal de que o desenho foi violado.                     │
 * │                                                                                                │
 * │ Ordem inegociável: PERSISTE → ENVIA → CARIMBA, por segmento. `sendAttempts` incrementado ANTES │
 * │ de cada chamada (é o que limita o loop quando o processo morre DENTRO do fetch);               │
 * │ `sentSegmentCount` carimbado DEPOIS de cada sucesso. Inverter qualquer par faz o retry voltar  │
 * │ a ser retry de TURNO — e aí cada falha de rede do provedor custa uma chamada de LLM inteira.   │
 * └───────────────────────────────────────────────────────────────────────────────────────────────┘
 */

import { config } from '../../../../lib/config.js';
import { insertAuditEntry } from '../../../../repositories/audit-repo.js';
import { findConversationChannelLinkForChannel } from '../../../../repositories/conversation-channel-link-repo.js';
import { resolveChannelPrincipal } from '../../conversation-principal.js';
import { createConversationService } from '../../conversation-service.js';
import { resolveWhatsAppProvider } from './index.js';
import {
  buildWhatsAppExpiredNotice,
  buildWhatsAppTurnTimeoutNotice,
  composeStaticWhatsAppReply,
  composeWhatsAppNotice,
  composeWhatsAppReply,
  type ComposableTurnOutput,
  type WhatsAppDisposition
} from './whatsapp-reply-composer.js';
import { maskChannelUserKey, type WhatsAppProvider } from './types.js';

type LooseRecord = Record<string, unknown>;

export type WhatsAppInboundJob = {
  jobId: string;
  entityId: string;
  correlationId?: string | null;
  claimedBy?: string | null;
  payload: LooseRecord;
};

export type PatchJobPayloadFn = (job: WhatsAppInboundJob, patch: LooseRecord) => Promise<void>;

export type WhatsAppTurnResult = {
  outcome: string;
  /** Campos extras para o `finishJob` do handler. */
  patch: LooseRecord;
};

type ChannelLinkLike = {
  id: string;
  userId: string | null;
  externalUserKey: string;
  verificationStatus: string;
};

type TurnDependencies = {
  findLink: (id: string) => Promise<ChannelLinkLike | null>;
  resolveChannelPrincipal: typeof resolveChannelPrincipal;
  processTurn: (input: LooseRecord) => Promise<ComposableTurnOutput & LooseRecord>;
  resolveProvider: () => WhatsAppProvider | null;
  insertAuditEntry: typeof insertAuditEntry;
  now: () => number;
};

/**
 * `createConversationService()` monta grafos LangGraph a cada chamada — construir por job seria
 * desperdício grosseiro. Uma vez por processo, e PREGUIÇOSAMENTE, para que importar este módulo num
 * teste não pague o custo.
 */
let conversationServiceSingleton: ReturnType<typeof createConversationService> | null = null;
function getConversationService(): ReturnType<typeof createConversationService> {
  if (!conversationServiceSingleton) conversationServiceSingleton = createConversationService();
  return conversationServiceSingleton;
}

const defaultDependencies: TurnDependencies = {
  findLink: (id: string) => findConversationChannelLinkForChannel(null, id),
  resolveChannelPrincipal,
  processTurn: (input) => getConversationService().processTurn(input as never) as Promise<ComposableTurnOutput & LooseRecord>,
  resolveProvider: resolveWhatsAppProvider,
  insertAuditEntry,
  now: () => Date.now()
};

let dependencies: TurnDependencies = defaultDependencies;

/** Seam de teste. Os doubles são fontes de dado e espiões de argumento — nunca lógica de decisão. */
export function setWhatsAppTurnDependenciesForTests(overrides: Partial<TurnDependencies> | null): void {
  dependencies = overrides ? { ...defaultDependencies, ...overrides } : defaultDependencies;
}

function toNonEmptyString(value: unknown): string | null {
  if (typeof value !== 'string') return null;
  const trimmed = value.trim();
  return trimmed ? trimmed : null;
}

function toNumber(value: unknown): number {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : 0;
}

/**
 * Segmentos já preparados por uma execução anterior.
 *
 * O fallback para `replyText` NÃO é higiene, é risco de ROLLOUT: jobs enfileirados pela versão
 * anterior têm só `replyText` e, sem ele, reexecutariam o LLM — custo dobrado e resposta possivelmente
 * DIVERGENTE da que a pessoa já recebeu. É uma linha de código, e a ausência dela é silenciosa.
 */
function readPreparedSegments(payload: LooseRecord): string[] {
  const stored = payload.replySegments;
  if (Array.isArray(stored)) {
    const segments = stored
      .map((segment) => toNonEmptyString(segment))
      .filter((segment): segment is string => segment !== null);
    if (segments.length > 0) return segments;
  }
  const single = toNonEmptyString(payload.replyText);
  return single ? [single] : [];
}

function readStoredMessageIds(payload: LooseRecord): Array<string | null> {
  const stored = payload.segmentMessageIds;
  if (!Array.isArray(stored)) return [];
  return stored.map((value) => toNonEmptyString(value));
}

/* ────────────────────────────────────────────────────────────────────────────────────────────────
 * EXPIRAÇÃO DE BACKLOG
 *
 * A guarda de frescor (C3) descarta mensagem velha demais para valer a pena responder. O desfecho
 * ANTERIOR era concluir o job como `succeeded` sem enviar nada: o worker reinicia (rollout, OOM,
 * `Recreate`), volta 6 minutos depois e TODAS as mensagens da fila viram sucesso sem uma única
 * resposta — o painel mostra 100% de sucesso enquanto todo mundo ficou sem resposta.
 *
 * A correção escolhida é **avisar a pessoa** (opção (b) do achado), e não apenas trocar o `outcome`
 * (opção (a)). Motivo: `mapJobToOperationalStatus` só distingue um sucesso "sem itens" pelo campo
 * `resultSummary`, que HOJE não é populado em lugar nenhum (não existe coluna `result_summary` e
 * nenhum chamador de `mapOperationalStatus` o passa) — um `outcome` novo continuaria invisível no
 * painel, que é exatamente a falha relatada. O aviso é verificável do lado de fora: a pessoa recebe
 * a mensagem, `userNotified` fica `true` e o desfecho aparece na trilha de auditoria.
 *
 * Duas guardas em volta do aviso, porque avisar sem limite é pior que não avisar:
 *   · UM aviso por vínculo por janela (`whatsappExpiredNoticeWindowMs`) — senão um backlog de N
 *     mensagens da mesma pessoa vira N avisos idênticos;
 *   · nada é enviado além da janela de atendimento de 24 h (`whatsappInboundMaxAgeSeconds`), em que
 *     o provedor REJEITA texto livre — tentar geraria erro de envio, retry e ruído na DLQ.
 * Nos dois casos suprimidos o job registra `userNotified: false` + `expiredNoticeSuppressed`: some
 * do gráfico de "respondidos", que é o ponto.
 * ──────────────────────────────────────────────────────────────────────────────────────────────── */

/** Último aviso de expiração por vínculo. In-process de propósito: o worker é um consumidor serial e
 *  drena o backlog no mesmo processo. Reinício perde a memória → no pior caso um aviso a mais. */
const expiredNoticeSentAtByLink = new Map<string, number>();
const EXPIRED_NOTICE_MAX_TRACKED_LINKS = 500;

/** Seam de teste — o mapa é estado de módulo e vazaria entre casos. */
export function resetWhatsAppExpiredNoticeThrottleForTests(): void {
  expiredNoticeSentAtByLink.clear();
}

function claimExpiredNoticeSlot(channelLinkId: string, nowMs: number, windowMs: number): boolean {
  const lastAt = expiredNoticeSentAtByLink.get(channelLinkId);
  if (lastAt != null && nowMs - lastAt < windowMs) return false;

  if (expiredNoticeSentAtByLink.size >= EXPIRED_NOTICE_MAX_TRACKED_LINKS) {
    for (const [key, at] of expiredNoticeSentAtByLink) {
      if (nowMs - at >= windowMs) expiredNoticeSentAtByLink.delete(key);
    }
  }

  expiredNoticeSentAtByLink.set(channelLinkId, nowMs);
  return true;
}

type ExpiryDecision = { notice: string | null; reason: 'notified' | 'throttled' | 'outside_session_window' };

/** `null` = a mensagem AINDA vale a pena responder. */
function evaluateExpiry(input: {
  payload: LooseRecord;
  channelLinkId: string;
  correlationId: string | null;
  nowMs: number;
}): ExpiryDecision | null {
  const receivedAt = Date.parse(String(input.payload.receivedAt || ''));
  if (!Number.isFinite(receivedAt)) return null;

  const ageMs = input.nowMs - receivedAt;
  const maxAgeMs = (Number(config.whatsappAnswerMaxAgeSeconds) || 300) * 1000;
  if (ageMs <= maxAgeMs) return null;

  const sessionWindowMs = (Number(config.whatsappInboundMaxAgeSeconds) || 86400) * 1000;
  if (ageMs >= sessionWindowMs) return { notice: null, reason: 'outside_session_window' };

  const noticeWindowMs = Number(config.whatsappExpiredNoticeWindowMs) || 600000;
  if (!claimExpiredNoticeSlot(input.channelLinkId, input.nowMs, noticeWindowMs)) {
    return { notice: null, reason: 'throttled' };
  }

  return { notice: buildWhatsAppExpiredNotice(input.correlationId), reason: 'notified' };
}

/** Marcador interno de estouro do teto de turno — pendência funcional, não falha técnica. */
class WhatsAppTurnTimeoutError extends Error {
  constructor() {
    super('WHATSAPP_TURN_TIMEOUT');
    this.name = 'WhatsAppTurnTimeoutError';
  }
}

async function withTurnTimeout<T>(promise: Promise<T>, timeoutMs: number): Promise<T> {
  if (!Number.isFinite(timeoutMs) || timeoutMs <= 0) return promise;

  let timer: NodeJS.Timeout | undefined;
  try {
    return await Promise.race([
      promise,
      new Promise<never>((_resolve, reject) => {
        timer = setTimeout(() => reject(new WhatsAppTurnTimeoutError()), timeoutMs);
      })
    ]);
  } finally {
    if (timer) clearTimeout(timer);
  }
}

/**
 * C1–C8. Devolve `{ outcome, patch }` para o handler concluir com `finishJob`, ou LANÇA quando a
 * falha é técnica (aí quem decide retry/DLQ é o `job-runner`).
 */
export async function runWhatsAppInboundTurn(input: {
  job: WhatsAppInboundJob;
  patchJobPayload: PatchJobPayloadFn;
}): Promise<WhatsAppTurnResult> {
  const { job, patchJobPayload } = input;
  const payload = job.payload || {};
  const correlationId = toNonEmptyString(job.correlationId);
  const maskedUserKey = toNonEmptyString(payload.maskedUserKey) || '';

  // ── C1: CAMINHO RÁPIDO DE ENTREGA, antes de qualquer LLM ──────────────────────────────────────
  if (toNonEmptyString(payload.replySentAt)) {
    // Cobre `requeueStaleRunningJobs` (WORKER_CLAIM_STALE) depois de um envio bem-sucedido.
    //
    // `replySegments`/`segmentMessageIds` TAMBÉM zerados: `finishJob` faz MERGE
    // (`payload: { ...job.payload, ...patch }`), não rewrite. Numa resposta de N>=2 que morreu entre
    // o último `sendText` e o `finishJob`, sem estas duas chaves o job conclui como `succeeded` com
    // os segmentos RESIDENTES na tabela `jobs` — carregando nome de gerador, transportador,
    // destinador, motorista e placa. É a mesma decisão de privacidade que o caminho feliz honra.
    return {
      outcome: 'whatsapp_inbound_already_answered',
      patch: { text: null, replyText: null, replySegments: null, segmentMessageIds: null }
    };
  }

  const preparedSegments = readPreparedSegments(payload);
  const sentSegmentCount = Math.max(0, Math.min(toNumber(payload.sentSegmentCount), preparedSegments.length));
  let sendAttempts = toNumber(payload.sendAttempts);

  // Teto ESCALADO, não zerado por avanço: `sendAttempts` continua significando "quantas vezes bati
  // no provedor por este job" (é campo lido em painel de fila fora deste módulo). Escalar preserva a
  // semântica e mantém o orçamento de retry em `whatsappMaxSendAttempts` por chamada NOVA. Com N=1
  // o valor é idêntico ao da fase 3.
  const attemptsCeiling = (Number(config.whatsappMaxSendAttempts) || 2)
    + Math.max(0, preparedSegments.length - 1);
  if (sendAttempts >= attemptsCeiling && !toNonEmptyString(payload.replySentAt)) {
    // Entrega PARCIAL não pode virar sucesso mudo no painel — é a falha que a fase 3 eliminou.
    if (sentSegmentCount > 0) {
      return {
        outcome: 'whatsapp_inbound_partially_answered',
        patch: { text: null, replyText: null, replySegments: null, segmentMessageIds: null, userNotified: true }
      };
    }
    return { outcome: 'whatsapp_inbound_reply_undeliverable', patch: { text: null, replyText: null } };
  }

  // ── C2: RELÊ O VÍNCULO (fecha o TOCTOU do desvínculo) ─────────────────────────────────────────
  const channelLinkId = toNonEmptyString(payload.channelLinkId);
  if (!channelLinkId) {
    return { outcome: 'whatsapp_inbound_link_revoked', patch: { text: null, replyText: null } };
  }

  const link = await dependencies.findLink(channelLinkId);
  if (!link || !link.userId || link.verificationStatus !== 'verified') {
    // Desvincular tem de calar o canal NA HORA. Mandar texto para quem acabou de se desvincular é o
    // oposto do que a pessoa pediu — então aqui não sai NADA.
    return { outcome: 'whatsapp_inbound_link_revoked', patch: { text: null, replyText: null } };
  }

  const disposition = (toNonEmptyString(payload.disposition) || 'process_turn') as WhatsAppDisposition;
  let segments = preparedSegments;
  let conversationTurnId: string | null = null;
  let outcome = 'whatsapp_inbound_answered';

  if (segments.length === 0) {
    // ── C3: FRESCOR DE EXECUÇÃO ────────────────────────────────────────────────────────────────
    // Só vale quando NADA foi preparado: senão um reenvio legítimo seria abortado. Responder a
    // pergunta 10 minutos depois é pior que não responder — mas SUMIR não é opção: o desfecho é
    // avisar que a mensagem expirou (ver o bloco EXPIRAÇÃO DE BACKLOG acima).
    const expiry = evaluateExpiry({ payload, channelLinkId, correlationId, nowMs: dependencies.now() });

    if (expiry && !expiry.notice) {
      console.warn(
        `[whatsapp-turn] mensagem expirada SEM aviso (${expiry.reason}) — job ${job.jobId}`
      );
      await safeAudit({
        correlationId,
        entityId: job.entityId,
        direction: 'outbound',
        body: { maskedUserKey, disposition, outcome: 'whatsapp_inbound_expired', expiredNoticeSuppressed: expiry.reason }
      });
      return {
        outcome: 'whatsapp_inbound_expired',
        // `userNotified: false` EXPLÍCITO: é o campo que separa "concluído e respondido" de
        // "concluído e mudo" para quem lê a fila.
        patch: { text: null, replyText: null, userNotified: false, expiredNoticeSuppressed: expiry.reason }
      };
    }

    if (expiry?.notice) {
      // Zero LLM: a resposta útil não existe mais. O que sai é o aviso, pelo mesmo livro-razão de
      // entrega (persiste → envia → carimba), então retry aqui também é retry de ENTREGA.
      //
      // Correção de graça da fase 4: este aviso e o de timeout eram os ÚNICOS textos que saíam sem
      // passar pelo funil de higiene (iam direto para `replyText`). Agora vão.
      segments = composeWhatsAppNotice(expiry.notice, { correlationId });
      outcome = 'whatsapp_inbound_expired';
    } else if (disposition !== 'process_turn') {
      // ── C4: disposição estática. Zero LLM. ───────────────────────────────────────────────────
      segments = composeStaticWhatsAppReply(disposition, { correlationId });
      outcome = `whatsapp_inbound_${disposition}`;
      if (segments.length === 0) {
        return { outcome: 'whatsapp_inbound_ignored', patch: { text: null, replyText: null } };
      }
    } else {
      const turn = await runProcessTurn({ job, link, payload, correlationId });
      segments = turn.segments;
      conversationTurnId = turn.conversationTurnId;
      outcome = turn.outcome;
    }

    if (segments.length === 0) {
      return { outcome: 'whatsapp_inbound_ignored', patch: { text: null, replyText: null } };
    }

    // ── C6: PERSISTE A RESPOSTA ANTES DE ENVIAR ──────────────────────────────────────────────────
    // Os segmentos são PERSISTIDOS e nunca re-renderizados no retry: dado que mudou entregaria um
    // segmento 2 incoerente com o segmento 1 já entregue.
    //
    // Com N === 1 o patch é EXATAMENTE `{ replyText, replyPreparedAt }` — mesmas chaves, mesma
    // ordem, mesmo texto da fase 3.
    const preparePatch: LooseRecord = {
      replyText: segments[0],
      replyPreparedAt: new Date(dependencies.now()).toISOString()
    };
    if (segments.length >= 2) {
      preparePatch.replySegments = segments;
      preparePatch.sentSegmentCount = 0;
    }
    await patchJobPayload(job, preparePatch);
  }

  // ── C7: ENVIO ────────────────────────────────────────────────────────────────────────────────
  const provider = dependencies.resolveProvider();
  if (!provider) {
    // Canal desligado entre o enqueue e a execução. Não é falha técnica; retentar não resolve.
    //
    // Este ramo roda DEPOIS de C6 ter persistido os segmentos, então é a segunda das duas únicas
    // saídas que podem ocorrer com `replySegments` já no payload — e `finishJob` faz MERGE. Sem
    // zerar, o texto do operador fica residente em `jobs`.
    return {
      outcome: 'whatsapp_inbound_channel_disabled',
      patch: { text: null, replyText: null, replySegments: null, segmentMessageIds: null }
    };
  }

  const multiSegment = segments.length >= 2;
  const messageIds = readStoredMessageIds(payload);
  let replyChars = 0;
  for (const segment of segments) replyChars += segment.length;

  for (let index = sentSegmentCount; index < segments.length; index += 1) {
    const segment = segments[index];
    if (!segment) continue;

    // Incrementado ANTES da chamada: é isto que limita o loop quando o processo morre DENTRO do fetch.
    sendAttempts += 1;
    await patchJobPayload(job, { sendAttempts });

    let providerMessageId: string | null = null;
    try {
      const sent = await provider.sendText({ to: link.externalUserKey, text: segment });
      providerMessageId = sent?.providerMessageId ?? null;
    } catch (error) {
      const failurePatch: LooseRecord = { lastSendErrorCode: extractErrorCode(error) };
      if (multiSegment) failurePatch.partialDelivery = index > 0;
      await patchJobPayload(job, failurePatch);
      // LANÇA: quem decide retry/DLQ é o `job-runner`. O retry é barato porque C1 pula o turno E
      // retoma do índice — nem reexecuta o LLM, nem reenvia o que já saiu.
      throw error;
    }

    messageIds[index] = providerMessageId;
    const isLast = index === segments.length - 1;

    if (!multiSegment) {
      await patchJobPayload(job, {
        replySentAt: new Date(dependencies.now()).toISOString(),
        replyProviderMessageId: providerMessageId,
        userNotified: true
      });
      continue;
    }

    // `userNotified: true` já no PRIMEIRO segmento: ele é autossuficiente por construção (resposta +
    // contagem honesta + saída para o SICAT), então morrer depois dele é TRUNCAGEM, não silêncio —
    // e disparar "não consegui processar sua última mensagem" para quem acabou de receber a resposta
    // seria pior (e ainda custaria uma mensagem).
    const deliveryPatch: LooseRecord = {
      sentSegmentCount: index + 1,
      segmentMessageIds: messageIds,
      userNotified: true
    };
    if (isLast) {
      // `replySentAt` SÓ QUANDO TUDO SAIU — é o carimbo de "acabei" que C1 lê.
      deliveryPatch.replySentAt = new Date(dependencies.now()).toISOString();
      deliveryPatch.replyProviderMessageId = messageIds[0] ?? null;
      deliveryPatch.replyFullyDelivered = true;
    }
    await patchJobPayload(job, deliveryPatch);
  }

  await safeAudit({
    correlationId,
    entityId: job.entityId,
    direction: 'outbound',
    // `replyChars` preserva o NOME (os painéis leem esse campo) e passa a ser a SOMA.
    body: multiSegment
      ? { maskedUserKey, disposition, outcome, replyChars, replySegmentCount: segments.length }
      : { maskedUserKey, disposition, outcome, replyChars }
  });

  // ── C9 (parte do patch): `text`/`replyText` zerados no caminho feliz. `finishJob` REESCREVE o
  // payload inteiro, então aqui o conteúdo deixa de existir em `jobs`. Só jobs que MORRERAM retêm o
  // texto — e neles ele é a evidência de diagnóstico.
  const finalPatch: LooseRecord = {
    conversationTurnId,
    replyChars,
    userNotified: true,
    text: null,
    replyText: null
  };
  if (multiSegment) {
    // Sem isto o texto do operador (com nomes de gerador e motorista) ficaria residente na tabela
    // `jobs` — regressão direta de uma decisão de privacidade que a fase 3 já pagou.
    finalPatch.replySegments = null;
    finalPatch.segmentMessageIds = null;
  }

  return { outcome, patch: finalPatch };
}

async function runProcessTurn(input: {
  job: WhatsAppInboundJob;
  link: ChannelLinkLike;
  payload: LooseRecord;
  correlationId: string | null;
}): Promise<{ segments: string[]; conversationTurnId: string | null; outcome: string }> {
  const { job, link, payload, correlationId } = input;

  // ── C5.1: PRINCIPAL montado AQUI, com contexto fresco ─────────────────────────────────────────
  // NUNCA serializado em `jobs.payload`: `permissionKeys`/`integrationAccountId`/`sessionContextId`
  // numa fila durável congelariam uma decisão de autorização (permissão revogada ou conta CETESB
  // trocada continuariam valendo na execução).
  const principal = await dependencies.resolveChannelPrincipal({
    channel: 'whatsapp',
    userId: String(link.userId),
    externalUserKey: link.externalUserKey,
    // `integrationAccountId` DELIBERADAMENTE AUSENTE (pendência 2 da fase 2): o valor recebido vence
    // a conta ativa do usuário e a coluna ainda não tem dono definido — herdar amarraria o novo dono
    // do número à conta CETESB alheia.
    //
    // `requestedBy` EXPLÍCITO e MASCARADO: o default é o E.164 CRU, que iria para
    // `conversation_action_logs.user_id`, para o `sanitizedBody` de `audit_logs` e para as tools.
    requestedBy: `whatsapp:${maskChannelUserKey(link.externalUserKey)}`
  });

  let output: ComposableTurnOutput & LooseRecord;
  try {
    output = await withTurnTimeout(
      dependencies.processTurn({
        body: {
          message: payload.text,
          context: {},
          metadata: {
            source: 'whatsapp',
            provider: payload.providerName,
            providerMessageId: payload.providerMessageId,
            messageType: payload.messageType,
            mediaIgnored: payload.mediaIgnored,
            textTruncated: payload.textTruncated
          },
          // EXPLÍCITO: `toBoolean(options.allowActions, true)` — a omissão NÃO é neutra. Cinto e
          // suspensório sobre a policy, que já exclui `whatsapp` das 5 tools de ação.
          options: { allowActions: false }
        },
        principal,
        correlationId,
        // Os headers do webhook JAMAIS são repassados ao turno.
        headers: {},
        idempotencyKey: toNonEmptyString(payload.providerMessageId) || undefined,
        userContent: null,
        ingestManifest: null
        // `conversationSessionId` OMITIDO: o upsert conflita em (channel_type, channel_session_key) e
        // devolve o id canônico. `channelSessionKey = 'whatsapp:<E164>'` vem do principal, então a
        // continuidade é automática e não há nada a persistir aqui.
        //
        // `toolRequest` NUNCA é montado: `parseExplicitToolRequest` faz o turno pular o planner e
        // executar a tool nomeada — inclusive com `confirmed: true`. O texto do usuário é DADO.
      }),
      Number(config.whatsappTurnTimeoutMs) || 120000
    );
  } catch (error) {
    if (error instanceof WhatsAppTurnTimeoutError) {
      // Pendência funcional: retentar um timeout custa outros 120 s. A promise órfã continua rodando
      // e ainda grava o registro do turno — o que se descarta é a RESPOSTA, não o custo.
      return {
        segments: composeWhatsAppNotice(buildWhatsAppTurnTimeoutNotice(correlationId), { correlationId }),
        conversationTurnId: null,
        outcome: 'whatsapp_inbound_timeout'
      };
    }
    // Falha técnica legítima (`resolveChannelPrincipal` 401, `loadConversationPlanningState`, ramo
    // `TOOL_NOT_SUPPORTED`): sobe para retry. SEM este try/catch a pessoa ficaria muda.
    throw error;
  }

  // ── C5.4: ALLOWLIST de saída + FICHA (fase 4) ────────────────────────────────────────────────
  // `output.result` existia em runtime desde sempre e era descartado em silêncio — todo o
  // `ConversationStructuredResult` ia para o lixo. É ele que o renderer lê agora.
  const segments = composeWhatsAppReply(output, {
    correlationId,
    mediaIgnored: payload.mediaIgnored === true,
    textTruncated: payload.textTruncated === true
  });

  await safeAudit({
    correlationId,
    entityId: job.entityId,
    direction: 'inbound',
    body: {
      maskedUserKey: toNonEmptyString(payload.maskedUserKey) || '',
      disposition: 'process_turn',
      status: output.status,
      reasonCode: output.policy?.reasonCode || null
    }
  });

  return {
    segments,
    conversationTurnId: toNonEmptyString(output.conversationTurnId),
    outcome: `whatsapp_inbound_${output.status}`
  };
}

/**
 * Auditoria. `insertAuditEntry` direto, NUNCA `logExchange`: aquele chumba
 * `component: 'cetesb-gateway'` e faz early-return sem `request` + `response`.
 *
 * Falha de auditoria nunca derruba o turno — e o texto do usuário nunca entra no `sanitizedBody`.
 */
async function safeAudit(input: {
  correlationId: string | null;
  entityId: string;
  direction: 'inbound' | 'outbound';
  body: LooseRecord;
}): Promise<void> {
  if (!input.correlationId) return;
  try {
    await dependencies.insertAuditEntry({
      correlationId: input.correlationId,
      entityType: 'channel_inbound_message',
      entityId: input.entityId,
      direction: input.direction,
      component: 'whatsapp-channel',
      sanitizedBody: input.body
    });
  } catch (error) {
    console.warn(`[whatsapp-turn] auditoria falhou: ${extractErrorCode(error) || 'unknown'}`);
  }
}

function extractErrorCode(error: unknown): string | null {
  const code = (error as { code?: unknown } | null)?.code;
  if (typeof code === 'string' && code) return code;
  const status = (error as { status?: unknown } | null)?.status;
  if (typeof status === 'number') return `HTTP_${status}`;
  return null;
}

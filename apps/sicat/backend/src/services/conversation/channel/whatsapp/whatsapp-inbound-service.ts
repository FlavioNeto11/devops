/**
 * Ingestão do webhook de entrada do WhatsApp — o PORTEIRO.
 *
 * Este módulo roda DENTRO da requisição do provedor e tem um orçamento de milissegundos. Ele faz
 * apenas trabalho barato e sem rede de saída: normaliza, canonicaliza o telefone, resolve o vínculo
 * VERIFICADO, classifica a mensagem e enfileira um job. Nada de LLM, nada de CETESB, nada de
 * `sendText` aguardado, nada de download de mídia — tudo isso é o worker.
 *
 * A única exceção consciente é a cortesia opcional de número não vinculado, que é fire-and-forget
 * (promise NÃO aguardada) e vem desligada por default.
 *
 * DUAS PENDÊNCIAS QUE A FASE 2 DEIXOU EXPLÍCITAS E QUE MORAM AQUI:
 *
 *  1. o `from` recebido passa por `requireChannelUserKey` — a MESMA função do cadastro. Os dois
 *     provedores entregam `from` só por `normalizePhone`, que NÃO resolve DDI nem nono dígito. Se a
 *     recepção canonicalizasse diferente do cadastro, o vínculo nunca seria encontrado e o sintoma
 *     seria SILENCIOSO: a mensagem chega, não casa com nada, e não há erro em lugar nenhum. É o modo
 *     de falha mais perigoso do módulo inteiro;
 *  2. `link.integrationAccountId` NÃO viaja daqui para lugar nenhum. `resolveChannelPrincipal`
 *     prioriza o valor recebido sobre a conta ativa do usuário, e a coluna ainda não tem dono
 *     definido — um valor herdado amarraria o novo dono do número à conta CETESB alheia.
 *
 * OBSERVABILIDADE (não é enfeite): o canal é MUDO por desenho — descarte não responde nada ao
 * remetente e o provedor sempre recebe 2xx. Se o descarte também fosse mudo para DENTRO, a
 * canonicalização divergente da pendência 1 seria indistinguível de "ninguém mandou mensagem". Por
 * isso TODO descarte passa por `dropMessage`, um ponto único que soma o contador do `IngestSummary`,
 * incrementa a métrica Prometheus e loga — com o telefone SEMPRE mascarado.
 */

import { createHash } from 'node:crypto';
import {
  recordChannelInboundDropped,
  recordChannelInboundEnqueued,
  recordChannelInboundReceived
} from '../../../../lib/channel-metrics.js';
import { config } from '../../../../lib/config.js';
import { createPrefixedId } from '../../../../lib/ids.js';
import { createRateLimiter, type RateLimiter } from '../../../../lib/rate-limit.js';
import { calculateJobPriority, extractJobTags, getRetryConfig } from '../../../../lib/retry.js';
import { findConversationChannelLink } from '../../../../repositories/conversation-channel-link-repo.js';
import { insertJob } from '../../../../repositories/job-repo.js';
import { requireChannelUserKey } from '../../../conversation-channel-link-service.js';
import { cutAtGrapheme } from './whatsapp-render-blocks.js';
import {
  WHATSAPP_RATE_LIMIT_NOTICE,
  WHATSAPP_UNLINKED_NOTICE,
  type WhatsAppDisposition
} from './whatsapp-reply-composer.js';
import { maskChannelUserKey, normalizePhone, type WhatsAppInboundMessage, type WhatsAppProvider } from './types.js';

export const WHATSAPP_INBOUND_OPERATION = 'whatsapp.inbound_message';
export const WHATSAPP_INBOUND_ENTITY_TYPE = 'channel_inbound_message';

/** Rótulo `channel` das métricas e prefixo das chaves de balde. */
const CHANNEL = 'whatsapp';

export type DropReason =
  | 'batch_overflow'
  | 'foreign_business_number'
  | 'stale'
  | 'invalid_phone'
  | 'unlinked'
  | 'link_pending'
  | 'empty'
  | 'duplicate'
  | 'rate_limited'
  | 'enqueue_failed';

const DROP_REASONS: DropReason[] = [
  'batch_overflow',
  'foreign_business_number',
  'stale',
  'invalid_phone',
  'unlinked',
  'link_pending',
  'empty',
  'duplicate',
  'rate_limited',
  'enqueue_failed'
];

export type IngestSummary = {
  received: number;
  enqueued: number;
  dropped: Record<DropReason, number>;
};

type ChannelLinkLike = {
  id: string;
  userId: string | null;
  externalUserKey: string;
  verificationStatus: string;
};

type InsertJobFn = typeof insertJob;

type InboundDependencies = {
  findConversationChannelLink: (channelType: string, externalUserKey: string) => Promise<ChannelLinkLike | null>;
  insertJob: InsertJobFn;
};

const defaultDependencies: InboundDependencies = {
  findConversationChannelLink,
  insertJob
};

let dependencies: InboundDependencies = defaultDependencies;

/**
 * Seam de teste. Um double aqui é FONTE DE DADOS (devolve uma linha, registra um insert) — nunca
 * reimplementa a decisão que este módulo deveria estar tomando.
 */
export function setWhatsAppInboundDependenciesForTests(overrides: Partial<InboundDependencies> | null): void {
  dependencies = overrides ? { ...defaultDependencies, ...overrides } : defaultDependencies;
}

/* ------------------------------------------------------------------------------------------------
 * Limitadores. Em MEMÓRIA — vale porque `sicat-api` roda com 1 réplica. Criados sob demanda para
 * respeitarem `setConfigOverride` em teste; `reset` existe para isolar casos.
 * ---------------------------------------------------------------------------------------------- */

let perLinkLimiter: RateLimiter | null = null;
let unlinkedNoticeLimiter: RateLimiter | null = null;
let rateLimitNoticeLimiter: RateLimiter | null = null;

function getPerLinkLimiter(): RateLimiter {
  if (!perLinkLimiter) {
    perLinkLimiter = createRateLimiter(config.whatsappInboundPerLink, config.whatsappInboundPerLinkWindowMs);
  }
  return perLinkLimiter;
}

function getUnlinkedNoticeLimiter(): RateLimiter {
  // 1 aviso por 24 h por número.
  if (!unlinkedNoticeLimiter) unlinkedNoticeLimiter = createRateLimiter(1, 86_400_000);
  return unlinkedNoticeLimiter;
}

/**
 * Aviso de teto estourado: 1 por JANELA do próprio teto, por vínculo. Mais que isso e o aviso vira
 * amplificação do flood que ele deveria estar contendo — cada mensagem barrada geraria uma saída paga.
 */
function getRateLimitNoticeLimiter(): RateLimiter {
  if (!rateLimitNoticeLimiter) {
    rateLimitNoticeLimiter = createRateLimiter(1, Number(config.whatsappInboundPerLinkWindowMs) || 300_000);
  }
  return rateLimitNoticeLimiter;
}

export function resetWhatsAppInboundLimitersForTests(): void {
  perLinkLimiter = null;
  unlinkedNoticeLimiter = null;
  rateLimitNoticeLimiter = null;
}

/* ------------------------------------------------------------------------------------------------
 * Classificação
 * ---------------------------------------------------------------------------------------------- */

/**
 * Allowlist de saudação/ajuda. Deliberadamente CONSERVADORA: mensagem INTEIRA, no máximo 20
 * caracteres, comparada sem acento e sem pontuação final.
 *
 * Interceptar antes do LLM não é economia: os prompts de síntese não conhecem `channel` até a fase 4,
 * então deixar o modelo se apresentar é garantir que ele ofereça emissão, impressão e download que o
 * canal NÃO faz.
 */
const GREETING_WORDS = new Set([
  'oi', 'ola', 'opa', 'eai', 'bom dia', 'boa tarde', 'boa noite', 'ajuda', 'menu', 'help', 'ajuda?'
]);

export function isWhatsAppGreeting(text: unknown): boolean {
  const trimmed = String(text ?? '').trim();
  if (!trimmed || trimmed.length > 20) return false;
  if (trimmed === '?') return true;

  const normalized = trimmed
    .toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[!?.,;:]+$/g, '')
    .replace(/\s+/g, ' ')
    .trim();

  return GREETING_WORDS.has(normalized);
}

/**
 * Figurinha, normalizada entre provedores. A Meta manda `type: 'sticker'` (fora do conjunto de mídia
 * conhecido ⇒ vira `unsupported` com `text: null`); o Twilio manda a mesma figurinha como mídia
 * `image/webp`. Sem esta normalização, a MESMA figurinha recebe "não consigo abrir anexos" num
 * provedor e silêncio no outro.
 */
export function isWhatsAppSticker(message: WhatsAppInboundMessage): boolean {
  if (String(message.rawType || '').toLowerCase() === 'sticker') return true;
  const hasCaption = Boolean(String(message.text || '').trim());
  return message.type === 'image'
    && !hasCaption
    && String(message.media?.mimeType || '').toLowerCase() === 'image/webp';
}

export type ClassifiedMessage = {
  disposition: WhatsAppDisposition;
  text: string | null;
  textTruncated: boolean;
  mediaIgnored: boolean;
};

export function classifyInboundMessage(message: WhatsAppInboundMessage): ClassifiedMessage {
  const rawText = String(message.text ?? '').trim();
  const hasMedia = Boolean(message.media);

  if (isWhatsAppSticker(message)) {
    return { disposition: 'sticker', text: null, textTruncated: false, mediaIgnored: false };
  }
  if (message.type === 'audio') {
    return { disposition: 'unsupported_audio', text: null, textTruncated: false, mediaIgnored: false };
  }
  if (message.type === 'location') {
    return { disposition: 'unsupported_location', text: null, textTruncated: false, mediaIgnored: false };
  }

  if (!rawText) {
    // Mídia sem legenda tem resposta própria; reação/vazio some em silêncio — responder "não
    // entendi" a uma reação com emoji é bizarro.
    if (message.type === 'image' || message.type === 'document' || message.type === 'video') {
      return { disposition: 'unsupported_media', text: null, textTruncated: false, mediaIgnored: true };
    }
    return { disposition: 'ignore_silent', text: null, textTruncated: false, mediaIgnored: false };
  }

  const maxChars = Number(config.whatsappInboundMaxTextChars) || 2000;
  const truncated = rawText.length > maxChars;
  // Corte por grafema/code point, NUNCA `slice` cru em unidades UTF-16: um par surrogate partido na
  // fronteira (basta um emoji cair no teto) produz UTF-16 inválido que, ao ser serializado com
  // `JSON.stringify` e gravado como `::jsonb` no payload do job, faz o insert falhar — a mensagem cai
  // em `enqueue_failed`, o provedor recebe 200 e nunca reentrega: mensagem perdida em silêncio.
  const text = truncated ? cutAtGrapheme(rawText, maxChars) : rawText;

  if (isWhatsAppGreeting(text)) {
    return { disposition: 'greeting', text, textTruncated: truncated, mediaIgnored: hasMedia };
  }

  return { disposition: 'process_turn', text, textTruncated: truncated, mediaIgnored: hasMedia };
}

/* ------------------------------------------------------------------------------------------------
 * Idempotência e infraestrutura
 * ---------------------------------------------------------------------------------------------- */

/**
 * Chave de idempotência da RECEPÇÃO. Vira `jobs.command_id`, cujo `unique` é GLOBAL e PERMANENTE —
 * ao contrário do índice parcial `ux_jobs_active_entity_operation`, que só cobre
 * `queued|running|retry_wait` e deixaria passar uma reentrega feita depois do job concluir.
 *
 * Quando o provedor não manda id (ambos os parsers emitem `''`), sintetiza-se um a partir do
 * conteúdo + o MINUTO de recepção. Descartar seria perder mensagem legítima; o minuto limita a
 * janela de dedup a 60 s para duas mensagens IDÊNTICAS do mesmo número.
 */
export function buildInboundIdempotencyKey(message: WhatsAppInboundMessage, receivedAt: Date): string {
  const providerMessageId = String(message.providerMessageId || '').trim();
  if (providerMessageId) return providerMessageId;

  const minuteBucket = new Date(receivedAt).toISOString().slice(0, 16);
  const material = [message.from, message.to, message.timestamp || '', minuteBucket, message.text || ''].join('|');
  return `syn:${createHash('sha256').update(material).digest('hex').slice(0, 40)}`;
}

function isUniqueViolation(error: unknown): boolean {
  return String((error as { code?: unknown } | null)?.code ?? '') === '23505';
}

/**
 * Falha de INFRAESTRUTURA (conexão), a única que justifica devolver 500 ao provedor e pedir
 * reentrega. Erro semântico de banco (violação de check, tipo, coluna) NÃO entra: reentregar não
 * conserta e o Meta desativa o webhook depois de falhas persistentes.
 */
export function isInfrastructureError(error: unknown): boolean {
  const code = String((error as { code?: unknown } | null)?.code ?? '');
  if (code.startsWith('08')) return true; // classe 08 = connection exception
  if (['57P01', '57P02', '57P03', 'ECONNREFUSED', 'ECONNRESET', 'ETIMEDOUT', 'EPIPE', 'ENOTFOUND', 'EHOSTUNREACH'].includes(code)) {
    return true;
  }
  if (code) return false;

  const message = String((error as { message?: unknown } | null)?.message ?? '').toLowerCase();
  return message.includes('timeout exceeded when trying to connect')
    || message.includes('connection terminated')
    || message.includes('connection ended');
}

function emptyDropCounters(): Record<DropReason, number> {
  const counters = {} as Record<DropReason, number>;
  for (const reason of DROP_REASONS) counters[reason] = 0;
  return counters;
}

/* ------------------------------------------------------------------------------------------------
 * Ingestão
 * ---------------------------------------------------------------------------------------------- */

export type IngestInput = {
  provider: WhatsAppProvider;
  body: Record<string, unknown>;
  correlationId: string;
  /** Injetável para teste determinístico de frescor/idempotência. */
  now?: () => Date;
};

export async function ingestWhatsAppWebhook(input: IngestInput): Promise<IngestSummary> {
  const now = input.now ?? (() => new Date());
  const summary: IngestSummary = { received: 0, enqueued: 0, dropped: emptyDropCounters() };
  let infrastructureError: unknown = null;

  try {
    const parsed = input.provider.parseInboundMessages({ body: input.body });
    summary.received = parsed.length;
    if (parsed.length === 0) return summary;

    // Cap de lote: um corpo assinado de 2 MB pode conter milhares de mensagens e viraria milhares de
    // jobs. O excedente é descartado com métrica, não silenciosamente.
    const maxPerPost = Number(config.whatsappInboundMaxMessagesPerPost) || 20;
    const messages = parsed.slice(0, maxPerPost);
    const overflow = Math.max(0, parsed.length - messages.length);
    if (overflow > 0) {
      summary.dropped.batch_overflow += overflow;
      recordChannelInboundDropped(CHANNEL, input.provider.name, 'batch_overflow', overflow);
      console.warn(
        `[whatsapp-inbound] descarte reason=batch_overflow count=${overflow} `
        + `provider=${input.provider.name} correlationId=${input.correlationId}`
      );
    }

    for (const message of messages) {
      try {
        const enqueued = await ingestSingleMessage(message, input, summary, now());
        if (enqueued) summary.enqueued += 1;
      } catch (error) {
        dropMessage({ input, summary, message }, 'enqueue_failed', describeError(error));
        // Erro de INFRAESTRUTURA memorizado para virar 500 lá em cima; erro semântico morre aqui
        // (reentregar não conserta violação de check/tipo/coluna).
        if (isInfrastructureError(error)) infrastructureError = error;
      }
    }
  } finally {
    recordChannelInboundReceived(CHANNEL, input.provider.name, summary.received);
    recordChannelInboundEnqueued(CHANNEL, input.provider.name, summary.enqueued);
    logIngestSummary(summary, input);
  }

  // REGRA DE 500: QUALQUER mensagem do lote perdida por falha de conexão. A versão estreita anterior
  // (`enqueued === 0 && …`) perdia em SILÊNCIO a pergunta de quem estava na segunda posição de um
  // lote parcialmente gravado: o provedor via 200 e nunca mais reentregava. O 500 é seguro no caso
  // parcial pelo mesmo motivo que era no caso total — o `unique` de `jobs.command_id` torna a
  // reentrega do lote inteiro um no-op para tudo que já gravou.
  if (infrastructureError) throw infrastructureError;

  return summary;
}

/** Mensagem de erro segura para log: nunca inclui o texto do usuário nem telefone em claro. */
function describeError(error: unknown): string {
  const code = String((error as { code?: unknown } | null)?.code ?? '');
  const name = error instanceof Error ? error.name : typeof error;
  return code ? `${name}/${code}` : name;
}

type IngestContext = {
  input: IngestInput;
  summary: IngestSummary;
  message: WhatsAppInboundMessage;
};

/**
 * PONTO ÚNICO de descarte. Contador do summary, métrica Prometheus e log saem juntos daqui — um ramo
 * que descartasse "na mão" voltaria a produzir o sintoma que esta rodada corrigiu: canal mudo por
 * fora E mudo por dentro. Devolve `false` para que o chamador possa `return dropMessage(...)`.
 */
function dropMessage(context: IngestContext, reason: DropReason, detail = ''): false {
  context.summary.dropped[reason] += 1;
  recordChannelInboundDropped(CHANNEL, context.input.provider.name, reason);
  console.warn(
    `[whatsapp-inbound] descarte reason=${reason} from=${maskChannelUserKey(context.message.from)} `
    + `provider=${context.input.provider.name} correlationId=${context.input.correlationId}`
    + (detail ? ` detail=${detail}` : '')
  );
  return false;
}

/**
 * Uma linha por LOTE com mensagens de verdade. Recibos de status parseiam para zero mensagens e não
 * são logados — seriam ruído puro em volume de produção.
 */
function logIngestSummary(summary: IngestSummary, input: IngestInput): void {
  if (summary.received === 0) return;
  const drops = DROP_REASONS
    .filter((reason) => summary.dropped[reason] > 0)
    .map((reason) => `${reason}=${summary.dropped[reason]}`)
    .join(' ');
  console.info(
    `[whatsapp-inbound] lote provider=${input.provider.name} received=${summary.received} `
    + `enqueued=${summary.enqueued}${drops ? ` dropped ${drops}` : ''} correlationId=${input.correlationId}`
  );
}

async function ingestSingleMessage(
  message: WhatsAppInboundMessage,
  input: IngestInput,
  summary: IngestSummary,
  receivedAt: Date
): Promise<boolean> {
  const context: IngestContext = { input, summary, message };

  // ── Guarda de número de negócio — FAIL-CLOSED ────────────────────────────────────────────────
  // Numa WABA/subconta compartilhada, uma mensagem endereçada a OUTRO número da mesma app chega
  // validamente assinada. O `to` é a única coisa que a distingue.
  //
  // O `to` VAZIO descarta. A versão anterior exigia `normalizePhone(message.to)` como condição para
  // acionar a guarda, ou seja, PULAVA a guarda exatamente quando o provedor não informava o
  // destinatário — uma mudança de forma do `metadata` no Graph aceitaria tudo, com
  // `WHATSAPP_BUSINESS_NUMBER` configurado e ninguém percebendo.
  const businessNumber = normalizePhone(config.whatsappBusinessNumber);
  if (businessNumber && normalizePhone(message.to) !== businessNumber) {
    return dropMessage(context, 'foreign_business_number');
  }

  // ── Frescor ──────────────────────────────────────────────────────────────────────────────────
  // Barra replay de payload assinado antigo. O Twilio não manda timestamp — para ele só a dedup vale
  // (risco residual declarado; Twilio é dev/homolog).
  if (message.timestamp) {
    const ageSeconds = (receivedAt.getTime() - Date.parse(message.timestamp)) / 1000;
    if (Number.isFinite(ageSeconds) && ageSeconds > (Number(config.whatsappInboundMaxAgeSeconds) || 86400)) {
      return dropMessage(context, 'stale');
    }
  }

  // ── CANONICALIZAÇÃO — pendência 1 da fase 2 ──────────────────────────────────────────────────
  // `requireChannelUserKey` lança AppError 400. Aqui isso NUNCA pode virar resposta 400 ao provedor:
  // é descarte.
  let externalUserKey: string;
  try {
    externalUserKey = requireChannelUserKey(message.from);
  } catch {
    dropMessage(context, 'invalid_phone');
    await maybeSendUnlinkedNotice(input.provider, normalizePhone(message.from));
    return false;
  }

  // ── VÍNCULO VERIFICADO ───────────────────────────────────────────────────────────────────────
  // `findConversationChannelLink` NÃO filtra status, e o upsert cria linha com default `'pending'`.
  // Sem a guarda explícita, "pedi um código OTP para o telefone de alguém" viraria "converso como
  // aquele usuário".
  const link = await dependencies.findConversationChannelLink('whatsapp', externalUserKey);
  if (!link || !link.userId || link.verificationStatus !== 'verified') {
    dropMessage(context, link ? 'link_pending' : 'unlinked');
    await maybeSendUnlinkedNotice(input.provider, externalUserKey);
    return false;
  }

  // ── Classificação ANTES do teto ──────────────────────────────────────────────────────────────
  // Reação com emoji e mensagem vazia não gastam LLM nem viram turno; cobrar cota por elas fazia a
  // pessoa que reagiu a 12 mensagens do bot cair em silêncio total na 13ª — que era a pergunta.
  const classified = classifyInboundMessage(message);
  if (classified.disposition === 'ignore_silent') {
    return dropMessage(context, 'empty');
  }

  // ── Teto por vínculo — PEEK aqui, débito só depois do insert ─────────────────────────────────
  // `peek` decide sem consumir. A cota é cobrada no fim, quando já se sabe que a mensagem virou job:
  // uma REENTREGA duplicada (que morre no `unique` de `command_id`) não pode consumir a cota de
  // perguntas de verdade da pessoa.
  const quotaKey = `wa:link:${link.id}`;
  if (!getPerLinkLimiter().peek(quotaKey).allowed) {
    // O aviso é o que diferencia "estou te ignorando" de "espera um minuto": sem ele, a pessoa
    // simplesmente some do canal achando que quebrou.
    sendRateLimitNotice(input.provider, link.externalUserKey, link.id);
    return dropMessage(context, 'rate_limited');
  }

  const idempotencyKey = buildInboundIdempotencyKey(message, receivedAt);
  const retryConfig = getRetryConfig(WHATSAPP_INBOUND_OPERATION);
  const maskedUserKey = maskChannelUserKey(link.externalUserKey);

  try {
    await dependencies.insertJob({
      jobId: createPrefixedId('job'),
      // Barreira permanente de reentrega: `jobs.command_id` é `text not null unique`. Uma reentrega
      // do Meta/Twilio DIAS depois do job concluir ainda colide aqui.
      //
      // HASHEADO, não cru. `command_id` é devolvido por `GET /v1/jobs/search`, `GET /v1/jobs/:jobId`
      // e `GET /v1/health/jobs/dlq` — e o `wamid.<base64>` do Meta DECODIFICA para uma estrutura que
      // contém o telefone do remetente. Gravá-lo cru ali anulava a opacidade do `entityId`. O sha256
      // é determinístico, então o `unique` continua sendo a barreira de reentrega que era.
      commandId: `wa:whatsapp:${createHash('sha256').update(idempotencyKey).digest('hex')}`,
      entityType: WHATSAPP_INBOUND_ENTITY_TYPE,
      // Id OPACO. `entity_id` é superfície PÚBLICA (`GET /v1/jobs/:jobId`, `/v1/jobs/search`,
      // `/health/jobs/dlq`, `pg_notify('job_events')`): telefone ali seria PII pública, e o
      // `wamid.<base64>` do Meta só PARECE opaco — ele decodifica para estrutura com o número.
      entityId: createPrefixedId('cimsg'),
      operation: WHATSAPP_INBOUND_OPERATION,
      payload: {
        channel: 'whatsapp',
        providerName: input.provider.name,
        providerMessageId: String(message.providerMessageId || ''),
        // SEM telefone em claro, SEM userId, SEM permissionKeys, SEM integrationAccountId: o vínculo
        // é RELIDO no worker e o principal montado lá, com contexto fresco.
        channelLinkId: link.id,
        disposition: classified.disposition,
        messageType: message.type,
        mediaMimeType: message.media?.mimeType || null,
        mediaIgnored: classified.mediaIgnored,
        textTruncated: classified.textTruncated,
        text: classified.text,
        receivedAt: receivedAt.toISOString(),
        maskedUserKey
      },
      status: 'queued',
      maxAttempts: retryConfig.maxAttempts,
      correlationId: input.correlationId,
      // `null` DE PROPÓSITO. A coluna é informativa (não tem unique, ninguém lê) e é devolvida pelas
      // mesmas rotas de `/v1/jobs` — guardar o `wamid` cru aqui reintroduziria exatamente o vazamento
      // que o hash do `commandId` acabou de fechar. O id do provedor segue no `payload`, que nenhuma
      // dessas rotas serializa.
      idempotencyKey: null,
      priority: calculateJobPriority(WHATSAPP_INBOUND_OPERATION),
      retryStrategy: retryConfig.strategy,
      baseDelayMs: retryConfig.baseDelayMs,
      maxDelayMs: retryConfig.maxDelayMs,
      tags: extractJobTags({
        operation: WHATSAPP_INBOUND_OPERATION,
        entityType: WHATSAPP_INBOUND_ENTITY_TYPE,
        status: 'queued'
      })
    });
  } catch (error) {
    if (isUniqueViolation(error)) {
      // Reentrega já processada. Não é erro — e, por isso mesmo, NÃO cobra cota (o débito está
      // depois deste ponto).
      return dropMessage(context, 'duplicate');
    }
    throw error;
  }

  // ── Débito da cota ───────────────────────────────────────────────────────────────────────────
  // Só agora, com o job gravado. `peek` + `check` não é atômico: dois POSTs concorrentes podem passar
  // os dois e o teto vira aproximado por cima em 1 unidade. É o preço consciente de não cobrar cota
  // de reação, figurinha e reentrega — e o teto global da rota continua na frente.
  getPerLinkLimiter().check(quotaKey);

  return true;
}

/**
 * Cortesia de número não vinculado. FIRE-AND-FORGET: a promise não é aguardada e tem `.catch()`
 * próprio, para que o 200 saia antes e nenhuma falha de envio contamine a recepção.
 *
 * O texto é IDÊNTICO para número desconhecido, vínculo `pending`, vínculo órfão e telefone inválido —
 * não confirma nem nega cadastro, então não vira oráculo de enumeração. É por isso que esta função
 * NÃO recebe o estado do vínculo: sem o discriminante em mãos, não existe onde ramificar. Mesmo assim
 * vem DESLIGADA por default: responder é custo por mensagem contra tráfego arbitrário e amplificação
 * de spam.
 */
async function maybeSendUnlinkedNotice(provider: WhatsAppProvider, externalUserKey: string): Promise<void> {
  if (!config.whatsappUnlinkedNoticeEnabled) return;
  if (!externalUserKey) return;

  // Hash na chave para o telefone não ficar residente em memória como string.
  const bucket = `wa:unlinked:${createHash('sha256').update(externalUserKey).digest('hex')}`;
  if (!getUnlinkedNoticeLimiter().check(bucket).allowed) return;

  void provider
    .sendText({ to: externalUserKey, text: WHATSAPP_UNLINKED_NOTICE })
    .catch((error: unknown) => {
      console.warn(`[whatsapp-inbound] aviso de número não vinculado falhou para ${maskChannelUserKey(externalUserKey)}: ${describeError(error)}`);
    });
}

/**
 * Aviso de teto estourado. FIRE-AND-FORGET, como a cortesia acima.
 *
 * NÃO é gated por `whatsappUnlinkedNoticeEnabled`: aquele flag protege contra responder a tráfego
 * ARBITRÁRIO (número desconhecido). Aqui o destinatário é um vínculo VERIFICADO — alguém que o SICAT
 * já reconhece e que acabou de perder uma mensagem. Silêncio total nesse caso é o pior desfecho: a
 * pessoa conclui que o canal quebrou.
 *
 * Uma vez por janela do teto, por vínculo. Sem isso, cada mensagem barrada geraria uma saída paga —
 * o aviso amplificaria o flood que deveria estar contendo.
 */
function sendRateLimitNotice(provider: WhatsAppProvider, externalUserKey: string, linkId: string): void {
  if (!externalUserKey) return;
  if (!getRateLimitNoticeLimiter().check(`wa:ratelimit:${linkId}`).allowed) return;

  void provider
    .sendText({ to: externalUserKey, text: WHATSAPP_RATE_LIMIT_NOTICE })
    .catch((error: unknown) => {
      console.warn(`[whatsapp-inbound] aviso de teto falhou para ${maskChannelUserKey(externalUserKey)}: ${describeError(error)}`);
    });
}

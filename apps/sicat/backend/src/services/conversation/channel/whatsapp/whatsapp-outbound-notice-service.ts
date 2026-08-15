/**
 * AVISO DE CONCLUSÃO NO CANAL (fase 6 da cadeia `whatsapp-channel-sicat`).
 *
 * ┌─ A ESCOLHA ESTRUTURAL: O AVISO NASCE NA CONFIRMAÇÃO, NÃO NO DESFECHO ─────────────────────────┐
 * │ Um job `whatsapp.outbound_notice` por TICKET, criado em `recordDispatchOutcome` no mesmo turno │
 * │ em que a ação é despachada. O job acorda, lê o estado dos `dispatchedJobIds` e:                 │
 * │   · todos terminais ................. compõe e entrega;                                        │
 * │   · algum pendente, prazo de pé ..... reagenda (lança erro retentável), SEM enviar nada;        │
 * │   · prazo vencido ou última tentativa entrega o parcial honesto e SUCEDE.                       │
 * │                                                                                                │
 * │ Rejeitado: hook nos três pontos terminais de `job-runner.ts`. Ele exigiria o envelope           │
 * │ `payload.channelNotice` atravessando `conversation-service` + o dispatcher, e esse caminho tem  │
 * │ CORRIDA REAL que o worker serial único de hoje (`lane: all`) mascara em 100% dos testes: com    │
 * │ `WORKER_LANE` separada, o worker `default` pode terminar o `manifest.print` antes de o envelope │
 * │ existir e o aviso nunca dispara, em silêncio. A variante transacional ainda precisaria dar um   │
 * │ `client` a `moveJobToDLQ`, que é o caminho terminal de TODO job do sistema.                     │
 * │                                                                                                │
 * │ ATOMICIDADE VEM DA ORDEM, NÃO DE TRANSAÇÃO: o job de aviso existe ANTES de qualquer desfecho,  │
 * │ logo o estado "terminou e não avisou" NÃO EXISTE. A janela se inverte em "vou avisar sobre algo│
 * │ que ainda não terminou" — que é visível, recuperável e tem texto próprio (o de prazo vencido). │
 * └───────────────────────────────────────────────────────────────────────────────────────────────┘
 *
 * ┌─ NÃO NOTIFICAR DUAS VEZES VEM DO BANCO, NÃO DE UM `if` ───────────────────────────────────────┐
 * │ `commandId = 'wa:notice:<ticketId>'` sobre `jobs.command_id text not null unique`. Isso resolve│
 * │ DUAS restrições na mesma linha: o retry do job de AÇÃO é invisível para o aviso (jobs de ação  │
 * │ não criam avisos), o reprocesso do turno de confirmação devolve `created: false`, e um ticket   │
 * │ com lote de 5 gera UM aviso — não cinco mensagens pagas. Não há `if` para neutralizar num teste│
 * │ nem para esquecer numa revisão.                                                                │
 * │                                                                                                │
 * │ Consequência ASSUMIDA: requeue manual da DLQ não gera aviso novo (o `command_id` está gasto).  │
 * │ Requeue é ação de operador — quem requeue fala com a pessoa — e a segunda mensagem cairia fora │
 * │ da janela de 24 h. Os textos de falha e DLQ são escritos PARA essa limitação.                   │
 * └───────────────────────────────────────────────────────────────────────────────────────────────┘
 *
 * ┌─ LIVRO-RAZÃO DE ENTREGA, IDÊNTICO AO DA FASE 3 ──────────────────────────────────────────────┐
 * │ `jobs.payload`: caminho rápido no topo (`noticeSentAt` presente ⇒ conclui, não recompõe, não   │
 * │ reenvia), `sendAttempts += 1` ANTES de cada chamada ao provedor e COMPARADO com um TETO         │
 * │ (`whatsappMaxSendAttempts` + nº de documentos) no topo do envio — é o que limita o loop quando  │
 * │ o processo morre DENTRO do fetch (a Meta aceitou, o carimbo ainda não persistiu): sem o teto o  │
 * │ retry reenviaria o mesmo texto/PDF (mídia PAGA duplicada). `noticeText` persistido ANTES do     │
 * │ envio, carimbo DEPOIS, `noticeText: null` no fim. Mais `documentsSentAt` POR DOCUMENTO: 3 PDFs  │
 * │ são 3 chamadas ao provedor, e um crash depois da 2ª não pode reenviar as 2. O retry é de        │
 * │ ENTREGA, nunca de composição.                                                                   │
 * └───────────────────────────────────────────────────────────────────────────────────────────────┘
 *
 * TELEFONE NUNCA ENTRA NO PAYLOAD: o job carrega `channelLinkId` e o destinatário é RELIDO de
 * `conversation_channel_links` no envio — mesma disciplina da fase 3, e é o que faz a revogação valer
 * na hora.
 */

import { promises as fs } from 'node:fs';
import { config } from '../../../../lib/config.js';
import { recordChannelOutboundNotice, type ChannelNoticePath } from '../../../../lib/channel-metrics.js';
import { createPrefixedId } from '../../../../lib/ids.js';
import { CHANNEL_LANE_OPERATIONS } from '../../../../lib/job-lanes.js';
import { calculateJobPriority, extractJobTags, getRetryConfig } from '../../../../lib/retry.js';
import { findConversationChannelLinkForChannel } from '../../../../repositories/conversation-channel-link-repo.js';
import { findJobById, insertJobIfCommandAbsent } from '../../../../repositories/job-repo.js';
import { getConversationArtifactContent } from '../../conversation-persistence-service.js';
import { resolveWhatsAppProvider } from './index.js';
import { enqueuePendingChannelNotice } from './whatsapp-pending-notices.js';
import { patchWhatsAppActionTicketMetadata } from './whatsapp-action-ticket-service.js';
import {
  buildWhatsAppNoticeText,
  type NoticeOutcome,
  type NoticeTier
} from './whatsapp-notice-texts.js';
import { maskChannelUserKey, type WhatsAppProvider } from './types.js';

type LooseRecord = Record<string, unknown>;

export const WHATSAPP_OUTBOUND_NOTICE_OPERATION = 'whatsapp.outbound_notice';
export const WHATSAPP_OUTBOUND_NOTICE_ENTITY_TYPE = 'channel_action_ticket';

/**
 * INVARIANTE ESTRUTURAL, VERIFICADA NO IMPORT — e ela DERRUBA O PROCESSO (a api e os dois workers).
 *
 * `CHANNEL_LANE_OPERATIONS` é a fonte ÚNICA das duas metades do predicado de `claimJobs`. Se a
 * operação do aviso não estiver lá, numa instalação `WORKER_LANE=default` + `channel` o job **não é
 * reivindicado por raia nenhuma, para sempre, sem um erro de log** — a pessoa confirma uma ação
 * irreversível e nunca recebe o desfecho, em silêncio absoluto. É exatamente o defeito que esta fase
 * existe para matar, e ele não pode nascer de um esquecimento de edição de constante.
 *
 * Os outros dois registros (`getRetryConfig` e `calculateJobPriority`, que são
 * `Record<RetryableOperation, …>`, e o `switch` de `processJob`) o tsconfig estrito cobra sozinho —
 * `job-lanes` é o único elo sem rede, por isso é o único que ganha assert. Molde: o loop de
 * disjunção de `whatsapp-action-eligibility.ts`.
 *
 * Quem revisar precisa saber que esta é a escolha: ela transforma um erro de edição de constante em
 * CrashLoop. A alternativa é aviso invisível para sempre.
 */
for (const required of [WHATSAPP_OUTBOUND_NOTICE_OPERATION]) {
  if (!(CHANNEL_LANE_OPERATIONS as readonly string[]).includes(required)) {
    throw new Error(
      `[whatsapp-outbound-notice] "${required}" NÃO está em CHANNEL_LANE_OPERATIONS (lib/job-lanes.ts). `
      + 'Sem a operação na raia, o job de aviso fica órfão na fila — invisível, para sempre, sem erro no log.'
    );
  }
}

// ---------------------------------------------------------------------------------------------
// Seam de teste. Doubles são FONTE DE DADO (devolvem a linha CRUA que o banco devolveria) e nunca
// reimplementam a decisão que este módulo deveria estar tomando: não filtram por telefone, não
// decidem janela, não conhecem prazo. `now` entra por aqui para que janela e prazo sejam parâmetro.
// ---------------------------------------------------------------------------------------------

type ChannelLinkLike = {
  id: string;
  userId: string | null;
  externalUserKey: string;
  verificationStatus: string;
};

type NoticeJobLike = {
  jobId: string;
  status: string;
  attempts: number;
  lastErrorCode?: string | null;
  payload?: LooseRecord | null;
};

export type NoticeDependencies = {
  insertJobIfCommandAbsent: typeof insertJobIfCommandAbsent;
  findLink: (id: string) => Promise<ChannelLinkLike | null>;
  findJobById: (jobId: string) => Promise<NoticeJobLike | null>;
  getArtifactContent: typeof getConversationArtifactContent;
  patchTicketMetadata: typeof patchWhatsAppActionTicketMetadata;
  enqueuePendingNotice: typeof enqueuePendingChannelNotice;
  resolveProvider: () => WhatsAppProvider | null;
  statFile: (path: string) => Promise<{ size: number }>;
  readFile: (path: string) => Promise<Buffer>;
  now: () => number;
};

const defaultDependencies: NoticeDependencies = {
  insertJobIfCommandAbsent,
  findLink: (id: string) => findConversationChannelLinkForChannel(null, id),
  findJobById: (jobId: string) => findJobById(jobId) as Promise<NoticeJobLike | null>,
  getArtifactContent: getConversationArtifactContent,
  patchTicketMetadata: patchWhatsAppActionTicketMetadata,
  enqueuePendingNotice: enqueuePendingChannelNotice,
  resolveProvider: resolveWhatsAppProvider,
  statFile: (path: string) => fs.stat(path),
  readFile: (path: string) => fs.readFile(path),
  now: () => Date.now()
};

let dependencies: NoticeDependencies = defaultDependencies;

export function setWhatsAppNoticeDependenciesForTests(overrides: Partial<NoticeDependencies> | null): void {
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

function toStringList(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return value.map((entry) => toNonEmptyString(entry)).filter((entry): entry is string => entry !== null);
}

function toRecord(value: unknown): LooseRecord {
  return value && typeof value === 'object' && !Array.isArray(value) ? (value as LooseRecord) : {};
}

// ---------------------------------------------------------------------------------------------
// ENFILEIRAMENTO — roda no turno da confirmação
// ---------------------------------------------------------------------------------------------

export type EnqueueNoticeInput = {
  ticketId: string;
  userId: string;
  channelLinkId: string;
  riskTier: NoticeTier;
  actionKey: string;
  headline: string;
  itemCount: number;
  labels: string[];
  dispatchedJobIds: string[];
  correlationId: string | null;
  integrationAccountId: string | null;
  sessionContextId: string | null;
};

/**
 * `false` = A PROMESSA NÃO PODE SER FEITA. Quem chama passa este booleano para o texto de
 * confirmação, e com `false` o texto é o de hoje, palavra por palavra. Promessa e mecanismo ficam
 * SOLDADOS: não existe caminho em que a mensagem diga "te aviso" sem o job existir.
 *
 * Sem job despachado (`manifest.replicate_segmented` é síncrono e devolve `jobId: null`) não há o
 * que avisar, e o `false` cai de graça — sem `if` de exceção por intent.
 */
export async function enqueueWhatsAppOutboundNotice(input: EnqueueNoticeInput): Promise<boolean> {
  if (!input.ticketId || !input.channelLinkId || !input.userId) return false;
  if (input.dispatchedJobIds.length === 0) return false;

  const retryConfig = getRetryConfig(WHATSAPP_OUTBOUND_NOTICE_OPERATION);
  const confirmedAtMs = dependencies.now();
  const deadlineMs = confirmedAtMs + resolveNoticeDeadlineMs();

  try {
    const { created } = await dependencies.insertJobIfCommandAbsent({
      jobId: createPrefixedId('job'),
      // Barreira do banco. Ver o bloco no topo.
      commandId: `wa:notice:${input.ticketId}`,
      entityType: WHATSAPP_OUTBOUND_NOTICE_ENTITY_TYPE,
      entityId: input.ticketId,
      operation: WHATSAPP_OUTBOUND_NOTICE_OPERATION,
      payload: {
        channel: 'whatsapp',
        ticketId: input.ticketId,
        userId: input.userId,
        // SEM telefone: o destinatário é relido no envio.
        channelLinkId: input.channelLinkId,
        riskTier: input.riskTier,
        actionKey: input.actionKey,
        headline: input.headline,
        itemCount: Math.max(1, input.itemCount),
        labels: input.labels.slice(0, 10),
        dispatchedJobIds: input.dispatchedJobIds.slice(0, 20),
        integrationAccountId: input.integrationAccountId,
        sessionContextId: input.sessionContextId,
        confirmedAt: new Date(confirmedAtMs).toISOString(),
        deadlineAt: new Date(deadlineMs).toISOString()
      },
      status: 'queued',
      maxAttempts: retryConfig.maxAttempts,
      correlationId: input.correlationId,
      idempotencyKey: null,
      priority: calculateJobPriority(WHATSAPP_OUTBOUND_NOTICE_OPERATION),
      retryStrategy: retryConfig.strategy,
      baseDelayMs: retryConfig.baseDelayMs,
      maxDelayMs: retryConfig.maxDelayMs,
      tags: extractJobTags({
        operation: WHATSAPP_OUTBOUND_NOTICE_OPERATION,
        entityType: WHATSAPP_OUTBOUND_NOTICE_ENTITY_TYPE,
        status: 'queued'
      })
    });

    // `created: false` = já existe aviso para este ticket. A promessa CONTINUA verdadeira (alguém vai
    // avisar), então devolve `true`.
    return true;
  } catch (error) {
    // Falhar aqui não pode derrubar a confirmação — a ação JÁ foi despachada. O que muda é o texto:
    // sem job, a mensagem não promete.
    console.warn(
      `[whatsapp-notice] aviso NÃO enfileirado para o ticket ${input.ticketId}: ${describeError(error)} `
      + '— a resposta de confirmação não vai prometer aviso'
    );
    return false;
  }
}

function resolveNoticeDeadlineMs(): number {
  const value = Number(config.whatsappNoticeDeadlineMs);
  return Number.isFinite(value) && value > 0 ? Math.floor(value) : 600000;
}

function resolveNoticeWindowMs(): number {
  const value = Number(config.whatsappNoticeWindowMs);
  return Number.isFinite(value) && value > 0 ? Math.floor(value) : 82800000;
}

function describeError(error: unknown): string {
  const code = String((error as { code?: unknown } | null)?.code ?? '');
  const name = error instanceof Error ? error.name : typeof error;
  return code ? `${name}/${code}` : name;
}

// ---------------------------------------------------------------------------------------------
// AGREGAÇÃO DO DESFECHO
// ---------------------------------------------------------------------------------------------

const TERMINAL_STATUSES = new Set(['succeeded', 'failed', 'dlq', 'cancelled']);

export type NoticeAggregate = {
  outcome: NoticeOutcome;
  total: number;
  completed: number;
  pending: number;
  /** Artefatos de DOCUMENTO dos jobs que concluíram. Nunca o ZIP — ver `collectDocuments`. */
  documentArtifactIds: string[];
  attempts: number;
  errorCode: string | null;
};

/**
 * Classifica o agregado. Exportada para teste direto: a decisão "parcial × falha × DLQ" é o miolo do
 * que a pessoa lê, e ela não pode depender de montar um job inteiro para ser exercitada.
 *
 * `expired` (prazo vencido com algo pendente) vira `timeout`, que tem texto próprio. Prazo vencido
 * com TUDO terminal não é timeout — é o desfecho normal, que chegou tarde.
 */
export function aggregateNoticeOutcome(jobs: Array<NoticeJobLike | null>, options: { expired: boolean }): NoticeAggregate {
  const total = jobs.length;
  let completed = 0;
  let pending = 0;
  let failed = 0;
  let dlq = 0;
  let attempts = 0;
  let errorCode: string | null = null;
  const documentArtifactIds: string[] = [];

  for (const job of jobs) {
    // Job que sumiu da tabela não pode ser lido como sucesso. Conta como falha — é o desfecho seguro.
    if (!job) {
      failed += 1;
      continue;
    }

    const status = String(job.status || '').toLowerCase();
    attempts = Math.max(attempts, toNumber(job.attempts));

    if (!TERMINAL_STATUSES.has(status)) {
      pending += 1;
      continue;
    }

    if (status === 'succeeded') {
      completed += 1;
      const artifactId = toNonEmptyString(toRecord(job.payload).conversationArtifactId);
      if (artifactId) documentArtifactIds.push(artifactId);
      continue;
    }

    if (status === 'dlq') dlq += 1;
    else failed += 1;
    if (!errorCode) errorCode = toNonEmptyString(job.lastErrorCode);
  }

  const outcome: NoticeOutcome = (() => {
    if (pending > 0 && options.expired) return 'timeout';
    if (completed === total && total > 0) return 'succeeded';
    if (completed > 0) return 'partial';
    if (dlq > 0) return 'dlq';
    return 'failed';
  })();

  return { outcome, total, completed, pending, documentArtifactIds: [...new Set(documentArtifactIds)], attempts, errorCode };
}

// ---------------------------------------------------------------------------------------------
// JANELA DE 24 h
// ---------------------------------------------------------------------------------------------

/**
 * A janela é ancorada no ÚLTIMO INBOUND do usuário e cada inbound a reseta; fora dela o provedor só
 * aceita template pré-aprovado.
 *
 * Âncora: `confirmedAt` — a mensagem com os 6 dígitos É um inbound, logo ela abre/reseta a janela. E
 * é um LIMITE INFERIOR do último inbound (a pessoa pode ter mandado mais mensagens depois), o que
 * erra na direção SEGURA: no erro achamos a janela fechada quando estava aberta ⇒ sub-avisamos ⇒
 * nunca tomamos rejeição do provedor.
 *
 * NÃO persistimos `lastInboundAt` em `conversation_channel_links.metadata`: seria read-modify-write
 * em jsonb, escrito pelo pod da api (webhook) e lido pelo worker, com lost update possível — comprando
 * precisão que a margem já torna irrelevante e que só pode deixar o sistema MAIS otimista sobre a
 * janela. Otimismo sobre janela é o erro caro.
 *
 * A margem (`whatsappNoticeWindowMs` = 23 h, não 24) não é conservadorismo estético: são três erros
 * somados na mesma direção — relógio do provedor × relógio do pod, latência de fila entre o desfecho
 * e o envio, e a âncora ser limite inferior.
 */
export function isChannelWindowOpen(confirmedAtIso: unknown, nowMs: number): boolean {
  const confirmedAt = Date.parse(String(confirmedAtIso ?? ''));
  // Âncora ilegível ⇒ FECHADA. Fail-closed: enviar texto livre sem saber a idade da janela é a
  // única falha que custa rejeição do provedor, retry inútil e silêncio.
  if (!Number.isFinite(confirmedAt)) return false;
  return nowMs - confirmedAt < resolveNoticeWindowMs();
}

// ---------------------------------------------------------------------------------------------
// EXECUÇÃO — o lado do worker
// ---------------------------------------------------------------------------------------------

export type NoticeJob = {
  jobId: string;
  attempts: number;
  maxAttempts: number;
  correlationId?: string | null;
  claimedBy?: string | null;
  payload: LooseRecord;
};

export type PatchNoticePayloadFn = (job: NoticeJob, patch: LooseRecord) => Promise<void>;

export type NoticeResult = { outcome: string; patch: LooseRecord };

/** Erro de REAGENDAMENTO. Retentável por classificação de mensagem — não é falha, é "ainda não". */
class NoticeNotReadyError extends Error {
  code = 'WHATSAPP_NOTICE_NOT_READY';

  constructor(pending: number) {
    super(`Aguardando ${pending} job(s) da acao terminarem antes de avisar`);
    this.name = 'NoticeNotReadyError';
  }
}

export async function runWhatsAppOutboundNotice(input: {
  job: NoticeJob;
  patchJobPayload: PatchNoticePayloadFn;
}): Promise<NoticeResult> {
  const { job, patchJobPayload } = input;
  const payload = job.payload || {};
  const ticketId = toNonEmptyString(payload.ticketId) || '';
  const tier: NoticeTier = payload.riskTier === 'N2' ? 'N2' : 'N1';

  // ── CAMINHO RÁPIDO ────────────────────────────────────────────────────────────────────────────
  // Cobre retry de entrega e `requeueStaleRunningJobs` depois de um envio bem-sucedido. Não recompõe
  // (dado que mudou entregaria um texto incoerente com o que já saiu) e NÃO REENVIA.
  if (toNonEmptyString(payload.noticeSentAt)) {
    return { outcome: 'whatsapp_notice_already_sent', patch: { noticeText: null } };
  }

  const nowMs = dependencies.now();
  const deadlineMs = Date.parse(String(payload.deadlineAt ?? ''));
  const expiredByClock = Number.isFinite(deadlineMs) ? nowMs >= deadlineMs : true;
  // ÚLTIMA CHANCE: `shouldMoveToDLQ` é `attempts >= maxAttempts`. Lançar aqui mandaria o AVISO para a
  // DLQ — silêncio sobre o silêncio. Na última tentativa o handler entrega o que tem e SUCEDE.
  const lastAttempt = toNumber(job.attempts) >= toNumber(job.maxAttempts);

  // ── VÍNCULO: RELÊ E COMPARA O DONO ────────────────────────────────────────────────────────────
  const channelLinkId = toNonEmptyString(payload.channelLinkId);
  const link = channelLinkId ? await dependencies.findLink(channelLinkId) : null;
  if (!link || !link.userId || link.verificationStatus !== 'verified') {
    // Desvincular cala o canal NA HORA. Sem retry: retentar não ressuscita o vínculo.
    recordChannelOutboundNotice('unknown', 'skipped_link_revoked');
    await stampTicketOutcome(payload, ticketId, 'link_revoked', 'skipped:link_revoked');
    return { outcome: 'whatsapp_notice_link_revoked', patch: { noticeText: null, userNotified: false } };
  }

  // ⚠️ A fase 2 permite TRANSFERÊNCIA de vínculo por posse comprovada (default ligado, porque
  // operadora recicla número). Entre a confirmação e o desfecho o chip pode ter trocado de dono — e o
  // aviso nomeia MTR e, com mídia ligada, ANEXA o PDF. Entregar ao novo dono é vazamento de documento
  // fiscal de outra empresa.
  if (link.userId !== toNonEmptyString(payload.userId)) {
    recordChannelOutboundNotice('unknown', 'skipped_link_transferred');
    console.warn(
      `[whatsapp-notice] vinculo ${link.id} trocou de dono entre a confirmacao e o desfecho `
      + `(${maskChannelUserKey(link.externalUserKey)}) — aviso NAO enviado`
    );
    await stampTicketOutcome(payload, ticketId, 'link_transferred', 'skipped:link_transferred');
    return { outcome: 'whatsapp_notice_link_transferred', patch: { noticeText: null, userNotified: false } };
  }

  // ── AGREGA O DESFECHO ─────────────────────────────────────────────────────────────────────────
  // O agregado é recalculado a cada tentativa (são leituras de `jobs` por id), mas o TEXTO nunca é
  // recomposto depois de persistido: dado que mudou entregaria uma contagem incoerente com a que já
  // saiu. O agregado serve, no retry, só para saber QUAIS documentos ainda faltam anexar.
  const dispatchedJobIds = toStringList(payload.dispatchedJobIds);
  const preparedText = toNonEmptyString(payload.noticeText);
  const actionJobs = await Promise.all(dispatchedJobIds.map((jobId) => dependencies.findJobById(jobId)));
  const aggregate = aggregateNoticeOutcome(actionJobs, { expired: expiredByClock || lastAttempt });

  // REAGENDA: nada é enviado, nada é composto. O prazo é de PAREDE — se a plataforma ficar 12 h
  // fora, o worker volta, o job acorda, vê o prazo vencido e cai no parcial honesto.
  if (!preparedText && aggregate.pending > 0 && !expiredByClock && !lastAttempt) {
    throw new NoticeNotReadyError(aggregate.pending);
  }

  // ── JANELA DE 24 h ────────────────────────────────────────────────────────────────────────────
  if (!isChannelWindowOpen(payload.confirmedAt, nowMs)) {
    // NUNCA cai para `sendTemplate`. Fora da janela a Meta recusa texto livre — e a recusa é o BOM
    // caso. O ruim é o Twilio: quando `templateName` não começa com `HX`, o adapter renderiza as
    // variáveis e posta como texto livre. Um caminho que nunca chama `sendTemplate` nunca arma essa
    // mina. Não retenta: a janela não reabre sozinha, só um inbound novo a reabre.
    const text = preparedText || composeText(payload, aggregate, tier, 0);
    await dependencies.enqueuePendingNotice({ channelLinkId: link.id, text });
    recordChannelOutboundNotice(aggregate.outcome, 'skipped_outside_window');
    console.warn(
      `[whatsapp-notice] fora da janela para ${maskChannelUserKey(link.externalUserKey)} — `
      + 'aviso NAO empurrado; divida enfileirada para o proximo turno'
    );
    await stampTicketOutcome(payload, ticketId, aggregate.outcome, 'skipped:outside_window');
    return {
      outcome: 'whatsapp_notice_outside_window',
      patch: { noticeText: null, noticeSkipped: 'outside_window', userNotified: false }
    };
  }

  // ── PROVEDOR ──────────────────────────────────────────────────────────────────────────────────
  const provider = dependencies.resolveProvider();
  if (!provider) {
    recordChannelOutboundNotice(aggregate.outcome, 'skipped_undeliverable');
    return { outcome: 'whatsapp_notice_channel_disabled', patch: { noticeText: null, userNotified: false } };
  }

  // ── DOCUMENTOS: capacidade decidida ANTES de compor o texto ───────────────────────────────────
  // Também no retry: `documentsSentAt` filtra o que já saiu, então um crash depois do 2º de 3 PDFs
  // retoma no 3º sem reenviar os dois primeiros.
  const documentsSentAt = readDocumentsSentAt(payload);
  const documents = await collectDocuments({
    aggregate,
    payload,
    provider,
    sentAt: documentsSentAt,
    // Só para o LOG do ramo de provedor incapaz — e sempre mascarado lá dentro. O payload continua
    // sem telefone.
    externalUserKey: link.externalUserKey
  });

  const resolvedOutcome = toNonEmptyString(payload.noticeOutcome) || aggregate.outcome;

  // ── TETO DE TENTATIVAS DE ENVIO ─────────────────────────────────────────────────────────────────
  // `sendAttempts += 1` é persistido ANTES de cada chamada ao provedor; se o processo morre DENTRO do
  // fetch (a Meta já aceitou a mensagem e o carimbo `noticeTextSentAt`/`documentsSentAt` ainda não foi
  // gravado), o retry reincrementa e reenviaria o MESMO texto e o MESMO PDF — mídia PAGA duplicada.
  // Sem este teto o loop só pararia em `maxAttempts` (8). O teto escala com o nº de documentos porque
  // N docs são N chamadas legítimas ao provedor (1 texto + N mídias, ou 1 legenda). Molde da fase 3
  // (`whatsapp-turn-service.ts`): o valor com 0/1 documento é idêntico ao de lá.
  let sendAttempts = toNumber(payload.sendAttempts);
  const attemptsCeiling = (Number(config.whatsappMaxSendAttempts) || 2) + Math.max(0, documents.length);
  if (sendAttempts >= attemptsCeiling && !toNonEmptyString(payload.noticeSentAt)) {
    recordChannelOutboundNotice(resolvedOutcome, 'skipped_undeliverable');
    await stampTicketOutcome(payload, ticketId, resolvedOutcome, 'skipped:undeliverable');
    return { outcome: 'whatsapp_notice_undeliverable', patch: { noticeText: null, userNotified: false } };
  }

  // ── PERSISTE ANTES DE ENVIAR ──────────────────────────────────────────────────────────────────
  const textAlreadySent = Boolean(toNonEmptyString(payload.noticeTextSentAt));
  let text = preparedText;
  if (!text) {
    text = composeText(payload, aggregate, tier, documents.length);
    await patchJobPayload(job, {
      noticeText: text,
      noticeOutcome: aggregate.outcome,
      noticePreparedAt: new Date(nowMs).toISOString(),
      noticeDocumentCount: documents.length
    });
  }

  // ── ENVIO ─────────────────────────────────────────────────────────────────────────────────────
  let deliveryPath: ChannelNoticePath = 'text';
  let providerMessageId: string | null = toNonEmptyString(payload.noticeProviderMessageId);

  try {
    if (!textAlreadySent && documents.length === 1 && documents[0]) {
      // 1 documento ⇒ UMA MENSAGEM SÓ: o texto É a legenda. Zero mensagem extra para o caso
      // dominante (`print_manifest` é maxItems=1).
      const only = documents[0];
      sendAttempts += 1;
      await patchJobPayload(job, { sendAttempts });
      // `readFile` imediatamente antes do envio: o buffer não vive além desta chamada.
      const content = await dependencies.readFile(only.storagePath);
      const sent = await provider.sendMedia({
        to: link.externalUserKey,
        content,
        fileName: only.fileName,
        mimeType: only.mimeType,
        caption: text
      });
      providerMessageId = sent?.providerMessageId ?? null;
      documentsSentAt[only.artifactId] = new Date(dependencies.now()).toISOString();
      deliveryPath = 'media';
      await patchJobPayload(job, {
        documentsSentAt,
        noticeTextSentAt: new Date(dependencies.now()).toISOString(),
        noticeProviderMessageId: providerMessageId
      });
    } else {
      // `noticeTextSentAt` é carimbo PRÓPRIO do texto, separado de `noticeSentAt` (que só existe
      // quando TUDO saiu). Sem ele, um retry que só precisava terminar de mandar os PDFs reenviaria
      // o texto — mensagem paga duplicada dizendo a mesma coisa.
      if (!textAlreadySent) {
        sendAttempts += 1;
        await patchJobPayload(job, { sendAttempts });
        const sent = await provider.sendText({ to: link.externalUserKey, text });
        providerMessageId = sent?.providerMessageId ?? null;
        await patchJobPayload(job, {
          noticeTextSentAt: new Date(dependencies.now()).toISOString(),
          noticeProviderMessageId: providerMessageId
        });
      }

      // SEQUENCIAL, com `readFile` imediatamente antes de cada `sendMedia` e carimbo POR DOCUMENTO: só
      // UM arquivo fica residente por vez (`collectDocuments` devolve só metadados, nunca os bytes), o
      // que evita o pico agregado de N×maxBytes que já derrubou este módulo por OOM; e um crash depois
      // do 2º de 3 não reenvia os 2 já entregues.
      for (const document of documents) {
        if (documentsSentAt[document.artifactId]) continue;
        sendAttempts += 1;
        await patchJobPayload(job, { sendAttempts });
        const content = await dependencies.readFile(document.storagePath);
        await provider.sendMedia({
          to: link.externalUserKey,
          content,
          fileName: document.fileName,
          mimeType: document.mimeType
        });
        documentsSentAt[document.artifactId] = new Date(dependencies.now()).toISOString();
        deliveryPath = 'media';
        await patchJobPayload(job, { documentsSentAt });
      }
    }
  } catch (error) {
    await patchJobPayload(job, { lastSendErrorCode: extractErrorCode(error) });
    if (!lastAttempt) throw error;

    // Última tentativa: o aviso NÃO vai para a DLQ. Conclui como não-entregue, com trilha.
    recordChannelOutboundNotice(resolvedOutcome, 'skipped_undeliverable');
    await stampTicketOutcome(payload, ticketId, resolvedOutcome, 'skipped:undeliverable');
    return {
      outcome: 'whatsapp_notice_undeliverable',
      patch: { noticeText: null, userNotified: false }
    };
  }

  recordChannelOutboundNotice(resolvedOutcome, deliveryPath);
  await stampTicketOutcome(payload, ticketId, resolvedOutcome, deliveryPath === 'media' ? 'media' : 'text');

  return {
    outcome: `whatsapp_notice_${resolvedOutcome}`,
    patch: {
      noticeSentAt: new Date(dependencies.now()).toISOString(),
      noticeProviderMessageId: providerMessageId,
      userNotified: true,
      // O texto some de `jobs` no caminho feliz: ele nomeia MTR, gerador e datas. Só job que MORREU
      // retém o texto — e nele ele é evidência de diagnóstico.
      noticeText: null
    }
  };
}

function composeText(
  payload: LooseRecord,
  aggregate: NoticeAggregate,
  tier: NoticeTier,
  documentCount: number
): string {
  return buildWhatsAppNoticeText(aggregate.outcome, {
    headline: toNonEmptyString(payload.headline) || 'Seu pedido',
    ticketId: toNonEmptyString(payload.ticketId) || '',
    tier,
    // A contagem vem da FONTE (os jobs despachados), nunca de `labels.length`.
    itemTotal: Math.max(1, aggregate.total || toNumber(payload.itemCount)),
    itemCompleted: aggregate.completed,
    labels: toStringList(payload.labels),
    documentCount,
    // `job.attempts` REAL do pior job, nunca um literal.
    attempts: aggregate.attempts,
    errorCode: aggregate.errorCode
  });
}

function readDocumentsSentAt(payload: LooseRecord): Record<string, string> {
  const stored = toRecord(payload.documentsSentAt);
  const result: Record<string, string> = {};
  for (const [key, value] of Object.entries(stored)) {
    const iso = toNonEmptyString(value);
    if (iso) result[key] = iso;
  }
  return result;
}

type PreparedDocument = {
  artifactId: string;
  fileName: string;
  mimeType: string;
  storagePath: string;
  size: number;
};

/**
 * ARQUIVO SÓ POR BYTES NA META. Nenhuma rota pública, nenhuma URL assinada, nenhum token em path ou
 * query, nenhum segredo novo — recusa deliberada, não lacuna. O Twilio lança 501
 * `WHATSAPP_MEDIA_URL_REQUIRED` sem `mediaUrl` e por isso a capacidade é conferida ANTES de montar o
 * texto: o 501 nunca vaza como falha do aviso, e o texto que sai é o honesto ("por aqui não consigo
 * te mandar o arquivo desta vez").
 *
 * ⚠️ `fs.stat` ANTES de qualquer `readFile`, SEMPRE. Nunca `readFile` seguido de checar `.length` —
 * isso é medir o incêndio com o prédio já queimando. O gargalo não é o provedor: é o pod (mesmo
 * processo do turno de LLM) e um `uploadMedia` que mantém duas cópias simultâneas do arquivo.
 *
 * NUNCA O ZIP. O lote de ≥2 vira artefato `zip` e ZIP no celular é beco sem saída — a pessoa precisa
 * repassar o MTR para CADA motorista, e PDF individual é encaminhável. Na prática isso significa que
 * o lote de ≥2 não tem artefato de documento por job (só o zip agregador) e cai no texto (2): é o
 * comportamento correto, não uma omissão.
 */
async function collectDocuments(input: {
  aggregate: NoticeAggregate;
  payload: LooseRecord;
  provider: WhatsAppProvider;
  sentAt: Record<string, string>;
  externalUserKey: string;
}): Promise<PreparedDocument[]> {
  const artifactIds = input.aggregate.documentArtifactIds;
  if (artifactIds.length === 0) return [];

  const maxDocuments = Number(config.whatsappNoticeMaxDocuments);
  const cap = Number.isFinite(maxDocuments) && maxDocuments > 0 ? Math.floor(maxDocuments) : 0;

  // POLÍTICA desligada (flag `false` ou teto de docs 0). Rótulo PRÓPRIO, distinto do de capacidade
  // logo abaixo: os dois ramos já dividiram `skipped_media_disabled` e o resultado era um operador
  // ligando a flag numa instalação Twilio, vendo o comportamento não mudar e a métrica insistir que
  // a política estava desligada.
  if (config.whatsappMediaDeliveryEnabled !== true || cap === 0) {
    recordChannelOutboundNotice(input.aggregate.outcome, 'skipped_media_disabled');
    return [];
  }

  // CAPACIDADE: só a Meta aceita bytes. Sem isto, `sendMedia` do Twilio lançaria 501 e derrubaria o
  // aviso INTEIRO. O warn existe porque este é o único ramo em que a política diz "sim" e o canal
  // diz "não" — sem ele, a instalação Twilio com a flag ligada não tem sinal nenhum do porquê.
  if (input.provider.name !== 'meta') {
    recordChannelOutboundNotice(input.aggregate.outcome, 'skipped_media_provider_unsupported');
    console.warn(
      `[whatsapp-notice] politica de midia LIGADA, mas o provedor "${input.provider.name}" nao aceita bytes — `
      + `anexo degradado para texto para ${maskChannelUserKey(input.externalUserKey)}`
    );
    return [];
  }

  // Acima do teto de itens, texto — não meia entrega. CONTADO: este ramo já retornou `[]` sem
  // métrica nenhuma, e degradação invisível é exatamente o que esta série existe para impedir.
  if (artifactIds.length > cap) {
    recordChannelOutboundNotice(input.aggregate.outcome, 'skipped_media_over_cap');
    return [];
  }

  const maxBytesRaw = Number(config.whatsappMediaMaxBytes);
  const maxBytes = Number.isFinite(maxBytesRaw) && maxBytesRaw > 0 ? Math.floor(maxBytesRaw) : 8388608;

  const documents: PreparedDocument[] = [];
  for (const artifactId of artifactIds) {
    if (input.sentAt[artifactId]) continue;

    try {
      const artifact = await dependencies.getArtifactContent({
        artifactId,
        integrationAccountId: toNonEmptyString(input.payload.integrationAccountId),
        sessionContextId: toNonEmptyString(input.payload.sessionContextId),
        // ESCOPO DO PRINCIPAL DO TICKET, com exigência de eixo POSITIVO. Nunca um escopo "de serviço",
        // nunca um caminho interno que pule a guarda.
        requirePositiveAxis: true
      });

      // ZIP jamais vai para o celular.
      if (String(artifact.mimeType || '').toLowerCase().includes('zip')) continue;

      const stats = await dependencies.statFile(artifact.storagePath);
      if (!Number.isFinite(stats.size) || stats.size > maxBytes) {
        // Sem esta métrica a degradação para texto fica invisível e o teto nunca é calibrado.
        recordChannelOutboundNotice(input.aggregate.outcome, 'skipped_media_oversize');
        return [];
      }

      // SÓ METADADOS. O `readFile` acontece no laço de envio, um arquivo por vez, para nunca manter
      // N buffers residentes simultaneamente (o pico agregado de N×maxBytes é o OOM deste módulo).
      documents.push({
        artifactId,
        fileName: artifact.fileName,
        mimeType: artifact.mimeType,
        storagePath: artifact.storagePath,
        size: stats.size
      });
    } catch (error) {
      // Artefato indisponível/expirado/fora de escopo NÃO derruba o aviso — o desfecho ainda precisa
      // chegar. Degrada para o texto (2), que é honesto sobre não ter mandado o arquivo.
      console.warn(`[whatsapp-notice] documento ${artifactId} nao pode ser anexado: ${describeError(error)}`);
      return [];
    }
  }

  return documents;
}

function extractErrorCode(error: unknown): string | null {
  const code = (error as { code?: unknown } | null)?.code;
  return typeof code === 'string' && code.trim() ? code.trim() : null;
}

/**
 * `dispatchStatus` DEIXA DE MENTIR.
 *
 * Hoje `recordDispatchOutcome` só roda no turno da confirmação: um ticket cujo job foi para a DLQ
 * fica com `dispatchStatus: 'dispatched'` PARA SEMPRE. Quem audita lê "despachado" e a verdade é
 * "morreu". Enquanto o livro de registro da própria ação mentir, `verified` + `dispatched` significam
 * "não sei" — e não se libera ação irreversível apoiado num registro que não sabe.
 *
 * `patchWhatsAppActionTicketMetadata` já funciona em linha CONSUMIDA (não exige `consumed_at is
 * null`), então isto é zero DDL.
 */
async function stampTicketOutcome(
  payload: LooseRecord,
  ticketId: string,
  outcome: string,
  noticeDelivery: string
): Promise<void> {
  const userId = toNonEmptyString(payload.userId);
  if (!ticketId || !userId) return;
  try {
    await dependencies.patchTicketMetadata({
      id: ticketId,
      userId,
      metadataPatch: {
        dispatchStatus: outcome,
        outcomeAt: new Date(dependencies.now()).toISOString(),
        noticeDelivery
      }
    });
  } catch (error) {
    console.warn(`[whatsapp-notice] desfecho nao carimbado no ticket ${ticketId}: ${describeError(error)}`);
  }
}

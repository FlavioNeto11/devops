/**
 * Regulatory Watch (PR-H1, DL-103) — acompanhamento de fontes normativas com fluxo
 * DETECTED → INGESTED → AI_ANALYZED/AI_SKIPPED → HUMAN_REVIEW → APPROVED/REJECTED → ACTIVE_APPLIED.
 *
 * ⚠️ REGRA DE OURO DO PROGRAMA: a máquina NUNCA ativa regra bloqueante sozinha. Este service produz
 * SUGESTÕES (detecção de mudança + resumo opcional de IA) até `human_review`; a partir daí toda
 * transição exige um humano (`revisar`/`aplicar`) e a versão criada por `aplicar` nasce SEMPRE
 * `blocking=false` (o campo nem existe no request — ver `applyRegulatoryWatchItemService`). O ÚNICO
 * caminho para `blocking=true` é a promoção administrativa
 * (`promoteTransportRuleVersionService`, `transporte-regras-service.ts`).
 *
 * Fronteira `route → service → repository → job → worker → gateway` (backend/AGENTS.md §2): as
 * funções `list`/`get`/`review`/`apply`/`trigger` (sufixo `Service`) são chamadas pela rota
 * (`transporte-routes.ts`); `runRegulatoryWatchCheckJob` é chamado pelo worker
 * (`workers/operation-handlers.ts`).
 *
 * ── Passo de IA — OPCIONAL por desenho, NUNCA bloqueia o fluxo ─────────────────────────────────────
 * Quando `OPENAI_API_KEY`/`AI_CONTROL_ENABLED` estão ausentes/desligados, OU quando a chamada de IA
 * falha por qualquer motivo, o item pula direto para `ai_skipped` → `human_review` — o worker NUNCA
 * falha por falta (ou falha) de IA. O prompt é FIXO e minimalista: pede um resumo do que o conteúdo
 * baixado PARECE tratar (a IA não tem a versão ANTERIOR para comparar — nunca afirma "o que mudou",
 * só descreve a versão atual) e é instruído a NUNCA sugerir uma decisão.
 */

import fs from 'node:fs/promises';
import { SystemMessage, HumanMessage } from '@langchain/core/messages';
import { withTransaction } from '../db/pool.js';
import { AppError } from '../lib/problem.js';
import { createPrefixedId } from '../lib/ids.js';
import { buildCommandAccepted } from '../lib/command-response.js';
import { calculateJobPriority, extractJobTags, getRetryConfig } from '../lib/retry.js';
import { insertAuditEntry } from '../repositories/audit-repo.js';
import { insertJobDeduplicated } from '../repositories/job-repo.js';
import { getIdempotentResponse, rememberIdempotentResponse } from './idempotency-service.js';
import {
  createRegulatoryWatchGateway,
  type RegulatoryWatchGatewayExchange
} from '../gateways/regulatory-watch-gateway.js';
import {
  findPendingWatchItemBySourceAndHash,
  getWatchItemById,
  insertWatchEvent,
  insertWatchItem,
  listMonitoredSourcesWithUrl,
  listWatchEventsForItem,
  listWatchItems,
  updateSourceHashOnApply,
  updateWatchItem,
  type MonitoredSourceRow
} from '../repositories/regulatory-watch-repo.js';
import {
  getRuleByCode,
  insertRuleVersion
} from '../repositories/regulatory-repo.js';
import {
  REGULATORY_WATCH_ITEM_STATUSES,
  REGULATORY_WATCH_REVIEW_DECISIONS,
  type RegulatoryWatchAiAnalysis,
  type RegulatoryWatchEvent,
  type RegulatoryWatchItem,
  type RegulatoryWatchItemStatus
} from '../lib/transport/regulatory-watch-types.js';
import { RULE_IMPLEMENTATION_STATES, type RuleImplementationState } from '../lib/transport/regulatory-types.js';
import { hasOpenAiApiKey, getAiConfig, createChatModel, getReasoningEffortFor } from './conversation/ai-config.js';
import { getAiControlConfig } from './ai-control/ai-control-config.js';

type LooseRecord = Record<string, unknown>;
type HeaderMap = Record<string, string | undefined>;

const OPERATION = 'transporte.regulatory.watch_check';
const SWEEP_ENTITY_TYPE = 'regulatory_watch_sweep';
const SWEEP_ENTITY_ID = 'global';

function requireNonEmptyString(value: unknown, detail: string, code: string): string {
  const normalized = typeof value === 'string' ? value.trim() : '';
  if (!normalized) throw new AppError(400, 'Bad Request', detail, { code });
  return normalized;
}

function ensureCorrelationId(correlationId: string | null): string {
  return correlationId || createPrefixedId('corr');
}

function itemNotFound(itemId: string): AppError {
  return new AppError(404, 'Not Found', `Item de Regulatory Watch ${itemId} não encontrado.`, {
    code: 'REGULATORY_WATCH_ITEM_NOT_FOUND'
  });
}

// =============================================================================
// DTOs
// =============================================================================

function toItemResource(item: RegulatoryWatchItem) {
  return {
    id: item.id,
    sourceId: item.sourceId,
    status: item.status,
    detectedChange: item.detectedChange,
    ingestedContentRef: item.ingestedContentRef,
    aiAnalysis: item.aiAnalysis,
    humanReviewNotes: item.humanReviewNotes,
    reviewedBy: item.reviewedBy,
    reviewedAt: item.reviewedAt,
    appliedRuleVersionId: item.appliedRuleVersionId,
    correlationId: item.correlationId,
    version: item.version,
    createdAt: item.createdAt,
    updatedAt: item.updatedAt
  };
}

function toEventResource(event: RegulatoryWatchEvent) {
  return {
    id: event.id,
    eventType: event.eventType,
    detail: event.detail,
    correlationId: event.correlationId,
    createdAt: event.createdAt
  };
}

// =============================================================================
// GET /v1/transporte/watch
// =============================================================================

function parsePage(raw: unknown, fallback = 1): number {
  const value = Number.parseInt(String(raw ?? ''), 10);
  return Number.isFinite(value) && value > 0 ? value : fallback;
}

function parsePageSize(raw: unknown, fallback = 20): number {
  const value = Number.parseInt(String(raw ?? ''), 10);
  if (!Number.isFinite(value) || value <= 0) return fallback;
  return Math.min(value, 200);
}

export async function listRegulatoryWatchItemsService(query: LooseRecord = {}) {
  const page = parsePage(query.page);
  const pageSize = parsePageSize(query.pageSize);
  const status = typeof query.status === 'string' && query.status.length > 0 ? query.status : undefined;

  if (status && !(REGULATORY_WATCH_ITEM_STATUSES as readonly string[]).includes(status)) {
    throw new AppError(
      400,
      'Bad Request',
      `status inválido: '${status}'. Valores aceitos: ${REGULATORY_WATCH_ITEM_STATUSES.join(', ')}.`,
      { code: 'REGULATORY_WATCH_STATUS_INVALID' }
    );
  }

  const result = await listWatchItems({ status, page, pageSize });
  const totalPages = result.totalItems === 0 ? 0 : Math.ceil(result.totalItems / pageSize);
  return {
    items: result.items.map(toItemResource),
    page,
    pageSize,
    totalItems: result.totalItems,
    totalPages
  };
}

// =============================================================================
// GET /v1/transporte/watch/{itemId}
// =============================================================================

export async function getRegulatoryWatchItemService(itemId: string) {
  const item = await getWatchItemById(itemId);
  if (!item) throw itemNotFound(itemId);
  const events = await listWatchEventsForItem(itemId);
  return { ...toItemResource(item), events: events.map(toEventResource) };
}

// =============================================================================
// POST /v1/transporte/watch/{itemId}/revisar
// =============================================================================

export type WatchCommandContext = { correlationId: string | null; evaluatedBy: string | null };

export async function reviewRegulatoryWatchItemService(
  itemId: string,
  body: LooseRecord,
  ctx: WatchCommandContext
) {
  const decision = body.decision;
  if (!(REGULATORY_WATCH_REVIEW_DECISIONS as readonly string[]).includes(String(decision))) {
    throw new AppError(
      400,
      'Bad Request',
      `decision inválida: esperado um de ${REGULATORY_WATCH_REVIEW_DECISIONS.join(', ')} (recebido "${String(decision)}").`,
      { code: 'REGULATORY_WATCH_DECISION_INVALID' }
    );
  }
  const expectedVersion = Number(body.version);
  if (!Number.isFinite(expectedVersion)) {
    throw new AppError(400, 'Bad Request', 'version é obrigatório para revisar (locking otimista).', {
      code: 'REGULATORY_WATCH_VERSION_REQUIRED'
    });
  }
  const notes = typeof body.notes === 'string' ? body.notes.trim().slice(0, 2000) : null;
  const reviewedBy = ctx.evaluatedBy;
  if (!reviewedBy) {
    throw new AppError(401, 'Unauthorized', 'Sessão SICAT sem usuário identificável para revisar.', {
      code: 'REGULATORY_WATCH_REVIEWER_REQUIRED'
    });
  }

  const item = await getWatchItemById(itemId);
  if (!item) throw itemNotFound(itemId);

  if (item.status !== 'human_review') {
    throw new AppError(
      409,
      'Conflict',
      `Item ${itemId} está em status '${item.status}' — só é possível revisar itens em 'human_review'.`,
      { code: 'REGULATORY_WATCH_ITEM_NOT_REVIEWABLE' }
    );
  }

  const newStatus: RegulatoryWatchItemStatus = decision === 'approved' ? 'approved' : 'rejected';
  const reviewedAt = new Date().toISOString();
  const correlationId = ensureCorrelationId(ctx.correlationId);

  const updated = await updateWatchItem(itemId, expectedVersion, {
    status: newStatus,
    humanReviewNotes: notes,
    reviewedBy,
    reviewedAt
  });

  if (!updated) {
    throw new AppError(
      409,
      'Conflict',
      `Item ${itemId} foi alterado por outra operação (version divergente) — recarregue e tente de novo.`,
      { code: 'REGULATORY_WATCH_VERSION_CONFLICT' }
    );
  }

  await insertWatchEvent({
    id: createPrefixedId('regwev'),
    watchItemId: itemId,
    sourceId: item.sourceId,
    eventType: newStatus,
    detail: { notes, reviewedBy },
    correlationId
  });

  return toItemResource(updated);
}

// =============================================================================
// POST /v1/transporte/watch/{itemId}/aplicar
// =============================================================================

export async function applyRegulatoryWatchItemService(
  itemId: string,
  body: LooseRecord,
  ctx: WatchCommandContext
) {
  const ruleCode = requireNonEmptyString(body.ruleCode, 'ruleCode é obrigatório.', 'REGULATORY_WATCH_FIELD_REQUIRED');
  const versionLabel = requireNonEmptyString(body.versionLabel, 'versionLabel é obrigatório.', 'REGULATORY_WATCH_FIELD_REQUIRED');
  const effectiveFrom = requireNonEmptyString(body.effectiveFrom, 'effectiveFrom é obrigatório.', 'REGULATORY_WATCH_FIELD_REQUIRED');
  const summary = requireNonEmptyString(body.summary, 'summary é obrigatório.', 'REGULATORY_WATCH_FIELD_REQUIRED');
  const implementationState = body.implementationState;
  if (!(RULE_IMPLEMENTATION_STATES as readonly string[]).includes(String(implementationState))) {
    throw new AppError(
      400,
      'Bad Request',
      `implementationState inválido: esperado um de ${RULE_IMPLEMENTATION_STATES.join(', ')} (recebido "${String(implementationState)}").`,
      { code: 'REGULATORY_WATCH_IMPLEMENTATION_STATE_INVALID' }
    );
  }
  // `blocking` NÃO é lido do body — mesmo se o cliente mandar o campo, ele é ignorado. A versão
  // criada aqui é SEMPRE blocking=false (regra de ouro do programa).
  const legalBasisAdditions = Array.isArray(body.legalBasisAdditions)
    ? body.legalBasisAdditions
      .filter((entry): entry is LooseRecord => Boolean(entry) && typeof entry === 'object')
      .map((entry) => ({ reference: String((entry as LooseRecord).reference ?? '') }))
      .filter((entry) => entry.reference.length > 0)
    : [];

  const reviewedBy = ctx.evaluatedBy;
  if (!reviewedBy) {
    throw new AppError(401, 'Unauthorized', 'Sessão SICAT sem usuário identificável para aplicar.', {
      code: 'REGULATORY_WATCH_REVIEWER_REQUIRED'
    });
  }

  const item = await getWatchItemById(itemId);
  if (!item) throw itemNotFound(itemId);

  if (item.status !== 'approved') {
    throw new AppError(
      409,
      'Conflict',
      `Item ${itemId} está em status '${item.status}' — só é possível aplicar itens 'approved'.`,
      { code: 'REGULATORY_WATCH_ITEM_NOT_APPLICABLE' }
    );
  }

  const rule = await getRuleByCode(ruleCode);
  if (!rule) {
    throw new AppError(404, 'Not Found', `Regra de transporte não encontrada: '${ruleCode}'.`, {
      code: 'TRANSPORT_RULE_NOT_FOUND'
    });
  }

  const detectedChange = item.detectedChange as { newHash?: string };
  const newHash = typeof detectedChange.newHash === 'string' ? detectedChange.newHash : null;
  const correlationId = ensureCorrelationId(ctx.correlationId);
  const newVersionId = createPrefixedId('regrulev');

  let createdVersion;
  try {
    createdVersion = await withTransaction(async (client) => {
      const version = await insertRuleVersion(
        {
          id: newVersionId,
          ruleId: rule.id,
          versionLabel,
          legalBasis: legalBasisAdditions,
          summary,
          effectiveFrom,
          implementationState: implementationState as RuleImplementationState,
          severity: 'warning',
          sourceHash: newHash
        },
        client
      );

      const applied = await updateWatchItem(
        itemId,
        item.version,
        { status: 'active_applied', appliedRuleVersionId: version.id },
        client
      );
      if (!applied) {
        throw new AppError(
          409,
          'Conflict',
          `Item ${itemId} foi alterado por outra operação (version divergente) — recarregue e tente de novo.`,
          { code: 'REGULATORY_WATCH_VERSION_CONFLICT' }
        );
      }

      if (newHash) {
        await updateSourceHashOnApply(item.sourceId, newHash, client);
      }

      await insertWatchEvent(
        {
          id: createPrefixedId('regwev'),
          watchItemId: itemId,
          sourceId: item.sourceId,
          eventType: 'active_applied',
          detail: { ruleCode, versionLabel, ruleVersionId: version.id, reviewedBy },
          correlationId
        },
        client
      );

      return version;
    });
  } catch (error) {
    if (error instanceof AppError) throw error;
    const code = (error as { code?: string } | null)?.code;
    if (code === '23P01') {
      throw new AppError(
        409,
        'Conflict',
        `A vigência de ${versionLabel} (${effectiveFrom}..) cruza outra versão existente de ${ruleCode}.`,
        { code: 'REGULATORY_RULE_VERSION_OVERLAP' }
      );
    }
    if (code === '23505') {
      throw new AppError(409, 'Conflict', `${ruleCode}/${versionLabel} já existe.`, {
        code: 'REGULATORY_RULE_VERSION_ALREADY_EXISTS'
      });
    }
    throw error;
  }

  return {
    watchItem: toItemResource({ ...item, status: 'active_applied', appliedRuleVersionId: createdVersion.id }),
    ruleVersion: {
      id: createdVersion.id,
      ruleCode,
      versionLabel: createdVersion.versionLabel,
      implementationState: createdVersion.implementationState,
      blocking: createdVersion.blocking,
      effectiveFrom: createdVersion.effectiveFrom,
      effectiveUntil: createdVersion.effectiveUntil
    }
  };
}

// =============================================================================
// POST /v1/transporte/watch/verificar-agora — 202, job dedupe
// =============================================================================

export async function triggerRegulatoryWatchCheckNowService(
  headers: HeaderMap,
  correlationId: string | null
): Promise<LooseRecord> {
  const idempotencyKey = headers['idempotency-key'];
  const reused = await getIdempotentResponse(`${OPERATION}:${SWEEP_ENTITY_ID}`, idempotencyKey);
  if (reused) return reused;

  const correlation = ensureCorrelationId(correlationId);
  const retryConfig = getRetryConfig(OPERATION);
  const priority = calculateJobPriority(OPERATION);
  const jobId = createPrefixedId('job');
  const commandId = createPrefixedId('cmd');

  const enqueued = await insertJobDeduplicated({
    jobId,
    commandId,
    entityType: SWEEP_ENTITY_TYPE,
    entityId: SWEEP_ENTITY_ID,
    operation: OPERATION,
    payload: { triggeredBy: 'manual' },
    status: 'queued',
    maxAttempts: retryConfig.maxAttempts,
    correlationId: correlation,
    idempotencyKey,
    priority,
    retryStrategy: retryConfig.strategy,
    baseDelayMs: retryConfig.baseDelayMs,
    maxDelayMs: retryConfig.maxDelayMs,
    tags: extractJobTags({ operation: OPERATION, entityType: SWEEP_ENTITY_TYPE, status: 'queued' })
  });

  if (!enqueued?.job) {
    throw new AppError(500, 'Internal Server Error', 'Falha ao enfileirar a varredura do Regulatory Watch.', {
      code: 'REGULATORY_WATCH_ENQUEUE_FAILED'
    });
  }

  const response = buildCommandAccepted({
    commandId: enqueued.job.commandId || commandId,
    jobId: enqueued.job.jobId,
    correlationId: correlation,
    entityType: SWEEP_ENTITY_TYPE,
    entityId: SWEEP_ENTITY_ID,
    operation: OPERATION,
    entityLink: '/v1/transporte/watch'
  });

  await rememberIdempotentResponse({
    operation: `${OPERATION}:${SWEEP_ENTITY_ID}`,
    idempotencyKey,
    entityType: SWEEP_ENTITY_TYPE,
    entityId: SWEEP_ENTITY_ID,
    response: response as unknown as Record<string, unknown>
  });

  return response;
}

/** Chamado pelo `job-runner.ts` na varredura periódica (só quando `mode=live`) — mesmo enfileiramento do disparo manual. */
export async function enqueueRegulatoryWatchSweep(): Promise<void> {
  const retryConfig = getRetryConfig(OPERATION);
  const priority = calculateJobPriority(OPERATION);
  await insertJobDeduplicated({
    jobId: createPrefixedId('job'),
    commandId: createPrefixedId('cmd'),
    entityType: SWEEP_ENTITY_TYPE,
    entityId: SWEEP_ENTITY_ID,
    operation: OPERATION,
    payload: { triggeredBy: 'sweep' },
    status: 'queued',
    maxAttempts: retryConfig.maxAttempts,
    correlationId: createPrefixedId('corr'),
    priority,
    retryStrategy: retryConfig.strategy,
    baseDelayMs: retryConfig.baseDelayMs,
    maxDelayMs: retryConfig.maxDelayMs,
    tags: extractJobTags({ operation: OPERATION, entityType: SWEEP_ENTITY_TYPE, status: 'queued' })
  });
}

// =============================================================================
// Worker — job `transporte.regulatory.watch_check`
// =============================================================================

const REGULATORY_WATCH_AI_SYSTEM_PROMPT = `Você ajuda um analista jurídico-regulatório a triar mudanças
detectadas em fontes normativas de transporte de cargas no Brasil (leis, resoluções ANTT, notas
técnicas). Você recebe apenas um trecho do conteúdo ATUAL da fonte após uma mudança de hash ter sido
detectada — você NÃO tem a versão anterior para comparar. Responda em português, em no máximo 3
frases curtas, descrevendo do que o texto parece tratar (título/assunto/dispositivos citados) para
ajudar a priorização humana. NUNCA afirme "isto mudou de X para Y" (você não pode provar isso). NUNCA
sugira se a mudança deve ser aplicada, ignorada ou tratada como bloqueante — essa decisão é
exclusivamente humana.`;

const AI_CONTENT_SAMPLE_MAX_CHARS = 6000;

function stripHtmlTagsBestEffort(raw: string): string {
  return raw
    .replace(/<script[\s\S]*?<\/script>/gi, ' ')
    .replace(/<style[\s\S]*?<\/style>/gi, ' ')
    .replace(/<[^>]+>/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

/**
 * Melhor esforço: lê o conteúdo baixado (`contentRef`), tenta extrair texto legível e pede um
 * resumo minimalista. Retorna `null` em QUALQUER falha (chave ausente, IA desligada, erro de
 * leitura, erro da chamada) — o chamador trata `null` como `ai_skipped`, nunca como erro do job.
 */
async function attemptAiAnalysis(
  source: { reference: string; title: string },
  contentRef: string | null
): Promise<RegulatoryWatchAiAnalysis | null> {
  if (!hasOpenAiApiKey() || !getAiControlConfig().enabled) return null;

  let sample = '';
  if (contentRef) {
    try {
      const raw = await fs.readFile(contentRef, 'utf8');
      sample = stripHtmlTagsBestEffort(raw).slice(0, AI_CONTENT_SAMPLE_MAX_CHARS);
    } catch {
      sample = '';
    }
  }
  if (!sample) return null;

  try {
    const aiConfig = getAiConfig();
    const llm = createChatModel(aiConfig.openAiJudgeModel, aiConfig.openAiApiKey, getReasoningEffortFor('routing'));
    const response = await llm.invoke([
      new SystemMessage(REGULATORY_WATCH_AI_SYSTEM_PROMPT),
      new HumanMessage(`Fonte: ${source.reference} — ${source.title}\n\nTrecho do conteúdo atual:\n${sample}`)
    ]);
    const summary = String(response.content ?? '').trim().slice(0, 2000);
    if (!summary) return null;
    return { summary, model: aiConfig.openAiJudgeModel, analyzedAt: new Date().toISOString() };
  } catch {
    return null;
  }
}

export type RegulatoryWatchCheckJobResult = {
  outcome: string;
  patch: LooseRecord;
};

async function logWatchExchange(correlationId: string, sourceId: string, exchange: RegulatoryWatchGatewayExchange): Promise<void> {
  await insertAuditEntry({
    correlationId,
    entityType: 'regulatory_source',
    entityId: sourceId,
    direction: 'outbound',
    component: 'regulatory-watch-gateway',
    httpMethod: exchange.request.httpMethod,
    endpoint: exchange.request.endpoint,
    httpStatus: null,
    latencyMs: null,
    sanitizedHeaders: exchange.request.sanitizedHeaders
  });
  await insertAuditEntry({
    correlationId,
    entityType: 'regulatory_source',
    entityId: sourceId,
    direction: 'inbound',
    component: 'regulatory-watch-gateway',
    httpMethod: exchange.response.httpMethod,
    endpoint: exchange.response.endpoint,
    httpStatus: exchange.response.httpStatus,
    latencyMs: exchange.response.latencyMs,
    sanitizedHeaders: exchange.response.sanitizedHeaders
  });
}

async function checkOneSource(source: MonitoredSourceRow, correlationId: string): Promise<'changed' | 'no_change' | 'already_tracked' | 'error'> {
  const gateway = createRegulatoryWatchGateway();
  const result = await gateway.fetchSource({ url: source.sourceUrl, previousHash: source.sourceHash });

  // `mode=off` nunca chega aqui de verdade (a chamadora não invoca `checkOneSource` nesse caso — ver
  // `runRegulatoryWatchCheckJob`), mas o guard fica por defesa em profundidade.
  if (result.skipped) return 'no_change';

  await logWatchExchange(correlationId, source.id, result.exchange);

  if (!result.changed) {
    await insertWatchEvent({
      id: createPrefixedId('regwev'),
      sourceId: source.id,
      eventType: 'check_run_no_change',
      detail: { httpStatus: result.httpStatus, contentHash: result.contentHash },
      correlationId
    });
    return 'no_change';
  }

  const alreadyTracked = await findPendingWatchItemBySourceAndHash(source.id, result.contentHash);
  if (alreadyTracked) return 'already_tracked';

  const item = await insertWatchItem({
    id: createPrefixedId('regwatch'),
    sourceId: source.id,
    status: 'detected',
    detectedChange: {
      previousHash: source.sourceHash,
      newHash: result.contentHash,
      httpStatus: result.httpStatus,
      etag: result.etag,
      lastModified: result.lastModified
    },
    correlationId
  });
  await insertWatchEvent({
    id: createPrefixedId('regwev'),
    watchItemId: item.id,
    sourceId: source.id,
    eventType: 'detected',
    detail: { newHash: result.contentHash },
    correlationId
  });

  const ingested = await updateWatchItem(item.id, item.version, {
    status: 'ingested',
    ingestedContentRef: result.contentRef
  });
  const currentItem = ingested ?? item;
  await insertWatchEvent({
    id: createPrefixedId('regwev'),
    watchItemId: item.id,
    sourceId: source.id,
    eventType: 'ingested',
    detail: { contentRef: result.contentRef },
    correlationId
  });

  const analysis = await attemptAiAnalysis({ reference: source.reference, title: source.title }, result.contentRef);
  // Exatamente UM `updateWatchItem` roda no bloco abaixo (ai_analyzed OU ai_skipped) — o trigger
  // `increment_version()` bate a versão em +1 sobre `currentItem.version`, que é o que
  // `afterAiVersion` usa para a transição seguinte (human_review) sem precisar reconsultar o banco.
  if (analysis) {
    await updateWatchItem(item.id, currentItem.version, { status: 'ai_analyzed', aiAnalysis: analysis });
    await insertWatchEvent({
      id: createPrefixedId('regwev'),
      watchItemId: item.id,
      sourceId: source.id,
      eventType: 'ai_analyzed',
      detail: { model: analysis.model },
      correlationId
    });
  } else {
    const reason = hasOpenAiApiKey() && getAiControlConfig().enabled ? 'ai_call_failed' : 'ai_unavailable';
    await updateWatchItem(item.id, currentItem.version, { status: 'ai_skipped' });
    await insertWatchEvent({
      id: createPrefixedId('regwev'),
      watchItemId: item.id,
      sourceId: source.id,
      eventType: 'ai_skipped',
      detail: { reason },
      correlationId
    });
  }

  const afterAiVersion = currentItem.version + 1;
  await updateWatchItem(item.id, afterAiVersion, { status: 'human_review' });
  await insertWatchEvent({
    id: createPrefixedId('regwev'),
    watchItemId: item.id,
    sourceId: source.id,
    eventType: 'human_review',
    detail: {},
    correlationId
  });

  return 'changed';
}

/**
 * Corpo do job `transporte.regulatory.watch_check` — chamado por
 * `handleTransporteRegulatoryWatchCheck` (`workers/operation-handlers.ts`). `mode=off`: NO-OP
 * limpo (nunca falha — ver o header de `regulatory-watch-gateway.ts`). `mode=live`: percorre TODAS
 * as fontes monitoradas com `source_url`; cada fonte é isolada em `try/catch` — uma fonte fora do ar
 * NUNCA derruba a varredura das demais nem o job inteiro (mesmo racional das varreduras de
 * reconciliação de `workers/job-runner.ts`).
 */
export async function runRegulatoryWatchCheckJob(job: { correlationId: string | null }): Promise<RegulatoryWatchCheckJobResult> {
  const correlationId = ensureCorrelationId(job.correlationId);
  const gateway = createRegulatoryWatchGateway();

  if (gateway.mode === 'off') {
    return {
      outcome: 'regulatory_watch_skipped_mode_off',
      patch: { sourcesChecked: 0, changesDetected: 0, alreadyTracked: 0, noChange: 0, errors: 0 }
    };
  }

  const sources = await listMonitoredSourcesWithUrl();
  let changesDetected = 0;
  let alreadyTracked = 0;
  let noChange = 0;
  let errors = 0;

  for (const source of sources) {
    try {
      const outcome = await checkOneSource(source, correlationId);
      if (outcome === 'changed') changesDetected++;
      else if (outcome === 'already_tracked') alreadyTracked++;
      else if (outcome === 'no_change') noChange++;
    } catch (error) {
      errors++;
      console.warn(
        `[regulatory-watch] falha ao verificar fonte ${source.id} (${source.reference}): `
          + `${error instanceof Error ? error.message : String(error)}`
      );
    }
  }

  return {
    outcome: 'regulatory_watch_check_completed',
    patch: { sourcesChecked: sources.length, changesDetected, alreadyTracked, noChange, errors }
  };
}

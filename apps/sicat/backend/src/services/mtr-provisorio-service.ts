/**
 * MTR provisório service — fase 04 (cadeia `mtr-provisorio-fluxo-base`).
 *
 * Orquestra os comandos da família HTTP `/v1/mtr-provisorio/*`,
 * preservando a fronteira `route → service → repository → job → worker
 * → gateway`. Persistência ainda é stub (ver
 * [src/repositories/mtr-provisorio-repo.ts](../repositories/mtr-provisorio-repo.ts));
 * a fase 05-persistence-queue (`postgres-queue-mtr`) substitui o stub
 * por SQL real e implementa a ramificação `kind='provisorio'` no
 * worker handler `manifest.submit` / `manifest.print`.
 *
 * R3 (sobrecarga `tipoManifesto`) foi formalmente fechado nesta fase
 * adotando a opção **R3-C**: `kind ∈ { 'definitivo', 'provisorio' }`
 * é o discriminador de domínio SICAT, e a conversão para
 * `tipoManifestoOverride` numérico (entrada do gateway) acontece apenas
 * na borda do service ao invocar o gateway. A constante
 * `PROVISORIO_TIPO_MANIFESTO_OVERRIDE` documenta o valor adotado e
 * permanece sobrescrevível por env (mitigação do risco residual R1
 * documentado em
 * [docs/handoffs/mtr-provisorio-fluxo-base/02-source-validation.md §2.5](../../docs/handoffs/mtr-provisorio-fluxo-base/02-source-validation.md)).
 *
 * Nesta fase o service NÃO chama o gateway diretamente — os comandos
 * (`manifest.submit`, `manifest.print`) carregam `payload.kind =
 * 'provisorio'` e o worker handler (fase 05) faz a ramificação:
 *   if (payload.kind === 'provisorio') { gateway.submitMtrProvisorio({
 *     ..., tipoManifestoOverride: PROVISORIO_TIPO_MANIFESTO_OVERRIDE }) }
 */

import { AppError } from '../lib/problem.js';
import { createPrefixedId } from '../lib/ids.js';
import { buildCommandAccepted } from '../lib/command-response.js';
import { calculateJobPriority, getRetryConfig, extractJobTags } from '../lib/retry.js';
import { insertJobDeduplicated } from '../repositories/job-repo.js';
import { getIdempotentResponse, rememberIdempotentResponse } from './idempotency-service.js';
import {
  type MtrProvisorioListFilters,
  deleteMtrProvisorioDraft,
  findMtrProvisorioById,
  insertMtrProvisorio,
  listMtrProvisorio
} from '../repositories/mtr-provisorio-repo.js';
import {
  validateCancellable,
  validateMtrProvisorioCreatePayload,
  validatePrintable
} from '../lib/validators/mtr-provisorio-validator.js';

type HeaderMap = Record<string, string | undefined>;
type LooseRecord = Record<string, unknown>;

/**
 * Valor numérico de `tipoManifesto` que o gateway envia no PUT
 * `/api/mtr/manifesto` para variantes provisórias. R3-C — fica isolado
 * aqui (única borda do service que precisa converter `kind` em
 * `tipoManifestoOverride`). O gateway NÃO hardcoda este valor; o caller
 * (este service ou o worker handler de fase 05) é quem decide.
 *
 * O valor abaixo é a melhor suposição documentada (arquitetura §4.1
 * — "POST /api/mtr/manifesto (tipoManifesto=2)"); pode ser sobrescrito
 * por `MTR_PROVISORIO_TIPO_MANIFESTO_OVERRIDE` (env) sem mexer em código,
 * mitigando o risco residual R1 (valor exato a confirmar na captura HAR
 * humana opcional referida em
 * [02-source-validation.md §3.2](../../docs/handoffs/mtr-provisorio-fluxo-base/02-source-validation.md)).
 */
export const PROVISORIO_TIPO_MANIFESTO_OVERRIDE: number = (() => {
  const raw = process.env.MTR_PROVISORIO_TIPO_MANIFESTO_OVERRIDE;
  const parsed = raw ? Number(raw) : NaN;
  return Number.isFinite(parsed) ? parsed : 2;
})();

function ensureCorrelationId(correlationId: string | null): string {
  return correlationId || createPrefixedId('corr');
}

function toTrimmedString(value: unknown): string | null {
  if (typeof value !== 'string') return null;
  const trimmed = value.trim();
  return trimmed.length === 0 ? null : trimmed;
}

function requireNonEmptyString(value: unknown, detail: string): string {
  const normalized = toTrimmedString(value);
  if (!normalized) throw new AppError(400, 'Bad Request', detail);
  return normalized;
}

function ensureFilters(query: LooseRecord): MtrProvisorioListFilters {
  const pageRaw = Number(query.page);
  const pageSizeRaw = Number(query.pageSize);
  return {
    integrationAccountId: toTrimmedString(query.integrationAccountId),
    status: toTrimmedString(query.status),
    dateFrom: toTrimmedString(query.dateFrom),
    dateTo: toTrimmedString(query.dateTo),
    page: Number.isFinite(pageRaw) ? Math.max(Math.floor(pageRaw), 1) : 1,
    pageSize: Number.isFinite(pageSizeRaw) ? Math.min(Math.max(Math.floor(pageSizeRaw), 1), 200) : 50
  };
}

export async function listMtrProvisorioService(query: LooseRecord) {
  const filters = ensureFilters(query);
  const { items, totalItems } = await listMtrProvisorio(filters);
  return {
    items,
    page: filters.page,
    pageSize: filters.pageSize,
    totalItems,
    totalPages: Math.max(1, Math.ceil(totalItems / filters.pageSize))
  };
}

export async function getMtrProvisorioService(id: string) {
  const normalized = requireNonEmptyString(id, 'id é obrigatório.');
  const record = await findMtrProvisorioById(normalized);
  if (!record) {
    throw new AppError(404, 'Not Found', `Manifesto provisório ${normalized} não encontrado.`);
  }
  return record;
}

export async function createMtrProvisorioService(
  body: LooseRecord,
  headers: HeaderMap,
  correlationId: string | null
) {
  const integrationAccountId = requireNonEmptyString(
    body.integrationAccountId,
    'integrationAccountId é obrigatório.'
  );
  const sessionContextId = requireNonEmptyString(
    body.sessionContextId,
    'sessionContextId é obrigatório para criar MTR provisório.'
  );

  // Fase 06-domain-rules: valida o payload antes de qualquer efeito
  // colateral (idempotência, persistência, fila). Erros viram
  // problem+json com code MTR_PROVISORIO_PAYLOAD_INVALID.
  validateMtrProvisorioCreatePayload(body);

  const idempotencyKey = headers['idempotency-key'];
  const idempotencyScope = `mtr-provisorio.create:${integrationAccountId}`;
  const reused = await getIdempotentResponse(idempotencyScope, idempotencyKey);
  if (reused) return reused;

  const id = createPrefixedId('man');
  const effectiveCorrelationId = ensureCorrelationId(correlationId);

  // Persiste rascunho local (kind='provisorio'). O stub atual lança 501
  // até a fase 05 substituir por SQL real apoiado em `manifests`.
  await insertMtrProvisorio({
    id,
    integrationAccountId,
    sessionContextId,
    status: 'queued_submit',
    externalStatus: 'pending_submission',
    payload: body,
    requestedBy: toTrimmedString(body.requestedBy),
    correlationId: effectiveCorrelationId
  });

  // Enfileira o comando de submissão. R3-C: o worker handler (fase 05)
  // ramifica por `payload.kind` e usa `submitMtrProvisorio` no gateway,
  // passando `PROVISORIO_TIPO_MANIFESTO_OVERRIDE` (importado deste módulo).
  const operation = 'manifest.submit';
  const retryConfig = getRetryConfig(operation);
  const priority = calculateJobPriority(operation);
  const jobId = createPrefixedId('job');
  const commandId = createPrefixedId('cmd');

  const enqueued = await insertJobDeduplicated({
    jobId,
    commandId,
    entityType: 'mtr_provisorio',
    entityId: id,
    operation,
    payload: {
      manifestId: id,
      sessionContextId,
      kind: 'provisorio',
      tipoManifestoOverride: PROVISORIO_TIPO_MANIFESTO_OVERRIDE,
      requestedBy: toTrimmedString(body.requestedBy),
      integrationAccountId
    },
    status: 'queued',
    maxAttempts: retryConfig.maxAttempts,
    correlationId: effectiveCorrelationId,
    idempotencyKey,
    priority,
    retryStrategy: retryConfig.strategy,
    baseDelayMs: retryConfig.baseDelayMs,
    maxDelayMs: retryConfig.maxDelayMs,
    tags: extractJobTags({ operation, entityType: 'mtr_provisorio', status: 'queued' })
  });

  if (!enqueued?.job) {
    throw new AppError(
      500,
      'Internal Server Error',
      `Falha ao enfileirar submit do manifesto provisório ${id}.`,
      { code: 'MTR_PROVISORIO_SUBMIT_ENQUEUE_FAILED' }
    );
  }

  const response = buildCommandAccepted({
    commandId: enqueued.job.commandId || commandId,
    jobId: enqueued.job.jobId,
    correlationId: effectiveCorrelationId,
    entityType: 'mtr_provisorio',
    entityId: id,
    operation
  });

  await rememberIdempotentResponse({
    operation: idempotencyScope,
    idempotencyKey,
    entityType: 'mtr_provisorio',
    entityId: id,
    response: response as unknown as Record<string, unknown>
  });

  return response;
}

export async function enqueueMtrProvisorioPrintService(
  id: string,
  body: LooseRecord,
  headers: HeaderMap,
  correlationId: string | null
) {
  const normalized = requireNonEmptyString(id, 'id é obrigatório.');
  const idempotencyKey = headers['idempotency-key'];
  const idempotencyScope = `mtr-provisorio.print:${normalized}`;
  const reused = await getIdempotentResponse(idempotencyScope, idempotencyKey);
  if (reused) return reused;

  const record = await findMtrProvisorioById(normalized);
  if (!record) {
    throw new AppError(404, 'Not Found', `Manifesto provisório ${normalized} não encontrado.`);
  }

  // Fase 06-domain-rules: garante status='submitted' + externalHashCode
  // antes de enfileirar manifest.print (problem+json com code
  // MTR_PROVISORIO_NOT_PRINTABLE em violação).
  validatePrintable(record);

  const operation = 'manifest.print';
  const retryConfig = getRetryConfig(operation);
  const priority = calculateJobPriority(operation);
  const jobId = createPrefixedId('job');
  const commandId = createPrefixedId('cmd');
  const effectiveCorrelationId = ensureCorrelationId(correlationId);

  const enqueued = await insertJobDeduplicated({
    jobId,
    commandId,
    entityType: 'mtr_provisorio',
    entityId: normalized,
    operation,
    payload: {
      manifestId: normalized,
      kind: 'provisorio',
      sessionContextId: toTrimmedString(body.sessionContextId) ?? record.sessionContextId,
      requestedBy: toTrimmedString(body.requestedBy),
      integrationAccountId: record.integrationAccountId
    },
    status: 'queued',
    maxAttempts: retryConfig.maxAttempts,
    correlationId: effectiveCorrelationId,
    idempotencyKey,
    priority,
    retryStrategy: retryConfig.strategy,
    baseDelayMs: retryConfig.baseDelayMs,
    maxDelayMs: retryConfig.maxDelayMs,
    tags: extractJobTags({ operation, entityType: 'mtr_provisorio', status: 'queued' })
  });

  if (!enqueued?.job) {
    throw new AppError(
      500,
      'Internal Server Error',
      `Falha ao enfileirar impressão do manifesto provisório ${normalized}.`,
      { code: 'MTR_PROVISORIO_PRINT_ENQUEUE_FAILED' }
    );
  }

  const response = buildCommandAccepted({
    commandId: enqueued.job.commandId || commandId,
    jobId: enqueued.job.jobId,
    correlationId: effectiveCorrelationId,
    entityType: 'mtr_provisorio',
    entityId: normalized,
    operation
  });

  await rememberIdempotentResponse({
    operation: idempotencyScope,
    idempotencyKey,
    entityType: 'mtr_provisorio',
    entityId: normalized,
    response: response as unknown as Record<string, unknown>
  });

  return response;
}

export async function cancelMtrProvisorioService(id: string, _correlationId: string | null) {
  const normalized = requireNonEmptyString(id, 'id é obrigatório.');
  const record = await findMtrProvisorioById(normalized);
  if (!record) {
    throw new AppError(404, 'Not Found', `Manifesto provisório ${normalized} não encontrado.`);
  }
  // Fase 06-domain-rules: regra canônica de cancelamento centralizada
  // no validador (problem+json com code MTR_PROVISORIO_NOT_CANCELLABLE).
  validateCancellable(record);
  return deleteMtrProvisorioDraft(normalized, record.version);
}

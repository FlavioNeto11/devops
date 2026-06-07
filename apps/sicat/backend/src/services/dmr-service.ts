/**
 * DMR service — fase 04 (cadeia `dmr-fluxo-base`).
 *
 * Orquestra os comandos DMR mantendo a fronteira `route → service →
 * repository → job → worker → gateway`. Toda persistência ainda é stub
 * (ver `src/repositories/dmr-repo.ts`) e a fase 05-persistence-queue
 * (`postgres-queue-mtr`) substitui as chamadas por SQL real, sem mudar
 * este contrato.
 *
 * Erros são propagados como `AppError` (serializados em
 * `application/problem+json` por `src/middlewares/error-handler.ts`).
 *
 * Status canônico DMR ↔ taxonomia operacional (13 estados,
 * `src/lib/operational-status.ts`):
 *   draft               → ready
 *   consolidating       → running
 *   pending_review      → ready (aguarda revisão humana)
 *   enqueued            → ready
 *   submitting          → running
 *   awaiting_remote     → awaiting_remote_confirmation
 *   submitted           → completed_with_document
 *   failed_validation   → failed_validation
 *   failed_remote       → failed_remote_contract
 *   cancelled           → completed_with_no_items
 */

import { AppError } from '../lib/problem.js';
import { createPrefixedId } from '../lib/ids.js';
import { buildCommandAccepted } from '../lib/command-response.js';
import { calculateJobPriority, getRetryConfig, extractJobTags } from '../lib/retry.js';
import { insertJobDeduplicated } from '../repositories/job-repo.js';
import { findSessionContextById } from '../repositories/session-context-repo.js';
import { findIntegrationAccountById } from '../repositories/integration-account-repo.js';
import { getIdempotentResponse, rememberIdempotentResponse } from './idempotency-service.js';
import {
  type DmrItemRecord,
  type DmrListFilters,
  type DmrRecord,
  type DmrStatus,
  deleteDmrDraft,
  deleteDmrItem,
  findDmrById,
  insertDmr,
  insertDmrItem,
  listDmr,
  listDmrItems,
  listPendingDmr,
  updateDmrStatus
} from '../repositories/dmr-repo.js';
import {
  validateConsolidate,
  validateDelete,
  validateItemMutation,
  validateNewDmr,
  validateSubmit
} from '../lib/validators/dmr-validator.js';
import { mapDmrStatusToOperational as canonicalMapDmrStatusToOperational } from '../lib/operational-status.js';

type HeaderMap = Record<string, string | undefined>;
type LooseRecord = Record<string, unknown>;

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

const DATE_REGEX = /^\d{4}-\d{2}-\d{2}$/;
function requireIsoDate(value: unknown, field: string): string {
  const normalized = toTrimmedString(value);
  if (!normalized || !DATE_REGEX.test(normalized)) {
    throw new AppError(400, 'Bad Request', `${field} inválido: esperado formato YYYY-MM-DD.`);
  }
  return normalized;
}

function requireOrderedPeriod(start: string, end: string): void {
  if (start > end) {
    throw new AppError(400, 'Bad Request', 'periodEnd deve ser maior ou igual a periodStart.');
  }
}

function toRecord(value: unknown): LooseRecord {
  return value && typeof value === 'object' ? (value as LooseRecord) : {};
}

// Conjunto de status que aceitam mutação manual de itens DMR.
// Espelha `ITEM_MUTABLE_FROM` em `src/lib/validators/dmr-validator.ts`.
const CANCELLABLE_STATUSES: ReadonlySet<DmrStatus> = new Set([
  'draft',
  'pending_review',
  'failed_validation'
]);

function ensureFilters(query: LooseRecord): DmrListFilters {
  const filters: DmrListFilters = {};
  const status = toTrimmedString(query.status);
  if (status) filters.status = status;
  const role = toTrimmedString(query.role);
  if (role) filters.role = role;
  const periodStart = toTrimmedString(query.periodStart);
  if (periodStart) filters.periodStart = requireIsoDate(periodStart, 'periodStart');
  const periodEnd = toTrimmedString(query.periodEnd);
  if (periodEnd) filters.periodEnd = requireIsoDate(periodEnd, 'periodEnd');
  if (filters.periodStart && filters.periodEnd) {
    requireOrderedPeriod(filters.periodStart, filters.periodEnd);
  }
  const integrationAccountId = toTrimmedString(query.integrationAccountId);
  if (integrationAccountId) filters.integrationAccountId = integrationAccountId;
  const limitRaw = Number(query.limit);
  if (Number.isFinite(limitRaw)) {
    filters.limit = Math.min(Math.max(Math.floor(limitRaw), 1), 200);
  }
  const offsetRaw = Number(query.offset);
  if (Number.isFinite(offsetRaw)) {
    filters.offset = Math.max(Math.floor(offsetRaw), 0);
  }
  return filters;
}

export async function listDmrService(query: LooseRecord) {
  const filters = ensureFilters(query);
  const { items, total } = await listDmr(filters);
  return {
    items,
    total,
    limit: filters.limit ?? 50,
    offset: filters.offset ?? 0
  };
}

export async function listPendingDmrService(query: LooseRecord) {
  const integrationAccountId = toTrimmedString(query.integrationAccountId);
  const items = await listPendingDmr(integrationAccountId);
  return { items, total: items.length, limit: items.length, offset: 0 };
}

export async function getDmrDetailService(dmrId: string) {
  const id = requireNonEmptyString(dmrId, 'dmrId é obrigatório.');
  const dmr = await findDmrById(id);
  if (!dmr) throw new AppError(404, 'Not Found', `DMR ${id} não encontrada.`);
  const items = await listDmrItems(id);
  return { ...dmr, items };
}

export async function getDmrStatusService(dmrId: string) {
  const detail = await getDmrDetailService(dmrId);
  return {
    id: detail.id,
    status: detail.status,
    operationalStatus: mapDmrStatusToOperational(detail.status, detail.lastErrorCode),
    protocolNumber: detail.protocolNumber,
    submittedAt: detail.submittedAt,
    lastErrorCode: detail.lastErrorCode,
    lastErrorDetail: detail.lastErrorDetail,
    attempts: detail.attempts,
    updatedAt: detail.updatedAt
  };
}

function mapDmrStatusToOperational(status: DmrStatus, lastErrorCode: string | null): string {
  // Mapeamento canônico vive em src/lib/operational-status.ts (fase 06).
  return canonicalMapDmrStatusToOperational(status, lastErrorCode);
}

export async function listDmrItemsService(dmrId: string) {
  const id = requireNonEmptyString(dmrId, 'dmrId é obrigatório.');
  const dmr = await findDmrById(id);
  if (!dmr) throw new AppError(404, 'Not Found', `DMR ${id} não encontrada.`);
  const items = await listDmrItems(id);
  return { items };
}

export async function createDmrService(body: LooseRecord, _headers: HeaderMap, correlationId: string | null) {
  const integrationAccountId = requireNonEmptyString(body.integrationAccountId, 'integrationAccountId é obrigatório.');
  const periodStart = requireIsoDate(body.periodStart, 'periodStart');
  const periodEnd = requireIsoDate(body.periodEnd, 'periodEnd');
  const periodLabel = requireNonEmptyString(body.periodLabel, 'periodLabel é obrigatório.');

  // Validações declaratórias (fase 06): período válido, role permitido,
  // ausência de overlap por (integration_account_id, role).
  const { role } = await validateNewDmr({
    integrationAccountId,
    role: typeof body.role === 'string' ? body.role : '',
    periodStart,
    periodEnd
  });

  const id = createPrefixedId('dmr');
  return insertDmr({
    id,
    integrationAccountId,
    cnpj: '',
    unitCode: '',
    role,
    periodStart,
    periodEnd,
    periodLabel,
    correlationId: ensureCorrelationId(correlationId)
  });
}

export async function consolidateDmrService(
  dmrId: string,
  body: LooseRecord,
  headers: HeaderMap,
  correlationId: string | null
) {
  const id = requireNonEmptyString(dmrId, 'dmrId é obrigatório.');
  const idempotencyKey = headers['idempotency-key'];
  const reused = await getIdempotentResponse(`dmr.consolidate:${id}`, idempotencyKey);
  if (reused) return reused;

  const dmr = await findDmrById(id);
  if (!dmr) throw new AppError(404, 'Not Found', `DMR ${id} não encontrada.`);
  const force = Boolean((toRecord(body)).force);
  const currentItems = await listDmrItems(id);
  // Validação declaratória (fase 06): status consolidável, transição
  // permitida, awaiting_remote só com force=true, coleção mínima.
  validateConsolidate(dmr, currentItems, { force });

  // Consolidação local determinística — substituída pela fase 05/06.
  const updated = await updateDmrStatus(
    id,
    { status: 'pending_review' as DmrStatus, summaryTotals: dmr.summaryTotals },
    dmr.version
  );
  const items = await listDmrItems(id);
  const response = { ...updated, items };
  await rememberIdempotentResponse({
    operation: `dmr.consolidate:${id}`,
    idempotencyKey,
    entityType: 'dmr',
    entityId: id,
    response: response as unknown as Record<string, unknown>
  });
  return response;
}

export async function enqueueDmrSubmit(
  dmrId: string,
  body: LooseRecord,
  headers: HeaderMap,
  correlationId: string | null
) {
  const id = requireNonEmptyString(dmrId, 'dmrId é obrigatório.');
  const idempotencyKey = headers['idempotency-key'];
  const reused = await getIdempotentResponse(`dmr.submit:${id}`, idempotencyKey);
  if (reused) return reused;

  const dmr = await findDmrById(id);
  if (!dmr) throw new AppError(404, 'Not Found', `DMR ${id} não encontrada.`);

  const sessionContextId = requireNonEmptyString(body.sessionContextId, 'sessionContextId é obrigatório para submit de DMR.');
  const sessionContext = await findSessionContextById(sessionContextId);
  const account = await findIntegrationAccountById(dmr.integrationAccountId);
  const items = await listDmrItems(id);

  // Validação declaratória completa (fase 06): status submetível,
  // ≥1 item, período fechado, conta existe, sessão existe, papel
  // coerente com partnerRole agregado.
  validateSubmit(
    dmr,
    items,
    {
      account: account ? { id: account.id } : null,
      sessionContextExists: Boolean(sessionContext)
    }
  );

  const operation = 'dmr.submit';
  const retryConfig = getRetryConfig(operation);
  const priority = calculateJobPriority(operation);
  const jobId = createPrefixedId('job');
  const commandId = createPrefixedId('cmd');
  const effectiveCorrelationId = ensureCorrelationId(correlationId);

  // Persistência otimista: marca DMR como `enqueued` antes do worker assumir.
  // Em fase 05 isso vira `withTransaction` + lock; aqui os métodos repo já
  // lançam 501.
  await updateDmrStatus(
    id,
    {
      status: 'enqueued' as DmrStatus,
      sessionContextId,
      commandId
    },
    dmr.version
  );

  const enqueued = await insertJobDeduplicated({
    jobId,
    commandId,
    entityType: 'dmr',
    entityId: id,
    operation,
    payload: {
      dmrId: id,
      sessionContextId,
      requestedBy: toTrimmedString(body.requestedBy),
      validateOnly: Boolean(body.validateOnly),
      integrationAccountId: dmr.integrationAccountId
    },
    status: 'queued',
    maxAttempts: retryConfig.maxAttempts,
    correlationId: effectiveCorrelationId,
    idempotencyKey,
    priority,
    retryStrategy: retryConfig.strategy,
    baseDelayMs: retryConfig.baseDelayMs,
    maxDelayMs: retryConfig.maxDelayMs,
    tags: extractJobTags({ operation, entityType: 'dmr', status: 'queued' })
  });

  if (!enqueued?.job) {
    throw new AppError(500, 'Internal Server Error', `Falha ao enfileirar submit da DMR ${id}.`, {
      code: 'DMR_SUBMIT_ENQUEUE_FAILED'
    });
  }

  const response = buildCommandAccepted({
    commandId: enqueued.job.commandId || commandId,
    jobId: enqueued.job.jobId,
    correlationId: effectiveCorrelationId,
    entityType: 'dmr',
    entityId: id,
    operation
  });

  await rememberIdempotentResponse({
    operation: `dmr.submit:${id}`,
    idempotencyKey,
    entityType: 'dmr',
    entityId: id,
    response: response as unknown as Record<string, unknown>
  });

  return response;
}

export async function cancelDmrService(dmrId: string, _correlationId: string | null) {
  const id = requireNonEmptyString(dmrId, 'dmrId é obrigatório.');
  const dmr = await findDmrById(id);
  if (!dmr) throw new AppError(404, 'Not Found', `DMR ${id} não encontrada.`);
  // Validação declaratória (fase 06): só cancela em draft, pending_review
  // ou failed_validation; transição draft/... → cancelled válida.
  validateDelete(dmr);
  const updated = await deleteDmrDraft(id, dmr.version);
  return {
    id: updated.id,
    status: updated.status,
    cancelledAt: updated.updatedAt
  };
}

export async function addDmrItemService(
  dmrId: string,
  body: LooseRecord,
  _headers: HeaderMap,
  _correlationId: string | null
): Promise<DmrItemRecord> {
  const id = requireNonEmptyString(dmrId, 'dmrId é obrigatório.');
  const dmr = await findDmrById(id);
  if (!dmr) throw new AppError(404, 'Not Found', `DMR ${id} não encontrada.`);

  const mtrNumber = toTrimmedString(body.mtrNumber);
  const residueClass = toTrimmedString(body.residueClass);
  const quantityValueRaw = Number(body.quantityValue);
  const quantityValue = Number.isFinite(quantityValueRaw) ? quantityValueRaw : null;
  const quantityUnit = toTrimmedString(body.quantityUnit);
  const partnerRole = toTrimmedString(body.partnerRole);
  const partnerCnpj = toTrimmedString(body.partnerCnpj);
  const manifestId = toTrimmedString(body.manifestId);

  // Validação declaratória (fase 06): status mutável, payload coerente,
  // manifestId pertence à mesma conta CETESB.
  await validateItemMutation(dmr, {
    manifestId,
    mtrNumber,
    residueClass,
    quantityValue,
    quantityUnit,
    partnerRole,
    partnerCnpj
  });

  return insertDmrItem(id, {
    declarationId: id,
    manifestId,
    mtrNumber: mtrNumber!,
    cdfNumber: toTrimmedString(body.cdfNumber),
    residueClass: residueClass!,
    residueCode: toTrimmedString(body.residueCode),
    quantityValue: quantityValue!,
    quantityUnit: quantityUnit as DmrItemRecord['quantityUnit'],
    partnerRole: partnerRole as DmrItemRecord['partnerRole'],
    partnerCnpj: partnerCnpj!,
    metadata: (body.metadata && typeof body.metadata === 'object') ? (body.metadata as LooseRecord) : null
  });
}

export async function removeDmrItemService(dmrId: string, itemId: string) {
  const did = requireNonEmptyString(dmrId, 'dmrId é obrigatório.');
  const iid = requireNonEmptyString(itemId, 'itemId é obrigatório.');
  const dmr = await findDmrById(did);
  if (!dmr) throw new AppError(404, 'Not Found', `DMR ${did} não encontrada.`);
  // Mesmo gate de mutação dos add-item — DMRs não-mutáveis não aceitam
  // remoção (fase 06-domain-rules).
  if (!CANCELLABLE_STATUSES.has(dmr.status)) {
    throw new AppError(
      400,
      'Bad Request',
      `DMR em status ${dmr.status} não aceita remoção de itens.`,
      { code: 'DMR_ITEM_INVALID' }
    );
  }
  await deleteDmrItem(did, iid);
}

export type { DmrRecord };

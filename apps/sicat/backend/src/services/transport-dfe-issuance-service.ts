/**
 * Service da emissão de DF-e SANDBOX-READY (PR-G, DL-103) — pipeline assíncrono completo
 * (solicitar → build → sign → submit) com GATEWAY ABSTRAÍDO (`gateways/dfe-issuance-gateway.ts`,
 * que embrulha o `@flavioneto11/fiscal-kit` REAL em `mode: 'sandbox'`), atrás da flag de
 * CONFIGURAÇÃO `DFE_ISSUANCE_MODE` (`off` por default — NUNCA emissão sem decisão comercial/legal,
 * pendência P9 do guia do programa).
 *
 * Fronteira `route → service → repository → job → worker → gateway` (backend/AGENTS.md §2): a
 * metade HTTP-facing (`requestDfeIssuance`, `listDfeIssuancesForOperationService`,
 * `cancelDfeIssuance`) é chamada pelas rotas; a metade worker-facing (`runDfeIssuance*Job`) é
 * chamada por `workers/operation-handlers.ts` (handlers SEM parâmetro `gateway`, molde
 * `runCiotRegisterJob`) — mesmo arquivo, mesma fronteira de camadas.
 *
 * ── Padrão DL-102 aplicado à emissão fiscal ───────────────────────────────────────────────────────
 * O protocolo de autorização nasce na RESPOSTA do gateway. Por isso: (1) o marcador de correlação
 * (`lib/transport/dfe-issuance-correlation.ts`) é gravado na CRIAÇÃO da linha `dfe_issuances`, ANTES
 * de qualquer chamada ao gateway; (2) o status vira `submitting` IMEDIATAMENTE ANTES de chamar
 * `gateway.submitDocument` (o ponto de dispatch real); (3) uma falha DEPOIS desse ponto nunca vira
 * `failed_validation` — vira `submit_unconfirmed`, resolvido só pelo reconciliador
 * (`transporte.dfe.issue.reconcile`, via `dfe-issuance-reconciler.ts` + `gateway.queryByMarker`).
 * Este service NÃO classifica erro por código: a classificação é 100% pelo STATUS da linha no
 * momento da falha (`applyTransporteDfeIssuanceTerminalFailureSideEffect`) — falha antes de
 * `submitting` é sempre local (`failed_validation`); falha em/depois de `submitting` é sempre DL-102
 * (`submit_unconfirmed`). Nenhuma lista de códigos para manter sincronizada.
 *
 * ── AUTORIZADA → reimportação automática ao acervo da Fase E (SEM lógica nova) ────────────────────
 * Ao autorizar, o XML final vai para `STORAGE_DIR` e é reimportado via
 * `transport-fiscal-service.importarDocumentoFiscal` (reuso interno — a emissão vira um documento
 * `fiscal_documents` comum, avaliado pelos evaluators TR-NFE/CTE/MDFE já existentes). Import
 * duplicado (retry após um attempt que já importou) é tratado como sucesso idempotente via
 * `DFE_ALREADY_IMPORTED` (mesma access_key, determinística pelo marcador).
 */

import { createHash } from 'node:crypto';
import fs from 'node:fs/promises';

import { AppError } from '../lib/problem.js';
import { createPrefixedId } from '../lib/ids.js';
import { config } from '../lib/config.js';
import { buildCommandAccepted } from '../lib/command-response.js';
import { calculateJobPriority, extractJobTags, getRetryConfig } from '../lib/retry.js';
import { insertJobDeduplicated } from '../repositories/job-repo.js';
import { insertAuditEntry } from '../repositories/audit-repo.js';
import { ensureDir, resolveStoragePath } from '../lib/files.js';
import { getIdempotentResponse, rememberIdempotentResponse } from './idempotency-service.js';
import { getOperationAggregateById, getOperationHeaderById } from '../repositories/transport-operation-repo.js';
import { buildDfeIssuanceCorrelationMarker } from '../lib/transport/dfe-issuance-correlation.js';
import {
  createDfeIssuanceGateway,
  type DfeIssuanceGateway
} from '../gateways/dfe-issuance-gateway.js';
import { reconcileDfeIssuance, type DfeIssuanceReconcilerDeps } from './dfe-issuance-reconciler.js';
import { importarDocumentoFiscal } from './transport-fiscal-service.js';
import {
  beginDfeIssuanceAttempt,
  beginDfeIssuanceSigning,
  beginDfeIssuanceSubmitting,
  completeDfeIssuanceAuthorized,
  completeDfeIssuanceBuilt,
  completeDfeIssuanceReconcileAuthorized,
  completeDfeIssuanceRejected,
  completeDfeIssuanceSigned,
  findDfeIssuanceById,
  findDfeIssuanceByIdInternal,
  insertDfeIssuance,
  insertDfeIssuanceEvent,
  listDfeIssuanceEventsForIssuance,
  listDfeIssuancesForOperation,
  markDfeIssuanceCancelled,
  markDfeIssuanceFailedValidation,
  markDfeIssuanceReconcileNotFoundRejected,
  markDfeIssuanceSubmitUnconfirmed,
  setDfeIssuanceFiscalDocumentId,
  type DfeIssuanceEventInsertInput
} from '../repositories/dfe-issuance-repo.js';
import type {
  DfeIssuance,
  DfeIssuanceDocumentType,
  DfeIssuanceEvent,
  DfeIssuanceStatus
} from '../lib/transport/dfe-issuance-types.js';
import { DFE_ISSUANCE_DOCUMENT_TYPES } from '../lib/transport/dfe-issuance-types.js';

type LooseRecord = Record<string, unknown>;
type HeaderMap = Record<string, string | undefined>;

const ISSUE_OPERATION = 'transporte.dfe.issue';
const CANCEL_OPERATION = 'transporte.dfe.issue.cancel';
const RECONCILE_OPERATION = 'transporte.dfe.issue.reconcile';

const ISSUANCE_XML_STORAGE_SUBDIR = 'transporte-dfe-issuance';

// =============================================================================
// Helpers locais — deliberadamente não compartilhados com transport-fiscal-service.ts (mesmo molde
// de transport-ciot-service.ts/transport-vpo-service.ts: cada service da vertical duplica o mínimo
// de validação de entrada).
// =============================================================================

function toTrimmedString(value: unknown): string | null {
  if (typeof value !== 'string') return null;
  const trimmed = value.trim();
  return trimmed.length === 0 ? null : trimmed;
}

function requireNonEmptyString(value: unknown, detail: string, code: string): string {
  const normalized = toTrimmedString(value);
  if (!normalized) throw new AppError(400, 'Bad Request', detail, { code });
  return normalized;
}

function requireIntegrationAccountId(source: LooseRecord): string {
  return requireNonEmptyString(
    source.integrationAccountId,
    'integrationAccountId é obrigatório.',
    'TRANSPORTE_DFE_ISSUANCE_FIELD_REQUIRED'
  );
}

function requireDocumentType(value: unknown): DfeIssuanceDocumentType {
  const normalized = toTrimmedString(value)?.toUpperCase();
  if (!normalized || !(DFE_ISSUANCE_DOCUMENT_TYPES as readonly string[]).includes(normalized)) {
    throw new AppError(
      400,
      'Bad Request',
      `documentType inválido: esperado um de ${DFE_ISSUANCE_DOCUMENT_TYPES.join(', ')} (recebido "${String(value)}").`,
      { code: 'TRANSPORTE_DFE_ISSUANCE_DOCUMENT_TYPE_INVALID' }
    );
  }
  return normalized as DfeIssuanceDocumentType;
}

function ensureCorrelationId(correlationId: string | null): string {
  return correlationId || createPrefixedId('corr');
}

function operationNotFound(operationId: string): AppError {
  return new AppError(404, 'Not Found', `Operação de transporte ${operationId} não encontrada.`, {
    code: 'TRANSPORT_OPERATION_NOT_FOUND'
  });
}

function issuanceNotFound(issuanceId: string): AppError {
  return new AppError(404, 'Not Found', `Emissão de DF-e ${issuanceId} não encontrada.`, {
    code: 'TRANSPORTE_DFE_ISSUANCE_NOT_FOUND'
  });
}

function getErrorMessage(error: unknown): string {
  if (error instanceof Error) return error.message;
  if (typeof error === 'string') return error;
  return '';
}

function getErrorCode(error: unknown): string | null {
  if (error && typeof error === 'object' && 'code' in error && typeof (error as { code?: unknown }).code === 'string') {
    return (error as { code: string }).code;
  }
  return null;
}

// =============================================================================
// Storage — XML autorizado NUNCA em coluna jsonb (storage_ref + hash, molde transport-fiscal-service.ts).
// Subpasta PRÓPRIA (`transporte-dfe-issuance`), separada da Fase E (`transporte-dfe`, XML importado
// pelo usuário) — origem diferente do byte, mesma disciplina de armazenamento.
// =============================================================================

function computeXmlHash(xmlContent: string): string {
  return createHash('sha256').update(xmlContent, 'utf8').digest('hex');
}

async function writeIssuanceXmlToStorage(xmlHash: string, xmlContent: string): Promise<string> {
  await ensureDir(resolveStoragePath(ISSUANCE_XML_STORAGE_SUBDIR));
  await fs.writeFile(resolveStoragePath(ISSUANCE_XML_STORAGE_SUBDIR, `${xmlHash}.xml`), xmlContent, 'utf8');
  return `${ISSUANCE_XML_STORAGE_SUBDIR}/${xmlHash}.xml`;
}

// =============================================================================
// DTOs (contrato)
// =============================================================================

export type DfeIssuanceEventResource = {
  id: string;
  eventType: string;
  detail: Record<string, unknown>;
  createdAt: string;
};

export type DfeIssuanceResource = {
  id: string;
  operationId: string;
  documentType: DfeIssuanceDocumentType;
  status: DfeIssuanceStatus;
  environment: string;
  accessKey: string | null;
  protocol: string | null;
  rejectionReason: string | null;
  fiscalDocumentId: string | null;
  lastErrorCode: string | null;
  version: number;
  createdAt: string;
  updatedAt: string;
  events?: DfeIssuanceEventResource[];
};

function toDfeIssuanceEventResource(event: DfeIssuanceEvent): DfeIssuanceEventResource {
  return { id: event.id, eventType: event.eventType, detail: event.detail, createdAt: event.createdAt };
}

function toDfeIssuanceResource(issuance: DfeIssuance, events?: DfeIssuanceEvent[]): DfeIssuanceResource {
  return {
    id: issuance.id,
    operationId: issuance.operationId,
    documentType: issuance.documentType,
    status: issuance.status,
    environment: issuance.environment,
    accessKey: issuance.accessKey,
    protocol: issuance.protocol,
    rejectionReason: issuance.rejectionReason,
    fiscalDocumentId: issuance.fiscalDocumentId,
    lastErrorCode: issuance.lastErrorCode,
    version: issuance.version,
    createdAt: issuance.createdAt,
    updatedAt: issuance.updatedAt,
    ...(events ? { events: events.map(toDfeIssuanceEventResource) } : {})
  };
}

// =============================================================================
// POST /v1/transporte/operacoes/{operationId}/emissoes — 202, ciclo assíncrono.
// =============================================================================

export type DfeIssuanceCommandContext = { correlationId: string; evaluatedBy?: string | null };

export async function requestDfeIssuance(
  operationId: string,
  body: LooseRecord,
  headers: HeaderMap,
  ctx: DfeIssuanceCommandContext
): Promise<LooseRecord> {
  const integrationAccountId = requireIntegrationAccountId(body);
  const documentType = requireDocumentType(body.documentType);

  // A FLAG é a config — nunca a rota expõe emissão em `production` sem `DFE_ISSUANCE_MODE=sandbox`
  // (ou um modo real futuro, quando P9 estiver resolvida). Checado ANTES de criar qualquer linha —
  // uma feature desligada não deve deixar rastro de tentativas no banco.
  if (config.dfeIssuanceMode === 'off') {
    throw new AppError(
      409,
      'Conflict',
      'Emissão de DF-e está desligada (DFE_ISSUANCE_MODE=off) — pendência [LEGAL REVIEW REQUIRED]+'
        + '[EXTERNAL DEPENDENCY] P9 do guia do programa (go/no-go comercial + certificado digital + '
        + 'credenciamento SEFAZ). Configure DFE_ISSUANCE_MODE=sandbox para testar o pipeline.',
      { code: 'DFE_ISSUANCE_FEATURE_DISABLED' }
    );
  }

  const idempotencyKey = headers['idempotency-key'];
  const idempotencyScope = `${ISSUE_OPERATION}:${operationId}:${documentType}`;
  const reused = await getIdempotentResponse(idempotencyScope, idempotencyKey);
  if (reused) return reused;

  const operation = await getOperationHeaderById(operationId, integrationAccountId);
  if (!operation) throw operationNotFound(operationId);
  if (operation.status === 'cancelled') {
    throw new AppError(
      409,
      'Conflict',
      `Operação ${operationId} está cancelada — não é possível solicitar emissão de DF-e.`,
      { code: 'TRANSPORTE_DFE_ISSUANCE_OPERATION_CANCELLED', context: { status: operation.status } }
    );
  }

  const issuanceId = createPrefixedId('dfeiss');
  const correlationMarker = buildDfeIssuanceCorrelationMarker(issuanceId);

  const issuance = await insertDfeIssuance({
    id: issuanceId,
    integrationAccountId,
    operationId,
    documentType,
    correlationMarker,
    correlationId: ctx.correlationId
  });

  await insertDfeIssuanceEvent({
    id: createPrefixedId('dfeissev'),
    issuanceId: issuance.id,
    eventType: 'created',
    detail: { documentType, environment: issuance.environment },
    correlationId: ctx.correlationId
  });

  const retryConfig = getRetryConfig(ISSUE_OPERATION);
  const priority = calculateJobPriority(ISSUE_OPERATION);
  const jobId = createPrefixedId('job');
  const commandId = createPrefixedId('cmd');

  const enqueued = await insertJobDeduplicated({
    jobId,
    commandId,
    entityType: 'dfe_issuance',
    entityId: operationId,
    operation: ISSUE_OPERATION,
    payload: {
      issuanceId: issuance.id,
      operationId,
      integrationAccountId,
      documentType,
      correlationMarker
    },
    status: 'queued',
    maxAttempts: retryConfig.maxAttempts,
    correlationId: ctx.correlationId,
    idempotencyKey,
    priority,
    retryStrategy: retryConfig.strategy,
    baseDelayMs: retryConfig.baseDelayMs,
    maxDelayMs: retryConfig.maxDelayMs,
    tags: extractJobTags({ operation: ISSUE_OPERATION, entityType: 'dfe_issuance', status: 'queued' })
  });

  if (!enqueued?.job) {
    throw new AppError(500, 'Internal Server Error', `Falha ao enfileirar emissão de DF-e da operação ${operationId}.`, {
      code: 'TRANSPORTE_DFE_ISSUANCE_ENQUEUE_FAILED'
    });
  }

  const response = buildCommandAccepted({
    commandId: enqueued.job.commandId || commandId,
    jobId: enqueued.job.jobId,
    correlationId: ctx.correlationId,
    entityType: 'dfe_issuance',
    entityId: operationId,
    operation: ISSUE_OPERATION,
    entityLink: `/v1/transporte/operacoes/${operationId}/emissoes`
  });

  await rememberIdempotentResponse({
    operation: idempotencyScope,
    idempotencyKey,
    entityType: 'dfe_issuance',
    entityId: operationId,
    response: response as unknown as Record<string, unknown>
  });

  return response;
}

// =============================================================================
// GET /v1/transporte/operacoes/{operationId}/emissoes — 200: lista + eventos por emissão.
// =============================================================================

export async function listDfeIssuancesForOperationService(
  operationId: string,
  query: LooseRecord
): Promise<{ items: DfeIssuanceResource[] }> {
  const integrationAccountId = requireIntegrationAccountId(query);
  const operation = await getOperationHeaderById(operationId, integrationAccountId);
  if (!operation) throw operationNotFound(operationId);

  const issuances = await listDfeIssuancesForOperation(operationId, integrationAccountId);
  const items: DfeIssuanceResource[] = [];
  for (const issuance of issuances) {
    const events = await listDfeIssuanceEventsForIssuance(issuance.id);
    items.push(toDfeIssuanceResource(issuance, events));
  }

  return { items };
}

// =============================================================================
// POST /v1/transporte/emissoes/{issuanceId}/cancelar — 202, sandbox only (sem chamada remota — o
// fiscal-kit não tem operação de cancelamento; assíncrono por CONSISTÊNCIA com o resto da fila).
// =============================================================================

export async function cancelDfeIssuance(
  issuanceId: string,
  body: LooseRecord,
  headers: HeaderMap,
  ctx: DfeIssuanceCommandContext
): Promise<LooseRecord> {
  const integrationAccountId = requireIntegrationAccountId(body);
  const idempotencyKey = headers['idempotency-key'];
  const idempotencyScope = `${CANCEL_OPERATION}:${issuanceId}`;
  const reused = await getIdempotentResponse(idempotencyScope, idempotencyKey);
  if (reused) return reused;

  const issuance = await findDfeIssuanceById(issuanceId, integrationAccountId);
  if (!issuance) throw issuanceNotFound(issuanceId);
  if (issuance.status === 'cancelled') {
    throw new AppError(409, 'Conflict', `Emissão de DF-e ${issuanceId} já está cancelada.`, {
      code: 'TRANSPORTE_DFE_ISSUANCE_ALREADY_CANCELLED'
    });
  }

  const retryConfig = getRetryConfig(CANCEL_OPERATION);
  const priority = calculateJobPriority(CANCEL_OPERATION);
  const jobId = createPrefixedId('job');
  const commandId = createPrefixedId('cmd');

  const enqueued = await insertJobDeduplicated({
    jobId,
    commandId,
    entityType: 'dfe_issuance',
    entityId: issuance.operationId,
    operation: CANCEL_OPERATION,
    payload: {
      issuanceId: issuance.id,
      operationId: issuance.operationId,
      integrationAccountId,
      documentType: issuance.documentType,
      correlationMarker: issuance.correlationMarker
    },
    status: 'queued',
    maxAttempts: retryConfig.maxAttempts,
    correlationId: ctx.correlationId,
    idempotencyKey,
    priority,
    retryStrategy: retryConfig.strategy,
    baseDelayMs: retryConfig.baseDelayMs,
    maxDelayMs: retryConfig.maxDelayMs,
    tags: extractJobTags({ operation: CANCEL_OPERATION, entityType: 'dfe_issuance', status: 'queued' })
  });

  if (!enqueued?.job) {
    throw new AppError(500, 'Internal Server Error', `Falha ao enfileirar cancelamento da emissão ${issuanceId}.`, {
      code: 'TRANSPORTE_DFE_ISSUANCE_ENQUEUE_FAILED'
    });
  }

  const response = buildCommandAccepted({
    commandId: enqueued.job.commandId || commandId,
    jobId: enqueued.job.jobId,
    correlationId: ctx.correlationId,
    entityType: 'dfe_issuance',
    entityId: issuance.operationId,
    operation: CANCEL_OPERATION,
    entityLink: `/v1/transporte/operacoes/${issuance.operationId}/emissoes`
  });

  await rememberIdempotentResponse({
    operation: idempotencyScope,
    idempotencyKey,
    entityType: 'dfe_issuance',
    entityId: issuance.operationId,
    response: response as unknown as Record<string, unknown>
  });

  return response;
}

// =============================================================================
// Reimportação automática ao acervo da Fase E — reuso interno de `importarDocumentoFiscal`.
// =============================================================================

async function importAuthorizedIssuanceToRegistry(issuance: DfeIssuance, correlationId: string): Promise<string | null> {
  if (issuance.fiscalDocumentId) return issuance.fiscalDocumentId; // já importada — idempotente

  if (!issuance.xmlStorageRef || !issuance.xmlHash) {
    throw new AppError(
      500,
      'Internal Server Error',
      `Emissão ${issuance.id} autorizada sem XML em storage — não é possível reimportar ao acervo.`,
      { code: 'TRANSPORTE_DFE_ISSUANCE_MISSING_STORAGE' }
    );
  }

  let xmlContent: string;
  try {
    xmlContent = await fs.readFile(resolveStoragePath(ISSUANCE_XML_STORAGE_SUBDIR, `${issuance.xmlHash}.xml`), 'utf8');
  } catch {
    throw new AppError(
      500,
      'Internal Server Error',
      `Falha ao ler o XML autorizado da emissão ${issuance.id} (storage_ref: ${issuance.xmlStorageRef}).`,
      { code: 'TRANSPORTE_DFE_ISSUANCE_STORAGE_UNAVAILABLE' }
    );
  }

  let fiscalDocumentId: string;
  try {
    const fiscalDocument = await importarDocumentoFiscal(
      { integrationAccountId: issuance.integrationAccountId, xmlContent, operationId: issuance.operationId },
      { correlationId }
    );
    fiscalDocumentId = fiscalDocument.id;
  } catch (error: unknown) {
    // Retry idempotente: um attempt ANTERIOR já importou (mesma access_key — determinística pelo
    // marcador de correlação) — trata como sucesso em vez de propagar 409 como falha nova.
    if (error instanceof AppError && error.code === 'DFE_ALREADY_IMPORTED') {
      const existingId = (error.errors as { existingId?: string } | undefined)?.existingId;
      if (!existingId) throw error;
      fiscalDocumentId = existingId;
    } else {
      throw error;
    }
  }

  const updated = await setDfeIssuanceFiscalDocumentId(issuance.id, fiscalDocumentId);
  if (updated) {
    await insertDfeIssuanceEvent({
      id: createPrefixedId('dfeissev'),
      issuanceId: issuance.id,
      eventType: 'imported_to_registry',
      detail: { fiscalDocumentId },
      correlationId
    });
  }

  return fiscalDocumentId;
}

// =============================================================================
// Worker — jobs `transporte.dfe.issue{,.cancel,.reconcile}`. SEM parâmetro `gateway` fixo no tipo
// (molde `runCiotRegisterJob`): dependência injetável só para teste, criada por import direto em
// produção (`createDfeIssuanceGateway`).
// =============================================================================

export type DfeIssuanceJobEntity = {
  jobId: string;
  entityId: string;
  correlationId: string | null;
  payload: LooseRecord;
};

export type DfeIssuanceJobResult = { outcome: string; patch: LooseRecord };

function requireJobField(payload: LooseRecord, field: string): string {
  return requireNonEmptyString(payload[field], `Job sem ${field}.`, 'TRANSPORTE_DFE_ISSUANCE_JOB_FIELD_REQUIRED');
}

async function logDfeIssuanceSubmitExchange(correlationId: string, operationId: string, request: LooseRecord, response: LooseRecord): Promise<void> {
  await insertAuditEntry({
    correlationId,
    entityType: 'dfe_issuance',
    entityId: operationId,
    direction: 'outbound',
    component: 'dfe-issuance-gateway',
    httpMethod: 'POST',
    endpoint: 'dfe-issuance-gateway:submitDocument',
    httpStatus: null,
    latencyMs: null,
    sanitizedBody: request
  });
  await insertAuditEntry({
    correlationId,
    entityType: 'dfe_issuance',
    entityId: operationId,
    direction: 'inbound',
    component: 'dfe-issuance-gateway',
    httpMethod: 'POST',
    endpoint: 'dfe-issuance-gateway:submitDocument',
    httpStatus: 200,
    latencyMs: null,
    sanitizedBody: response
  });
}

function noop(issuanceId: string, outcome: string): DfeIssuanceJobResult {
  return { outcome, patch: { issuanceId } };
}

/**
 * `transporte.dfe.issue` — pipeline `build → sign → submit`, um evento por etapa concluída. NENHUMA
 * classificação de erro por código: falha ANTES de `submitting` fica `failed_validation` (via
 * `applyTransporteDfeIssuanceTerminalFailureSideEffect`, guiado 100% pelo STATUS da linha no momento
 * do terminal); falha em/depois de `submitting` (o dispatch real ao gateway) vira `submit_unconfirmed`
 * (DL-102) — nunca tratada aqui, propaga e é interpretada pelo side-effect terminal.
 */
export async function runDfeIssuanceJob(job: DfeIssuanceJobEntity, deps: { gateway?: DfeIssuanceGateway } = {}): Promise<DfeIssuanceJobResult> {
  const issuanceId = requireJobField(job.payload, 'issuanceId');
  const operationId = requireJobField(job.payload, 'operationId');
  const integrationAccountId = requireJobField(job.payload, 'integrationAccountId');
  const documentType = requireJobField(job.payload, 'documentType') as DfeIssuanceDocumentType;
  const correlationMarker = requireJobField(job.payload, 'correlationMarker');
  const correlationId = ensureCorrelationId(job.correlationId);

  const issuance = await findDfeIssuanceByIdInternal(issuanceId);
  if (!issuance) throw issuanceNotFound(issuanceId);

  // Já autorizada E já importada — retry tardio depois de um commit anterior completo. NOOP total.
  if (issuance.status === 'authorized' && issuance.fiscalDocumentId) {
    return noop(issuanceId, 'transporte_dfe_issue_noop');
  }

  // Autorizada mas o import ao acervo ficou pendente (crash entre marcar `authorized` e importar) —
  // pula direto para o import, sem reconstruir XML nem tocar no gateway de novo.
  if (issuance.status === 'authorized' && !issuance.fiscalDocumentId) {
    const fiscalDocumentId = await importAuthorizedIssuanceToRegistry(issuance, correlationId);
    return { outcome: 'transporte_dfe_issue_imported', patch: { issuanceId, fiscalDocumentId } };
  }

  // `submit_unconfirmed` é propriedade EXCLUSIVA do reconciliador; qualquer outro terminal
  // (rejected/failed_validation/cancelled) já foi resolvido — NOOP em ambos os casos.
  if (issuance.status === 'submit_unconfirmed' || issuance.status === 'rejected' || issuance.status === 'failed_validation' || issuance.status === 'cancelled') {
    return noop(issuanceId, 'transporte_dfe_issue_noop');
  }

  const begun = await beginDfeIssuanceAttempt(issuanceId, job.jobId);
  if (!begun) return noop(issuanceId, 'transporte_dfe_issue_noop'); // corrida perdida (ex.: cancelar concluiu entre a leitura acima e aqui)

  const gateway = deps.gateway ?? createDfeIssuanceGateway({ mode: config.dfeIssuanceMode, documentType });

  const aggregate = await getOperationAggregateById(operationId, integrationAccountId);
  if (!aggregate) throw operationNotFound(operationId);

  const buildResult = await gateway.buildDocument({ operationAggregate: aggregate, correlationMarker });
  const builtRow = await completeDfeIssuanceBuilt(issuanceId, { accessKey: buildResult.accessKey });
  if (!builtRow) return noop(issuanceId, 'transporte_dfe_issue_noop');
  await insertDfeIssuanceEvent({
    id: createPrefixedId('dfeissev'),
    issuanceId,
    eventType: 'built',
    detail: { accessKey: buildResult.accessKey, documentType },
    correlationId
  });

  const signingBegun = await beginDfeIssuanceSigning(issuanceId);
  if (!signingBegun) return noop(issuanceId, 'transporte_dfe_issue_noop');
  const signResult = await gateway.signDocument({ correlationMarker });
  const signedRow = await completeDfeIssuanceSigned(issuanceId);
  if (!signedRow) return noop(issuanceId, 'transporte_dfe_issue_noop');
  await insertDfeIssuanceEvent({
    id: createPrefixedId('dfeissev'),
    issuanceId,
    eventType: 'signed',
    detail: { digest: signResult.digest },
    correlationId
  });

  // PONTO crítico do DL-102: status vira `submitting` ANTES de chamar o gateway remoto — se
  // `submitDocument` lançar a partir daqui, o terminal side-effect encontra a linha em `submitting`
  // e classifica como `submit_unconfirmed`, NUNCA `failed_validation`.
  const submittingRow = await beginDfeIssuanceSubmitting(issuanceId);
  if (!submittingRow) return noop(issuanceId, 'transporte_dfe_issue_noop');

  const submitResult = await gateway.submitDocument({ correlationMarker });
  await logDfeIssuanceSubmitExchange(
    correlationId,
    operationId,
    { correlationMarker },
    submitResult as unknown as LooseRecord
  );
  await insertDfeIssuanceEvent({
    id: createPrefixedId('dfeissev'),
    issuanceId,
    eventType: 'submitted',
    detail: { outcome: submitResult.outcome, protocol: submitResult.protocol },
    correlationId
  });

  if (submitResult.outcome === 'rejected') {
    const rejectedRow = await completeDfeIssuanceRejected(issuanceId, {
      rejectionReason: String((submitResult.raw as LooseRecord)?.rejectionReason ?? 'Rejeitado pelo emissor.'),
      providerResponse: submitResult.raw
    });
    if (!rejectedRow) return noop(issuanceId, 'transporte_dfe_issue_noop');
    await insertDfeIssuanceEvent({
      id: createPrefixedId('dfeissev'),
      issuanceId,
      eventType: 'rejected',
      detail: { reason: rejectedRow.rejectionReason },
      correlationId
    });
    return { outcome: 'transporte_dfe_issue_rejected', patch: { issuanceId, status: 'rejected' } };
  }

  if (!submitResult.authorizedXml) {
    throw new AppError(502, 'Bad Gateway', `Gateway de emissão devolveu outcome=authorized sem XML autorizado (emissão ${issuanceId}).`, {
      code: 'TRANSPORTE_DFE_ISSUANCE_MISSING_AUTHORIZED_XML'
    });
  }

  const xmlHash = computeXmlHash(submitResult.authorizedXml);
  const xmlStorageRef = await writeIssuanceXmlToStorage(xmlHash, submitResult.authorizedXml);

  const authorizedRow = await completeDfeIssuanceAuthorized(issuanceId, {
    protocol: submitResult.protocol,
    xmlStorageRef,
    xmlHash,
    providerResponse: submitResult.raw
  });
  if (!authorizedRow) return noop(issuanceId, 'transporte_dfe_issue_noop');
  await insertDfeIssuanceEvent({
    id: createPrefixedId('dfeissev'),
    issuanceId,
    eventType: 'authorized',
    detail: { protocol: submitResult.protocol, accessKey: authorizedRow.accessKey },
    correlationId
  });

  const fiscalDocumentId = await importAuthorizedIssuanceToRegistry(authorizedRow, correlationId);

  return {
    outcome: 'transporte_dfe_issue_authorized',
    patch: { issuanceId, status: 'authorized', protocol: submitResult.protocol, fiscalDocumentId }
  };
}

/** `transporte.dfe.issue.cancel` — 100% local (sandbox only; o fiscal-kit não tem operação de cancelamento). */
export async function runDfeIssuanceCancelJob(job: DfeIssuanceJobEntity): Promise<DfeIssuanceJobResult> {
  const issuanceId = requireJobField(job.payload, 'issuanceId');
  const correlationId = ensureCorrelationId(job.correlationId);

  const issuance = await findDfeIssuanceByIdInternal(issuanceId);
  if (!issuance) throw issuanceNotFound(issuanceId);
  if (issuance.status === 'cancelled') return noop(issuanceId, 'transporte_dfe_issue_cancel_noop');

  const cancelled = await markDfeIssuanceCancelled(issuanceId);
  if (!cancelled) return noop(issuanceId, 'transporte_dfe_issue_cancel_noop');

  await insertDfeIssuanceEvent({
    id: createPrefixedId('dfeissev'),
    issuanceId,
    eventType: 'cancelled',
    detail: { previousStatus: issuance.status },
    correlationId
  });

  return { outcome: 'transporte_dfe_issue_cancel_succeeded', patch: { issuanceId, status: 'cancelled' } };
}

/**
 * `transporte.dfe.issue.reconcile` — pergunta ao gateway pelo marcador de uma linha
 * `submit_unconfirmed` (DL-102). `found`: sincroniza (autoriza + reimporta ao acervo, mesmo caminho
 * do sucesso direto). `not-found-after-polling` com `protocol` local nulo: rejeita com
 * `DFE_ISSUANCE_REQUEST_NOT_FOUND_REMOTE`. `error`: propaga (retry da fila).
 */
export async function runDfeIssuanceReconcileJob(
  job: DfeIssuanceJobEntity,
  deps: Partial<DfeIssuanceReconcilerDeps> & { gateway?: DfeIssuanceGateway } = {}
): Promise<DfeIssuanceJobResult> {
  const issuanceId = requireJobField(job.payload, 'issuanceId');
  const documentType = requireJobField(job.payload, 'documentType') as DfeIssuanceDocumentType;
  const correlationMarker = requireJobField(job.payload, 'correlationMarker');
  const correlationId = ensureCorrelationId(job.correlationId);

  const issuance = await findDfeIssuanceByIdInternal(issuanceId);
  if (!issuance || issuance.status !== 'submit_unconfirmed') {
    // Já resolvido por um caminho concorrente (sweep + reconcile explícito, por exemplo) — NOOP.
    return noop(issuanceId, 'transporte_dfe_issue_reconcile_noop');
  }

  const gateway = deps.gateway ?? createDfeIssuanceGateway({ mode: config.dfeIssuanceMode, documentType });
  const result = await reconcileDfeIssuance(
    { queryByMarker: deps.queryByMarker ?? gateway.queryByMarker, sleep: deps.sleep, delaysMs: deps.delaysMs },
    { issuanceId, correlationMarker }
  );

  if (result.outcome === 'error') {
    throw result.error; // INCONCLUSIVO nunca é "não existe" — a fila reencaminha.
  }

  if (result.outcome === 'not-found-after-polling') {
    if (issuance.protocol != null) {
      // Defensivo: já tínhamos um protocolo local (autorização já confirmada antes) — não há como
      // "não encontrar" algo que já sabemos que aconteceu. Mantém unconfirmed para a próxima varredura.
      throw new AppError(502, 'Bad Gateway', `Reconciliação inconsistente da emissão ${issuanceId}: marcador não encontrado apesar de protocolo local já confirmado.`, {
        code: 'TRANSPORTE_DFE_ISSUANCE_RECONCILE_INCONSISTENT'
      });
    }

    const rejected = await markDfeIssuanceReconcileNotFoundRejected(issuanceId, { reasonCode: 'DFE_ISSUANCE_REQUEST_NOT_FOUND_REMOTE' });
    if (!rejected) return noop(issuanceId, 'transporte_dfe_issue_reconcile_noop');

    await insertDfeIssuanceEvent({
      id: createPrefixedId('dfeissev'),
      issuanceId,
      eventType: 'reconciled',
      detail: { result: 'not_found', reasonCode: 'DFE_ISSUANCE_REQUEST_NOT_FOUND_REMOTE', attempts: result.attempts },
      correlationId
    });

    return { outcome: 'transporte_dfe_issue_reconcile_not_found', patch: { issuanceId, status: 'rejected' } };
  }

  const { match } = result;
  if (!match.authorizedXml) {
    throw new AppError(502, 'Bad Gateway', `Reconciliação encontrou a emissão ${issuanceId} mas o gateway não devolveu XML autorizado.`, {
      code: 'TRANSPORTE_DFE_ISSUANCE_RECONCILE_MISSING_XML'
    });
  }

  const xmlHash = computeXmlHash(match.authorizedXml);
  const xmlStorageRef = await writeIssuanceXmlToStorage(xmlHash, match.authorizedXml);
  const completed = await completeDfeIssuanceReconcileAuthorized(issuanceId, {
    protocol: match.protocol,
    xmlStorageRef,
    xmlHash,
    providerResponse: match.raw
  });
  if (!completed) return noop(issuanceId, 'transporte_dfe_issue_reconcile_noop');

  await insertDfeIssuanceEvent({
    id: createPrefixedId('dfeissev'),
    issuanceId,
    eventType: 'reconciled',
    detail: { result: 'found', protocol: match.protocol, attempts: result.attempts },
    correlationId
  });

  const fiscalDocumentId = await importAuthorizedIssuanceToRegistry(completed, correlationId);

  return { outcome: 'transporte_dfe_issue_reconcile_found', patch: { issuanceId, status: 'authorized', fiscalDocumentId } };
}

// =============================================================================
// Terminal failure — DL-102: classificação 100% pelo STATUS da linha no momento do terminal (nunca
// por código de erro). Chamado pelos DOIS pontos de `job-runner.ts` (`handleDlqTransition`/
// `handleFailedTransition`), molde `applyTransporteCiotTerminalFailureSideEffect`.
// =============================================================================

const DFE_ISSUANCE_MUTATING_OPERATIONS = new Set([ISSUE_OPERATION]);

export type DfeIssuanceTerminalFailureJob = {
  jobId: string;
  entityType: string;
  entityId: string;
  operation: string;
  payload: LooseRecord;
  correlationId?: string | null;
  lastErrorCode?: string | null;
  lastErrorMessage?: string | null;
};

export type DfeIssuanceTerminalFailure = {
  action?: string;
  dlqReason?: string;
  patch?: { lastErrorCode?: string | null; lastErrorMessage?: string | null };
};

async function insertTerminalEvent(issuanceId: string, eventType: DfeIssuanceEventInsertInput['eventType'], detail: Record<string, unknown>, correlationId: string | null | undefined) {
  return insertDfeIssuanceEvent({
    id: createPrefixedId('dfeissev'),
    issuanceId,
    eventType,
    detail,
    correlationId: correlationId || createPrefixedId('corr')
  });
}

export async function applyTransporteDfeIssuanceTerminalFailureSideEffect(
  job: DfeIssuanceTerminalFailureJob,
  terminalFailure: DfeIssuanceTerminalFailure = {},
  error: unknown = null
): Promise<unknown> {
  if (!DFE_ISSUANCE_MUTATING_OPERATIONS.has(job.operation)) return null;

  const terminalAction = String(terminalFailure.action || '').toLowerCase();
  if (!['failed', 'dlq', 'cancelled'].includes(terminalAction)) return null;

  const issuanceId = toTrimmedString(job.payload?.issuanceId);
  if (!issuanceId) return null; // falhou antes de o payload carregar o id — nada a reconciliar

  const lastErrorCode = terminalFailure.patch?.lastErrorCode || job.lastErrorCode || getErrorCode(error) || null;
  const lastErrorMessage = terminalFailure.patch?.lastErrorMessage || job.lastErrorMessage || getErrorMessage(error) || null;

  // Tentativa 1: a linha estava `submitting` (o dispatch remoto REALMENTE aconteceu) — DL-102:
  // "não perguntei o desfecho" nunca é "falhou". Marca unconfirmed e tenta enfileirar o
  // reconciliador — se isso falhar, a varredura periódica pega na próxima janela.
  const unconfirmed = await markDfeIssuanceSubmitUnconfirmed(issuanceId, { lastErrorCode, lastErrorDetail: { message: lastErrorMessage } });
  if (unconfirmed) {
    await insertTerminalEvent(issuanceId, 'submit_unconfirmed', { lastErrorCode, operation: job.operation }, job.correlationId);

    const operationId = toTrimmedString(job.payload?.operationId);
    const integrationAccountId = toTrimmedString(job.payload?.integrationAccountId);
    const documentType = toTrimmedString(job.payload?.documentType);
    const correlationMarker = toTrimmedString(job.payload?.correlationMarker);
    if (operationId && integrationAccountId && documentType && correlationMarker) {
      try {
        const retryConfig = getRetryConfig(RECONCILE_OPERATION);
        await insertJobDeduplicated({
          jobId: createPrefixedId('job'),
          commandId: createPrefixedId('cmd'),
          entityType: 'dfe_issuance',
          entityId: operationId,
          operation: RECONCILE_OPERATION,
          payload: { issuanceId, operationId, integrationAccountId, documentType, correlationMarker },
          status: 'queued',
          maxAttempts: retryConfig.maxAttempts,
          correlationId: job.correlationId || createPrefixedId('corr'),
          priority: calculateJobPriority(RECONCILE_OPERATION),
          retryStrategy: retryConfig.strategy,
          baseDelayMs: retryConfig.baseDelayMs,
          maxDelayMs: retryConfig.maxDelayMs,
          tags: extractJobTags({ operation: RECONCILE_OPERATION, entityType: 'dfe_issuance', status: 'queued' })
        });
      } catch (enqueueError: unknown) {
        // Best-effort — a varredura periódica é a rede de segurança para este enfileiramento.
        console.warn(`[transport-dfe-issuance-service] falha ao enfileirar reconciliação da emissão ${issuanceId}: ${getErrorMessage(enqueueError)}`);
      }
    }

    return unconfirmed;
  }

  // Tentativa 2: a linha ainda estava PRÉ-submissão (`draft/building/built/signing/signed`) — falha
  // LOCAL, nunca chegou perto do gateway remoto. `failed_validation`, nunca DL-102.
  const failed = await markDfeIssuanceFailedValidation(issuanceId, { lastErrorCode, lastErrorDetail: { message: lastErrorMessage } });
  if (!failed) return null; // já não estava em trânsito — nada a fazer (ex.: já terminal por outro caminho)

  return insertTerminalEvent(issuanceId, 'failed', { reasonCode: lastErrorCode }, job.correlationId);
}

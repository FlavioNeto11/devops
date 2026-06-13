import { createWriteStream } from 'node:fs';
import path from 'node:path';
import { ZipFile } from 'yazl';
import { insertAuditEntry } from '../repositories/audit-repo.js';
import { findJobById, insertJob, updateJob, updateJobIfOwned } from '../repositories/job-repo.js';
import { findManifestById, listManifestDocuments, updateManifest, upsertManifestFromExternalSearch } from '../repositories/manifest-repo.js';
import {
  findMtrProvisorioById,
  updateMtrProvisorioStatus,
  type MtrProvisorioRecord
} from '../repositories/mtr-provisorio-repo.js';
import { findCadastroById, updateCadastro } from '../repositories/cadastro-repo.js';
import {
  findDmrById,
  updateDmrStatus,
  type DmrStatus
} from '../repositories/dmr-repo.js';
import { AppError } from '../lib/problem.js';
import {
  findAsyncOperationEntity,
  updateAsyncOperationEntity
} from '../repositories/async-operation-repo.js';
import {
  findConversationArtifactById,
  updateConversationArtifact
} from '../repositories/conversation-artifact-repo.js';
import {
  findLatestActiveSessionContextByIntegrationAccount,
  findSessionContextById
} from '../repositories/session-context-repo.js';
import { query } from '../db/pool.js';
import { runCatalogSync } from '../services/catalog-service.js';
import { storeAsyncOperationPdf, storeManifestPdf } from '../services/manifest-service.js';
import {
  markConversationArtifactBundleResult,
  markConversationArtifactDocumentAvailable,
  markConversationArtifactFailed,
  prepareConversationBundleStorage
} from '../services/conversation/conversation-persistence-service.js';
import { createPrefixedId } from '../lib/ids.js';
import { calculateJobPriority, extractJobTags, getRetryConfig } from '../lib/retry.js';

const TRANSIENT_MANIFEST_SUBMIT_STATUSES = new Set(['queued_submit', 'submitting', 'processing']);

type LooseRecord = Record<string, unknown>;
type GatewayResponseData = {
  manCodigo?: string | number | null;
  manNumero?: string | number | null;
  simDescricao?: string | null;
  manHashCode?: string | number | null;
  items?: unknown[];
  item?: unknown;
  message?: string | null;
  result?: unknown;
  pdfBuffer?: Buffer | Uint8Array | null;
};

type GatewayResponse = LooseRecord & {
  data?: GatewayResponseData;
};

type GatewayLogExchange = {
  request?: LooseRecord;
  response?: GatewayResponse;
};

type GatewayExchange = GatewayLogExchange & {
  response: GatewayResponse;
  extraAudits?: GatewayLogExchange[];
};

type JobEntity = {
  jobId: string;
  commandId: string | null;
  entityType: string;
  entityId: string;
  operation: string;
  status: string;
  attempts: number;
  maxAttempts: number;
  payload: LooseRecord;
  correlationId?: string | null;
  claimedBy?: string | null;
  lastErrorCode?: string | null;
  lastErrorMessage?: string | null;
};

type AsyncOperationEntity = {
  entityType: string;
  entityId: string;
  operation: string;
  integrationAccountId: string;
  sessionContextId: string | null;
  status: string;
  payload: LooseRecord;
  result?: LooseRecord | null;
  requestedBy?: string | null;
  correlationId?: string | null;
};

type StoredAsyncDocument = NonNullable<Awaited<ReturnType<typeof storeAsyncOperationPdf>>>;

type MtrProvisorioSubmitArgs = {
  manifest: object;
  payload?: object | null;
  tipoManifestoOverride?: number | string | null;
};

type SessionContextLike = {
  id: string;
  integrationAccountId: string;
  status: string;
  partnerCode: string | null;
  userAccessCode?: string | null;
};

type TerminalFailure = {
  action?: string;
  dlqReason?: string;
  patch?: {
    lastErrorCode?: string | null;
    lastErrorMessage?: string | null;
  };
};

function getErrorMessage(error: unknown): string {
  if (error instanceof Error) return error.message;
  if (typeof error === 'string') return error;
  if (typeof error === 'number' || typeof error === 'boolean' || typeof error === 'bigint') {
    return String(error);
  }
  return '';
}

function getErrorCode(error: unknown): string | null {
  if (error && typeof error === 'object' && 'code' in error && typeof error.code === 'string') {
    return error.code;
  }
  return null;
}

function summarizeTechnicalCause(value: unknown, maxLength = 180) {
  let rawValue = '';
  if (typeof value === 'string') {
    rawValue = value;
  } else if (typeof value === 'number' || typeof value === 'boolean' || typeof value === 'bigint') {
    rawValue = String(value);
  }
  const normalized = rawValue.replaceAll(/\s+/g, ' ').trim();
  if (!normalized) return null;
  if (normalized.length <= maxLength) return normalized;
  return `${normalized.slice(0, maxLength - 1)}…`;
}

function buildManifestSubmitFailureExternalStatus(technicalCause: string | null, terminalAction: string) {
  const baseMessage = terminalAction === 'dlq'
    ? 'Falha no envio para CETESB. Job movido para DLQ; revise os dados e reenfileire o envio.'
    : 'Falha definitiva no envio para CETESB. Revise os dados e realize novo envio.';

  if (!technicalCause) {
    return baseMessage;
  }

  return `${baseMessage} Causa técnica: ${technicalCause}`;
}

function buildManifestCancelFailureUserMessage(errorCode: string | null, technicalCause: string | null, terminalAction: string) {
  if (errorCode === 'MANIFEST_CANCEL_NOT_CONFIRMED') {
    return 'Cancelamento solicitado, mas ainda não confirmado pela CETESB. O manifesto continua com o status anterior no SIGOR.';
  }

  if (errorCode === 'MANIFEST_NOT_READY_FOR_CANCEL') {
    return 'O manifesto ainda não está pronto para cancelamento na CETESB. Tente novamente em alguns instantes.';
  }

  const baseMessage = terminalAction === 'dlq'
    ? 'Falha no cancelamento do manifesto. O job foi movido para DLQ; revise e tente novamente.'
    : 'Falha no cancelamento do manifesto na CETESB. Revise e tente novamente.';

  if (!technicalCause) {
    return baseMessage;
  }

  return `${baseMessage} Causa técnica: ${technicalCause}`;
}

function nowIso() {
  return new Date().toISOString();
}

function isObject(value: unknown): value is LooseRecord {
  return value != null && typeof value === 'object' && !Array.isArray(value);
}

function toRecord(value: unknown): LooseRecord {
  return isObject(value) ? value : {};
}

function toOptionalString(value: unknown): string | null | undefined {
  if (value === undefined) return undefined;
  if (value === null) return null;
  if (typeof value === 'string') return value;
  if (typeof value === 'number' || typeof value === 'boolean' || typeof value === 'bigint') {
    return String(value);
  }
  return null;
}

function toOptionalNumber(value: unknown): number | null | undefined {
  if (value === undefined) return undefined;
  if (value === null) return null;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function toOptionalRecord(value: unknown): Record<string, unknown> | undefined {
  return isObject(value) ? value : undefined;
}

function toArrayOfRecords(value: unknown): LooseRecord[] {
  if (!Array.isArray(value)) return [];
  return value.filter(isObject);
}

function toBoolean(value: unknown, fallback = false): boolean {
  if (typeof value === 'boolean') return value;
  return fallback;
}

function toNonEmptyString(value: unknown): string | null {
  if (typeof value === 'string') {
    const normalized = value.trim();
    return normalized || null;
  }
  if (typeof value === 'number' || typeof value === 'boolean' || typeof value === 'bigint') {
    return String(value).trim() || null;
  }
  return null;
}

function toNumberOrNull(value: unknown): number | null {
  if (typeof value === 'number' && Number.isFinite(value)) return value;
  if (typeof value === 'string' && value.trim()) {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : null;
  }
  return null;
}

type StringOrNumberOrNull = string | number | null;

function toStringOrNumberOrNull(value: unknown): StringOrNumberOrNull {
  const normalized = toNonEmptyString(value);
  if (normalized != null) {
    return normalized;
  }

  return toNumberOrNull(value);
}

function buildRetryableError(message: string, code = 'TEMPORARILY_UNAVAILABLE') {
  const error: Error & { code?: string } = new Error(message);
  error.code = code;
  return error;
}

function findItemByIdentifiers(items: LooseRecord[], identifiers: {
  code?: unknown;
  number?: unknown;
  hash?: unknown;
}, fieldMap: {
  code: string[];
  number: string[];
  hash: string[];
}) {
  const expectedCode = toNonEmptyString(identifiers.code);
  const expectedNumber = toNonEmptyString(identifiers.number);
  const expectedHash = toNonEmptyString(identifiers.hash);

  return items.find((item) => {
    const itemCode = fieldMap.code.map((field) => toNonEmptyString(item[field])).find(Boolean) || null;
    const itemNumber = fieldMap.number.map((field) => toNonEmptyString(item[field])).find(Boolean) || null;
    const itemHash = fieldMap.hash.map((field) => toNonEmptyString(item[field])).find(Boolean) || null;
    return (expectedCode && itemCode === expectedCode)
      || (expectedNumber && itemNumber === expectedNumber)
      || (expectedHash && itemHash === expectedHash);
  }) || null;
}

function buildAsyncDocumentFileName(prefix: string, identifier: unknown) {
  const normalized = toNonEmptyString(identifier) || nowIso().slice(0, 19).replaceAll(':', '-');
  return `${prefix}_${normalized}.pdf`;
}

function requireStoredAsyncDocument(document: Awaited<ReturnType<typeof storeAsyncOperationPdf>>, detail: string): StoredAsyncDocument {
  if (!document) {
    throw buildRetryableError(detail, 'TEMPORARILY_UNAVAILABLE');
  }

  return document;
}


function isTerminalJobStatus(status: string | null | undefined) {
  const normalized = String(status || '').toLowerCase();
  return normalized === 'succeeded' || normalized === 'failed' || normalized === 'dlq' || normalized === 'cancelled';
}

function buildConversationArtifactDownloadUrl(artifactId: string) {
  return `/v1/conversations/artifacts/${artifactId}/content`;
}

function buildUniqueZipEntryName(fileName: string, manifestId: string, usedNames: Map<string, number>) {
  const safeBaseName = path.basename(fileName || `manifesto-${manifestId}.pdf`);
  const extension = path.extname(safeBaseName);
  const baseName = extension ? safeBaseName.slice(0, -extension.length) : safeBaseName;
  const key = safeBaseName.toLowerCase();
  const seenCount = usedNames.get(key) || 0;
  usedNames.set(key, seenCount + 1);

  if (seenCount === 0) {
    return safeBaseName;
  }

  return `${baseName}-${seenCount + 1}${extension || '.pdf'}`;
}

async function createZipArchive(storagePath: string, files: Array<{ storagePath: string; fileName: string; manifestId: string }>) {
  await new Promise<void>((resolve, reject) => {
    const zipFile = new ZipFile();
    const output = createWriteStream(storagePath);
    const usedNames = new Map<string, number>();

    output.on('close', () => resolve());
    output.on('error', reject);
    zipFile.outputStream.on('error', reject).pipe(output);

    for (const file of files) {
      zipFile.addFile(
        file.storagePath,
        buildUniqueZipEntryName(file.fileName, file.manifestId, usedNames)
      );
    }

    zipFile.end();
  });
}

async function handleConversationBundleDocuments(job: JobEntity) {
  const artifact = await findConversationArtifactById(job.entityId);
  if (!artifact) {
    throw new Error(`Conversation artifact ${job.entityId} not found`);
  }

  const sourceItems = (Array.isArray(job.payload?.sourceItems) ? job.payload.sourceItems : [])
    .map((value) => {
      if (!value || typeof value !== 'object' || Array.isArray(value)) return null;
      const record = value as LooseRecord;
      const manifestId = toNonEmptyString(record.manifestId);
      const jobId = toNonEmptyString(record.jobId);
      if (!manifestId || !jobId) return null;
      return { manifestId, jobId };
    })
    .filter((value): value is { manifestId: string; jobId: string } => Boolean(value));

  if (sourceItems.length === 0) {
    const error: Error & { code?: string } = new Error('Nenhum job fonte informado para compor o ZIP conversacional.');
    error.code = 'MISSING_DOCUMENT';
    throw error;
  }

  const readyFiles: Array<{ storagePath: string; fileName: string; manifestId: string; sourceJobId: string }> = [];
  const pendingItems: Array<{ manifestId: string; jobId: string; status: string | null }> = [];
  const failedItems: Array<{ manifestId: string; jobId: string; status: string | null; error: string | null }> = [];

  for (const sourceItem of sourceItems) {
    const sourceJob = await findJobById(sourceItem.jobId);
    if (!sourceJob || !isTerminalJobStatus(sourceJob.status)) {
      pendingItems.push({
        manifestId: sourceItem.manifestId,
        jobId: sourceItem.jobId,
        status: sourceJob?.status || null
      });
      continue;
    }

    if (String(sourceJob.status).toLowerCase() !== 'succeeded') {
      failedItems.push({
        manifestId: sourceItem.manifestId,
        jobId: sourceItem.jobId,
        status: sourceJob.status,
        error: sourceJob.lastErrorMessage || null
      });
      continue;
    }

    const documents = await listManifestDocuments(sourceItem.manifestId);
    const document = documents.find((item) => item?.type === 'manifest_pdf') || documents[0];
    if (!document?.storagePath) {
      pendingItems.push({
        manifestId: sourceItem.manifestId,
        jobId: sourceItem.jobId,
        status: sourceJob.status
      });
      continue;
    }

    readyFiles.push({
      storagePath: document.storagePath,
      fileName: document.fileName,
      manifestId: sourceItem.manifestId,
      sourceJobId: sourceItem.jobId
    });
  }

  await updateConversationArtifact(artifact.id, {
    status: 'processing',
    progressTotal: sourceItems.length,
    progressCompleted: readyFiles.length,
    progressFailed: failedItems.length,
    metadata: {
      ...artifact.metadata,
      sourceItems,
      pendingItems,
      failedItems,
      lastCollectionAt: nowIso()
    }
  });

  if (pendingItems.length > 0) {
    throw buildRetryableError(
      `Aguardando ${pendingItems.length} documento(s) fonte para montar o ZIP conversacional.`,
      'TEMPORARILY_UNAVAILABLE'
    );
  }

  if (readyFiles.length === 0) {
    await markConversationArtifactBundleResult({
      artifactId: artifact.id,
      status: 'failed',
      progressTotal: sourceItems.length,
      progressCompleted: 0,
      progressFailed: failedItems.length,
      metadata: {
        ...artifact.metadata,
        sourceItems,
        failedItems,
        failedAt: nowIso()
      }
    });

    const error: Error & { code?: string } = new Error('Nenhum PDF fonte ficou disponivel para compor o ZIP conversacional.');
    error.code = 'MISSING_DOCUMENT';
    throw error;
  }

  const fileName = artifact.fileName || `chat-manifestos-${readyFiles.length}-itens.zip`;
  const { storagePath } = await prepareConversationBundleStorage(artifact.id, fileName);
  await createZipArchive(storagePath, readyFiles);

  const finalStatus = failedItems.length > 0 ? 'partial' : 'available';
  await markConversationArtifactBundleResult({
    artifactId: artifact.id,
    status: finalStatus,
    storagePath,
    fileName,
    mimeType: 'application/zip',
    progressTotal: sourceItems.length,
    progressCompleted: readyFiles.length,
    progressFailed: failedItems.length,
    metadata: {
      ...artifact.metadata,
      sourceItems,
      failedItems,
      completedItems: readyFiles.map((file) => ({
        manifestId: file.manifestId,
        jobId: file.sourceJobId,
        fileName: file.fileName
      })),
      partialFailureHandling: failedItems.length > 0 ? 'bundle_with_available_documents' : 'all_documents_available',
      finishedAt: nowIso()
    }
  });

  await finishJob(job, {
    outcome: finalStatus === 'partial' ? 'conversation_bundle_partial' : 'conversation_bundle_ready',
    artifactId: artifact.id,
    downloadUrl: buildConversationArtifactDownloadUrl(artifact.id)
  });
}
async function requireAsyncOperationEntity(job: JobEntity): Promise<AsyncOperationEntity> {
  const entity = await findAsyncOperationEntity(job.entityType, job.entityId);
  if (entity) {
    return {
      ...entity,
      payload: isObject(entity.payload) ? entity.payload : {}
    };
  }

  const integrationAccountId = toNonEmptyString(job.payload?.integrationAccountId);
  if (!integrationAccountId) {
    throw new Error(`Async operation ${job.entityType}:${job.entityId} missing integrationAccountId`);
  }

  return {
    entityType: job.entityType,
    entityId: job.entityId,
    operation: job.operation,
    integrationAccountId,
    sessionContextId: toNonEmptyString(job.payload?.sessionContextId),
    status: job.status,
    payload: isObject(job.payload) ? job.payload : {},
    result: null,
    requestedBy: toNonEmptyString(job.payload?.requestedBy),
    correlationId: job.correlationId || null
  };
}

async function updateAsyncEntity(job: JobEntity, patch: {
  status?: string | null;
  sessionContextId?: string | null;
  payload?: LooseRecord | null;
  result?: LooseRecord | null;
  lastSyncAt?: string | null;
}) {
  return updateAsyncOperationEntity(job.entityType, job.entityId, {
    status: patch.status || null,
    sessionContextId: patch.sessionContextId || null,
    payload: patch.payload || null,
    result: patch.result || null,
    correlationId: job.correlationId || null,
    lastSyncAt: patch.lastSyncAt || nowIso()
  });
}

async function resolveActiveSessionContext(job: JobEntity, entity?: AsyncOperationEntity): Promise<SessionContextLike> {
  const integrationAccountId = toNonEmptyString(entity?.integrationAccountId || job.payload?.integrationAccountId);
  if (!integrationAccountId) {
    throw new Error(`Job ${job.jobId} missing integrationAccountId`);
  }

  const requestedSessionContextId = toNonEmptyString(entity?.sessionContextId || job.payload?.sessionContextId);
  if (requestedSessionContextId) {
    const requestedSession = await findSessionContextById(requestedSessionContextId);
    if (requestedSession?.integrationAccountId === integrationAccountId && ['active', 'pending_auth'].includes(String(requestedSession.status || '').toLowerCase())) {
      return requestedSession;
    }
  }

  const activeSession = await findLatestActiveSessionContextByIntegrationAccount(integrationAccountId);
  if (!activeSession) {
    throw buildRetryableError(`Nenhuma sessão ativa encontrada para integrationAccountId ${integrationAccountId}.`, 'TEMPORARILY_UNAVAILABLE');
  }

  return activeSession;
}

export async function applyAsyncOperationTerminalFailureSideEffect(job: JobEntity, terminalFailure: TerminalFailure = {}, error: unknown = null) {
  if (!['manifestReceipt', 'cdf'].includes(job?.entityType || '')) {
    return null;
  }

  const entity = await findAsyncOperationEntity(job.entityType, job.entityId);
  if (!entity) {
    return null;
  }

  const terminalAction = String(terminalFailure.action || '').toLowerCase();
  if (!['failed', 'dlq', 'cancelled'].includes(terminalAction)) {
    return null;
  }

  const technicalCause = summarizeTechnicalCause(
    terminalFailure.patch?.lastErrorMessage
    || terminalFailure.dlqReason
    || getErrorMessage(error)
    || job.lastErrorMessage
  );

  const outcome = job.operation.replace('.', '_') + '_failed';
  const nextPayload = mergeEntityJobResult(entity.payload, job.operation, {
    jobId: job.jobId,
    outcome,
    status: 'failed',
    terminalAction,
    lastErrorCode: terminalFailure.patch?.lastErrorCode || job.lastErrorCode || null,
    lastErrorMessage: technicalCause,
    retriable: terminalAction !== 'failed'
  });

  const nextResult = mergeEntityJobResult(entity.result, job.operation, {
    jobId: job.jobId,
    outcome,
    status: 'failed',
    terminalAction,
    lastErrorCode: terminalFailure.patch?.lastErrorCode || job.lastErrorCode || null,
    lastErrorMessage: technicalCause,
    retriable: terminalAction !== 'failed'
  });

  return updateAsyncOperationEntity(job.entityType, job.entityId, {
    status: terminalAction === 'cancelled' ? 'cancelled' : 'failed',
    payload: nextPayload,
    result: nextResult,
    correlationId: job.correlationId || null,
    lastSyncAt: nowIso()
  });
}

function toGatewayResponse(value: unknown): GatewayResponse {
  return isObject(value) ? value as GatewayResponse : {};
}

function toGatewayExchange(value: unknown): GatewayExchange {
  if (!isObject(value)) {
    return { response: {} };
  }

  const extraAudits = Array.isArray(value.extraAudits)
    ? value.extraAudits
      .filter(isObject)
      .map((auditItem) => ({
        request: isObject(auditItem.request) ? auditItem.request : undefined,
        response: toGatewayResponse(auditItem.response)
      }))
    : undefined;

  return {
    request: isObject(value.request) ? value.request : undefined,
    response: toGatewayResponse(value.response),
    extraAudits
  };
}

function mergeEntityJobResult(existingPayload: unknown, operation: string, result: LooseRecord) {
  const basePayload = isObject(existingPayload) ? existingPayload : {};
  const previousResults = isObject(basePayload.jobResults) ? basePayload.jobResults : {};
  const previousOperationResult = isObject(previousResults[operation]) ? previousResults[operation] : {};

  return {
    ...basePayload,
    jobResults: {
      ...previousResults,
      [operation]: {
        ...previousOperationResult,
        ...result,
        updatedAt: nowIso()
      }
    }
  };
}

export async function applyManifestSubmitTerminalFailureSideEffect(job: JobEntity, terminalFailure: TerminalFailure = {}, error: unknown = null) {
  if (
    (job?.entityType !== 'manifest' && job?.entityType !== 'mtr_provisorio')
    || job?.operation !== 'manifest.submit'
  ) {
    return null;
  }

  const terminalAction = String(terminalFailure.action || '').toLowerCase();
  if (!['failed', 'dlq', 'cancelled'].includes(terminalAction)) {
    return null;
  }

  // R3-C: para `mtr_provisorio`, usar o repo provisório dedicado (preserva
  // locking otimista). Caminho `manifest` permanece inalterado.
  if (job.entityType === 'mtr_provisorio') {
    const record = await findMtrProvisorioById(job.entityId);
    if (!record) return null;
    if (!TRANSIENT_MANIFEST_SUBMIT_STATUSES.has(String(record.status || '').toLowerCase())) {
      return null;
    }
    const technicalCause = summarizeTechnicalCause(
      terminalFailure.patch?.lastErrorMessage
      || terminalFailure.dlqReason
      || getErrorMessage(error)
      || job.lastErrorMessage
    );
    const payloadWithResult = mergeEntityJobResult(record.payload, 'manifest.submit', {
      jobId: job.jobId,
      outcome: 'manifest_submit_failed',
      kind: 'provisorio',
      status: 'failed_submit',
      externalStatus: buildManifestSubmitFailureExternalStatus(technicalCause, terminalAction),
      terminalAction,
      lastErrorCode: terminalFailure.patch?.lastErrorCode || job.lastErrorCode || null,
      lastErrorMessage: technicalCause,
      retriable: terminalAction !== 'failed'
    });
    return updateMtrProvisorioStatus(
      record.id,
      {
        status: 'failed_submit',
        externalStatus: buildManifestSubmitFailureExternalStatus(technicalCause, terminalAction),
        payload: payloadWithResult,
        lastSyncAt: nowIso()
      },
      record.version
    );
  }

  const manifest = await findManifestById(job.entityId);
  if (!manifest) {
    return null;
  }

  if (!TRANSIENT_MANIFEST_SUBMIT_STATUSES.has(String(manifest.status || '').toLowerCase())) {
    return null;
  }

  const technicalCause = summarizeTechnicalCause(
    terminalFailure.patch?.lastErrorMessage
    || terminalFailure.dlqReason
    || getErrorMessage(error)
    || job.lastErrorMessage
  );

  const payloadWithResult = mergeEntityJobResult(manifest.payload, 'manifest.submit', {
    jobId: job.jobId,
    outcome: 'manifest_submit_failed',
    status: 'failed',
    externalStatus: buildManifestSubmitFailureExternalStatus(technicalCause, terminalAction),
    terminalAction,
    lastErrorCode: terminalFailure.patch?.lastErrorCode || job.lastErrorCode || null,
    lastErrorMessage: technicalCause,
    retriable: terminalAction !== 'failed'
  });

  return updateManifest(manifest.id, {
    status: 'failed',
    externalStatus: buildManifestSubmitFailureExternalStatus(technicalCause, terminalAction),
    payload: payloadWithResult,
    lastSyncAt: nowIso()
  });
}

export async function applyManifestCancelTerminalFailureSideEffect(job: JobEntity, terminalFailure: TerminalFailure = {}, error: unknown = null) {
  if (job?.entityType !== 'manifest' || job?.operation !== 'manifest.cancel') {
    return null;
  }

  const terminalAction = String(terminalFailure.action || '').toLowerCase();
  if (!['failed', 'dlq', 'cancelled'].includes(terminalAction)) {
    return null;
  }

  const manifest = await findManifestById(job.entityId);
  if (!manifest || String(manifest.status || '').toLowerCase() === 'cancelled') {
    return null;
  }

  const lastErrorCode = terminalFailure.patch?.lastErrorCode || job.lastErrorCode || getErrorCode(error) || null;
  const technicalCause = summarizeTechnicalCause(
    terminalFailure.patch?.lastErrorMessage
    || terminalFailure.dlqReason
    || getErrorMessage(error)
    || job.lastErrorMessage
  );

  const payloadWithResult = mergeEntityJobResult(manifest.payload, 'manifest.cancel', {
    jobId: job.jobId,
    outcome: 'manifest_cancel_failed',
    status: 'failed',
    terminalAction,
    lastErrorCode,
    lastErrorMessage: technicalCause,
    userMessage: buildManifestCancelFailureUserMessage(lastErrorCode, technicalCause, terminalAction),
    retriable: terminalAction !== 'failed'
  });

  return updateManifest(manifest.id, {
    payload: payloadWithResult,
    lastSyncAt: nowIso()
  });
}

export async function applyConversationArtifactTerminalFailureSideEffect(job: JobEntity, terminalFailure: TerminalFailure = {}, error: unknown = null) {
  const conversationArtifactId = toNonEmptyString(job.payload?.conversationArtifactId);
  if (!conversationArtifactId) {
    return null;
  }

  const terminalAction = String(terminalFailure.action || '').toLowerCase();
  if (!['failed', 'dlq', 'cancelled'].includes(terminalAction)) {
    return null;
  }

  const reasonCode = terminalFailure.patch?.lastErrorCode || job.lastErrorCode || getErrorCode(error) || null;
  const reasonMessage = summarizeTechnicalCause(
    terminalFailure.patch?.lastErrorMessage
    || terminalFailure.dlqReason
    || getErrorMessage(error)
    || job.lastErrorMessage
  );

  return markConversationArtifactFailed({
    artifactId: conversationArtifactId,
    reasonCode,
    reasonMessage,
    jobId: job.jobId
  });
}

async function logExchange(job: JobEntity, exchange: {
  request?: LooseRecord;
  response?: LooseRecord;
}) {
  if (!exchange?.request || !exchange?.response) return;
  await insertAuditEntry({
    correlationId: String(job.correlationId || ''),
    entityType: job.entityType,
    entityId: job.entityId,
    direction: 'outbound',
    component: 'cetesb-gateway',
    httpMethod: toOptionalString(exchange.request.httpMethod),
    endpoint: toOptionalString(exchange.request.endpoint),
    httpStatus: null,
    latencyMs: null,
    sanitizedHeaders: toOptionalRecord(exchange.request.sanitizedHeaders),
    sanitizedBody: toOptionalRecord(exchange.request.sanitizedBody)
  });

  await insertAuditEntry({
    correlationId: String(job.correlationId || ''),
    entityType: job.entityType,
    entityId: job.entityId,
    direction: 'inbound',
    component: 'cetesb-gateway',
    httpMethod: toOptionalString(exchange.response.httpMethod),
    endpoint: toOptionalString(exchange.response.endpoint),
    httpStatus: toOptionalNumber(exchange.response.httpStatus),
    latencyMs: toOptionalNumber(exchange.response.latencyMs),
    sanitizedHeaders: toOptionalRecord(exchange.response.sanitizedHeaders),
    sanitizedBody: toOptionalRecord(exchange.response.sanitizedBody)
  });
}

export async function processJob(job: JobEntity, gateway: {
  submitManifest: (manifest: unknown, payload: LooseRecord) => Promise<unknown>;
  printManifest: (manifest: unknown) => Promise<unknown>;
  submitMtrProvisorio?: (args: MtrProvisorioSubmitArgs) => Promise<unknown>;
  printMtrProvisorio?: (manHashCode: string, options?: LooseRecord) => Promise<unknown>;
  cancelManifest: (manifest: unknown, payload: LooseRecord) => Promise<unknown>;
  submitCadastro: (cadastro: unknown) => Promise<unknown>;
  listReceiptResponsibles: (options: LooseRecord) => Promise<unknown>;
  searchReceivableManifests: (options: LooseRecord) => Promise<unknown>;
  getRemoteManifest: (manCodigo: string | number, options: LooseRecord) => Promise<unknown>;
  receiveManifest: (options: LooseRecord) => Promise<unknown>;
  printManifestReceipt: (manHashCode: string, options: LooseRecord) => Promise<unknown>;
  listCdfResponsibles: (options: LooseRecord) => Promise<unknown>;
  searchCdfGeneratorPartner: (options: LooseRecord) => Promise<unknown>;
  searchReceivedManifestsForCdf: (options: LooseRecord) => Promise<unknown>;
  generateCdf: (options: LooseRecord) => Promise<unknown>;
  searchCdfCertificates: (options: LooseRecord) => Promise<unknown>;
  printCdfCertificate: (cerHashCode: string, options: LooseRecord) => Promise<unknown>;
  submitDmr?: (params?: {
    dmrId: string;
    payload?: unknown;
    sessionContextId?: string | null;
    integrationAccountId?: string | null;
    correlationId?: string | null;
  }) => Promise<unknown>;
}) {
  switch (job.operation) {
    case 'manifest.submit':
      return handleManifestSubmit(job, gateway);
    case 'manifest.print':
      return handleManifestPrint(job, gateway);
    case 'manifest.cancel':
      return handleManifestCancel(job, gateway);
    case 'manifest.receive':
      return handleManifestReceive(job, gateway);
    case 'cdf.generate':
      return handleCdfGenerate(job, gateway);
    case 'cdf.download':
      return handleCdfDownload(job, gateway);
    case 'catalog.sync':
      return handleCatalogSync(job, gateway);
    case 'cadastro.submit':
      return handleCadastroSubmit(job, gateway);
    case 'dmr.submit':
      return handleDmrSubmit(job, gateway);
    case 'conversation.bundle_documents':
      return handleConversationBundleDocuments(job);
    default:
      throw new Error(`Unsupported job operation ${job.operation}`);
  }
}

async function finishJob(job: JobEntity, patch: LooseRecord = {}) {
  const patchData = {
    status: 'succeeded',
    attempts: job.attempts,
    finishedAt: nowIso(),
    lastErrorCode: null,
    lastErrorMessage: null,
    payload: { ...job.payload, ...patch }
  } as const;

  if (job.claimedBy) {
    const updated = await updateJobIfOwned(job.jobId, job.claimedBy, patchData);
    if (!updated) {
      const error: Error & { code?: string } = new Error(`Job ownership lost before finishing ${job.jobId}`);
      error.code = 'JOB_OWNERSHIP_LOST';
      throw error;
    }
    return;
  }

  await updateJob(job.jobId, patchData);
}

async function handleManifestSubmit(job: JobEntity, gateway: {
  submitManifest: (manifest: unknown, payload: LooseRecord) => Promise<unknown>;
  submitMtrProvisorio?: (args: { manifest: object; payload?: object | null; tipoManifestoOverride?: number | string | null }) => Promise<unknown>;
}) {
  // R3-C: ramificação por discriminador SICAT `kind`. O service injeta
  // `payload.kind = 'provisorio'` + `payload.tipoManifestoOverride` no job
  // ao enfileirar comandos da família `/v1/mtr-provisorio/*`. Quando
  // `kind === 'provisorio'`, persistência usa o repo dedicado e o gateway
  // é invocado via `submitMtrProvisorio` (que reusa o endpoint comum de
  // submit com override do `tipoManifesto` no payload mapeado).
  if (job.payload?.kind === 'provisorio' || job.entityType === 'mtr_provisorio') {
    return handleMtrProvisorioSubmit(job, gateway);
  }
  const manifest = await findManifestById(job.entityId);
  if (!manifest) throw new Error(`Manifest ${job.entityId} not found`);

  await updateManifest(manifest.id, { status: 'submitting' });
  const exchange = toGatewayExchange(await gateway.submitManifest(manifest, job.payload));
  const responseData = exchange.response.data ?? {};
  await logExchange(job, exchange);
  for (const extra of exchange.extraAudits || []) {
    await logExchange(job, extra);
  }

  const hasResolvedExternalReference = Boolean(
    responseData.manCodigo != null
    && responseData.manNumero != null
  );

  let status = 'processing';
  let externalStatus = 'aguardando confirmação CETESB';
  const submitOutcome = hasResolvedExternalReference || job.payload?.validateOnly
    ? 'manifest_submitted'
    : 'manifest_submission_pending_confirmation';

  if (job.payload?.validateOnly) {
    status = 'draft';
    externalStatus = 'validado';
  } else if (hasResolvedExternalReference) {
    status = 'submitted';
    externalStatus = responseData.simDescricao || 'salvo';
  }

  const submitResult = {
    jobId: job.jobId,
    outcome: submitOutcome,
    validateOnly: job.payload?.validateOnly === true,
    status,
    externalStatus,
    manCodigo: responseData.manCodigo || null,
    manNumero: responseData.manNumero || null,
    externalHashCode: responseData.manHashCode || null
  };
  const payloadWithResult = mergeEntityJobResult(manifest.payload, 'manifest.submit', submitResult);

  if (job.payload?.validateOnly) {
    // validateOnly: apenas atualiza status sem persistir dados externos
    await updateManifest(manifest.id, {
      status,
      externalStatus,
      payload: payloadWithResult,
      lastSyncAt: nowIso()
    });
  } else {
    // submit normal: persiste todos os dados externos
    const patch: {
      status: string;
      externalStatus: string;
      externalHashCode: string | null;
      payload: LooseRecord;
      lastSubmittedAt: string;
      lastSyncAt: string;
      externalReference?: { manCodigo: string | number | null; manNumero: string | number | null };
    } = {
      status,
      externalStatus,
      externalHashCode: responseData.manHashCode ? String(responseData.manHashCode) : null,
      payload: payloadWithResult,
      lastSubmittedAt: nowIso(),
      lastSyncAt: nowIso()
    };

    if (hasResolvedExternalReference) {
      patch.externalReference = {
        manCodigo: responseData.manCodigo ?? null,
        manNumero: responseData.manNumero ?? null
      };
    }

    await updateManifest(manifest.id, patch);
  }

  await finishJob(job, {
    outcome: submitOutcome
  });

  if (job.payload?.printAfterSubmit && hasResolvedExternalReference) {
    const operation = 'manifest.print';
    const retryConfig = getRetryConfig(operation);

    await insertJob({
      jobId: createPrefixedId('job'),
      commandId: createPrefixedId('cmd'),
      entityType: 'manifest',
      entityId: manifest.id,
      operation,
      payload: { requestedBy: job.payload?.requestedBy || null, documentType: 'manifest_pdf', regenerateIfMissing: true },
      status: 'queued',
      maxAttempts: retryConfig.maxAttempts,
      correlationId: job.correlationId,
      priority: calculateJobPriority(operation),
      retryStrategy: retryConfig.strategy,
      baseDelayMs: retryConfig.baseDelayMs,
      maxDelayMs: retryConfig.maxDelayMs,
      tags: extractJobTags({ operation, entityType: 'manifest', status: 'queued' })
    });
  }
}

async function handleManifestPrint(job: JobEntity, gateway: {
  printManifest: (manifest: unknown) => Promise<unknown>;
  printMtrProvisorio?: (manHashCode: string, options?: LooseRecord) => Promise<unknown>;
}) {
  if (job.payload?.kind === 'provisorio' || job.entityType === 'mtr_provisorio') {
    return handleMtrProvisorioPrint(job, gateway);
  }
  const manifest = await findManifestById(job.entityId);
  if (!manifest) throw new Error(`Manifest ${job.entityId} not found`);
  if (!manifest.externalHashCode && job.payload?.regenerateIfMissing !== true) {
    throw new Error(`Manifest ${job.entityId} has no external hash to print`);
  }

  await updateManifest(manifest.id, { status: 'printing' });
  const exchange = toGatewayExchange(await gateway.printManifest(manifest));
  await logExchange(job, exchange);

  const refreshed = await findManifestById(manifest.id);
  const effectiveManifest = refreshed ?? manifest;
  const pdfRaw = exchange.response.data?.pdfBuffer;
  if (!pdfRaw) {
    throw new Error('Gateway CETESB nao retornou PDF binario para impressao. Verifique se o modo real esta ativo (CETESB_GATEWAY_MODE=real).');
  }
  const pdf = Buffer.isBuffer(pdfRaw) ? pdfRaw : Buffer.from(pdfRaw);
  const document = await storeManifestPdf(effectiveManifest, pdf);
  if (!document) {
    throw new Error(`Failed to persist PDF document for manifest ${manifest.id}`);
  }
  const conversationArtifactId = toNonEmptyString(job.payload?.conversationArtifactId);
  if (conversationArtifactId) {
    await markConversationArtifactDocumentAvailable({
      artifactId: conversationArtifactId,
      storagePath: document.storagePath,
      fileName: document.fileName,
      mimeType: document.mimeType,
      metadata: {
        manifestId: manifest.id,
        sourceJobId: job.jobId,
        correlationId: job.correlationId || null
      }
    });
  }
  const payloadWithResult = mergeEntityJobResult(effectiveManifest.payload || manifest.payload, 'manifest.print', {
    jobId: job.jobId,
    outcome: 'manifest_printed',
    documentId: document.id,
    printUrl: document.downloadUrl,
    fileName: document.fileName
  });

  // HANDOFF 4: Atualizar status para 'printed' e registrar printUrl
  await updateManifest(manifest.id, { status: 'printed', payload: payloadWithResult, lastSyncAt: nowIso() });
  await finishJob(job, {
    outcome: 'manifest_printed',
    printUrl: document.downloadUrl
  });
}

// ---------------------------------------------------------------------------
// MTR provisório (R3-C) — handlers especializados invocados a partir de
// `handleManifestSubmit` / `handleManifestPrint` quando `payload.kind ===
// 'provisorio'`. Persistência apoiada em `manifests` filtrada por
// `kind = 'provisorio'` via `mtr-provisorio-repo.ts` (locking otimista
// preservado via coluna `version`). Audit-exchange-logging permanece o
// mesmo (`logExchange`).
// ---------------------------------------------------------------------------

async function handleMtrProvisorioSubmit(job: JobEntity, gateway: {
  submitMtrProvisorio?: (args: { manifest: object; payload?: object | null; tipoManifestoOverride?: number | string | null }) => Promise<unknown>;
}) {
  if (!gateway.submitMtrProvisorio) {
    throw new AppError(
      500,
      'Internal Server Error',
      'Gateway sem suporte a submitMtrProvisorio.',
      { code: 'MTR_PROVISORIO_GATEWAY_UNAVAILABLE' }
    );
  }
  const record = await findMtrProvisorioById(job.entityId);
  if (!record) throw new Error(`Manifesto provisório ${job.entityId} não encontrado.`);

  const submitting = await updateMtrProvisorioStatus(
    record.id,
    { status: 'submitting' },
    record.version
  );

  const tipoManifestoOverride = (job.payload?.tipoManifestoOverride as number | string | null | undefined) ?? null;
  const exchange = toGatewayExchange(
    await gateway.submitMtrProvisorio({
      manifest: submitting as unknown as object,
      payload: (job.payload as object | null | undefined) ?? null,
      tipoManifestoOverride
    })
  );
  const responseData = exchange.response.data ?? {};
  await logExchange(job, exchange);
  for (const extra of exchange.extraAudits || []) {
    await logExchange(job, extra);
  }

  const hasResolvedExternalReference = Boolean(
    responseData.manCodigo != null && responseData.manNumero != null
  );

  let status: MtrProvisorioRecord['status'] = 'awaiting_remote';
  let externalStatus = 'aguardando confirmação CETESB';
  const submitOutcome = hasResolvedExternalReference || job.payload?.validateOnly
    ? 'manifest_submitted'
    : 'manifest_submission_pending_confirmation';

  if (job.payload?.validateOnly) {
    status = 'draft';
    externalStatus = 'validado';
  } else if (hasResolvedExternalReference) {
    status = 'submitted';
    externalStatus = String(responseData.simDescricao || 'salvo');
  }

  const submitResult = {
    jobId: job.jobId,
    outcome: submitOutcome,
    validateOnly: job.payload?.validateOnly === true,
    kind: 'provisorio',
    status,
    externalStatus,
    manCodigo: responseData.manCodigo || null,
    manNumero: responseData.manNumero || null,
    externalHashCode: responseData.manHashCode || null,
    tipoManifestoOverride
  };
  const payloadWithResult = mergeEntityJobResult(submitting.payload, 'manifest.submit', submitResult);
  // O número provisório retornado pela CETESB é persistido na coluna
  // dedicada (R3-C) — `external_reference` segue carregando manCodigo/manNumero
  // para compat com listagens.
  const provisionalNumber = responseData.manNumero != null ? String(responseData.manNumero) : null;

  if (job.payload?.validateOnly) {
    await updateMtrProvisorioStatus(
      submitting.id,
      {
        status,
        externalStatus,
        payload: payloadWithResult,
        lastSyncAt: nowIso()
      },
      submitting.version
    );
  } else {
    await updateMtrProvisorioStatus(
      submitting.id,
      {
        status,
        externalStatus,
        externalHashCode: responseData.manHashCode != null ? String(responseData.manHashCode) : null,
        externalReference: hasResolvedExternalReference
          ? {
            manCodigo: responseData.manCodigo ?? null,
            manNumero: responseData.manNumero ?? null
          }
          : null,
        provisionalNumber: hasResolvedExternalReference ? provisionalNumber : null,
        payload: payloadWithResult,
        lastSubmittedAt: nowIso(),
        lastSyncAt: nowIso()
      },
      submitting.version
    );
  }

  await finishJob(job, { outcome: submitOutcome });
}

async function handleMtrProvisorioPrint(job: JobEntity, gateway: {
  printMtrProvisorio?: (manHashCode: string, options?: LooseRecord) => Promise<unknown>;
}) {
  if (!gateway.printMtrProvisorio) {
    throw new AppError(
      500,
      'Internal Server Error',
      'Gateway sem suporte a printMtrProvisorio.',
      { code: 'MTR_PROVISORIO_GATEWAY_UNAVAILABLE' }
    );
  }
  const record = await findMtrProvisorioById(job.entityId);
  if (!record) throw new Error(`Manifesto provisório ${job.entityId} não encontrado.`);
  if (!record.externalHashCode) {
    throw new Error(`Manifesto provisório ${job.entityId} sem externalHashCode para impressão.`);
  }

  const printing = await updateMtrProvisorioStatus(
    record.id,
    { status: 'queued_print' },
    record.version
  );

  const exchange = toGatewayExchange(
    await gateway.printMtrProvisorio(printing.externalHashCode || record.externalHashCode || '', {
      sessionContextId: printing.sessionContextId,
      integrationAccountId: printing.integrationAccountId,
      correlationId: job.correlationId
    })
  );
  await logExchange(job, exchange);

  const pdfRaw = exchange.response.data?.pdfBuffer;
  if (!pdfRaw) {
    throw new Error('Gateway CETESB não retornou PDF para impressão de MTR provisório (CETESB_GATEWAY_MODE=real).');
  }
  const pdf = Buffer.isBuffer(pdfRaw) ? pdfRaw : Buffer.from(pdfRaw);
  const document = await storeManifestPdf(printing as unknown as Parameters<typeof storeManifestPdf>[0], pdf);
  if (!document) {
    throw new Error(`Falha ao persistir PDF do manifesto provisório ${record.id}.`);
  }
  const conversationArtifactId = toNonEmptyString(job.payload?.conversationArtifactId);
  if (conversationArtifactId) {
    await markConversationArtifactDocumentAvailable({
      artifactId: conversationArtifactId,
      storagePath: document.storagePath,
      fileName: document.fileName,
      mimeType: document.mimeType,
      metadata: {
        manifestId: record.id,
        sourceJobId: job.jobId,
        correlationId: job.correlationId || null,
        kind: 'provisorio'
      }
    });
  }

  const payloadWithResult = mergeEntityJobResult(printing.payload, 'manifest.print', {
    jobId: job.jobId,
    outcome: 'manifest_printed',
    kind: 'provisorio',
    documentId: document.id,
    printUrl: document.downloadUrl,
    fileName: document.fileName
  });

  await updateMtrProvisorioStatus(
    printing.id,
    {
      status: 'submitted',
      payload: payloadWithResult,
      lastSyncAt: nowIso()
    },
    printing.version
  );
  await finishJob(job, {
    outcome: 'manifest_printed',
    printUrl: document.downloadUrl
  });
}

async function handleManifestCancel(job: JobEntity, gateway: { cancelManifest: (manifest: unknown, payload: LooseRecord) => Promise<unknown> }) {
  const manifest = await findManifestById(job.entityId);
  if (!manifest) throw new Error(`Manifest ${job.entityId} not found`);

  const stableRollbackStatus = manifest.externalReference?.manCodigo ? 'submitted' : 'draft';

  await updateManifest(manifest.id, { status: 'cancelling' });

  let exchange: GatewayExchange;
  try {
    // HANDOFF 4: Cancelamento pode falhar se MTR ainda não apareceu na pesquisa CETESB
    // Gateway fará retry interno do lookup se necessário
    exchange = toGatewayExchange(await gateway.cancelManifest(manifest, job.payload));
  } catch (err: unknown) {
    await updateManifest(manifest.id, { status: stableRollbackStatus });
    throw err;
  }

  for (const extra of exchange.extraAudits || []) {
    await logExchange(job, extra);
  }
  await logExchange(job, exchange);
  const responseData = exchange.response.data ?? {};

  const hasResolvedExternalReference = Boolean(
    responseData.manCodigo != null
    && responseData.manNumero != null
  );
  if (!hasResolvedExternalReference) {
    await updateManifest(manifest.id, { status: stableRollbackStatus });
    throw new Error(`Manifest ${job.entityId} cancel returned without confirmed external reference`);
  }

  const payloadWithResult = mergeEntityJobResult(manifest.payload, 'manifest.cancel', {
    jobId: job.jobId,
    outcome: 'manifest_cancelled',
    manCodigo: responseData.manCodigo || null,
    manNumero: responseData.manNumero || null,
    externalStatus: responseData.simDescricao || 'cancelado'
  });

  await updateManifest(manifest.id, {
    status: 'cancelled',
    externalStatus: responseData.simDescricao || 'cancelado',
    externalReference: {
      manCodigo: responseData.manCodigo ?? null,
      manNumero: responseData.manNumero ?? null
    },
    payload: payloadWithResult,
    lastSyncAt: nowIso()
  });
  await finishJob(job, { outcome: 'manifest_cancelled' });
}

function resolveReceiptManifestIdentifiers(receiptPayload: LooseRecord) {
  const manifestPayload = toRecord(receiptPayload.manifesto);
  return {
    code: manifestPayload.manCodigo ?? receiptPayload.manCodigo,
    number: manifestPayload.manNumero ?? receiptPayload.manNumero,
    hash: manifestPayload.manHashCode ?? receiptPayload.manHashCode
  };
}

function resolveCdfDateWindow(cdfPayload: LooseRecord) {
  return {
    dateFrom: toNonEmptyString(cdfPayload.cerDataInicial) || toNonEmptyString(cdfPayload.dateFrom),
    dateTo: toNonEmptyString(cdfPayload.cerDataFinal) || toNonEmptyString(cdfPayload.dateTo)
  };
}

function hasIdentifiers(identifiers: { code?: unknown; number?: unknown; hash?: unknown }) {
  return Boolean(
    toNonEmptyString(identifiers.code)
    || toNonEmptyString(identifiers.number)
    || toNonEmptyString(identifiers.hash)
  );
}

function findReceiptResidueMatch(remoteResidueLine: LooseRecord, requestedResidueLines: LooseRecord[]) {
  const remoteResidue = toRecord(remoteResidueLine.residuo);
  const identifiers = {
    code: remoteResidueLine.marCodigo ?? remoteResidue.resCodigo ?? remoteResidue.resCodigoIbama,
    number: remoteResidueLine.marNumeroLinha,
    hash: remoteResidue.resCodigoIbama
  };

  return requestedResidueLines.find((candidate) => {
    const candidateResidue = toRecord(candidate.residuo);
    return hasIdentifiers({
      code: candidate.marCodigo ?? candidateResidue.resCodigo ?? candidateResidue.resCodigoIbama,
      number: candidate.marNumeroLinha,
      hash: candidateResidue.resCodigoIbama
    }) && Boolean(
      (toNonEmptyString(identifiers.code) && toNonEmptyString(identifiers.code) === toNonEmptyString(candidate.marCodigo ?? candidateResidue.resCodigo ?? candidateResidue.resCodigoIbama))
      || (toNonEmptyString(identifiers.number) && toNonEmptyString(identifiers.number) === toNonEmptyString(candidate.marNumeroLinha))
      || (toNonEmptyString(identifiers.hash) && toNonEmptyString(identifiers.hash) === toNonEmptyString(candidateResidue.resCodigoIbama))
    );
  }) || null;
}

function mergeReceiptManifestResidues(remoteManifest: LooseRecord, requestedManifest: LooseRecord) {
  const remoteResidueLines = toArrayOfRecords(remoteManifest.listaManifestoResiduo);
  const requestedResidueLines = toArrayOfRecords(requestedManifest.listaManifestoResiduo);

  if (remoteResidueLines.length === 0) {
    return requestedResidueLines;
  }

  if (requestedResidueLines.length === 0) {
    return remoteResidueLines;
  }

  return remoteResidueLines.map((remoteResidueLine) => {
    const requestedResidueLine = findReceiptResidueMatch(remoteResidueLine, requestedResidueLines);
    if (!requestedResidueLine) {
      return remoteResidueLine;
    }

    return {
      ...remoteResidueLine,
      ...requestedResidueLine,
      residuo: {
        ...toRecord(remoteResidueLine.residuo),
        ...toRecord(requestedResidueLine.residuo)
      },
      unidade: {
        ...toRecord(remoteResidueLine.unidade),
        ...toRecord(requestedResidueLine.unidade)
      },
      tratamento: {
        ...toRecord(remoteResidueLine.tratamento),
        ...toRecord(requestedResidueLine.tratamento)
      },
      tipoEstado: {
        ...toRecord(remoteResidueLine.tipoEstado),
        ...toRecord(requestedResidueLine.tipoEstado)
      },
      tipoAcondicionamento: {
        ...toRecord(remoteResidueLine.tipoAcondicionamento),
        ...toRecord(requestedResidueLine.tipoAcondicionamento)
      },
      classe: {
        ...toRecord(remoteResidueLine.classe),
        ...toRecord(requestedResidueLine.classe)
      },
      grupoEmbalagem: {
        ...toRecord(remoteResidueLine.grupoEmbalagem),
        ...toRecord(requestedResidueLine.grupoEmbalagem)
      },
      abnt: {
        ...toRecord(remoteResidueLine.abnt),
        ...toRecord(requestedResidueLine.abnt)
      },
      cadriItem: {
        ...toRecord(remoteResidueLine.cadriItem),
        ...toRecord(requestedResidueLine.cadriItem)
      }
    };
  });
}

// Merge raso de objetos aninhados do manifesto (parceiros): o request só
// sobrescreve os CAMPOS que enviar, nunca o objeto completo do GET remoto.
function mergeOptionalRecord(remote: unknown, requested: unknown): LooseRecord | null {
  const remoteRecord = toRecord(remote);
  const requestedRecord = toRecord(requested);
  if (Object.keys(remoteRecord).length === 0 && Object.keys(requestedRecord).length === 0) {
    return null;
  }
  return { ...remoteRecord, ...requestedRecord };
}

// PROJEÇÃO do manifesto no POST de recebimento — shape EXATO observado na
// captura real (cap_3012dde41ef83433f6). O portal NÃO devolve o GET inteiro:
// remove ~25 campos (manData, recaptcha, paises*, mae*/mai*, etc.) e enxuga os
// parceiros para 9 campos. Enviar campos extras derruba o binding da CETESB
// (Jackson) com 400 Bad Request em HTML de Tomcat — visto em produção.
const RECEIPT_MANIFEST_FIELDS = [
  'estado', 'manCodigo', 'manNumero', 'manHashCode', 'manObservacao', 'tipoManifesto',
  'manResponsavel', 'parceiroAcesso', 'manPlacaVeiculo', 'parceiroGerador', 'manDataExpedicao',
  'manNomeMotorista', 'situacaoManifesto', 'parceiroDestinador', 'listaManifestoResiduo',
  'parceiroTransportador', 'manJustificativaCancelamento', 'parceiroArmazenadorTemporario',
  'possuiArmazenamentoTemporario', 'manObservacaoArmazenadorTemporario',
  'manPlacaVeiculoArmazenamentoTemporario', 'anJustificativaCancelamentoComplementar',
  'manNomeMotoristaArmazenamentoTemporario', 'manDataRecebimentoArmazenamentoTemporario',
  'parceiroTransportadorArmazenadorTemporario'
] as const;
// Campos que o portal envia como string vazia mesmo quando ausentes no GET.
const RECEIPT_MANIFEST_EMPTY_STRING_DEFAULTS = new Set([
  'manObservacaoArmazenadorTemporario',
  'anJustificativaCancelamentoComplementar'
]);
const RECEIPT_PARTNER_FIELDS = [
  'parUf', 'parCnpj', 'parCidade', 'parCodigo', 'parLicenca',
  'parEndereco', 'parDescricao', 'parOrgaoEmissor', 'parNumeroEndereco'
] as const;
const RECEIPT_PARTNER_OBJECT_KEYS = [
  'parceiroGerador', 'parceiroTransportador', 'parceiroDestinador',
  'parceiroArmazenadorTemporario', 'parceiroTransportadorArmazenadorTemporario'
] as const;

function pickRecordFields(source: LooseRecord, fields: readonly string[]): LooseRecord {
  const picked: LooseRecord = {};
  for (const field of fields) {
    picked[field] = source[field] ?? null;
  }
  return picked;
}

export function buildReceiptManifestPayload(
  remoteManifest: LooseRecord,
  receiptPayload: LooseRecord,
  matchedManifest: LooseRecord | null,
  effectivePartnerCode: number
) {
  void effectivePartnerCode;
  const requestedManifest = toRecord(receiptPayload.manifesto);
  // O portal real SEMPRE envia marQuantidadeRecebida em cada linha (pré-preenchida
  // com a quantidade declarada; o GET remoto vem com null antes da baixa —
  // captura cap_3012dde41ef83433f6). Sem isso a baixa em lote repassaria null.
  // As demais chaves das linhas (e seus sub-objetos) vão idênticas ao GET.
  const mergedResidues = mergeReceiptManifestResidues(remoteManifest, requestedManifest)
    .map((line) => (
      line.marQuantidadeRecebida == null
        ? { ...line, marQuantidadeRecebida: line.marQuantidade ?? null }
        : line
    ));

  const merged: LooseRecord = {
    ...remoteManifest,
    ...requestedManifest,
    manCodigo: remoteManifest.manCodigo ?? requestedManifest.manCodigo ?? matchedManifest?.manCodigo ?? null,
    manNumero: remoteManifest.manNumero ?? requestedManifest.manNumero ?? matchedManifest?.manNumero ?? null,
    manHashCode: remoteManifest.manHashCode ?? requestedManifest.manHashCode ?? matchedManifest?.manHashCode ?? null,
    // A captura prova que o portal mantém o parceiroAcesso do GET intocado
    // (é o código de acesso de quem CRIOU o MTR, não do destinador logado).
    parceiroAcesso: mergeOptionalRecord(remoteManifest.parceiroAcesso, requestedManifest.parceiroAcesso),
    parceiroGerador: mergeOptionalRecord(remoteManifest.parceiroGerador, requestedManifest.parceiroGerador),
    parceiroTransportador: mergeOptionalRecord(remoteManifest.parceiroTransportador, requestedManifest.parceiroTransportador),
    parceiroDestinador: mergeOptionalRecord(remoteManifest.parceiroDestinador, requestedManifest.parceiroDestinador),
    parceiroArmazenadorTemporario: mergeOptionalRecord(remoteManifest.parceiroArmazenadorTemporario, requestedManifest.parceiroArmazenadorTemporario),
    parceiroTransportadorArmazenadorTemporario: mergeOptionalRecord(
      remoteManifest.parceiroTransportadorArmazenadorTemporario,
      requestedManifest.parceiroTransportadorArmazenadorTemporario
    ),
    listaManifestoResiduo: mergedResidues
  };

  const projected: LooseRecord = {};
  for (const field of RECEIPT_MANIFEST_FIELDS) {
    const value = merged[field];
    if (value === undefined || value === null) {
      projected[field] = RECEIPT_MANIFEST_EMPTY_STRING_DEFAULTS.has(field) && value === undefined ? '' : value ?? null;
    } else {
      projected[field] = value;
    }
  }
  for (const partnerKey of RECEIPT_PARTNER_OBJECT_KEYS) {
    const partner = projected[partnerKey];
    if (partner && typeof partner === 'object' && !Array.isArray(partner)) {
      projected[partnerKey] = pickRecordFields(partner as LooseRecord, RECEIPT_PARTNER_FIELDS);
    }
  }
  return projected;
}

// São Paulo não tem horário de verão desde 2019 — offset fixo.
const SAO_PAULO_UTC_OFFSET = '-03:00';
const PORTAL_SLASH_TIMESTAMP_PATTERN = /^(\d{2})\/(\d{2})\/(\d{4})(?: (\d{2}:\d{2}:\d{2}))?$/;

/**
 * remDataRecebimento no fio é ISO-8601 UTC (date.toISOString() do Angular do
 * portal — captura cap_3012dde41ef83433f6: "2026-06-12T22:37:57.168Z").
 * ATENÇÃO: NÃO é "MM/DD/YYYY HH:mm:ss" — essa leitura anterior era artefato do
 * ConvertFrom-Json do PowerShell exibindo DateTime localizado; enviar nesse
 * formato derruba o binding da CETESB com 400. Conversões independentes do TZ
 * do processo: data/hora SEM offset é hora de São Paulo; data sem hora vira
 * meio-dia de São Paulo (parse UTC recuaria um dia); epoch numérico é
 * convertido; "DD/MM/YYYY" inequívoco (dia > 12) é reordenado; ambíguo com
 * ambos ≤ 12 é tratado como MM/DD (formato do portal). Valor não parseável é
 * repassado como veio (a CETESB devolve o erro estruturado).
 */
export function normalizeCetesbReceiptTimestamp(value: unknown, now: Date): string {
  if (typeof value === 'number' && Number.isFinite(value)) {
    return new Date(value).toISOString();
  }
  const raw = toNonEmptyString(value);
  if (!raw) {
    return now.toISOString();
  }
  if (/^\d{4}-\d{2}-\d{2}$/.test(raw)) {
    return new Date(`${raw}T12:00:00${SAO_PAULO_UTC_OFFSET}`).toISOString();
  }
  const slashMatch = raw.match(PORTAL_SLASH_TIMESTAMP_PATTERN);
  if (slashMatch) {
    let [, month, day] = slashMatch;
    const year = slashMatch[3];
    const time = slashMatch[4] || '12:00:00';
    if (Number(month) > 12 && Number(day) <= 12) {
      [month, day] = [day, month];
    }
    const candidate = new Date(`${year}-${month}-${day}T${time}${SAO_PAULO_UTC_OFFSET}`);
    return Number.isNaN(candidate.getTime()) ? raw : candidate.toISOString();
  }
  const noOffsetMatch = raw.match(/^(\d{4}-\d{2}-\d{2})[T ](\d{2}:\d{2}(?::\d{2}(?:\.\d+)?)?)$/);
  if (noOffsetMatch) {
    return new Date(`${noOffsetMatch[1]}T${noOffsetMatch[2]}${SAO_PAULO_UTC_OFFSET}`).toISOString();
  }
  const parsed = new Date(raw);
  return Number.isNaN(parsed.getTime()) ? raw : parsed.toISOString();
}

/**
 * Raiz do POST /api/mtr/manifesto/recebimento/ EXATAMENTE como o portal real
 * envia (captura cap_3012dde41ef83433f6): {manifesto, paaCodigo, remCodigo,
 * rrmCodigo, remObservacao, remDataRecebimento}. paaCodigo é o código de
 * ACESSO da sessão logada (session.userAccessCode — 57380 na captura), NÃO o
 * parCodigo do destinador (40110, usado só nos paths dos GETs); remCodigo é
 * null; remDataRecebimento é ISO-8601.
 */
export function buildReceiveRequestBody(input: {
  mergedManifestPayload: LooseRecord;
  accessPartnerCode: number;
  resolvedResponsibleCode: unknown;
  receiptPayload: LooseRecord;
  now?: Date;
}) {
  const { mergedManifestPayload, accessPartnerCode, resolvedResponsibleCode, receiptPayload } = input;
  return {
    manifesto: mergedManifestPayload,
    paaCodigo: accessPartnerCode,
    remCodigo: toNonEmptyString(receiptPayload.remCodigo) ?? null,
    rrmCodigo: resolvedResponsibleCode ?? receiptPayload.rrmCodigo ?? null,
    remObservacao: toNonEmptyString(receiptPayload.remObservacao) ?? '',
    remDataRecebimento: normalizeCetesbReceiptTimestamp(receiptPayload.remDataRecebimento, input.now ?? new Date())
  };
}

function describeManifestSelection(identifiers: { code?: unknown; number?: unknown; hash?: unknown }) {
  return toNonEmptyString(identifiers.code)
    || toNonEmptyString(identifiers.number)
    || toNonEmptyString(identifiers.hash)
    || 'manifesto_sem_identificador';
}

function selectCdfManifestList(receivedManifests: LooseRecord[], selectedManifestSnapshots: LooseRecord[]) {
  if (selectedManifestSnapshots.length === 0) {
    return receivedManifests;
  }

  const selectedManifests: LooseRecord[] = [];
  const missingSelections: string[] = [];

  for (const manifestSnapshot of selectedManifestSnapshots) {
    const identifiers = {
      code: manifestSnapshot.manCodigo,
      number: manifestSnapshot.manNumero,
      hash: manifestSnapshot.manHashCode
    };

    if (!hasIdentifiers(identifiers)) {
      missingSelections.push('manifesto_sem_identificador');
      continue;
    }

    const matchedManifest = findItemByIdentifiers(receivedManifests, identifiers, {
      code: ['manCodigo'],
      number: ['manNumero'],
      hash: ['manHashCode']
    });

    if (!matchedManifest) {
      missingSelections.push(describeManifestSelection(identifiers));
      continue;
    }

    if (!selectedManifests.includes(matchedManifest)) {
      selectedManifests.push(matchedManifest);
    }
  }

  if (missingSelections.length > 0) {
    throw buildRetryableError(
      `Nem todos os manifestos selecionados apareceram na pesquisa de CDF: ${missingSelections.join(', ')}.`,
      'TEMPORARILY_UNAVAILABLE'
    );
  }

  return selectedManifests;
}

function selectCdfCertificate(certificates: LooseRecord[], cdfPayload: LooseRecord, documentId?: string | null) {
  const identifiers = {
    code: cdfPayload.cerCodigo,
    number: cdfPayload.cerNumero,
    hash: documentId || cdfPayload.cerHashCode
  };

  const directMatch = findItemByIdentifiers(certificates, identifiers, {
    code: ['cerCodigo'],
    number: ['cerNumero'],
    hash: ['cerHashCode']
  });
  if (directMatch) {
    return directMatch;
  }

  const expectedStart = toNonEmptyString(cdfPayload.cerDataInicial);
  const expectedEnd = toNonEmptyString(cdfPayload.cerDataFinal);
  const expectedObservation = toNonEmptyString(cdfPayload.cerObservacao);

  return certificates.find((certificate) => {
    const sameStart = !expectedStart || toNonEmptyString(certificate.cerDataInicial) === expectedStart;
    const sameEnd = !expectedEnd || toNonEmptyString(certificate.cerDataFinal) === expectedEnd;
    const sameObservation = !expectedObservation || toNonEmptyString(certificate.cerObservacao) === expectedObservation;
    return sameStart && sameEnd && sameObservation;
  }) || certificates[0] || null;
}

async function handleManifestReceive(job: JobEntity, gateway: {
  listReceiptResponsibles: (options: LooseRecord) => Promise<unknown>;
  searchReceivableManifests: (options: LooseRecord) => Promise<unknown>;
  getRemoteManifest: (manCodigo: string | number, options: LooseRecord) => Promise<unknown>;
  receiveManifest: (options: LooseRecord) => Promise<unknown>;
  printManifestReceipt: (manHashCode: string, options: LooseRecord) => Promise<unknown>;
}) {
  const entity = await requireAsyncOperationEntity(job);
  const sessionContext = await resolveActiveSessionContext(job, entity);
  const integrationAccountId = entity.integrationAccountId;
  const receiptPayload = toRecord(entity.payload.receiptPayload || job.payload?.receiptPayload);
  const receiptIdentifiers = resolveReceiptManifestIdentifiers(receiptPayload);
  const effectivePartnerCode = toNumberOrNull(receiptPayload.paaCodigo) || toNumberOrNull(sessionContext.partnerCode);

  if (!effectivePartnerCode) {
    throw new Error('manifest.receive requires paaCodigo or active session partnerCode.');
  }

  await updateAsyncEntity(job, {
    status: 'running',
    sessionContextId: sessionContext.id,
    payload: {
      ...entity.payload,
      integrationAccountId,
      sessionContextId: sessionContext.id,
      receiptPayload: {
        ...receiptPayload,
        paaCodigo: effectivePartnerCode
      }
    },
    result: entity.result,
    lastSyncAt: nowIso()
  });

  const receiptResponsiblesExchange = toGatewayExchange(await gateway.listReceiptResponsibles({
    integrationAccountId,
    sessionContextId: sessionContext.id,
    partnerCode: effectivePartnerCode,
    correlationId: job.correlationId,
    includeAudit: true
  }));
  await logExchange(job, receiptResponsiblesExchange);

  const receiptResponsibles = toArrayOfRecords(receiptResponsiblesExchange.response.data?.items);
  const resolvedResponsible = findItemByIdentifiers(receiptResponsibles, {
    code: receiptPayload.rrmCodigo,
    number: null,
    hash: null
  }, {
    code: ['rrmCodigo'],
    number: [],
    hash: []
  }) || null;

  if (!resolvedResponsible && receiptPayload.rrmCodigo != null) {
    throw new Error(`Responsável de recebimento ${toNonEmptyString(receiptPayload.rrmCodigo) || 'informado'} não encontrado para o parceiro ${effectivePartnerCode}.`);
  }

  const receivableExchange = toGatewayExchange(await gateway.searchReceivableManifests({
    integrationAccountId,
    sessionContextId: sessionContext.id,
    partnerCode: effectivePartnerCode,
    correlationId: job.correlationId,
    includeAudit: true,
    dateFrom: toNonEmptyString(receiptPayload.dateFrom),
    dateTo: toNonEmptyString(receiptPayload.dateTo),
    // Fidelidade ao portal real (captura cap_3012dde41ef83433f6): com o número
    // conhecido, a CETESB filtra server-side (.../0/all/{manNumero}).
    manifestNumber: toNonEmptyString(receiptIdentifiers.number)
  }));
  await logExchange(job, receivableExchange);

  const receivableManifests = toArrayOfRecords(receivableExchange.response.data?.items);
  const matchedManifest = findItemByIdentifiers(receivableManifests, receiptIdentifiers, {
    code: ['manCodigo'],
    number: ['manNumero'],
    hash: ['manHashCode']
  });

  const manCodigo = toNonEmptyString(receiptIdentifiers.code) || toNonEmptyString(matchedManifest?.manCodigo);
  if (!manCodigo) {
    throw buildRetryableError('Manifesto de recebimento ainda não encontrado na pesquisa CETESB.', 'TEMPORARILY_UNAVAILABLE');
  }

  const remoteManifestExchange = toGatewayExchange(await gateway.getRemoteManifest(manCodigo, {
    integrationAccountId,
    sessionContextId: sessionContext.id,
    correlationId: job.correlationId,
    includeAudit: true
  }));
  await logExchange(job, remoteManifestExchange);

  const remoteManifest = toRecord(remoteManifestExchange.response.data?.item);
  const mergedManifestPayload = buildReceiptManifestPayload(remoteManifest, receiptPayload, matchedManifest, effectivePartnerCode);

  // Idempotência do POST: um retry deste job (ex.: falha ao baixar o comprovante)
  // NÃO pode re-enviar o recebimento — a CETESB já registrou a baixa na primeira
  // tentativa. O sucesso do POST fica persistido na entity ANTES de qualquer
  // passo que possa falhar e re-agendar o job.
  const priorReceiveConfirmation = toRecord(entity.payload.receiveConfirmation);
  let receiveMessage: unknown = priorReceiveConfirmation.message ?? null;

  if (!toNonEmptyString(priorReceiveConfirmation.confirmedAt)) {
    // paaCodigo da raiz = código de ACESSO da sessão (captura: 57380), com
    // fallback no parCodigo só se a sessão não tiver o access code.
    const accessPartnerCode = toNumberOrNull(sessionContext.userAccessCode) || effectivePartnerCode;
    const receiveExchange = toGatewayExchange(await gateway.receiveManifest({
      integrationAccountId,
      sessionContextId: sessionContext.id,
      correlationId: job.correlationId,
      includeAudit: true,
      payload: buildReceiveRequestBody({
        mergedManifestPayload,
        accessPartnerCode,
        resolvedResponsibleCode: resolvedResponsible?.rrmCodigo ?? null,
        receiptPayload
      })
    }));
    await logExchange(job, receiveExchange);
    receiveMessage = receiveExchange.response.data?.message ?? null;

    await updateAsyncEntity(job, {
      status: 'running',
      sessionContextId: sessionContext.id,
      payload: {
        ...entity.payload,
        integrationAccountId,
        sessionContextId: sessionContext.id,
        receiptPayload: {
          ...receiptPayload,
          paaCodigo: effectivePartnerCode
        },
        receiveConfirmation: {
          confirmedAt: nowIso(),
          manCodigo: mergedManifestPayload.manCodigo ?? null,
          manNumero: mergedManifestPayload.manNumero ?? null,
          message: receiveMessage
        }
      },
      result: entity.result,
      lastSyncAt: nowIso()
    });
  }

  const manifestHashCode = toNonEmptyString(mergedManifestPayload.manHashCode)
    || toNonEmptyString(matchedManifest?.manHashCode);

  // O checkbox "imprimir comprovante" agora é honrado (antes era flag morta:
  // o handler imprimia sempre). Ausência do flag mantém o comportamento de
  // imprimir; só `false` explícito pula o PDF.
  const shouldPrintReceipt = (entity.payload.printReceiptAfterReceive ?? job.payload?.printReceiptAfterReceive) !== false;
  let receiptDocument: { id: string; fileName: string | null; storagePath: string | null } | null = null;

  if (shouldPrintReceipt) {
    if (!manifestHashCode) {
      throw buildRetryableError('Manifesto recebido sem hash CETESB para baixar comprovante.', 'TEMPORARILY_UNAVAILABLE');
    }

    const receiptPdfExchange = toGatewayExchange(await gateway.printManifestReceipt(manifestHashCode, {
      integrationAccountId,
      sessionContextId: sessionContext.id,
      correlationId: job.correlationId,
      includeAudit: true
    }));
    await logExchange(job, receiptPdfExchange);

    const receiptPdfRaw = receiptPdfExchange.response.data?.pdfBuffer;
    if (!receiptPdfRaw) {
      throw buildRetryableError('Comprovante de recebimento não retornou PDF.', 'TEMPORARILY_UNAVAILABLE');
    }

    receiptDocument = requireStoredAsyncDocument(await storeAsyncOperationPdf({
      entityType: job.entityType,
      entityId: job.entityId,
      documentType: 'manifest_receipt_pdf',
      fileName: buildAsyncDocumentFileName('manifest_receipt', mergedManifestPayload.manNumero || mergedManifestPayload.manCodigo || job.entityId),
      pdfBuffer: Buffer.isBuffer(receiptPdfRaw) ? receiptPdfRaw : Buffer.from(receiptPdfRaw),
      hash: manifestHashCode,
      metadata: {
        manCodigo: mergedManifestPayload.manCodigo ?? null,
        manNumero: mergedManifestPayload.manNumero ?? null,
        documentKind: 'manifest_receipt'
      }
    }), 'Comprovante de recebimento não pôde ser persistido.');
  }

  const mirroredManifest = await upsertManifestFromExternalSearch({
    id: createPrefixedId('man'),
    integrationAccountId,
    sessionContextId: sessionContext.id,
    status: 'submitted',
    externalStatus: 'Recebido',
    externalReference: {
      manCodigo: toStringOrNumberOrNull(mergedManifestPayload.manCodigo),
      manNumero: toStringOrNumberOrNull(mergedManifestPayload.manNumero)
    },
    externalHashCode: manifestHashCode || null,
    payload: {
      externalSnapshot: mergedManifestPayload,
      receiptPayload
    },
    requestedBy: 'cetesb.receive',
    correlationId: job.correlationId,
    lastSyncAt: nowIso()
  });

  const receiveResult = {
    jobId: job.jobId,
    outcome: 'manifest_received',
    manCodigo: mergedManifestPayload.manCodigo ?? null,
    manNumero: mergedManifestPayload.manNumero ?? null,
    manHashCode: manifestHashCode || null,
    message: receiveMessage ?? null,
    manifestId: mirroredManifest?.id || null,
    documentId: receiptDocument?.id ?? null,
    fileName: receiptDocument?.fileName ?? null,
    storagePath: receiptDocument?.storagePath ?? null,
    responsibleCode: resolvedResponsible?.rrmCodigo ?? receiptPayload.rrmCodigo ?? null
  };

  await updateAsyncEntity(job, {
    status: 'succeeded',
    sessionContextId: sessionContext.id,
    payload: mergeEntityJobResult(entity.payload, job.operation, receiveResult),
    result: mergeEntityJobResult(entity.result, job.operation, receiveResult),
    lastSyncAt: nowIso()
  });

  await finishJob(job, {
    outcome: 'manifest_received',
    documentId: receiptDocument?.id ?? null,
    fileName: receiptDocument?.fileName ?? null
  });
}

async function resolveGeneratorPartnersForCdf(gateway: {
  searchCdfGeneratorPartner: (options: LooseRecord) => Promise<unknown>;
}, job: JobEntity, integrationAccountId: string, sessionContextId: string, cdfPayload: LooseRecord) {
  const explicitPartners = toArrayOfRecords(cdfPayload.listaParceiroGerador);
  if (explicitPartners.length > 0) {
    return explicitPartners;
  }

  const documents = Array.from(new Set([
    ...toArrayOfRecords(cdfPayload.listaManifesto).map((item) => toNonEmptyString(toRecord(item.parceiroGerador).parCnpj)).filter(Boolean),
    ...toArrayOfRecords(cdfPayload.generatorPartners).map((item) => toNonEmptyString(item.document)).filter(Boolean),
    ...((Array.isArray(cdfPayload.generatorPartnerDocuments) ? cdfPayload.generatorPartnerDocuments : [])
      .map((item) => toNonEmptyString(item))
      .filter(Boolean))
  ]));

  const resolvedPartners: LooseRecord[] = [];
  for (const document of documents) {
    const partnerExchange = toGatewayExchange(await gateway.searchCdfGeneratorPartner({
      integrationAccountId,
      sessionContextId,
      correlationId: job.correlationId,
      includeAudit: true,
      document
    }));
    await logExchange(job, partnerExchange);
    const items = toArrayOfRecords(partnerExchange.response.data?.items);
    if (items[0]) {
      resolvedPartners.push(items[0]);
    }
  }

  return resolvedPartners;
}

async function handleCdfGenerate(job: JobEntity, gateway: {
  listCdfResponsibles: (options: LooseRecord) => Promise<unknown>;
  searchCdfGeneratorPartner: (options: LooseRecord) => Promise<unknown>;
  searchReceivedManifestsForCdf: (options: LooseRecord) => Promise<unknown>;
  generateCdf: (options: LooseRecord) => Promise<unknown>;
  searchCdfCertificates: (options: LooseRecord) => Promise<unknown>;
  printCdfCertificate: (cerHashCode: string, options: LooseRecord) => Promise<unknown>;
}) {
  const entity = await requireAsyncOperationEntity(job);
  const sessionContext = await resolveActiveSessionContext(job, entity);
  const integrationAccountId = entity.integrationAccountId;
  const cdfPayload = toRecord(entity.payload.cdfPayload || job.payload?.cdfPayload);
  const dateWindow = resolveCdfDateWindow(cdfPayload);
  const partnerCode = toNumberOrNull(toRecord(cdfPayload.parceiroDestinador).parCodigo) || toNumberOrNull(sessionContext.partnerCode);

  if (!partnerCode) {
    throw new Error('cdf.generate requires parceiroDestinador.parCodigo or active session partnerCode.');
  }

  await updateAsyncEntity(job, {
    status: 'running',
    sessionContextId: sessionContext.id,
    payload: {
      ...entity.payload,
      integrationAccountId,
      sessionContextId: sessionContext.id,
      cdfPayload
    },
    result: entity.result,
    lastSyncAt: nowIso()
  });

  const responsiblesExchange = toGatewayExchange(await gateway.listCdfResponsibles({
    integrationAccountId,
    sessionContextId: sessionContext.id,
    partnerCode,
    correlationId: job.correlationId,
    includeAudit: true
  }));
  await logExchange(job, responsiblesExchange);

  const responsibles = toArrayOfRecords(responsiblesExchange.response.data?.items);
  const resolvedResponsible = findItemByIdentifiers(responsibles, {
    code: toRecord(cdfPayload.responsavel).cdrCodigo,
    number: null,
    hash: null
  }, {
    code: ['cdrCodigo'],
    number: [],
    hash: []
  }) || null;
  const requestedResponsibleCode = toStringOrNumberOrNull(toRecord(cdfPayload.responsavel).cdrCodigo);

  if (!resolvedResponsible && requestedResponsibleCode != null) {
    throw new Error(`Responsável CDF ${requestedResponsibleCode} não encontrado.`);
  }

  const generatorPartners = await resolveGeneratorPartnersForCdf(gateway, job, integrationAccountId, sessionContext.id, cdfPayload);

  const receivedManifestsExchange = toGatewayExchange(await gateway.searchReceivedManifestsForCdf({
    integrationAccountId,
    sessionContextId: sessionContext.id,
    partnerCode,
    correlationId: job.correlationId,
    includeAudit: true,
    dateFrom: dateWindow.dateFrom,
    dateTo: dateWindow.dateTo,
    generatorPartners
  }));
  await logExchange(job, receivedManifestsExchange);

  const receivedManifests = toArrayOfRecords(receivedManifestsExchange.response.data?.items);
  const selectedManifestSnapshots = toArrayOfRecords(cdfPayload.listaManifesto);
  const effectiveManifestList = selectCdfManifestList(receivedManifests, selectedManifestSnapshots);

  if (effectiveManifestList.length === 0) {
    throw new Error('Nenhum manifesto recebido encontrado para gerar CDF.');
  }

  const generateExchange = toGatewayExchange(await gateway.generateCdf({
    integrationAccountId,
    sessionContextId: sessionContext.id,
    correlationId: job.correlationId,
    includeAudit: true,
    payload: {
      ...cdfPayload,
      parceiroDestinador: {
        ...toRecord(cdfPayload.parceiroDestinador),
        parCodigo: partnerCode
      },
      listaParceiroGerador: generatorPartners,
      listaManifesto: effectiveManifestList,
      responsavel: resolvedResponsible || toRecord(cdfPayload.responsavel)
    }
  }));
  await logExchange(job, generateExchange);

  const certificatesExchange = toGatewayExchange(await gateway.searchCdfCertificates({
    integrationAccountId,
    sessionContextId: sessionContext.id,
    partnerCode,
    correlationId: job.correlationId,
    includeAudit: true,
    dateFrom: dateWindow.dateFrom,
    dateTo: dateWindow.dateTo
  }));
  await logExchange(job, certificatesExchange);

  const certificates = toArrayOfRecords(certificatesExchange.response.data?.items);
  const selectedCertificate = selectCdfCertificate(certificates, cdfPayload);
  const certificateHash = toNonEmptyString(selectedCertificate?.cerHashCode);

  if (!certificateHash) {
    throw buildRetryableError('CDF gerado mas certificado ainda não apareceu na listagem para download.', 'TEMPORARILY_UNAVAILABLE');
  }

  const printExchange = toGatewayExchange(await gateway.printCdfCertificate(certificateHash, {
    integrationAccountId,
    sessionContextId: sessionContext.id,
    correlationId: job.correlationId,
    includeAudit: true
  }));
  await logExchange(job, printExchange);

  const pdfRaw = printExchange.response.data?.pdfBuffer;
  if (!pdfRaw) {
    throw buildRetryableError(`CDF ${certificateHash} não retornou PDF binário.`, 'TEMPORARILY_UNAVAILABLE');
  }

  const document = requireStoredAsyncDocument(await storeAsyncOperationPdf({
    entityType: job.entityType,
    entityId: job.entityId,
    documentType: 'cdf_pdf',
    fileName: buildAsyncDocumentFileName('cdf', selectedCertificate?.cerCodigo || certificateHash),
    pdfBuffer: Buffer.isBuffer(pdfRaw) ? pdfRaw : Buffer.from(pdfRaw),
    hash: certificateHash,
    metadata: {
      cerCodigo: selectedCertificate?.cerCodigo ?? null,
      cerData: selectedCertificate?.cerData ?? null,
      tipoCertificadoDestinacao: toRecord(selectedCertificate?.tipoCertificadoDestinacao).tcdCodigo ?? null,
      documentKind: 'cdf'
    }
  }), 'PDF do CDF gerado não pôde ser persistido.');

  const generateResult = {
    jobId: job.jobId,
    outcome: 'cdf_generated',
    certificateHashCode: certificateHash,
    certificateCode: selectedCertificate?.cerCodigo ?? null,
    totalManifests: effectiveManifestList.length,
    totalGeneratorPartners: generatorPartners.length,
    message: generateExchange.response.data?.message ?? null,
    documentId: document.id,
    fileName: document.fileName,
    printUrl: document.downloadUrl
  };

  await updateAsyncEntity(job, {
    status: 'succeeded',
    sessionContextId: sessionContext.id,
    payload: mergeEntityJobResult(entity.payload, job.operation, generateResult),
    result: mergeEntityJobResult(entity.result, job.operation, generateResult),
    lastSyncAt: nowIso()
  });

  await finishJob(job, {
    outcome: 'cdf_generated',
    documentId: document.id,
    printUrl: document.downloadUrl
  });
}

async function handleCdfDownload(job: JobEntity, gateway: {
  searchCdfCertificates: (options: LooseRecord) => Promise<unknown>;
  printCdfCertificate: (cerHashCode: string, options: LooseRecord) => Promise<unknown>;
}) {
  const entity = await requireAsyncOperationEntity(job);
  const sessionContext = await resolveActiveSessionContext(job, entity);
  const integrationAccountId = entity.integrationAccountId;
  const documentId = toNonEmptyString(entity.payload.documentId || job.payload?.documentId);
  const certificateCriteria = toRecord(entity.payload.certificateCriteria || job.payload?.certificateCriteria);

  if (!documentId) {
    throw new Error('cdf.download requires documentId.');
  }

  await updateAsyncEntity(job, {
    status: 'running',
    sessionContextId: sessionContext.id,
    payload: {
      ...entity.payload,
      integrationAccountId,
      sessionContextId: sessionContext.id,
      documentId,
      certificateCriteria
    },
    result: entity.result,
    lastSyncAt: nowIso()
  });

  const certificatesExchange = toGatewayExchange(await gateway.searchCdfCertificates({
    integrationAccountId,
    sessionContextId: sessionContext.id,
    partnerCode: toNumberOrNull(sessionContext.partnerCode),
    correlationId: job.correlationId,
    includeAudit: true,
    dateFrom: toNonEmptyString(certificateCriteria.dateFrom || certificateCriteria.cerDataInicial || entity.payload.dateFrom || job.payload?.dateFrom),
    dateTo: toNonEmptyString(certificateCriteria.dateTo || certificateCriteria.cerDataFinal || entity.payload.dateTo || job.payload?.dateTo)
  }));
  await logExchange(job, certificatesExchange);

  const certificates = toArrayOfRecords(certificatesExchange.response.data?.items);
  const selectedCertificate = selectCdfCertificate(certificates, certificateCriteria, documentId);
  const certificateHash = toNonEmptyString(selectedCertificate?.cerHashCode) || documentId;

  const printExchange = toGatewayExchange(await gateway.printCdfCertificate(certificateHash, {
    integrationAccountId,
    sessionContextId: sessionContext.id,
    correlationId: job.correlationId,
    includeAudit: true
  }));
  await logExchange(job, printExchange);

  const pdfRaw = printExchange.response.data?.pdfBuffer;
  if (!pdfRaw) {
    throw buildRetryableError(`CDF ${certificateHash} não retornou PDF binário.`, 'TEMPORARILY_UNAVAILABLE');
  }

  const document = requireStoredAsyncDocument(await storeAsyncOperationPdf({
    entityType: job.entityType,
    entityId: job.entityId,
    documentType: 'cdf_pdf',
    fileName: buildAsyncDocumentFileName('cdf', selectedCertificate?.cerCodigo || certificateHash),
    pdfBuffer: Buffer.isBuffer(pdfRaw) ? pdfRaw : Buffer.from(pdfRaw),
    hash: certificateHash,
    metadata: {
      cerCodigo: selectedCertificate?.cerCodigo ?? null,
      cerData: selectedCertificate?.cerData ?? null,
      documentKind: 'cdf'
    }
  }), 'PDF do CDF baixado não pôde ser persistido.');

  const downloadResult = {
    jobId: job.jobId,
    outcome: 'cdf_downloaded',
    certificateHashCode: certificateHash,
    certificateCode: selectedCertificate?.cerCodigo ?? null,
    documentId: document.id,
    fileName: document.fileName,
    printUrl: document.downloadUrl
  };

  await updateAsyncEntity(job, {
    status: 'succeeded',
    sessionContextId: sessionContext.id,
    payload: mergeEntityJobResult(entity.payload, job.operation, downloadResult),
    result: mergeEntityJobResult(entity.result, job.operation, downloadResult),
    lastSyncAt: nowIso()
  });

  await finishJob(job, {
    outcome: 'cdf_downloaded',
    documentId: document.id,
    printUrl: document.downloadUrl
  });
}

async function handleCatalogSync(job: JobEntity, gateway: { constructor: { name: string } }) {
  const result = await query('select * from catalog_sync_requests where id = $1', [job.entityId]);
  const syncRequest = result.rows[0];
  if (!syncRequest) throw new Error(`Catalog sync ${job.entityId} not found`);

  await query('update catalog_sync_requests set status = $2, updated_at = now() where id = $1', [job.entityId, 'running']);
  await insertAuditEntry({
    correlationId: String(job.correlationId || ''),
    entityType: 'catalogSync',
    entityId: job.entityId,
    direction: 'outbound',
    component: 'catalog-sync-worker',
    httpMethod: 'GET',
    endpoint: 'https://mtrr.cetesb.sp.gov.br/*',
    sanitizedHeaders: {},
    sanitizedBody: job.payload
  });

  const execution = await runCatalogSync({ id: syncRequest.id, integrationAccountId: syncRequest.integration_account_id }, job.payload, gateway as unknown as { fetchCatalogs: (names: string[], options?: { integrationAccountId?: string | null; sessionContextId?: string | null; }) => Promise<Array<{ name: string; source?: string | null; error?: unknown; items?: Array<Record<string, unknown>>; }>> });

  await insertAuditEntry({
    correlationId: String(job.correlationId || ''),
    entityType: 'catalogSync',
    entityId: job.entityId,
    direction: 'inbound',
    component: 'catalog-sync-worker',
    httpMethod: 'GET',
    endpoint: 'https://mtrr.cetesb.sp.gov.br/*',
    httpStatus: 200,
    latencyMs: 45,
    sanitizedHeaders: { 'content-type': 'application/json' },
    sanitizedBody: execution
  });

  await finishJob(job, { outcome: 'catalog_sync_completed', version: execution.version });
}

async function handleCadastroSubmit(job: JobEntity, gateway: { submitCadastro: (cadastro: unknown) => Promise<unknown> }) {
  const cadastro = await findCadastroById(job.entityId);
  if (!cadastro) throw new Error(`Cadastro ${job.entityId} not found`);

  await updateCadastro(cadastro.id, { status: 'submitting' });
  const exchange = toGatewayExchange(await gateway.submitCadastro(cadastro));
  await logExchange(job, exchange);

  const previousExternalResponse = isObject(cadastro.externalResponse) ? cadastro.externalResponse : {};
  const externalResponse = {
    ...previousExternalResponse,
    latestGatewayResponse: exchange.response.sanitizedBody,
    jobResult: {
      jobId: job.jobId,
      outcome: 'cadastro_submitted',
      updatedAt: nowIso()
    }
  };

  await updateCadastro(cadastro.id, { status: 'submitted', externalResponse });
  await finishJob(job, { outcome: 'cadastro_submitted' });
}

// ---------------------------------------------------------------------------
// DMR (cadeia `dmr-fluxo-base`, fase 05-persistence-queue)
//
// O gateway DMR está em modo stub (DL-093 + Caminho B em
// docs/handoffs/dmr-fluxo-base/02-source-validation.md §8) e levanta
// `AppError(503)` com `code = DMR_GATEWAY_PENDING_HAR` enquanto não houver HAR
// real. O handler trata isso como **pendência funcional**, não como falha
// técnica:
//   - persiste `dmr_declarations.status = 'failed_remote'` com
//     `last_error_code = 'DMR_GATEWAY_PENDING_HAR'`;
//   - finaliza o job com `outcome = 'dmr_submit_pending_har'` (sem retry / sem
//     DLQ — não relança o erro);
//   - registra exchange de auditoria mínima (request snapshot + erro tipado).
//
// Quando a fase 03-external-integration for reaberta e o gateway passar a
// retornar exchange real, o caminho feliz abaixo (após o try/catch) entra em
// vigor sem precisar refatorar o dispatcher.
// ---------------------------------------------------------------------------
async function handleDmrSubmit(job: JobEntity, gateway: {
  submitDmr?: (params?: {
    dmrId: string;
    payload?: unknown;
    sessionContextId?: string | null;
    integrationAccountId?: string | null;
    correlationId?: string | null;
  }) => Promise<unknown>;
}) {
  const dmr = await findDmrById(job.entityId);
  if (!dmr) throw new Error(`DMR ${job.entityId} not found`);

  if (typeof gateway.submitDmr !== 'function') {
    throw new TypeError('Gateway does not implement submitDmr');
  }

  const sessionContextId = toNonEmptyString(job.payload?.sessionContextId) || dmr.sessionContextId;
  const integrationAccountId = toNonEmptyString(job.payload?.integrationAccountId) || dmr.integrationAccountId;

  // Marca DMR como `submitting` (locking otimista) antes de bater no gateway.
  let workingVersion = dmr.version;
  const submittingDmr = await updateDmrStatus(
    dmr.id,
    {
      status: 'submitting' as DmrStatus,
      sessionContextId: sessionContextId || null,
      attempts: (dmr.attempts ?? 0) + 1
    },
    workingVersion
  );
  workingVersion = submittingDmr.version;

  // Audit: outbound (request snapshot — gateway DMR ainda não tem corpo real).
  await insertAuditEntry({
    correlationId: String(job.correlationId || ''),
    entityType: 'dmr',
    entityId: dmr.id,
    direction: 'outbound',
    component: 'cetesb-gateway',
    httpMethod: 'POST',
    endpoint: '/sicat/dmr/submit (stub-pending-har)',
    sanitizedHeaders: {},
    sanitizedBody: {
      dmrId: dmr.id,
      sessionContextId: sessionContextId || null,
      integrationAccountId: integrationAccountId || null,
      correlationId: job.correlationId || null
    }
  });

  try {
    const rawResponse = await gateway.submitDmr({
      dmrId: dmr.id,
      payload: dmr.payloadSnapshot,
      sessionContextId: sessionContextId || null,
      integrationAccountId: integrationAccountId || null,
      correlationId: job.correlationId || null
    });

    // Caminho feliz: gateway real retornará um exchange ou objeto com dados
    // de protocolo. Estrutura aproximada (será definida pela fase 03 real).
    const responseRecord = isObject(rawResponse) ? rawResponse : {};
    const data = isObject(responseRecord.data) ? responseRecord.data : responseRecord;

    const protocolNumber = toNonEmptyString(data.protocolNumber)
      || toNonEmptyString(data.protocolo)
      || null;
    const remoteReference = toNonEmptyString(data.remoteReference)
      || toNonEmptyString(data.referenciaRemota)
      || null;

    const nextStatus: DmrStatus = protocolNumber ? 'submitted' : 'awaiting_remote';

    await updateDmrStatus(
      dmr.id,
      {
        status: nextStatus,
        protocolNumber,
        remoteReference,
        submittedAt: protocolNumber ? nowIso() : null,
        lastErrorCode: null,
        lastErrorDetail: null
      },
      workingVersion
    );

    // Audit: inbound.
    await insertAuditEntry({
      correlationId: String(job.correlationId || ''),
      entityType: 'dmr',
      entityId: dmr.id,
      direction: 'inbound',
      component: 'cetesb-gateway',
      httpMethod: 'POST',
      endpoint: '/sicat/dmr/submit',
      httpStatus: 200,
      sanitizedHeaders: {},
      sanitizedBody: data
    });

    await finishJob(job, {
      outcome: protocolNumber ? 'dmr_submitted' : 'dmr_awaiting_remote',
      protocolNumber,
      remoteReference
    });
    return;
  } catch (error: unknown) {
    const errorCode = (error instanceof AppError && error.code) || getErrorCode(error);
    const errorMessage = getErrorMessage(error);
    const errorStatus = error instanceof AppError ? error.status : null;

    // Caso esperado da fase 05: gateway stub retorna AppError(503)
    // com code=DMR_GATEWAY_PENDING_HAR. Pendência funcional — NÃO sobe DLQ.
    if (errorCode === 'DMR_GATEWAY_PENDING_HAR' || errorStatus === 503) {
      await updateDmrStatus(
        dmr.id,
        {
          status: 'failed_remote' as DmrStatus,
          lastErrorCode: 'DMR_GATEWAY_PENDING_HAR',
          lastErrorDetail: {
            reason: 'gateway-stub-pending-har',
            message: errorMessage,
            httpStatus: errorStatus ?? 503
          }
        },
        workingVersion
      );

      await insertAuditEntry({
        correlationId: String(job.correlationId || ''),
        entityType: 'dmr',
        entityId: dmr.id,
        direction: 'inbound',
        component: 'cetesb-gateway',
        httpMethod: 'POST',
        endpoint: '/sicat/dmr/submit (stub-pending-har)',
        httpStatus: 503,
        sanitizedHeaders: {},
        sanitizedBody: {
          code: 'DMR_GATEWAY_PENDING_HAR',
          message: errorMessage
        }
      });

      // Finaliza job como sucedido (operação concluída do ponto de vista do
      // worker — pendência é funcional, não técnica). Sem retry, sem DLQ.
      await finishJob(job, {
        outcome: 'dmr_submit_pending_har',
        lastErrorCode: 'DMR_GATEWAY_PENDING_HAR'
      });
      return;
    }

    // Outros erros: persistir failed_remote e relançar para o job-runner
    // decidir sobre retry/DLQ conforme política padrão.
    try {
      await updateDmrStatus(
        dmr.id,
        {
          status: 'failed_remote' as DmrStatus,
          lastErrorCode: errorCode || 'DMR_SUBMIT_GATEWAY_ERROR',
          lastErrorDetail: {
            message: errorMessage,
            httpStatus: errorStatus
          }
        },
        workingVersion
      );
    } catch {
      // best-effort — não mascarar o erro original
    }
    throw error;
  }
}


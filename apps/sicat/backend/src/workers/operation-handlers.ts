import { createWriteStream } from 'node:fs';
import path from 'node:path';
import { ZipFile } from 'yazl';
import { insertAuditEntry } from '../repositories/audit-repo.js';
import { findJobById, insertJob, updateJob, updateJobIfOwned } from '../repositories/job-repo.js';
import {
  findManifestById,
  listManifestDocuments,
  listUnconfirmedSubmitManifestsForReconciliation,
  updateManifest,
  upsertManifestFromExternalSearch
} from '../repositories/manifest-repo.js';
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
import { buildManifestCorrelationMarker } from '../lib/manifest-correlation.js';
import { isTransientManifestSubmitStatus } from '../lib/manifest-submit-status.js';
import {
  resolveManifestSubmitReconcilePatch,
  type GatewaySearchManifestsArgs,
  type ManifestSubmitReconcileDeps,
  type ManifestSubmitReconcilePatch
} from '../services/manifest-submit-reconciler.js';
import { calculateJobPriority, extractJobTags, getRetryConfig } from '../lib/retry.js';
import { patchJobPayload } from './job-payload-patch.js';
import { findConversationChannelLinkForChannel } from '../repositories/conversation-channel-link-repo.js';
import { runWhatsAppInboundTurn } from '../services/conversation/channel/whatsapp/whatsapp-turn-service.js';
import { runWhatsAppOutboundNotice } from '../services/conversation/channel/whatsapp/whatsapp-outbound-notice-service.js';
import { resolveWhatsAppProvider } from '../services/conversation/channel/whatsapp/index.js';
import { buildWhatsAppTerminalFailureNotice } from '../services/conversation/channel/whatsapp/whatsapp-reply-composer.js';
import { runRntrcVerificationJob } from '../services/transport-rntrc-verification-service.js';
import { completeVerificationFailed } from '../repositories/rntrc-verification-repo.js';
import {
  runCiotRegisterJob,
  runCiotRectifyJob,
  runCiotCancelJob,
  runCiotCloseJob,
  runCiotReconcileJob
} from '../services/transport-ciot-service.js';

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

// A mensagem de falha de submit vive em `lib/manifest-submit-status.ts` — fonte
// ÚNICA, compartilhada com `services/manifest-service.ts`. Antes eram duas
// quase-duplicatas com textos diferentes e o MESMO defeito: mandavam reenviar
// sem nunca perguntar à CETESB se o MTR já tinha nascido.

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

// C1: intenção de submit persistida ANTES do PUT na CETESB — fecha a janela
// cega entre `status: 'submitting'` e o commit da resposta. O marcador é
// determinístico (derivado do id local, via lib/manifest-correlation) e é o
// MESMO que o gateway grava em `manObservacao`; se o processo morrer com a
// resposta perdida, a linha local sabe qual marcador procurar depois no
// resultado de `searchManifests`. Sem migration: vive no payload (jsonb).
function buildPayloadWithSubmitIntent(existingPayload: unknown, marker: string, jobId: string): LooseRecord {
  return {
    ...toRecord(existingPayload),
    submitCorrelation: {
      marker,
      jobId,
      dispatchedAt: nowIso()
    }
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

/**
 * O ramo provisório pode CONFIRMAR pela pesquisa, mas não pode concluir
 * AUSÊNCIA por ela.
 *
 * Motivo medido (não suposto): `searchManifests` monta o path com
 * `tipoManifesto` 8/5/9 conforme o tipo da conta (`resolveManifestSearchTipo`
 * em `src/gateways/cetesb-gateway.js`), enquanto o provisório é enviado com
 * `tipoManifesto = 2` (`PROVISORIO_TIPO_MANIFESTO_OVERRIDE`, em
 * `src/services/mtr-provisorio-service.ts`). Achar o marcador é prova de que o
 * MTR NASCEU; não achar não é prova de que não nasceu — é só "esta pesquisa não
 * o alcança". Por isso `allowTerminalFailure` fica FALSE aqui: só o desfecho
 * `found` tem autoridade neste ramo.
 *
 * Ligar esta constante exige antes uma pesquisa provisório-aware no gateway
 * (`tipoManifesto` do provisório na busca) — fora do escopo desta unidade.
 */
export const PROVISORIO_SUBMIT_RECONCILE_ALLOWS_TERMINAL_FAILURE = false;

/**
 * Traduz o patch do reconciliador (taxonomia do manifesto definitivo) para a
 * taxonomia do provisório (`MtrProvisorioStatus`). Função PURA e total sobre os
 * quatro desfechos possíveis do reconciliador — testável sem banco e sem CETESB.
 *
 * A correção que ela carrega: o ramo provisório gravava `failed_submit` sem
 * nunca perguntar nada. "Falhou" e "não sei" são fatos diferentes, e o operador
 * lê a diferença: `failed_submit` cai em `failed_*` no mapa operacional
 * (`src/lib/operational-status.ts`), enquanto `awaiting_remote` cai em
 * `awaiting_remote_confirmation` — que é literalmente o que aconteceu quando o
 * PUT saiu e a resposta se perdeu. `awaiting_remote` NÃO é estado novo: o
 * próprio `handleMtrProvisorioSubmit` já o usa quando o PUT responde sem
 * resolver `manCodigo`/`manNumero`.
 *
 * ⚠️ CORREÇÃO DE UMA AFIRMAÇÃO QUE CIRCULOU: a tabela de transições em
 * `src/lib/validators/mtr-provisorio-validator.ts` declara `failed_submit →
 * queued_submit` como permitida e `awaiting_remote → queued_submit` como
 * proibida, mas ela NÃO impede reenvio nenhum hoje — `validateStatusTransition`
 * daquele módulo não tem chamador em `src/` (o repo escreve o status direto), e
 * o provisório nem sequer tem rota de reenvio: `createMtrProvisorioService`
 * sempre cria um registro NOVO. A tabela documenta a intenção; o que protege o
 * operador aqui é o RÓTULO e a mensagem de `external_status`, não a máquina.
 */
export function mapManifestSubmitReconcilePatchToProvisorioStatus(
  patch: Pick<ManifestSubmitReconcilePatch, 'status' | 'confirmed'>
): MtrProvisorioRecord['status'] {
  if (patch.confirmed) {
    // `submitted` só sai do reconciliador com manCodigo + manNumero +
    // manHashCode (a constraint `chk_manifest_submitted_integrity` exige o
    // hash). O `processing` do ramo definitivo — "a CETESB reconheceu, a
    // identidade ainda não fechou" — chama-se `awaiting_remote` aqui.
    return patch.status === 'submitted' ? 'submitted' : 'awaiting_remote';
  }
  // `failed` só chega com ausência PROVADA (allowTerminalFailure = true).
  if (patch.status === 'failed') return 'failed_submit';
  // `submit_unconfirmed` = não sei. Nunca `failed_submit`.
  return 'awaiting_remote';
}

export async function applyManifestSubmitTerminalFailureSideEffect(
  job: JobEntity,
  terminalFailure: TerminalFailure = {},
  error: unknown = null,
  deps: ManifestSubmitReconcileDeps = {}
) {
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

  const technicalCause = summarizeTechnicalCause(
    terminalFailure.patch?.lastErrorMessage
    || terminalFailure.dlqReason
    || getErrorMessage(error)
    || job.lastErrorMessage
  );

  // R3-C: para `mtr_provisorio`, usar o repo provisório dedicado (preserva
  // locking otimista). Este ramo agora PERGUNTA à CETESB antes de rotular,
  // pelo mesmo reconciliador do ramo definitivo — ele é puro e recebe o
  // `searchManifests` que o job-runner já injeta nesta mesma chamada. O
  // marcador de correlação existe aqui: `handleMtrProvisorioSubmit` grava
  // `payload.submitCorrelation` no MESMO update que move para `submitting`,
  // antes do PUT.
  if (job.entityType === 'mtr_provisorio') {
    const record = await findMtrProvisorioById(job.entityId);
    if (!record) return null;
    if (!isTransientManifestSubmitStatus(record.status)) {
      return null;
    }

    const reconcilePatch = await resolveManifestSubmitReconcilePatch(record, deps, {
      allowTerminalFailure: PROVISORIO_SUBMIT_RECONCILE_ALLOWS_TERMINAL_FAILURE,
      terminalAction,
      technicalCause,
      correlationId: job.correlationId ?? null
    });
    const provisorioStatus = mapManifestSubmitReconcilePatchToProvisorioStatus(reconcilePatch);
    const confirmedManNumero = reconcilePatch.externalReference?.manNumero ?? null;

    const payloadWithResult = mergeEntityJobResult(record.payload, 'manifest.submit', {
      jobId: job.jobId,
      outcome: reconcilePatch.confirmed
        ? 'manifest_submit_confirmed_by_reconcile'
        : (provisorioStatus === 'failed_submit' ? 'manifest_submit_failed' : 'manifest_submit_unconfirmed'),
      kind: 'provisorio',
      status: provisorioStatus,
      externalStatus: reconcilePatch.externalStatus,
      terminalAction,
      lastErrorCode: terminalFailure.patch?.lastErrorCode || job.lastErrorCode || null,
      lastErrorMessage: technicalCause,
      // Reenviar só é seguro quando a pesquisa PROVOU que o MTR não nasceu — o
      // que hoje este ramo nunca conclui (ver a constante logo acima).
      retriable: provisorioStatus === 'failed_submit' && terminalAction !== 'failed'
    });

    return updateMtrProvisorioStatus(
      record.id,
      {
        status: provisorioStatus,
        externalStatus: reconcilePatch.externalStatus,
        ...(reconcilePatch.externalHashCode ? { externalHashCode: reconcilePatch.externalHashCode } : {}),
        ...(reconcilePatch.externalReference ? { externalReference: reconcilePatch.externalReference } : {}),
        ...(confirmedManNumero != null ? { provisionalNumber: String(confirmedManNumero) } : {}),
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

  if (!isTransientManifestSubmitStatus(manifest.status)) {
    return null;
  }

  // AQUI estava o defeito: gravava `status: 'failed'` + "revise os dados e
  // reenfileire o envio" sem NUNCA perguntar à CETESB. Quando a resposta do PUT
  // se perdia depois de o MTR nascer, o operador lia "reenvie", reenviava, e a
  // CETESB ganhava um SEGUNDO MTR real. Orçamento de polling cheio: este
  // caminho já roda fora do ciclo de request, no worker.
  const reconcilePatch = await resolveManifestSubmitReconcilePatch(manifest, deps, {
    allowTerminalFailure: true,
    terminalAction,
    technicalCause,
    correlationId: job.correlationId ?? null
  });

  const payloadWithResult = mergeEntityJobResult(manifest.payload, 'manifest.submit', {
    jobId: job.jobId,
    outcome: reconcilePatch.confirmed ? 'manifest_submit_confirmed_by_reconcile' : 'manifest_submit_failed',
    status: reconcilePatch.status,
    externalStatus: reconcilePatch.externalStatus,
    terminalAction,
    lastErrorCode: terminalFailure.patch?.lastErrorCode || job.lastErrorCode || null,
    lastErrorMessage: technicalCause,
    // Reenviar só é seguro quando a pesquisa PROVOU que o MTR não nasceu.
    retriable: !reconcilePatch.confirmed && reconcilePatch.status === 'failed' && terminalAction !== 'failed'
  });

  return updateManifest(manifest.id, {
    status: reconcilePatch.status,
    externalStatus: reconcilePatch.externalStatus,
    externalHashCode: reconcilePatch.externalHashCode ?? null,
    ...(reconcilePatch.externalReference ? { externalReference: reconcilePatch.externalReference } : {}),
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

/**
 * Mensagem recebida no WhatsApp (fase 3 da cadeia `whatsapp-channel-sicat`).
 *
 * O corpo do turno vive em `whatsapp-turn-service.ts`; aqui só a costura com a fila. Todo desfecho de
 * NEGÓCIO — vínculo revogado, mensagem expirada, já respondida, disposição estática, timeout — volta
 * como `{ outcome }` e termina com `finishJob`, no molde do `DMR_GATEWAY_PENDING_HAR`. Um `Error`
 * cru seria classificado como RETENTÁVEL por `isRetryableJobError` (`retry.ts` devolve `true` quando
 * não reconhece a mensagem) e viraria retry + DLQ com o rastro da mensagem do usuário.
 */
async function handleWhatsAppInboundMessage(job: JobEntity) {
  const result = await runWhatsAppInboundTurn({
    job: {
      jobId: job.jobId,
      entityId: job.entityId,
      correlationId: job.correlationId ?? null,
      claimedBy: job.claimedBy ?? null,
      payload: job.payload
    },
    patchJobPayload: (target, patch) => patchJobPayload(target, patch)
  });

  await finishJob(job, { outcome: result.outcome, ...result.patch });
}

/**
 * Aviso de conclusão de ação confirmada no WhatsApp (fase 6).
 *
 * Costura com a fila, no mesmo molde do handler acima: o corpo vive em
 * `whatsapp-outbound-notice-service.ts` e todo desfecho de NEGÓCIO — vínculo revogado, vínculo
 * transferido, janela fechada, canal desligado, não-entregue na última tentativa — volta como
 * `{ outcome }` e termina em `finishJob`.
 *
 * O ÚNICO erro que sobe daqui é o reagendamento (`WHATSAPP_NOTICE_NOT_READY`, retentável) e a falha
 * de envio fora da última tentativa. Na última tentativa o serviço nunca lança: aviso na DLQ é
 * silêncio sobre o silêncio.
 */
async function handleWhatsAppOutboundNotice(job: JobEntity) {
  const result = await runWhatsAppOutboundNotice({
    job: {
      jobId: job.jobId,
      attempts: job.attempts,
      maxAttempts: job.maxAttempts,
      correlationId: job.correlationId ?? null,
      claimedBy: job.claimedBy ?? null,
      payload: job.payload
    },
    patchJobPayload: (target, patch) => patchJobPayload(target, patch)
  });

  await finishJob(job, { outcome: result.outcome, ...result.patch });
}

/**
 * Verificação de regularidade RNTRC (estratégia `open_data`, PR-C1) — primeiro job type com
 * gateway externo REAL da vertical Transporte.
 *
 * SEM parâmetro `gateway`, no molde de `handleWhatsAppInboundMessage`/`handleConversationBundleDocuments`:
 * o tipo do 2º parâmetro de `processJob` é um literal inline com 14 métodos OBRIGATÓRIOS e um 15º
 * quebraria todo teste que fabrica um gateway CETESB. O corpo do job vive em
 * `transport-rntrc-verification-service.ts`; aqui só a costura com a fila —
 * `{ outcome, ...patch }` → `finishJob`.
 */
async function handleTransporteRntrcVerify(job: JobEntity) {
  const result = await runRntrcVerificationJob(
    {
      jobId: job.jobId,
      entityId: job.entityId,
      correlationId: job.correlationId ?? null,
      claimedBy: job.claimedBy ?? null,
      payload: job.payload
    },
    {
      patchJobPayload: (target, patch) => patchJobPayload(target, patch)
    }
  );

  await finishJob(job, { outcome: result.outcome, ...result.patch });
}

/**
 * Falha TERMINAL do job `transporte.rntrc.verify`: marca a linha `pending` (criada ANTES da
 * chamada ao gateway, em `runRntrcVerificationJob`) como `failed`, com o último erro — SEM tocar
 * `transport_parties` (regra explícita do PR-C1: uma verificação que nunca respondeu não pode
 * rebaixar/alterar o que o cadastro já sabia). Par simétrico de
 * `applyWhatsAppInboundTerminalFailureSideEffect`: mesmo duplo gatilho (operação + campo no
 * payload) e o mesmo try/catch paranoico — `handleDlqTransition` roda isto dentro de um `catch`
 * sem cobertura externa; um `throw` daqui mataria o worker inteiro.
 */
export async function applyTransporteRntrcVerifyTerminalFailureSideEffect(
  job: JobEntity,
  terminalFailure: TerminalFailure = {},
  error: unknown = null
) {
  try {
    if (job.operation !== 'transporte.rntrc.verify') return null;

    const verificationId = toNonEmptyString(job.payload?.verificationId);
    if (!verificationId) return null; // falhou antes de criar a linha pending — nada a reconciliar

    const terminalAction = String(terminalFailure.action || '').toLowerCase();
    if (!['failed', 'dlq', 'cancelled'].includes(terminalAction)) return null;

    const technicalCause = summarizeTechnicalCause(
      terminalFailure.patch?.lastErrorMessage
      || terminalFailure.dlqReason
      || getErrorMessage(error)
      || job.lastErrorMessage
    );

    return await completeVerificationFailed(verificationId, {
      lastErrorCode: terminalFailure.patch?.lastErrorCode || job.lastErrorCode || null,
      lastErrorMessage: technicalCause
    });
  } catch (sideEffectError) {
    console.warn(`[worker] falha terminal da verificação RNTRC não pôde ser reconciliada (job ${job.jobId}): ${getErrorMessage(sideEffectError)}`);
    return null;
  }
}

/**
 * Ciclo do CIOT com provedor ABSTRAÍDO (PR-C2) — 5 handlers, todos SEM parâmetro `gateway` (mesmo
 * molde de `handleTransporteRntrcVerify`): o corpo de cada um vive em
 * `transport-ciot-service.ts` (`runCiot*Job`); aqui só a costura com a fila —
 * `{ outcome, ...patch }` → `finishJob`. Rejeição do provedor e resposta perdida (DL-102) NÃO são
 * tratadas aqui — propagam e são interpretadas pelo side-effect terminal
 * `applyTransporteCiotTerminalFailureSideEffect` (re-exportado abaixo, chamado pelos DOIS pontos
 * de `workers/job-runner.ts`).
 */
async function handleTransporteCiotRegister(job: JobEntity) {
  const result = await runCiotRegisterJob({
    jobId: job.jobId,
    entityId: job.entityId,
    correlationId: job.correlationId ?? null,
    payload: job.payload
  });
  await finishJob(job, { outcome: result.outcome, ...result.patch });
}

async function handleTransporteCiotRectify(job: JobEntity) {
  const result = await runCiotRectifyJob({
    jobId: job.jobId,
    entityId: job.entityId,
    correlationId: job.correlationId ?? null,
    payload: job.payload
  });
  await finishJob(job, { outcome: result.outcome, ...result.patch });
}

async function handleTransporteCiotCancel(job: JobEntity) {
  const result = await runCiotCancelJob({
    jobId: job.jobId,
    entityId: job.entityId,
    correlationId: job.correlationId ?? null,
    payload: job.payload
  });
  await finishJob(job, { outcome: result.outcome, ...result.patch });
}

async function handleTransporteCiotClose(job: JobEntity) {
  const result = await runCiotCloseJob({
    jobId: job.jobId,
    entityId: job.entityId,
    correlationId: job.correlationId ?? null,
    payload: job.payload
  });
  await finishJob(job, { outcome: result.outcome, ...result.patch });
}

async function handleTransporteCiotReconcile(job: JobEntity) {
  const result = await runCiotReconcileJob({
    jobId: job.jobId,
    entityId: job.entityId,
    correlationId: job.correlationId ?? null,
    payload: job.payload
  });
  await finishJob(job, { outcome: result.outcome, ...result.patch });
}

// Re-exportado (não redefinido) para `workers/job-runner.ts` importar de UM lugar só, no mesmo
// molde dos outros `apply*TerminalFailureSideEffect` — a implementação mora em
// `transport-ciot-service.ts` porque depende profundamente de `repositories/ciot-repo.ts`, já
// importado lá.
export { applyTransporteCiotTerminalFailureSideEffect } from '../services/transport-ciot-service.js';

// ---------------------------------------------------------------------------
// Seam de teste do aviso de falha terminal do canal WhatsApp.
//
// POR QUE EXISTE: sem ele, a única dependência observável desta função
// (`findConversationChannelLinkForChannel`) ia direto no pool real do Postgres,
// e o teste da guarda passava a depender do AMBIENTE — com o banco fora, a
// query rejeitava e o `catch` produzia o warn que o teste media; com o banco no
// ar, a query resolvia `null` em silêncio e o mesmo teste falhava. Uma prova que
// se apoia num erro de conexão não prova nada sobre o filtro: ela nunca chega a
// exercitar o caminho de envio com um vínculo válido. Mesmo molde de
// `setWhatsAppNoticeDependenciesForTests` no serviço de aviso — o double é FONTE
// DE DADO (devolve a linha crua) e nunca decide se o aviso sai.
// ---------------------------------------------------------------------------

type TerminalNoticeChannelLink = {
  userId: string | null;
  externalUserKey: string;
  verificationStatus: string;
};

export type WhatsAppTerminalNoticeDependencies = {
  resolveProvider: typeof resolveWhatsAppProvider;
  findLink: (channelLinkId: string) => Promise<TerminalNoticeChannelLink | null>;
};

const defaultWhatsAppTerminalNoticeDependencies: WhatsAppTerminalNoticeDependencies = {
  resolveProvider: resolveWhatsAppProvider,
  findLink: (channelLinkId: string) => findConversationChannelLinkForChannel(null, channelLinkId)
};

let whatsappTerminalNoticeDependencies: WhatsAppTerminalNoticeDependencies =
  defaultWhatsAppTerminalNoticeDependencies;

export function setWhatsAppTerminalNoticeDependenciesForTests(
  overrides: Partial<WhatsAppTerminalNoticeDependencies> | null
): void {
  whatsappTerminalNoticeDependencies = overrides
    ? { ...defaultWhatsAppTerminalNoticeDependencies, ...overrides }
    : defaultWhatsAppTerminalNoticeDependencies;
}

/**
 * Falha TERMINAL de um job de canal: avisa o usuário que a mensagem dele morreu.
 *
 * Sem isto, um job que vai para `failed`/`dlq` deixa a pessoa esperando para sempre — o WhatsApp não
 * tem "spinner que some". Gatilho DUPLO: a operação tem de ser `whatsapp.inbound_message` E o payload
 * tem de carregar `channelLinkId` (molde de `applyConversationArtifactTerminalFailureSideEffect`).
 * O filtro por operação é obrigatório: o job `whatsapp.outbound_notice` também carrega `channelLinkId`
 * no payload (de propósito, para não levar telefone), então sem ele um AVISO que morresse em
 * `failed`/`dlq` dispararia "Não consegui processar sua última mensagem" — factualmente falso (a
 * mensagem FOI processada), mensagem PAGA extra, e fora das guardas de janela de 24 h e de dono do
 * ticket que o serviço de aviso construiu.
 *
 * O corpo INTEIRO é try/catch: `handleDlqTransition` é awaited dentro do `catch` de
 * `processClaimedJob`, que não tem catch externo — um `throw` daqui sobe até o `while` de
 * `runWorkerLoop` e MATA O WORKER.
 */
export async function applyWhatsAppInboundTerminalFailureSideEffect(
  job: JobEntity,
  terminalFailure: TerminalFailure = {},
  _error: unknown = null
) {
  const deps = whatsappTerminalNoticeDependencies;
  try {
    // Só a mensagem de ENTRADA produz este aviso. O aviso de conclusão morrendo na DLQ é silêncio
    // sobre o silêncio, por desenho — nunca uma segunda mensagem sem janela nem checagem de dono.
    if (job.operation !== 'whatsapp.inbound_message') return null;

    const channelLinkId = toNonEmptyString(job.payload?.channelLinkId);
    if (!channelLinkId) return null;

    // Já avisado no caminho feliz (a resposta saiu e o job morreu depois): não repetir.
    if (job.payload?.userNotified === true) return null;

    const terminalAction = String(terminalFailure.action || '').toLowerCase();
    if (!['failed', 'dlq', 'cancelled'].includes(terminalAction)) return null;

    const provider = deps.resolveProvider();
    if (!provider) return null;

    const link = await deps.findLink(channelLinkId);
    if (!link || !link.userId || link.verificationStatus !== 'verified') return null;

    await provider.sendText({
      to: link.externalUserKey,
      text: buildWhatsAppTerminalFailureNotice(job.correlationId ?? null)
    });

    return { notified: true };
  } catch (error) {
    console.warn(`[worker] aviso de falha terminal do canal WhatsApp não pôde ser enviado (job ${job.jobId}): ${getErrorMessage(error)}`);
    return null;
  }
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
  // OPCIONAL de propósito: o tipo acima é um literal inline com 14 métodos
  // obrigatórios e torná-lo o 15º quebraria todo teste que fabrica um gateway.
  // `handleManifestReconcileSubmit` falha ALTO quando ele não vem — nunca
  // silenciosamente "não achei nada", que seria indistinguível de "não existe".
  searchManifests?: (options: GatewaySearchManifestsArgs) => Promise<unknown>;
}) {
  switch (job.operation) {
    case 'manifest.submit':
      return handleManifestSubmit(job, gateway);
    case 'manifest.reconcile_submit':
      return handleManifestReconcileSubmit(job, gateway);
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
    // SEM o parâmetro `gateway`, no molde de `handleConversationBundleDocuments`: o tipo acima é um
    // literal inline com 14 métodos OBRIGATÓRIOS e qualquer teste que chame `processJob` teria de
    // fabricar todos. Dependências deste handler entram por import direto.
    case 'whatsapp.inbound_message':
      return handleWhatsAppInboundMessage(job);
    case 'whatsapp.outbound_notice':
      return handleWhatsAppOutboundNotice(job);
    // SEM o parâmetro `gateway`, mesmo molde de `whatsapp.inbound_message` logo acima — ver o
    // comentário de `handleTransporteRntrcVerify`.
    case 'transporte.rntrc.verify':
      return handleTransporteRntrcVerify(job);
    // Ciclo do CIOT (PR-C2) — SEM o parâmetro `gateway`, mesmo molde de `transporte.rntrc.verify`.
    case 'transporte.ciot.register':
      return handleTransporteCiotRegister(job);
    case 'transporte.ciot.rectify':
      return handleTransporteCiotRectify(job);
    case 'transporte.ciot.cancel':
      return handleTransporteCiotCancel(job);
    case 'transporte.ciot.close':
      return handleTransporteCiotClose(job);
    case 'transporte.ciot.reconcile':
      return handleTransporteCiotReconcile(job);
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

  // C1: grava a intenção (marcador de correlação) na linha local ANTES da
  // chamada ao gateway — ver buildPayloadWithSubmitIntent. O objeto em memória
  // é alinhado ao gravado para os merges pós-resposta preservarem a intenção.
  const correlationMarker = buildManifestCorrelationMarker(manifest.id);
  const payloadWithIntent = buildPayloadWithSubmitIntent(manifest.payload, correlationMarker, job.jobId);
  await updateManifest(manifest.id, { status: 'submitting', payload: payloadWithIntent });
  manifest.payload = payloadWithIntent;

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

/**
 * Varredura de reconciliação de submits sem confirmação.
 *
 * Fecha o ciclo: `listUnconfirmedSubmitManifestsForReconciliation` (que até
 * aqui tinha ZERO chamadores) entrega os manifestos presos em estado transiente
 * ou `submit_unconfirmed` com `external_hash_code` nulo, e o reconciliador
 * pergunta à CETESB, um a um, pelo marcador de correlação.
 *
 * NÃO usa `finishJob` com patch de payload grande: o resumo é enxuto de
 * propósito (o payload do job vai para a auditoria e para a UI de operações).
 */
async function handleManifestReconcileSubmit(job: JobEntity, gateway: {
  searchManifests?: (options: GatewaySearchManifestsArgs) => Promise<unknown>;
}) {
  if (typeof gateway?.searchManifests !== 'function') {
    // Falhar ALTO. Um handler que "não achou nada" por falta de gateway é
    // indistinguível de um que perguntou e não achou — e o segundo autoriza
    // marcar `failed`.
    throw new AppError(500, 'Internal Server Error', 'Gateway sem searchManifests: impossível reconciliar submits sem confirmação.', {
      code: 'MANIFEST_RECONCILE_SUBMIT_MISSING_GATEWAY'
    });
  }

  const integrationAccountId = toNonEmptyString(job.payload?.integrationAccountId) || job.entityId;
  const updatedSince = toNonEmptyString(job.payload?.updatedSince);
  const candidates = await listUnconfirmedSubmitManifestsForReconciliation({
    integrationAccountId,
    updatedSince,
    dateFrom: toNonEmptyString(job.payload?.dateFrom),
    dateTo: toNonEmptyString(job.payload?.dateTo)
  });

  const searchManifests = gateway.searchManifests.bind(gateway);
  let confirmedCount = 0;
  let failedCount = 0;
  let unconfirmedCount = 0;

  for (const manifest of candidates) {
    if (!manifest) continue;

    // Orçamento CHEIO: esta varredura roda no worker, fora de qualquer request.
    // É o único lugar (junto com a falha terminal do job) com autoridade para
    // concluir `failed` — o caminho de leitura só tem uma tentativa.
    const patch = await resolveManifestSubmitReconcilePatch(manifest, { searchManifests }, {
      allowTerminalFailure: true,
      terminalAction: 'reconcile_sweep',
      detail: 'varredura periódica de envios sem confirmação',
      correlationId: job.correlationId ?? null
    });

    if (patch.confirmed) {
      confirmedCount += 1;
    } else if (patch.status === 'failed') {
      failedCount += 1;
    } else {
      unconfirmedCount += 1;
    }

    await updateManifest(manifest.id, {
      status: patch.status,
      externalStatus: patch.externalStatus,
      externalHashCode: patch.externalHashCode ?? null,
      ...(patch.externalReference ? { externalReference: patch.externalReference } : {}),
      lastSyncAt: nowIso()
    });
  }

  await finishJob(job, {
    outcome: 'manifest_submit_reconcile_completed',
    integrationAccountId,
    candidateCount: candidates.length,
    confirmedCount,
    failedCount,
    unconfirmedCount
  });
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

  // C1: mesma intenção pré-PUT do caminho comum — o gateway delega
  // `submitMtrProvisorio` → `submitManifest`, então o marcador também vai
  // no `manObservacao` do provisório.
  const provisorioCorrelationMarker = buildManifestCorrelationMarker(record.id);
  const submitting = await updateMtrProvisorioStatus(
    record.id,
    {
      status: 'submitting',
      payload: buildPayloadWithSubmitIntent(record.payload, provisorioCorrelationMarker, job.jobId)
    },
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
 * ACESSO da sessão logada (`session.userAccessCode`), NÃO o `parCodigo` do
 * destinador (que aparece só nos paths dos GETs) — são códigos DISTINTOS e
 * trocá-los é o erro que a captura desfaz; remCodigo é null; remDataRecebimento
 * é ISO-8601.
 *
 * Os dois códigos da captura eram reproduzidos aqui em claro e foram removidos:
 * são identificadores CETESB de conta real, e um comentário não é lugar de
 * fixture. Os valores da captura vivem na captura versionada, na raiz do
 * monorepo (`docs/portal-contracts/cetesb/2026-06-12/`), fora do código; a
 * catraca que detecta a reintrodução deles é
 * `tests/unit/openapi-no-real-pii.test.js` (por digest, nunca em claro).
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


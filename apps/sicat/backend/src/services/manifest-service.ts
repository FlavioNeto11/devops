import fs from 'node:fs/promises';
import { createRequire } from 'node:module';
import { AppError } from '../lib/problem.js';
import { createPrefixedId } from '../lib/ids.js';
import { buildCommandAccepted } from '../lib/command-response.js';
import { resolveStoragePath, ensureDir } from '../lib/files.js';
import { buildSimplePdf } from '../lib/pdf.js';
import { config } from '../lib/config.js';
import { ensureIntegrationAccount } from '../repositories/integration-account-repo.js';
import { findSessionContextById } from '../repositories/session-context-repo.js';
import {
  insertManifest,
  updateManifest,
  findManifestById,
  findManifestByIdForUpdate,
  deleteManifestById,
  listManifests as repoListManifests,
  deleteManifestsForMirrorWindow,
  listPotentialGhostManifestsForMirrorWindow,
  upsertManifestFromExternalSearch,
  upsertManifestDocument,
  listManifestDocuments,
  findManifestDocument,
  type ManifestListOrderBy
} from '../repositories/manifest-repo.js';
import {
  insertAsyncOperationEntity,
  findAsyncOperationDocumentByHash,
  upsertAsyncOperationDocument
} from '../repositories/async-operation-repo.js';
import { insertAuditEntry } from '../repositories/audit-repo.js';
import { insertJob, insertJobDeduplicated, listJobsByEntity } from '../repositories/job-repo.js';
import { parsePage, parsePageSize, toPagedResponse } from '../lib/pagination.js';
import { getIdempotentResponse, rememberIdempotentResponse } from './idempotency-service.js';
import { createCetesbGateway } from '../gateways/cetesb-gateway.js';
import { calculateJobPriority, getRetryConfig, extractJobTags } from '../lib/retry.js';
import { decodeJwtPayload } from '../lib/jwt.js';
import { withTransaction } from '../db/pool.js';

type GatewaySearchManifestsInput = {
  integrationAccountId?: string | null;
  sessionContextId?: string | null;
  jwtToken?: string | null;
  partnerCode?: number | null;
  correlationId?: string | null;
  includeAudit?: boolean;
  dateFrom?: string | null;
  dateTo?: string | null;
  statusFilter?: string | null;
  page?: number;
  kind?: string;
};

type GatewayCdfCertificatesInput = {
  integrationAccountId?: string | null;
  sessionContextId?: string | null;
  jwtToken?: string | null;
  partnerCode?: number | null;
  correlationId?: string | null;
  includeAudit?: boolean;
  dateFrom?: string | null;
  dateTo?: string | null;
};

type GatewayPrintExchange = {
  response?: {
    data?: {
      pdfBuffer?: Buffer | Uint8Array;
    };
  };
};

type CetesbGateway = {
  searchManifests(input?: GatewaySearchManifestsInput): Promise<unknown>;
  printManifest(manifest: unknown): Promise<GatewayPrintExchange>;
  searchCdfCertificates(input?: GatewayCdfCertificatesInput): Promise<unknown>;
  printCdfCertificate(documentId: string, options?: GatewayCdfCertificatesInput): Promise<GatewayPrintExchange>;
  listReceiptResponsibles?(options?: LooseRecord): Promise<unknown>;
  listCdfResponsibles?(options?: LooseRecord): Promise<unknown>;
};

let gateway = createCetesbGateway() as CetesbGateway;
const require = createRequire(import.meta.url);
const TRANSIENT_MANIFEST_SUBMIT_STATUSES = new Set(['queued_submit', 'submitting', 'processing']);
const TERMINAL_FAILED_SUBMIT_JOB_STATUSES = new Set(['failed', 'dlq', 'cancelled']);

export function setManifestGatewayOverrideForTests(nextGateway: CetesbGateway | null): void {
  gateway = nextGateway ?? createCetesbGateway() as CetesbGateway;
}

type LooseRecord = Record<string, unknown>;
type HeaderMap = Record<string, string | undefined>;
type JsonObject = Record<string, unknown>;
type ManifestListQuery = LooseRecord & {
  integrationAccountId?: string;
  sessionContextId?: string;
  dateFrom?: string;
  dateTo?: string;
  status?: string;
  externalStatus?: string;
  generatorCode?: string;
  carrierCode?: string;
  receiverCode?: string;
  manifestNumber?: string;
  carrierQuery?: string;
  receiverQuery?: string;
  forceSync?: string | boolean;
  localOnly?: string | boolean;
  orderBy?: ManifestListOrderBy | null;
  page?: unknown;
  pageSize?: unknown;
};

type BatchMetadata = {
  groupId: string;
  sourceManifestId: string | null;
  index: number;
  count: number;
  kind: string;
};

type ManifestRepoFilters = {
  integrationAccountId: string | null;
  status: string | null;
  externalStatus: string | null;
  dateFrom: string | null;
  dateTo: string | null;
  generatorCode: string | null;
  carrierCode: string | null;
  receiverCode: string | null;
  manifestNumber: string | null;
  carrierQuery: string | null;
  receiverQuery: string | null;
  orderBy: ManifestListOrderBy | null;
  page: number;
  pageSize: number;
};

type MirrorWindowFilters = {
  integrationAccountId: string;
  dateFrom: string | null;
  dateTo: string | null;
};

type ManifestSubmitBody = {
  sessionContextId?: string | null;
  validateOnly?: boolean;
  printAfterSubmit?: boolean;
  requestedBy?: string | null;
  batch?: BatchMetadata;
} & LooseRecord;

type ManifestCancelBody = {
  requestedBy?: string | null;
  reason?: string;
  batch?: BatchMetadata;
} & LooseRecord;

type ManifestBatchBody = {
  manifestIds?: unknown;
  sessionContextId?: string | null;
  validateOnly?: boolean;
  printAfterSubmit?: boolean;
  requestedBy?: string | null;
  groupId?: string | null;
  reason?: string;
  [key: string]: unknown;
};

type ManifestReceiveBody = {
  integrationAccountId?: string | null;
  sessionContextId?: string | null;
  requestedBy?: string | null;
  printReceiptAfterReceive?: boolean;
  receiptPayload?: unknown;
  [key: string]: unknown;
};

type CdfGenerateBody = {
  integrationAccountId?: string | null;
  sessionContextId?: string | null;
  requestedBy?: string | null;
  cdfPayload?: unknown;
  [key: string]: unknown;
};

type CdfDownloadBody = {
  integrationAccountId?: string | null;
  sessionContextId?: string | null;
  requestedBy?: string | null;
  documentId?: string | null;
  certificateHashCode?: string | null;
  cerHashCode?: string | null;
  [key: string]: unknown;
};

type CdfCertificateQuery = LooseRecord & {
  integrationAccountId?: string;
  sessionContextId?: string;
  dateFrom?: string;
  dateTo?: string;
};

type PartnerPayload = {
  partnerCode?: string | number | null;
  description?: string | null;
  document?: string | null;
};

type StatePayload = {
  code?: string | number | null;
};

type ManifestPayload = LooseRecord & {
  expeditionDate?: string | null;
  generator?: PartnerPayload | null;
  carrier?: PartnerPayload | null;
  receiver?: PartnerPayload | null;
  state?: StatePayload | null;
  driverName?: string | null;
  vehiclePlate?: string | null;
  requestedBy?: string | null;
  batch?: BatchMetadata | null;
  externalSnapshot?: LooseRecord | null;
  residues?: unknown[];
};

type ManifestLike = {
  id: string;
  integrationAccountId: string | null;
  sessionContextId: string | null;
  status: string;
  externalStatus: string | null;
  externalReference?: { manCodigo?: string | number | null; manNumero?: string | number | null } | null;
  externalHashCode?: string | null;
  payload?: LooseRecord | null;
  requestedBy?: string | null;
  lastSyncAt?: string | null;
  lastSubmittedAt?: string | null;
  createdAt?: string | null;
  updatedAt?: string | null;
};

type PagedManifestResult = {
  items: Array<ManifestLike | undefined>;
  totalItems: number;
};

type RemoteSearchAudit = {
  httpMethod?: string;
  endpoint?: string;
  httpStatus?: number;
  latencyMs?: number;
  sanitizedHeaders?: unknown;
  sanitizedBody?: unknown;
};

type RemoteSearchResponse = {
  items?: unknown[];
  message?: string | null;
  audit?: RemoteSearchAudit;
};

type GatewaySearchExchange = {
  request?: {
    httpMethod?: unknown;
    endpoint?: unknown;
    sanitizedHeaders?: unknown;
    sanitizedBody?: unknown;
  };
  response?: {
    httpMethod?: unknown;
    endpoint?: unknown;
    httpStatus?: unknown;
    latencyMs?: unknown;
    sanitizedHeaders?: unknown;
    sanitizedBody?: unknown;
    data?: unknown;
  };
};

type SnapshotResidue = {
  lineNumber: unknown;
  quantity: unknown;
  receivedQuantity?: unknown;
  weightTon?: unknown;
  justification?: unknown;
  unit?: {
    code: unknown;
    symbol: unknown;
    description: unknown;
  };
  treatment?: {
    code: unknown;
    description: unknown;
  };
  residue: {
    code: unknown;
    ibamaCode: unknown;
    description: unknown;
  };
  class: {
    code?: unknown;
    description: unknown;
  };
};

function isRecord(value: unknown): value is LooseRecord {
  return value != null && typeof value === 'object' && !Array.isArray(value);
}

function toRecord(value: unknown): LooseRecord {
  return isRecord(value) ? value : {};
}

function toPayload(value: unknown): ManifestPayload {
  return toRecord(value) as ManifestPayload;
}

function toPrimitiveString(value: unknown): string | null {
  if (typeof value === 'string') return value;
  if (typeof value === 'number' || typeof value === 'boolean' || typeof value === 'bigint') {
    return String(value);
  }
  return null;
}

function toTrimmedString(value: unknown): string {
  return toPrimitiveString(value)?.trim() ?? '';
}

function toCollapsedString(value: unknown): string {
  return toTrimmedString(value).replaceAll(/\s+/g, ' ');
}

function toOptionalString(value: unknown): string | undefined {
  const normalized = toTrimmedString(value);
  return normalized || undefined;
}

function toNullableString(value: unknown): string | null {
  return toOptionalString(value) ?? null;
}

function toNullableNumber(value: unknown): number | null {
  if (typeof value === 'number' && Number.isFinite(value)) return value;
  if (typeof value === 'string' && value.trim()) {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : null;
  }
  return null;
}

function normalizeManifestListItems(items: Array<ManifestLike | undefined>): ManifestLike[] {
  return items.filter((item): item is ManifestLike => item != null);
}

function normalizeManifestId(value: unknown): string {
  const normalized = toTrimmedString(value);
  if (!normalized) {
    throw new AppError(400, 'Bad Request', 'manifest id inválido.');
  }
  return normalized;
}

function normalizeBatchManifestIds(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return Array.from(new Set(value.map((entry) => toTrimmedString(entry)).filter(Boolean)));
}

function requireManifest(value: ManifestLike | undefined | null, detail: string): ManifestLike {
  if (!value) {
    throw new AppError(500, 'Internal Server Error', detail, { code: 'MANIFEST_MAPPING_FAILED' });
  }
  return value;
}

function toStringOrNumberOrNull(value: unknown): string | number | null {
  if (typeof value === 'string' || typeof value === 'number') return value;
  return null;
}

function ensureCorrelationId(correlationId: string | null): string {
  return correlationId || createPrefixedId('corr');
}

function requireNonEmptyString(value: unknown, detail: string): string {
  const normalized = toTrimmedString(value);
  if (!normalized) {
    throw new AppError(400, 'Bad Request', detail);
  }
  return normalized;
}

function cloneJson<T>(value: T): T {
  if (value === undefined) {
    return value;
  }

  return structuredClone(value);
}

function addDays(date: Date, days: number): Date {
  return new Date(date.getTime() + days * 86_400_000);
}

function formatIsoDate(date: Date): string {
  const yyyy = date.getUTCFullYear();
  const mm = String(date.getUTCMonth() + 1).padStart(2, '0');
  const dd = String(date.getUTCDate()).padStart(2, '0');
  return `${yyyy}-${mm}-${dd}`;
}

function resolveMirrorSyncWindow(queryString: ManifestListQuery, forceSync: boolean) {
  if (!forceSync) {
    return {
      dateFrom: queryString.dateFrom || null,
      dateTo: queryString.dateTo || null
    };
  }

  // For forceSync without explicit range we perform a full mirror resync
  // (gateway defaults to configured search range) and clear local mirror first.
  if (!queryString.dateFrom && !queryString.dateTo) {
    return {
      dateFrom: null,
      dateTo: null
    };
  }

  return {
    dateFrom: queryString.dateFrom || null,
    dateTo: queryString.dateTo || null
  };
}

function extractBearerToken(headers: HeaderMap = {}) {
  const rawValue = headers.authorization || headers.Authorization;
  if (!rawValue) {
    return null;
  }

  const match = /^Bearer\s+(.+)$/i.exec(String(rawValue));
  return match?.[1]?.trim() || null;
}

function resolvePartnerCodeFromJwt(token: string | null): number | null {
  if (!token) {
    return null;
  }
  const payload = decodeJwtPayload(token);
  const subject = toTrimmedString(payload?.sub);
  if (!subject) {
    return null;
  }

  const [partnerCodeToken] = subject.split(',');
  const parsed = Number(partnerCodeToken);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : null;
}

function resolveGatewayRequestAuth(shouldUseRequestJwt: boolean, headers: HeaderMap = {}) {
  const requestJwtToken = extractBearerToken(headers);
  return {
    requestJwtToken,
    requestPartnerCode: shouldUseRequestJwt ? resolvePartnerCodeFromJwt(requestJwtToken) : undefined
  };
}

function summarizeTechnicalCause(value: unknown, maxLength = 180): string | null {
  const normalized = toCollapsedString(value);
  if (!normalized) return null;
  if (normalized.length <= maxLength) return normalized;
  return `${normalized.slice(0, maxLength - 1)}…`;
}

function normalizeErrorMessageForMatch(value: unknown): string {
  return String(value || '')
    .normalize('NFD')
    .replaceAll(/[\u0300-\u036f]/g, '')
    .toLowerCase();
}

function isCetesbSingleDayIntervalError(error: unknown): boolean {
  const err = isRecord(error) ? error : {};
  const payload = isRecord(err['payload']) ? err['payload'] : {};

  const candidates = [
    err['message'],
    err['detail'],
    err['title'],
    payload['detail'],
    payload['title']
  ];

  return candidates.some((entry) => {
    const normalized = normalizeErrorMessageForMatch(entry);
    return normalized.includes('intervalo')
      && normalized.includes('datas')
      && normalized.includes('maior que')
      && (normalized.includes('0 dias') || normalized.includes('zero dias'));
  });
}

function buildManifestListFilters(queryString: ManifestListQuery, page: number, pageSize: number) {
  return {
    integrationAccountId: queryString.integrationAccountId || null,
    status: queryString.status || null,
    externalStatus: queryString.externalStatus || null,
    dateFrom: queryString.dateFrom || null,
    dateTo: queryString.dateTo || null,
    generatorCode: queryString.generatorCode || null,
    carrierCode: queryString.carrierCode || null,
    receiverCode: queryString.receiverCode || null,
    manifestNumber: queryString.manifestNumber || null,
    carrierQuery: queryString.carrierQuery || null,
    receiverQuery: queryString.receiverQuery || null,
    orderBy: queryString.orderBy || null,
    page,
    pageSize
  } satisfies ManifestRepoFilters;
}

function mapManifestListItem(manifest: ManifestLike) {
  const payload = toPayload(manifest.payload);
  const generator = toRecord(payload.generator);
  const carrier = toRecord(payload.carrier);
  const receiver = toRecord(payload.receiver);
  const batch = toRecord(payload.batch);
  return {
    id: manifest.id,
    sessionContextId: manifest.sessionContextId || null,
    status: manifest.status,
    externalStatus: manifest.externalStatus,
    manifestNumber: manifest.externalReference?.manNumero || null,
    externalCode: manifest.externalReference?.manCodigo || null,
    externalHashCode: manifest.externalHashCode,
    expeditionDate: toNullableString(payload.expeditionDate),
    generator: payload.generator
      ? { partnerCode: generator['partnerCode'] ?? null, description: generator['description'] ?? null }
      : null,
    carrier: payload.carrier
      ? { partnerCode: carrier['partnerCode'] ?? null, description: carrier['description'] ?? null }
      : null,
    receiver: payload.receiver
      ? { partnerCode: receiver['partnerCode'] ?? null, description: receiver['description'] ?? null }
      : null,
    driverName: toNullableString(payload.driverName),
    vehiclePlate: toNullableString(payload.vehiclePlate),
    groupId: toNullableString(batch['groupId']),
    sourceManifestId: toNullableString(batch['sourceManifestId']),
    batchIndex: toNullableNumber(batch['index']),
    batchSize: toNullableNumber(batch['count']),
    batchKind: toNullableString(batch['kind']),
    lastSyncAt: manifest.lastSyncAt
  };
}

async function reconcileTransientManifests(result: PagedManifestResult, filters: ManifestRepoFilters) {
  const normalizedItems = normalizeManifestListItems(result.items);
  const transientCandidates = normalizedItems.filter((manifest) => {
    const status = String(manifest?.status || '').toLowerCase();
    return TRANSIENT_MANIFEST_SUBMIT_STATUSES.has(status);
  });

  if (transientCandidates.length === 0) {
    return result;
  }

  await Promise.all(transientCandidates.map((manifest) => reconcileManifestSubmitState(manifest)));
  return repoListManifests(filters);
}

function shouldSyncManifestMirror(queryString: ManifestListQuery, result: PagedManifestResult, forceSync: boolean) {
  const localOnly = String(queryString.localOnly) === 'true';
  if (localOnly) {
    return false;
  }

  const normalizedItems = normalizeManifestListItems(result.items);
  const lastSync = normalizedItems[0]?.lastSyncAt ? new Date(normalizedItems[0].lastSyncAt) : null;
  const staleThresholdMs = 60 * 60 * 1000;
  const isStale = !lastSync || (Date.now() - lastSync.getTime()) > staleThresholdMs;

  return config.cetesbGatewayMode === 'real'
    && queryString.integrationAccountId
    && (forceSync || result.totalItems === 0 || isStale);
}

function extractRemoteSearchItems(remoteSearch: unknown): unknown[] {
  if (Array.isArray(remoteSearch)) {
    return remoteSearch;
  }

  if (isRecord(remoteSearch) && Array.isArray(remoteSearch.items)) {
    return remoteSearch.items;
  }

  const exchange = isRecord(remoteSearch) ? remoteSearch as GatewaySearchExchange : null;
  const response = exchange && isRecord(exchange.response) ? exchange.response : null;
  const responseData = response && isRecord(response.data) ? response.data : null;

  if (responseData && Array.isArray(responseData.items)) {
    return responseData.items;
  }

  return [];
}

function extractRemoteSearchMessage(remoteSearch: unknown): string | null {
  if (isRecord(remoteSearch) && typeof remoteSearch.message === 'string') {
    return toNullableString(remoteSearch.message);
  }

  const exchange = isRecord(remoteSearch) ? remoteSearch as GatewaySearchExchange : null;
  const response = exchange && isRecord(exchange.response) ? exchange.response : null;
  const responseData = response && isRecord(response.data) ? response.data : null;

  if (responseData && typeof responseData.message === 'string') {
    return toNullableString(responseData.message);
  }

  return null;
}

function getRemoteSearchExchange(remoteSearch: unknown): GatewaySearchExchange | null {
  if (!isRecord(remoteSearch)) {
    return null;
  }

  const exchange = remoteSearch as GatewaySearchExchange;
  const request = isRecord(exchange.request) ? exchange.request : null;
  const response = isRecord(exchange.response) ? exchange.response : null;

  if (!request && !response) {
    return null;
  }

  return {
    request: request ?? undefined,
    response: response ?? undefined
  };
}

function buildRemoteSearchAuditBody(exchange: GatewaySearchExchange): Record<string, unknown> | undefined {
  const sanitizedBody: Record<string, unknown> = {};

  if (exchange.request && isRecord(exchange.request.sanitizedBody)) {
    sanitizedBody.request = exchange.request.sanitizedBody;
  }

  if (exchange.response && isRecord(exchange.response.sanitizedBody)) {
    sanitizedBody.response = exchange.response.sanitizedBody;
  }

  return Object.keys(sanitizedBody).length ? sanitizedBody : undefined;
}

function buildRemoteSearchAuditHeaders(exchange: GatewaySearchExchange): Record<string, unknown> | undefined {
  if (exchange.response && isRecord(exchange.response.sanitizedHeaders)) {
    return exchange.response.sanitizedHeaders;
  }

  if (exchange.request && isRecord(exchange.request.sanitizedHeaders)) {
    return exchange.request.sanitizedHeaders;
  }

  return undefined;
}

function buildRemoteSearchAuditFromExchange(exchange: GatewaySearchExchange): RemoteSearchAudit {
  return {
    httpMethod: toNullableString(exchange.response?.httpMethod ?? exchange.request?.httpMethod) ?? undefined,
    endpoint: toNullableString(exchange.response?.endpoint ?? exchange.request?.endpoint) ?? undefined,
    httpStatus: toNullableNumber(exchange.response?.httpStatus) ?? undefined,
    latencyMs: toNullableNumber(exchange.response?.latencyMs) ?? undefined,
    sanitizedHeaders: buildRemoteSearchAuditHeaders(exchange),
    sanitizedBody: buildRemoteSearchAuditBody(exchange)
  };
}

function extractRemoteSearchAudit(remoteSearch: unknown): RemoteSearchAudit | null {
  if (Array.isArray(remoteSearch) || !isRecord(remoteSearch)) {
    return null;
  }

  const explicitAudit = (remoteSearch as RemoteSearchResponse).audit;
  if (explicitAudit && isRecord(explicitAudit)) {
    return explicitAudit;
  }

  const exchange = getRemoteSearchExchange(remoteSearch);
  if (!exchange) {
    return null;
  }

  return buildRemoteSearchAuditFromExchange(exchange);
}

async function requireOperationalSessionContext(integrationAccountId: string, sessionContextId: string) {
  await ensureIntegrationAccount(integrationAccountId);

  const sessionContext = await findSessionContextById(sessionContextId);
  if (!sessionContext) {
    throw new AppError(400, 'Bad Request', `sessionContextId ${sessionContextId} was not found.`);
  }

  if (sessionContext.integrationAccountId !== integrationAccountId) {
    throw new AppError(400, 'Bad Request', `sessionContextId ${sessionContextId} does not belong to integrationAccountId ${integrationAccountId}.`);
  }

  return sessionContext;
}

async function enqueueDetachedCommand(options: {
  operation: string;
  entityType: string;
  entityIdPrefix: string;
  integrationAccountId: string;
  sessionContextId: string;
  requestedBy?: string | null;
  payload: LooseRecord;
  headers: HeaderMap;
  correlationId: string | null;
  idempotencyOperation: string;
}) {
  await requireOperationalSessionContext(options.integrationAccountId, options.sessionContextId);

  const idempotencyKey = options.headers['idempotency-key'];
  const reused = await getIdempotentResponse(options.idempotencyOperation, idempotencyKey);
  if (reused) return reused;

  const entityId = createPrefixedId(options.entityIdPrefix);
  const jobId = createPrefixedId('job');
  const commandId = createPrefixedId('cmd');
  const retryConfig = getRetryConfig(options.operation);
  const priority = calculateJobPriority(options.operation);

  await insertJob({
    jobId,
    commandId,
    entityType: options.entityType,
    entityId,
    operation: options.operation,
    payload: {
      ...options.payload,
      integrationAccountId: options.integrationAccountId,
      sessionContextId: options.sessionContextId,
      requestedBy: options.requestedBy || null
    },
    status: 'queued',
    maxAttempts: retryConfig.maxAttempts,
    correlationId: options.correlationId,
    idempotencyKey,
    priority,
    retryStrategy: retryConfig.strategy,
    baseDelayMs: retryConfig.baseDelayMs,
    maxDelayMs: retryConfig.maxDelayMs,
    tags: extractJobTags({ operation: options.operation, entityType: options.entityType, status: 'queued' })
  });

  await insertAsyncOperationEntity({
    entityType: options.entityType,
    entityId,
    operation: options.operation,
    integrationAccountId: options.integrationAccountId,
    sessionContextId: options.sessionContextId,
    status: 'queued',
    payload: {
      ...options.payload,
      integrationAccountId: options.integrationAccountId,
      sessionContextId: options.sessionContextId,
      requestedBy: options.requestedBy || null
    },
    requestedBy: options.requestedBy || null,
    correlationId: options.correlationId,
    lastSyncAt: new Date().toISOString()
  });

  const response = buildCommandAccepted({
    commandId,
    jobId,
    correlationId: ensureCorrelationId(options.correlationId),
    entityType: options.entityType,
    entityId,
    operation: options.operation
  });

  await rememberIdempotentResponse({
    operation: options.idempotencyOperation,
    idempotencyKey,
    entityType: options.entityType,
    entityId,
    response
  });

  return response;
}

async function persistRemoteSearchAudit(
  remoteSearch: unknown,
  correlationId: string | null,
  integrationAccountId: string | undefined,
  entityType = 'manifest.search'
) {
  const searchAudit = extractRemoteSearchAudit(remoteSearch);
  if (!searchAudit || !correlationId) {
    return;
  }

  try {
    await insertAuditEntry({
      correlationId,
      entityType,
      entityId: integrationAccountId,
      direction: 'outbound',
      component: 'cetesb-gateway',
      httpMethod: searchAudit.httpMethod,
      endpoint: searchAudit.endpoint,
      httpStatus: searchAudit.httpStatus,
      latencyMs: searchAudit.latencyMs,
      sanitizedHeaders: isRecord(searchAudit.sanitizedHeaders) ? searchAudit.sanitizedHeaders : undefined,
      sanitizedBody: isRecord(searchAudit.sanitizedBody) ? searchAudit.sanitizedBody : undefined
    });
  } catch {
  }
}

function buildSyncFallback(items: unknown[], page: number, pageSize: number, totalItems: number, remoteStatus: number | null) {
  return {
    ...toPagedResponse(items, page, pageSize, totalItems),
    syncWarning: {
      code: 'CETESB_SYNC_FALLBACK',
      message: 'CETESB indisponível no momento. Exibindo dados locais em cache.',
      source: 'local-cache',
      remoteStatus: remoteStatus || null,
      fallbackAt: new Date().toISOString()
    }
  };
}

function buildSyncEmptyPreserveWarning(items: unknown[], page: number, pageSize: number, totalItems: number, syncWindow: {
  dateFrom: string | null;
  dateTo: string | null;
}) {
  return {
    ...toPagedResponse(items, page, pageSize, totalItems),
    syncWarning: {
      code: 'CETESB_SYNC_EMPTY_PRESERVED',
      message: 'Pesquisa CETESB retornou sem itens para a janela solicitada. Mantendo dados locais para evitar limpeza indevida do espelho.',
      source: 'local-cache',
      dateFrom: syncWindow.dateFrom,
      dateTo: syncWindow.dateTo,
      fallbackAt: new Date().toISOString()
    }
  };
}

function isCetesb5xxFallback(error: unknown) {
  const err = isRecord(error) ? error : {};
  const remoteStatus = Number(err['remoteStatus'] ?? err['statusCode'] ?? err['status'] ?? 0);
  const appErrorCode = error instanceof AppError ? error.code ?? '' : '';
  const isCetesb5xx =
    (error instanceof AppError && error.code === 'CETESB_HTTP_ERROR' && remoteStatus >= 500)
    || (error instanceof AppError && ['CETESB_RETRY_EXHAUSTED', 'CETESB_NETWORK_ERROR', 'CETESB_GATEWAY_ERROR'].includes(appErrorCode));

  return { isCetesb5xx, remoteStatus };
}

async function fetchRemoteManifestSearch(queryString: ManifestListQuery, correlationId: string | null, headers: HeaderMap, forceSync: boolean) {
  let syncWindow = resolveMirrorSyncWindow(queryString, forceSync);
  const shouldUseRequestJwt = !queryString.sessionContextId;
  const { requestJwtToken, requestPartnerCode } = resolveGatewayRequestAuth(shouldUseRequestJwt, headers);

  const buildGatewaySearchInput = () => ({
    integrationAccountId: queryString.integrationAccountId ?? null,
    sessionContextId: queryString.sessionContextId ?? null,
    jwtToken: shouldUseRequestJwt ? requestJwtToken : null,
    partnerCode: requestPartnerCode,
    correlationId,
    includeAudit: true,
    dateFrom: syncWindow.dateFrom,
    dateTo: syncWindow.dateTo,
    statusFilter: queryString.status || null,
    page: 0,
    kind: 'all'
  });

  let remoteSearch;
  try {
    remoteSearch = await gateway.searchManifests(buildGatewaySearchInput());
  } catch (error: unknown) {
    if (!isCetesbSingleDayIntervalError(error)) {
      throw error;
    }

    const fallbackIsoDate = syncWindow.dateTo || syncWindow.dateFrom || formatIsoDate(new Date());
    syncWindow = {
      dateFrom: fallbackIsoDate,
      dateTo: fallbackIsoDate
    };

    remoteSearch = await gateway.searchManifests(buildGatewaySearchInput());
  }

  return { remoteSearch, syncWindow };
}

function normalizeBatchCount(value: unknown, fieldName = 'count', max = 100): number {
  const parsed = Number.parseInt(toTrimmedString(value), 10);
  if (!Number.isFinite(parsed) || parsed < 1) {
    throw new AppError(400, 'Bad Request', `${fieldName} must be an integer greater than or equal to 1.`);
  }

  if (parsed > max) {
    throw new AppError(400, 'Bad Request', `${fieldName} must be less than or equal to ${max}.`);
  }

  return parsed;
}

function sanitizeDraftPayload(payload: unknown): LooseRecord {
  const draftPayload = toRecord(cloneJson(payload));
  delete draftPayload.jobResults;
  delete draftPayload.externalSnapshot;
  delete draftPayload.documents;
  delete draftPayload.auditLog;
  delete draftPayload.batch;
  return draftPayload;
}

function mergeManifestPayload(basePayload: unknown, overrides: unknown): LooseRecord {
  if (overrides === undefined) {
    return isRecord(basePayload) ? toRecord(cloneJson(basePayload)) : {};
  }

  if (!isRecord(basePayload) || !isRecord(overrides)) {
    return isRecord(overrides) ? toRecord(cloneJson(overrides)) : {};
  }

  const merged = cloneJson(basePayload) as LooseRecord || {};
  for (const [key, value] of Object.entries(overrides)) {
    if (value === undefined) {
      continue;
    }

    if (isRecord(value) && isRecord(merged[key])) {
      merged[key] = mergeManifestPayload(merged[key], value);
      continue;
    }

    merged[key] = cloneJson(value);
  }

  return merged;
}

function buildBatchMetadata({ groupId, sourceManifestId = null, index, count, kind }: { groupId: string; sourceManifestId?: string | null; index: number; count: number; kind: string }): BatchMetadata {
  return {
    groupId,
    sourceManifestId,
    index,
    count,
    kind
  };
}

async function ensureManifestDraftContext(body: LooseRecord) {
  const integrationAccountId = requireNonEmptyString(body.integrationAccountId, 'integrationAccountId is required.');
  const generator = toRecord(body.generator);
  const state = toRecord(body.state);

  await ensureIntegrationAccount(integrationAccountId, {
    partnerCode: toNullableString(generator['partnerCode']),
    partnerDocument: toNullableString(generator['document']),
    stateCode: toNullableString(state['code'])
  });

  if (body.sessionContextId) {
    const sessionContextId = toNullableString(body.sessionContextId);
    if (!sessionContextId) {
      throw new AppError(400, 'Bad Request', 'sessionContextId is invalid.');
    }
    const sessionContext = await findSessionContextById(sessionContextId);
    if (!sessionContext) {
      throw new AppError(400, 'Bad Request', `sessionContextId ${sessionContextId} was not found.`);
    }
  }
}

async function createManifestDraftRecord(body: LooseRecord, correlationId: string | null) {
  await ensureManifestDraftContext(body);
  const integrationAccountId = requireNonEmptyString(body.integrationAccountId, 'integrationAccountId is required.');

  return insertManifest({
    id: createPrefixedId('man'),
    integrationAccountId,
    sessionContextId: toNullableString(body.sessionContextId),
    status: 'draft',
    externalStatus: 'pending_submission',
    externalReference: null,
    externalHashCode: null,
    payload: body,
    requestedBy: toNullableString(body.requestedBy),
    correlationId
  });
}

function buildBatchResponse({ groupId, operation, items, sourceManifestId = null }: { groupId: string; operation: string; items: unknown[]; sourceManifestId?: string | null }) {
  return {
    groupId,
    sourceManifestId,
    operation,
    total: items.length,
    items
  };
}

function isManifestInFailureState(manifest: ManifestLike) {
  const status = toTrimmedString(manifest?.status).toLowerCase();
  const externalStatus = toTrimmedString(manifest?.externalStatus).toLowerCase();
  const combinedStatus = `${status} ${externalStatus}`;

  return combinedStatus.includes('fail')
    || combinedStatus.includes('error')
    || combinedStatus.includes('falha')
    || combinedStatus.includes('erro')
    || combinedStatus.includes('dlq');
}

function canReplicateManifest(manifest: ManifestLike) {
  const status = toTrimmedString(manifest?.status).toLowerCase();
  const externalStatus = toTrimmedString(manifest?.externalStatus).toLowerCase();
  const combinedStatus = `${status} ${externalStatus}`;

  return ![
    'queued',
    'submitting',
    'processing',
    'cancelling',
    'cancelled',
    'failed',
    'error',
    'dlq'
  ].some((fragment) => combinedStatus.includes(fragment));
}

function buildManifestOrphanExternalStatus() {
  return 'Falha no envio: job de submit não encontrado (possível interrupção/restart). Revise e reenvie o manifesto.';
}

function buildManifestSubmitTerminalErrorExternalStatus(jobStatus: string, technicalCause: string | null) {
  const normalizedStatus = toTrimmedString(jobStatus).toLowerCase();
  const baseMessage = normalizedStatus === 'dlq'
    ? 'Falha no envio para CETESB: job finalizado em DLQ. Revise os dados e reenfileire o envio.'
    : 'Falha no envio para CETESB: job finalizado com erro. Revise os dados e realize novo envio.';

  if (!technicalCause) {
    return baseMessage;
  }

  return `${baseMessage} Causa técnica: ${technicalCause}`;
}

function buildManifestMissingFromMirrorExternalStatus() {
  return 'Falha no envio: manifesto não localizado na pesquisa CETESB durante a sincronização. Revise os dados e realize novo envio.';
}

function buildRemoteManifestIdentitySets(remoteItems: unknown[] = []) {
  const hashes = new Set<string>();
  const codes = new Set<string>();
  const numbers = new Set<string>();

  for (const item of remoteItems) {
    const record = toRecord(item);
    const hash = toTrimmedString(record['manHashCode']);
    const code = toTrimmedString(record['manCodigo']);
    const number = toTrimmedString(record['manNumero']);

    if (hash) hashes.add(hash);
    if (code) codes.add(code);
    if (number) numbers.add(number);
  }

  return { hashes, codes, numbers };
}

function manifestMatchesRemoteIdentity(manifest: ManifestLike, identities: { hashes: Set<string>; codes: Set<string>; numbers: Set<string> }) {
  const externalHashCode = toTrimmedString(manifest?.externalHashCode);
  const manCodigo = toTrimmedString(manifest?.externalReference?.manCodigo);
  const manNumero = toTrimmedString(manifest?.externalReference?.manNumero);

  return (externalHashCode && identities.hashes.has(externalHashCode))
    || (manCodigo && identities.codes.has(manCodigo))
    || (manNumero && identities.numbers.has(manNumero));
}

async function reconcileGhostManifestsMissingFromRemoteSearch(filters: MirrorWindowFilters, remoteItems: unknown[]) {
  const candidates = await listPotentialGhostManifestsForMirrorWindow(filters);
  if (candidates.length === 0) {
    return 0;
  }

  const identities = buildRemoteManifestIdentitySets(remoteItems);
  let updatedCount = 0;

  for (const manifest of candidates) {
    if (!manifest) {
      continue;
    }

    if (manifestMatchesRemoteIdentity(manifest, identities)) {
      continue;
    }

    await updateManifest(manifest.id, {
      status: 'failed',
      externalStatus: buildManifestMissingFromMirrorExternalStatus(),
      lastSyncAt: new Date().toISOString()
    });
    updatedCount += 1;
  }

  return updatedCount;
}

async function reconcileManifestSubmitState(manifest: ManifestLike | null) {
  if (!manifest) {
    return manifest;
  }

  const currentStatus = String(manifest.status || '').toLowerCase();
  const isTransientSubmit = TRANSIENT_MANIFEST_SUBMIT_STATUSES.has(currentStatus);
  if (!isTransientSubmit) {
    return manifest;
  }

  const jobs = await listJobsByEntity('manifest', manifest.id);
  const submitJob = jobs.find((job) => job.operation === 'manifest.submit') || null;

  if (!submitJob) {
    return updateManifest(manifest.id, {
      status: 'failed',
      externalStatus: buildManifestOrphanExternalStatus(),
      lastSyncAt: new Date().toISOString()
    });
  }

  const submitJobStatus = String(submitJob.status || '').toLowerCase();
  if (!TERMINAL_FAILED_SUBMIT_JOB_STATUSES.has(submitJobStatus)) {
    return manifest;
  }

  const technicalCause = summarizeTechnicalCause(submitJob.lastErrorMessage || submitJob.dlqReason);

  return updateManifest(manifest.id, {
    status: 'failed',
    externalStatus: buildManifestSubmitTerminalErrorExternalStatus(submitJobStatus, technicalCause),
    lastSyncAt: new Date().toISOString()
  });
}

export async function createManifest(body: LooseRecord, correlationId: string | null) {
  const manifest = requireManifest(
    await createManifestDraftRecord(body, correlationId),
    'Falha ao criar rascunho de manifesto.'
  );

  return toManifestDetail(manifest, []);
}

export async function createManifestBatch(body: LooseRecord, correlationId: string | null) {
  const count = normalizeBatchCount(body?.count, 'count');
  const template = isRecord(body?.template) ? body.template : null;
  if (!template) {
    throw new AppError(400, 'Bad Request', 'template is required.');
  }

  const groupId = createPrefixedId('grp');
  const items = [];

  for (let index = 0; index < count; index += 1) {
    const payload = {
      ...sanitizeDraftPayload(template),
      integrationAccountId: body.integrationAccountId || template.integrationAccountId,
      sessionContextId: body.sessionContextId ?? template.sessionContextId,
      requestedBy: body.requestedBy ?? template.requestedBy ?? null,
      batch: buildBatchMetadata({
        groupId,
        index: index + 1,
        count,
        kind: 'batch_create'
      })
    };

    const createdManifest = requireManifest(
      await createManifestDraftRecord(payload, correlationId),
      'Falha ao criar item do lote de manifestos.'
    );
    items.push(toManifestDetail(createdManifest, []));
  }

  return buildBatchResponse({
    groupId,
    operation: 'manifest.batch_create',
    items
  });
}

export async function replicateManifest(id: string, body: LooseRecord, correlationId: string | null) {
  const sourceManifest = await findManifestById(id);
  if (!sourceManifest) {
    throw new AppError(404, 'Not Found', `Manifesto ${id} was not found.`);
  }

  if (!canReplicateManifest(sourceManifest)) {
    throw new AppError(409, 'Conflict', `Manifesto ${id} cannot be replicated in its current state.`, {
      code: 'MANIFEST_REPLICATE_NOT_ALLOWED',
      context: {
        manifestStatus: sourceManifest.status,
        externalStatus: sourceManifest.externalStatus
      }
    });
  }

  const count = normalizeBatchCount(body?.count, 'count');
  const sourcePayload = sanitizeDraftPayload(sourceManifest.payload || {});
  const overrides = isRecord(body?.overrides) ? body.overrides : {};
  const groupId = createPrefixedId('grp');
  const items = [];

  for (let index = 0; index < count; index += 1) {
    const payload = mergeManifestPayload(sourcePayload, overrides);
    payload.integrationAccountId = sourceManifest.integrationAccountId;
    payload.sessionContextId = body?.sessionContextId ?? sourceManifest.sessionContextId ?? sourcePayload.sessionContextId ?? null;
    payload.requestedBy = body?.requestedBy ?? sourceManifest.requestedBy ?? sourcePayload.requestedBy ?? null;
    payload.expeditionDate = toNullableString(payload.expeditionDate) || formatIsoDate(new Date());
    payload.batch = buildBatchMetadata({
      groupId,
      sourceManifestId: sourceManifest.id,
      index: index + 1,
      count,
      kind: 'replication'
    });

    const createdManifest = requireManifest(
      await createManifestDraftRecord(payload, correlationId),
      'Falha ao replicar manifesto.'
    );
    items.push(toManifestDetail(createdManifest, []));
  }

  return buildBatchResponse({
    groupId,
    sourceManifestId: sourceManifest.id,
    operation: 'manifest.replicate',
    items
  });
}

export async function getManifest(id: string) {
  const manifest = await findManifestById(id);
  if (!manifest) {
    throw new AppError(404, 'Not Found', `Manifesto ${id} was not found.`);
  }

  const reconciledManifest = await reconcileManifestSubmitState(manifest);
  const baseManifest = requireManifest(reconciledManifest, `Manifesto ${id} inválido após reconciliação.`);
  const enrichedManifest = await enrichManifestResiduesFromPdf(baseManifest);
  const effectiveManifest = requireManifest(
    enrichedManifest || baseManifest,
    `Manifesto ${id} inválido após reconciliação.`
  );
  const documents = await listManifestDocuments(id);
  return toManifestDetail(effectiveManifest, documents);
}

export async function removeManifest(id: string, correlationId: string | null = null) {
  const manifest = await findManifestById(id);
  if (!manifest) {
    throw new AppError(404, 'Not Found', `Manifesto ${id} was not found.`);
  }

  if (!isManifestInFailureState(manifest)) {
    throw new AppError(409, 'Conflict', `Manifesto ${id} cannot be removed because it is not in a failure state.`, {
      code: 'MANIFEST_REMOVE_NOT_ALLOWED',
      context: {
        manifestStatus: manifest.status,
        externalStatus: manifest.externalStatus
      }
    });
  }

  const removed = await deleteManifestById(id);
  if (!removed) {
    throw new AppError(500, 'Internal Server Error', `Failed to remove manifesto ${id}.`, {
      code: 'MANIFEST_REMOVE_FAILED'
    });
  }

  if (correlationId) {
    try {
      await insertAuditEntry({
        correlationId,
        entityType: 'manifest',
        entityId: id,
        direction: 'internal',
        component: 'manifest-service',
        httpMethod: 'DELETE',
        endpoint: '/v1/manifestos/:id',
        httpStatus: 200,
        sanitizedBody: {
          status: manifest.status,
          externalStatus: manifest.externalStatus,
          removed: true
        }
      });
    } catch {
    }
  }

  return {
    removed: true,
    id
  };
}

export async function listManifests(queryString: ManifestListQuery, correlationId: string | null = null, headers: HeaderMap = {}) {
  if (!queryString.integrationAccountId) {
    throw new AppError(400, 'Bad Request', 'integrationAccountId is required.');
  }

  const integrationAccountId = requireNonEmptyString(queryString.integrationAccountId, 'integrationAccountId is required.');
  const sessionContextId = toNullableString(queryString.sessionContextId);

  if (sessionContextId) {
    await requireOperationalSessionContext(integrationAccountId, sessionContextId);
  } else {
    await ensureIntegrationAccount(integrationAccountId);
  }

  queryString.integrationAccountId = integrationAccountId;
  queryString.sessionContextId = sessionContextId ?? undefined;

  const page = parsePage(queryString.page, 1);
  const pageSize = parsePageSize(queryString.pageSize, 20);
  const filters = buildManifestListFilters(queryString, page, pageSize);

  let result: PagedManifestResult = await repoListManifests(filters);
  result = await reconcileTransientManifests(result, filters);
  const initialItems = normalizeManifestListItems(result.items);
  const items = initialItems.map(mapManifestListItem);

  // Sincronizar com CETESB quando:
  // - forceSync=true (botão manual do usuário)
  // - Base local vazia
  // - Dados estão velhos (>1h sem sync)
  const forceSync = String(queryString.forceSync) === 'true';
  const needsSync = shouldSyncManifestMirror(queryString, result, forceSync);

  if (needsSync) {
    let syncWindow;
    let remoteSearch;
    let deletedLocalMirrorCount = 0;
    try {
      ({ remoteSearch, syncWindow } = await fetchRemoteManifestSearch(queryString, correlationId, headers, forceSync));
    } catch (error: unknown) {
      const { isCetesb5xx, remoteStatus } = isCetesb5xxFallback(error);

      if (!forceSync && isCetesb5xx) {
        return buildSyncFallback(items, page, pageSize, result.totalItems, remoteStatus);
      }

      throw error;
    }

    const remoteItems = extractRemoteSearchItems(remoteSearch);
    await persistRemoteSearchAudit(remoteSearch, correlationId, queryString.integrationAccountId);

    if (forceSync) {
      deletedLocalMirrorCount = await deleteManifestsForMirrorWindow({
        integrationAccountId: queryString.integrationAccountId,
        dateFrom: syncWindow.dateFrom,
        dateTo: syncWindow.dateTo
      });
    }

    if (remoteItems.length === 0) {
      if (!forceSync) {
        return buildSyncEmptyPreserveWarning(items, page, pageSize, result.totalItems, {
          dateFrom: syncWindow.dateFrom,
          dateTo: syncWindow.dateTo
        });
      }

      await reconcileGhostManifestsMissingFromRemoteSearch({
        integrationAccountId: queryString.integrationAccountId,
        dateFrom: syncWindow.dateFrom,
        dateTo: syncWindow.dateTo
      }, []);

      result = await repoListManifests(filters);
      const response = toPagedResponse(normalizeManifestListItems(result.items).map(mapManifestListItem), page, pageSize, result.totalItems) as LooseRecord;
      response.syncSummary = {
        mode: 'force',
        deletedLocalMirrorCount,
        remoteItemsCount: 0,
        dateFrom: syncWindow.dateFrom,
        dateTo: syncWindow.dateTo
      };
      return response;
    }

    const syncCorrelationId = correlationId || createPrefixedId('corr');
    for (const item of remoteItems) {
      const mapped = mapExternalManifestSearchItem(item);
      await upsertManifestFromExternalSearch({
        id: createPrefixedId('man'),
        integrationAccountId: queryString.integrationAccountId,
        sessionContextId: queryString.sessionContextId || null,
        status: mapped.status,
        externalStatus: mapped.externalStatus,
        externalReference: mapped.externalReference,
        externalHashCode: mapped.externalHashCode,
        payload: mapped.payload,
        requestedBy: 'cetesb.search',
        correlationId: syncCorrelationId,
        lastSyncAt: mapped.lastSyncAt
      });
    }

    await reconcileGhostManifestsMissingFromRemoteSearch({
      integrationAccountId: queryString.integrationAccountId,
      dateFrom: syncWindow.dateFrom,
      dateTo: syncWindow.dateTo
    }, remoteItems);

    result = await repoListManifests(filters);
    const response = toPagedResponse(normalizeManifestListItems(result.items).map(mapManifestListItem), page, pageSize, result.totalItems) as LooseRecord;
    if (forceSync) {
      response.syncSummary = {
        mode: 'force',
        deletedLocalMirrorCount,
        remoteItemsCount: remoteItems.length,
        dateFrom: syncWindow.dateFrom,
        dateTo: syncWindow.dateTo
      };
    }
    return response;
  }

  return toPagedResponse(items, page, pageSize, result.totalItems);
}

type ReceiptResponsible = {
  rrmCodigo: number | string | null;
  name: string | null;
  cargo: string | null;
};

/**
 * Lista síncrona de responsáveis pelo recebimento (para o destinador selecionar na baixa).
 * Fonte: gateway listReceiptResponsibles → CETESB listaResponsavelRecebimento/{parCodigo}.
 * Expõe apenas rrmCodigo/nome/cargo; NUNCA rrmAssinatura (dado sensível).
 */
export async function listReceiptResponsibles(
  queryString: { integrationAccountId?: string; sessionContextId?: string },
  correlationId: string | null = null,
  _headers: HeaderMap = {}
): Promise<{ items: ReceiptResponsible[] }> {
  const integrationAccountId = requireNonEmptyString(queryString.integrationAccountId, 'integrationAccountId is required.');
  const sessionContextId = toNullableString(queryString.sessionContextId);
  if (sessionContextId) {
    await requireOperationalSessionContext(integrationAccountId, sessionContextId);
  } else {
    await ensureIntegrationAccount(integrationAccountId);
  }

  if (typeof gateway.listReceiptResponsibles !== 'function') {
    return { items: [] };
  }

  const exchange = toRecord(await gateway.listReceiptResponsibles({
    integrationAccountId,
    sessionContextId: sessionContextId ?? undefined,
    correlationId,
    includeAudit: false
  }));
  const data = toRecord(toRecord(exchange['response'])['data']);
  const rawItems = Array.isArray(data['items']) ? data['items'] : [];

  const items = rawItems
    .map((raw): ReceiptResponsible | null => {
      const item = toRecord(raw);
      const rrmCodigo = item['rrmCodigo'];
      if (rrmCodigo == null || rrmCodigo === '') return null;
      return {
        rrmCodigo: (typeof rrmCodigo === 'number' || typeof rrmCodigo === 'string') ? rrmCodigo : null,
        name: toNullableString(item['rrmNome']),
        cargo: toNullableString(item['rrmCargo'])
      };
    })
    .filter((item): item is ReceiptResponsible => item != null && item.rrmCodigo != null);

  return { items };
}

type CdfResponsible = {
  cdrCodigo: number | string | null;
  name: string | null;
  cargo: string | null;
};

/**
 * Lista síncrona de responsáveis pela emissão de CDF (para o destinador selecionar na geração).
 * Fonte: gateway listCdfResponsibles → CETESB /api/mtr/responsavel/{parCodigo} (responsável técnico/CDF).
 * É uma lista DIFERENTE da de recebimento (rrmCodigo): aqui o código é cdrCodigo, que o worker
 * de cdf.generate revalida contra a lista remota. Expõe apenas cdrCodigo/nome/cargo; nunca assinatura.
 */
export async function listCdfResponsibles(
  queryString: { integrationAccountId?: string; sessionContextId?: string },
  correlationId: string | null = null,
  _headers: HeaderMap = {}
): Promise<{ items: CdfResponsible[] }> {
  const integrationAccountId = requireNonEmptyString(queryString.integrationAccountId, 'integrationAccountId is required.');
  const sessionContextId = toNullableString(queryString.sessionContextId);
  if (sessionContextId) {
    await requireOperationalSessionContext(integrationAccountId, sessionContextId);
  } else {
    await ensureIntegrationAccount(integrationAccountId);
  }

  if (typeof gateway.listCdfResponsibles !== 'function') {
    return { items: [] };
  }

  const exchange = toRecord(await gateway.listCdfResponsibles({
    integrationAccountId,
    sessionContextId: sessionContextId ?? undefined,
    correlationId,
    includeAudit: false
  }));
  const data = toRecord(toRecord(exchange['response'])['data']);
  const rawItems = Array.isArray(data['items']) ? data['items'] : [];

  const items = rawItems
    .map((raw): CdfResponsible | null => {
      const item = toRecord(raw);
      const cdrCodigo = item['cdrCodigo'];
      if (cdrCodigo == null || cdrCodigo === '') return null;
      return {
        cdrCodigo: (typeof cdrCodigo === 'number' || typeof cdrCodigo === 'string') ? cdrCodigo : null,
        name: toNullableString(item['cdrNome']),
        cargo: toNullableString(item['cdrCargo'])
      };
    })
    .filter((item): item is CdfResponsible => item != null && item.cdrCodigo != null);

  return { items };
}

function mapExternalManifestSearchItem(item: unknown) {
  const source = toRecord(item);
  const situacaoManifesto = toRecord(source['situacaoManifesto']);
  const state = toRecord(source['estado']);
  const parceiroGerador = toRecord(source['parceiroGerador']);
  const parceiroTransportador = toRecord(source['parceiroTransportador']);
  const parceiroDestinador = toRecord(source['parceiroDestinador']);
  const externalStatus = toNullableString(situacaoManifesto['simDescricao']);
  const normalizedStatus = normalizeInternalManifestStatus(situacaoManifesto['simCodigo'], externalStatus);
  const expeditionDate = parseCetesbDateToIsoDate(source['manDataExpedicao'])
    || parseCetesbDateToIsoDate(source['manData']);
  const lastSyncAt = parseCetesbDateToIsoDateTime(source['manData']) || new Date().toISOString();
  const residues = mapSnapshotResidues(source['listaManifestoResiduo']);

  return {
    status: normalizedStatus,
    externalStatus,
    externalReference: {
      manCodigo: toStringOrNumberOrNull(source['manCodigo']),
      manNumero: toStringOrNumberOrNull(source['manNumero'])
    },
    externalHashCode: toNullableString(source['manHashCode']),
    lastSyncAt,
    payload: {
      expeditionDate,
      responsibleName: toNullableString(source['manResponsavel']),
      driverName: toNullableString(source['manNomeMotorista']),
      vehiclePlate: toNullableString(source['manPlacaVeiculo']),
      notes: toNullableString(source['manObservacao']),
      state: {
        code: state['estCodigo'] ?? null,
        abbreviation: state['estAbreviacao'] ?? null
      },
      generator: {
        partnerCode: parceiroGerador['parCodigo'] ?? null,
        description: parceiroGerador['parDescricao'] ?? null
      },
      carrier: {
        partnerCode: parceiroTransportador['parCodigo'] ?? null,
        description: parceiroTransportador['parDescricao'] ?? null
      },
      receiver: {
        partnerCode: parceiroDestinador['parCodigo'] ?? null,
        description: parceiroDestinador['parDescricao'] ?? null
      },
      ...(residues.length > 0 ? { residues } : {}),
      externalSnapshot: source
    }
  };
}

function mapSnapshotResidueLine(line: unknown, index = 0): SnapshotResidue | null {
  if (!isRecord(line)) {
    return null;
  }

  const residue = toRecord(line['residuo']);
  const residueClass = toRecord(line['classe']);
  const unit = toRecord(line['unidade']);
  const treatment = toRecord(line['tratamento']);

  return {
    lineNumber: line['marNumeroLinha'] ?? (index + 1),
    quantity: line['marQuantidade'] ?? null,
    receivedQuantity: line['marQuantidadeRecebida'] ?? null,
    weightTon: line['marPesoTonelada'] ?? null,
    justification: line['marJustificativa'] ?? null,
    unit: {
      code: unit['uniCodigo'] ?? null,
      symbol: unit['uniSigla'] ?? null,
      description: unit['uniDescricao'] ?? null
    },
    treatment: {
      code: treatment['traCodigo'] ?? null,
      description: treatment['traDescricao'] ?? null
    },
    residue: {
      code: residue?.resCodigo ?? null,
      ibamaCode: residue?.resCodigoIbama ?? null,
      description: residue?.resDescricao ?? null
    },
    class: {
      code: residueClass?.claCodigo ?? null,
      description: residueClass?.claDescricao ?? null
    }
  };
}

function mapSnapshotResidues(rawList: unknown): SnapshotResidue[] {
  const source = Array.isArray(rawList) ? rawList : [];
  return source
    .map((line, index) => mapSnapshotResidueLine(line, index))
    .filter((line): line is SnapshotResidue => line != null);
}

function normalizeManifestResidues(payload: unknown = {}): unknown[] {
  const record = toRecord(payload);
  if (Array.isArray(record['residues'])) {
    return record['residues'].filter(Boolean);
  }

  const externalSnapshot = toRecord(record['externalSnapshot']);
  return mapSnapshotResidues(externalSnapshot['listaManifestoResiduo']);
}

function parsePdfQuantity(value: unknown): number | null {
  const normalized = toTrimmedString(value);
  if (!normalized) {
    return null;
  }

  const numeric = Number(normalized.replaceAll('.', '').replace(',', '.'));
  return Number.isFinite(numeric) ? numeric : null;
}

function parseResiduesFromPdfText(text: unknown): Array<{
  lineNumber: number;
  quantity: number | null;
  residue: { ibamaCode: string | null; description: string | null };
  class: { description: string | null };
}> {
  const normalized = (toPrimitiveString(text) ?? '').replaceAll('\r', '\n');
  const matches = [...normalized.matchAll(/(\d{6})-([^\n]+)/g)];
  if (!matches.length) {
    return [];
  }

  const parsed: Array<{
    lineNumber: number;
    quantity: number | null;
    residue: { ibamaCode: string | null; description: string | null };
    class: { description: string | null };
  }> = [];
  for (let index = 0; index < matches.length; index += 1) {
    const match = matches[index];
    const ibamaCode = match?.[1] || null;
    const description = toCollapsedString(match?.[2]);
    if (!ibamaCode || !description) {
      continue;
    }

    const start = Number(match?.index || 0);
    const nextStart = Number(matches[index + 1]?.index || (start + 500));
    const chunk = normalized.slice(start, Math.min(normalized.length, nextStart + 220));
    const quantityMatch = /(\d+,\d{2,4})/.exec(chunk);
    const classMatch = /CLASSE\s+([^\n]{1,32})/i.exec(chunk);

    parsed.push({
      lineNumber: index + 1,
      quantity: parsePdfQuantity(quantityMatch?.[1]),
      residue: {
        ibamaCode,
        description
      },
      class: {
        description: classMatch ? `Classe ${String(classMatch[1]).replaceAll(/\s+/g, ' ').trim()}` : null
      }
    });
  }

  const seen = new Set();
  return parsed.filter((item) => {
    const key = `${item.residue?.ibamaCode || ''}|${item.residue?.description || ''}`;
    if (seen.has(key)) {
      return false;
    }
    seen.add(key);
    return true;
  });
}

async function extractTextFromPdfBuffer(pdfBuffer: Buffer): Promise<string> {
  if (!pdfBuffer || pdfBuffer.length === 0) {
    return '';
  }

  const module = require('pdf-parse');
  const parser = new module.PDFParse({ data: pdfBuffer });
  try {
    const textResult = await parser.getText();
    return String(textResult?.text || '');
  } finally {
    await parser.destroy();
  }
}

async function enrichManifestResiduesFromPdf(manifest: ManifestLike | null) {
  if (!manifest?.externalHashCode || config.cetesbGatewayMode !== 'real') {
    return null;
  }

  const payload = manifest.payload || {};
  const existingResidues = normalizeManifestResidues(payload);
  if (existingResidues.length > 0) {
    return null;
  }

  try {
    const exchange = await gateway.printManifest(manifest);
    const pdfBuffer = exchange?.response?.data?.pdfBuffer;
    if (!pdfBuffer || pdfBuffer.length === 0) {
      return null;
    }

    const normalizedPdfBuffer = Buffer.isBuffer(pdfBuffer) ? pdfBuffer : Buffer.from(pdfBuffer);
    const pdfText = await extractTextFromPdfBuffer(normalizedPdfBuffer);
    const residues = parseResiduesFromPdfText(pdfText);
    if (!residues.length) {
      return null;
    }

    const updated = await updateManifest(manifest.id, {
      payload: {
        ...payload,
        residues
      },
      lastSyncAt: new Date().toISOString()
    });

    await storeManifestPdf(
      requireManifest(updated, `Falha ao atualizar manifesto ${manifest.id} após leitura do PDF.`),
      normalizedPdfBuffer
    );
    return updated;
  } catch {
    return null;
  }
}

function parseEpochDateValue(value: unknown): Date | null {
  if (typeof value === 'number' && Number.isFinite(value)) {
    return new Date(value > 10_000_000_000 ? value : value * 1000);
  }

  const normalized = toTrimmedString(value);
  if (!/^\d{10,13}$/.test(normalized)) {
    return null;
  }

  const numeric = Number(normalized);
  if (!Number.isFinite(numeric)) {
    return null;
  }

  return new Date(normalized.length >= 13 ? numeric : numeric * 1000);
}

function toValidDateOrNull(date: unknown): Date | null {
  if (!(date instanceof Date)) {
    return null;
  }

  return Number.isNaN(date.getTime()) ? null : date;
}

function parseBrazilianDate(value: string, includeTime = false): string | null {
  const match = includeTime
    ? /^(\d{2})[/-](\d{2})[/-](\d{4})(?:\s+(\d{2}):(\d{2})(?::(\d{2}))?)?$/.exec(value)
    : /^(\d{2})[/-](\d{2})[/-](\d{4})$/.exec(value);

  if (!match) {
    return null;
  }

  if (!includeTime) {
    const [, day, month, year] = match;
    return `${year}-${month}-${day}`;
  }

  const [, day, month, year, hour = '00', minute = '00', second = '00'] = match;
  return `${year}-${month}-${day}T${hour}:${minute}:${second}.000Z`;
}

function parseIsoDatePrefix(value: string): string | null {
  const match = /^(\d{4})-(\d{2})-(\d{2})/.exec(value);
  return match ? `${match[1]}-${match[2]}-${match[3]}` : null;
}

function parseCetesbDateToIsoDate(value: unknown): string | null {
  if (!value) {
    return null;
  }

  const parsedFromEpoch = toValidDateOrNull(parseEpochDateValue(value));
  if (parsedFromEpoch) {
    return parsedFromEpoch.toISOString().slice(0, 10);
  }

  const normalized = toTrimmedString(value);
  const brDate = parseBrazilianDate(normalized);
  if (brDate) {
    return brDate;
  }

  const isoDate = parseIsoDatePrefix(normalized);
  if (isoDate) {
    return isoDate;
  }

  return toValidDateOrNull(new Date(normalized))?.toISOString().slice(0, 10) || null;
}

function parseCetesbDateToIsoDateTime(value: unknown): string | null {
  if (!value) {
    return null;
  }

  const parsedFromEpoch = toValidDateOrNull(parseEpochDateValue(value));
  if (parsedFromEpoch) {
    return parsedFromEpoch.toISOString();
  }

  const normalized = toTrimmedString(value);
  const brDateTime = parseBrazilianDate(normalized, true);
  if (brDateTime) {
    return brDateTime;
  }

  return toValidDateOrNull(new Date(normalized))?.toISOString() || null;
}

function normalizeInternalManifestStatus(simCodigo: unknown, simDescricao: unknown): string {
  const normalizedDescription = toTrimmedString(simDescricao);
  if (simCodigo === 4 || /cancelad/i.test(normalizedDescription)) {
    return 'cancelled';
  }
  if (simCodigo === 1 || simCodigo === 2 || simCodigo === 3 || /salvo|recebido|em\s*tr[aâ]nsito/i.test(normalizedDescription)) {
    return 'submitted';
  }
  return 'submitted';
}

async function enqueueManifestSubmitInternal(
  id: string,
  body: ManifestSubmitBody,
  headers: HeaderMap,
  correlationId: string | null
) {
  const manifest = await findManifestById(id);
  if (!manifest) throw new AppError(404, 'Not Found', `Manifesto ${id} was not found.`);

  const idempotencyKey = headers['idempotency-key'];
  const reused = await getIdempotentResponse(`manifest.submit:${id}`, idempotencyKey);
  if (reused) return reused;

  const effectiveSessionContextId = toNullableString(body.sessionContextId) || manifest.sessionContextId;
  if (effectiveSessionContextId) {
    const sessionContext = await findSessionContextById(effectiveSessionContextId);
    if (!sessionContext) {
      throw new AppError(400, 'Bad Request', `sessionContextId ${effectiveSessionContextId} was not found.`);
    }
  } else {
    throw new AppError(400, 'Bad Request', 'sessionContextId é obrigatório para submit de manifesto.');
  }

  const jobId = createPrefixedId('job');
  const commandId = createPrefixedId('cmd');
  const operation = 'manifest.submit';
  const retryConfig = getRetryConfig(operation);
  const priority = calculateJobPriority(operation);
  const { job: enqueuedJob } = await withTransaction(async (client) => {
    const lockedManifest = await findManifestByIdForUpdate(id, client);
    if (!lockedManifest) {
      throw new AppError(404, 'Not Found', `Manifesto ${id} was not found.`);
    }

    await updateManifest(id, { status: 'queued_submit', sessionContextId: effectiveSessionContextId }, client);

    return insertJobDeduplicated({
      jobId,
      commandId,
      entityType: 'manifest',
      entityId: id,
      operation,
      payload: { ...body, sessionContextId: effectiveSessionContextId } as JsonObject,
      status: 'queued',
      maxAttempts: retryConfig.maxAttempts,
      correlationId,
      idempotencyKey,
      priority,
      retryStrategy: retryConfig.strategy,
      baseDelayMs: retryConfig.baseDelayMs,
      maxDelayMs: retryConfig.maxDelayMs,
      tags: extractJobTags({ operation, entityType: 'manifest', status: 'queued' })
    }, client);
  });

  if (!enqueuedJob) {
    throw new AppError(500, 'Internal Server Error', `Falha ao enfileirar submit do manifesto ${id}.`, {
      code: 'MANIFEST_SUBMIT_ENQUEUE_FAILED'
    });
  }

  const response = buildCommandAccepted({
    commandId: enqueuedJob.commandId || commandId,
    jobId: enqueuedJob.jobId,
    correlationId: ensureCorrelationId(correlationId),
    entityType: 'manifest',
    entityId: id,
    operation: 'manifest.submit'
  });
  await rememberIdempotentResponse({ operation: `manifest.submit:${id}`, idempotencyKey, entityType: 'manifest', entityId: id, response });
  return response;
}

export async function enqueueManifestSubmit(
  id: string,
  body: ManifestSubmitBody,
  headers: HeaderMap,
  correlationId: string | null
) {
  return enqueueManifestSubmitInternal(id, body, headers, correlationId);
}

export async function enqueueManifestBatchSubmit(
  body: ManifestBatchBody,
  headers: HeaderMap,
  correlationId: string | null
) {
  const manifestIds = normalizeBatchManifestIds(body?.manifestIds);

  if (manifestIds.length === 0) {
    throw new AppError(400, 'Bad Request', 'manifestIds must contain at least one manifesto id.');
  }

  const groupId = requireNonEmptyString(body?.groupId || createPrefixedId('grp'), 'groupId inválido.');
  const conversationDeterministic = toRecord(body?.conversationDeterministic);
  const baseIdempotencyKey = String(headers?.['idempotency-key'] || '').trim() || null;
  const items = [];

  for (let index = 0; index < manifestIds.length; index += 1) {
    const manifestId = normalizeManifestId(manifestIds[index]);
    const manifest = await findManifestById(manifestId);
    if (!manifest) {
      throw new AppError(404, 'Not Found', `Manifesto ${manifestId} was not found.`);
    }

    const itemHeaders = { ...headers };
    if (baseIdempotencyKey) {
      itemHeaders['idempotency-key'] = `${baseIdempotencyKey}:${manifestId}`;
    }

    const response = await enqueueManifestSubmitInternal(
      manifestId,
      {
        sessionContextId: toNullableString(body?.sessionContextId) ?? manifest.sessionContextId ?? null,
        validateOnly: Boolean(body?.validateOnly),
        printAfterSubmit: Boolean(body?.printAfterSubmit),
        requestedBy: toNullableString(body?.requestedBy),
        conversationDeterministic: {
          ...conversationDeterministic,
          selectedManifestIds: manifestIds,
          selectedManifestId: manifestId
        },
        batch: buildBatchMetadata({
          groupId,
          index: index + 1,
          count: manifestIds.length,
          kind: 'batch_submit'
        })
      },
      itemHeaders,
      correlationId
    );

    items.push(response);
  }

  return buildBatchResponse({
    groupId,
    operation: 'manifest.batch_submit',
    items
  });
}

export async function enqueueManifestPrint(
  id: string,
  body: LooseRecord,
  headers: HeaderMap,
  correlationId: string | null
) {
  const manifest = await findManifestById(id);
  if (!manifest) throw new AppError(404, 'Not Found', `Manifesto ${id} was not found.`);

  const idempotencyKey = headers['idempotency-key'];
  const reused = await getIdempotentResponse(`manifest.print:${id}`, idempotencyKey);
  if (reused) return reused;

  const jobId = createPrefixedId('job');
  const commandId = createPrefixedId('cmd');
  const operation = 'manifest.print';
  const retryConfig = getRetryConfig(operation);
  const priority = calculateJobPriority(operation);
  const { job: enqueuedJob } = await withTransaction(async (client) => {
    const lockedManifest = await findManifestByIdForUpdate(id, client);
    if (!lockedManifest) {
      throw new AppError(404, 'Not Found', `Manifesto ${id} was not found.`);
    }

    await updateManifest(id, { status: 'queued_print' }, client);

    return insertJobDeduplicated({
      jobId,
      commandId,
      entityType: 'manifest',
      entityId: id,
      operation,
      payload: body as JsonObject,
      status: 'queued',
      maxAttempts: retryConfig.maxAttempts,
      correlationId,
      idempotencyKey,
      priority,
      retryStrategy: retryConfig.strategy,
      baseDelayMs: retryConfig.baseDelayMs,
      maxDelayMs: retryConfig.maxDelayMs,
      tags: extractJobTags({ operation, entityType: 'manifest', status: 'queued' })
    }, client);
  });

  if (!enqueuedJob) {
    throw new AppError(500, 'Internal Server Error', `Falha ao enfileirar impressão do manifesto ${id}.`, {
      code: 'MANIFEST_PRINT_ENQUEUE_FAILED'
    });
  }

  const response = buildCommandAccepted({
    commandId: enqueuedJob.commandId || commandId,
    jobId: enqueuedJob.jobId,
    correlationId: ensureCorrelationId(correlationId),
    entityType: 'manifest',
    entityId: id,
    operation: 'manifest.print'
  });
  await rememberIdempotentResponse({ operation: `manifest.print:${id}`, idempotencyKey, entityType: 'manifest', entityId: id, response });
  return response;
}

async function enqueueManifestCancelInternal(
  id: string,
  body: ManifestCancelBody,
  headers: HeaderMap,
  correlationId: string | null
) {
  const manifest = await findManifestById(id);
  if (!manifest) throw new AppError(404, 'Not Found', `Manifesto ${id} was not found.`);

  const idempotencyKey = headers['idempotency-key'];
  const reused = await getIdempotentResponse(`manifest.cancel:${id}`, idempotencyKey);
  if (reused) return reused;

  const jobId = createPrefixedId('job');
  const commandId = createPrefixedId('cmd');
  const operation = 'manifest.cancel';
  const retryConfig = getRetryConfig(operation);
  const priority = calculateJobPriority(operation);
  const { job: enqueuedJob } = await withTransaction(async (client) => {
    const lockedManifest = await findManifestByIdForUpdate(id, client);
    if (!lockedManifest) {
      throw new AppError(404, 'Not Found', `Manifesto ${id} was not found.`);
    }

    await updateManifest(id, { status: 'queued_cancel' }, client);

    return insertJobDeduplicated({
      jobId,
      commandId,
      entityType: 'manifest',
      entityId: id,
      operation,
      payload: body as JsonObject,
      status: 'queued',
      maxAttempts: retryConfig.maxAttempts,
      correlationId,
      idempotencyKey,
      priority,
      retryStrategy: retryConfig.strategy,
      baseDelayMs: retryConfig.baseDelayMs,
      maxDelayMs: retryConfig.maxDelayMs,
      tags: extractJobTags({ operation, entityType: 'manifest', status: 'queued' })
    }, client);
  });

  if (!enqueuedJob) {
    throw new AppError(500, 'Internal Server Error', `Falha ao enfileirar cancelamento do manifesto ${id}.`, {
      code: 'MANIFEST_CANCEL_ENQUEUE_FAILED'
    });
  }

  const response = buildCommandAccepted({
    commandId: enqueuedJob.commandId || commandId,
    jobId: enqueuedJob.jobId,
    correlationId: ensureCorrelationId(correlationId),
    entityType: 'manifest',
    entityId: id,
    operation: 'manifest.cancel'
  });
  await rememberIdempotentResponse({ operation: `manifest.cancel:${id}`, idempotencyKey, entityType: 'manifest', entityId: id, response });
  return response;
}

export async function enqueueManifestCancel(
  id: string,
  body: ManifestCancelBody,
  headers: HeaderMap,
  correlationId: string | null
) {
  return enqueueManifestCancelInternal(id, body, headers, correlationId);
}

export async function enqueueManifestBatchCancel(
  body: ManifestBatchBody,
  headers: HeaderMap,
  correlationId: string | null
) {
  const manifestIds = normalizeBatchManifestIds(body?.manifestIds);

  if (manifestIds.length === 0) {
    throw new AppError(400, 'Bad Request', 'manifestIds must contain at least one manifesto id.');
  }

  const reason = String(body?.reason || '').trim();
  if (reason.length < 3) {
    throw new AppError(400, 'Bad Request', 'reason must contain at least 3 characters.');
  }

  const missingManifestIds = [];
  for (const manifestId of manifestIds) {
    const manifest = await findManifestById(normalizeManifestId(manifestId));
    if (!manifest) {
      missingManifestIds.push(manifestId);
    }
  }

  if (missingManifestIds.length > 0) {
    throw new AppError(404, 'Not Found', `Manifestos were not found: ${missingManifestIds.join(', ')}.`);
  }

  const groupId = requireNonEmptyString(body?.groupId || createPrefixedId('grp'), 'groupId inválido.');
  const conversationDeterministic = toRecord(body?.conversationDeterministic);
  const baseIdempotencyKey = String(headers?.['idempotency-key'] || '').trim() || null;
  const items = [];

  for (let index = 0; index < manifestIds.length; index += 1) {
    const manifestId = normalizeManifestId(manifestIds[index]);
    const itemHeaders = { ...headers };
    if (baseIdempotencyKey) {
      itemHeaders['idempotency-key'] = `${baseIdempotencyKey}:${manifestId}`;
    }

    const response = await enqueueManifestCancelInternal(
      manifestId,
      {
        requestedBy: toNullableString(body?.requestedBy),
        reason,
        conversationDeterministic: {
          ...conversationDeterministic,
          selectedManifestIds: manifestIds,
          selectedManifestId: manifestId
        },
        batch: buildBatchMetadata({
          groupId,
          index: index + 1,
          count: manifestIds.length,
          kind: 'batch_cancel'
        })
      },
      itemHeaders,
      correlationId
    );

    items.push(response);
  }

  return buildBatchResponse({
    groupId,
    operation: 'manifest.batch_cancel',
    items
  });
}

export async function enqueueManifestReceive(
  body: ManifestReceiveBody,
  headers: HeaderMap,
  correlationId: string | null
) {
  const integrationAccountId = requireNonEmptyString(body?.integrationAccountId, 'integrationAccountId is required.');
  const sessionContextId = requireNonEmptyString(body?.sessionContextId, 'sessionContextId is required.');
  const receiptPayload = toRecord(body?.receiptPayload);

  if (Object.keys(receiptPayload).length === 0) {
    throw new AppError(400, 'Bad Request', 'receiptPayload is required.');
  }

  return enqueueDetachedCommand({
    operation: 'manifest.receive',
    entityType: 'manifestReceipt',
    entityIdPrefix: 'mrc',
    integrationAccountId,
    sessionContextId,
    requestedBy: toNullableString(body?.requestedBy),
    payload: {
      receiptPayload,
      printReceiptAfterReceive: Boolean(body?.printReceiptAfterReceive)
    },
    headers,
    correlationId,
    idempotencyOperation: 'manifest.receive'
  });
}

export async function enqueueCdfGenerate(
  body: CdfGenerateBody,
  headers: HeaderMap,
  correlationId: string | null
) {
  const integrationAccountId = requireNonEmptyString(body?.integrationAccountId, 'integrationAccountId is required.');
  const sessionContextId = requireNonEmptyString(body?.sessionContextId, 'sessionContextId is required.');
  const cdfPayload = toRecord(body?.cdfPayload);

  if (Object.keys(cdfPayload).length === 0) {
    throw new AppError(400, 'Bad Request', 'cdfPayload is required.');
  }

  return enqueueDetachedCommand({
    operation: 'cdf.generate',
    entityType: 'cdf',
    entityIdPrefix: 'cdf',
    integrationAccountId,
    sessionContextId,
    requestedBy: toNullableString(body?.requestedBy),
    payload: { cdfPayload },
    headers,
    correlationId,
    idempotencyOperation: 'cdf.generate'
  });
}

export async function enqueueCdfDownload(
  body: CdfDownloadBody,
  headers: HeaderMap,
  correlationId: string | null
) {
  const integrationAccountId = requireNonEmptyString(body?.integrationAccountId, 'integrationAccountId is required.');
  const sessionContextId = requireNonEmptyString(body?.sessionContextId, 'sessionContextId is required.');
  const documentId = requireNonEmptyString(
    body?.documentId || body?.certificateHashCode || body?.cerHashCode,
    'documentId is required.'
  );

  return enqueueDetachedCommand({
    operation: 'cdf.download',
    entityType: 'cdf',
    entityIdPrefix: 'cdf',
    integrationAccountId,
    sessionContextId,
    requestedBy: toNullableString(body?.requestedBy),
    payload: {
      documentId,
      certificateCriteria: {
        documentId,
        cerHashCode: body?.cerHashCode || body?.certificateHashCode || body?.documentId || null,
        cerCodigo: body?.cerCodigo || null,
        cerNumero: body?.cerNumero || null,
        cerDataInicial: body?.cerDataInicial || body?.dateFrom || null,
        cerDataFinal: body?.cerDataFinal || body?.dateTo || null,
        cerObservacao: body?.cerObservacao || null,
        dateFrom: body?.dateFrom || body?.cerDataInicial || null,
        dateTo: body?.dateTo || body?.cerDataFinal || null
      }
    },
    headers,
    correlationId,
    idempotencyOperation: 'cdf.download'
  });
}

function buildCdfDocumentDownloadUrl(documentId: string, integrationAccountId: string, sessionContextId: string | null) {
  const params = new URLSearchParams({ integrationAccountId });
  if (sessionContextId) {
    params.set('sessionContextId', sessionContextId);
  }
  return `/v1/cdf/documents/${encodeURIComponent(documentId)}?${params.toString()}`;
}

function mapCdfCertificateListItem(item: unknown, integrationAccountId: string, sessionContextId: string | null) {
  const source = toRecord(item);
  const receiver = toRecord(source['parceiroDestinador']);
  const certificateType = toRecord(source['tipoCertificadoDestinacao']);
  const responsible = toRecord(source['responsavel']);
  const documentId = toNullableString(source['cerHashCode']);
  const fallbackDocumentId = toTrimmedString(source['cerCodigo']);

  return {
    id: documentId || fallbackDocumentId,
    certificateCode: toStringOrNumberOrNull(source['cerCodigo']),
    documentId,
    issuedAt: parseCetesbDateToIsoDateTime(source['cerData']),
    dateFrom: parseCetesbDateToIsoDate(source['cerDataInicial']),
    dateTo: parseCetesbDateToIsoDate(source['cerDataFinal']),
    notes: toNullableString(source['cerObservacao']),
    receiver: {
      partnerCode: toStringOrNumberOrNull(receiver['parCodigo']),
      description: toNullableString(receiver['parDescricao'])
    },
    type: {
      code: toStringOrNumberOrNull(certificateType['tcdCodigo']),
      description: toNullableString(certificateType['tcdDescricao'])
    },
    responsibleName: toNullableString(responsible['cdrNome']),
    downloadUrl: documentId ? buildCdfDocumentDownloadUrl(documentId, integrationAccountId, sessionContextId) : null,
    externalSnapshot: source
  };
}

export async function listCdfCertificates(
  queryString: CdfCertificateQuery,
  correlationId: string | null = null,
  headers: HeaderMap = {}
) {
  const integrationAccountId = requireNonEmptyString(queryString.integrationAccountId, 'integrationAccountId is required.');
  const sessionContextId = toNullableString(queryString.sessionContextId);

  if (sessionContextId) {
    await requireOperationalSessionContext(integrationAccountId, sessionContextId);
  } else {
    await ensureIntegrationAccount(integrationAccountId);
  }

  const shouldUseRequestJwt = !sessionContextId;
  const { requestJwtToken, requestPartnerCode } = resolveGatewayRequestAuth(shouldUseRequestJwt, headers);
  const remoteSearch = await gateway.searchCdfCertificates({
    integrationAccountId,
    sessionContextId,
    jwtToken: shouldUseRequestJwt ? requestJwtToken : null,
    partnerCode: requestPartnerCode,
    correlationId,
    includeAudit: true,
    dateFrom: toNullableString(queryString.dateFrom),
    dateTo: toNullableString(queryString.dateTo)
  });

  await persistRemoteSearchAudit(remoteSearch, correlationId, integrationAccountId, 'cdf.certificate.search');

  const items = extractRemoteSearchItems(remoteSearch).map((item) => mapCdfCertificateListItem(item, integrationAccountId, sessionContextId));

  return {
    source: 'cetesb',
    integrationAccountId,
    sessionContextId,
    dateFrom: toNullableString(queryString.dateFrom),
    dateTo: toNullableString(queryString.dateTo),
    message: extractRemoteSearchMessage(remoteSearch),
    totalItems: items.length,
    items
  };
}

export async function getCdfDocumentBuffer(
  documentId: string,
  queryString: CdfCertificateQuery,
  correlationId: string | null = null,
  headers: HeaderMap = {}
) {
  const integrationAccountId = requireNonEmptyString(queryString.integrationAccountId, 'integrationAccountId is required.');
  const sessionContextId = toNullableString(queryString.sessionContextId);

  if (sessionContextId) {
    await requireOperationalSessionContext(integrationAccountId, sessionContextId);
  } else {
    await ensureIntegrationAccount(integrationAccountId);
  }

  const storedDocument = await findAsyncOperationDocumentByHash('cdf', documentId, integrationAccountId);
  if (storedDocument) {
    return {
      mimeType: storedDocument.mimeType,
      fileName: storedDocument.fileName,
      buffer: await fs.readFile(storedDocument.storagePath)
    };
  }

  const shouldUseRequestJwt = !sessionContextId;
  const { requestJwtToken, requestPartnerCode } = resolveGatewayRequestAuth(shouldUseRequestJwt, headers);
  const exchange = await gateway.printCdfCertificate(documentId, {
    integrationAccountId,
    sessionContextId,
    jwtToken: shouldUseRequestJwt ? requestJwtToken : null,
    partnerCode: requestPartnerCode,
    correlationId,
    includeAudit: true
  });

  const pdfBuffer = exchange?.response?.data?.pdfBuffer;
  if (!pdfBuffer || pdfBuffer.length === 0) {
    throw new AppError(502, 'Bad Gateway', `Documento CDF ${documentId} não retornou conteúdo PDF.`, {
      code: 'CDF_DOCUMENT_EMPTY'
    });
  }

  return {
    mimeType: 'application/pdf',
    fileName: `cdf_${documentId}.pdf`,
    buffer: Buffer.isBuffer(pdfBuffer) ? pdfBuffer : Buffer.from(pdfBuffer)
  };
}

export async function storeManifestPdf(manifest: ManifestLike, pdfBuffer: Buffer) {
  const dir = resolveStoragePath('documents', manifest.id);
  await ensureDir(dir);
  const number = manifest.externalReference?.manNumero || manifest.id;
  const fileName = `mtr_${number}.pdf`;
  const storagePath = resolveStoragePath('documents', manifest.id, fileName);
  await fs.writeFile(storagePath, pdfBuffer);

  const document = await upsertManifestDocument({
    id: createPrefixedId('doc'),
    manifestId: manifest.id,
    type: 'manifest_pdf',
    status: 'available',
    mimeType: 'application/pdf',
    fileName,
    hash: manifest.externalHashCode || '',
    storagePath
  });

  // HANDOFF 4: Retornar documento completo com downloadUrl para job payload
  return document;
}

export async function storeAsyncOperationPdf(options: {
  entityType: string;
  entityId: string;
  documentType: string;
  fileName: string;
  pdfBuffer: Buffer;
  hash?: string | null;
  metadata?: Record<string, unknown>;
}) {
  const dir = resolveStoragePath('documents', options.entityType, options.entityId);
  await ensureDir(dir);
  const storagePath = resolveStoragePath('documents', options.entityType, options.entityId, options.fileName);
  await fs.writeFile(storagePath, options.pdfBuffer);

  return upsertAsyncOperationDocument({
    id: createPrefixedId('doc'),
    ownerEntityType: options.entityType,
    ownerEntityId: options.entityId,
    type: options.documentType,
    status: 'available',
    mimeType: 'application/pdf',
    fileName: options.fileName,
    hash: options.hash || null,
    storagePath,
    metadata: options.metadata || {}
  });
}

export async function buildPrintPdf(manifest: ManifestLike) {
  const payload = toPayload(manifest.payload);
  const generator = toRecord(payload.generator);
  const carrier = toRecord(payload.carrier);
  const receiver = toRecord(payload.receiver);
  const lines = [
    'MTR CETESB - Manifesto de Transporte de Resíduos',
    `Manifesto interno: ${manifest.id}`,
    `Número externo: ${manifest.externalReference?.manNumero || 'não disponível'}`,
    `Código externo: ${manifest.externalReference?.manCodigo || 'não disponível'}`,
    `Gerador: ${toNullableString(generator['description']) || '-'}`,
    `Transportador: ${toNullableString(carrier['description']) || '-'}`,
    `Destinador: ${toNullableString(receiver['description']) || '-'}`,
    `Responsável: ${toNullableString(payload.responsibleName) || '-'}`,
    `Motorista: ${toNullableString(payload.driverName) || '-'}`,
    `Placa: ${toNullableString(payload.vehiclePlate) || '-'}`,
    `Data expedição: ${toNullableString(payload.expeditionDate) || '-'}`,
    `Hash CETESB: ${manifest.externalHashCode || '-'}`
  ];
  return buildSimplePdf(lines);
}

export async function getManifestDocumentStream(manifestId: string, documentId: string) {
  const document = await findManifestDocument(manifestId, documentId);
  if (!document) {
    throw new AppError(404, 'Not Found', `Documento ${documentId} não encontrado para o manifesto ${manifestId}.`);
  }

  const manifest = await findManifestById(manifestId);
  const manifestNumber = toTrimmedString(manifest?.externalReference?.manNumero);

  if (!manifestNumber) {
    return document;
  }

  const extensionMatch = /\.([a-zA-Z0-9]+)$/.exec(String(document.fileName || ''));
  const extension = extensionMatch?.[1] ? `.${extensionMatch[1].toLowerCase()}` : '.pdf';

  return {
    ...document,
    fileName: `mtr_${manifestNumber}${extension}`
  };
}

function toManifestDetail(manifest: ManifestLike, documents: unknown[]) {
  const payload = toPayload(manifest.payload);
  const residues = normalizeManifestResidues(payload);
  const batch = toRecord(payload.batch);
  return {
    id: manifest.id,
    integrationAccountId: manifest.integrationAccountId,
    sessionContextId: manifest.sessionContextId,
    status: manifest.status,
    externalStatus: manifest.externalStatus,
    manifestNumber: manifest.externalReference?.manNumero || null,
    externalCode: manifest.externalReference?.manCodigo || null,
    externalHashCode: manifest.externalHashCode || null,
    requestedBy: manifest.requestedBy,
    groupId: toNullableString(batch['groupId']),
    sourceManifestId: toNullableString(batch['sourceManifestId']),
    batchIndex: toNullableNumber(batch['index']),
    batchSize: toNullableNumber(batch['count']),
    batchKind: toNullableString(batch['kind']),
    ...payload,
    residues,
    documents,
    createdAt: manifest.createdAt,
    updatedAt: manifest.updatedAt,
    lastSubmittedAt: manifest.lastSubmittedAt,
    lastSyncAt: manifest.lastSyncAt
  };
}

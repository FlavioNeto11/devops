import { AppError } from '../lib/problem.js';
import { buildCommandAccepted } from '../lib/command-response.js';
import { createPrefixedId } from '../lib/ids.js';
import {
  searchJobs,
  searchAuditEntries,
  getOperationsOverviewSummary,
  getAccountsHealth,
  getSessionsHealth,
  searchReportsMtrs,
  type AccountHealthRow,
  type AuditSearchRow,
  type JobSearchRow,
  type ReportsMtrRow,
  type SessionHealthRow
} from '../repositories/operations-repo.js';
import {
  findJobById,
  insertJob,
  requeueFromDLQ
} from '../repositories/job-repo.js';
import { query } from '../db/pool.js';
import {
  getIdempotentResponse,
  rememberIdempotentResponse
} from './idempotency-service.js';
import {
  calculateJobPriority,
  extractJobTags,
  getRetryConfig
} from '../lib/retry.js';
import {
  describeOperationalStatus,
  mapJobToOperationalStatus,
  type OperationalStatusDescriptor
} from '../lib/operational-status.js';

type LooseRecord = Record<string, unknown>;
type HeaderMap = Record<string, string | undefined>;

const DEFAULT_PAGE_SIZE = 20;
const MAX_PAGE_SIZE = 200;
const REPORTS_EXPORT_MAX_ROWS = 5000;

const TERMINAL_RETRYABLE_STATUSES = new Set(['failed', 'cancelled', 'dlq']);

function toScalarString(raw: unknown): string {
  if (raw === null || raw === undefined) return '';
  if (typeof raw === 'string') return raw;
  if (typeof raw === 'number' || typeof raw === 'boolean') return String(raw);
  return '';
}

function parsePage(raw: unknown, fallback = 1): number {
  const value = Number.parseInt(toScalarString(raw), 10);
  if (Number.isFinite(value) && value > 0) return value;
  return fallback;
}

function parsePageSize(raw: unknown, fallback = DEFAULT_PAGE_SIZE): number {
  const value = Number.parseInt(toScalarString(raw), 10);
  if (!Number.isFinite(value) || value <= 0) return fallback;
  return Math.min(value, MAX_PAGE_SIZE);
}

function parseInteger(raw: unknown): number | null {
  const value = Number.parseInt(toScalarString(raw), 10);
  return Number.isFinite(value) ? value : null;
}

function toIso(value: string | Date | null | undefined): string | null {
  if (!value) return null;
  if (value instanceof Date) return value.toISOString();
  return value;
}

function toCsvRow(values: Array<string | number | null | undefined>): string {
  return values
    .map((value) => {
      if (value === null || value === undefined) return '';
      const text = String(value);
      if (/[",\n]/.test(text)) {
        return `"${text.replace(/"/g, '""')}"`;
      }
      return text;
    })
    .join(',');
}

function buildPageMeta(page: number, pageSize: number, totalItems: number) {
  const totalPages = totalItems === 0 ? 0 : Math.ceil(totalItems / pageSize);
  return { page, pageSize, totalItems, totalPages };
}

/**
 * Mapeia status de job para `operationalStatus` (taxonomia canônica fase 04).
 * Delega para `mapJobToOperationalStatus` em `src/lib/operational-status.ts`,
 * preservando a assinatura usada por testes e callers existentes.
 */
export function mapOperationalStatus(job: {
  status: string;
  attempts?: number;
  lastErrorCode?: string | null;
  dlqReason?: string | null;
  resultSummary?: string | null;
}): string {
  return mapJobToOperationalStatus(job);
}

function enrichOperationalStatus<T extends { operationalStatus: string }>(
  item: T
): T & {
  label: string;
  severity: OperationalStatusDescriptor['severity'];
  recommendedAction: string;
  retryable: OperationalStatusDescriptor['retryable'];
  bucket: OperationalStatusDescriptor['bucket'];
} {
  const descriptor = describeOperationalStatus(item.operationalStatus);
  return {
    ...item,
    label: descriptor.label,
    severity: descriptor.severity,
    recommendedAction: descriptor.recommendedAction,
    retryable: descriptor.retryable,
    bucket: descriptor.bucket
  };
}

export type OperationsOverviewResponse = {
  generatedAt: string;
  jobs: {
    queued: number;
    running: number;
    retry_wait: number;
    succeeded_24h: number;
    failed_24h: number;
    dlq_total: number;
  };
  manifests: {
    total: number;
    submitted: number;
    printed: number;
    cancelled: number;
    draft_or_failed: number;
  };
  accounts: { total: number; active: number };
  sessions: {
    active: number;
    pending_auth: number;
    expired: number;
    invalid: number;
    revoked: number;
  };
  recentDlq: Array<{
    jobId: string;
    operation: string;
    entityType: string;
    entityId: string;
    dlqReason: string | null;
    movedAt: string | null;
    operationalStatus: string;
    label: string;
    severity: OperationalStatusDescriptor['severity'];
    recommendedAction: string;
    retryable: OperationalStatusDescriptor['retryable'];
    bucket: OperationalStatusDescriptor['bucket'];
  }>;
  recentJobs: Array<OverviewRecentJobItem>;
  recentErrors: Array<OverviewRecentJobItem>;
};

export type OverviewRecentJobItem = {
  jobId: string;
  operation: string;
  entityType: string;
  entityId: string;
  status: string;
  attempts: number;
  lastErrorCode: string | null;
  lastErrorMessage: string | null;
  dlqReason: string | null;
  queuedAt: string | null;
  startedAt: string | null;
  finishedAt: string | null;
  correlationId: string | null;
  operationalStatus: string;
  label: string;
  severity: OperationalStatusDescriptor['severity'];
  recommendedAction: string;
  retryable: OperationalStatusDescriptor['retryable'];
  bucket: OperationalStatusDescriptor['bucket'];
  links: { self: string; events: string; retry: string; audit: string | null };
};

function mapOverviewRecentJob(row: {
  job_id: string;
  operation: string;
  entity_type: string;
  entity_id: string;
  status: string;
  attempts: number;
  last_error_code: string | null;
  last_error_message: string | null;
  dlq_reason: string | null;
  queued_at: string | Date | null;
  started_at: string | Date | null;
  finished_at: string | Date | null;
  correlation_id: string | null;
}): OverviewRecentJobItem {
  const operationalStatus = mapJobToOperationalStatus({
    status: row.status,
    attempts: row.attempts,
    lastErrorCode: row.last_error_code,
    dlqReason: row.dlq_reason
  });
  const descriptor = describeOperationalStatus(operationalStatus);
  return {
    jobId: row.job_id,
    operation: row.operation,
    entityType: row.entity_type,
    entityId: row.entity_id,
    status: row.status,
    attempts: row.attempts,
    lastErrorCode: row.last_error_code,
    lastErrorMessage: row.last_error_message,
    dlqReason: row.dlq_reason,
    queuedAt: toIso(row.queued_at),
    startedAt: toIso(row.started_at),
    finishedAt: toIso(row.finished_at),
    correlationId: row.correlation_id,
    operationalStatus,
    label: descriptor.label,
    severity: descriptor.severity,
    recommendedAction: descriptor.recommendedAction,
    retryable: descriptor.retryable,
    bucket: descriptor.bucket,
    links: {
      self: `/v1/jobs/${row.job_id}`,
      events: `/v1/jobs/${row.job_id}/events`,
      retry: `/v1/jobs/${row.job_id}/retry`,
      audit: row.correlation_id ? `/v1/audit/${row.correlation_id}` : null
    }
  };
}

export async function getOperationsOverview(): Promise<OperationsOverviewResponse> {
  const summary = await getOperationsOverviewSummary();
  return {
    generatedAt: summary.generatedAt,
    jobs: summary.jobs,
    manifests: summary.manifests,
    accounts: summary.accounts,
    sessions: summary.sessions,
    recentDlq: summary.recentDlq.map((entry) => {
      const operationalStatus = mapJobToOperationalStatus({
        status: 'dlq',
        dlqReason: entry.dlq_reason
      });
      const descriptor = describeOperationalStatus(operationalStatus);
      return {
        jobId: entry.job_id,
        operation: entry.operation,
        entityType: entry.entity_type,
        entityId: entry.entity_id,
        dlqReason: entry.dlq_reason,
        movedAt: toIso(entry.moved_at),
        operationalStatus,
        label: descriptor.label,
        severity: descriptor.severity,
        recommendedAction: descriptor.recommendedAction,
        retryable: descriptor.retryable,
        bucket: descriptor.bucket
      };
    }),
    recentJobs: summary.recentJobs.map(mapOverviewRecentJob),
    recentErrors: summary.recentErrors.map(mapOverviewRecentJob)
  };
}

function mapJobSearchItem(row: JobSearchRow) {
  const operationalStatus = mapOperationalStatus({
    status: row.status,
    attempts: row.attempts,
    lastErrorCode: row.last_error_code,
    dlqReason: row.dlq_reason
  });
  const descriptor = describeOperationalStatus(operationalStatus);
  return {
    jobId: row.job_id,
    commandId: row.command_id,
    entityType: row.entity_type,
    entityId: row.entity_id,
    operation: row.operation,
    status: row.status,
    operationalStatus,
    label: descriptor.label,
    severity: descriptor.severity,
    recommendedAction: descriptor.recommendedAction,
    retryable: descriptor.retryable,
    bucket: descriptor.bucket,
    attempts: row.attempts,
    maxAttempts: row.max_attempts,
    queuedAt: toIso(row.queued_at),
    startedAt: toIso(row.started_at),
    finishedAt: toIso(row.finished_at),
    nextRetryAt: toIso(row.next_retry_at),
    correlationId: row.correlation_id,
    idempotencyKey: row.idempotency_key,
    lastErrorCode: row.last_error_code,
    lastErrorMessage: row.last_error_message,
    dlqReason: row.dlq_reason,
    dlqMovedAt: toIso(row.dlq_moved_at),
    executionTimeMs: row.execution_time_ms,
    integrationAccountId: row.integration_account_id,
    sessionContextId: row.session_context_id,
    version: row.version ?? 1,
    links: {
      self: `/v1/jobs/${row.job_id}`,
      events: `/v1/jobs/${row.job_id}/events`,
      audit: row.correlation_id ? `/v1/audit/${row.correlation_id}` : null,
      retry: `/v1/jobs/${row.job_id}/retry`
    }
  };
}

export async function jobsSearch(queryParams: LooseRecord) {
  const page = parsePage(queryParams.page, 1);
  const pageSize = parsePageSize(queryParams.pageSize, DEFAULT_PAGE_SIZE);

  const result = await searchJobs({
    dateFrom: typeof queryParams.dateFrom === 'string' ? queryParams.dateFrom : null,
    dateTo: typeof queryParams.dateTo === 'string' ? queryParams.dateTo : null,
    status: queryParams.status as string | string[] | undefined,
    operation: queryParams.operation as string | string[] | undefined,
    entityType: typeof queryParams.entityType === 'string' ? queryParams.entityType : null,
    entityId: typeof queryParams.entityId === 'string' ? queryParams.entityId : null,
    integrationAccountId:
      typeof queryParams.integrationAccountId === 'string' ? queryParams.integrationAccountId : null,
    sessionContextId:
      typeof queryParams.sessionContextId === 'string' ? queryParams.sessionContextId : null,
    correlationId:
      typeof queryParams.correlationId === 'string' ? queryParams.correlationId : null,
    page,
    pageSize
  });

  return {
    items: result.items.map(mapJobSearchItem),
    ...buildPageMeta(page, pageSize, result.totalItems)
  };
}

function mapAuditSearchItem(row: AuditSearchRow) {
  return {
    correlationId: row.correlation_id,
    entityType: row.entity_type,
    entityId: row.entity_id,
    occurredAt: toIso(row.occurred_at),
    direction: row.direction,
    component: row.component,
    httpMethod: row.http_method,
    endpoint: row.endpoint,
    httpStatus: row.http_status,
    latencyMs: row.latency_ms,
    links: {
      trail: `/v1/audit/${row.correlation_id}`
    }
  };
}

export async function auditSearch(queryParams: LooseRecord) {
  const page = parsePage(queryParams.page, 1);
  const pageSize = parsePageSize(queryParams.pageSize, DEFAULT_PAGE_SIZE);

  const result = await searchAuditEntries({
    dateFrom: typeof queryParams.dateFrom === 'string' ? queryParams.dateFrom : null,
    dateTo: typeof queryParams.dateTo === 'string' ? queryParams.dateTo : null,
    entityType: typeof queryParams.entityType === 'string' ? queryParams.entityType : null,
    entityId: typeof queryParams.entityId === 'string' ? queryParams.entityId : null,
    component: typeof queryParams.component === 'string' ? queryParams.component : null,
    correlationId:
      typeof queryParams.correlationId === 'string' ? queryParams.correlationId : null,
    direction: typeof queryParams.direction === 'string' ? queryParams.direction : null,
    httpStatusMin: parseInteger(queryParams.httpStatusMin),
    httpStatusMax: parseInteger(queryParams.httpStatusMax),
    page,
    pageSize
  });

  return {
    items: result.items.map(mapAuditSearchItem),
    ...buildPageMeta(page, pageSize, result.totalItems)
  };
}

function mapAccountHealth(row: AccountHealthRow) {
  const status =
    !row.is_active
      ? 'inactive'
      : row.active_sessions > 0
        ? 'healthy'
        : row.pending_sessions > 0
          ? 'pending'
          : row.expired_sessions + row.invalid_sessions > 0
            ? 'degraded'
            : 'idle';
  return {
    accountId: row.account_id,
    integrationAccountId: `acc_${row.account_id}`,
    userId: row.user_id,
    partnerCode: row.partner_code,
    partnerDocument: row.partner_document,
    partnerName: row.partner_name,
    accountType: row.account_type,
    isActive: row.is_active,
    status,
    lastConnectionAt: toIso(row.last_connection_at),
    lastUsageAt: toIso(row.last_usage_at),
    sessions: {
      active: row.active_sessions,
      pending: row.pending_sessions,
      expired: row.expired_sessions,
      invalid: row.invalid_sessions
    },
    jobs: {
      failed24h: row.jobs_failed_24h,
      dlqTotal: row.jobs_dlq_total
    }
  };
}

export async function cetesbAccountsHealth() {
  const rows = await getAccountsHealth();
  const accounts = rows.map(mapAccountHealth);
  return {
    generatedAt: new Date().toISOString(),
    totals: {
      total: accounts.length,
      active: accounts.filter((a) => a.isActive).length,
      healthy: accounts.filter((a) => a.status === 'healthy').length,
      degraded: accounts.filter((a) => a.status === 'degraded').length,
      pending: accounts.filter((a) => a.status === 'pending').length,
      idle: accounts.filter((a) => a.status === 'idle').length,
      inactive: accounts.filter((a) => a.status === 'inactive').length
    },
    accounts
  };
}

function mapSessionHealth(row: SessionHealthRow) {
  const expiresAt = toIso(row.expires_at);
  const isExpired =
    row.status === 'expired' ||
    (expiresAt && new Date(expiresAt).getTime() < Date.now());
  return {
    sessionContextId: row.session_context_id,
    integrationAccountId: row.integration_account_id,
    status: row.status,
    isExpired,
    partnerDocument: row.partner_document,
    partnerCode: row.partner_code,
    userName: row.user_name,
    email: row.email,
    authMode: row.auth_mode,
    expiresAt,
    lastValidatedAt: toIso(row.last_validated_at),
    createdAt: toIso(row.created_at),
    updatedAt: toIso(row.updated_at)
  };
}

export async function cetesbSessionsHealth(queryParams: LooseRecord) {
  const rows = await getSessionsHealth({
    status: queryParams.status as string | string[] | undefined,
    integrationAccountId:
      typeof queryParams.integrationAccountId === 'string' ? queryParams.integrationAccountId : null
  });
  const sessions = rows.map(mapSessionHealth);
  return {
    generatedAt: new Date().toISOString(),
    totals: {
      total: sessions.length,
      active: sessions.filter((s) => s.status === 'active').length,
      pending_auth: sessions.filter((s) => s.status === 'pending_auth').length,
      expired: sessions.filter((s) => s.status === 'expired').length,
      invalid: sessions.filter((s) => s.status === 'invalid').length,
      revoked: sessions.filter((s) => s.status === 'revoked').length
    },
    sessions
  };
}

function mapReportMtrItem(row: ReportsMtrRow) {
  const externalRef = row.external_reference || {};
  return {
    id: row.id,
    integrationAccountId: row.integration_account_id,
    status: row.status,
    externalStatus: row.external_status,
    manifestType: row.manifest_type,
    expeditionDate: row.expedition_date instanceof Date
      ? row.expedition_date.toISOString().slice(0, 10)
      : (typeof row.expedition_date === 'string' ? row.expedition_date.slice(0, 10) : null),
    manifestNumber: (externalRef as LooseRecord)?.manNumero ?? null,
    externalCode: (externalRef as LooseRecord)?.manCodigo ?? null,
    externalHashCode: row.external_hash_code,
    generator: { partnerCode: row.generator_code, description: row.generator_name },
    carrier: { partnerCode: row.carrier_code, description: row.carrier_name },
    receiver: { partnerCode: row.receiver_code, description: row.receiver_name },
    createdAt: toIso(row.created_at),
    lastSyncAt: toIso(row.last_sync_at)
  };
}

function buildReportsMtrFilters(queryParams: LooseRecord, page: number, pageSize: number) {
  return {
    dateFrom: typeof queryParams.dateFrom === 'string' ? queryParams.dateFrom : null,
    dateTo: typeof queryParams.dateTo === 'string' ? queryParams.dateTo : null,
    status: queryParams.status as string | string[] | undefined,
    externalStatus: queryParams.externalStatus as string | string[] | undefined,
    manifestType: parseInteger(queryParams.manifestType),
    integrationAccountId:
      typeof queryParams.integrationAccountId === 'string' ? queryParams.integrationAccountId : null,
    generatorCode: typeof queryParams.generatorCode === 'string' ? queryParams.generatorCode : null,
    carrierCode: typeof queryParams.carrierCode === 'string' ? queryParams.carrierCode : null,
    receiverCode: typeof queryParams.receiverCode === 'string' ? queryParams.receiverCode : null,
    partnerCode: typeof queryParams.partnerCode === 'string' ? queryParams.partnerCode : null,
    page,
    pageSize
  };
}

export async function reportsMtrSearch(queryParams: LooseRecord) {
  const page = parsePage(queryParams.page, 1);
  const pageSize = parsePageSize(queryParams.pageSize, DEFAULT_PAGE_SIZE);
  const filters = buildReportsMtrFilters(queryParams, page, pageSize);
  const result = await searchReportsMtrs(filters);
  return {
    items: result.items.map(mapReportMtrItem),
    ...buildPageMeta(page, pageSize, result.totalItems)
  };
}

/**
 * Decisão (DL Centro Operacional, fase 02): export retorna CSV síncrono limitado a
 * REPORTS_EXPORT_MAX_ROWS linhas. Acima disso, retorna 413 com orientação para
 * estreitar filtros (futura evolução: 202 + job para exports volumosos, fase 04).
 */
export async function reportsMtrExport(queryParams: LooseRecord) {
  const filters = buildReportsMtrFilters(queryParams, 1, REPORTS_EXPORT_MAX_ROWS + 1);
  const result = await searchReportsMtrs(filters);

  if (result.totalItems > REPORTS_EXPORT_MAX_ROWS) {
    throw new AppError(
      413,
      'Payload Too Large',
      `Export window contains ${result.totalItems} rows; reduce filters to <= ${REPORTS_EXPORT_MAX_ROWS}.`,
      { code: 'REPORT_EXPORT_LIMIT_EXCEEDED' }
    );
  }

  const items = result.items.map(mapReportMtrItem);

  const header = toCsvRow([
    'id',
    'integrationAccountId',
    'status',
    'externalStatus',
    'manifestType',
    'expeditionDate',
    'manifestNumber',
    'externalCode',
    'externalHashCode',
    'generatorCode',
    'generatorName',
    'carrierCode',
    'carrierName',
    'receiverCode',
    'receiverName',
    'createdAt',
    'lastSyncAt'
  ]);

  const rows = items.map((item) =>
    toCsvRow([
      item.id,
      item.integrationAccountId,
      item.status,
      item.externalStatus,
      item.manifestType,
      item.expeditionDate,
      item.manifestNumber as string | null,
      item.externalCode as number | null,
      item.externalHashCode,
      item.generator.partnerCode,
      item.generator.description,
      item.carrier.partnerCode,
      item.carrier.description,
      item.receiver.partnerCode,
      item.receiver.description,
      item.createdAt,
      item.lastSyncAt
    ])
  );

  return {
    csv: [header, ...rows].join('\n') + '\n',
    totalItems: result.totalItems,
    fileName: `mtr_report_${new Date().toISOString().slice(0, 10)}.csv`
  };
}

/**
 * POST /v1/jobs/:id/retry
 * - DLQ: usa requeueFromDLQ (preserva job_id; reset attempts no jobs).
 * - failed/cancelled: cria novo job com mesma operação/payload (novo jobId/commandId);
 *   o job original permanece como histórico.
 * - queued/running/retry_wait/succeeded: 409 Conflict.
 * Idempotência via Idempotency-Key (operation 'job.retry').
 */
export async function retryJob(
  jobId: string,
  headers: HeaderMap,
  correlationId: string | null
) {
  const idempotencyKey = headers['idempotency-key'];
  const reused = await getIdempotentResponse('job.retry', idempotencyKey);
  if (reused) return reused;

  const job = await findJobById(jobId);
  if (!job) {
    throw new AppError(404, 'Not Found', `Job ${jobId} was not found.`);
  }

  if (!TERMINAL_RETRYABLE_STATUSES.has(job.status)) {
    throw new AppError(
      409,
      'Conflict',
      `Job ${jobId} cannot be retried in status '${job.status}'. Allowed: failed, cancelled, dlq.`,
      { code: 'JOB_NOT_RETRYABLE' }
    );
  }

  const correlation = correlationId || job.correlationId || createPrefixedId('corr');

  if (job.status === 'dlq') {
    const requeued = await requeueFromDLQ(jobId);
    if (!requeued) {
      throw new AppError(404, 'Not Found', `Job ${jobId} was not found in DLQ.`);
    }
    const response = buildCommandAccepted({
      commandId: requeued.commandId || createPrefixedId('cmd'),
      jobId: requeued.jobId,
      correlationId: correlation,
      entityType: requeued.entityType,
      entityId: requeued.entityId,
      operation: requeued.operation
    });
    await rememberIdempotentResponse({
      operation: 'job.retry',
      idempotencyKey,
      entityType: 'job',
      entityId: jobId,
      response
    });
    return response;
  }

  // failed / cancelled → cria novo job preservando linhagem em payload._retryOf.
  const newJobId = createPrefixedId('job');
  const newCommandId = createPrefixedId('cmd');
  const operation = job.operation;
  const retryConfig = getRetryConfig(operation);
  const priority = calculateJobPriority(operation);

  const payload = {
    ...(job.payload || {}),
    _retryOf: {
      jobId: job.jobId,
      previousStatus: job.status,
      previousAttempts: job.attempts,
      previousErrorCode: job.lastErrorCode,
      previousErrorMessage: job.lastErrorMessage,
      retriedAt: new Date().toISOString()
    }
  } as Record<string, unknown>;

  await insertJob({
    jobId: newJobId,
    commandId: newCommandId,
    entityType: job.entityType,
    entityId: job.entityId,
    operation,
    payload,
    status: 'queued',
    maxAttempts: retryConfig.maxAttempts,
    correlationId: correlation,
    idempotencyKey,
    priority,
    retryStrategy: retryConfig.strategy,
    baseDelayMs: retryConfig.baseDelayMs,
    maxDelayMs: retryConfig.maxDelayMs,
    tags: extractJobTags({ operation, entityType: job.entityType, status: 'queued' })
  });

  const response = buildCommandAccepted({
    commandId: newCommandId,
    jobId: newJobId,
    correlationId: correlation,
    entityType: job.entityType,
    entityId: job.entityId,
    operation
  });

  await rememberIdempotentResponse({
    operation: 'job.retry',
    idempotencyKey,
    entityType: 'job',
    entityId: jobId,
    response
  });

  return response;
}

// re-export para conveniência em testes
export { query };

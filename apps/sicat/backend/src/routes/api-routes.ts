import express from 'express';
import fs from 'node:fs';
import pg from 'pg';
import type { IncomingHttpHeaders } from 'node:http';
import { asyncHandler } from '../lib/http.js';
import { createSessionContext, getSessionContext } from '../services/session-context-service.js';
import { enqueueCatalogSync, queryCatalog } from '../services/catalog-service.js';
import { searchPartners } from '../services/partner-service.js';
import { createCadastro, getCadastro } from '../services/cadastro-service.js';
import {
  createManifest,
  createManifestBatch,
  getManifest,
  removeManifest,
  replicateManifest,
  listManifests,
  listReceiptResponsibles,
  listCdfResponsibles,
  enqueueManifestSubmit,
  enqueueManifestBatchSubmit,
  enqueueManifestPrint,
  enqueueManifestCancel,
  enqueueManifestBatchCancel,
  enqueueManifestReceive,
  enqueueCdfGenerate,
  enqueueCdfDownload,
  listCdfCertificates,
  getCdfDocumentBuffer,
  getManifestDocumentStream
} from '../services/manifest-service.js';
import { cancelJobFromActiveQueue, getJob, removeJobFromActiveQueue } from '../services/job-service.js';
import { getAuditTrail } from '../services/audit-service.js';
import { login, getPartnerInfo } from '../services/auth-service.js';
import { loginSicat, registerSicat, refreshSicatSession, getSicatUserById, loginSicatViaKeycloak } from '../services/sicat-auth-service.js';
import {
  listSicatCetesbAccounts,
  addSicatCetesbAccount,
  activateSicatCetesbAccount,
  removeSicatCetesbAccount,
  getSicatActiveSession
} from '../services/sicat-account-service.js';
import {
  listAdminAccessUsers,
  getAdminAccessUserDetails,
  listAdminAccessRoles,
  getAdminAccessRoleDetails,
  createAdminAccessRole,
  updateAdminAccessRole,
  deleteAdminAccessRole,
  listAdminAccessPermissions,
  getAdminAccessPermissionDetails,
  createAdminAccessPermission,
  updateAdminAccessPermission,
  deleteAdminAccessPermission,
  listAdminAccessSessions,
  grantAccessRoleForUser,
  revokeAccessRoleForUser,
  resetAccessUserPassword,
  expireAccessUserPassword
} from '../services/access-admin-service.js';
import { sicatAuthMiddleware } from '../middlewares/sicat-auth.js';
import {
  getSystemHealth,
  getWorkerStatistics,
  listActiveJobs,
  cleanupOldJobs,
  calculateJobPerformanceMetrics,
  calculateCetesbPerformanceMetrics,
  getJobMetricsTimeline,
  getCetesbMetricsTimeline,
  getCetesbEndpointLatency,
  captureDashboardSnapshots
} from '../repositories/health-repo.js';
import { listDLQJobs, requeueFromDLQ, deleteFromDLQ } from '../repositories/job-repo.js';
import {
  getOperationsOverview,
  jobsSearch,
  auditSearch,
  cetesbAccountsHealth,
  cetesbSessionsHealth,
  reportsMtrSearch,
  reportsMtrExport,
  retryJob
} from '../services/operations-service.js';
import { config } from '../lib/config.js';
import { registerDmrRoutes } from './dmr-routes.js';
import { registerMtrProvisorioRoutes } from './mtr-provisorio-routes.js';

const { Client } = pg;

const TERMINAL_JOB_STATUSES = new Set(['succeeded', 'failed', 'cancelled', 'dlq']);

type LooseRecord = Record<string, unknown>;
type TimelinePoint = {
  total_jobs?: number | string | null;
};

type PerformanceOperation = {
  total_jobs?: number | string | null;
};

type SicatUserContext = {
  userId: string;
  [key: string]: unknown;
};

type RequestWithContext = express.Request & {
  correlationId?: string | null;
  sicatUser?: SicatUserContext;
};

function normalizeRatioFromPercentage(value: unknown) {
  const numeric = Number(value);
  if (!Number.isFinite(numeric)) {
    return 0;
  }

  const ratio = numeric > 1 ? numeric / 100 : numeric;
  if (ratio < 0) return 0;
  if (ratio > 1) return 1;
  return ratio;
}

function writeNdjson(res: express.Response, payload: unknown) {
  res.write(`${JSON.stringify(payload)}\n`);
}

function toIsoDate(date: Date) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

function hasTimelineActivity(points: TimelinePoint[] = []) {
  return Array.isArray(points)
    && points.some((point) => Number(point?.total_jobs || 0) > 0);
}

function hasPerformanceActivity(performance: { by_operation?: PerformanceOperation[] } | null = null) {
  const operations = Array.isArray(performance?.by_operation) ? performance.by_operation : [];
  return operations.some((operation) => Number(operation?.total_jobs || 0) > 0);
}

function createJobDriftFingerprint(job: unknown) {
  const safeJob = (job && typeof job === 'object') ? job as Record<string, unknown> : {};
  const result = (safeJob.result && typeof safeJob.result === 'object')
    ? safeJob.result as Record<string, unknown>
    : {};

  return JSON.stringify([
    safeJob.status || null,
    safeJob.attempts ?? null,
    safeJob.finishedAt || null,
    safeJob.lastErrorCode || null,
    safeJob.lastErrorMessage || null,
    result.outcome || null
  ]);
}

function toSingleString(value: unknown): string | undefined {
  if (typeof value === 'string') return value;
  if (Array.isArray(value)) {
    const first = value[0];
    return typeof first === 'string' ? first : undefined;
  }
  return undefined;
}

function toHeaderMap(headers: IncomingHttpHeaders): Record<string, string | undefined> {
  const entries = Object.entries(headers).map(([key, value]) => {
    if (typeof value === 'string') return [key, value] as const;
    if (Array.isArray(value)) return [key, value.join(', ')] as const;
    return [key, undefined] as const;
  });
  return Object.fromEntries(entries);
}

function getCorrelationId(req: express.Request): string | null {
  const correlationId = (req as RequestWithContext).correlationId;
  return typeof correlationId === 'string' && correlationId.length > 0 ? correlationId : null;
}

function requireSicatUser(req: express.Request): SicatUserContext {
  const sicatUser = (req as RequestWithContext).sicatUser;
  if (!sicatUser) {
    throw new Error('Usuário SICAT não autenticado');
  }
  return sicatUser;
}

export function createApiRouter() {
  const router = express.Router();

  // Health and Observability endpoints
  router.get('/v1/ping', asyncHandler(async (req, res) => {
    res.json({
      status: 'ok',
      timestamp: new Date().toISOString()
    });
  }));

  router.get('/v1/health/system', asyncHandler(async (req, res) => {
    const systemHealth = await getSystemHealth();
    res.json(systemHealth);
  }));

  router.get('/v1/health/workers', asyncHandler(async (req, res) => {
    const workerStats = await getWorkerStatistics();
    res.json({
      workers: [],
      total: workerStats.total_workers || 0,
      healthy: workerStats.healthy_workers || 0,
      degraded: workerStats.degraded_workers || 0,
      unhealthy: workerStats.unhealthy_workers || 0,
      stopped: workerStats.stopped_workers || 0,
      active_last_5m: workerStats.active_last_5m || 0,
      statistics: {
        total_jobs_claimed: workerStats.total_jobs_claimed_all || 0,
        total_jobs_succeeded: workerStats.total_jobs_succeeded_all || 0,
        total_jobs_failed: workerStats.total_jobs_failed_all || 0,
        total_jobs_dlq: workerStats.total_jobs_dlq_all || 0,
        avg_job_duration_ms: workerStats.avg_job_duration_ms_all || 0
      },
      timestamp: new Date().toISOString()
    });
  }));

  router.get('/v1/health/jobs/active', asyncHandler(async (req, res) => {
    const activeJobs = await listActiveJobs(100);
    const activeCount = activeJobs.length;

    // Calcular contadores por status
    const queued = activeJobs.filter(j => j.status === 'queued').length;
    const running = activeJobs.filter(j => j.status === 'running').length;
    const retryWait = activeJobs.filter(j => j.status === 'retry_wait').length;

    // Identificar job mais antigo
    const oldestJob = activeJobs.length > 0 ? activeJobs[0] : null;
    const oldestAgeMinutes = oldestJob
      ? Math.floor((Date.now() - new Date(oldestJob.created_at).getTime()) / 60000)
      : null;

    res.json({
      active_jobs: activeCount,
      queued,
      running,
      retry_wait: retryWait,
      oldest_job_id: oldestJob?.job_id || null,
      oldest_age_minutes: oldestAgeMinutes,
      timestamp: new Date().toISOString(),
      jobs: activeJobs.map(j => ({
        job_id: j.job_id,
        operation: j.operation,
        entity_type: j.entity_type,
        entity_id: j.entity_id,
        status: j.status,
        attempts: j.attempts,
        max_attempts: j.max_attempts,
        correlation_id: j.correlation_id,
        queued_at: j.queued_at,
        claimed_at: j.claimed_at,
        claimed_by: j.claimed_by,
        next_retry_at: j.next_retry_at,
        last_error_code: j.last_error_code,
        last_error_message: j.last_error_message,
        age_seconds: j.age_seconds
      }))
    });
  }));

  router.post('/v1/health/jobs/active/:jobId/cancel', asyncHandler(async (req, res) => {
    const response = await cancelJobFromActiveQueue(String(req.params.jobId || ''), req.body?.reason);
    res.json(response);
  }));

  router.delete('/v1/health/jobs/active/:jobId', asyncHandler(async (req, res) => {
    await removeJobFromActiveQueue(String(req.params.jobId || ''));
    res.status(204).end();
  }));

  router.get('/v1/health/jobs/dlq', asyncHandler(async (req, res) => {
    const dlqJobs = await listDLQJobs(100);
    const dlqCount = dlqJobs.length;

    res.json({
      dlq_jobs: dlqCount,
      retention_days: 30,
      timestamp: new Date().toISOString(),
      jobs: dlqJobs.slice(0, 10).map(j => ({
        job_id: j.job_id,
        operation: j.operation,
        entity_type: j.entity_type,
        entity_id: j.entity_id,
        moved_at: j.moved_at,
        dlq_reason: j.reason || 'unknown',
        reason: j.reason || 'unknown'
      }))
    });
  }));

  router.post('/v1/health/jobs/dlq/:jobId/requeue', asyncHandler(async (req, res) => {
    const job = await requeueFromDLQ(String(req.params.jobId));
    if (!job) {
      res.status(404).json({ message: 'Job not found' });
      return;
    }
    res.json({ jobId: job.jobId, status: job.status, message: 'Job requeued successfully' });
  }));

  router.delete('/v1/health/jobs/dlq/:jobId', asyncHandler(async (req, res) => {
    await deleteFromDLQ(String(req.params.jobId));
    res.status(204).end();
  }));

  router.get('/v1/health/metrics/performance', asyncHandler(async (req, res) => {
    const hoursBackRaw = Number(req.query?.hoursBack);
    const hoursBack = Number.isFinite(hoursBackRaw) && hoursBackRaw > 0
      ? Math.min(Math.floor(hoursBackRaw), 168)
      : 24;

    const performance = await calculateJobPerformanceMetrics(hoursBack);
    const globalMetrics = performance?.metrics || {};
    const operations = Array.isArray(performance?.by_operation) ? performance.by_operation : [];

    const totalJobs = operations.reduce((sum, operation) => sum + (Number(operation.total_jobs) || 0), 0);
    const topOperations = operations
      .slice(0, 5)
      .map((operation) => {
        const operationTotal = Number(operation.total_jobs) || 0;
        return {
          operation: operation.operation,
          total_jobs: operationTotal,
          succeeded_jobs: Number(operation.succeeded_jobs) || 0,
          failed_jobs: Number(operation.failed_jobs) || 0,
          dlq_jobs: Number(operation.dlq_jobs) || 0,
          avg_duration_ms: Math.round(Number(operation.avg_duration_ms) || 0),
          p95_duration_ms: Math.round(Number(operation.p95_duration_ms) || 0),
          success_rate: normalizeRatioFromPercentage(operation.success_rate),
          traffic_share: totalJobs > 0 ? Number((operationTotal / totalJobs).toFixed(4)) : 0
        };
      });

    const normalizedJobExecution = {
      p50: Math.round(Number(globalMetrics?.job_execution_ms?.p50) || 0),
      p95: Math.round(Number(globalMetrics?.job_execution_ms?.p95) || 0),
      p99: Math.round(Number(globalMetrics?.job_execution_ms?.p99) || 0)
    };
    const normalizedSuccessRate = normalizeRatioFromPercentage(globalMetrics?.job_success_rate);
    const normalizedUtilization = normalizeRatioFromPercentage(globalMetrics?.worker_utilization);

    res.json({
      job_execution_ms: normalizedJobExecution,
      job_success_rate: normalizedSuccessRate,
      worker_utilization: normalizedUtilization,
      top_operations: topOperations,
      metrics: {
        job_execution_ms: {
          avg: 0,
          p50: normalizedJobExecution.p50,
          p95: normalizedJobExecution.p95,
          p99: normalizedJobExecution.p99
        },
        success_rate: normalizedSuccessRate,
        utilization: normalizedUtilization
      },
      timestamp: new Date().toISOString()
    });
  }));

  router.get('/v1/health/metrics/timeline', asyncHandler(async (req, res) => {
    const hoursBackRaw = Number(req.query?.hoursBack);
    const hoursBack = Number.isFinite(hoursBackRaw) && hoursBackRaw > 0
      ? Math.min(Math.floor(hoursBackRaw), 24 * 30)
      : 24;

    const bucket = hoursBack > 48 ? 'day' : 'hour';
    const timeline = await getJobMetricsTimeline(hoursBack, bucket);

    res.json({
      bucket,
      hours_back: hoursBack,
      points: timeline,
      timestamp: new Date().toISOString()
    });
  }));

  router.get('/v1/health/metrics/endpoints', asyncHandler(async (req, res) => {
    const hoursBackRaw = Number(req.query?.hoursBack);
    const limitRaw = Number(req.query?.limit);

    const hoursBack = Number.isFinite(hoursBackRaw) && hoursBackRaw > 0
      ? Math.min(Math.floor(hoursBackRaw), 24 * 30)
      : 24;
    const limit = Number.isFinite(limitRaw) && limitRaw > 0
      ? Math.min(Math.floor(limitRaw), 20)
      : 10;

    const endpoints = await getCetesbEndpointLatency(hoursBack, limit);

    res.json({
      hours_back: hoursBack,
      endpoints,
      timestamp: new Date().toISOString()
    });
  }));

  router.get('/v1/dashboard/overview', asyncHandler(async (req, res) => {
    const hoursBackRaw = Number(req.query?.hoursBack);
    const manifestsPageSizeRaw = Number(req.query?.manifestsPageSize);

    const hoursBack = Number.isFinite(hoursBackRaw) && hoursBackRaw > 0
      ? Math.min(Math.floor(hoursBackRaw), 24 * 30)
      : 24;
    const manifestsPageSize = Number.isFinite(manifestsPageSizeRaw) && manifestsPageSizeRaw > 0
      ? Math.min(Math.floor(manifestsPageSizeRaw), 50)
      : 10;
    const bucket = hoursBack > 48 ? 'day' : 'hour';

    const todayIso = toIsoDate(new Date());
    const manifestQuery = {
      integrationAccountId: toSingleString(req.query?.integrationAccountId),
      sessionContextId: toSingleString(req.query?.sessionContextId),
      dateFrom: toSingleString(req.query?.dateFrom) || todayIso,
      dateTo: toSingleString(req.query?.dateTo) || todayIso,
      page: 1,
      pageSize: manifestsPageSize
    };

    const [systemHealth, workerStats, dlqJobs, performance, auditPerformance, timeline, auditTimeline, endpoints, manifests] = await Promise.all([
      getSystemHealth(),
      getWorkerStatistics(),
      listDLQJobs(100),
      calculateJobPerformanceMetrics(hoursBack),
      calculateCetesbPerformanceMetrics(hoursBack),
      getJobMetricsTimeline(hoursBack, bucket),
      getCetesbMetricsTimeline(hoursBack, bucket),
      getCetesbEndpointLatency(hoursBack, 8),
      listManifests(manifestQuery, getCorrelationId(req), toHeaderMap(req.headers || {}))
    ]);

    const resolvedTimeline = hasTimelineActivity(timeline) ? timeline : auditTimeline;
    const timelineSource = hasTimelineActivity(timeline) ? 'jobs' : 'audit';
    const resolvedPerformanceInput = hasPerformanceActivity(performance) ? performance : auditPerformance;
    const performanceSource = hasPerformanceActivity(performance) ? 'jobs' : 'audit';

    const globalMetrics = resolvedPerformanceInput?.metrics || {};
    const operations = Array.isArray(resolvedPerformanceInput?.by_operation) ? resolvedPerformanceInput.by_operation : [];
    const totalJobs = operations.reduce((sum, operation) => sum + (Number(operation.total_jobs) || 0), 0);

    const topOperations = operations
      .slice(0, 5)
      .map((operation) => {
        const operationTotal = Number(operation.total_jobs) || 0;
        return {
          operation: operation.operation,
          total_jobs: operationTotal,
          succeeded_jobs: Number(operation.succeeded_jobs) || 0,
          failed_jobs: Number(operation.failed_jobs) || 0,
          dlq_jobs: Number(operation.dlq_jobs) || 0,
          avg_duration_ms: Math.round(Number(operation.avg_duration_ms) || 0),
          p95_duration_ms: Math.round(Number(operation.p95_duration_ms) || 0),
          success_rate: normalizeRatioFromPercentage(operation.success_rate),
          traffic_share: totalJobs > 0 ? Number((operationTotal / totalJobs).toFixed(4)) : 0
        };
      });

    const normalizedPerformance = {
      source: performanceSource,
      job_execution_ms: {
        p50: Math.round(Number(globalMetrics?.job_execution_ms?.p50) || 0),
        p95: Math.round(Number(globalMetrics?.job_execution_ms?.p95) || 0),
        p99: Math.round(Number(globalMetrics?.job_execution_ms?.p99) || 0)
      },
      job_success_rate: normalizeRatioFromPercentage(globalMetrics?.job_success_rate),
      worker_utilization: normalizeRatioFromPercentage(globalMetrics?.worker_utilization),
      top_operations: topOperations
    };

    const snapshot = await captureDashboardSnapshots({
      hoursBack,
      systemHealth: systemHealth as never,
      performance: resolvedPerformanceInput as never,
      endpointLatency: endpoints as never
    });

    res.json({
      window: {
        hours_back: hoursBack,
        bucket
      },
      health: {
        system: systemHealth,
        workers: {
          total: workerStats.total_workers || 0,
          healthy: workerStats.healthy_workers || 0,
          degraded: workerStats.degraded_workers || 0,
          unhealthy: workerStats.unhealthy_workers || 0,
          stopped: workerStats.stopped_workers || 0,
          active_last_5m: workerStats.active_last_5m || 0,
          statistics: {
            total_jobs_claimed: workerStats.total_jobs_claimed_all || 0,
            total_jobs_succeeded: workerStats.total_jobs_succeeded_all || 0,
            total_jobs_failed: workerStats.total_jobs_failed_all || 0,
            total_jobs_dlq: workerStats.total_jobs_dlq_all || 0,
            avg_job_duration_ms: workerStats.avg_job_duration_ms_all || 0
          }
        },
        dlq: {
          dlq_jobs: dlqJobs.length,
          retention_days: 30,
          jobs: dlqJobs.slice(0, 10).map((job) => ({
            job_id: job.job_id,
            operation: job.operation,
            entity_type: job.entity_type,
            entity_id: job.entity_id,
            moved_at: job.moved_at,
            dlq_reason: job.reason || 'unknown',
            reason: job.reason || 'unknown'
          }))
        }
      },
      performance: normalizedPerformance,
      timeline: {
        bucket,
        hours_back: hoursBack,
        source: timelineSource,
        points: resolvedTimeline
      },
      integration_latency: {
        hours_back: hoursBack,
        endpoints
      },
      manifests,
      snapshot,
      timestamp: new Date().toISOString()
    });
  }));

  router.post('/v1/maintenance/cleanup', asyncHandler(async (req, res) => {
    const { retention_days = 30, batch_size = 1000 } = req.body || {};

    const deletedCount = await cleanupOldJobs(retention_days, batch_size);

    res.status(202).json({
      cleaned_count: deletedCount,
      deleted_rows: deletedCount,
      timestamp: new Date().toISOString()
    });
  }));

  // Authentication endpoints
  router.post('/v1/auth/login', asyncHandler(async (req, res) => {
    const response = await login(req.body || {});
    res.json(response);
  }));

  router.get('/v1/auth/partner-info', asyncHandler(async (req, res) => {
    const response = await getPartnerInfo(String(toSingleString(req.query.document) || ''));
    res.json(response);
  }));

  router.post('/v1/sicat/auth/login', asyncHandler(async (req, res) => {
    const response = await loginSicat(req.body || {}, {
      correlationId: getCorrelationId(req),
      userAgent: req.header('User-Agent') || null
    });
    res.json(response);
  }));

  router.post('/v1/sicat/auth/register', asyncHandler(async (req, res) => {
    const response = await registerSicat(req.body || {}, {
      correlationId: getCorrelationId(req),
      userAgent: req.header('User-Agent') || null
    });
    res.status(201).json(response);
  }));

  router.post('/v1/sicat/auth/refresh', asyncHandler(async (req, res) => {
    const response = await refreshSicatSession(req.body || {}, {
      correlationId: getCorrelationId(req),
      userAgent: req.header('User-Agent') || null
    });
    res.json(response);
  }));

  // SSO via Keycloak (login PROPRIO do SICAT). Aditivo: o login local continua
  // como fallback; a auth SIGOR/CETESB nao e afetada.
  router.post('/v1/sicat/auth/keycloak', asyncHandler(async (req, res) => {
    const response = await loginSicatViaKeycloak(req.body || {}, {
      correlationId: getCorrelationId(req),
      userAgent: req.header('User-Agent') || null
    });
    res.json(response);
  }));

  router.get('/v1/sicat/cetesb-accounts', sicatAuthMiddleware, asyncHandler(async (req, res) => {
    const response = await listSicatCetesbAccounts(requireSicatUser(req));
    res.json(response);
  }));

  router.post('/v1/sicat/cetesb-accounts', sicatAuthMiddleware, asyncHandler(async (req, res) => {
    const response = await addSicatCetesbAccount(requireSicatUser(req), req.body || {});
    res.status(201).json(response);
  }));

  router.post('/v1/sicat/cetesb-accounts/:accountId/activate', sicatAuthMiddleware, asyncHandler(async (req, res) => {
    const authenticatedUser = requireSicatUser(req);
    const sicatUser = await getSicatUserById(authenticatedUser.userId);
    const response = await activateSicatCetesbAccount({
      ...sicatUser,
      userId: sicatUser.id
    }, String(req.params.accountId));
    res.json(response);
  }));

  router.delete('/v1/sicat/cetesb-accounts/:accountId', sicatAuthMiddleware, asyncHandler(async (req, res) => {
    const authenticatedUser = requireSicatUser(req);
    const sicatUser = await getSicatUserById(authenticatedUser.userId);
    const response = await removeSicatCetesbAccount({
      ...sicatUser,
      userId: sicatUser.id
    }, String(req.params.accountId));
    res.json(response);
  }));

  router.get('/v1/sicat/session', sicatAuthMiddleware, asyncHandler(async (req, res) => {
    const authenticatedUser = requireSicatUser(req);
    const sicatUser = await getSicatUserById(authenticatedUser.userId);
    const response = await getSicatActiveSession({
      ...sicatUser,
      userId: sicatUser.id
    });
    res.json(response);
  }));

  router.get('/v1/admin/access/users', sicatAuthMiddleware, asyncHandler(async (req, res) => {
    const response = await listAdminAccessUsers(requireSicatUser(req), (req.query || {}) as LooseRecord, getCorrelationId(req));
    res.json(response);
  }));

  router.get('/v1/admin/access/users/:userId', sicatAuthMiddleware, asyncHandler(async (req, res) => {
    const response = await getAdminAccessUserDetails(requireSicatUser(req), String(req.params.userId), getCorrelationId(req));
    res.json(response);
  }));

  router.get('/v1/admin/access/roles', sicatAuthMiddleware, asyncHandler(async (req, res) => {
    const response = await listAdminAccessRoles(requireSicatUser(req), getCorrelationId(req));
    res.json(response);
  }));

  router.get('/v1/admin/access/roles/:roleId', sicatAuthMiddleware, asyncHandler(async (req, res) => {
    const response = await getAdminAccessRoleDetails(requireSicatUser(req), String(req.params.roleId), getCorrelationId(req));
    res.json(response);
  }));

  router.post('/v1/admin/access/roles', sicatAuthMiddleware, asyncHandler(async (req, res) => {
    const response = await createAdminAccessRole(requireSicatUser(req), req.body || {}, getCorrelationId(req));
    res.status(201).json(response);
  }));

  router.patch('/v1/admin/access/roles/:roleId', sicatAuthMiddleware, asyncHandler(async (req, res) => {
    const response = await updateAdminAccessRole(requireSicatUser(req), String(req.params.roleId), req.body || {}, getCorrelationId(req));
    res.json(response);
  }));

  router.delete('/v1/admin/access/roles/:roleId', sicatAuthMiddleware, asyncHandler(async (req, res) => {
    const response = await deleteAdminAccessRole(requireSicatUser(req), String(req.params.roleId), getCorrelationId(req));
    res.json(response);
  }));

  router.get('/v1/admin/access/permissions', sicatAuthMiddleware, asyncHandler(async (req, res) => {
    const response = await listAdminAccessPermissions(requireSicatUser(req), (req.query || {}) as LooseRecord, getCorrelationId(req));
    res.json(response);
  }));

  router.get('/v1/admin/access/permissions/:permissionId', sicatAuthMiddleware, asyncHandler(async (req, res) => {
    const response = await getAdminAccessPermissionDetails(requireSicatUser(req), String(req.params.permissionId), getCorrelationId(req));
    res.json(response);
  }));

  router.post('/v1/admin/access/permissions', sicatAuthMiddleware, asyncHandler(async (req, res) => {
    const response = await createAdminAccessPermission(requireSicatUser(req), req.body || {}, getCorrelationId(req));
    res.status(201).json(response);
  }));

  router.patch('/v1/admin/access/permissions/:permissionId', sicatAuthMiddleware, asyncHandler(async (req, res) => {
    const response = await updateAdminAccessPermission(requireSicatUser(req), String(req.params.permissionId), req.body || {}, getCorrelationId(req));
    res.json(response);
  }));

  router.delete('/v1/admin/access/permissions/:permissionId', sicatAuthMiddleware, asyncHandler(async (req, res) => {
    const response = await deleteAdminAccessPermission(requireSicatUser(req), String(req.params.permissionId), getCorrelationId(req));
    res.json(response);
  }));

  router.get('/v1/admin/access/sessions', sicatAuthMiddleware, asyncHandler(async (req, res) => {
    const response = await listAdminAccessSessions(requireSicatUser(req), (req.query || {}) as LooseRecord, getCorrelationId(req));
    res.json(response);
  }));

  router.post('/v1/admin/access/users/:userId/roles/:roleId/grant', sicatAuthMiddleware, asyncHandler(async (req, res) => {
    const response = await grantAccessRoleForUser(
      requireSicatUser(req),
      String(req.params.userId),
      String(req.params.roleId),
      req.body || {},
      getCorrelationId(req)
    );
    res.json(response);
  }));

  router.post('/v1/admin/access/users/:userId/roles/:roleId/revoke', sicatAuthMiddleware, asyncHandler(async (req, res) => {
    const response = await revokeAccessRoleForUser(
      requireSicatUser(req),
      String(req.params.userId),
      String(req.params.roleId),
      req.body || {},
      getCorrelationId(req)
    );
    res.json(response);
  }));

  router.post('/v1/admin/access/users/:userId/password/reset', sicatAuthMiddleware, asyncHandler(async (req, res) => {
    const response = await resetAccessUserPassword(
      requireSicatUser(req),
      String(req.params.userId),
      req.body || {},
      getCorrelationId(req)
    );
    res.json(response);
  }));

  router.post('/v1/admin/access/users/:userId/password/expire', sicatAuthMiddleware, asyncHandler(async (req, res) => {
    const response = await expireAccessUserPassword(
      requireSicatUser(req),
      String(req.params.userId),
      req.body || {},
      getCorrelationId(req)
    );
    res.json(response);
  }));

  router.post('/v1/session-contexts', asyncHandler(async (req, res) => {
    const response = await createSessionContext(req.body || {});
    res.status(201).json(response);
  }));

  router.get('/v1/session-contexts/:id', asyncHandler(async (req, res) => {
    const response = await getSessionContext(String(req.params.id || ''));
    res.json(response);
  }));

  router.post('/v1/catalog-sync', asyncHandler(async (req, res) => {
    const response = await enqueueCatalogSync(req.body || {}, toHeaderMap(req.headers || {}), getCorrelationId(req));
    res.status(202).json(response);
  }));

  router.get('/v1/catalogs/:catalogName', asyncHandler(async (req, res) => {
    const response = await queryCatalog(String(req.params.catalogName), req.query);
    res.json(response);
  }));

  router.get('/v1/partners/search', asyncHandler(async (req, res) => {
    const response = await searchPartners(req.query);
    res.json(response);
  }));

  router.post('/v1/cadastros', asyncHandler(async (req, res) => {
    const response = await createCadastro(req.body || {}, toHeaderMap(req.headers || {}), getCorrelationId(req));
    res.status(202).json(response);
  }));

  router.get('/v1/cadastros/:id', asyncHandler(async (req, res) => {
    const response = await getCadastro(String(req.params.id));
    res.json(response);
  }));

  router.post('/v1/manifestos', asyncHandler(async (req, res) => {
    const response = await createManifest(req.body || {}, getCorrelationId(req));
    res.status(201).json(response);
  }));

  router.post('/v1/manifestos/batch-create', asyncHandler(async (req, res) => {
    const response = await createManifestBatch(req.body || {}, getCorrelationId(req));
    res.status(201).json(response);
  }));

  router.post('/v1/manifestos/batch-submit', asyncHandler(async (req, res) => {
    const response = await enqueueManifestBatchSubmit(req.body || {}, toHeaderMap(req.headers), getCorrelationId(req));
    res.status(202).json(response);
  }));

  router.post('/v1/manifestos/batch-cancel', asyncHandler(async (req, res) => {
    const response = await enqueueManifestBatchCancel(req.body || {}, toHeaderMap(req.headers), getCorrelationId(req));
    res.status(202).json(response);
  }));

  router.get('/v1/manifestos', asyncHandler(async (req, res) => {
    const response = await listManifests(req.query as LooseRecord, getCorrelationId(req), toHeaderMap(req.headers || {}));
    res.json(response);
  }));

  // IMPORTANTE: registrar antes de '/v1/manifestos/:id' para não ser capturado pelo :id.
  router.get('/v1/manifestos/receipt-responsibles', asyncHandler(async (req, res) => {
    const response = await listReceiptResponsibles(req.query as LooseRecord, getCorrelationId(req), toHeaderMap(req.headers || {}));
    res.json(response);
  }));

  router.get('/v1/manifestos/:id', asyncHandler(async (req, res) => {
    const response = await getManifest(String(req.params.id));
    res.json(response);
  }));

  router.post('/v1/manifestos/:id/replicate', asyncHandler(async (req, res) => {
    const response = await replicateManifest(String(req.params.id), req.body || {}, getCorrelationId(req));
    res.status(201).json(response);
  }));

  router.delete('/v1/manifestos/:id', asyncHandler(async (req, res) => {
    const response = await removeManifest(String(req.params.id), getCorrelationId(req));
    res.json(response);
  }));

  router.post('/v1/manifestos/:id/submit', asyncHandler(async (req, res) => {
    const response = await enqueueManifestSubmit(String(req.params.id), req.body || {}, toHeaderMap(req.headers), getCorrelationId(req));
    res.status(202).json(response);
  }));

  router.post('/v1/manifestos/:id/print', asyncHandler(async (req, res) => {
    const response = await enqueueManifestPrint(String(req.params.id), req.body || {}, toHeaderMap(req.headers), getCorrelationId(req));
    res.status(202).json(response);
  }));

  router.post('/v1/manifestos/:id/cancel', asyncHandler(async (req, res) => {
    const response = await enqueueManifestCancel(String(req.params.id), req.body || {}, toHeaderMap(req.headers), getCorrelationId(req));
    res.status(202).json(response);
  }));

  router.post('/v1/manifestos/receive', asyncHandler(async (req, res) => {
    const response = await enqueueManifestReceive(req.body || {}, toHeaderMap(req.headers), getCorrelationId(req));
    res.status(202).json(response);
  }));

  // Responsáveis pela emissão de CDF (lista síncrona da CETESB) para o destinador selecionar.
  router.get('/v1/cdf/responsibles', asyncHandler(async (req, res) => {
    const response = await listCdfResponsibles(req.query as LooseRecord, getCorrelationId(req), toHeaderMap(req.headers || {}));
    res.json(response);
  }));

  router.post('/v1/cdf/generate', asyncHandler(async (req, res) => {
    const response = await enqueueCdfGenerate(req.body || {}, toHeaderMap(req.headers), getCorrelationId(req));
    res.status(202).json(response);
  }));

  router.post('/v1/cdf/download', asyncHandler(async (req, res) => {
    const response = await enqueueCdfDownload(req.body || {}, toHeaderMap(req.headers), getCorrelationId(req));
    res.status(202).json(response);
  }));

  router.get('/v1/cdf/certificates', asyncHandler(async (req, res) => {
    const response = await listCdfCertificates(req.query as LooseRecord, getCorrelationId(req), toHeaderMap(req.headers || {}));
    res.json(response);
  }));

  router.get('/v1/cdf/documents/:documentId', asyncHandler(async (req, res) => {
    const document = await getCdfDocumentBuffer(
      String(req.params.documentId),
      req.query as LooseRecord,
      getCorrelationId(req),
      toHeaderMap(req.headers || {})
    );
    res.setHeader('Content-Type', document.mimeType);
    res.setHeader('Content-Disposition', `inline; filename="${document.fileName}"`);
    res.end(document.buffer);
  }));

  router.get('/v1/jobs/search', asyncHandler(async (req, res) => {
    const response = await jobsSearch((req.query || {}) as LooseRecord);
    res.json(response);
  }));

  router.post('/v1/jobs/:jobId/retry', asyncHandler(async (req, res) => {
    const response = await retryJob(
      String(req.params.jobId),
      toHeaderMap(req.headers || {}),
      getCorrelationId(req)
    );
    res.status(202).json(response);
  }));

  router.get('/v1/jobs/:jobId', asyncHandler(async (req, res) => {
    const response = await getJob(String(req.params.jobId));
    res.json(response);
  }));

  router.get('/v1/jobs/:jobId/events', asyncHandler(async (req, res) => {
    const jobId = String(req.params.jobId);
    const snapshot = await getJob(jobId);
    let lastFingerprint = createJobDriftFingerprint(snapshot);

    res.setHeader('Content-Type', 'application/x-ndjson; charset=utf-8');
    res.setHeader('Cache-Control', 'no-cache, no-transform');
    res.setHeader('Connection', 'keep-alive');
    res.setHeader('X-Accel-Buffering', 'no');
    res.flushHeaders?.();

    writeNdjson(res, { type: 'job.snapshot', job: snapshot });

    if (TERMINAL_JOB_STATUSES.has(String(snapshot.status || '').toLowerCase())) {
      res.end();
      return;
    }

    const client = new Client({
      connectionString: config.databaseUrl,
      ssl: config.databaseSsl ? { rejectUnauthorized: false } : false
    });

    let closed = false;

    const cleanup = async () => {
      if (closed) return;
      closed = true;
      try {
        await client.query('UNLISTEN job_events');
      } catch (error: unknown) {
        if (error instanceof Error) {
          // noop
        }
      }
      try {
        await client.end();
      } catch (error: unknown) {
        if (error instanceof Error) {
          // noop
        }
      }
      clearInterval(heartbeatTimer);
      if (!res.writableEnded) {
        res.end();
      }
    };

    let heartbeatCheckInFlight = false;
    const heartbeatTimer = setInterval(async () => {
      if (res.writableEnded) return;
      writeNdjson(res, { type: 'heartbeat', at: new Date().toISOString() });

      if (heartbeatCheckInFlight || closed) {
        return;
      }

      heartbeatCheckInFlight = true;
      try {
        const current = await getJob(jobId);
        const currentFingerprint = createJobDriftFingerprint(current);

        if (currentFingerprint !== lastFingerprint) {
          lastFingerprint = currentFingerprint;
          writeNdjson(res, {
            type: 'job.sync',
            reason: 'heartbeat-fallback',
            at: new Date().toISOString(),
            job: current
          });

          if (TERMINAL_JOB_STATUSES.has(String(current.status || '').toLowerCase())) {
            await cleanup();
          }
        }
      } catch (error: unknown) {
        if (error instanceof Error) {
          // noop
        }
      } finally {
        heartbeatCheckInFlight = false;
      }
    }, 15000);

    client.on('notification', async (message) => {
      if (closed || message.channel !== 'job_events' || !message.payload) return;

      let event;
      try {
        event = JSON.parse(message.payload);
      } catch (error: unknown) {
        if (error instanceof Error) {
          // noop
        }
        return;
      }

      if (event?.jobId !== jobId) {
        return;
      }

      const current = await getJob(jobId);
      lastFingerprint = createJobDriftFingerprint(current);
      writeNdjson(res, { type: event.eventType || 'job.updated', event, job: current });

      if (TERMINAL_JOB_STATUSES.has(String(current.status || '').toLowerCase())) {
        await cleanup();
      }
    });

    req.on('close', () => {
      cleanup();
    });

    await client.connect();
    await client.query('LISTEN job_events');
  }));

  router.get('/v1/audit/search', asyncHandler(async (req, res) => {
    const response = await auditSearch((req.query || {}) as LooseRecord);
    res.json(response);
  }));

  router.get('/v1/audit/:correlationId', asyncHandler(async (req, res) => {
    const response = await getAuditTrail(String(req.params.correlationId));
    res.json(response);
  }));

  router.get('/v1/operations/overview', asyncHandler(async (_req, res) => {
    const response = await getOperationsOverview();
    res.json(response);
  }));

  router.get('/v1/cetesb/accounts/health', asyncHandler(async (_req, res) => {
    const response = await cetesbAccountsHealth();
    res.json(response);
  }));

  router.get('/v1/cetesb/sessions/health', asyncHandler(async (req, res) => {
    const response = await cetesbSessionsHealth((req.query || {}) as LooseRecord);
    res.json(response);
  }));

  router.get('/v1/reports/mtrs', asyncHandler(async (req, res) => {
    const response = await reportsMtrSearch((req.query || {}) as LooseRecord);
    res.json(response);
  }));

  router.get('/v1/reports/mtrs/export', asyncHandler(async (req, res) => {
    const result = await reportsMtrExport((req.query || {}) as LooseRecord);
    res.setHeader('Content-Type', 'text/csv; charset=utf-8');
    res.setHeader('Content-Disposition', `attachment; filename="${result.fileName}"`);
    res.setHeader('X-Total-Items', String(result.totalItems));
    res.send(result.csv);
  }));

  router.get('/v1/manifestos/:id/documents/:documentId', asyncHandler(async (req, res) => {
    const document = await getManifestDocumentStream(String(req.params.id), String(req.params.documentId));
    res.setHeader('Content-Type', document.mimeType);
    res.setHeader('Content-Disposition', `inline; filename="${document.fileName}"`);
    fs.createReadStream(document.storagePath).pipe(res);
  }));

  // DMR endpoints (cadeia dmr-fluxo-base, fase 04)
  registerDmrRoutes(router);

  // MTR provisório endpoints (cadeia mtr-provisorio-fluxo-base, fase 04)
  registerMtrProvisorioRoutes(router);

  return router;
}


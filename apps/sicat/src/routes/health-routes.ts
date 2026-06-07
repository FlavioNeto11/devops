import { Router, type NextFunction, type Request, type Response } from 'express';
import {
  getSystemHealth,
  listActiveJobs,
  calculateJobPerformanceMetrics,
  detectUnhealthyWorkers,
  getWorkerStatistics,
  cleanupOldJobs
} from '../repositories/health-repo.js';
import { listDLQJobs } from '../repositories/job-repo.js';
import {
  getConversationOperationalReadiness,
  getConversationTelemetrySnapshot
} from '../services/conversation/conversation-observability.js';

const router = Router();

function parseNumericInput(value: unknown, fallback: number): number {
  if (typeof value === 'number' && Number.isFinite(value)) {
    return Math.trunc(value);
  }

  if (typeof value !== 'string') {
    return fallback;
  }

  const parsed = Number.parseInt(value, 10);
  return Number.isFinite(parsed) ? parsed : fallback;
}

/**
 * GET /health/system
 * Visão geral do health do sistema
 */
router.get('/system', async (_req: Request, res: Response, next: NextFunction) => {
  try {
    const health = await getSystemHealth();
    const workerStats = await getWorkerStatistics();
    const statistics = health.statistics;
    const conversationReadiness = getConversationOperationalReadiness();
    const conversationTelemetry = getConversationTelemetrySnapshot();

    const isHealthy =
      statistics.workers_healthy > 0 &&
      statistics.jobs_failed_1h < statistics.jobs_succeeded_1h * 0.2 && // failure rate < 20%
      statistics.jobs_dlq_total < 100; // DLQ não muito grande

    res.status(isHealthy ? 200 : 503).json({
      status: isHealthy ? 'healthy' : 'degraded',
      timestamp: new Date().toISOString(),
      jobs: {
        queued: statistics.jobs_queued,
        running: statistics.jobs_running,
        retryWait: statistics.jobs_retry_wait,
        succeeded1h: statistics.jobs_succeeded_1h,
        failed1h: statistics.jobs_failed_1h,
        dlqTotal: statistics.jobs_dlq_total,
        avgDurationMs1h: statistics.avg_job_duration_ms_1h
      },
      workers: {
        healthy: statistics.workers_healthy,
        degraded: statistics.workers_degraded,
        active5m: statistics.workers_active_5m,
        total: workerStats.total_workers,
        stats: {
          totalJobsClaimed: workerStats.total_jobs_claimed_all,
          totalJobsSucceeded: workerStats.total_jobs_succeeded_all,
          totalJobsFailed: workerStats.total_jobs_failed_all,
          totalJobsDLQ: workerStats.total_jobs_dlq_all,
          avgDurationMs: workerStats.avg_job_duration_ms_all
        }
      },
      conversation: {
        readiness: conversationReadiness,
        telemetry: conversationTelemetry
      }
    });
  } catch (error: unknown) {
    next(error);
  }
});

/**
 * GET /health/workers
 * Lista workers e seu status
 */
router.get('/workers', async (_req: Request, res: Response, next: NextFunction) => {
  try {
    const stats = await getWorkerStatistics();
    const unhealthy = await detectUnhealthyWorkers(300); // 5 minutos

    res.json({
      summary: {
        total: stats.total_workers,
        healthy: stats.healthy_workers,
        degraded: stats.degraded_workers,
        unhealthy: stats.unhealthy_workers,
        stopped: stats.stopped_workers,
        active5m: stats.active_last_5m
      },
      unhealthyWorkers: unhealthy,
      aggregatedStats: {
        totalJobsClaimed: stats.total_jobs_claimed_all,
        totalJobsSucceeded: stats.total_jobs_succeeded_all,
        totalJobsFailed: stats.total_jobs_failed_all,
        totalJobsDLQ: stats.total_jobs_dlq_all,
        avgJobDurationMs: stats.avg_job_duration_ms_all
      }
    });
  } catch (error: unknown) {
    next(error);
  }
});

/**
 * GET /health/jobs/active
 * Lista jobs atualmente ativos (queued, running, retry_wait)
 */
router.get('/jobs/active', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const limit = parseNumericInput(req.query.limit, 100);
    const jobs = await listActiveJobs(limit);

    res.json({
      count: jobs.length,
      jobs: jobs.map((j) => ({
        jobId: j.job_id,
        operation: j.operation,
        entityType: j.entity_type,
        entityId: j.entity_id,
        status: j.status,
        attempts: j.attempts,
        maxAttempts: j.max_attempts,
        priority: j.priority,
        correlationId: j.correlation_id,
        queuedAt: j.queued_at,
        claimedAt: j.claimed_at,
        claimedBy: j.claimed_by,
        nextRetryAt: j.next_retry_at,
        ageSeconds: j.age_seconds,
        lastErrorCode: j.last_error_code,
        lastErrorMessage: j.last_error_message
      }))
    });
  } catch (error: unknown) {
    next(error);
  }
});

/**
 * GET /health/jobs/dlq
 * Lista jobs na Dead Letter Queue
 */
router.get('/jobs/dlq', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const limit = parseNumericInput(req.query.limit, 100);
    const dlqJobs = await listDLQJobs(limit);

    res.json({
      count: dlqJobs.length,
      jobs: dlqJobs.map(j => ({
        id: j.id,
        jobId: j.job_id,
        commandId: j.command_id,
        operation: j.operation,
        entityType: j.entity_type,
        entityId: j.entity_id,
        attempts: j.attempts,
        maxAttempts: j.max_attempts,
        lastErrorCode: j.last_error_code,
        lastErrorMessage: j.last_error_message,
        reason: j.reason,
        movedAt: j.moved_at,
        originalQueuedAt: j.original_queued_at,
        correlationId: j.correlation_id,
        tags: j.tags
      }))
    });
  } catch (error: unknown) {
    next(error);
  }
});

/**
 * GET /health/metrics/performance
 * Métricas de performance dos jobs (últimas 24h por padrão)
 */
router.get('/metrics/performance', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const hoursBack = parseNumericInput(req.query.hours, 24);
    const metrics = await calculateJobPerformanceMetrics(hoursBack);

    res.json({
      period: `${hoursBack}h`,
      operations: metrics.by_operation.map((m) => ({
        operation: m.operation,
        totalJobs: m.total_jobs,
        succeededJobs: m.succeeded_jobs,
        failedJobs: m.failed_jobs,
        dlqJobs: m.dlq_jobs,
        avgDurationMs: Number(m.avg_duration_ms).toFixed(2),
        p50DurationMs: Number(m.p50_duration_ms).toFixed(2),
        p95DurationMs: Number(m.p95_duration_ms).toFixed(2),
        p99DurationMs: Number(m.p99_duration_ms).toFixed(2),
        successRate: `${Number(m.success_rate).toFixed(2)}%`
      }))
    });
  } catch (error: unknown) {
    next(error);
  }
});

/**
 * POST /health/maintenance/cleanup
 * Executa limpeza de jobs antigos
 */
router.post('/maintenance/cleanup', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const body = req.body as Record<string, unknown> | undefined;
    const retentionDays = parseNumericInput(body?.retentionDays, 30);
    const batchSize = parseNumericInput(body?.batchSize, 1000);

    const deletedCount = await cleanupOldJobs(retentionDays, batchSize);

    res.json({
      message: 'Cleanup executed successfully',
      deletedCount,
      retentionDays,
      batchSize
    });
  } catch (error: unknown) {
    next(error);
  }
});

/**
 * GET /health/ping
 * Health check simples (para load balancers)
 */
router.get('/ping', (_req: Request, res: Response) => {
  res.json({
    status: 'ok',
    timestamp: new Date().toISOString(),
    uptime: process.uptime(),
    memory: process.memoryUsage()
  });
});

export default router;

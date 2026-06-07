import { config } from '../lib/config.js';
import { sleep } from '../lib/time.js';
import { claimJobs, updateJobIfOwned, moveJobToDLQ, requeueStaleRunningJobs, heartbeatJobClaim } from '../repositories/job-repo.js';
import {
  registerWorker,
  sendWorkerHeartbeat,
  stopWorker,
  logSystemEvent
} from '../repositories/health-repo.js';
import { createCetesbGateway } from '../gateways/cetesb-gateway.js';
import {
  processJob,
  applyAsyncOperationTerminalFailureSideEffect,
  applyConversationArtifactTerminalFailureSideEffect,
  applyManifestCancelTerminalFailureSideEffect,
  applyManifestSubmitTerminalFailureSideEffect
} from './operation-handlers.js';
import { calculateNextRetry, shouldMoveToDLQ, extractJobTags, isRetryableJobError, getJobErrorCode } from '../lib/retry.js';

const gateway = createCetesbGateway();

type JobEntity = {
  jobId: string;
  commandId: string | null;
  entityType: string;
  entityId: string;
  operation: string;
  status: 'queued' | 'running' | 'retry_wait' | 'failed' | 'succeeded' | 'dlq' | 'cancelled';
  attempts: number;
  maxAttempts: number;
  retryStrategy: string;
  baseDelayMs: number;
  maxDelayMs: number;
  payload: Record<string, unknown> | null;
  retryDelays: unknown[];
  correlationId: string | null;
  claimedBy: string | null;
  lastErrorCode: string | null;
  lastErrorMessage: string | null;
  dlqReason: string | null;
};

type WorkerStats = {
  totalJobsClaimed: number;
  totalJobsSucceeded: number;
  totalJobsFailed: number;
  totalJobsDLQ: number;
  jobDurations: number[];
  lastJobClaimedAt: Date | null;
  lastJobCompletedAt: Date | null;
};

type FailureTransition =
  | { action: 'dlq'; dlqReason: string }
  | { action: 'failed' | 'retry_wait'; delayMs?: number; patch: Record<string, unknown> };

function getErrorMessage(error: unknown): string {
  if (error instanceof Error) return error.message;
  if (error && typeof error === 'object' && 'message' in error && typeof (error as { message?: unknown }).message === 'string') {
    return (error as { message: string }).message;
  }
  if (typeof error === 'string') return error;
  if (typeof error === 'number' || typeof error === 'boolean' || typeof error === 'bigint') {
    return String(error);
  }
  return '';
}

function isOwnershipError(error: unknown): error is { code: string; message: string } {
  return Boolean(error && typeof error === 'object' && 'code' in error && (error as { code?: unknown }).code === 'JOB_OWNERSHIP_LOST');
}

function hasRemoteBody(error: unknown): error is { extras: { remoteBody: unknown } } {
  return Boolean(
    error
    && typeof error === 'object'
    && 'extras' in error
    && (error as { extras?: unknown }).extras
    && typeof (error as { extras?: unknown }).extras === 'object'
    && 'remoteBody' in ((error as { extras: { remoteBody?: unknown } }).extras)
  );
}

// Worker stats tracking
let workerStats: WorkerStats = {
  totalJobsClaimed: 0,
  totalJobsSucceeded: 0,
  totalJobsFailed: 0,
  totalJobsDLQ: 0,
  jobDurations: [],
  lastJobClaimedAt: null,
  lastJobCompletedAt: null
};

function updateWorkerStats(event: 'claimed' | 'succeeded' | 'failed' | 'dlq', duration: number | null = null) {
  switch (event) {
    case 'claimed':
      workerStats.totalJobsClaimed++;
      workerStats.lastJobClaimedAt = new Date();
      break;
    case 'succeeded':
      workerStats.totalJobsSucceeded++;
      workerStats.lastJobCompletedAt = new Date();
      if (duration) workerStats.jobDurations.push(duration);
      break;
    case 'failed':
      workerStats.totalJobsFailed++;
      workerStats.lastJobCompletedAt = new Date();
      if (duration) workerStats.jobDurations.push(duration);
      break;
    case 'dlq':
      workerStats.totalJobsDLQ++;
      workerStats.lastJobCompletedAt = new Date();
      break;
  }

  // Manter apenas últimas 100 durações para cálculo de média
  if (workerStats.jobDurations.length > 100) {
    workerStats.jobDurations = workerStats.jobDurations.slice(-100);
  }
}

function getWorkerStatsForHeartbeat() {
  const avgDuration = workerStats.jobDurations.length > 0
    ? Math.round(workerStats.jobDurations.reduce((a, b) => a + b, 0) / workerStats.jobDurations.length)
    : null;

  return {
    totalJobsClaimed: workerStats.totalJobsClaimed,
    totalJobsSucceeded: workerStats.totalJobsSucceeded,
    totalJobsFailed: workerStats.totalJobsFailed,
    totalJobsDLQ: workerStats.totalJobsDLQ,
    avgJobDurationMs: avgDuration,
    lastJobClaimedAt: workerStats.lastJobClaimedAt,
    lastJobCompletedAt: workerStats.lastJobCompletedAt
  };
}

export function resolveFailureTransition(job: JobEntity, error: unknown, executionTimeMs: number, now = new Date()): FailureTransition {
  const retryable = isRetryableJobError(error);
  const errorCode = getJobErrorCode(error);
  const errorMessage = getErrorMessage(error) || 'Unhandled worker error';

  if (!retryable) {
    return {
      action: 'failed',
      patch: {
        status: 'failed',
        attempts: job.attempts,
        finishedAt: now.toISOString(),
        lastErrorCode: errorCode,
        lastErrorMessage: errorMessage,
        executionTimeMs,
        tags: extractJobTags({ ...job, status: 'failed', lastErrorCode: errorCode })
      }
    };
  }

  if (shouldMoveToDLQ(job)) {
    return {
      action: 'dlq',
      dlqReason: `Max attempts (${job.maxAttempts}) exceeded for retryable error. Last error: ${errorMessage}`
    };
  }

  const nextRetryAt = calculateNextRetry(
    job.attempts,
    job.retryStrategy as 'exponential' | 'linear' | 'fixed',
    job.baseDelayMs,
    job.maxDelayMs
  );

  const currentDelay = nextRetryAt.getTime() - Date.now();
  const retryDelays = [...(job.retryDelays || []), {
    attempt: job.attempts,
    delayMs: currentDelay,
    scheduledFor: nextRetryAt.toISOString()
  }];

  return {
    action: 'retry_wait',
    delayMs: currentDelay,
    patch: {
      status: 'retry_wait',
      attempts: job.attempts,
      nextRetryAt: nextRetryAt.toISOString(),
      lastErrorCode: errorCode,
      lastErrorMessage: errorMessage,
      executionTimeMs,
      retryDelays,
      tags: extractJobTags({ ...job, status: 'retry_wait', lastErrorCode: errorCode })
    }
  };
}

async function registerWorkerLifecycle(workerId: string, workerName: string) {
  try {
    await registerWorker(workerId, workerName);
    await logSystemEvent({
      eventType: 'WORKER_STARTED',
      severity: 'info',
      component: 'job-runner',
      message: `Worker ${workerId} started`,
      details: { workerId, workerName, pid: process.pid }
    });
    console.log(`[worker] Registrado como ${workerId}`);
  } catch (error: unknown) {
    console.error('[worker] Erro ao registrar worker:', getErrorMessage(error));
  }
}

function startWorkerHeartbeat(workerId: string) {
  return setInterval(async () => {
    try {
      await sendWorkerHeartbeat(workerId, getWorkerStatsForHeartbeat());
    } catch (error: unknown) {
      console.error('[worker] Erro ao enviar heartbeat:', getErrorMessage(error));
    }
  }, 30000);
}

function createCleanupHandler(workerId: string, heartbeatInterval: NodeJS.Timeout, shutdownState: { requested: boolean }) {
  return async (signal: string) => {
    if (shutdownState.requested) {
      console.log('[worker] Shutdown já em progresso, forçando saída...');
      process.exit(1);
    }

    shutdownState.requested = true;
    console.log(`[worker] Recebido sinal ${signal}, encerrando gracefully...`);
    clearInterval(heartbeatInterval);

    const cleanupTimeout = setTimeout(() => {
      console.error('[worker] Cleanup timeout (5s), forçando saída');
      process.exit(1);
    }, 5000);

    try {
      await stopWorker(workerId, `Shutdown requested (${signal})`);
      console.log('[worker] Cleanup concluído com sucesso');
    } catch (error: unknown) {
      console.error('[worker] Erro ao parar worker:', getErrorMessage(error));
    } finally {
      clearTimeout(cleanupTimeout);
      process.exit(0);
    }
  };
}

function attachWorkerProcessHandlers(cleanup: (signal: string) => Promise<void>) {
  process.on('SIGINT', () => cleanup('SIGINT'));
  process.on('SIGTERM', () => cleanup('SIGTERM'));
  process.on('uncaughtException', (error) => {
    console.error('[worker] uncaughtException:', error);
    cleanup('uncaughtException');
  });
  process.on('unhandledRejection', (reason) => {
    console.error('[worker] unhandledRejection:', reason);
    cleanup('unhandledRejection');
  });
}

async function requeueStaleJobsIfNeeded() {
  const staleJobs = await requeueStaleRunningJobs(config.workerClaimStaleTimeoutMs, config.workerBatchSize);
  if (staleJobs.length === 0) {
    return;
  }

  console.warn(`[worker] ${staleJobs.length} job(s) running stale reencaminhados para retry_wait`);
  await logSystemEvent({
    eventType: 'STALE_JOBS_REQUEUED',
    severity: 'warning',
    component: 'job-runner',
    message: `${staleJobs.length} stale jobs requeued`,
    details: { count: staleJobs.length, jobIds: staleJobs.map((job) => job.jobId) }
  });
}

function startClaimHeartbeat(jobId: string, workerName: string) {
  if (config.workerClaimHeartbeatMs <= 0) {
    return null;
  }

  return setInterval(async () => {
    try {
      await heartbeatJobClaim(jobId, workerName);
    } catch (error: unknown) {
      console.warn(`[worker] heartbeat de claim falhou para job ${jobId}: ${getErrorMessage(error)}`);
    }
  }, config.workerClaimHeartbeatMs);
}

async function markJobSucceeded(job: JobEntity, workerName: string, startTime: number) {
  const current = await updateJobIfOwned(job.jobId, workerName, {
    status: 'succeeded',
    finishedAt: new Date().toISOString(),
    executionTimeMs: Date.now() - startTime,
    tags: extractJobTags({ operation: job.operation, entityType: job.entityType, status: 'succeeded' })
  }, ['running', 'succeeded']);

  if (!current) {
    console.warn(`[worker] ownership perdido antes de concluir job ${job.jobId}; finalização ignorada`);
    return false;
  }

  const executionTimeMs = Date.now() - startTime;
  updateWorkerStats('succeeded', executionTimeMs);
  console.log(`[worker] job ${job.jobId} concluído em ${executionTimeMs}ms`);
  return true;
}

async function handleDlqTransition(job: JobEntity, workerName: string, transition: Extract<FailureTransition, { action: 'dlq' }>, error: unknown) {
  const effectJob = { ...job, payload: job.payload ?? {} };
  await applyAsyncOperationTerminalFailureSideEffect(effectJob, transition, error);
  await applyManifestSubmitTerminalFailureSideEffect(effectJob, transition, error);
  await applyManifestCancelTerminalFailureSideEffect(effectJob, transition, error);
  await applyConversationArtifactTerminalFailureSideEffect(effectJob, transition, error);
  const ownedJob = { ...job, payload: job.payload ?? {}, claimedBy: workerName } as Parameters<typeof moveJobToDLQ>[0];
  const movedToDLQ = await moveJobToDLQ(ownedJob, transition.dlqReason);
  if (!movedToDLQ) {
    console.warn(`[worker] ownership perdido antes de mover job ${job.jobId} para DLQ; transição ignorada`);
    return;
  }

  updateWorkerStats('dlq');
  await logSystemEvent({
    eventType: 'JOB_DLQ_MOVED',
    severity: 'error',
    component: 'job-runner',
    message: `Job ${job.jobId} moved to DLQ`,
    details: {
      jobId: job.jobId,
      operation: job.operation,
      reason: transition.dlqReason,
      attempts: job.attempts,
      maxAttempts: job.maxAttempts
    },
    correlationId: job.correlationId
  });
  console.error(`[worker] job ${job.jobId} movido para DLQ: ${transition.dlqReason}`);
}

async function handleFailedTransition(job: JobEntity, workerName: string, transition: Extract<FailureTransition, { action: 'failed' | 'retry_wait' }>, error: unknown, executionTimeMs: number) {
  const transitioned = await updateJobIfOwned(job.jobId, workerName, transition.patch);
  if (!transitioned) {
    console.warn(`[worker] ownership perdido antes de aplicar transição ${transition.action} no job ${job.jobId}`);
    return;
  }

  if (transition.action === 'failed') {
    const effectJob = { ...job, payload: job.payload ?? {} };
    await applyAsyncOperationTerminalFailureSideEffect(effectJob, transition, error);
    await applyManifestSubmitTerminalFailureSideEffect(effectJob, transition, error);
    await applyManifestCancelTerminalFailureSideEffect(effectJob, transition, error);
    await applyConversationArtifactTerminalFailureSideEffect(effectJob, transition, error);
    updateWorkerStats('failed', executionTimeMs);
    console.error(`[worker] job ${job.jobId} falhou definitivamente (tentativa ${job.attempts}/${job.maxAttempts}): ${transition.patch.lastErrorCode}`);
    return;
  }

  const delayMs = transition.delayMs ?? 0;
  console.error(`[worker] job ${job.jobId} falhou (tentativa ${job.attempts}/${job.maxAttempts}). Próximo retry em ${Math.round(delayMs / 1000)}s usando estratégia ${job.retryStrategy}`);
}

async function processClaimedJob(job: JobEntity, workerName: string) {
  const startTime = Date.now();
  updateWorkerStats('claimed');
  const claimHeartbeatInterval = startClaimHeartbeat(job.jobId, workerName);

  try {
    await processJob({ ...job, payload: job.payload ?? {} }, gateway);
    await markJobSucceeded(job, workerName, startTime);
  } catch (error: unknown) {
    if (isOwnershipError(error)) {
      console.warn(`[worker] ${error.message}`);
      return;
    }

    const executionTimeMs = Date.now() - startTime;
    console.error('[worker DEBUG] Erro completo:', error);
    if (hasRemoteBody(error)) {
      console.error('[worker DEBUG] CETESB remoteBody:', JSON.stringify(error.extras.remoteBody, null, 2));
    }

    const transition = resolveFailureTransition(job, error, executionTimeMs);
    if (transition.action === 'dlq') {
      await handleDlqTransition(job, workerName, transition, error);
      return;
    }

    await handleFailedTransition(job, workerName, transition, error, executionTimeMs);
  } finally {
    if (claimHeartbeatInterval) {
      clearInterval(claimHeartbeatInterval);
    }
  }
}

async function processWorkerIteration({ once, shutdownRequested, workerName }: { once: boolean; shutdownRequested: () => boolean; workerName: string }) {
  if (shutdownRequested()) {
    console.log('[worker] Shutdown detectado, interrompendo loop');
    return false;
  }

  await requeueStaleJobsIfNeeded();
  const jobs = await claimJobs(config.workerBatchSize);
  if (jobs.length === 0) {
    if (once) {
      return false;
    }
    await sleep(config.workerPollIntervalMs);
    return true;
  }

  for (const job of jobs) {
    await processClaimedJob(job, workerName);
  }

  return !once;
}

export async function runWorkerLoop({ once = false } = {}) {
  const workerId = `worker-${process.pid}-${Date.now()}`;
  const workerName = process.env.WORKER_NAME || `worker-${process.pid}`;
  await registerWorkerLifecycle(workerId, workerName);
  const heartbeatInterval = startWorkerHeartbeat(workerId);
  const shutdownState = { requested: false };
  const cleanup = createCleanupHandler(workerId, heartbeatInterval, shutdownState);
  attachWorkerProcessHandlers(cleanup);

  while (await processWorkerIteration({ once, shutdownRequested: () => shutdownState.requested, workerName })) {
    continue;
  }

  clearInterval(heartbeatInterval);
  await stopWorker(workerId, 'Worker loop completed (once mode)');
}

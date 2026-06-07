import { AppError } from '../lib/problem.js';
import { cancelActiveJob, findJobById, removeActiveJob } from '../repositories/job-repo.js';

function getErrorCodeAndMessage(error: unknown): { code: string | null; message: string } {
  if (error && typeof error === 'object') {
    const record = error as Record<string, unknown>;
    return {
      code: typeof record.code === 'string' ? record.code : null,
      message: String(record.message || 'Unexpected error')
    };
  }
  return { code: null, message: String(error || 'Unexpected error') };
}

export async function getJob(jobId: string) {
  const job = await findJobById(jobId);
  if (!job) {
    throw new AppError(404, 'Not Found', `Job ${jobId} was not found.`);
  }

  return {
    jobId: job.jobId,
    entityType: job.entityType,
    entityId: job.entityId,
    operation: job.operation,
    status: job.status,
    attempts: job.attempts,
    maxAttempts: job.maxAttempts,
    queuedAt: job.queuedAt,
    startedAt: job.startedAt,
    finishedAt: job.finishedAt,
    nextRetryAt: job.nextRetryAt,
    correlationId: job.correlationId,
    idempotencyKey: job.idempotencyKey,
    lastErrorCode: job.lastErrorCode,
    lastErrorMessage: job.lastErrorMessage,
    result: {
      outcome: job.payload?.outcome || null,
      printUrl: job.payload?.printUrl || null
    },
    links: {
      entity: job.entityType === 'manifest' ? `/v1/manifestos/${job.entityId}` : job.entityType === 'cadastro' ? `/v1/cadastros/${job.entityId}` : `/v1/jobs/${job.jobId}`,
      audit: `/v1/audit/${job.correlationId}`
    }
  };
}

export async function cancelJobFromActiveQueue(jobId: string, reason: string | null | undefined) {
  try {
    const job = await cancelActiveJob(jobId, reason || 'Cancelled manually by operator');
    if (!job) {
      throw new AppError(404, 'Not Found', `Job ${jobId} was not found.`);
    }

    return {
      jobId: job.jobId,
      status: job.status,
      message: 'Job cancelled successfully.'
    };
  } catch (error: unknown) {
    if (error instanceof AppError) throw error;
    const { code, message } = getErrorCodeAndMessage(error);
    if (code === 'JOB_RUNNING_CANNOT_CANCEL') {
      throw new AppError(409, 'Conflict', message, { code });
    }
    if (code === 'JOB_NOT_ACTIVE') {
      throw new AppError(409, 'Conflict', message, { code });
    }
    throw error;
  }
}

export async function removeJobFromActiveQueue(jobId: string) {
  try {
    const removed = await removeActiveJob(jobId);
    if (!removed) {
      throw new AppError(404, 'Not Found', `Job ${jobId} was not found.`);
    }

    return {
      jobId,
      removed: true,
      message: 'Job removed successfully.'
    };
  } catch (error: unknown) {
    if (error instanceof AppError) throw error;
    const { code, message } = getErrorCodeAndMessage(error);
    if (code === 'JOB_RUNNING_CANNOT_REMOVE' || code === 'JOB_STATUS_CANNOT_REMOVE') {
      throw new AppError(409, 'Conflict', message, { code: code || undefined });
    }
    throw error;
  }
}

import { query, withTransaction } from '../db/pool.js';
import type { PoolClient, QueryResultRow } from 'pg';

type DbClient = Pick<PoolClient, 'query'> | null;
type JobStatus = 'queued' | 'running' | 'retry_wait' | 'failed' | 'succeeded' | 'dlq' | 'cancelled';

type JobPatch = {
  status?: JobStatus;
  attempts?: number;
  startedAt?: string | null;
  finishedAt?: string | null;
  nextRetryAt?: string | null;
  lastErrorCode?: string | null;
  lastErrorMessage?: string | null;
  payload?: Record<string, unknown>;
  executionTimeMs?: number | null;
  retryDelays?: unknown[];
  tags?: string[];
};

type UpdateJobOptions = { client?: DbClient };

type JobRow = QueryResultRow & {
  job_id: string;
  command_id: string | null;
  entity_type: string;
  entity_id: string;
  operation: string;
  status: JobStatus;
  attempts: number;
  max_attempts: number;
  queued_at: Date | string | null;
  started_at: Date | string | null;
  finished_at: Date | string | null;
  next_retry_at: Date | string | null;
  correlation_id: string | null;
  idempotency_key: string | null;
  last_error_code: string | null;
  last_error_message: string | null;
  payload: Record<string, unknown> | null;
  created_at: Date | string | null;
  updated_at: Date | string | null;
  priority: number | null;
  retry_strategy: string | null;
  base_delay_ms: number | null;
  max_delay_ms: number | null;
  retry_delays: unknown[] | null;
  claimed_at: Date | string | null;
  claim_heartbeat_at: Date | string | null;
  claimed_by: string | null;
  execution_time_ms: number | null;
  tags: string[] | null;
  dlq_moved_at: Date | string | null;
  dlq_reason: string | null;
  version: number | null;
};

type JobEntity = {
  jobId: string;
  commandId: string | null;
  entityType: string;
  entityId: string;
  operation: string;
  status: JobStatus;
  attempts: number;
  maxAttempts: number;
  queuedAt: string | null;
  startedAt: string | null;
  finishedAt: string | null;
  nextRetryAt: string | null;
  correlationId: string | null;
  idempotencyKey: string | null;
  lastErrorCode: string | null;
  lastErrorMessage: string | null;
  payload: Record<string, unknown> | null;
  createdAt: string | null;
  updatedAt: string | null;
  priority: number;
  retryStrategy: string;
  baseDelayMs: number;
  maxDelayMs: number;
  retryDelays: unknown[];
  claimedAt: string | null;
  claimHeartbeatAt: string | null;
  claimedBy: string | null;
  executionTimeMs: number | null;
  tags: string[];
  dlqMovedAt: string | null;
  dlqReason: string | null;
  version: number;
};

type JobInsertInput = {
  jobId: string;
  commandId: string;
  entityType: string;
  entityId: string;
  operation: string;
  payload?: Record<string, unknown>;
  status: JobStatus;
  maxAttempts: number;
  correlationId?: string | null;
  idempotencyKey?: string | null;
  priority?: number;
  retryStrategy?: string;
  baseDelayMs?: number;
  maxDelayMs?: number;
  tags?: string[];
};

type JobConflictError = Error & { code?: string };

function getQueryExecutor(client: DbClient = null) {
  return client?.query?.bind(client) || query;
}

function toIso(value: Date | string | null): string | null {
  if (value == null) return null;
  if (value instanceof Date) return value.toISOString();
  return value;
}

async function emitJobNotification(job: JobEntity | null, eventType = 'job.updated') {
  if (!job?.jobId) return;
  const payload = {
    eventType,
    jobId: job.jobId,
    status: job.status,
    operation: job.operation,
    entityType: job.entityType,
    entityId: job.entityId,
    correlationId: job.correlationId,
    at: new Date().toISOString()
  };
  await query('select pg_notify($1, $2)', ['job_events', JSON.stringify(payload)]);
}

function mapJob(row?: JobRow): JobEntity | null {
  if (!row) return null;
  return {
    jobId: row.job_id,
    commandId: row.command_id,
    entityType: row.entity_type,
    entityId: row.entity_id,
    operation: row.operation,
    status: row.status,
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
    payload: row.payload,
    createdAt: toIso(row.created_at),
    updatedAt: toIso(row.updated_at),
    // Novos campos migration 002
    priority: row.priority ?? 0,
    retryStrategy: row.retry_strategy || 'exponential',
    baseDelayMs: row.base_delay_ms ?? 1000,
    maxDelayMs: row.max_delay_ms ?? 300000,
    retryDelays: row.retry_delays || [],
    claimedAt: toIso(row.claimed_at),
    claimHeartbeatAt: toIso(row.claim_heartbeat_at),
    claimedBy: row.claimed_by,
    executionTimeMs: row.execution_time_ms,
    tags: row.tags || [],
    dlqMovedAt: toIso(row.dlq_moved_at),
    dlqReason: row.dlq_reason,
    // Campos migration 004 (versioning)
    version: row.version ?? 1
  };
}

async function insertJobInternal(input: JobInsertInput, { deduplicateActive = false, client = null }: { deduplicateActive?: boolean; client?: DbClient } = {}) {
  const execute = getQueryExecutor(client);
  const sql = deduplicateActive
    ? `insert into jobs(
      job_id, command_id, entity_type, entity_id, operation, payload, status, max_attempts,
      correlation_id, idempotency_key, priority, retry_strategy, base_delay_ms, max_delay_ms, tags
    ) values ($1,$2,$3,$4,$5,$6::jsonb,$7,$8,$9,$10,$11,$12,$13,$14,$15::jsonb)
    on conflict (entity_type, entity_id, operation)
    where status in ('queued', 'running', 'retry_wait')
    do nothing
    returning *`
    : `insert into jobs(
      job_id, command_id, entity_type, entity_id, operation, payload, status, max_attempts,
      correlation_id, idempotency_key, priority, retry_strategy, base_delay_ms, max_delay_ms, tags
    ) values ($1,$2,$3,$4,$5,$6::jsonb,$7,$8,$9,$10,$11,$12,$13,$14,$15::jsonb)
    returning *`;

  const result = await execute<JobRow>(sql, [
    input.jobId,
    input.commandId,
    input.entityType,
    input.entityId,
    input.operation,
    JSON.stringify(input.payload || {}),
    input.status,
    input.maxAttempts,
    input.correlationId,
    input.idempotencyKey || null,
    input.priority ?? 0,
    input.retryStrategy || 'exponential',
    input.baseDelayMs ?? 1000,
    input.maxDelayMs ?? 300000,
    JSON.stringify(input.tags || [])
  ]);

  if ((result.rowCount || 0) > 0) {
    const mapped = mapJob(result.rows[0]);
    await emitJobNotification(mapped, 'job.created');
    return { job: mapped, created: true };
  }

  if (!deduplicateActive) {
    throw new Error(`Failed to insert job ${input.jobId}`);
  }

  const existing = await execute<JobRow>(
    `select *
       from jobs
      where entity_type = $1
        and entity_id = $2
        and operation = $3
        and status in ('queued', 'running', 'retry_wait')
      order by queued_at asc
      limit 1`,
    [input.entityType, input.entityId, input.operation]
  );

  if (existing.rowCount === 0) {
    throw new Error(`Failed to deduplicate active job for ${input.operation}:${input.entityId}`);
  }

  return { job: mapJob(existing.rows[0]), created: false };
}

export async function insertJob(input: JobInsertInput) {
  const { job } = await insertJobInternal(input, { deduplicateActive: false, client: null });
  return job;
}

export async function insertJobDeduplicated(input: JobInsertInput, client: DbClient = null) {
  return insertJobInternal(input, { deduplicateActive: true, client });
}

export async function findJobById(jobId: string, client: DbClient = null) {
  const execute = getQueryExecutor(client);
  const result = await execute<JobRow>('select * from jobs where job_id = $1', [jobId]);
  return mapJob(result.rows[0]);
}

export async function updateJob(jobId: string, patch: JobPatch, options: UpdateJobOptions = {}) {
  const execute = getQueryExecutor(options.client || null);
  const result = await execute<JobRow>(
    `update jobs set
       status = coalesce($2, status),
       attempts = coalesce($3, attempts),
       started_at = coalesce($4, started_at),
       finished_at = coalesce($5, finished_at),
       next_retry_at = $6,
       last_error_code = $7,
       last_error_message = $8,
       payload = coalesce($9::jsonb, payload),
       execution_time_ms = coalesce($10, execution_time_ms),
       retry_delays = coalesce($11::jsonb, retry_delays),
       tags = coalesce($12::jsonb, tags),
       updated_at = now()
     where job_id = $1
     returning *`,
    [
      jobId,
      patch.status || null,
      patch.attempts ?? null,
      patch.startedAt || null,
      patch.finishedAt || null,
      patch.nextRetryAt || null,
      patch.lastErrorCode || null,
      patch.lastErrorMessage || null,
      patch.payload ? JSON.stringify(patch.payload) : null,
      patch.executionTimeMs ?? null,
      patch.retryDelays ? JSON.stringify(patch.retryDelays) : null,
      patch.tags ? JSON.stringify(patch.tags) : null
    ]
  );
  const mapped = mapJob(result.rows[0]);
  if (!mapped) {
    return null;
  }
  await emitJobNotification(mapped, 'job.updated');
  return mapped;
}

export async function updateJobIfOwned(jobId: string, claimedBy: string, patch: JobPatch, allowedStatuses: JobStatus[] = ['running'], options: UpdateJobOptions = {}) {
  const execute = getQueryExecutor(options.client || null);
  const statuses = Array.isArray(allowedStatuses) && allowedStatuses.length > 0
    ? allowedStatuses
    : ['running'];

  const result = await execute<JobRow>(
    `update jobs set
       status = coalesce($4, status),
       attempts = coalesce($5, attempts),
       started_at = coalesce($6, started_at),
       finished_at = coalesce($7, finished_at),
       next_retry_at = $8,
       last_error_code = $9,
       last_error_message = $10,
       payload = coalesce($11::jsonb, payload),
       execution_time_ms = coalesce($12, execution_time_ms),
       retry_delays = coalesce($13::jsonb, retry_delays),
       tags = coalesce($14::jsonb, tags),
       updated_at = now()
     where job_id = $1
       and claimed_by = $2
       and status = any($3::text[])
     returning *`,
    [
      jobId,
      claimedBy,
      statuses,
      patch.status || null,
      patch.attempts ?? null,
      patch.startedAt || null,
      patch.finishedAt || null,
      patch.nextRetryAt || null,
      patch.lastErrorCode || null,
      patch.lastErrorMessage || null,
      patch.payload ? JSON.stringify(patch.payload) : null,
      patch.executionTimeMs ?? null,
      patch.retryDelays ? JSON.stringify(patch.retryDelays) : null,
      patch.tags ? JSON.stringify(patch.tags) : null
    ]
  );

  const mapped = mapJob(result.rows[0]);
  if (!mapped) {
    return null;
  }

  await emitJobNotification(mapped, 'job.updated');
  return mapped;
}

/**
 * Atualiza job com locking otimista (versioning)
 * Lança erro se version não corresponder (indica modificação concorrente)
 */
export async function updateJobWithOptimisticLock(jobId: string, expectedVersion: number, patch: JobPatch) {
  const result = await query<JobRow>(
    `update jobs set
       status = coalesce($3, status),
       attempts = coalesce($4, attempts),
       started_at = coalesce($5, started_at),
       finished_at = coalesce($6, finished_at),
       next_retry_at = $7,
       last_error_code = $8,
       last_error_message = $9,
       payload = coalesce($10::jsonb, payload),
       execution_time_ms = coalesce($11, execution_time_ms),
       retry_delays = coalesce($12::jsonb, retry_delays),
       tags = coalesce($13::jsonb, tags),
       updated_at = now()
     where job_id = $1 and version = $2
     returning *`,
    [
      jobId,
      expectedVersion,
      patch.status || null,
      patch.attempts ?? null,
      patch.startedAt || null,
      patch.finishedAt || null,
      patch.nextRetryAt || null,
      patch.lastErrorCode || null,
      patch.lastErrorMessage || null,
      patch.payload ? JSON.stringify(patch.payload) : null,
      patch.executionTimeMs ?? null,
      patch.retryDelays ? JSON.stringify(patch.retryDelays) : null,
      patch.tags ? JSON.stringify(patch.tags) : null
    ]
  );

  if (result.rowCount === 0) {
    throw new Error(`OptimisticLockError: Job ${jobId} was modified by another process (expected version ${expectedVersion})`);
  }

  return mapJob(result.rows[0]);
}

export async function claimJobs(batchSize: number) {
  const workerName = process.env.WORKER_NAME || `worker-${process.pid}`;

  return withTransaction(async (client) => {
    const result = await client.query(
      `with candidate as (
         select job_id
         from jobs
         where status in ('queued', 'retry_wait')
           and coalesce(next_retry_at, now()) <= now()
         order by priority desc, queued_at asc
         for update skip locked
         limit $1
       )
       update jobs j
          set status = 'running',
              attempts = attempts + 1,
              started_at = now(),
              claimed_at = now(),
        claim_heartbeat_at = now(),
              claimed_by = $2,
              updated_at = now()
       from candidate
       where j.job_id = candidate.job_id
       returning j.*`,
      [batchSize, workerName]
    );
    return result.rows.map((row) => mapJob(row)).filter((row): row is JobEntity => row != null);
  });
}

export async function requeueStaleRunningJobs(claimStaleTimeoutMs: number, batchSize = 100) {
  const timeoutMs = Number(claimStaleTimeoutMs);
  if (!Number.isFinite(timeoutMs) || timeoutMs <= 0) return [];

  return withTransaction(async (client) => {
    const result = await client.query<JobRow>(
      `with candidate as (
         select job_id
         from jobs
         where status = 'running'
           and claimed_at is not null
           and coalesce(claim_heartbeat_at, claimed_at) <= now() - ($1 * interval '1 millisecond')
         order by claimed_at asc
         for update skip locked
         limit $2
       )
       update jobs j
          set status = 'retry_wait',
              next_retry_at = now(),
              claimed_at = null,
              claim_heartbeat_at = null,
              claimed_by = null,
              started_at = null,
              last_error_code = 'WORKER_CLAIM_STALE',
              last_error_message = 'Claim timeout exceeded; requeued for retry',
              updated_at = now()
       from candidate
       where j.job_id = candidate.job_id
       returning j.*`,
      [timeoutMs, batchSize]
    );

    return result.rows.map((row) => mapJob(row)).filter((row): row is JobEntity => row != null);
  });
}

export async function heartbeatJobClaim(jobId: string, claimedBy: string) {
  const result = await query<JobRow>(
    `update jobs
        set claim_heartbeat_at = now(),
            updated_at = now()
      where job_id = $1
        and status = 'running'
        and claimed_by = $2
      returning *`,
    [jobId, claimedBy]
  );

  return mapJob(result.rows[0]);
}


export async function listJobsByEntity(entityType: string, entityId: string) {
  const result = await query<JobRow>(
    `select * from jobs where entity_type = $1 and entity_id = $2 order by queued_at desc`,
    [entityType, entityId]
  );
  return result.rows.map((row) => mapJob(row)).filter((row): row is JobEntity => row != null);
}

/**
 * Move um job para a Dead Letter Queue
 */
export async function moveJobToDLQ(job: JobEntity, reason: string) {
  const expectedClaimedBy = job?.claimedBy || null;

  const moved = await withTransaction(async (client) => {
    const lockedResult = await client.query<JobRow>(
      'select * from jobs where job_id = $1 for update',
      [job.jobId]
    );

    if (lockedResult.rowCount === 0) {
      return null;
    }

    const lockedJob = lockedResult.rows[0];
    if (!lockedJob) {
      return null;
    }
    if (lockedJob.status !== 'running') {
      return null;
    }

    if (expectedClaimedBy && lockedJob.claimed_by !== expectedClaimedBy) {
      return null;
    }

    await client.query(
      `insert into job_dead_letter_queue(
        job_id, command_id, entity_type, entity_id, operation, payload, 
        attempts, max_attempts, last_error_code, last_error_message,
        retry_delays, tags, correlation_id, reason,
        original_queued_at, original_finished_at
      ) values (
        $1,$2,$3,$4,$5,$6::jsonb,
        $7,$8,$9,$10,
        $11::jsonb,$12::jsonb,$13,$14,
        $15, now()
      )`,
      [
        lockedJob.job_id,
        lockedJob.command_id,
        lockedJob.entity_type,
        lockedJob.entity_id,
        lockedJob.operation,
        JSON.stringify(lockedJob.payload || {}),
        lockedJob.attempts,
        lockedJob.max_attempts,
        lockedJob.last_error_code,
        lockedJob.last_error_message,
        JSON.stringify(lockedJob.retry_delays || []),
        JSON.stringify(lockedJob.tags || []),
        lockedJob.correlation_id,
        reason,
        lockedJob.queued_at
      ]
    );

    const result = await client.query<JobRow>(
      `update jobs set
         status = 'dlq',
         finished_at = now(),
         dlq_moved_at = now(),
         dlq_reason = $2,
         updated_at = now()
       where job_id = $1
       returning *`,
      [lockedJob.job_id, reason]
    );

    return mapJob(result.rows[0]);
  });

  if (!moved) {
    return null;
  }

  await emitJobNotification(moved, 'job.dlq');
  return moved;
}

/**
 * Lista jobs na DLQ
 */
export async function listDLQJobs(limit = 100) {
  const result = await query(
    `select * from job_dead_letter_queue 
     order by moved_at desc 
     limit $1`,
    [limit]
  );
  return result.rows;
}

/**
 * Reprocessa um job da DLQ (move de volta para jobs)
 */
export async function requeueFromDLQ(jobId: string) {
  const requeued = await withTransaction(async (client) => {
    // Buscar job da DLQ (lock simples — só uma requeue por vez deve ganhar).
    const dlqResult = await client.query(
      'select * from job_dead_letter_queue where job_id = $1 for update',
      [jobId]
    );

    if (dlqResult.rows.length === 0) {
      throw new Error(`Job ${jobId} not found in DLQ`);
    }

    // Lock otimista DL-022: bloqueia a linha do job e captura a version atual
    // antes de aplicar o requeue. O trigger trg_jobs_version incrementa a
    // version automaticamente quando o UPDATE for aplicado, mas o WHERE
    // com (status = 'dlq' and version = $2) impede que dois requeues
    // concorrentes (ou um requeue concorrente com qualquer outro UPDATE)
    // tenham efeito.
    const currentResult = await client.query<{ status: string; version: number | null }>(
      'select status, version from jobs where job_id = $1 for update',
      [jobId]
    );
    if (currentResult.rowCount === 0) {
      throw new Error(`Job ${jobId} not found`);
    }
    const current = currentResult.rows[0];
    if (current?.status !== 'dlq') {
      throw new Error(`Job ${jobId} is not in dlq status (current: ${current?.status ?? 'unknown'})`);
    }
    const expectedVersion = current.version ?? 1;

    // Atualizar job original para status queued e resetar attempts.
    const result = await client.query<JobRow>(
      `update jobs set
         status = 'queued',
         attempts = 0,
         next_retry_at = null,
         started_at = null,
         finished_at = null,
         dlq_moved_at = null,
         dlq_reason = null,
         last_error_code = null,
         last_error_message = null,
         updated_at = now()
       where job_id = $1 and status = 'dlq' and version = $2
       returning *`,
      [jobId, expectedVersion]
    );

    if (result.rowCount === 0) {
      throw new Error(
        `OptimisticLockError: Job ${jobId} could not be requeued (status changed or version mismatch, expected version ${expectedVersion})`
      );
    }

    // Remover da DLQ
    await client.query(
      'delete from job_dead_letter_queue where job_id = $1',
      [jobId]
    );

    return mapJob(result.rows[0]);
  });

  await emitJobNotification(requeued, 'job.requeued');
  return requeued;
}

/**
 * Remove permanentemente um job da DLQ (purge/descarte)
 */
export async function deleteFromDLQ(jobId: string) {
  await query('delete from job_dead_letter_queue where job_id = $1', [jobId]);
  // Marcar job original como descartado para não reprocessar
  await query(
    `update jobs set status = 'failed', updated_at = now()
     where job_id = $1 and status = 'dlq'`,
    [jobId]
  );
}

export async function cancelActiveJob(jobId: string, reason = 'Cancelled manually by operator') {
  return withTransaction(async (client) => {
    const currentResult = await client.query<{ status: string }>('select * from jobs where job_id = $1 for update', [jobId]);
    if (currentResult.rowCount === 0) {
      return null;
    }

    const current = currentResult.rows[0];
    if (!current) {
      return null;
    }
    if (current.status === 'running') {
      const error: JobConflictError = new Error('Cannot cancel a running job. Wait until it returns to queue/retry_wait.');
      error.code = 'JOB_RUNNING_CANNOT_CANCEL';
      throw error;
    }

    if (!['queued', 'retry_wait'].includes(current.status)) {
      const error: JobConflictError = new Error(`Job is not active. Current status: ${current.status}.`);
      error.code = 'JOB_NOT_ACTIVE';
      throw error;
    }

    const result = await client.query(
      `update jobs set
         status = 'failed',
         finished_at = now(),
         next_retry_at = null,
         last_error_code = 'JOB_CANCELLED_MANUAL',
         last_error_message = $2,
         updated_at = now()
       where job_id = $1
       returning *`,
      [jobId, reason]
    );

    return mapJob(result.rows[0]);
  });
}

export async function removeActiveJob(jobId: string) {
  return withTransaction(async (client) => {
    const currentResult = await client.query<{ status: string }>('select * from jobs where job_id = $1 for update', [jobId]);
    if (currentResult.rowCount === 0) {
      return false;
    }

    const current = currentResult.rows[0];
    if (!current) {
      return false;
    }
    if (current.status === 'running') {
      const error: JobConflictError = new Error('Cannot remove a running job. Cancel after it leaves running state.');
      error.code = 'JOB_RUNNING_CANNOT_REMOVE';
      throw error;
    }

    if (!['queued', 'retry_wait', 'failed', 'succeeded'].includes(current.status)) {
      const error: JobConflictError = new Error(`Job cannot be removed in status ${current.status}.`);
      error.code = 'JOB_STATUS_CANNOT_REMOVE';
      throw error;
    }

    await client.query('delete from jobs where job_id = $1', [jobId]);
    return true;
  });
}

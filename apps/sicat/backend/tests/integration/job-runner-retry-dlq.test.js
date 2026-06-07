import test from 'node:test';
import assert from 'node:assert/strict';
import { query } from '../../src/db/pool.js';
import { runWorkerLoop } from '../../src/workers/job-runner.js';
import { createPrefixedId } from '../../src/lib/ids.js';

async function waitForJobStatus(jobId, acceptedStatuses, maxAttempts = 20, delayMs = 100) {
  for (let attempt = 0; attempt < maxAttempts; attempt += 1) {
    const result = await query('select * from jobs where job_id = $1', [jobId]);
    const job = result.rows[0] || null;

    if (job && acceptedStatuses.includes(job.status)) {
      return job;
    }

    if (job && job.status !== 'running') {
      return job;
    }

    await new Promise((resolve) => setTimeout(resolve, delayMs));
  }

  const last = await query('select * from jobs where job_id = $1', [jobId]);
  return last.rows[0] || null;
}

async function sanitizeClaimQueue() {
  await query(
    `update jobs
        set status = 'failed',
            finished_at = coalesce(finished_at, now()),
            last_error_code = coalesce(last_error_code, 'TEST_QUEUE_SANITIZED'),
            last_error_message = coalesce(last_error_message, 'Sanitized invalid claim candidate before worker integration test'),
            updated_at = now()
      where status in ('queued', 'retry_wait')
        and attempts >= max_attempts`
  );
}

async function runWorkerUntilStatus(jobId, acceptedStatuses) {
  await sanitizeClaimQueue();

  await runWorkerLoop({ once: true });
  let job = await waitForJobStatus(jobId, acceptedStatuses);

  if (job?.status === 'running') {
    await query(
      `update jobs
          set status = 'queued',
              claimed_at = null,
              claim_heartbeat_at = null,
              claimed_by = null,
              started_at = null,
              updated_at = now()
        where job_id = $1`,
      [jobId]
    );

    await runWorkerLoop({ once: true });
    job = await waitForJobStatus(jobId, acceptedStatuses);
  }

  return job;
}

test('Worker - sucesso: job inválido vai para retry_wait com nextRetryAt', async () => {
  const jobId = createPrefixedId('job');
  const entityId = createPrefixedId('wrk_retry');

  await sanitizeClaimQueue();

  await query(
    `insert into jobs(
      job_id, command_id, entity_type, entity_id, operation, payload, status,
      attempts, max_attempts, correlation_id, priority, retry_strategy, base_delay_ms, max_delay_ms
    ) values ($1,$2,$3,$4,$5,$6::jsonb,$7,$8,$9,$10,$11,$12,$13,$14)`,
    [
      jobId,
      createPrefixedId('cmd'),
      'manifest',
      entityId,
      'operation.unsupported',
      JSON.stringify({ source: 'test' }),
      'queued',
      0,
      3,
      createPrefixedId('corr'),
      9,
      'exponential',
      1000,
      60000
    ]
  );

  const job = await runWorkerUntilStatus(jobId, ['retry_wait']);

  assert.ok(job, 'Job deve existir');
  assert.strictEqual(job.status, 'retry_wait', 'Job deve ir para retry_wait após falha recuperável');
  assert.ok(Number(job.attempts) >= 1, 'Attempts deve ser incrementado');
  assert.ok(job.next_retry_at, 'next_retry_at deve ser preenchido');
  assert.strictEqual(job.last_error_code, 'JOB_ERROR', 'Deve registrar erro padrão');
  assert.match(String(job.last_error_message), /Unsupported job operation/, 'Deve registrar mensagem de operação inválida');

  await query('delete from jobs where job_id = $1', [jobId]);
});

test('Worker - falha terminal: job atinge max_attempts e vai para DLQ', async () => {
  const jobId = createPrefixedId('job');
  const entityId = createPrefixedId('wrk_dlq');

  await sanitizeClaimQueue();

  await query(
    `insert into jobs(
      job_id, command_id, entity_type, entity_id, operation, payload, status,
      attempts, max_attempts, correlation_id, priority, retry_strategy, base_delay_ms, max_delay_ms
    ) values ($1,$2,$3,$4,$5,$6::jsonb,$7,$8,$9,$10,$11,$12,$13,$14)`,
    [
      jobId,
      createPrefixedId('cmd'),
      'manifest',
      entityId,
      'operation.unsupported',
      JSON.stringify({ source: 'test' }),
      'queued',
      1,
      2,
      createPrefixedId('corr'),
      9,
      'fixed',
      500,
      1000
    ]
  );

  const job = await runWorkerUntilStatus(jobId, ['dlq']);

  assert.ok(job, 'Job deve existir');
  assert.strictEqual(job.status, 'dlq', 'Job deve ir para DLQ ao atingir max_attempts');
  assert.strictEqual(job.attempts, 2, 'Attempts deve incrementar para max_attempts');
  assert.ok(job.dlq_moved_at, 'dlq_moved_at deve ser preenchido');
  assert.match(String(job.dlq_reason), /Max attempts/, 'dlq_reason deve explicar motivo');

  const dlqResult = await query('select * from job_dead_letter_queue where job_id = $1', [jobId]);
  assert.strictEqual(dlqResult.rows.length, 1, 'Deve haver 1 registro na DLQ');
  assert.strictEqual(dlqResult.rows[0].attempts, 2, 'DLQ deve registrar attempts finais');

  await query('delete from jobs where job_id = $1', [jobId]);
  await query('delete from job_dead_letter_queue where job_id = $1', [jobId]);
});

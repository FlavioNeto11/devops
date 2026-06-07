import test, { after } from 'node:test';
import assert from 'node:assert/strict';
import { pool, query } from '../../src/db/pool.js';
import { insertJob, claimJobs, updateJob, updateJobIfOwned, moveJobToDLQ, listDLQJobs, requeueFromDLQ, requeueStaleRunningJobs, heartbeatJobClaim } from '../../src/repositories/job-repo.js';
import { createPrefixedId } from '../../src/lib/ids.js';

after(async () => {
  await pool.end();
});

test('Job repository - novos campos migration 002', async () => {
  const jobId = createPrefixedId('job');
  const commandId = createPrefixedId('cmd');
  const correlationId = createPrefixedId('corr');
  const entityId = createPrefixedId('jobq_test_001');
  
  // Inserir job com novos campos
  const job = await insertJob({
    jobId,
    commandId,
    entityType: 'manifest',
    entityId,
    operation: 'manifest.submit',
    payload: { test: true },
    status: 'queued',
    maxAttempts: 5,
    correlationId,
    priority: 8,
    retryStrategy: 'exponential',
    baseDelayMs: 2000,
    maxDelayMs: 300000,
    tags: ['category:manifest', 'entity:manifest', 'status:queued']
  });
  
  // Verificar campos foram salvos
  assert.strictEqual(job.priority, 8, 'Priority deve ser 8');
  assert.strictEqual(job.retryStrategy, 'exponential', 'Retry strategy deve ser exponential');
  assert.strictEqual(job.baseDelayMs, 2000, 'Base delay deve ser 2000ms');
  assert.strictEqual(job.maxDelayMs, 300000, 'Max delay deve ser 300000ms');
  assert.deepStrictEqual(job.tags, ['category:manifest', 'entity:manifest', 'status:queued'], 'Tags devem ser persistidas');
  
  // Cleanup
  await query('delete from jobs where job_id = $1', [jobId]);
});

test('Job repository - claim com prioridade', async () => {
  const jobs = [];
  
  // Criar 3 jobs com prioridades diferentes
  for (let i = 0; i < 3; i++) {
    const jobId = createPrefixedId('job');
    const priority = 6 + i; // 6, 7, 8
    
    jobs.push(await insertJob({
      jobId,
      commandId: createPrefixedId('cmd'),
      entityType: 'manifest',
      entityId: createPrefixedId(`jobq_test_priority_${i}`),
      operation: 'manifest.submit',
      payload: { testIndex: i },
      status: 'queued',
      maxAttempts: 5,
      correlationId: createPrefixedId('corr'),
      priority
    }));
  }
  
  // Executar claims em lotes pequenos para reduzir interferência de filas concorrentes.
  const claimed = [];
  for (let attempt = 0; attempt < 20; attempt++) {
    const batch = await claimJobs(10);
    if (!batch.length) {
      break;
    }
    claimed.push(...batch);

    const seenFixtureIds = new Set(
      claimed
        .filter((job) => jobs.some((fixtureJob) => fixtureJob.jobId === job.jobId))
        .map((job) => job.jobId)
    );

    if (seenFixtureIds.size === jobs.length) {
      break;
    }
  }

  const claimedTarget = claimed.find((job) => job.jobId === jobs[2].jobId);
  const claimedFromFixture = claimed.filter((job) => jobs.some((fixtureJob) => fixtureJob.jobId === job.jobId));
  const fixturePriorities = claimedFromFixture.map((job) => job.priority);
  
  assert.ok(claimedTarget, 'Batch claim deve incluir o job de maior prioridade criado no teste');
  assert.strictEqual(claimedTarget.priority, 8, 'Job de maior prioridade do teste deve ser claimado');
  assert.strictEqual(claimedTarget.status, 'running', 'Job deve estar em status running');
  assert.ok(claimedTarget.claimedAt, 'ClaimedAt deve estar preenchido');
  assert.ok(claimedTarget.claimedBy, 'ClaimedBy deve estar preenchido');
  assert.ok(fixturePriorities.every((priority) => priority >= 6 && priority <= 8), 'Jobs de fixture claimados devem manter faixa de prioridade esperada');
  
  // Cleanup
  for (const job of jobs) {
    await query('delete from jobs where job_id = $1', [job.jobId]);
  }
});

test('Job repository - update com novos campos', async () => {
  const jobId = createPrefixedId('job');
  const entityId = createPrefixedId('jobq_test_002');
  
  const job = await insertJob({
    jobId,
    commandId: createPrefixedId('cmd'),
    entityType: 'manifest',
    entityId,
    operation: 'manifest.submit',
    payload: { test: true },
    status: 'queued',
    maxAttempts: 5,
    correlationId: createPrefixedId('corr')
  });
  
  // Atualizar com métricas e retry delays
  const updated = await updateJob(jobId, {
    status: 'retry_wait',
    attempts: 2,
    nextRetryAt: new Date(Date.now() + 60_000).toISOString(),
    executionTimeMs: 1500,
    retryDelays: [
      { attempt: 1, delayMs: 2000, scheduledFor: new Date().toISOString() }
    ],
    tags: ['retry', 'error:GATEWAY_TIMEOUT']
  });
  
  assert.strictEqual(updated.status, 'retry_wait', 'Status deve ser atualizado');
  assert.strictEqual(updated.executionTimeMs, 1500, 'Execution time deve ser 1500ms');
  assert.strictEqual(updated.retryDelays.length, 1, 'Deve ter 1 retry delay registrado');
  assert.strictEqual(updated.retryDelays[0].attempt, 1, 'Delay deve ser da tentativa 1');
  assert.deepStrictEqual(updated.tags, ['retry', 'error:GATEWAY_TIMEOUT'], 'Tags devem ser atualizadas');
  
  // Cleanup
  await query('delete from jobs where job_id = $1', [jobId]);
});

test('Job repository - moveJobToDLQ', async () => {
  const jobId = createPrefixedId('job');
  const correlationId = createPrefixedId('corr');
  const entityId = createPrefixedId('jobq_test_003');
  const claimedBy = `worker-test-${createPrefixedId('owner')}`;
  
  const job = await insertJob({
    jobId,
    commandId: createPrefixedId('cmd'),
    entityType: 'manifest',
    entityId,
    operation: 'manifest.submit',
    payload: { test: true },
    status: 'queued',
    maxAttempts: 5,
    correlationId
  });

  await query(
    `update jobs
        set status = 'running',
            attempts = 1,
            started_at = now(),
            claimed_at = now(),
            claim_heartbeat_at = now(),
            claimed_by = $2,
            updated_at = now()
      where job_id = $1`,
    [jobId, claimedBy]
  );
  
  // Simular falha após 5 tentativas
  await updateJob(jobId, {
    attempts: 5,
    lastErrorCode: 'MAX_RETRIES_EXCEEDED',
    lastErrorMessage: 'Job failed after 5 attempts'
  });
  
  // Mover para DLQ
  const dlqJob = await moveJobToDLQ({ jobId, claimedBy }, 'Max attempts exceeded');
  
  assert.strictEqual(dlqJob.status, 'dlq', 'Job deve estar em status dlq');
  assert.ok(dlqJob.dlqMovedAt, 'DLQ moved at deve estar preenchido');
  assert.strictEqual(dlqJob.dlqReason, 'Max attempts exceeded', 'DLQ reason deve estar correto');
  assert.ok(dlqJob.finishedAt, 'Finished at deve estar preenchido');
  
  // Verificar job está na tabela de DLQ
  const dlqList = await listDLQJobs(10);
  const foundInDLQ = dlqList.find(j => j.job_id === jobId);
  assert.ok(foundInDLQ, 'Job deve estar na tabela de DLQ');
  assert.strictEqual(foundInDLQ.reason, 'Max attempts exceeded', 'Reason na DLQ deve estar correto');
  
  // Cleanup
  await query('delete from jobs where job_id = $1', [jobId]);
  await query('delete from job_dead_letter_queue where job_id = $1', [jobId]);
});

test('Job repository - requeueFromDLQ', async () => {
  const jobId = createPrefixedId('job');
  const correlationId = createPrefixedId('corr');
  const entityId = createPrefixedId('jobq_test_004');
  const claimedBy = `worker-test-${createPrefixedId('owner')}`;
  
  const job = await insertJob({
    jobId,
    commandId: createPrefixedId('cmd'),
    entityType: 'manifest',
    entityId,
    operation: 'manifest.submit',
    payload: { test: true },
    status: 'queued',
    maxAttempts: 5,
    correlationId
  });

  await query(
    `update jobs
        set status = 'running',
            attempts = 1,
            started_at = now(),
            claimed_at = now(),
            claim_heartbeat_at = now(),
            claimed_by = $2,
            updated_at = now()
      where job_id = $1`,
    [jobId, claimedBy]
  );
  
  // Mover para DLQ
  await moveJobToDLQ({ jobId, claimedBy }, 'Test DLQ');
  
  // Verificar está na DLQ
  let dlqList = await listDLQJobs(10);
  assert.ok(dlqList.find(j => j.job_id === jobId), 'Job deve estar na DLQ antes do requeue');
  
  // Reprocessar da DLQ
  const requeued = await requeueFromDLQ(jobId);
  
  assert.strictEqual(requeued.status, 'queued', 'Job deve voltar para status queued');
  assert.strictEqual(requeued.attempts, 0, 'Attempts deve ser resetado');
  assert.strictEqual(requeued.dlqMovedAt, null, 'DLQ moved at deve ser null');
  assert.strictEqual(requeued.dlqReason, null, 'DLQ reason deve ser null');
  assert.strictEqual(requeued.finishedAt, null, 'Finished at deve ser null');
  
  // Verificar foi removido da DLQ
  dlqList = await listDLQJobs(10);
  assert.ok(!dlqList.find(j => j.job_id === jobId), 'Job não deve estar mais na DLQ');
  
  // Cleanup
  await query('delete from jobs where job_id = $1', [jobId]);
});

test('Job repository - função SQL calculate_next_retry', async () => {
  // Testar estratégia exponencial
  const expResult = await query(
    'select calculate_next_retry($1, $2, $3, $4) as next_retry',
    [1, 'exponential', 1000, 60000]
  );
  const expDelay = new Date(expResult.rows[0].next_retry).getTime() - Date.now();
  assert.ok(expDelay >= 900 && expDelay <= 1200, `Exponential delay tentativa 1 deve estar entre 900-1200ms, got ${expDelay}ms`);
  
  // Testar estratégia linear
  const linResult = await query(
    'select calculate_next_retry($1, $2, $3, $4) as next_retry',
    [3, 'linear', 2000, 60000]
  );
  const linDelay = new Date(linResult.rows[0].next_retry).getTime() - Date.now();
  assert.ok(linDelay >= 5400 && linDelay <= 7200, `Linear delay tentativa 3 deve estar entre 5400-7200ms (2s*3 + jitter), got ${linDelay}ms`);
  
  // Testar estratégia fixed
  const fixResult = await query(
    'select calculate_next_retry($1, $2, $3, $4) as next_retry',
    [5, 'fixed', 3000, 60000]
  );
  const fixDelay = new Date(fixResult.rows[0].next_retry).getTime() - Date.now();
  assert.ok(fixDelay >= 2700 && fixDelay <= 3600, `Fixed delay deve estar entre 2700-3600ms (3s + jitter), got ${fixDelay}ms`);
  
  // Testar max_delay
  const maxResult = await query(
    'select calculate_next_retry($1, $2, $3, $4) as next_retry',
    [20, 'exponential', 1000, 10000]
  );
  const maxDelay = new Date(maxResult.rows[0].next_retry).getTime() - Date.now();
  assert.ok(maxDelay <= 11000, `Delay deve respeitar max_delay de 10s, got ${maxDelay}ms`);
});

test('Job repository - requeueStaleRunningJobs reencaminha jobs órfãos', async () => {
  const jobId = createPrefixedId('job');
  const entityId = createPrefixedId('jobq_test_stale_001');
  const claimedBy = `worker-test-${createPrefixedId('owner')}`;

  await insertJob({
    jobId,
    commandId: createPrefixedId('cmd'),
    entityType: 'manifest',
    entityId,
    operation: 'manifest.submit',
    payload: { test: true },
    status: 'queued',
    maxAttempts: 5,
    correlationId: createPrefixedId('corr')
  });

  await query(
    `update jobs
        set status = 'running',
            attempts = 1,
            started_at = now(),
            claimed_at = now(),
            claim_heartbeat_at = now(),
            claimed_by = $2,
            updated_at = now()
      where job_id = $1`,
    [jobId, claimedBy]
  );

  await query(
    `update jobs
        set claimed_at = now() - interval '20 minutes',
            claim_heartbeat_at = now() - interval '20 minutes'
      where job_id = $1`,
    [jobId]
  );

  const requeued = await requeueStaleRunningJobs(60_000, 1000);
  const moved = requeued.find((job) => job.jobId === jobId);

  assert.ok(moved, 'Job stale deve ser reencaminhado para retry_wait');
  assert.strictEqual(moved.status, 'retry_wait');
  assert.strictEqual(moved.claimedAt, null);
  assert.strictEqual(moved.claimedBy, null);
  assert.strictEqual(moved.startedAt, null);
  assert.strictEqual(moved.lastErrorCode, 'WORKER_CLAIM_STALE');

  await query('delete from jobs where job_id = $1', [jobId]);
});

test('Job repository - heartbeat de claim evita requeue indevido de job longo', async () => {
  const jobId = createPrefixedId('job');
  const entityId = createPrefixedId('jobq_test_lease_heartbeat_001');
  const claimedBy = `worker-test-${createPrefixedId('owner')}`;

  await insertJob({
    jobId,
    commandId: createPrefixedId('cmd'),
    entityType: 'manifest',
    entityId,
    operation: 'manifest.submit',
    payload: { test: true },
    status: 'queued',
    maxAttempts: 5,
    correlationId: createPrefixedId('corr')
  });

  await query(
    `update jobs
        set status = 'running',
            attempts = 1,
            started_at = now(),
            claimed_at = now(),
            claim_heartbeat_at = now(),
            claimed_by = $2,
            updated_at = now()
      where job_id = $1`,
    [jobId, claimedBy]
  );

  await query(
    `update jobs
        set claimed_at = now() - interval '20 minutes'
      where job_id = $1`,
    [jobId]
  );

  const refreshed = await heartbeatJobClaim(jobId, claimedBy);
  assert.ok(refreshed, 'Heartbeat deve atualizar job running claimado pelo worker correto');
  assert.ok(refreshed.claimHeartbeatAt, 'claimHeartbeatAt deve estar preenchido');

  const requeued = await requeueStaleRunningJobs(60_000, 10);
  const moved = requeued.find((job) => job.jobId === jobId);

  assert.strictEqual(moved, undefined, 'Job com heartbeat recente não deve ser reencaminhado');

  await query('delete from jobs where job_id = $1', [jobId]);
});

test('Job repository - updateJobIfOwned aplica transição apenas para owner correto', async () => {
  const jobId = createPrefixedId('job');
  const entityId = createPrefixedId('jobq_test_owned_update_001');
  const claimedBy = `worker-test-${createPrefixedId('owner')}`;

  await insertJob({
    jobId,
    commandId: createPrefixedId('cmd'),
    entityType: 'manifest',
    entityId,
    operation: 'manifest.submit',
    payload: { test: true },
    status: 'queued',
    maxAttempts: 5,
    correlationId: createPrefixedId('corr')
  });

  await query(
    `update jobs
        set status = 'running',
            attempts = 1,
            started_at = now(),
            claimed_at = now(),
            claim_heartbeat_at = now(),
            claimed_by = $2,
            updated_at = now()
      where job_id = $1`,
    [jobId, claimedBy]
  );

  const wrongOwnerUpdate = await updateJobIfOwned(jobId, 'worker-wrong-owner', {
    status: 'succeeded',
    finishedAt: new Date().toISOString()
  });
  assert.strictEqual(wrongOwnerUpdate, null, 'Owner incorreto não deve atualizar job');

  const correctOwnerUpdate = await updateJobIfOwned(jobId, claimedBy, {
    status: 'succeeded',
    finishedAt: new Date().toISOString(),
    tags: ['status:succeeded']
  });

  assert.ok(correctOwnerUpdate, 'Owner correto deve conseguir atualizar job');
  assert.strictEqual(correctOwnerUpdate.status, 'succeeded');

  await query('delete from jobs where job_id = $1', [jobId]);
});

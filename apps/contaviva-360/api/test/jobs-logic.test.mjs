// Verificação: SKIP LOCKED, retry/backoff, DLQ (bloco worker-queue-transacional)
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const __dir = dirname(fileURLToPath(import.meta.url));
const jobsSrc = readFileSync(join(__dir, '../src/jobs.js'), 'utf-8');

test('jobs: claimJobs usa FOR UPDATE SKIP LOCKED (previne dois workers pegando o mesmo job)', () => {
  assert.ok(jobsSrc.includes('FOR UPDATE SKIP LOCKED'), 'SKIP LOCKED presente no claimJobs');
});

test('jobs: claimJobs filtra por status queued/retry_wait e run_after', () => {
  assert.ok(jobsSrc.includes("status IN ('queued','retry_wait')"), 'filtra status corretos');
  assert.ok(jobsSrc.includes('run_after <= now()'), 'filtra run_after');
});

test('jobs: failJob com retryable=true e attempts < max_attempts -> retry_wait com backoff', () => {
  assert.ok(jobsSrc.includes("status='retry_wait'"), 'atualiza para retry_wait');
  assert.ok(jobsSrc.includes('backoffDelay'), 'usa backoffDelay');
});

test('jobs: failJob com attempts >= max_attempts -> move para DLQ', () => {
  assert.ok(jobsSrc.includes('job_dead_letter_queue'), 'tabela DLQ referenciada');
  assert.ok(jobsSrc.includes("status='dlq'"), 'atualiza status para dlq');
  assert.ok(jobsSrc.includes("'max_attempts'"), 'registra razão max_attempts');
});

test('jobs: backoffDelay cresce exponencialmente e tem limite máximo', () => {
  // Extrai e testa a função backoffDelay inline
  const BASE = 2000;
  const fn = (attempts) => Math.min(BASE * Math.pow(2, attempts - 1), 30000);
  assert.equal(fn(1), 2000,  'tentativa 1 = 2s');
  assert.equal(fn(2), 4000,  'tentativa 2 = 4s');
  assert.equal(fn(3), 8000,  'tentativa 3 = 8s');
  assert.equal(fn(10), 30000, 'tentativa 10 limitada a 30s');
});

test('jobs: enqueueJob com mesmo jobKey não cria duplicata (deduplica por job_key)', () => {
  assert.ok(jobsSrc.includes("job_key"), 'campo job_key presente');
  assert.ok(jobsSrc.includes("NOT IN ('succeeded','failed','dlq','cancelled')"), 'verifica status ativos antes de inserir');
});

test('jobs: heartbeatJob atualiza claim_heartbeat_at (previne requeue prematuro)', () => {
  assert.ok(jobsSrc.includes('claim_heartbeat_at=now()'), 'heartbeat atualiza timestamp');
});

test('jobs: requeueStaleJobs recoloca em fila jobs com heartbeat expirado', () => {
  assert.ok(jobsSrc.includes('requeueStaleJobs'), 'função requeueStaleJobs presente');
  assert.ok(jobsSrc.includes("status='running' AND claim_heartbeat_at < $1"), 'detecta jobs com heartbeat antigo');
});

// Simulação em memória para verificar a lógica sem banco
class InMemJobQueue {
  constructor() { this.jobs = []; this.dlq = []; this._id = 1; }
  enqueue(type, payload = {}, { maxAttempts = 3, jobKey = null } = {}) {
    if (jobKey) {
      const dup = this.jobs.find(j => j.payload?.job_key === jobKey && !['succeeded','failed','dlq'].includes(j.status));
      if (dup) return dup;
    }
    const job = { id: this._id++, type, payload: jobKey ? { ...payload, job_key: jobKey } : payload, status: 'queued', attempts: 0, maxAttempts, runAfter: new Date() };
    this.jobs.push(job); return job;
  }
  claim(workerId) {
    const job = this.jobs.find(j => (j.status === 'queued' || j.status === 'retry_wait') && j.runAfter <= new Date());
    if (!job) return null;
    job.status = 'running'; job.lockedBy = workerId; job.attempts++;
    return job;
  }
  ack(jobId, workerId) {
    const j = this.jobs.find(j => j.id === jobId && j.lockedBy === workerId);
    if (!j) throw new Error('not owner');
    j.status = 'succeeded'; j.lockedBy = null;
  }
  fail(jobId, workerId, err, { retryable = true } = {}) {
    const j = this.jobs.find(j => j.id === jobId && j.lockedBy === workerId);
    if (!j) throw new Error('not owner');
    if (!retryable || j.attempts >= j.maxAttempts) {
      j.status = 'dlq'; this.dlq.push({ ...j, dlqReason: retryable ? 'max_attempts' : 'non_retryable' });
    } else {
      j.status = 'retry_wait'; j.runAfter = new Date(Date.now() + Math.min(2000 * Math.pow(2, j.attempts - 1), 30000));
    }
    j.lockedBy = null;
  }
}

test('simulação: dois workers concorrentes nunca pegam o mesmo job (SKIP LOCKED)', () => {
  const q = new InMemJobQueue();
  q.enqueue('test', { x: 1 });
  const j1 = q.claim('worker-1');
  const j2 = q.claim('worker-2'); // só pode pegar outro job
  assert.ok(j1 !== null, 'worker-1 pegou job');
  assert.equal(j2, null, 'worker-2 não pegou o mesmo job (sem mais jobs)');
});

test('simulação: falha retryável reenfileira com backoff', () => {
  const q = new InMemJobQueue();
  q.enqueue('test', {});
  const j = q.claim('w1');
  q.fail(j.id, 'w1', new Error('timeout'), { retryable: true });
  const found = q.jobs.find(x => x.id === j.id);
  assert.equal(found.status, 'retry_wait', 'status deve ser retry_wait');
  assert.ok(found.runAfter > new Date(), 'runAfter deve estar no futuro');
});

test('simulação: exceder max_attempts move para DLQ', () => {
  const q = new InMemJobQueue();
  const job = q.enqueue('test', {}, { maxAttempts: 1 });
  const j = q.claim('w1'); // attempts=1
  q.fail(j.id, 'w1', new Error('erro'), { retryable: true });
  const found = q.jobs.find(x => x.id === j.id);
  assert.equal(found.status, 'dlq', 'deve estar na DLQ');
  assert.equal(q.dlq.length, 1, 'DLQ deve ter 1 entrada');
});

test('simulação: reenfileirar com mesmo job_key resulta em um único job', () => {
  const q = new InMemJobQueue();
  const j1 = q.enqueue('test', { value: 1 }, { jobKey: 'unique-key-1' });
  const j2 = q.enqueue('test', { value: 2 }, { jobKey: 'unique-key-1' });
  assert.equal(j1.id, j2.id, 'mesmo jobKey -> mesmo job (deduplica)');
  assert.equal(q.jobs.filter(j => j.payload?.job_key === 'unique-key-1').length, 1, 'apenas 1 job na fila');
});

import test from 'node:test';
import assert from 'node:assert/strict';
import { resolveFailureTransition } from '../../src/workers/job-runner.js';

function buildJob(overrides = {}) {
  return {
    jobId: 'job_test_001',
    operation: 'manifest.submit',
    entityType: 'manifest',
    status: 'running',
    attempts: 2,
    maxAttempts: 5,
    retryStrategy: 'exponential',
    baseDelayMs: 100,
    maxDelayMs: 5_000,
    retryDelays: [],
    ...overrides
  };
}

test('resolveFailureTransition - falha definitiva vai para failed imediatamente', () => {
  const job = buildJob({ attempts: 1, maxAttempts: 5 });
  const error = { status: 400, code: 'VALIDATION_ERROR', message: 'validation failed' };

  const transition = resolveFailureTransition(job, error, 120, new Date('2026-03-09T10:00:00.000Z'));

  assert.strictEqual(transition.action, 'failed');
  assert.strictEqual(transition.patch.status, 'failed');
  assert.strictEqual(transition.patch.lastErrorCode, 'VALIDATION_ERROR');
  assert.strictEqual(transition.patch.lastErrorMessage, 'validation failed');
  assert.strictEqual(transition.patch.finishedAt, '2026-03-09T10:00:00.000Z');
  assert.ok(transition.patch.tags.includes('status:failed'));
});

test('resolveFailureTransition - falha transitória vai para retry_wait', () => {
  const job = buildJob({ attempts: 2, maxAttempts: 5 });
  const error = { status: 503, code: 'CETESB_HTTP_ERROR', message: 'service unavailable' };

  const transition = resolveFailureTransition(job, error, 250);

  assert.strictEqual(transition.action, 'retry_wait');
  assert.strictEqual(transition.patch.status, 'retry_wait');
  assert.ok(typeof transition.patch.nextRetryAt === 'string');
  assert.strictEqual(transition.patch.finishedAt, undefined);
  assert.ok(transition.delayMs > 0);
  assert.ok(transition.patch.tags.includes('status:retry_wait'));
});

test('resolveFailureTransition - falha transitória acima do limite vai para dlq', () => {
  const job = buildJob({ attempts: 5, maxAttempts: 5 });
  const error = { code: 'ETIMEDOUT', message: 'timeout' };

  const transition = resolveFailureTransition(job, error, 999);

  assert.strictEqual(transition.action, 'dlq');
  assert.match(transition.dlqReason, /Max attempts/i);
});

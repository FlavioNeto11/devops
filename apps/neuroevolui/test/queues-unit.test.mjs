// test/queues-unit.test.mjs — verifica comportamento inline (sem REDIS_URL) das filas.
// Roda sem servidor ou Redis: REDIS_URL ausente → todos os enqueues caem no fallback inline.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { enqueue, enqueueSubmit, NAMED_QUEUES } from '../api/src/queue.js';

test('NAMED_QUEUES exporta as 4 filas nomeadas', () => {
  const expected = ['consultation-notes', 'patient-imports', 'notifications', 'summaries-ai'];
  for (const name of expected) {
    assert.ok(NAMED_QUEUES.includes(name), `fila ${name} deve existir`);
  }
  assert.equal(NAMED_QUEUES.length, expected.length);
});

test('enqueue: sem REDIS_URL retorna inline=true sem erro (degradação graciosa)', async () => {
  // REDIS_URL não está definido neste ambiente de teste → path inline
  const result = await enqueue('consultation-notes', 'test-key-unit', { payload: 'x' });
  assert.equal(result.inline, true, 'deve ser inline sem Redis');
  assert.ok(result.job_id.startsWith('inline-'), 'job_id deve ter prefixo inline-');
});

test('enqueue: inline fallback para cada fila nomeada', async () => {
  for (const queueName of NAMED_QUEUES) {
    const result = await enqueue(queueName, `key-${queueName}`, {});
    assert.equal(result.inline, true, `${queueName}: deve ser inline`);
    assert.equal(result.job_id, `inline-key-${queueName}`);
  }
});

test('enqueueSubmit: sem REDIS_URL retorna inline=true', async () => {
  const result = await enqueueSubmit(42);
  assert.equal(result.inline, true, 'submit deve ser inline sem Redis');
});

test('enqueue: mesmo job_key retorna mesmo job_id no fallback inline', async () => {
  const key = 'dedup-test-key';
  const a = await enqueue('notifications', key, {});
  const b = await enqueue('notifications', key, {});
  assert.equal(a.job_id, b.job_id, 'mesmo job_key deve retornar mesmo job_id inline');
});

// Testes unitários — filas BullMQ e degradação graciosa sem Redis (REQ-NEUROEVOLUI-0003).
import { test } from 'node:test';
import assert from 'node:assert/strict';

// Sem REDIS_URL: valida o caminho de fallback inline
delete process.env.REDIS_URL;

const {
  QUEUE_CONFIGS,
  queue,
  enqueueSubmit,
  enqueueJob,
  queueCounts,
  getConsultationNotesQueue,
  getPatientImportsQueue,
  getNotificationsQueue,
  getSummariesAiQueue,
} = await import('../src/queue.js');

test('4 filas nomeadas presentes em QUEUE_CONFIGS', () => {
  const expected = ['consultation-notes', 'patient-imports', 'notifications', 'summaries-ai'];
  for (const name of expected) {
    assert.ok(name in QUEUE_CONFIGS, 'fila ' + name + ' configurada');
    assert.ok(QUEUE_CONFIGS[name].attempts > 0, name + ': attempts > 0');
    assert.equal(QUEUE_CONFIGS[name].backoff.type, 'exponential', name + ': backoff exponencial');
  }
});

test('getters retornam null sem REDIS_URL (degradação graciosa)', () => {
  assert.equal(queue(), null, 'records-submit');
  assert.equal(getConsultationNotesQueue(), null, 'consultation-notes');
  assert.equal(getPatientImportsQueue(), null, 'patient-imports');
  assert.equal(getNotificationsQueue(), null, 'notifications');
  assert.equal(getSummariesAiQueue(), null, 'summaries-ai');
});

test('enqueueSubmit: inline=true sem Redis, job_id determinístico', async () => {
  const r = await enqueueSubmit(42);
  assert.equal(r.inline, true, 'fallback inline ativado');
  assert.equal(r.job_id, 'submit-42', 'job_id = submit-{recordId} (dedupe key)');
});

test('enqueueSubmit: mesmo recordId → mesmo job_id (sem duplicação)', async () => {
  const r1 = await enqueueSubmit(7);
  const r2 = await enqueueSubmit(7);
  assert.equal(r1.job_id, r2.job_id, 'mesmo job_key → mesmo job_id');
});

test('enqueueJob: job_key preservado como job_id (dedupe)', async () => {
  const r = await enqueueJob('consultation-notes', 'note', { patient: 1 }, 'note-key-abc');
  assert.equal(r.inline, true);
  assert.equal(r.job_id, 'note-key-abc', 'job_key passado = job_id retornado');
});

test('enqueueJob: todas as 4 filas nomeadas operam sem erro em modo inline', async () => {
  const queues = ['consultation-notes', 'patient-imports', 'notifications', 'summaries-ai'];
  for (const name of queues) {
    const r = await enqueueJob(name, 'test', { x: 1 }, 'k-' + name);
    assert.equal(r.inline, true, name + ' → inline sem Redis');
    assert.equal(r.job_id, 'k-' + name, name + ' → job_id preservado');
  }
});

test('queueCounts: retorna redis:false sem REDIS_URL', async () => {
  const c = await queueCounts();
  assert.equal(c.redis, false);
});

test('backoff exponencial configurável: cada fila tem delay distinto', () => {
  const delays = Object.values(QUEUE_CONFIGS).map(c => c.backoff.delay);
  const unique = new Set(delays);
  assert.ok(unique.size > 1, 'filas têm delays de backoff distintos (configurável por fila)');
});

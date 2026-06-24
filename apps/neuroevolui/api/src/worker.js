// worker.js — workers BullMQ para todas as filas nomeadas. Degradação graciosa sem Redis.
import { Worker } from 'bullmq';
import { pool, migrate } from './db.js';
import { M, startMetricsServer } from './metrics.js';

const url = process.env.REDIS_URL || '';
function conn() { const u = new URL(url); return { host: u.hostname, port: Number(u.port) || 6379 }; }

async function handleRecordSubmit(job) {
  const id = job.data.recordId;
  await pool.query("UPDATE records SET status='submitted', updated_at=now() WHERE id=$1", [id]);
}

async function handleConsultationNote(job) {
  console.log('[worker] consultation-note id=' + job.id, JSON.stringify(job.data).slice(0, 100));
}

async function handlePatientImport(job) {
  console.log('[worker] patient-import id=' + job.id, JSON.stringify(job.data).slice(0, 100));
}

async function handleNotification(job) {
  console.log('[worker] notification id=' + job.id, JSON.stringify(job.data).slice(0, 100));
}

async function handleSummaryAi(job) {
  console.log('[worker] summaries-ai id=' + job.id, JSON.stringify(job.data).slice(0, 100));
}

function startWorker(name, handler, onFail) {
  const w = new Worker(name, async (job) => {
    await handler(job);
    M.jobsTotal.inc({ status: 'done' });
    console.log('[worker] ' + name + ' job ' + job.id + ' OK');
  }, { connection: conn() });
  w.on('failed', (job, err) => {
    M.jobsTotal.inc({ status: 'failed' });
    if (onFail) onFail(job, err);
    console.warn('[worker] ' + name + ' falhou job=' + job?.id + ': ' + err?.message);
  });
  return w;
}

(async () => {
  if ((process.env.AUTO_MIGRATE || 'true') === 'true') await migrate().catch(() => {});
  startMetricsServer();
  if (!url) { console.warn('[worker] sem REDIS_URL — todos os workers inativos (degradação graciosa)'); return; }
  const workers = [
    startWorker('records-submit', handleRecordSubmit, (job, err) => {
      if (job && job.attemptsMade >= (job.opts?.attempts || 1))
        pool.query("UPDATE records SET status='failed', updated_at=now() WHERE id=$1", [job.data.recordId]).catch(() => {});
    }),
    startWorker('consultation-notes', handleConsultationNote),
    startWorker('patient-imports', handlePatientImport),
    startWorker('notifications', handleNotification),
    startWorker('summaries-ai', handleSummaryAi),
  ];
  console.log('[neuroevolui-worker] ' + workers.length + ' workers BullMQ iniciados');
  process.on('SIGTERM', async () => { await Promise.all(workers.map(w => w.close())); process.exit(0); });
})();

// worker.js — consumidor BullMQ (bloco redis-bullmq). Processa submit e document-process jobs.
import { Worker } from 'bullmq';
import { pool, migrate } from './db.js';
import { M, startMetricsServer } from './metrics.js';
const url = process.env.REDIS_URL || '';
function conn() { const u = new URL(url); return { host: u.hostname, port: Number(u.port) || 6379 }; }

async function handleSubmit(job) {
  const id = job.data.recordId;
  await pool.query("UPDATE records SET status='submitted', updated_at=now() WHERE id=$1", [id]);
}

async function handleDocumentProcess(job) {
  const { documentId } = job.data;
  await pool.query("UPDATE documents SET status='aprovado', updated_at=now() WHERE id=$1", [documentId]);
}

(async () => {
  if ((process.env.AUTO_MIGRATE || 'true') === 'true') await migrate().catch(() => {});
  startMetricsServer();
  if (!url) { console.warn('[worker] sem REDIS_URL — fila inativa'); return; }

  const submitWorker = new Worker('records-submit', async (job) => {
    await handleSubmit(job);
    M.jobsTotal.inc({ status: 'done' });
    console.log('[worker] submit job ' + job.id + ' OK');
  }, { connection: conn() });

  submitWorker.on('failed', (job, err) => {
    M.jobsTotal.inc({ status: 'failed' });
    if (job && job.attemptsMade >= (job.opts.attempts || 1)) {
      pool.query("UPDATE records SET status='failed', updated_at=now() WHERE id=$1", [job.data.recordId]).catch(() => {});
    }
    console.warn('[worker] submit falhou: ' + (err && err.message));
  });

  const docWorker = new Worker('document-process', async (job) => {
    await handleDocumentProcess(job);
    M.jobsTotal.inc({ status: 'done' });
    console.log('[worker] document-process job ' + job.id + ' OK');
  }, { connection: conn() });

  docWorker.on('failed', (job, err) => {
    M.jobsTotal.inc({ status: 'failed' });
    console.warn('[worker] document-process falhou: ' + (err && err.message));
  });

  console.log('[contaviva-360-worker] BullMQ iniciado (queues: records-submit, document-process)');
  process.on('SIGTERM', async () => {
    await Promise.all([submitWorker.close(), docWorker.close()]);
    process.exit(0);
  });
})();

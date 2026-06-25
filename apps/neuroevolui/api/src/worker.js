// worker.js — workers BullMQ: records-submit (legado) + named queues. Degradação sem Redis.
import { Worker } from 'bullmq';
import { pool, migrate } from './db.js';
import { M, startMetricsServer } from './metrics.js';
import { processPatientReport } from './services/patient-reports-service.js';
import { dispatchNotification } from './services/notifications-service.js';

const url = process.env.REDIS_URL || '';
function conn() { const u = new URL(url); return { host: u.hostname, port: Number(u.port) || 6379 }; }

async function handleSubmit(job) {
  const id = job.data.recordId;
  const rec = (await pool.query('SELECT id,title FROM records WHERE id=$1', [id])).rows[0] || { id, title: 'Record ' + id };
  await pool.query("UPDATE records SET status='submitted', updated_at=now() WHERE id=$1", [id]);
}

async function handleNamedQueue(queueName, job) {
  const { jobKey } = job.data;
  await pool.query(
    `UPDATE async_jobs SET status='processing', updated_at=now() WHERE queue_name=$1 AND job_key=$2`,
    [queueName, jobKey]
  ).catch(() => {});
  if (queueName === 'patient-reports') {
    const { reportId, tenantId, patientId, filters } = job.data;
    if (reportId) {
      await processPatientReport({ reportId, tenantId, patientId, filters });
    }
  }
  if (queueName === 'notifications') {
    const { eventType } = job.data;
    if (eventType) {
      await dispatchNotification(job.data);
    }
  }
  await pool.query(
    `UPDATE async_jobs SET status='completed', updated_at=now() WHERE queue_name=$1 AND job_key=$2`,
    [queueName, jobKey]
  ).catch(() => {});
}

(async () => {
  if ((process.env.AUTO_MIGRATE || 'true') === 'true') await migrate().catch(() => {});
  startMetricsServer();

  if (!url) {
    console.warn('[worker] sem REDIS_URL — filas inativas, jobs processados inline');
    return;
  }

  // records-submit (legado)
  const wSubmit = new Worker('records-submit', async (job) => {
    await handleSubmit(job);
    M.jobsTotal.inc({ status: 'done' });
    console.log('[records-submit] job ' + job.id + ' OK');
  }, { connection: conn() });
  wSubmit.on('failed', (job, err) => {
    M.jobsTotal.inc({ status: 'failed' });
    if (job && job.attemptsMade >= (job.opts.attempts || 1)) {
      pool.query("UPDATE records SET status='failed', updated_at=now() WHERE id=$1", [job.data.recordId]).catch(() => {});
    }
    console.warn('[records-submit] job falhou: ' + (err && err.message));
  });

  // named queues
  for (const queueName of ['consultation-notes', 'patient-imports', 'notifications', 'summaries-ai', 'patient-reports']) {
    const w = new Worker(queueName, async (job) => {
      await handleNamedQueue(queueName, job);
      M.jobsTotal.inc({ status: 'done' });
      console.log(`[${queueName}] job ${job.id} OK`);
    }, { connection: conn(), concurrency: 2 });
    w.on('failed', (job, err) => {
      M.jobsTotal.inc({ status: 'failed' });
      console.warn(`[${queueName}] job ${job?.id} falhou: ${err && err.message}`);
    });
    console.log(`[neuroevolui-worker] ${queueName} iniciado`);
  }

  console.log('[neuroevolui-worker] BullMQ iniciado');
  process.on('SIGTERM', () => process.exit(0));
})();

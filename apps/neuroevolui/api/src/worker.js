// worker.js — consumidor BullMQ (bloco redis-bullmq). Processa submit e report-generate.
import { Worker } from 'bullmq';
import { pool, migrate } from './db.js';
import { M, startMetricsServer } from './metrics.js';
import * as recordsRepo from './repositories/records.js';
import * as notesService from './services/evolution-notes.js';

const url = process.env.REDIS_URL || '';
function conn() { const u = new URL(url); return { host: u.hostname, port: Number(u.port) || 6379 }; }

async function handleSubmit(job) {
  const rec = await recordsRepo.findRecordById(job.data.recordId);
  const id = rec ? rec.id : job.data.recordId;
  await recordsRepo.updateRecordStatus(id, 'submitted');
}

async function handleReport(job) {
  const { tenantId, patientId, filters } = job.data;
  const notes = await notesService.getReportData(tenantId, patientId, filters || {});
  console.log(`[worker] report gerado: paciente=${patientId} notas=${notes.length}`);
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
      recordsRepo.updateRecordStatus(job.data.recordId, 'failed').catch(() => {});
    }
    console.warn('[worker] submit falhou: ' + (err && err.message));
  });

  const reportWorker = new Worker('report-generate', async (job) => {
    await handleReport(job);
    M.jobsTotal.inc({ status: 'done' });
    console.log('[worker] report job ' + job.id + ' OK');
  }, { connection: conn() });

  reportWorker.on('failed', (job, err) => {
    M.jobsTotal.inc({ status: 'failed' });
    console.warn('[worker] report falhou: ' + (err && err.message));
  });

  console.log('[neuroevolui-worker] BullMQ iniciado (submit + report-generate)');

  process.on('SIGTERM', async () => {
    await submitWorker.close();
    await reportWorker.close();
    process.exit(0);
  });
})();

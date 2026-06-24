// worker.js — consumidores BullMQ para todas as filas (redis-bullmq).
import { Worker } from 'bullmq';
import { migrate } from './db.js';
import { M, startMetricsServer } from './metrics.js';
import { updateRecordStatus } from './repositories/records.js';

const url = process.env.REDIS_URL || '';
function conn() { const u = new URL(url); return { host: u.hostname, port: Number(u.port) || 6379 }; }

const HANDLERS = {
  'records-submit':     async (job) => { await updateRecordStatus(job.data.recordId, 'submitted'); },
  'consultation-notes': async (job) => { console.log('[worker] consultation-note processado:', job.id); },
  'patient-imports':    async (job) => { console.log('[worker] patient-import processado:', job.id); },
  'notifications':      async (job) => { console.log('[worker] notification enviada:', job.id); },
  'summaries-ai':       async (job) => { console.log('[worker] summary-ai gerado:', job.id); },
};

(async () => {
  if ((process.env.AUTO_MIGRATE || 'true') === 'true') await migrate().catch(() => {});
  startMetricsServer();
  if (!url) { console.warn('[worker] sem REDIS_URL — filas inativas'); return; }
  const workers = [];
  for (const [name, handler] of Object.entries(HANDLERS)) {
    const w = new Worker(name, async (job) => { await handler(job); M.jobsTotal.inc({ status: 'done' }); console.log('[worker] ' + name + ' job ' + job.id + ' OK'); }, { connection: conn() });
    w.on('failed', (job, err) => {
      M.jobsTotal.inc({ status: 'failed' });
      if (name === 'records-submit' && job && job.attemptsMade >= (job.opts.attempts || 1)) {
        updateRecordStatus(job.data.recordId, 'failed').catch(() => {});
      }
      console.warn('[worker] ' + name + ' falhou: ' + (err && err.message));
    });
    workers.push(w);
    console.log('[neuroevolui-worker] BullMQ iniciado: ' + name);
  }
  process.on('SIGTERM', async () => { await Promise.all(workers.map((w) => w.close())); process.exit(0); });
})();
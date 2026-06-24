// queue.js — filas Redis/BullMQ (bloco redis-bullmq) com degradação graciosa sem Redis.
import { Queue } from 'bullmq';

const url = process.env.REDIS_URL || '';
let _submitQ = null;
let _reportQ = null;

function conn() { const u = new URL(url); return { host: u.hostname, port: Number(u.port) || 6379 }; }

function submitQueue() {
  if (!url) return null;
  if (!_submitQ) _submitQ = new Queue('records-submit', { connection: conn() });
  return _submitQ;
}

function reportQueue() {
  if (!url) return null;
  if (!_reportQ) _reportQ = new Queue('report-generate', { connection: conn() });
  return _reportQ;
}

export async function enqueueSubmit(recordId) {
  const q = submitQueue();
  if (!q) return { inline: true };
  await q.add('submit', { recordId }, {
    jobId: 'submit-' + recordId,
    attempts: 4,
    backoff: { type: 'exponential', delay: 1000 },
    removeOnComplete: 100,
    removeOnFail: 200,
  });
  return { inline: false };
}

export async function enqueueReportGenerate(tenantId, patientId, filters) {
  const q = reportQueue();
  if (!q) {
    setImmediate(() => {}); // degradação graciosa: sem Redis, relatório já foi gerado inline
    return { inline: true };
  }
  const jobId = `report-${tenantId}-${patientId}`;
  await q.add('generate', { tenantId, patientId, filters }, {
    jobId,
    attempts: 3,
    backoff: { type: 'exponential', delay: 2000 },
    removeOnComplete: 50,
    removeOnFail: 100,
  });
  return { inline: false, jobId };
}

export async function queueCounts() {
  const q = submitQueue();
  if (!q) return { redis: false };
  const c = await q.getJobCounts('waiting', 'active', 'completed', 'failed', 'delayed');
  return { redis: true, ...c };
}

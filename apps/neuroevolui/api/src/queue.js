// queue.js — filas Redis/BullMQ (bloco redis-bullmq) com degradação graciosa sem Redis.
import { Queue } from 'bullmq';
const url = process.env.REDIS_URL || '';
let _qSubmit = null;
let _qReport = null;

function conn() { const u = new URL(url); return { host: u.hostname, port: Number(u.port) || 6379 }; }

export function hasRedis() { return !!url; }

function submitQueue() { if (!url) return null; if (!_qSubmit) _qSubmit = new Queue('records-submit', { connection: conn() }); return _qSubmit; }
function reportQueue() { if (!url) return null; if (!_qReport) _qReport = new Queue('report-generate', { connection: conn() }); return _qReport; }

// compat legado
export function queue() { return submitQueue(); }

export async function enqueueSubmit(recordId) {
  const q = submitQueue();
  if (!q) return { inline: true };
  await q.add('submit', { recordId }, { jobId: 'submit-' + recordId, attempts: 4, backoff: { type: 'exponential', delay: 1000 }, removeOnComplete: 100, removeOnFail: 200 });
  return { inline: false };
}

export async function enqueueReport(reportId, patientId, tenantId, filters) {
  const q = reportQueue();
  if (!q) return { inline: true };
  await q.add('generate', { reportId, patientId, tenantId, filters }, { jobId: 'report-' + reportId, attempts: 3, backoff: { type: 'exponential', delay: 2000 }, removeOnComplete: 50, removeOnFail: 100 });
  return { inline: false };
}

export async function queueCounts() {
  const q = submitQueue();
  if (!q) return { redis: false };
  const c = await q.getJobCounts('waiting', 'active', 'completed', 'failed', 'delayed');
  return { redis: true, ...c };
}

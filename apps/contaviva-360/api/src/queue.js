// queue.js — filas Redis/BullMQ (bloco redis-bullmq) com degradação graciosa sem Redis.
import { Queue } from 'bullmq';
const url = process.env.REDIS_URL || '';
let _submitQ = null;
let _documentQ = null;
function conn() { const u = new URL(url); return { host: u.hostname, port: Number(u.port) || 6379 }; }

export function queue() {
  if (!url) return null;
  if (!_submitQ) _submitQ = new Queue('records-submit', { connection: conn() });
  return _submitQ;
}

export function documentQueue() {
  if (!url) return null;
  if (!_documentQ) _documentQ = new Queue('document-process', { connection: conn() });
  return _documentQ;
}

export async function enqueueSubmit(recordId) {
  const q = queue();
  if (!q) return { inline: true }; // sem Redis -> degradação graciosa
  await q.add('submit', { recordId }, { jobId: 'submit-' + recordId, attempts: 4, backoff: { type: 'exponential', delay: 1000 }, removeOnComplete: 100, removeOnFail: 200 });
  return { inline: false };
}

export async function enqueueDocumentProcess(documentId, jobKey = null) {
  const q = documentQueue();
  if (!q) return { inline: true };
  const opts = { attempts: 3, backoff: { type: 'exponential', delay: 2000 }, removeOnComplete: 100, removeOnFail: 200 };
  if (jobKey) opts.jobId = jobKey;
  await q.add('document-process', { documentId }, opts);
  return { inline: false };
}

export async function queueCounts() {
  const q = queue();
  if (!q) return { redis: false };
  const c = await q.getJobCounts('waiting', 'active', 'completed', 'failed', 'delayed');
  return { redis: true, ...c };
}

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

let _obligationQ = null;

export function obligationQueue() {
  if (!url) return null;
  if (!_obligationQ) _obligationQ = new Queue('obligations-alert', { connection: conn() });
  return _obligationQ;
}

export async function enqueueObligationAlert(obligationId, nivel) {
  const q = obligationQueue();
  if (!q) return { inline: true }; // sem Redis -> degradação graciosa
  await q.add('obligation-alert', { obligationId, nivel }, {
    jobId: `obligation-alert-${obligationId}-${nivel}`,
    attempts: 3,
    backoff: { type: 'exponential', delay: 2000 },
    removeOnComplete: 100,
    removeOnFail: 200,
  });
  return { inline: false };
}

let _taskQ = null;

export function taskNotificationQueue() {
  if (!url) return null;
  if (!_taskQ) _taskQ = new Queue('tasks-notification', { connection: conn() });
  return _taskQ;
}

export async function enqueueTaskNotification(taskId, eventType, payload) {
  const q = taskNotificationQueue();
  if (!q) return { inline: true }; // sem Redis -> degradação graciosa
  await q.add('task-notification', { taskId, eventType, ...payload }, {
    attempts: 3,
    backoff: { type: 'exponential', delay: 2000 },
    removeOnComplete: 100,
    removeOnFail: 200,
  });
  return { inline: false };
}

let _reportQ = null;

export function financialReportQueue() {
  if (!url) return null;
  if (!_reportQ) _reportQ = new Queue('financial-report', { connection: conn() });
  return _reportQ;
}

export async function enqueueFinancialReport(jobKey, params) {
  const q = financialReportQueue();
  if (!q) return { inline: true }; // sem Redis -> degradação graciosa
  await q.add('generate', params, {
    jobId: jobKey,
    attempts: 3,
    backoff: { type: 'exponential', delay: 2000 },
    removeOnComplete: 50,
    removeOnFail: 100,
  });
  return { inline: false };
}

export async function queueCounts() {
  const q = queue();
  if (!q) return { redis: false };
  const c = await q.getJobCounts('waiting', 'active', 'completed', 'failed', 'delayed');
  return { redis: true, ...c };
}

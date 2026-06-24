// queue.js — filas nomeadas BullMQ com retry/backoff configurável por fila e degradação graciosa.
import { Queue } from 'bullmq';

export const QUEUE_CONFIGS = {
  'consultation-notes': { attempts: 5, backoff: { type: 'exponential', delay: 500 } },
  'patient-imports':    { attempts: 3, backoff: { type: 'exponential', delay: 2000 } },
  'notifications':      { attempts: 4, backoff: { type: 'exponential', delay: 1000 } },
  'summaries-ai':       { attempts: 3, backoff: { type: 'exponential', delay: 3000 } },
  'records-submit':     { attempts: 4, backoff: { type: 'exponential', delay: 1000 } },
};

const _queues = {};

function getConn() {
  const url = process.env.REDIS_URL;
  if (!url) return null;
  const u = new URL(url);
  return { host: u.hostname, port: Number(u.port) || 6379 };
}

function getQueue(name) {
  const conn = getConn();
  if (!conn) return null;
  if (!_queues[name]) _queues[name] = new Queue(name, { connection: conn });
  return _queues[name];
}

export function getConsultationNotesQueue() { return getQueue('consultation-notes'); }
export function getPatientImportsQueue()    { return getQueue('patient-imports'); }
export function getNotificationsQueue()     { return getQueue('notifications'); }
export function getSummariesAiQueue()       { return getQueue('summaries-ai'); }
export function queue()                     { return getQueue('records-submit'); }

export async function enqueueJob(queueName, jobName, data, jobKey) {
  const q = getQueue(queueName);
  const cfg = QUEUE_CONFIGS[queueName] || { attempts: 3, backoff: { type: 'exponential', delay: 1000 } };
  if (!q) {
    // degradação graciosa: sem Redis retorna job_id determinístico; caller processa inline se necessário
    return { inline: true, job_id: jobKey || (jobName + '-inline') };
  }
  const job = await q.add(jobName, data, {
    jobId: jobKey,
    attempts: cfg.attempts,
    backoff: cfg.backoff,
    removeOnComplete: 100,
    removeOnFail: 200,
  });
  return { inline: false, job_id: job.id };
}

export async function enqueueSubmit(recordId) {
  return enqueueJob('records-submit', 'submit', { recordId }, 'submit-' + recordId);
}

export async function queueCounts() {
  if (!process.env.REDIS_URL) return { redis: false };
  const counts = {};
  for (const name of Object.keys(QUEUE_CONFIGS)) {
    const q = getQueue(name);
    if (q) {
      try { counts[name] = await q.getJobCounts('waiting', 'active', 'completed', 'failed', 'delayed'); }
      catch { counts[name] = { error: true }; }
    }
  }
  return { redis: true, ...counts };
}

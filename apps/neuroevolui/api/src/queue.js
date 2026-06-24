// queue.js — filas Redis/BullMQ. 4 named queues + records-submit (legado). Degradação graciosa sem Redis.
import { Queue } from 'bullmq';

const REDIS_URL = process.env.REDIS_URL || '';

function conn() {
  const u = new URL(REDIS_URL);
  return { host: u.hostname, port: Number(u.port) || 6379 };
}

// Configuração de retry/backoff por fila (configurável individualmente).
const QUEUE_CONFIGS = {
  'consultation-notes': { attempts: 5, backoff: { type: 'exponential', delay: 1000 } },
  'patient-imports':    { attempts: 3, backoff: { type: 'exponential', delay: 2000 } },
  'notifications':      { attempts: 8, backoff: { type: 'exponential', delay: 500  } },
  'summaries-ai':       { attempts: 3, backoff: { type: 'exponential', delay: 3000 } },
};

const _queues = {};

function getQueue(name) {
  if (!REDIS_URL) return null;
  if (!_queues[name]) _queues[name] = new Queue(name, { connection: conn() });
  return _queues[name];
}

// Enfileira job com dedup por job_key (jobId BullMQ). Retorna { job_id, inline }.
// Degradação graciosa: sem REDIS_URL executa setImmediate (fallback inline) sem erro.
export async function enqueue(queueName, jobKey, data) {
  const cfg = QUEUE_CONFIGS[queueName] || { attempts: 3, backoff: { type: 'exponential', delay: 1000 } };
  const q = getQueue(queueName);
  if (!q) {
    await new Promise((resolve) => setImmediate(resolve));
    return { job_id: `inline-${jobKey}`, inline: true };
  }
  const job = await q.add(queueName, { jobKey, ...data }, {
    jobId: jobKey,
    attempts: cfg.attempts,
    backoff: cfg.backoff,
    removeOnComplete: 100,
    removeOnFail: 200,
  });
  return { job_id: job.id, inline: false };
}

// --- records-submit (legado, mantido para compatibilidade) ---
let _q = null;
export function queue() {
  if (!REDIS_URL) return null;
  if (!_q) _q = new Queue('records-submit', { connection: conn() });
  return _q;
}

export async function enqueueSubmit(recordId) {
  const q = queue();
  if (!q) return { inline: true };
  await q.add('submit', { recordId }, {
    jobId: `submit-${recordId}`,
    attempts: 4,
    backoff: { type: 'exponential', delay: 1000 },
    removeOnComplete: 100,
    removeOnFail: 200,
  });
  return { inline: false };
}

export async function queueCounts() {
  const q = queue();
  if (!q) return { redis: false };
  const c = await q.getJobCounts('waiting', 'active', 'completed', 'failed', 'delayed');
  return { redis: true, ...c };
}

export const NAMED_QUEUES = Object.keys(QUEUE_CONFIGS);

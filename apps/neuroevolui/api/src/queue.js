// queue.js — Redis/BullMQ: filas nomeadas (redis-bullmq) com degradação graciosa.
import { Queue } from 'bullmq';

const url = process.env.REDIS_URL || '';

const QUEUE_CONFIG = {
  'consultation-notes': { attempts: 5, backoff: { type: 'exponential', delay: 500 } },
  'patient-imports':    { attempts: 3, backoff: { type: 'exponential', delay: 2000 } },
  'notifications':      { attempts: 4, backoff: { type: 'exponential', delay: 1000 } },
  'summaries-ai':       { attempts: 3, backoff: { type: 'exponential', delay: 3000 } },
  'records-submit':     { attempts: 4, backoff: { type: 'exponential', delay: 1000 } },
};

function conn() { const u = new URL(url); return { host: u.hostname, port: Number(u.port) || 6379 }; }

const _queues = {};
export function getQueue(name) {
  if (!url) return null;
  if (!_queues[name]) _queues[name] = new Queue(name, { connection: conn() });
  return _queues[name];
}

export function queue() { return getQueue('records-submit'); }

export async function enqueueJob(queueName, jobType, data, jobKey) {
  const q = getQueue(queueName);
  if (!q) return { inline: true };
  const cfg = QUEUE_CONFIG[queueName] || { attempts: 3, backoff: { type: 'exponential', delay: 1000 } };
  await q.add(jobType, data, { jobId: jobKey, ...cfg, removeOnComplete: 100, removeOnFail: 200 });
  return { inline: false, job_id: jobKey };
}

export async function enqueueSubmit(recordId) {
  return enqueueJob('records-submit', 'submit', { recordId }, 'submit-' + recordId);
}

export async function queueCounts() {
  const counts = {};
  let hasRedis = false;
  for (const name of Object.keys(QUEUE_CONFIG)) {
    const q = getQueue(name);
    if (q) { hasRedis = true; counts[name] = await q.getJobCounts('waiting', 'active', 'completed', 'failed', 'delayed'); }
  }
  return { redis: hasRedis, queues: counts };
}

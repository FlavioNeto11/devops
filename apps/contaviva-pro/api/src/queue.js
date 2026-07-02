// queue.js — fila Redis/BullMQ (bloco redis-bullmq) com degradação graciosa sem Redis.
import { Queue } from 'bullmq';
const url = process.env.REDIS_URL || '';
let _q = null;
function conn() { const u = new URL(url); return { host: u.hostname, port: Number(u.port) || 6379 }; }
export function queue() { if (!url) return null; if (!_q) _q = new Queue("records-submit", { connection: conn() }); return _q; }
export async function enqueueSubmit(recordId) {
  const q = queue();
  if (!q) { return { inline: true }; } // sem Redis -> o caller processa inline (degradação graciosa)
  await q.add("submit", { recordId }, { jobId: "submit-" + recordId, attempts: 4, backoff: { type: "exponential", delay: 1000 }, removeOnComplete: 100, removeOnFail: 200 });
  return { inline: false };
}
export async function queueCounts() { const q = queue(); if (!q) return { redis: false }; const c = await q.getJobCounts("waiting", "active", "completed", "failed", "delayed"); return { redis: true, ...c }; }

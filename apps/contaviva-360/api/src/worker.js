// worker.js — consumidor BullMQ (bloco redis-bullmq). Processa submit -> gateway -> status.
import { Worker } from 'bullmq';
import { pool, migrate } from './db.js';
import { M, startMetricsServer } from './metrics.js';
const url = process.env.REDIS_URL || '';
function conn() { const u = new URL(url); return { host: u.hostname, port: Number(u.port) || 6379 }; }
async function handle(job) {
  const id = job.data.recordId;
  const rec = (await pool.query('SELECT id,title FROM records WHERE id=$1', [id])).rows[0] || { id, title: 'Record ' + id };
  await pool.query("UPDATE records SET status='submitted', updated_at=now() WHERE id=$1", [id]);
}
(async () => { if ((process.env.AUTO_MIGRATE || 'true') === 'true') await migrate().catch(() => {}); startMetricsServer();
  if (!url) { console.warn("[worker] sem REDIS_URL — fila inativa"); return; }
  const w = new Worker("records-submit", async (job) => { await handle(job); M.jobsTotal.inc({ status: "done" }); console.log("[worker] job " + job.id + " OK"); }, { connection: conn() });
  w.on("failed", (job, err) => { M.jobsTotal.inc({ status: "failed" }); if (job && job.attemptsMade >= (job.opts.attempts || 1)) pool.query("UPDATE records SET status='failed', updated_at=now() WHERE id=$1", [job.data.recordId]).catch(() => {}); console.warn("[worker] job falhou: " + (err && err.message)); });
  console.log("[contaviva-360-worker] BullMQ iniciado");
  process.on('SIGTERM', async () => { await w.close(); process.exit(0); });
})();
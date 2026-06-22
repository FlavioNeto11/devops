// repositories/jobs-repo.js — fila transacional (FOR UPDATE SKIP LOCKED). Gerado pela Forge.
import { pool } from '../db.js';
export async function enqueue(type, payload, jobKey, maxAttempts = 4) {
  const { rows } = await pool.query('INSERT INTO jobs(type,payload,job_key,max_attempts) VALUES ($1,$2,$3,$4) ON CONFLICT (job_key) DO NOTHING RETURNING id', [type, JSON.stringify(payload), jobKey, maxAttempts]);
  return rows[0] ? rows[0].id : null;
}
export async function claim(workerId) {
  const { rows } = await pool.query(`UPDATE jobs SET status='running', locked_at=now(), locked_by=$1, attempts=attempts+1, updated_at=now() WHERE id = (SELECT id FROM jobs WHERE status='queued' AND run_after<=now() ORDER BY id FOR UPDATE SKIP LOCKED LIMIT 1) RETURNING *`, [workerId]);
  return rows[0] || null;
}
export async function ack(id) { await pool.query(`UPDATE jobs SET status='done', locked_at=NULL, last_error=NULL, updated_at=now() WHERE id=$1`, [id]); }
export async function fail(job, msg) {
  if (job.attempts >= job.max_attempts) { await pool.query(`UPDATE jobs SET status='dlq', locked_at=NULL, last_error=$2, updated_at=now() WHERE id=$1`, [job.id, msg]); return 'dlq'; }
  const backoff = Math.min(60, Math.pow(2, job.attempts));
  await pool.query(`UPDATE jobs SET status='queued', locked_at=NULL, last_error=$2, run_after=now() + ($3 || ' seconds')::interval, updated_at=now() WHERE id=$1`, [job.id, msg, String(backoff)]);
  return 'requeued';
}
export async function requeueStale(s = 120) { const { rowCount } = await pool.query(`UPDATE jobs SET status='queued', locked_at=NULL, updated_at=now() WHERE status='running' AND locked_at < now() - ($1 || ' seconds')::interval`, [String(s)]); return rowCount; }
export async function counts() { const { rows } = await pool.query(`SELECT status, count(*)::int AS n FROM jobs GROUP BY status`); return Object.fromEntries(rows.map((r) => [r.status, r.n])); }

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

// ---- leitura para o monitor/detalhe da fila (JobsMonitorView + JobDetailView) ----
// Colunas permitidas em ORDER BY (allowlist anti-injeção); o resto cai no default.
const SORTABLE = new Set(['id', 'type', 'status', 'attempts', 'run_after', 'created_at', 'updated_at']);
export async function list({ page = 1, pageSize = 25, sort = 'id', dir = 'desc', q = '', status = '', type = '' } = {}) {
  const where = [];
  const args = [];
  if (status) { args.push(status); where.push('status = $' + args.length); }
  if (type) { args.push(type); where.push('type = $' + args.length); }
  if (q) {
    const term = String(q).trim();
    const idNum = Number(term.replace(/^#/, ''));
    args.push('%' + term + '%');
    const like = '$' + args.length;
    if (Number.isInteger(idNum) && idNum > 0) { args.push(idNum); where.push('(type ILIKE ' + like + ' OR job_key ILIKE ' + like + ' OR id = $' + args.length + ')'); }
    else { where.push('(type ILIKE ' + like + ' OR job_key ILIKE ' + like + ')'); }
  }
  const whereSql = where.length ? ('WHERE ' + where.join(' AND ')) : '';
  const col = SORTABLE.has(String(sort)) ? String(sort) : 'id';
  const ord = String(dir).toLowerCase() === 'asc' ? 'ASC' : 'DESC';
  const lim = Math.min(200, Math.max(1, Number(pageSize) || 25));
  const pg = Math.max(1, Number(page) || 1);
  const off = (pg - 1) * lim;
  const total = (await pool.query('SELECT count(*)::int AS n FROM jobs ' + whereSql, args)).rows[0].n;
  args.push(lim); const limIdx = '$' + args.length;
  args.push(off); const offIdx = '$' + args.length;
  const { rows } = await pool.query('SELECT * FROM jobs ' + whereSql + ' ORDER BY ' + col + ' ' + ord + ' LIMIT ' + limIdx + ' OFFSET ' + offIdx, args);
  return { data: rows, total, page: pg, pageSize: lim };
}
export async function get(id) { const { rows } = await pool.query('SELECT * FROM jobs WHERE id=$1', [Number(id)]); return rows[0] || null; }
// Reenfileira da DLQ (ou de queued): zera tentativas/erro e libera para execução imediata.
// Idempotente: a chave job_key continua a impedir duplicidade na fila.
export async function requeue(id) {
  const { rows } = await pool.query(`UPDATE jobs SET status='queued', attempts=0, last_error=NULL, locked_at=NULL, locked_by=NULL, run_after=now(), updated_at=now() WHERE id=$1 RETURNING *`, [Number(id)]);
  return rows[0] || null;
}

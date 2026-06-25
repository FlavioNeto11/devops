// jobs.js — fila transacional (SICAT pattern): tabela jobs + SKIP LOCKED + retry/backoff + DLQ.
import { pool } from './db.js';

const BASE_BACKOFF_MS = 2000;
const STALE_TIMEOUT_MS = 5 * 60 * 1000;

function backoffDelay(attempts) {
  return Math.min(BASE_BACKOFF_MS * Math.pow(2, attempts - 1), 30000);
}

export async function enqueueJob(type, payload = {}, { maxAttempts = 3, jobKey = null } = {}) {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    if (jobKey) {
      const { rows } = await client.query(
        `SELECT id FROM jobs WHERE payload->>'job_key'=$1 AND status NOT IN ('succeeded','failed','dlq','cancelled') LIMIT 1`,
        [jobKey]
      );
      if (rows.length > 0) { await client.query('COMMIT'); return rows[0]; }
    }
    const jobPayload = jobKey ? { ...payload, job_key: jobKey } : payload;
    const { rows } = await client.query(
      `INSERT INTO jobs(type, payload, max_attempts) VALUES ($1,$2,$3) RETURNING *`,
      [type, JSON.stringify(jobPayload), maxAttempts]
    );
    await client.query('COMMIT');
    return rows[0];
  } catch (e) { await client.query('ROLLBACK'); throw e; }
  finally { client.release(); }
}

export async function claimJobs(workerId, batchSize = 5) {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const { rows } = await client.query(
      `WITH candidate AS (
         SELECT id FROM jobs
         WHERE status IN ('queued','retry_wait') AND run_after <= now()
         ORDER BY id LIMIT $1 FOR UPDATE SKIP LOCKED
       )
       UPDATE jobs j SET status='running', locked_at=now(), locked_by=$2,
         claim_heartbeat_at=now(), attempts=attempts+1
       FROM candidate WHERE j.id=candidate.id RETURNING j.*`,
      [batchSize, workerId]
    );
    await client.query('COMMIT');
    return rows;
  } catch (e) { await client.query('ROLLBACK'); throw e; }
  finally { client.release(); }
}

export async function ackJob(jobId, workerId, result = {}) {
  await pool.query(
    `UPDATE jobs SET status='succeeded', result=$1, locked_at=null, locked_by=null, updated_at=now()
     WHERE id=$2 AND locked_by=$3`,
    [JSON.stringify(result), jobId, workerId]
  );
}

export async function failJob(jobId, workerId, error, { retryable = true } = {}) {
  const { rows } = await pool.query('SELECT * FROM jobs WHERE id=$1 AND locked_by=$2', [jobId, workerId]);
  if (!rows[0]) return;
  const job = rows[0];
  const msg = (error && error.message) ? error.message : String(error);

  if (!retryable || job.attempts >= job.max_attempts) {
    const client = await pool.connect();
    try {
      await client.query('BEGIN');
      await client.query(
        `INSERT INTO job_dead_letter_queue(original_job_id, type, payload, attempts, error_message, dlq_reason)
         VALUES ($1,$2,$3,$4,$5,$6)`,
        [job.id, job.type, job.payload, job.attempts, msg, retryable ? 'max_attempts' : 'non_retryable']
      );
      await client.query(
        `UPDATE jobs SET status='dlq', error_message=$1, locked_at=null, locked_by=null, updated_at=now() WHERE id=$2`,
        [msg, jobId]
      );
      await client.query('COMMIT');
    } catch (e) { await client.query('ROLLBACK'); throw e; }
    finally { client.release(); }
  } else {
    const delay = backoffDelay(job.attempts);
    const runAfter = new Date(Date.now() + delay);
    await pool.query(
      `UPDATE jobs SET status='retry_wait', error_message=$1, run_after=$2,
       locked_at=null, locked_by=null, updated_at=now() WHERE id=$3`,
      [msg, runAfter.toISOString(), jobId]
    );
  }
}

export async function heartbeatJob(jobId, workerId) {
  await pool.query(
    `UPDATE jobs SET claim_heartbeat_at=now() WHERE id=$1 AND locked_by=$2`,
    [jobId, workerId]
  );
}

export async function requeueStaleJobs() {
  const cutoff = new Date(Date.now() - STALE_TIMEOUT_MS).toISOString();
  const { rows } = await pool.query(
    `UPDATE jobs SET status='queued', locked_at=null, locked_by=null, claim_heartbeat_at=null, updated_at=now()
     WHERE status='running' AND claim_heartbeat_at < $1 RETURNING id`,
    [cutoff]
  );
  return rows.length;
}

export { backoffDelay };

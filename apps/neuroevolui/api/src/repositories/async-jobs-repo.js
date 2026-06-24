// repositories/async-jobs-repo.js — rastreamento de async jobs por queue_name+job_key (dedup e status).
import { pool } from '../db.js';

export async function findAsyncJob(queueName, jobKey) {
  const r = await pool.query(
    'SELECT * FROM async_jobs WHERE queue_name=$1 AND job_key=$2',
    [queueName, jobKey]
  );
  return r.rows[0] || null;
}

export async function upsertAsyncJob({ tenantId, queueName, jobKey, jobId, status, payload, createdBy }) {
  const r = await pool.query(
    `INSERT INTO async_jobs(tenant_id, queue_name, job_key, job_id, status, payload, created_by)
     VALUES($1,$2,$3,$4,$5,$6::jsonb,$7)
     ON CONFLICT(queue_name, job_key) DO UPDATE SET job_id = excluded.job_id, updated_at = now()
     RETURNING *`,
    [tenantId || 1, queueName, jobKey, jobId, status || 'queued', JSON.stringify(payload || {}), createdBy || 'system']
  );
  return r.rows[0];
}

export async function updateAsyncJobStatus(queueName, jobKey, status, result) {
  await pool.query(
    `UPDATE async_jobs SET status=$3, result=$4::jsonb, updated_at=now()
     WHERE queue_name=$1 AND job_key=$2`,
    [queueName, jobKey, status, result !== undefined ? JSON.stringify(result) : null]
  );
}

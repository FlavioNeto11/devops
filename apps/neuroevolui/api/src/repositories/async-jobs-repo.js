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

// Coleção paginada para a rota REST genérica GET /v1/async-jobs → { data, total }.
// Aceita filtros opcionais: status, queue_name.
const JOBS_SORTABLE = new Set(['id', 'queue_name', 'status', 'created_at', 'updated_at', 'completed_at']);
export async function listAsyncJobsPaged(tenantId, { page = 1, pageSize = 50, sort = 'id', dir = 'desc', status, queue_name } = {}) {
  const col = JOBS_SORTABLE.has(sort) ? sort : 'id';
  const order = String(dir).toLowerCase() === 'asc' ? 'ASC' : 'DESC';
  const limit = Math.min(Math.max(Number(pageSize) || 50, 1), 200);
  const offset = (Math.max(Number(page) || 1, 1) - 1) * limit;
  const where = ['tenant_id=$1'];
  const params = [tenantId];
  if (status && status !== '') {
    params.push(String(status));
    where.push(`status = $${params.length}`);
  }
  if (queue_name && queue_name !== '') {
    params.push(String(queue_name));
    where.push(`queue_name = $${params.length}`);
  }
  const whereSql = where.join(' AND ');
  const totalRes = await pool.query(`SELECT count(*)::int n FROM async_jobs WHERE ${whereSql}`, params);
  const r = await pool.query(
    `SELECT * FROM async_jobs WHERE ${whereSql} ORDER BY ${col} ${order} LIMIT $${params.length + 1} OFFSET $${params.length + 2}`,
    [...params, limit, offset]
  );
  return { data: r.rows, total: totalRes.rows[0].n };
}

export async function findAsyncJobById(tenantId, id) {
  const r = await pool.query('SELECT * FROM async_jobs WHERE tenant_id=$1 AND id=$2', [tenantId, Number(id)]);
  return r.rows[0] ?? null;
}

// Lista paginada de jobs de uma fila específica (ex.: queue_name='notifications' p/ o
// histórico de lembretes/notificações enfileiradas). Dado REAL: as notificações são
// enfileiradas em async_jobs via enqueueAsync(..., 'notifications'). Filtro opcional por
// consultation_id (lido do payload JSONB) p/ o card de lembretes da consulta.
export async function deleteAsyncJob(tenantId, id) {
  const r = await pool.query(
    'DELETE FROM async_jobs WHERE tenant_id=$1 AND id=$2 RETURNING id',
    [tenantId, Number(id)]
  );
  return r.rowCount > 0;
}

export async function listAsyncJobsByQueue(tenantId, queueName, { page = 1, pageSize = 50, sort = 'id', dir = 'desc', consultationId } = {}) {
  const col = JOBS_SORTABLE.has(sort) ? sort : 'id';
  const order = String(dir).toLowerCase() === 'asc' ? 'ASC' : 'DESC';
  const limit = Math.min(Math.max(Number(pageSize) || 50, 1), 200);
  const offset = (Math.max(Number(page) || 1, 1) - 1) * limit;
  const where = ['tenant_id=$1', 'queue_name=$2'];
  const params = [tenantId, queueName];
  if (consultationId !== undefined && consultationId !== null && consultationId !== '') {
    params.push(String(consultationId));
    where.push(`(payload->>'consultation_id') = $${params.length}`);
  }
  const whereSql = where.join(' AND ');
  const totalRes = await pool.query(`SELECT count(*)::int n FROM async_jobs WHERE ${whereSql}`, params);
  const r = await pool.query(
    `SELECT * FROM async_jobs WHERE ${whereSql} ORDER BY ${col} ${order} LIMIT $${params.length + 1} OFFSET $${params.length + 2}`,
    [...params, limit, offset]
  );
  return { data: r.rows, total: totalRes.rows[0].n };
}

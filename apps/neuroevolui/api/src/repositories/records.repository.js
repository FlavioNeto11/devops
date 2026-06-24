// repositories/records.repository.js — SQL de records isolado da camada de rota.
import { pool } from '../db.js';

export async function listRecords(tenantId) {
  return (await pool.query('SELECT * FROM records WHERE tenant_id=$1 ORDER BY id DESC LIMIT 200', [tenantId])).rows;
}

export async function createRecord(tenantId, title) {
  return (await pool.query('INSERT INTO records(tenant_id,title) VALUES ($1,$2) RETURNING *', [tenantId, title])).rows[0];
}

export async function getRecord(tenantId, id) {
  return (await pool.query('SELECT * FROM records WHERE tenant_id=$1 AND id=$2', [tenantId, id])).rows[0] || null;
}

export async function deleteRecord(tenantId, id) {
  await pool.query('DELETE FROM records WHERE tenant_id=$1 AND id=$2', [tenantId, id]);
}

export async function setRecordStatus(id, status) {
  await pool.query('UPDATE records SET status=$2, updated_at=now() WHERE id=$1', [id, status]);
}

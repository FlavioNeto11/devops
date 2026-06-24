// repositories/records.js — SQL da entidade records (camadas-rigidas: SQL fora de routes/server).
import { pool } from '../db.js';

export async function listRecords(tenantId) {
  const { rows } = await pool.query(
    'SELECT * FROM records WHERE tenant_id=$1 ORDER BY id DESC LIMIT 200',
    [tenantId]
  );
  return rows;
}

export async function createRecord(tenantId, title) {
  const { rows } = await pool.query(
    'INSERT INTO records(tenant_id,title) VALUES ($1,$2) RETURNING *',
    [tenantId, title]
  );
  return rows[0];
}

export async function findRecord(tenantId, id) {
  const { rows } = await pool.query(
    'SELECT * FROM records WHERE tenant_id=$1 AND id=$2',
    [tenantId, id]
  );
  return rows[0] || null;
}

export async function deleteRecord(tenantId, id) {
  await pool.query('DELETE FROM records WHERE tenant_id=$1 AND id=$2', [tenantId, id]);
}

export async function updateRecordStatus(id, status) {
  await pool.query(
    'UPDATE records SET status=$2, updated_at=now() WHERE id=$1',
    [id, status]
  );
}

export async function findRecordById(id) {
  const { rows } = await pool.query('SELECT id,title FROM records WHERE id=$1', [id]);
  return rows[0] || null;
}

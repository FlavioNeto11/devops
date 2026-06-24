// repositories/records.js — SQL do domínio records (gymops-style: SQL vive aqui, não no server).
import { pool } from '../db.js';

export async function listByTenant(tenantId) {
  const { rows } = await pool.query(
    'SELECT * FROM records WHERE tenant_id=$1 AND deleted_at IS NULL ORDER BY id DESC LIMIT 200',
    [tenantId]
  );
  return rows;
}

export async function create(tenantId, title, createdBy) {
  const { rows } = await pool.query(
    'INSERT INTO records(tenant_id,title,created_by) VALUES ($1,$2,$3) RETURNING *',
    [tenantId, title, createdBy]
  );
  return rows[0];
}

export async function findOne(tenantId, id) {
  const { rows } = await pool.query(
    'SELECT * FROM records WHERE tenant_id=$1 AND id=$2 AND deleted_at IS NULL',
    [tenantId, id]
  );
  return rows[0] || null;
}

export async function softDelete(tenantId, id) {
  await pool.query(
    'UPDATE records SET deleted_at=now(), updated_at=now() WHERE tenant_id=$1 AND id=$2 AND deleted_at IS NULL',
    [tenantId, id]
  );
}

export async function setSubmitting(id) {
  await pool.query("UPDATE records SET status='submitting', updated_at=now() WHERE id=$1", [id]);
}

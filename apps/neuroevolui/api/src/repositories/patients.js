// repositories/patients.js — SQL da entidade patients.
import { pool } from '../db.js';

export async function listPatients(tenantId) {
  const { rows } = await pool.query(
    'SELECT * FROM patients WHERE tenant_id=$1 ORDER BY name',
    [tenantId]
  );
  return rows;
}

export async function createPatient(tenantId, data) {
  const { name, email, phone, date_of_birth } = data;
  const { rows } = await pool.query(
    `INSERT INTO patients(tenant_id, name, email, phone, date_of_birth)
     VALUES ($1,$2,$3,$4,$5) RETURNING *`,
    [tenantId, name, email || null, phone || null, date_of_birth || null]
  );
  return rows[0];
}

export async function findPatient(tenantId, id) {
  const { rows } = await pool.query(
    'SELECT * FROM patients WHERE tenant_id=$1 AND id=$2',
    [tenantId, id]
  );
  return rows[0] || null;
}

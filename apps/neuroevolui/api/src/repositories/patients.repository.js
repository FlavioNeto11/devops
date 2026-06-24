// repositories/patients.repository.js — SQL de pacientes.
import { pool } from '../db.js';

export async function createPatient(tenantId, data) {
  const { name, birth_date, record_number } = data;
  return (await pool.query(
    'INSERT INTO patients(tenant_id,name,birth_date,record_number) VALUES ($1,$2,$3,$4) RETURNING *',
    [tenantId, name, birth_date || null, record_number || null]
  )).rows[0];
}

export async function getPatient(tenantId, id) {
  return (await pool.query('SELECT * FROM patients WHERE tenant_id=$1 AND id=$2', [tenantId, id])).rows[0] || null;
}

export async function listPatients(tenantId) {
  return (await pool.query('SELECT * FROM patients WHERE tenant_id=$1 ORDER BY name ASC', [tenantId])).rows;
}

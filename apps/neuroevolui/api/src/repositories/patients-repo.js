// repositories/patients-repo.js — SQL de pacientes (entidade central). camadas-rigidas.
import { pool } from '../db.js';

const SORTABLE = new Set(['id', 'full_name', 'status', 'created_at', 'updated_at', 'birth_date']);

export async function listPatients(tenantId, { page = 1, pageSize = 50, sort = 'id', dir = 'desc' } = {}) {
  const col = SORTABLE.has(sort) ? sort : 'id';
  const order = String(dir).toLowerCase() === 'asc' ? 'ASC' : 'DESC';
  const limit = Math.min(Math.max(Number(pageSize) || 50, 1), 200);
  const offset = (Math.max(Number(page) || 1, 1) - 1) * limit;
  const totalRes = await pool.query('SELECT count(*)::int n FROM patients WHERE tenant_id=$1 AND deleted_at IS NULL', [tenantId]);
  const r = await pool.query(
    `SELECT * FROM patients WHERE tenant_id=$1 AND deleted_at IS NULL ORDER BY ${col} ${order} LIMIT $2 OFFSET $3`,
    [tenantId, limit, offset]
  );
  return { data: r.rows, total: totalRes.rows[0].n };
}

export async function findPatient(tenantId, id) {
  const r = await pool.query('SELECT * FROM patients WHERE tenant_id=$1 AND id=$2 AND deleted_at IS NULL', [tenantId, Number(id)]);
  return r.rows[0] ?? null;
}

export async function createPatient(tenantId, body, createdBy = 'system') {
  const r = await pool.query(
    `INSERT INTO patients(tenant_id, full_name, birth_date, document, email, phone, guardian_name, assigned_professional_id, status, notes, created_by)
     VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11) RETURNING *`,
    [
      tenantId,
      body.full_name,
      body.birth_date || null,
      body.document || null,
      body.email || null,
      body.phone || null,
      body.guardian_name || null,
      body.assigned_professional_id || null,
      body.status || 'active',
      body.notes || null,
      createdBy,
    ]
  );
  return r.rows[0];
}

export async function updatePatient(tenantId, id, body) {
  const fields = ['full_name', 'birth_date', 'document', 'email', 'phone', 'guardian_name', 'assigned_professional_id', 'status', 'notes'];
  const sets = [];
  const params = [tenantId, Number(id)];
  let i = 3;
  for (const f of fields) {
    if (body[f] !== undefined) { sets.push(`${f}=$${i++}`); params.push(body[f] === '' ? null : body[f]); }
  }
  if (sets.length === 0) return findPatient(tenantId, id);
  sets.push('updated_at=now()');
  const r = await pool.query(
    `UPDATE patients SET ${sets.join(', ')} WHERE tenant_id=$1 AND id=$2 AND deleted_at IS NULL RETURNING *`,
    params
  );
  return r.rows[0] ?? null;
}

export async function deletePatient(tenantId, id) {
  const r = await pool.query(
    'UPDATE patients SET deleted_at=now(), updated_at=now() WHERE tenant_id=$1 AND id=$2 AND deleted_at IS NULL RETURNING id',
    [tenantId, Number(id)]
  );
  return r.rowCount > 0;
}

// repositories/consultations-repo.js — SQL de agendamentos.
import { pool } from '../db.js';

export async function createConsultation({ tenantId, patientId, professionalId, scheduledAt, scheduledEndAt, amountCents, currency, createdBy }) {
  const r = await pool.query(
    `INSERT INTO consultations(tenant_id, patient_id, professional_id, scheduled_at, scheduled_end_at, amount_cents, currency, created_by)
     VALUES($1,$2,$3,$4,$5,$6,$7,$8) RETURNING *`,
    [tenantId, patientId, professionalId, scheduledAt, scheduledEndAt, amountCents, currency || 'BRL', createdBy || 'system']
  );
  return r.rows[0];
}

export async function findScheduleConflict(professionalId, scheduledAt, scheduledEndAt) {
  const r = await pool.query(
    `SELECT id FROM consultations
     WHERE professional_id=$1
       AND status != 'cancelled'
       AND deleted_at IS NULL
       AND scheduled_at < $3
       AND scheduled_end_at > $2
     LIMIT 1`,
    [professionalId, scheduledAt, scheduledEndAt]
  );
  return r.rows[0] ?? null;
}

export async function findConsultation(tenantId, id) {
  const r = await pool.query('SELECT * FROM consultations WHERE tenant_id=$1 AND id=$2 AND deleted_at IS NULL', [tenantId, Number(id)]);
  return r.rows[0] ?? null;
}

export async function listConsultations(tenantId) {
  const r = await pool.query('SELECT * FROM consultations WHERE tenant_id=$1 AND deleted_at IS NULL ORDER BY scheduled_at DESC LIMIT 200', [tenantId]);
  return r.rows;
}

export async function updatePaymentStatusById(id, paymentStatus, transactionId) {
  await pool.query(
    `UPDATE consultations SET payment_status=$1, payment_transaction_id=$2, status='confirmed', updated_at=now() WHERE id=$3`,
    [paymentStatus, transactionId, Number(id)]
  );
}

export async function updatePaymentStatusByTransactionId(transactionId, paymentStatus) {
  await pool.query(
    `UPDATE consultations SET payment_status=$1, status='confirmed', updated_at=now() WHERE payment_transaction_id=$2`,
    [paymentStatus, transactionId]
  );
}

// Coleção paginada para a rota REST genérica GET /v1/consultations → { data, total }.
const CONSULT_SORTABLE = new Set(['id', 'scheduled_at', 'status', 'amount_cents', 'created_at']);
export async function listConsultationsPaged(tenantId, { page = 1, pageSize = 50, sort = 'id', dir = 'desc' } = {}) {
  const col = CONSULT_SORTABLE.has(sort) ? sort : 'id';
  const order = String(dir).toLowerCase() === 'asc' ? 'ASC' : 'DESC';
  const limit = Math.min(Math.max(Number(pageSize) || 50, 1), 200);
  const offset = (Math.max(Number(page) || 1, 1) - 1) * limit;
  const totalRes = await pool.query('SELECT count(*)::int n FROM consultations WHERE tenant_id=$1 AND deleted_at IS NULL', [tenantId]);
  const r = await pool.query(
    `SELECT * FROM consultations WHERE tenant_id=$1 AND deleted_at IS NULL ORDER BY ${col} ${order} LIMIT $2 OFFSET $3`,
    [tenantId, limit, offset]
  );
  return { data: r.rows, total: totalRes.rows[0].n };
}

export async function updateConsultation(tenantId, id, body) {
  const fields = ['patient_id', 'professional_id', 'scheduled_at', 'scheduled_end_at', 'duration_minutes', 'amount_cents', 'currency', 'status', 'payment_status', 'notes'];
  const sets = [];
  const params = [tenantId, Number(id)];
  let i = 3;
  for (const f of fields) {
    if (body[f] !== undefined) { sets.push(`${f}=$${i++}`); params.push(body[f] === '' ? null : body[f]); }
  }
  if (sets.length === 0) return findConsultation(tenantId, id);
  sets.push('updated_at=now()');
  const r = await pool.query(
    `UPDATE consultations SET ${sets.join(', ')} WHERE tenant_id=$1 AND id=$2 AND deleted_at IS NULL RETURNING *`,
    params
  );
  return r.rows[0] ?? null;
}

export async function deleteConsultation(tenantId, id) {
  const r = await pool.query(
    'UPDATE consultations SET deleted_at=now(), updated_at=now() WHERE tenant_id=$1 AND id=$2 AND deleted_at IS NULL RETURNING id',
    [tenantId, Number(id)]
  );
  return r.rowCount > 0;
}

// repositories/payment-transactions-repo.js — SQL de transações de pagamento.
import { pool } from '../db.js';

export async function createPaymentTransaction({ tenantId, consultationId, idempotencyKey, gatewayTransactionId, gatewayProvider, amountCents, currency, status, metadata, createdBy }) {
  const r = await pool.query(
    `INSERT INTO payment_transactions(tenant_id, consultation_id, idempotency_key, gateway_transaction_id, gateway_provider, amount_cents, currency, status, metadata, created_by)
     VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9::jsonb,$10) RETURNING *`,
    [tenantId, consultationId, idempotencyKey, gatewayTransactionId, gatewayProvider || 'sandbox', amountCents, currency || 'BRL', status, JSON.stringify(metadata || {}), createdBy || 'system']
  );
  return r.rows[0];
}

// Coleção paginada para a rota REST genérica GET /v1/payment-transactions → { data, total }.
// Inclui patient_name via LEFT JOIN para exibição na tabela (REF-NEUROEVOLUI-0039).
const PT_SORTABLE = new Set(['id', 'status', 'amount_cents', 'created_at']);
export async function listPaymentTransactions(tenantId, { page = 1, pageSize = 50, sort = 'id', dir = 'desc', status = '' } = {}) {
  const col = PT_SORTABLE.has(sort) ? `pt.${sort}` : 'pt.id';
  const order = String(dir).toLowerCase() === 'asc' ? 'ASC' : 'DESC';
  const limit = Math.min(Math.max(Number(pageSize) || 50, 1), 200);
  const offset = (Math.max(Number(page) || 1, 1) - 1) * limit;
  const baseParams = [tenantId];
  const conditions = ['pt.tenant_id=$1'];
  if (status) { baseParams.push(status); conditions.push(`pt.status=$${baseParams.length}`); }
  const where = conditions.join(' AND ');
  const totalRes = await pool.query(
    `SELECT count(*)::int n FROM payment_transactions pt WHERE ${where}`,
    baseParams
  );
  const n = baseParams.length;
  const r = await pool.query(
    `SELECT pt.*, p.full_name AS patient_name
     FROM payment_transactions pt
     LEFT JOIN patients p ON pt.patient_id IS NOT NULL AND p.tenant_id=pt.tenant_id AND p.id=pt.patient_id::bigint
     WHERE ${where}
     ORDER BY ${col} ${order} LIMIT $${n + 1} OFFSET $${n + 2}`,
    [...baseParams, limit, offset]
  );
  return { data: r.rows, total: totalRes.rows[0].n };
}

export async function findPaymentTransaction(tenantId, id) {
  const r = await pool.query(
    `SELECT pt.*, p.full_name AS patient_name
     FROM payment_transactions pt
     LEFT JOIN patients p ON pt.patient_id IS NOT NULL AND p.tenant_id=pt.tenant_id AND p.id=pt.patient_id::bigint
     WHERE pt.tenant_id=$1 AND pt.id=$2`,
    [tenantId, Number(id)]
  );
  return r.rows[0] ?? null;
}

// Exportação CSV: todos os registros (sem paginação) com filtro opcional por status.
export async function exportPaymentTransactions(tenantId, { status = '' } = {}) {
  const baseParams = [tenantId];
  const conditions = ['pt.tenant_id=$1'];
  if (status) { baseParams.push(status); conditions.push(`pt.status=$${baseParams.length}`); }
  const where = conditions.join(' AND ');
  const r = await pool.query(
    `SELECT pt.id, pt.created_at, pt.patient_id, p.full_name AS patient_name,
            pt.amount_cents, pt.currency, pt.status, pt.gateway_provider AS payment_method,
            pt.external_id, pt.event_type, pt.consultation_id
     FROM payment_transactions pt
     LEFT JOIN patients p ON pt.patient_id IS NOT NULL AND p.tenant_id=pt.tenant_id AND p.id=pt.patient_id::bigint
     WHERE ${where}
     ORDER BY pt.created_at DESC`,
    baseParams
  );
  return r.rows;
}

export async function updatePaymentTransaction(tenantId, id, body) {
  const fields = ['consultation_id', 'patient_id', 'amount_cents', 'currency', 'status', 'event_type', 'gateway_provider', 'gateway_transaction_id', 'metadata'];
  const sets = [];
  const params = [tenantId, Number(id)];
  let i = 3;
  for (const f of fields) {
    if (body[f] !== undefined) {
      if (f === 'metadata') { sets.push(`${f}=$${i++}::jsonb`); params.push(JSON.stringify(body[f])); }
      else { sets.push(`${f}=$${i++}`); params.push(body[f] === '' ? null : body[f]); }
    }
  }
  if (sets.length === 0) return findPaymentTransaction(tenantId, id);
  const r = await pool.query(
    `UPDATE payment_transactions SET ${sets.join(', ')} WHERE tenant_id=$1 AND id=$2 RETURNING *`,
    params
  );
  return r.rows[0] ?? null;
}

export async function deletePaymentTransaction(tenantId, id) {
  const r = await pool.query(
    'DELETE FROM payment_transactions WHERE tenant_id=$1 AND id=$2 RETURNING id',
    [tenantId, Number(id)]
  );
  return r.rowCount > 0;
}

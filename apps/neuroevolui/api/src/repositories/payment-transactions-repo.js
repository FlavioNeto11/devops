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
const PT_SORTABLE = new Set(['id', 'status', 'amount_cents', 'created_at']);
export async function listPaymentTransactions(tenantId, { page = 1, pageSize = 50, sort = 'id', dir = 'desc' } = {}) {
  const col = PT_SORTABLE.has(sort) ? sort : 'id';
  const order = String(dir).toLowerCase() === 'asc' ? 'ASC' : 'DESC';
  const limit = Math.min(Math.max(Number(pageSize) || 50, 1), 200);
  const offset = (Math.max(Number(page) || 1, 1) - 1) * limit;
  const totalRes = await pool.query('SELECT count(*)::int n FROM payment_transactions WHERE tenant_id=$1', [tenantId]);
  const r = await pool.query(
    `SELECT * FROM payment_transactions WHERE tenant_id=$1 ORDER BY ${col} ${order} LIMIT $2 OFFSET $3`,
    [tenantId, limit, offset]
  );
  return { data: r.rows, total: totalRes.rows[0].n };
}

export async function findPaymentTransaction(tenantId, id) {
  const r = await pool.query('SELECT * FROM payment_transactions WHERE tenant_id=$1 AND id=$2', [tenantId, Number(id)]);
  return r.rows[0] ?? null;
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

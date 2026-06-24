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

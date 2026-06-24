// repositories/audit-repo.js — trilha de auditoria (quem, quando, valor, status, gateway).
import { pool } from '../db.js';

export async function insertAuditLog({ tenantId, entityType, entityId, action, actor, amountCents, paymentStatus, gateway, metadata }) {
  await pool.query(
    `INSERT INTO audit_logs(tenant_id, entity_type, entity_id, action, actor, amount_cents, payment_status, gateway, metadata)
     VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9::jsonb)`,
    [tenantId || 1, entityType, entityId ?? null, action, actor ?? null, amountCents ?? null, paymentStatus ?? null, gateway ?? null, JSON.stringify(metadata || {})]
  );
}

export async function listAuditLogs(tenantId, { entityId, entityType, limit } = {}) {
  const conditions = ['tenant_id=$1'];
  const params = [tenantId];
  let i = 2;
  if (entityId) { conditions.push(`entity_id=$${i++}`); params.push(String(entityId)); }
  if (entityType) { conditions.push(`entity_type=$${i++}`); params.push(entityType); }
  const r = await pool.query(
    `SELECT * FROM audit_logs WHERE ${conditions.join(' AND ')} ORDER BY created_at DESC LIMIT $${i}`,
    [...params, limit || 200]
  );
  return r.rows;
}

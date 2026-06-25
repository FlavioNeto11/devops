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

// Coleção paginada para a rota REST genérica GET /v1/audit-logs → { data, total }.
const AUDIT_SORTABLE = new Set(['id', 'entity_type', 'action', 'created_at']);
export async function listAuditLogsPaged(tenantId, { page = 1, pageSize = 50, sort = 'id', dir = 'desc' } = {}) {
  const col = AUDIT_SORTABLE.has(sort) ? sort : 'id';
  const order = String(dir).toLowerCase() === 'asc' ? 'ASC' : 'DESC';
  const limit = Math.min(Math.max(Number(pageSize) || 50, 1), 200);
  const offset = (Math.max(Number(page) || 1, 1) - 1) * limit;
  const totalRes = await pool.query('SELECT count(*)::int n FROM audit_logs WHERE tenant_id=$1', [tenantId]);
  const r = await pool.query(
    `SELECT * FROM audit_logs WHERE tenant_id=$1 ORDER BY ${col} ${order} LIMIT $2 OFFSET $3`,
    [tenantId, limit, offset]
  );
  return { data: r.rows, total: totalRes.rows[0].n };
}

export async function findAuditLog(tenantId, id) {
  const r = await pool.query('SELECT * FROM audit_logs WHERE tenant_id=$1 AND id=$2', [tenantId, Number(id)]);
  return r.rows[0] ?? null;
}

export async function deleteAuditLog(tenantId, id) {
  const r = await pool.query(
    'DELETE FROM audit_logs WHERE tenant_id=$1 AND id=$2 RETURNING id',
    [tenantId, Number(id)]
  );
  return r.rowCount > 0;
}

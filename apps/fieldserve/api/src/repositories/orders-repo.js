// repositories/orders-repo.js — acesso a dados (bloco camadas-rigidas): todo SQL de negócio aqui.
// MULTI-TENANT: toda query é escopada por tenant_id (nunca confiar em id do cliente cross-tenant).
import { pool } from '../db.js';

const ORDER_COLS = 'id,tenant_id,title,status,priority,asset_id,technician_id,external_ref,created_at,updated_at';

export async function listOrders(tenantId, q) {
  const params = [tenantId];
  let sql = `SELECT ${ORDER_COLS} FROM work_orders WHERE tenant_id=$1`;
  if (q) { params.push(`%${q}%`); sql += ` AND title ILIKE $2`; }
  sql += ' ORDER BY id DESC LIMIT 200';
  return (await pool.query(sql, params)).rows;
}
export async function getOrder(tenantId, id) {
  return (await pool.query(`SELECT ${ORDER_COLS} FROM work_orders WHERE tenant_id=$1 AND id=$2`, [tenantId, id])).rows[0] || null;
}
export async function createOrder(tenantId, { title, priority, asset_id, technician_id }) {
  return (await pool.query(
    `INSERT INTO work_orders(tenant_id,title,priority,asset_id,technician_id) VALUES ($1,$2,COALESCE($3,'medium'),$4,$5) RETURNING ${ORDER_COLS}`,
    [tenantId, title, priority || null, asset_id || null, technician_id || null]
  )).rows[0];
}
export async function setStatus(tenantId, id, status, externalRef = null) {
  return (await pool.query(
    `UPDATE work_orders SET status=$3, external_ref=COALESCE($4,external_ref), updated_at=now() WHERE tenant_id=$1 AND id=$2 RETURNING ${ORDER_COLS}`,
    [tenantId, id, status, externalRef]
  )).rows[0] || null;
}
// usados pelo worker (sem tenant no contexto — opera pelo id do job).
export async function getOrderById(id) {
  return (await pool.query(`SELECT ${ORDER_COLS} FROM work_orders WHERE id=$1`, [id])).rows[0] || null;
}
export async function setStatusById(id, status, externalRef = null) {
  await pool.query(`UPDATE work_orders SET status=$2, external_ref=COALESCE($3,external_ref), updated_at=now() WHERE id=$1`, [id, status, externalRef]);
}

export async function listAssets(tenantId) { return (await pool.query('SELECT id,tenant_id,name,kind FROM assets WHERE tenant_id=$1 ORDER BY id', [tenantId])).rows; }
export async function listTechnicians(tenantId) { return (await pool.query('SELECT id,tenant_id,name FROM technicians WHERE tenant_id=$1 ORDER BY id', [tenantId])).rows; }
export async function dashboard(tenantId) {
  const byStatus = (await pool.query(`SELECT status, count(*)::int n FROM work_orders WHERE tenant_id=$1 GROUP BY status`, [tenantId])).rows;
  return { byStatus };
}

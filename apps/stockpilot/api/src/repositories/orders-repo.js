// orders-repo.js — repositório de pedidos de reposição.
// Escopo obrigatório por tenant_id (REQ-STOCKPILOT-0002). `db` injetável p/ testes.
import { pool } from '../db.js';

export async function listOpen(tenant, db = pool) {
  const { rows } = await db.query(`
    SELECT po.id, po.product_id, po.status, po.external_ref, po.created_at,
           p.name AS product_name
    FROM product_orders po
    JOIN products p ON p.id = po.product_id AND p.tenant_id = po.tenant_id
    WHERE po.tenant_id = $1 AND po.status IN ('pending','processing')
    ORDER BY po.created_at DESC
  `, [tenant]);
  return rows;
}

export async function create(productId, tenant, db = pool) {
  const { rows } = await db.query(
    `INSERT INTO product_orders(product_id, tenant_id, status) VALUES ($1, $2, 'pending') RETURNING *`,
    [productId, tenant]
  );
  return rows[0];
}

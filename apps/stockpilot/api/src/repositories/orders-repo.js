// orders-repo.js — repositório de pedidos de reposição.
import { pool } from '../db.js';

export async function listOpen() {
  const { rows } = await pool.query(`
    SELECT po.id, po.product_id, po.status, po.external_ref, po.created_at,
           p.name AS product_name
    FROM product_orders po
    JOIN products p ON p.id = po.product_id
    WHERE po.status IN ('pending','processing')
    ORDER BY po.created_at DESC
  `);
  return rows;
}

export async function create(productId) {
  const { rows } = await pool.query(
    `INSERT INTO product_orders(product_id, status) VALUES ($1, 'pending') RETURNING *`,
    [productId]
  );
  return rows[0];
}

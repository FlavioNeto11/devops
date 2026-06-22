// products-repo.js — repositório de produtos e alertas (estoque + status derivado).
import { pool } from '../db.js';

function computeStatus({ current_stock, min_stock, has_open_order }) {
  if (current_stock < min_stock && !has_open_order) return 'RUPTURA';
  if (current_stock < min_stock * 1.5 && has_open_order) return 'ALERTA';
  return 'OK';
}

export async function listWithStatus() {
  const { rows } = await pool.query(`
    SELECT
      p.id, p.name, p.current_stock, p.min_stock,
      (SELECT MAX(po.created_at) FROM product_orders po WHERE po.product_id = p.id) AS last_order_date,
      EXISTS(
        SELECT 1 FROM product_orders po WHERE po.product_id = p.id AND po.status IN ('pending','processing')
      ) AS has_open_order
    FROM products p
    ORDER BY p.name
  `);
  return rows.map((r) => ({ ...r, status: computeStatus(r) }));
}

export async function findById(id) {
  const { rows } = await pool.query('SELECT * FROM products WHERE id=$1', [id]);
  return rows[0] || null;
}

export async function listAlerts() {
  const { rows } = await pool.query(`
    SELECT DISTINCT ON (p.id)
      p.id, p.name, p.current_stock, p.min_stock,
      EXISTS(
        SELECT 1 FROM product_orders po2 WHERE po2.product_id = p.id AND po2.status IN ('pending','processing')
      ) AS has_open_order,
      po.last_error,
      po.last_attempt_at
    FROM products p
    LEFT JOIN product_orders po ON po.product_id = p.id AND po.last_error IS NOT NULL
    WHERE
      (p.current_stock < p.min_stock AND NOT EXISTS(
        SELECT 1 FROM product_orders po3 WHERE po3.product_id = p.id AND po3.status IN ('pending','processing')
      ))
      OR EXISTS(
        SELECT 1 FROM product_orders po4 WHERE po4.product_id = p.id AND po4.last_error IS NOT NULL
      )
    ORDER BY p.id, po.updated_at DESC NULLS LAST
  `);
  return rows.map((r) => ({
    ...r,
    alert_type: !r.has_open_order && r.current_stock < r.min_stock ? 'RUPTURA' : 'ERROR',
    status: computeStatus(r),
  }));
}

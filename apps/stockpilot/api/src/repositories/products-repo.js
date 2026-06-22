// products-repo.js — repositório de produtos e alertas (estoque + status derivado).
// Toda query é OBRIGATORIAMENTE escopada por tenant_id (REQ-STOCKPILOT-0002): o tenant vem do
// auth-context (header de borda), nunca de id do cliente. `db` é injetável p/ testes.
import { pool } from '../db.js';

function computeStatus({ current_stock, min_stock, has_open_order }) {
  if (current_stock < min_stock && !has_open_order) return 'RUPTURA';
  if (current_stock < min_stock * 1.5 && has_open_order) return 'ALERTA';
  return 'OK';
}

export async function listWithStatus(tenant, db = pool) {
  const { rows } = await db.query(`
    SELECT
      p.id, p.name, p.current_stock, p.min_stock,
      (SELECT MAX(po.created_at) FROM product_orders po WHERE po.product_id = p.id AND po.tenant_id = p.tenant_id) AS last_order_date,
      EXISTS(
        SELECT 1 FROM product_orders po WHERE po.product_id = p.id AND po.tenant_id = p.tenant_id AND po.status IN ('pending','processing')
      ) AS has_open_order
    FROM products p
    WHERE p.tenant_id = $1
    ORDER BY p.name
  `, [tenant]);
  return rows.map((r) => ({ ...r, status: computeStatus(r) }));
}

export async function findById(id, tenant, db = pool) {
  const { rows } = await db.query('SELECT * FROM products WHERE id=$1 AND tenant_id=$2', [id, tenant]);
  return rows[0] || null;
}

// Detalhe canônico de UM produto (tela de detalhe): mesmos campos derivados da lista
// (status OK/ALERTA/RUPTURA, has_open_order, last_order_date) + os timestamps do registro.
// Escopado por tenant_id (REQ-STOCKPILOT-0002): produto inexistente ou de outro tenant → null
// (a rota traduz para 404, nunca vaza dados cross-tenant).
export async function getDetail(id, tenant, db = pool) {
  const { rows } = await db.query(`
    SELECT
      p.id, p.name, p.sku, p.current_stock, p.min_stock, p.created_at, p.updated_at,
      (SELECT MAX(po.created_at) FROM product_orders po WHERE po.product_id = p.id AND po.tenant_id = p.tenant_id) AS last_order_date,
      EXISTS(
        SELECT 1 FROM product_orders po WHERE po.product_id = p.id AND po.tenant_id = p.tenant_id AND po.status IN ('pending','processing')
      ) AS has_open_order
    FROM products p
    WHERE p.id = $1 AND p.tenant_id = $2
  `, [id, tenant]);
  const r = rows[0];
  return r ? { ...r, status: computeStatus(r) } : null;
}

// Alertas (RUPTURA / falha de envio) de UM produto — derivado da mesma regra de listAlerts,
// porém escopado a um único produto/tenant (a tela de detalhe mostra só os alertas dele).
export async function listAlertsForProduct(id, tenant, db = pool) {
  const all = await listAlerts(tenant, db);
  return all.filter((a) => Number(a.id) === Number(id));
}

// REQ-STOCKPILOT-0003 — produtos abaixo do mínimo SEM pedido aberto: candidatos à reposição.
export async function listBelowMinimum(tenant, db = pool) {
  const { rows } = await db.query(`
    SELECT p.id, p.tenant_id, p.name, p.current_stock, p.min_stock
    FROM products p
    WHERE p.tenant_id = $1
      AND p.current_stock < p.min_stock
      AND NOT EXISTS (
        SELECT 1 FROM product_orders po
        WHERE po.product_id = p.id AND po.tenant_id = p.tenant_id AND po.status IN ('pending','processing')
      )
    ORDER BY p.id
  `, [tenant]);
  return rows;
}

// Varredura de sistema (gatilho automático do worker): todos os tenants de uma vez.
export async function listBelowMinimumAllTenants(db = pool) {
  const { rows } = await db.query(`
    SELECT p.id, p.tenant_id, p.name, p.current_stock, p.min_stock
    FROM products p
    WHERE p.current_stock < p.min_stock
      AND NOT EXISTS (
        SELECT 1 FROM product_orders po
        WHERE po.product_id = p.id AND po.tenant_id = p.tenant_id AND po.status IN ('pending','processing')
      )
    ORDER BY p.tenant_id, p.id
  `);
  return rows;
}

export function validate(body, { partial = false } = {}) {
  const errs = [];
  if (!partial || body.name !== undefined) {
    if (!body.name || typeof body.name !== 'string' || !body.name.trim()) errs.push('name obrigatório');
    else if (body.name.trim().length > 120) errs.push('name muito longo (máx. 120)');
  }
  if (body.sku !== undefined && body.sku !== null && body.sku !== '') {
    if (typeof body.sku !== 'string') errs.push('sku deve ser string');
    else if (body.sku.length > 64) errs.push('sku muito longo (máx. 64)');
  }
  if (!partial || body.current_stock !== undefined) {
    const cs = Number(body.current_stock);
    if (body.current_stock === undefined || body.current_stock === null || body.current_stock === '') errs.push('current_stock obrigatório');
    else if (!Number.isInteger(cs) || cs < 0) errs.push('current_stock deve ser inteiro não-negativo');
  }
  if (!partial || body.min_stock !== undefined) {
    const ms = Number(body.min_stock);
    if (body.min_stock === undefined || body.min_stock === null || body.min_stock === '') errs.push('min_stock obrigatório');
    else if (!Number.isInteger(ms) || ms < 0) errs.push('min_stock deve ser inteiro não-negativo');
  }
  return errs;
}

export async function update(id, body, tenant, db = pool) {
  const existing = await findById(id, tenant, db);
  if (!existing) return null;
  const name = body.name !== undefined ? String(body.name).trim() : existing.name;
  const sku = body.sku !== undefined ? (body.sku ? String(body.sku).trim() : null) : (existing.sku || null);
  const current_stock = body.current_stock !== undefined ? Number(body.current_stock) : existing.current_stock;
  const min_stock = body.min_stock !== undefined ? Number(body.min_stock) : existing.min_stock;
  const { rows } = await db.query(
    `UPDATE products SET name=$1, sku=$2, current_stock=$3, min_stock=$4, updated_at=now()
     WHERE id=$5 AND tenant_id=$6 RETURNING *`,
    [name, sku, current_stock, min_stock, id, tenant],
  );
  const updated = rows[0];
  if (!updated) return null;
  const { rows: orows } = await db.query(
    `SELECT 1 FROM product_orders WHERE product_id=$1 AND tenant_id=$2 AND status IN ('pending','processing') LIMIT 1`,
    [id, tenant],
  );
  const has_open_order = orows.length > 0;
  return { ...updated, has_open_order, status: computeStatus({ ...updated, has_open_order }) };
}

export async function listAlerts(tenant, db = pool) {
  const { rows } = await db.query(`
    SELECT DISTINCT ON (p.id)
      p.id, p.name, p.current_stock, p.min_stock,
      EXISTS(
        SELECT 1 FROM product_orders po2 WHERE po2.product_id = p.id AND po2.tenant_id = p.tenant_id AND po2.status IN ('pending','processing')
      ) AS has_open_order,
      po.last_error,
      po.last_attempt_at
    FROM products p
    LEFT JOIN product_orders po ON po.product_id = p.id AND po.tenant_id = p.tenant_id AND po.last_error IS NOT NULL
    WHERE
      p.tenant_id = $1
      AND (
        (p.current_stock < p.min_stock AND NOT EXISTS(
          SELECT 1 FROM product_orders po3 WHERE po3.product_id = p.id AND po3.tenant_id = p.tenant_id AND po3.status IN ('pending','processing')
        ))
        OR EXISTS(
          SELECT 1 FROM product_orders po4 WHERE po4.product_id = p.id AND po4.tenant_id = p.tenant_id AND po4.last_error IS NOT NULL
        )
      )
    ORDER BY p.id, po.updated_at DESC NULLS LAST
  `, [tenant]);
  return rows.map((r) => ({
    ...r,
    alert_type: !r.has_open_order && r.current_stock < r.min_stock ? 'RUPTURA' : 'ERROR',
    status: computeStatus(r),
  }));
}

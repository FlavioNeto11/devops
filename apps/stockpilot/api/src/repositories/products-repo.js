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
      p.id, p.name, p.current_stock, p.min_stock, p.created_at, p.updated_at,
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

// Contagens agregadas de status para o painel (dashboard/summary). Implementa a mesma
// regra de computeStatus sem baixar todas as linhas — O(1) em vez de O(n) no cliente.
export async function countsByStatus(tenant, db = pool) {
  const { rows } = await db.query(`
    SELECT
      COUNT(*) FILTER (WHERE current_stock < min_stock AND NOT has_open_order) AS ruptura,
      COUNT(*) FILTER (WHERE current_stock < min_stock * 1.5 AND has_open_order) AS alerta,
      COUNT(*) AS total
    FROM (
      SELECT
        p.current_stock, p.min_stock,
        EXISTS(
          SELECT 1 FROM product_orders po
          WHERE po.product_id = p.id AND po.tenant_id = p.tenant_id
            AND po.status IN ('pending','processing')
        ) AS has_open_order
      FROM products p WHERE p.tenant_id = $1
    ) sub
  `, [tenant]);
  const r = rows[0] || {};
  const alerta = Number(r.alerta) || 0;
  const ruptura = Number(r.ruptura) || 0;
  const total = Number(r.total) || 0;
  return { ok: total - alerta - ruptura, alerta, ruptura, total };
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

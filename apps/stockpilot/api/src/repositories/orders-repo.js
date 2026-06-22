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

// Detalhe canônico de UM pedido (REQ-STOCKPILOT-0003): cobre TODOS os estados (incl. delivered/failed),
// ao contrário de listOpen que só enxerga pending/processing. Escopado por tenant_id — cross-tenant → null
// (a rota traduz para 404, nunca vaza). Inclui product_name, last_attempt_at, last_error e external_ref:
// os campos autoritativos que a tela de detalhe (linha do tempo / último erro / KPIs) precisa.
export async function getById(orderId, tenant, db = pool) {
  const { rows } = await db.query(`
    SELECT po.id, po.product_id, po.tenant_id, po.status, po.external_ref, po.last_error,
           po.last_attempt_at, po.created_at, po.updated_at,
           p.name AS product_name
    FROM product_orders po
    LEFT JOIN products p ON p.id = po.product_id AND p.tenant_id = po.tenant_id
    WHERE po.id = $1 AND po.tenant_id = $2
  `, [orderId, tenant]);
  return rows[0] || null;
}

export async function create(productId, tenant, db = pool) {
  const { rows } = await db.query(
    `INSERT INTO product_orders(product_id, tenant_id, status) VALUES ($1, $2, 'pending') RETURNING *`,
    [productId, tenant]
  );
  return rows[0];
}

// REQ-STOCKPILOT-0008 — histórico recente de pedidos de UM produto (grounding do assistente de IA).
// RAG-lite sobre o banco: o assistente só raciocina sobre dados REAIS do tenant. Sempre escopado por
// tenant_id (nunca cruza tenant). `days` limita a janela; LIMIT protege o tamanho do contexto.
export async function listRecentByProduct(productId, tenant, days = 90, db = pool) {
  const { rows } = await db.query(
    `SELECT id, status, external_ref, last_error, created_at, last_attempt_at
       FROM product_orders
      WHERE product_id=$1 AND tenant_id=$2 AND created_at >= now() - ($3 * interval '1 day')
      ORDER BY created_at DESC
      LIMIT 50`,
    [productId, tenant, Number(days)]
  );
  return rows;
}

// REQ-STOCKPILOT-0003 — reposição assíncrona. Pedido "aberto" = pending|processing (impede duplicar).
export async function findOpenByProduct(productId, tenant, db = pool) {
  const { rows } = await db.query(
    `SELECT * FROM product_orders WHERE product_id=$1 AND tenant_id=$2 AND status IN ('pending','processing') ORDER BY created_at DESC LIMIT 1`,
    [productId, tenant]
  );
  return rows[0] || null;
}

// Transições do ciclo de vida do pedido (sempre escopadas por tenant_id — nunca cruza tenant).
export async function markProcessing(orderId, tenant, db = pool) {
  const { rows } = await db.query(
    `UPDATE product_orders SET status='processing', last_attempt_at=now(), updated_at=now() WHERE id=$1 AND tenant_id=$2 RETURNING *`,
    [orderId, tenant]
  );
  return rows[0] || null;
}

export async function markDelivered(orderId, tenant, externalRef, db = pool) {
  const { rows } = await db.query(
    `UPDATE product_orders SET status='delivered', external_ref=$3, last_error=NULL, updated_at=now() WHERE id=$1 AND tenant_id=$2 RETURNING *`,
    [orderId, tenant, externalRef]
  );
  return rows[0] || null;
}

export async function markFailed(orderId, tenant, errMsg, db = pool) {
  const { rows } = await db.query(
    `UPDATE product_orders SET status='failed', last_error=$3, last_attempt_at=now(), updated_at=now() WHERE id=$1 AND tenant_id=$2 RETURNING *`,
    [orderId, tenant, errMsg]
  );
  return rows[0] || null;
}

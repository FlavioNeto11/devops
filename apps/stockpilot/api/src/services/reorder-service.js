// services/reorder-service.js — REQ-STOCKPILOT-0003: reposição assíncrona, idempotente e resiliente.
//
// Reusa a infra que JÁ existe: fila transacional (jobs-repo + worker.js, FOR UPDATE SKIP LOCKED,
// retry/backoff/DLQ), o gateway externo (gateways/gateway.js) e o escopo por tenant (auth-context).
// O service é a CAMADA DE DECISÃO: decide se repõe, cria o product_order (pending) e ENFILEIRA o job
// idempotente — a rota fica fina (o enqueue é do service, não da rota).
//
// Idempotência: a deduplicação é por (a) pedido aberto — só existe UM pedido pending/processing por
// produto/tenant; e (b) job_key UNIQUE — reenfileirar o mesmo job_key é no-op (ON CONFLICT DO NOTHING).
// `db`/`jobs`/`lookupProduct`/`dispatch` são injetáveis → testável sem Postgres.
import { pool } from '../db.js';
import * as productsRepo from '../repositories/products-repo.js';
import * as ordersRepo from '../repositories/orders-repo.js';
import * as jobsRepo from '../repositories/jobs-repo.js';

export const REORDER_JOB_TYPE = 'order.dispatch';

// --- decisão pura (testável sem infra) ---
// Repõe quando o estoque caiu abaixo do mínimo E ainda não há pedido aberto (evita duplicar).
export function shouldReorder(product, hasOpenOrder) {
  if (!product) return false;
  return Number(product.current_stock) < Number(product.min_stock) && !hasOpenOrder;
}

// Chave idempotente do job, derivada de tenant+produto+pedido. O id do pedido torna a chave única
// por ciclo de reposição: reenfileirar o MESMO pedido devolve sempre a mesma chave (dedup no UNIQUE).
export function reorderJobKey(tenant, productId, orderId) {
  return `reorder:${tenant}:${productId}:${orderId}`;
}

// Dispara a reposição de UM produto (manual via rota ou automático via scan). Idempotente:
// se já há pedido aberto, NÃO cria outro — reenfileira a mesma chave e devolve o pedido existente.
export async function requestReorder(productId, tenant, deps = {}) {
  const { db = pool, jobs = jobsRepo } = deps;
  const product = await productsRepo.findById(productId, tenant, db);
  if (!product) return { ok: false, reason: 'not_found' };

  const open = await ordersRepo.findOpenByProduct(productId, tenant, db);
  if (open) {
    // já existe pedido aberto → idempotente: mesmo recurso, reenfileira a mesma job_key (no-op se já na fila).
    const jobId = await jobs.enqueue(REORDER_JOB_TYPE, { orderId: open.id, productId, tenant }, reorderJobKey(tenant, productId, open.id));
    return { ok: true, created: false, deduped: true, order: open, jobId };
  }

  const order = await ordersRepo.create(productId, tenant, db);
  const jobId = await jobs.enqueue(REORDER_JOB_TYPE, { orderId: order.id, productId, tenant }, reorderJobKey(tenant, productId, order.id));
  return { ok: true, created: true, deduped: false, order, jobId };
}

// Varredura automática: encontra produtos abaixo do mínimo SEM pedido aberto e dispara reposição
// para cada um. Usada pelo worker como gatilho periódico ("dispara sempre que estoque < mínimo").
export async function autoReorderScan(deps = {}) {
  const { db = pool } = deps;
  const due = await productsRepo.listBelowMinimumAllTenants(db);
  const results = [];
  for (const p of due) results.push(await requestReorder(p.id, p.tenant_id, deps));
  return results;
}

// Processa um job de reposição: marca o pedido em processing, chama o gateway (a porta de saída com
// retry/backoff próprios) e marca delivered. Lança em falha → o worker reenfileira (backoff) ou DLQ.
// `dispatch`/`db`/`lookupProduct` injetáveis → testável sem Postgres nem rede.
export async function processReorderJob(payload, deps) {
  const { orderId, productId, tenant } = payload || {};
  const { dispatch, db = pool, lookupProduct = defaultLookupProduct } = deps;
  await ordersRepo.markProcessing(orderId, tenant, db);
  const product = await lookupProduct(productId, tenant, db);
  // Contexto de auditoria (REQ-STOCKPILOT-0004): a troca com o fornecedor é registrada por tenant/produto/pedido.
  const res = await dispatch({ id: product.id, title: product.name }, { audit: { tenant, productId, orderId }, operation: 'submeter_pedido' });
  await ordersRepo.markDelivered(orderId, tenant, res.externalRef, db);
  return res;
}

async function defaultLookupProduct(productId, tenant, db = pool) {
  const { rows } = await db.query('SELECT id, name FROM products WHERE id=$1 AND tenant_id=$2', [productId, tenant]);
  return rows[0] || { id: productId, name: 'Produto ' + productId };
}

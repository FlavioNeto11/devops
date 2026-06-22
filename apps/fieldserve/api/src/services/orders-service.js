// services/orders-service.js — regra de negócio (bloco camadas-rigidas). Orquestra repositórios +
// fila; idempotência (bloco idempotencia). NÃO faz SQL direto nem chama o externo — delega.
import * as orders from '../repositories/orders-repo.js';
import * as jobs from '../repositories/jobs-repo.js';
import { pool } from '../db.js';
import { M } from '../metrics.js';

export async function createOrder(tenantId, body, idempotencyKey) {
  if (!body || !body.title) { const e = new Error('title obrigatório'); e.status = 400; throw e; }
  if (idempotencyKey) {
    const hit = (await pool.query('SELECT response FROM idempotency_keys WHERE key=$1', [idempotencyKey])).rows[0];
    if (hit) return hit.response; // mesma Idempotency-Key → mesmo recurso, um efeito
  }
  const o = await orders.createOrder(tenantId, body);
  M.ordersTotal.inc({ outcome: 'created' });
  if (idempotencyKey) await pool.query('INSERT INTO idempotency_keys(key,response) VALUES ($1,$2) ON CONFLICT (key) DO NOTHING', [idempotencyKey, JSON.stringify(o)]);
  return o;
}

// Submissão ASSÍNCRONA: marca submitting + enfileira (idempotente por job_key). O worker chama o gateway.
export async function submitOrder(tenantId, id) {
  const o = await orders.getOrder(tenantId, id);
  if (!o) { const e = new Error('ordem não encontrada'); e.status = 404; throw e; }
  if (o.status === 'submitted') return { order: o, enqueued: false, note: 'já submetida' };
  await orders.setStatus(tenantId, id, 'submitting');
  const jobId = await jobs.enqueue('order.submit', { orderId: id, tenantId }, `submit:${id}`);
  M.submitTotal.inc();
  return { order: { ...o, status: 'submitting' }, enqueued: jobId != null, job_id: jobId };
}

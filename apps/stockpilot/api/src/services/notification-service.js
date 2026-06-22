// services/notification-service.js — REQ-STOCKPILOT-0007: notificações multi-canal por evento.
//
// Reusa a infra que JÁ existe: a MESMA fila transacional (jobs-repo + worker.js, retry/backoff/DLQ)
// com um novo job.type 'notify'. O domínio EMITE um evento (stock.rupture / reorder.failed) que vira
// um job; o worker consome e faz o FAN-OUT pelos canais (e-mail/push/whatsapp) com DEGRADAÇÃO
// GRACIOSA — canal sem configuração é PULADO, não derruba os outros, e a operação de negócio NUNCA
// espera/falha pelo envio (a emissão é fail-soft; a entrega roda assíncrona no worker).
//
// `jobs`/`db`/`channels`/`notifications`/`fetchImpl` são injetáveis → testável sem Postgres nem rede.
import { pool } from '../db.js';
import { AppError } from '../lib/app-error.js';
import * as jobsRepo from '../repositories/jobs-repo.js';
import * as notificationsRepo from '../repositories/notifications-repo.js';
import { defaultChannels } from '../lib/notify/channels.js';
import { buildMessage } from '../lib/notify/templates.js';

export const NOTIFY_JOB_TYPE = 'notify';

// Chave idempotente do evento → também é a job_key (dedup no UNIQUE) e o dedupe_key da notificação.
export function notifyJobKey(tipo, tenant, referenciaId) {
  return `notify:${tipo}:${tenant}:${referenciaId}`;
}

// --- specs de evento (puras) ---
// Produto entrou em RUPTURA (abaixo do mínimo, sem pedido aberto).
export function ruptureSpec(product) {
  return {
    tipo: 'ruptura',
    tenant: product.tenant_id,
    usuarioId: null,
    referenciaId: product.id,
    context: { productId: product.id, productName: product.name, currentStock: product.current_stock, minStock: product.min_stock },
  };
}

// Submissão do pedido ao fornecedor falhou/esgotou tentativas (DLQ).
export function reorderFailedSpec({ tenant, orderId, jobId, productName, error }) {
  return {
    tipo: 'falha_pedido',
    tenant,
    usuarioId: null,
    referenciaId: jobId ?? orderId,
    context: { orderId, jobId, productName, error },
  };
}

// --- fan-out PURO (testável sem infra) ---
// Percorre os canais: sem config → 'skipped' (degradação graciosa, não chama o canal); entrega ok →
// 'sent'; erro do canal → 'failed' (não propaga — isola o canal, os demais seguem).
export async function fanOut(message, channels, deps = {}) {
  const results = [];
  for (const ch of channels) {
    if (!ch.isConfigured()) { results.push({ channel: ch.name, status: 'skipped', reason: 'unconfigured' }); continue; }
    try {
      await ch.deliver(message, deps);
      results.push({ channel: ch.name, status: 'sent' });
    } catch (e) {
      results.push({ channel: ch.name, status: 'failed', reason: String(e?.message || e) });
    }
  }
  return results;
}

// Status agregado do registro: 'sent' se ALGUM canal entregou; 'failed' se nenhum entregou e ALGUM
// falhou (worker reenfileira/DLQ); 'skipped' se TODOS pulados (nada a entregar → não reprocessa).
export function aggregateStatus(results) {
  if (results.some((r) => r.status === 'sent')) return 'sent';
  if (results.some((r) => r.status === 'failed')) return 'failed';
  return 'skipped';
}

// EMITE um evento → enfileira um job 'notify' idempotente (não bloqueia o fluxo de negócio).
export async function emitEvent(spec, deps = {}) {
  const { jobs = jobsRepo } = deps;
  const key = notifyJobKey(spec.tipo, spec.tenant, spec.referenciaId);
  const jobId = await jobs.enqueue(NOTIFY_JOB_TYPE, spec, key);
  return { enqueued: jobId != null, jobKey: key, jobId };
}

// Processa um job 'notify' (worker): persiste o registro, faz o fan-out e grava o desfecho por canal.
// Lança SÓ quando nenhum canal entregou E algum falhou → o worker aplica retry/backoff/DLQ.
// Todos pulados (nenhum canal configurado) = degradação graciosa: marca 'skipped' e NÃO lança.
export async function processNotifyJob(spec, deps = {}) {
  const {
    db = pool,
    notifications = notificationsRepo,
    channels = defaultChannels(process.env),
    fetchImpl = fetch,
  } = deps;

  const dedupeKey = notifyJobKey(spec.tipo, spec.tenant, spec.referenciaId);
  const row = await notifications.upsertPending({
    tenant: spec.tenant,
    usuarioId: spec.usuarioId ?? null,
    tipo: spec.tipo,
    referenciaId: spec.referenciaId,
    dedupeKey,
    canais: channels.map((c) => c.name),
  }, db);

  const message = buildMessage(spec);
  const results = await fanOut(message, channels, { fetchImpl });
  const status = aggregateStatus(results);

  await notifications.markResult(row.id, { status, canais: results, tentativas: row.tentativas }, db);

  if (status === 'failed') {
    throw new AppError('todas as entregas de notificação falharam', { code: 'NOTIFY_ALL_FAILED', statusCode: 502, transient: true });
  }
  return { id: row.id, status, results };
}

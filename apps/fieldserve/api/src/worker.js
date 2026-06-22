// worker.js — consumidor da fila transacional (bloco worker-queue-transacional). Mesma imagem da api
// (npm run worker). Claim SKIP LOCKED → processa → gateway externo → atualiza a ordem; retry/backoff/DLQ.
import { migrate } from './db.js';
import { M, startMetricsServer } from './metrics.js';
import * as jobsRepo from './repositories/jobs-repo.js';
import * as ordersRepo from './repositories/orders-repo.js';
import { dispatchOrder } from './gateways/dispatch-gateway.js';

const WORKER_ID = `w-${process.pid}-${Math.floor(process.uptime() * 1000)}`;
let running = true;

async function handle(job) {
  if (job.type !== 'order.submit') throw new Error(`tipo desconhecido: ${job.type}`);
  const { orderId } = job.payload || {};
  const order = (await ordersRepo.getOrderById(orderId)) || { id: orderId, title: `OS ${orderId}`, priority: 'medium' };
  let res;
  try { res = await dispatchOrder(order); M.gatewayCalls.inc({ outcome: 'ok' }); }
  catch (e) { M.gatewayCalls.inc({ outcome: 'error' }); throw e; }
  await ordersRepo.setStatusById(orderId, 'submitted', res.externalRef);
}

async function tick() {
  const job = await jobsRepo.claim(WORKER_ID);
  if (!job) return false;
  const end = M.jobDuration.startTimer();
  try {
    await handle(job);
    await jobsRepo.ack(job.id);
    M.jobsTotal.inc({ status: 'done' });
    console.log(`[worker] job ${job.id} (${job.type}) OK`);
  } catch (e) {
    const outcome = await jobsRepo.fail(job, String(e.message || e));
    M.jobsTotal.inc({ status: outcome });
    if (outcome === 'dlq') { try { await ordersRepo.setStatusById(job.payload?.orderId, 'failed'); } catch { /* */ } }
    console.warn(`[worker] job ${job.id} falhou (tentativa ${job.attempts}/${job.max_attempts}) -> ${outcome}: ${e.message}`);
  } finally { end(); }
  return true;
}

async function loop() {
  let idle = 0;
  while (running) {
    let did = false;
    try { did = await tick(); } catch (e) { console.error('[worker] erro no tick', e.message); }
    if (!did) { idle++; if (idle % 12 === 0) await jobsRepo.requeueStale().catch(() => {}); await new Promise((r) => setTimeout(r, 1000)); }
    else idle = 0;
  }
}

process.on('SIGTERM', () => { running = false; }); // graceful shutdown
(async () => {
  if ((process.env.AUTO_MIGRATE || 'true') === 'true') await migrate().catch(() => {});
  startMetricsServer();
  console.log(`[fieldserve-worker] ${WORKER_ID} iniciado`);
  await loop();
  console.log('[fieldserve-worker] encerrado');
  process.exit(0);
})();

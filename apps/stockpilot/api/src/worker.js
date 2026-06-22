// worker.js — consumidor da fila transacional. Gerado pela Forge.
import { migrate, pool } from './db.js';
import { M, startMetricsServer } from './metrics.js';
import * as jobsRepo from './repositories/jobs-repo.js';
import * as ordersRepo from './repositories/orders-repo.js';
import { REORDER_JOB_TYPE, processReorderJob, autoReorderScan } from './services/reorder-service.js';
import { NOTIFY_JOB_TYPE, processNotifyJob, emitEvent, reorderFailedSpec } from './services/notification-service.js';
import { dispatch } from './gateways/gateway.js';
const WORKER_ID = 'w-' + process.pid; let running = true;
async function handle(job) {
  // REQ-STOCKPILOT-0003 — reposição: o service marca processing → gateway → delivered (ou lança p/ retry/DLQ).
  if (job.type === REORDER_JOB_TYPE) {
    try { await processReorderJob(job.payload || {}, { dispatch }); M.gatewayCalls.inc({ outcome: 'ok' }); }
    catch (e) { M.gatewayCalls.inc({ outcome: 'error' }); throw e; }
    return;
  }
  // REQ-STOCKPILOT-0007 — notificações multi-canal: o service faz o fan-out (degradação graciosa);
  // lança só quando nenhum canal entregou e algum falhou → o worker reenfileira/DLQ como qualquer job.
  if (job.type === NOTIFY_JOB_TYPE) {
    const r = await processNotifyJob(job.payload || {});
    for (const c of r.results) M.notifications.inc({ channel: c.channel, status: c.status });
    return;
  }
  // legado: record.submit
  const id = (job.payload || {}).recordId;
  const rec = (await pool.query('SELECT id,title FROM records WHERE id=$1', [id])).rows[0] || { id, title: 'Record ' + id };
  let res; try { res = await dispatch(rec); M.gatewayCalls.inc({ outcome: 'ok' }); } catch (e) { M.gatewayCalls.inc({ outcome: 'error' }); throw e; }
  await pool.query(`UPDATE records SET status='submitted', external_ref=$2, updated_at=now() WHERE id=$1`, [id, res.externalRef]);
}
async function tick() {
  const job = await jobsRepo.claim(WORKER_ID); if (!job) return false;
  const end = M.jobDuration.startTimer();
  try { await handle(job); await jobsRepo.ack(job.id); M.jobsTotal.inc({ status: 'done' }); console.log('[worker] job ' + job.id + ' OK'); }
  catch (e) { const msg = String(e.message || e); const o = await jobsRepo.fail(job, msg); M.jobsTotal.inc({ status: o });
    if (o === 'dlq') {
      const p = job.payload || {};
      if (job.type === REORDER_JOB_TYPE) {
        try { await ordersRepo.markFailed(p.orderId, p.tenant, msg); } catch {}
        // REQ-STOCKPILOT-0007 — evento reorder.failed: a submissão ao fornecedor esgotou tentativas (DLQ)
        // → emite notificação (fail-soft: nunca derruba o worker). Idempotente pela job_key do evento.
        try {
          const prod = (await pool.query('SELECT name FROM products WHERE id=$1 AND tenant_id=$2', [p.productId, p.tenant])).rows[0];
          await emitEvent(reorderFailedSpec({ tenant: p.tenant, orderId: p.orderId, jobId: job.id, productName: prod?.name, error: msg }));
        } catch (e) { console.warn('[worker] notificação reorder.failed falhou: ' + (e.message || e)); }
      }
      else { try { await pool.query(`UPDATE records SET status='failed', updated_at=now() WHERE id=$1`, [p.recordId]); } catch {} }
    }
    console.warn('[worker] job ' + job.id + ' falhou (' + job.attempts + '/' + job.max_attempts + ') -> ' + o); }
  finally { end(); } return true;
}
// Gatilho automático: varre estoque < mínimo (sem pedido aberto) e dispara reposição (idempotente).
const SCAN_EVERY = Number(process.env.REORDER_SCAN_EVERY) || 15; // ciclos ociosos entre varreduras
async function loop() { let idle = 0; while (running) { let did = false; try { did = await tick(); } catch (e) { console.error(e.message); } if (!did) { idle++; if (idle % 12 === 0) await jobsRepo.requeueStale().catch(() => {}); if (idle % SCAN_EVERY === 0) { try { const r = await autoReorderScan(); if (r.length) console.log('[worker] auto-reposição disparada p/ ' + r.length + ' produto(s)'); } catch (e) { console.warn('[worker] scan reposição falhou: ' + (e.message || e)); } } await new Promise((r) => setTimeout(r, 1000)); } else idle = 0; } }
process.on('SIGTERM', () => { running = false; });
(async () => { if ((process.env.AUTO_MIGRATE || 'true') === 'true') await migrate().catch(() => {}); startMetricsServer(); console.log('[stockpilot-worker] iniciado'); await loop(); process.exit(0); })();
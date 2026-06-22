// worker.js — consumidor da fila transacional. Gerado pela Forge.
import { migrate, pool } from './db.js';
import { M, startMetricsServer } from './metrics.js';
import * as jobsRepo from './repositories/jobs-repo.js';
import * as fiscalSvc from './services/fiscal-service.js';
import { dispatch } from './gateways/gateway.js';
const WORKER_ID = 'w-' + process.pid; let running = true;

async function handleNfeEmit(job) {
  const { invoiceId } = job.payload || {};
  if (!invoiceId) throw new Error('payload sem invoiceId');
  const inv = (await pool.query('SELECT * FROM invoices WHERE id=$1', [invoiceId])).rows[0];
  if (!inv) throw new Error('invoice ' + invoiceId + ' não encontrada');
  const result = fiscalSvc.emitInvoice({ orderId: inv.order_id, cnpj: inv.cnpj, items: inv.items, total: inv.total });
  // auditoria: registra timestamp, xml assinado, resposta SEFAZ, status final (AC6).
  await pool.query(
    `UPDATE invoices SET status=$2, protocol=$3, receipt=$4, xml=$5, sefaz_response=$6::jsonb, submitted_at=COALESCE(submitted_at, now()), final_status_at=now(), updated_at=now() WHERE id=$1`,
    [invoiceId, result.status, result.protocol || null, result.receipt || null, result.xml || null,
     JSON.stringify({ protocol: result.protocol, status: result.status, mode: result.mode, at: new Date().toISOString() })]);
}

async function handle(job) {
  if (job.type === 'nfe.emit') return handleNfeEmit(job);
  const id = (job.payload || {}).recordId;
  const rec = (await pool.query('SELECT id,title FROM records WHERE id=$1', [id])).rows[0] || { id, title: 'Record ' + id };
  let res; try { res = await dispatch(rec); M.gatewayCalls.inc({ outcome: 'ok' }); } catch (e) { M.gatewayCalls.inc({ outcome: 'error' }); throw e; }
  await pool.query(`UPDATE records SET status='submitted', external_ref=$2, updated_at=now() WHERE id=$1`, [id, res.externalRef]);
}
async function tick() {
  const job = await jobsRepo.claim(WORKER_ID); if (!job) return false;
  const end = M.jobDuration.startTimer();
  try { await handle(job); await jobsRepo.ack(job.id); M.jobsTotal.inc({ status: 'done' }); console.log('[worker] job ' + job.id + ' OK'); }
  catch (e) { const o = await jobsRepo.fail(job, String(e.message || e)); M.jobsTotal.inc({ status: o });
    if (o === 'dlq') {
      if (job.type === 'nfe.emit') {
        const { invoiceId } = job.payload || {};
        if (invoiceId) { try { await pool.query(`UPDATE invoices SET status='dlq', final_status_at=now(), updated_at=now() WHERE id=$1`, [invoiceId]); } catch {} }
      } else {
        try { await pool.query(`UPDATE records SET status='failed', updated_at=now() WHERE id=$1`, [(job.payload||{}).recordId]); } catch {}
      }
    }
    console.warn('[worker] job ' + job.id + ' falhou (' + job.attempts + '/' + job.max_attempts + ') -> ' + o); }
  finally { end(); } return true;
}
async function loop() { let idle = 0; while (running) { let did = false; try { did = await tick(); } catch (e) { console.error(e.message); } if (!did) { idle++; if (idle % 12 === 0) await jobsRepo.requeueStale().catch(() => {}); await new Promise((r) => setTimeout(r, 1000)); } else idle = 0; } }
process.on('SIGTERM', () => { running = false; });
(async () => { if ((process.env.AUTO_MIGRATE || 'true') === 'true') await migrate().catch(() => {}); startMetricsServer(); console.log('[shopdesk-worker] iniciado'); await loop(); process.exit(0); })();
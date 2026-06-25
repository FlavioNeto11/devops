// worker.js — consumidor BullMQ (bloco redis-bullmq) + fila transacional (jobs.js) para NF submit.
import { Worker } from 'bullmq';
import { pool, migrate } from './db.js';
import { M, startMetricsServer } from './metrics.js';
import { sendObrigacaoAlerta, sendTaskAssigned, sendTaskDueAlert } from './lib/mailer.js';
import { sendPushAlert, sendTaskPush } from './lib/push.js';
import { claimJobs, ackJob, failJob, heartbeatJob, requeueStaleJobs } from './jobs.js';
import { createSefazGateway } from './gateways/sefaz-gateway.js';
const url = process.env.REDIS_URL || '';
function conn() { const u = new URL(url); return { host: u.hostname, port: Number(u.port) || 6379 }; }

async function handleSubmit(job) {
  const id = job.data.recordId;
  await pool.query("UPDATE records SET status='submitted', updated_at=now() WHERE id=$1", [id]);
}

async function handleDocumentProcess(job) {
  const { documentId } = job.data;
  await pool.query("UPDATE documents SET status='aprovado', updated_at=now() WHERE id=$1", [documentId]);
}

async function handleObligationAlert(job) {
  const { obligationId, nivel } = job.data;
  const { rows } = await pool.query('SELECT * FROM fiscal_obligations WHERE id=$1', [obligationId]);
  if (!rows[0]) return;
  const ob = rows[0];
  const canaisSent = ['dashboard'];
  // Email: degrada graciosamente sem SMTP_HOST
  const mailResult = await sendObrigacaoAlerta({
    to: `tenant-${ob.tenant_id}@contaviva360`,
    tipo: ob.tipo,
    dataVencimento: ob.data_vencimento,
    nivel,
  }).catch(() => null);
  if (mailResult) canaisSent.push('email');
  // Push: degrada graciosamente sem VAPID keys ou subscription
  const pushResult = await sendPushAlert(null, { tipo: ob.tipo, nivel, dataVencimento: ob.data_vencimento }).catch(() => null);
  if (pushResult) canaisSent.push('push');
  await pool.query(
    'INSERT INTO obligation_alerts(tenant_id,obligation_id,nivel,canais) VALUES ($1,$2,$3,$4)',
    [ob.tenant_id, obligationId, nivel, canaisSent]
  ).catch(() => {});
}

async function handleFinancialReport(job) {
  const { tenantId, start, end, format } = job.data;
  const { rows } = await pool.query(
    `SELECT tipo, categoria, centro_custo, status, SUM(valor) AS total, COUNT(*) AS count
     FROM income_expenses WHERE tenant_id=$1 AND data >= $2 AND data <= $3
     GROUP BY tipo, categoria, centro_custo, status ORDER BY tipo, categoria`,
    [tenantId || 1, start, end]
  );
  let totalReceitas = 0, totalDespesas = 0;
  for (const r of rows) {
    if (r.tipo === 'receita') totalReceitas += Number(r.total);
    else totalDespesas += Number(r.total);
  }
  console.log(`[worker] financial-report gerado: tenant=${tenantId} periodo=${start}/${end} receitas=${totalReceitas} despesas=${totalDespesas}`);
}

async function handleTaskNotification(job) {
  const { taskId, eventType, assignee, title, dueAt, nivel, tenantId } = job.data;
  const canaisSent = ['dashboard'];
  const to = assignee || `tenant-${tenantId || 1}@contaviva360`;
  // Email: degrada graciosamente sem SMTP_HOST
  const mailFn = eventType === 'deadline_alert' ? sendTaskDueAlert : sendTaskAssigned;
  const mailResult = await mailFn({ to, taskTitle: title, assignee, dueAt, nivel }).catch(() => null);
  if (mailResult) canaisSent.push('email');
  // Push: degrada graciosamente sem VAPID keys
  const pushResult = await sendTaskPush(null, { taskTitle: title, eventType, nivel }).catch(() => null);
  if (pushResult) canaisSent.push('push');
  await pool.query(
    'INSERT INTO task_notifications(tenant_id,task_id,event_type,canais) VALUES ($1,$2,$3,$4)',
    [tenantId || 1, taskId, eventType, canaisSent]
  ).catch(() => {});
}

// ── Fila transacional: NF submit (worker-queue-transacional) ─────────────────
// Dois workers concorrentes nunca pegam o mesmo job: SELECT FOR UPDATE SKIP LOCKED.
const WORKER_ID = `nf-worker-${process.pid}`;
const NF_POLL_MS = 3000;
let nfWorkerRunning = false;
let nfWorkerStopped = false;

async function handleNfSubmitJob(job) {
  const { nfId, tenantId, nfData } = job.payload;
  const { rows: nfRows } = await pool.query('SELECT * FROM notas_fiscais WHERE id=$1', [nfId]);
  if (!nfRows[0]) throw Object.assign(new Error(`NF ${nfId} não encontrada`), { retryable: false });
  const nf = nfRows[0];
  if (nf.status === 'emitida' || nf.status === 'cancelada') return; // já processada

  const gateway = createSefazGateway();
  const { emitente, cliente, itensResolvidos, impostos, observacoes } = nfData || {};

  let emitenteDados = emitente || { razao_social: process.env.EMITENTE_RAZAO_SOCIAL || 'CONTAVIVA 360 LTDA', cnpj: process.env.EMITENTE_CNPJ || '00000000000000' };
  let clienteDados = cliente;
  if (!clienteDados) {
    const { rows: cr } = await pool.query('SELECT * FROM nf_clients WHERE id=$1', [nf.nf_client_id]);
    clienteDados = cr[0] || { razao_social: nf.destinatario_razao_social, cnpj: nf.destinatario_cnpj, tipo_cliente: 'empresa' };
  }
  let itens = itensResolvidos;
  if (!itens) {
    const { rows: ir } = await pool.query('SELECT * FROM nf_items WHERE nf_id=$1 ORDER BY id', [nfId]);
    itens = ir;
  }
  let impostosCalc = impostos;
  if (!impostosCalc) {
    impostosCalc = itens.reduce((acc, it) => ({ icms: acc.icms + Number(it.icms), iss: acc.iss + Number(it.iss), pis: acc.pis + Number(it.pis), cofins: acc.cofins + Number(it.cofins) }), { icms: 0, iss: 0, pis: 0, cofins: 0 });
  }

  const result = await gateway.submit({
    nf: { ...nf, numero_nf: nf.numero_nf || String(nfId).padStart(9, '0'), serie: nf.serie || '001' },
    emitente: emitenteDados, destinatario: clienteDados,
    itens, totalNF: Number(nf.total_nf), impostos: impostosCalc, observacoes: observacoes || nf.observacoes || '',
  });

  await pool.query(
    `UPDATE notas_fiscais SET status='emitida', chave_acesso=$1, xml_content=$2, pdf_content=$3,
       data_autorizacao_sefaz=$4, sefaz_protocolo=$5, sefaz_motivo=$6, updated_at=now() WHERE id=$7`,
    [result.chave, result.xmlAutorizado, result.pdfBase64, result.dataAutorizacao, result.protocolo, result.xMotivo, nfId]
  );
  console.log(`[nf-worker] nf_submit job ${job.id} OK: chave=${result.chave}`);
}

async function runNfWorkerLoop() {
  if (nfWorkerRunning || nfWorkerStopped) return;
  nfWorkerRunning = true;
  try {
    await requeueStaleJobs();
    const jobs = await claimJobs(WORKER_ID, 5);
    const nfJobs = jobs.filter(j => j.type === 'nf_submit');
    for (const job of nfJobs) {
      const hb = setInterval(() => heartbeatJob(job.id, WORKER_ID).catch(() => {}), 60000);
      try {
        await handleNfSubmitJob(job);
        await ackJob(job.id, WORKER_ID, { done: true });
        M.jobsTotal.inc({ status: 'done' });
      } catch (err) {
        clearInterval(hb);
        const retryable = err.retryable !== false;
        await failJob(job.id, WORKER_ID, err, { retryable });
        M.jobsTotal.inc({ status: 'failed' });
        console.warn(`[nf-worker] job ${job.id} falhou (retryable=${retryable}): ${err.message}`);
        continue;
      }
      clearInterval(hb);
    }
  } catch (e) {
    console.warn('[nf-worker] erro no loop:', e.message);
  } finally {
    nfWorkerRunning = false;
    if (!nfWorkerStopped) setTimeout(runNfWorkerLoop, NF_POLL_MS);
  }
}

(async () => {
  if ((process.env.AUTO_MIGRATE || 'true') === 'true') await migrate().catch(() => {});
  startMetricsServer();

  // Inicia o loop transacional de NF submit independentemente do Redis
  setTimeout(runNfWorkerLoop, 1000);

  if (!url) {
    console.warn('[worker] sem REDIS_URL — filas BullMQ inativas (fila transacional NF ativa)');
    process.on('SIGTERM', () => { nfWorkerStopped = true; process.exit(0); });
    return;
  }

  const submitWorker = new Worker('records-submit', async (job) => {
    await handleSubmit(job);
    M.jobsTotal.inc({ status: 'done' });
    console.log('[worker] submit job ' + job.id + ' OK');
  }, { connection: conn() });

  submitWorker.on('failed', (job, err) => {
    M.jobsTotal.inc({ status: 'failed' });
    if (job && job.attemptsMade >= (job.opts.attempts || 1)) {
      pool.query("UPDATE records SET status='failed', updated_at=now() WHERE id=$1", [job.data.recordId]).catch(() => {});
    }
    console.warn('[worker] submit falhou: ' + (err && err.message));
  });

  const docWorker = new Worker('document-process', async (job) => {
    await handleDocumentProcess(job);
    M.jobsTotal.inc({ status: 'done' });
    console.log('[worker] document-process job ' + job.id + ' OK');
  }, { connection: conn() });

  docWorker.on('failed', (job, err) => {
    M.jobsTotal.inc({ status: 'failed' });
    console.warn('[worker] document-process falhou: ' + (err && err.message));
  });

  const obligationWorker = new Worker('obligations-alert', async (job) => {
    await handleObligationAlert(job);
    M.jobsTotal.inc({ status: 'done' });
    console.log('[worker] obligations-alert job ' + job.id + ' OK');
  }, { connection: conn() });

  obligationWorker.on('failed', (job, err) => {
    M.jobsTotal.inc({ status: 'failed' });
    console.warn('[worker] obligations-alert falhou: ' + (err && err.message));
  });

  const taskWorker = new Worker('tasks-notification', async (job) => {
    await handleTaskNotification(job);
    M.jobsTotal.inc({ status: 'done' });
    console.log('[worker] tasks-notification job ' + job.id + ' OK');
  }, { connection: conn() });

  taskWorker.on('failed', (job, err) => {
    M.jobsTotal.inc({ status: 'failed' });
    console.warn('[worker] tasks-notification falhou: ' + (err && err.message));
  });

  const reportWorker = new Worker('financial-report', async (job) => {
    await handleFinancialReport(job);
    M.jobsTotal.inc({ status: 'done' });
    console.log('[worker] financial-report job ' + job.id + ' OK');
  }, { connection: conn() });

  reportWorker.on('failed', (job, err) => {
    M.jobsTotal.inc({ status: 'failed' });
    console.warn('[worker] financial-report falhou: ' + (err && err.message));
  });

  console.log('[contaviva-360-worker] BullMQ iniciado (queues: records-submit, document-process, obligations-alert, tasks-notification, financial-report) + fila transacional NF');
  process.on('SIGTERM', async () => {
    nfWorkerStopped = true;
    await Promise.all([submitWorker.close(), docWorker.close(), obligationWorker.close(), taskWorker.close(), reportWorker.close()]);
    process.exit(0);
  });
})();

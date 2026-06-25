// worker.js — consumidor BullMQ (bloco redis-bullmq). Processa submit, document-process, obligations-alert, tasks-notification, financial-report.
import { Worker } from 'bullmq';
import { pool, migrate } from './db.js';
import { M, startMetricsServer } from './metrics.js';
import { sendObrigacaoAlerta, sendTaskAssigned, sendTaskDueAlert } from './lib/mailer.js';
import { sendPushAlert, sendTaskPush } from './lib/push.js';
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

(async () => {
  if ((process.env.AUTO_MIGRATE || 'true') === 'true') await migrate().catch(() => {});
  startMetricsServer();
  if (!url) { console.warn('[worker] sem REDIS_URL — fila inativa'); return; }

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

  console.log('[contaviva-360-worker] BullMQ iniciado (queues: records-submit, document-process, obligations-alert, tasks-notification, financial-report)');
  process.on('SIGTERM', async () => {
    await Promise.all([submitWorker.close(), docWorker.close(), obligationWorker.close(), taskWorker.close(), reportWorker.close()]);
    process.exit(0);
  });
})();

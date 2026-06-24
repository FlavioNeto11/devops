// worker.js — consumidor BullMQ (bloco redis-bullmq). Processa records-submit + report-generate.
import { Worker } from 'bullmq';
import { pool, migrate } from './db.js';
import { M, startMetricsServer } from './metrics.js';
import * as notesRepo from './repositories/evolution-notes.repository.js';
import * as patientsRepo from './repositories/patients.repository.js';

const url = process.env.REDIS_URL || '';
function conn() { const u = new URL(url); return { host: u.hostname, port: Number(u.port) || 6379 }; }

async function handleSubmit(job) {
  const id = job.data.recordId;
  await pool.query("UPDATE records SET status='submitted', updated_at=now() WHERE id=$1", [id]);
}

async function handleReport(job) {
  const { reportId, patientId, tenantId, filters } = job.data;
  const patient = await patientsRepo.getPatient(tenantId, patientId);
  const notes = await notesRepo.getNotesForReport(tenantId, patientId, filters || {});
  const reportData = {
    patient: patient ? { id: patient.id, name: patient.name, birth_date: patient.birth_date, record_number: patient.record_number } : { id: patientId },
    filters: filters || {},
    total_notes: notes.length,
    generated_at: new Date().toISOString(),
    notes: notes.map((n) => ({ id: n.id, note_date: n.note_date, professional: n.professional, note_type: n.note_type, text_content: n.text_content, test_name: n.test_name, test_result: n.test_result, recommendation: n.recommendation })),
  };
  await notesRepo.updateReport(reportId, reportData, 'ready');
}

(async () => {
  if ((process.env.AUTO_MIGRATE || 'true') === 'true') await migrate().catch(() => {});
  startMetricsServer();
  if (!url) { console.warn('[worker] sem REDIS_URL — fila inativa (degradação graciosa)'); return; }

  const wSubmit = new Worker('records-submit', async (job) => { await handleSubmit(job); M.jobsTotal.inc({ status: 'done' }); console.log('[worker] submit ' + job.id + ' OK'); }, { connection: conn() });
  const wReport = new Worker('report-generate', async (job) => { await handleReport(job); M.jobsTotal.inc({ status: 'done' }); console.log('[worker] report ' + job.id + ' OK'); }, { connection: conn() });

  const onFail = (name) => (job, err) => { M.jobsTotal.inc({ status: 'failed' }); console.warn('[worker] ' + name + ' falhou: ' + (err && err.message)); };
  wSubmit.on('failed', (job, err) => { onFail('submit')(job, err); if (job && job.attemptsMade >= (job.opts.attempts || 1)) pool.query("UPDATE records SET status='failed', updated_at=now() WHERE id=$1", [job.data.recordId]).catch(() => {}); });
  wReport.on('failed', (job, err) => { onFail('report')(job, err); if (job && job.attemptsMade >= (job.opts.attempts || 1)) pool.query("UPDATE patient_reports SET status='failed', updated_at=now() WHERE id=$1", [job.data.reportId]).catch(() => {}); });

  console.log('[neuroevolui-worker] BullMQ iniciado (records-submit + report-generate)');
  process.on('SIGTERM', async () => { await Promise.all([wSubmit.close(), wReport.close()]); process.exit(0); });
})();

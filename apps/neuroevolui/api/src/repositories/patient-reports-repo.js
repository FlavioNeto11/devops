// repositories/patient-reports-repo.js — rastreamento de relatórios de evolução por paciente.
import { pool } from '../db.js';

export async function createPatientReport({ tenantId, patientId, filters, createdBy }) {
  const r = await pool.query(
    `INSERT INTO patient_reports(tenant_id, patient_id, filters, created_by)
     VALUES($1,$2,$3::jsonb,$4) RETURNING *`,
    [tenantId, patientId, JSON.stringify(filters || {}), createdBy || 'system']
  );
  return r.rows[0];
}

export async function findPatientReport(tenantId, reportId) {
  const r = await pool.query(
    'SELECT * FROM patient_reports WHERE tenant_id=$1 AND id=$2',
    [tenantId, Number(reportId)]
  );
  return r.rows[0] ?? null;
}

export async function listPatientReports(tenantId, patientId) {
  const r = await pool.query(
    `SELECT id, tenant_id, patient_id, status, filters, error_message, created_by, created_at, completed_at
     FROM patient_reports WHERE tenant_id=$1 AND patient_id=$2 ORDER BY created_at DESC LIMIT 50`,
    [tenantId, patientId]
  );
  return r.rows;
}

export async function markPatientReportProcessing(reportId) {
  await pool.query(
    `UPDATE patient_reports SET status='processing' WHERE id=$1`,
    [Number(reportId)]
  );
}

export async function markPatientReportCompleted(reportId, reportData) {
  await pool.query(
    `UPDATE patient_reports SET status='completed', report_data=$2::jsonb, completed_at=now() WHERE id=$1`,
    [Number(reportId), JSON.stringify(reportData)]
  );
}

export async function markPatientReportFailed(reportId, errorMessage) {
  await pool.query(
    `UPDATE patient_reports SET status='failed', error_message=$2, completed_at=now() WHERE id=$1`,
    [Number(reportId), errorMessage]
  );
}

// Coleção paginada (todos os pacientes do tenant) para a rota REST genérica
// GET /v1/patient-reports → { data, total }. Filtro opcional por patient_id.
const PR_SORTABLE = new Set(['id', 'status', 'created_at', 'completed_at', 'patient_id']);
// Status canônicos do relatório (o domínio/UI chama 'failed' de 'erro').
export const PR_STATUSES = ['queued', 'processing', 'completed', 'failed'];
export async function listPatientReportsPaged(tenantId, { page = 1, pageSize = 50, sort = 'id', dir = 'desc', patientId, status } = {}) {
  const col = PR_SORTABLE.has(sort) ? sort : 'id';
  const order = String(dir).toLowerCase() === 'asc' ? 'ASC' : 'DESC';
  const limit = Math.min(Math.max(Number(pageSize) || 50, 1), 200);
  const offset = (Math.max(Number(page) || 1, 1) - 1) * limit;
  // base (tenant [+ paciente]) — usada nas CONTAGENS agregadas: os KPIs refletem todo o tenant,
  // independentes do filtro de status e da página atual.
  const baseCond = ['tenant_id=$1'];
  const baseParams = [tenantId];
  let bi = 2;
  if (patientId) { baseCond.push(`patient_id=$${bi++}`); baseParams.push(String(patientId)); }
  // condição da LISTAGEM = base + filtro de status server-side (só valores canônicos).
  const cond = [...baseCond];
  const params = [...baseParams];
  let i = bi;
  const st = PR_STATUSES.includes(status) ? status : undefined;
  if (st) { cond.push(`status=$${i++}`); params.push(st); }
  const totalRes = await pool.query(`SELECT count(*)::int n FROM patient_reports WHERE ${cond.join(' AND ')}`, params);
  const r = await pool.query(
    `SELECT id, tenant_id, patient_id, status, filters, error_message, created_by, created_at, completed_at
     FROM patient_reports WHERE ${cond.join(' AND ')} ORDER BY ${col} ${order} LIMIT $${i} OFFSET $${i + 1}`,
    [...params, limit, offset]
  );
  // summary por status sobre a BASE (não sobre o filtro/página) → KPIs do tenant inteiro.
  const sumRes = await pool.query(`SELECT status, count(*)::int n FROM patient_reports WHERE ${baseCond.join(' AND ')} GROUP BY status`, baseParams);
  const summary = { queued: 0, processing: 0, completed: 0, failed: 0, total: 0 };
  for (const row of sumRes.rows) { if (summary[row.status] !== undefined) summary[row.status] = row.n; summary.total += row.n; }
  return { data: r.rows, total: totalRes.rows[0].n, summary };
}

export async function deletePatientReport(tenantId, id) {
  const r = await pool.query('DELETE FROM patient_reports WHERE tenant_id=$1 AND id=$2 RETURNING id', [tenantId, Number(id)]);
  return r.rowCount > 0;
}

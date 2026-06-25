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

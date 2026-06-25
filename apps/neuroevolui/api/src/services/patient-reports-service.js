// services/patient-reports-service.js — regra de negócio para geração de relatórios consolidados.
import {
  createPatientReport, findPatientReport, listPatientReports,
  markPatientReportProcessing, markPatientReportCompleted, markPatientReportFailed,
} from '../repositories/patient-reports-repo.js';
import { listEvolutionNotes } from '../repositories/evolution-notes-repo.js';

export async function requestPatientReport({ tenantId, patientId, filters, createdBy }) {
  return createPatientReport({ tenantId, patientId, filters, createdBy });
}

export async function getPatientReport(tenantId, reportId) {
  return findPatientReport(tenantId, reportId);
}

export async function getPatientReports(tenantId, patientId) {
  return listPatientReports(tenantId, patientId);
}

export async function processPatientReport({ reportId, tenantId, patientId, filters }) {
  await markPatientReportProcessing(reportId);
  try {
    const notes = await listEvolutionNotes(tenantId, patientId, filters || {});
    const reportData = {
      patient_id: patientId,
      generated_at: new Date().toISOString(),
      filters: filters || {},
      total_notes: notes.length,
      timeline: notes.map((n) => ({
        id: n.id,
        type: n.type,
        note_date: n.note_date,
        professional_id: n.professional_id,
        text: n.text,
        structured_fields: n.structured_fields,
        status: n.status,
      })),
    };
    await markPatientReportCompleted(reportId, reportData);
    return reportData;
  } catch (err) {
    await markPatientReportFailed(reportId, err.message);
    throw err;
  }
}

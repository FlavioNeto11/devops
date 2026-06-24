// services/evolution-notes.service.js — regras de negócio de notas de evolução.
import * as notesRepo from '../repositories/evolution-notes.repository.js';
import * as patientsRepo from '../repositories/patients.repository.js';
import { hasRedis, enqueueReport } from '../queue.js';

function err(msg, code) { return Object.assign(new Error(msg), { statusCode: code }); }

export async function createNote(patientId, tenantId, body, user) {
  if (!body.professional) throw err('professional obrigatório', 400);
  const patient = await patientsRepo.getPatient(tenantId, patientId);
  if (!patient) throw err('paciente não encontrado', 404);
  const note = await notesRepo.insertNote(tenantId, patientId, body, user);
  if (Array.isArray(body.attachments) && body.attachments.length > 0) {
    await notesRepo.addAttachments(note.id, body.attachments);
  }
  return note;
}

export async function listNotes(patientId, tenantId, query, role) {
  const patient = await patientsRepo.getPatient(tenantId, patientId);
  if (!patient) throw err('paciente não encontrado', 404);
  const includeDeleted = query.include_deleted === 'true' && (role === 'admin' || role === 'manager');
  const notes = await notesRepo.listNotes(tenantId, patientId, { includeDeleted });
  return notes;
}

export async function editNote(noteId, patientId, tenantId, body, user) {
  const patient = await patientsRepo.getPatient(tenantId, patientId);
  if (!patient) throw err('paciente não encontrado', 404);
  const updated = await notesRepo.updateNote(noteId, tenantId, body, user);
  if (!updated) throw err('nota não encontrada', 404);
  return updated;
}

export async function deleteNote(noteId, patientId, tenantId, user, role) {
  if (role !== 'admin' && role !== 'manager') throw err('acesso negado (precisa de admin/manager)', 403);
  const deleted = await notesRepo.softDeleteNote(noteId, tenantId, user);
  if (!deleted) throw err('nota não encontrada', 404);
  return { deleted: true };
}

export async function getNoteVersions(noteId, patientId, tenantId) {
  const versions = await notesRepo.getNoteVersions(noteId, tenantId);
  if (versions === null) throw err('nota não encontrada', 404);
  return versions;
}

export async function generateReport(patientId, tenantId, filters, user) {
  const patient = await patientsRepo.getPatient(tenantId, patientId);
  if (!patient) throw err('paciente não encontrado', 404);
  if (!hasRedis()) {
    // fallback inline — sem Redis, gera direto
    const notes = await notesRepo.getNotesForReport(tenantId, patientId, filters);
    return { status: 'ready', ...buildReportData(patient, notes, filters) };
  }
  const report = await notesRepo.createReport(tenantId, patientId, filters, 'pending');
  await enqueueReport(report.id, patientId, tenantId, filters);
  return { id: report.id, status: 'pending', enqueued: true };
}

export async function getReportStatus(reportId, tenantId) {
  const report = await notesRepo.getReport(tenantId, reportId);
  if (!report) throw err('relatório não encontrado', 404);
  return report;
}

function buildReportData(patient, notes, filters) {
  return {
    patient: { id: patient.id, name: patient.name, birth_date: patient.birth_date, record_number: patient.record_number },
    filters: filters || {},
    total_notes: notes.length,
    generated_at: new Date().toISOString(),
    notes: notes.map((n) => ({
      id: n.id, note_date: n.note_date, professional: n.professional,
      note_type: n.note_type, text_content: n.text_content,
      test_name: n.test_name, test_result: n.test_result, recommendation: n.recommendation,
      created_at: n.created_at,
    })),
  };
}

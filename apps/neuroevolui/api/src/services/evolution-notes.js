// services/evolution-notes.js — regras de negócio de notas de evolução (camadas-rigidas).
import * as repo from '../repositories/evolution-notes.js';

export async function createEvolutionNote(tenantId, patientId, data, author) {
  const noteData = { ...data };
  if (!noteData.professional) noteData.professional = author;
  return repo.createNote(tenantId, patientId, noteData);
}

export async function listEvolutionNotes(tenantId, patientId, filters) {
  return repo.listNotes(tenantId, patientId, filters);
}

export async function listAllNotes(tenantId, patientId) {
  return repo.listNotesAll(tenantId, patientId);
}

export async function getNote(tenantId, patientId, noteId) {
  return repo.findNote(tenantId, patientId, noteId);
}

export async function updateEvolutionNote(tenantId, patientId, noteId, data, editedBy) {
  const existing = await repo.findNote(tenantId, patientId, noteId);
  if (!existing) return null;
  await repo.insertVersion(noteId, editedBy, {
    note_text: existing.note_text,
    note_type: existing.note_type,
    attachments: existing.attachments,
    test_name: existing.test_name,
    test_result: existing.test_result,
    recommendation: existing.recommendation,
  });
  return repo.updateNote(noteId, data);
}

export async function softDeleteEvolutionNote(tenantId, patientId, noteId) {
  const existing = await repo.findNote(tenantId, patientId, noteId);
  if (!existing) return false;
  await repo.softDeleteNote(tenantId, patientId, noteId);
  return true;
}

export async function getNoteHistory(noteId) {
  return repo.listVersions(noteId);
}

export async function getReportData(tenantId, patientId, filters) {
  return repo.getReportNotes(tenantId, patientId, filters);
}

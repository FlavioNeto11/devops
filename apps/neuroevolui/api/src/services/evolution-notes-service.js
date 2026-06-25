// services/evolution-notes-service.js — regra de negócio para notas de evolução (camadas-rigidas).
import {
  createEvolutionNote, findEvolutionNote, updateEvolutionNote, softDeleteEvolutionNote,
  listEvolutionNotes, listEvolutionNotesHistory, listEvolutionNotesPaged as _listEvolutionNotesPaged,
  createNoteVersion, maxNoteVersion, listNoteVersions,
  createNoteAttachment, listNoteAttachments,
} from '../repositories/evolution-notes-repo.js';
import { enqueue } from '../queue.js';

// Lista paginada da coleção de topo (/v1/evolution-notes) — exposta pelo SERVICE para que o server.js
// não importe o repositório direto (camadas-rigidas: route -> service -> repository).
export function listEvolutionNotesPaged(tenantId, opts) {
  return _listEvolutionNotesPaged(tenantId, opts);
}

export async function addEvolutionNote({ tenantId, patientId, type, noteDate, professionalId, text, structuredFields, attachments, createdBy }) {
  const note = await createEvolutionNote({ tenantId, patientId, type, noteDate, professionalId, text, structuredFields, createdBy });
  const savedAttachments = [];
  if (Array.isArray(attachments) && attachments.length > 0) {
    for (const att of attachments) {
      const saved = await createNoteAttachment({
        noteId: note.id,
        filename: att.filename,
        mimeType: att.mime_type,
        sizeBytes: att.size_bytes,
        contentBase64: att.content_base64,
      });
      savedAttachments.push(saved);
    }
  }

  // Dispara notificação note.added (fire-and-forget, nunca bloqueia)
  enqueue('notifications', `notif-note.added-${note.id}`, {
    eventType: 'note.added',
    tenantId,
    recipientId: patientId,
    patientId,
    professionalId,
  }).catch(() => {});

  return { ...note, attachments: savedAttachments };
}

export async function getEvolutionNotes(tenantId, patientId, filters = {}) {
  return listEvolutionNotes(tenantId, patientId, filters);
}

export async function getEvolutionNotesHistory(tenantId, patientId) {
  return listEvolutionNotesHistory(tenantId, patientId);
}

export async function getEvolutionNote(tenantId, noteId) {
  const note = await findEvolutionNote(tenantId, noteId);
  if (!note) return null;
  const [versions, attachments] = await Promise.all([
    listNoteVersions(noteId),
    listNoteAttachments(noteId),
  ]);
  return { ...note, versions, attachments };
}

export async function editEvolutionNote(tenantId, noteId, { type, text, structuredFields, editedBy }) {
  const existing = await findEvolutionNote(tenantId, noteId);
  if (!existing) return null;
  if (existing.deleted_at) {
    const err = new Error('Nota foi removida');
    err.statusCode = 410;
    throw err;
  }
  const currentVersion = await maxNoteVersion(noteId);
  await createNoteVersion({
    noteId,
    versionNumber: currentVersion + 1,
    editedBy: editedBy || 'system',
    snapshot: {
      type: existing.type,
      text: existing.text,
      structured_fields: existing.structured_fields,
      note_date: existing.note_date,
      professional_id: existing.professional_id,
    },
  });
  return updateEvolutionNote(noteId, { type, text, structuredFields });
}

export async function removeEvolutionNote(tenantId, noteId) {
  const note = await findEvolutionNote(tenantId, noteId);
  if (!note) return false;
  if (note.deleted_at) return true;
  await softDeleteEvolutionNote(tenantId, noteId);
  return true;
}

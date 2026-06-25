// repositories/evolution-notes-repo.js — SQL de notas de evolução (camadas-rigidas).
import { pool } from '../db.js';

export async function createEvolutionNote({ tenantId, patientId, type, noteDate, professionalId, text, structuredFields, createdBy }) {
  const r = await pool.query(
    `INSERT INTO evolution_notes(tenant_id, patient_id, type, note_date, professional_id, text, structured_fields, created_by)
     VALUES($1,$2,$3,$4,$5,$6,$7::jsonb,$8) RETURNING *`,
    [tenantId, patientId, type || 'session', noteDate || new Date().toISOString(), professionalId || 'system', text || '', JSON.stringify(structuredFields || {}), createdBy || 'system']
  );
  return r.rows[0];
}

export async function listEvolutionNotes(tenantId, patientId, { dateFrom, dateTo, type, professionalId } = {}) {
  const conditions = ['tenant_id=$1', 'patient_id=$2', 'deleted_at IS NULL'];
  const params = [tenantId, patientId];
  let i = 3;
  if (dateFrom) { conditions.push(`note_date >= $${i++}`); params.push(dateFrom); }
  if (dateTo)   { conditions.push(`note_date <= $${i++}`); params.push(dateTo); }
  if (type)     { conditions.push(`type=$${i++}`); params.push(type); }
  if (professionalId) { conditions.push(`professional_id=$${i++}`); params.push(professionalId); }
  const r = await pool.query(
    `SELECT * FROM evolution_notes WHERE ${conditions.join(' AND ')} ORDER BY note_date DESC LIMIT 200`,
    params
  );
  return r.rows;
}

export async function listEvolutionNotesHistory(tenantId, patientId) {
  const r = await pool.query(
    `SELECT * FROM evolution_notes WHERE tenant_id=$1 AND patient_id=$2 ORDER BY note_date DESC LIMIT 500`,
    [tenantId, patientId]
  );
  return r.rows;
}

export async function findEvolutionNote(tenantId, noteId) {
  const r = await pool.query(
    'SELECT * FROM evolution_notes WHERE tenant_id=$1 AND id=$2',
    [tenantId, Number(noteId)]
  );
  return r.rows[0] ?? null;
}

export async function updateEvolutionNote(noteId, { type, text, structuredFields }) {
  const r = await pool.query(
    `UPDATE evolution_notes
     SET type=COALESCE($2, type),
         text=COALESCE($3, text),
         structured_fields=COALESCE($4::jsonb, structured_fields),
         updated_at=now()
     WHERE id=$1 RETURNING *`,
    [Number(noteId), type ?? null, text ?? null, structuredFields !== undefined ? JSON.stringify(structuredFields) : null]
  );
  return r.rows[0] ?? null;
}

export async function softDeleteEvolutionNote(tenantId, noteId) {
  await pool.query(
    'UPDATE evolution_notes SET deleted_at=now(), updated_at=now() WHERE tenant_id=$1 AND id=$2 AND deleted_at IS NULL',
    [tenantId, Number(noteId)]
  );
}

export async function createNoteVersion({ noteId, versionNumber, editedBy, snapshot }) {
  await pool.query(
    `INSERT INTO evolution_note_versions(note_id, version_number, edited_by, snapshot)
     VALUES($1,$2,$3,$4::jsonb)`,
    [Number(noteId), versionNumber, editedBy || 'system', JSON.stringify(snapshot || {})]
  );
}

export async function listNoteVersions(noteId) {
  const r = await pool.query(
    'SELECT * FROM evolution_note_versions WHERE note_id=$1 ORDER BY version_number DESC',
    [Number(noteId)]
  );
  return r.rows;
}

export async function maxNoteVersion(noteId) {
  const r = await pool.query(
    'SELECT COALESCE(MAX(version_number), 0)::int AS max_version FROM evolution_note_versions WHERE note_id=$1',
    [Number(noteId)]
  );
  return r.rows[0].max_version;
}

export async function createNoteAttachment({ noteId, filename, mimeType, sizeBytes, contentBase64 }) {
  const r = await pool.query(
    `INSERT INTO evolution_note_attachments(note_id, filename, mime_type, size_bytes, content_base64)
     VALUES($1,$2,$3,$4,$5)
     RETURNING id, note_id, filename, mime_type, size_bytes, created_at`,
    [Number(noteId), filename, mimeType, sizeBytes || 0, contentBase64 || null]
  );
  return r.rows[0];
}

export async function listNoteAttachments(noteId) {
  const r = await pool.query(
    'SELECT id, note_id, filename, mime_type, size_bytes, created_at FROM evolution_note_attachments WHERE note_id=$1 ORDER BY created_at ASC',
    [Number(noteId)]
  );
  return r.rows;
}

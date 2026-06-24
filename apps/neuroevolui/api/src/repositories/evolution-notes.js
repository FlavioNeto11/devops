// repositories/evolution-notes.js — SQL de evolution_notes e versioning.
import { pool } from '../db.js';

export async function listNotes(tenantId, patientId, { from, to, noteType, professional } = {}) {
  const params = [tenantId, patientId];
  let sql = 'SELECT * FROM evolution_notes WHERE tenant_id=$1 AND patient_id=$2 AND deleted_at IS NULL';
  if (from) { params.push(from); sql += ` AND created_at >= $${params.length}`; }
  if (to) { params.push(to); sql += ` AND created_at <= $${params.length}`; }
  if (noteType) { params.push(noteType); sql += ` AND note_type = $${params.length}`; }
  if (professional) { params.push(professional); sql += ` AND professional = $${params.length}`; }
  sql += ' ORDER BY created_at DESC';
  const { rows } = await pool.query(sql, params);
  return rows;
}

export async function listNotesAll(tenantId, patientId) {
  const { rows } = await pool.query(
    'SELECT * FROM evolution_notes WHERE tenant_id=$1 AND patient_id=$2 ORDER BY created_at DESC',
    [tenantId, patientId]
  );
  return rows;
}

export async function createNote(tenantId, patientId, data) {
  const { professional, note_type, note_text, attachments, test_name, test_result, recommendation } = data;
  const { rows } = await pool.query(
    `INSERT INTO evolution_notes
       (tenant_id, patient_id, professional, note_type, note_text, attachments, test_name, test_result, recommendation)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9) RETURNING *`,
    [
      tenantId, patientId,
      professional || 'sistema',
      note_type || 'consulta',
      note_text || '',
      JSON.stringify(attachments || []),
      test_name || null,
      test_result || null,
      recommendation || null,
    ]
  );
  return rows[0];
}

export async function findNote(tenantId, patientId, noteId) {
  const { rows } = await pool.query(
    'SELECT * FROM evolution_notes WHERE tenant_id=$1 AND patient_id=$2 AND id=$3 AND deleted_at IS NULL',
    [tenantId, patientId, noteId]
  );
  return rows[0] || null;
}

export async function updateNote(noteId, data) {
  const { note_text, attachments, test_name, test_result, recommendation, note_type } = data;
  const { rows } = await pool.query(
    `UPDATE evolution_notes
     SET note_text=COALESCE($2,note_text),
         attachments=COALESCE($3,attachments),
         test_name=COALESCE($4,test_name),
         test_result=COALESCE($5,test_result),
         recommendation=COALESCE($6,recommendation),
         note_type=COALESCE($7,note_type),
         updated_at=now()
     WHERE id=$1 RETURNING *`,
    [
      noteId,
      note_text !== undefined ? note_text : null,
      attachments !== undefined ? JSON.stringify(attachments) : null,
      test_name !== undefined ? test_name : null,
      test_result !== undefined ? test_result : null,
      recommendation !== undefined ? recommendation : null,
      note_type !== undefined ? note_type : null,
    ]
  );
  return rows[0];
}

export async function softDeleteNote(tenantId, patientId, noteId) {
  await pool.query(
    'UPDATE evolution_notes SET deleted_at=now(), updated_at=now() WHERE tenant_id=$1 AND patient_id=$2 AND id=$3',
    [tenantId, patientId, noteId]
  );
}

export async function insertVersion(noteId, editedBy, content) {
  await pool.query(
    'INSERT INTO evolution_note_versions(note_id, edited_by, content) VALUES ($1,$2,$3)',
    [noteId, editedBy, JSON.stringify(content)]
  );
}

export async function listVersions(noteId) {
  const { rows } = await pool.query(
    'SELECT * FROM evolution_note_versions WHERE note_id=$1 ORDER BY edited_at DESC',
    [noteId]
  );
  return rows;
}

export async function getReportNotes(tenantId, patientId, { from, to, noteType, professional } = {}) {
  const params = [tenantId, patientId];
  let sql = `SELECT en.*, p.name AS patient_name
    FROM evolution_notes en
    JOIN patients p ON p.id = en.patient_id
    WHERE en.tenant_id=$1 AND en.patient_id=$2 AND en.deleted_at IS NULL`;
  if (from) { params.push(from); sql += ` AND en.created_at >= $${params.length}`; }
  if (to) { params.push(to); sql += ` AND en.created_at <= $${params.length}`; }
  if (noteType) { params.push(noteType); sql += ` AND en.note_type = $${params.length}`; }
  if (professional) { params.push(professional); sql += ` AND en.professional = $${params.length}`; }
  sql += ' ORDER BY en.created_at ASC';
  const { rows } = await pool.query(sql, params);
  return rows;
}

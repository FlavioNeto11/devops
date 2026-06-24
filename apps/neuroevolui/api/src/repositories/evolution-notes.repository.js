// repositories/evolution-notes.repository.js — SQL de notas de evolução, versões, anexos e relatórios.
import { pool } from '../db.js';

export async function insertNote(tenantId, patientId, data, createdBy) {
  const { note_date, professional, note_type, text_content, test_name, test_result, recommendation } = data;
  const note = (await pool.query(
    `INSERT INTO evolution_notes
       (patient_id, tenant_id, note_date, professional, note_type, text_content, test_name, test_result, recommendation, created_by)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10) RETURNING *`,
    [patientId, tenantId, note_date || new Date().toISOString().slice(0, 10),
      professional, note_type || 'consulta', text_content || null,
      test_name || null, test_result || null, recommendation || null, createdBy]
  )).rows[0];
  // versão inicial (V1)
  await pool.query(
    'INSERT INTO evolution_note_versions(note_id, version_number, editor, snapshot) VALUES ($1,1,$2,$3)',
    [note.id, createdBy, JSON.stringify({ text_content: note.text_content, test_name: note.test_name, test_result: note.test_result, recommendation: note.recommendation, professional: note.professional, note_type: note.note_type })]
  );
  return note;
}

export async function listNotes(tenantId, patientId, { includeDeleted = false } = {}) {
  const sql = includeDeleted
    ? 'SELECT * FROM evolution_notes WHERE tenant_id=$1 AND patient_id=$2 ORDER BY note_date DESC, id DESC'
    : 'SELECT * FROM evolution_notes WHERE tenant_id=$1 AND patient_id=$2 AND deleted_at IS NULL ORDER BY note_date DESC, id DESC';
  return (await pool.query(sql, [tenantId, patientId])).rows;
}

export async function getNote(tenantId, noteId) {
  return (await pool.query('SELECT * FROM evolution_notes WHERE tenant_id=$1 AND id=$2', [tenantId, noteId])).rows[0] || null;
}

export async function updateNote(noteId, tenantId, data, editor) {
  const { text_content, test_name, test_result, recommendation, professional, note_type, note_date } = data;
  const updated = (await pool.query(
    `UPDATE evolution_notes
     SET text_content=COALESCE($2,text_content), test_name=COALESCE($3,test_name),
         test_result=COALESCE($4,test_result), recommendation=COALESCE($5,recommendation),
         professional=COALESCE($6,professional), note_type=COALESCE($7,note_type),
         note_date=COALESCE($8,note_date), updated_at=now()
     WHERE id=$1 AND tenant_id=$9 AND deleted_at IS NULL RETURNING *`,
    [noteId, text_content || null, test_name || null, test_result || null, recommendation || null,
      professional || null, note_type || null, note_date || null, tenantId]
  )).rows[0];
  if (!updated) return null;
  const maxV = (await pool.query('SELECT COALESCE(MAX(version_number),0) n FROM evolution_note_versions WHERE note_id=$1', [noteId])).rows[0].n;
  await pool.query(
    'INSERT INTO evolution_note_versions(note_id, version_number, editor, snapshot) VALUES ($1,$2,$3,$4)',
    [noteId, maxV + 1, editor, JSON.stringify({ text_content: updated.text_content, test_name: updated.test_name, test_result: updated.test_result, recommendation: updated.recommendation, professional: updated.professional, note_type: updated.note_type })]
  );
  return updated;
}

export async function softDeleteNote(noteId, tenantId, deletedBy) {
  const r = await pool.query(
    'UPDATE evolution_notes SET deleted_at=now(), deleted_by=$3, updated_at=now() WHERE id=$1 AND tenant_id=$2 AND deleted_at IS NULL RETURNING id',
    [noteId, tenantId, deletedBy]
  );
  return r.rowCount > 0;
}

export async function getNoteVersions(noteId, tenantId) {
  const exists = (await pool.query('SELECT id FROM evolution_notes WHERE id=$1 AND tenant_id=$2', [noteId, tenantId])).rows[0];
  if (!exists) return null;
  return (await pool.query('SELECT * FROM evolution_note_versions WHERE note_id=$1 ORDER BY version_number DESC', [noteId])).rows;
}

export async function addAttachments(noteId, attachments) {
  const results = [];
  for (const a of attachments) {
    const row = (await pool.query(
      'INSERT INTO evolution_note_attachments(note_id,filename,mimetype,size_bytes) VALUES ($1,$2,$3,$4) RETURNING *',
      [noteId, a.filename, a.mimetype || 'application/octet-stream', a.size_bytes || 0]
    )).rows[0];
    results.push(row);
  }
  return results;
}

export async function listAttachments(noteId) {
  return (await pool.query('SELECT * FROM evolution_note_attachments WHERE note_id=$1 ORDER BY id', [noteId])).rows;
}

export async function getNotesForReport(tenantId, patientId, filters) {
  const { from, to, note_type, professional } = filters || {};
  const params = [tenantId, patientId];
  let sql = 'SELECT * FROM evolution_notes WHERE tenant_id=$1 AND patient_id=$2 AND deleted_at IS NULL';
  if (from) { params.push(from); sql += ` AND note_date >= $${params.length}`; }
  if (to) { params.push(to); sql += ` AND note_date <= $${params.length}`; }
  if (note_type) { params.push(note_type); sql += ` AND note_type = $${params.length}`; }
  if (professional) { params.push('%' + professional + '%'); sql += ` AND professional ILIKE $${params.length}`; }
  sql += ' ORDER BY note_date ASC, id ASC';
  return (await pool.query(sql, params)).rows;
}

export async function createReport(tenantId, patientId, filters, status) {
  return (await pool.query(
    "INSERT INTO patient_reports(tenant_id,patient_id,filters,status) VALUES ($1,$2,$3,$4) RETURNING *",
    [tenantId, patientId, JSON.stringify(filters || {}), status || 'pending']
  )).rows[0];
}

export async function getReport(tenantId, reportId) {
  return (await pool.query('SELECT * FROM patient_reports WHERE tenant_id=$1 AND id=$2', [tenantId, reportId])).rows[0] || null;
}

export async function updateReport(reportId, reportData, status) {
  return (await pool.query(
    'UPDATE patient_reports SET report_data=$2, status=$3, updated_at=now() WHERE id=$1 RETURNING *',
    [reportId, JSON.stringify(reportData), status]
  )).rows[0];
}

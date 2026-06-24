// routes/patients.routes.js — rotas de pacientes e notas de evolução.
// Sem imports de pg/knex/fetch externo — delega para services e repositories.
import * as patientsRepo from '../repositories/patients.repository.js';
import * as notesRepo from '../repositories/evolution-notes.repository.js';
import * as notesService from '../services/evolution-notes.service.js';

function sendError(reply, err) {
  reply.code(err.statusCode || 500).send({ error: { message: err.message } });
}

export async function patientsPlugin(app) {
  // Criar paciente
  app.post('/v1/patients', async (req, reply) => {
    const b = req.body || {};
    if (!b.name) { reply.code(400); return { error: { message: 'name obrigatório' } }; }
    const p = await patientsRepo.createPatient(req.tenantId, b);
    reply.code(201); return p;
  });

  // Listar pacientes
  app.get('/v1/patients', async (req) => ({ data: await patientsRepo.listPatients(req.tenantId) }));

  // Obter paciente
  app.get('/v1/patients/:id', async (req, reply) => {
    const p = await patientsRepo.getPatient(req.tenantId, Number(req.params.id));
    if (!p) { reply.code(404); return { error: { message: 'paciente não encontrado' } }; }
    return p;
  });

  // AC1 — POST /v1/patients/:id/evolution-notes
  app.post('/v1/patients/:id/evolution-notes', async (req, reply) => {
    try {
      const note = await notesService.createNote(Number(req.params.id), req.tenantId, req.body || {}, req.user || 'system');
      reply.code(201); return note;
    } catch (e) { sendError(reply, e); }
  });

  // Listar notas (inclui deleted se include_deleted=true e admin/manager)
  app.get('/v1/patients/:id/evolution-notes', async (req, reply) => {
    try {
      const notes = await notesService.listNotes(Number(req.params.id), req.tenantId, req.query || {}, req.role);
      return { data: notes };
    } catch (e) { sendError(reply, e); }
  });

  // AC3 — PATCH /v1/patients/:id/evolution-notes/:noteId (cria versão ao editar)
  app.patch('/v1/patients/:id/evolution-notes/:noteId', async (req, reply) => {
    try {
      const note = await notesService.editNote(Number(req.params.noteId), Number(req.params.id), req.tenantId, req.body || {}, req.user || 'system');
      return note;
    } catch (e) { sendError(reply, e); }
  });

  // AC3 — GET /v1/patients/:id/evolution-notes/:noteId/versions
  app.get('/v1/patients/:id/evolution-notes/:noteId/versions', async (req, reply) => {
    try {
      const versions = await notesService.getNoteVersions(Number(req.params.noteId), Number(req.params.id), req.tenantId);
      return { data: versions };
    } catch (e) { sendError(reply, e); }
  });

  // AC6 — DELETE /v1/patients/:id/evolution-notes/:noteId (soft-delete)
  app.delete('/v1/patients/:id/evolution-notes/:noteId', async (req, reply) => {
    try {
      const result = await notesService.deleteNote(Number(req.params.noteId), Number(req.params.id), req.tenantId, req.user || 'system', req.role);
      return result;
    } catch (e) { sendError(reply, e); }
  });

  // AC2 — GET /v1/patients/:id/evolution-notes/:noteId/attachments
  app.get('/v1/patients/:id/evolution-notes/:noteId/attachments', async (req, reply) => {
    const note = await notesRepo.getNote(req.tenantId, Number(req.params.noteId));
    if (!note) { reply.code(404); return { error: { message: 'nota não encontrada' } }; }
    return { data: await notesRepo.listAttachments(Number(req.params.noteId)) };
  });

  // AC4+AC5 — GET /v1/patients/:id/reports (filtrável por from, to, type, professional)
  app.get('/v1/patients/:id/reports', async (req, reply) => {
    try {
      const q = req.query || {};
      const filters = {};
      if (q.from) filters.from = q.from;
      if (q.to) filters.to = q.to;
      if (q.type) filters.note_type = q.type;
      if (q.professional) filters.professional = q.professional;
      const result = await notesService.generateReport(Number(req.params.id), req.tenantId, filters, req.user || 'system');
      if (result.status === 'pending') reply.code(202);
      return result;
    } catch (e) { sendError(reply, e); }
  });

  // GET /v1/patients/:id/reports/:reportId — status do relatório assíncrono
  app.get('/v1/patients/:id/reports/:reportId', async (req, reply) => {
    try {
      return await notesService.getReportStatus(Number(req.params.reportId), req.tenantId);
    } catch (e) { sendError(reply, e); }
  });
}

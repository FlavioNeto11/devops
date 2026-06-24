// server.js — API Fastify (gymops-style). Servida em /neuroevolui/api (stripPrefix). Gerado pela Forge.
import Fastify from 'fastify';
import { pool, migrate, seed } from './db.js';
import { M, startMetricsServer } from './metrics.js';
import { authContext, requireRole } from './rbac.js';
import { enqueueSubmit, enqueueReportGenerate, queueCounts } from './queue.js';
import * as recordsRepo from './repositories/records.js';
import * as patientsRepo from './repositories/patients.js';
import * as notesService from './services/evolution-notes.js';

const app = Fastify({ logger: false });

app.addHook('onRequest', async (req) => {
  const ctx = authContext(req);
  req.tenantId = ctx.tenantId;
  req.role = ctx.role;
  req.user = ctx.user;
});

app.get('/', async () => ({ app: 'neuroevolui', service: 'api', ok: true }));
app.get('/health', async () => { await pool.query('SELECT 1'); return { status: 'ok', db: 'connected' }; });
app.get('/v1/health/queue', async () => ({ status: 'ok', queue: await queueCounts() }));

// --- records ---
app.get('/v1/records', async (req) => ({ data: await recordsRepo.listRecords(req.tenantId) }));
app.post('/v1/records', async (req, reply) => {
  const b = req.body || {};
  if (!b.title) { reply.code(400); return { error: { message: 'title obrigatório' } }; }
  const r = await recordsRepo.createRecord(req.tenantId, b.title);
  M.recordsTotal.inc({ outcome: 'created' });
  reply.code(201);
  return r;
});
app.get('/v1/records/:id', async (req, reply) => {
  const r = await recordsRepo.findRecord(req.tenantId, Number(req.params.id));
  if (!r) { reply.code(404); return { error: { message: 'não encontrado' } }; }
  return r;
});
app.delete('/v1/records/:id', { preHandler: requireRole('admin') }, async (req) => {
  await recordsRepo.deleteRecord(req.tenantId, Number(req.params.id));
  return { deleted: true };
});
app.post('/v1/records/:id/submit', async (req, reply) => {
  const id = Number(req.params.id);
  const r = await recordsRepo.findRecord(req.tenantId, id);
  if (!r) { reply.code(404); return { error: { message: 'não encontrado' } }; }
  await recordsRepo.updateRecordStatus(id, 'submitting');
  const e = await enqueueSubmit(id);
  reply.code(202);
  return { id, status: 'submitting', enqueued: !e.inline };
});

// --- patients (REQ-NEUROEVOLUI-0004) ---
app.get('/v1/patients', async (req) => ({ data: await patientsRepo.listPatients(req.tenantId) }));
app.post('/v1/patients', async (req, reply) => {
  const b = req.body || {};
  if (!b.name) { reply.code(400); return { error: { message: 'name obrigatório' } }; }
  const p = await patientsRepo.createPatient(req.tenantId, b);
  reply.code(201);
  return p;
});
app.get('/v1/patients/:id', async (req, reply) => {
  const p = await patientsRepo.findPatient(req.tenantId, Number(req.params.id));
  if (!p) { reply.code(404); return { error: { message: 'paciente não encontrado' } }; }
  return p;
});

// --- evolution notes (REQ-NEUROEVOLUI-0004) ---
app.post('/v1/patients/:id/evolution-notes', async (req, reply) => {
  const patientId = Number(req.params.id);
  const patient = await patientsRepo.findPatient(req.tenantId, patientId);
  if (!patient) { reply.code(404); return { error: { message: 'paciente não encontrado' } }; }
  const note = await notesService.createEvolutionNote(req.tenantId, patientId, req.body || {}, req.user);
  reply.code(201);
  return note;
});
app.get('/v1/patients/:id/evolution-notes', async (req) => {
  const { from, to, note_type, professional, include_deleted } = req.query || {};
  const patientId = Number(req.params.id);
  if (include_deleted === 'true' && (req.role === 'admin' || req.role === 'manager')) {
    return { data: await notesService.listAllNotes(req.tenantId, patientId) };
  }
  return { data: await notesService.listEvolutionNotes(req.tenantId, patientId, { from, to, noteType: note_type, professional }) };
});
app.get('/v1/patients/:id/evolution-notes/:noteId', async (req, reply) => {
  const note = await notesService.getNote(req.tenantId, Number(req.params.id), Number(req.params.noteId));
  if (!note) { reply.code(404); return { error: { message: 'nota não encontrada' } }; }
  return note;
});
app.patch('/v1/patients/:id/evolution-notes/:noteId', async (req, reply) => {
  const updated = await notesService.updateEvolutionNote(
    req.tenantId, Number(req.params.id), Number(req.params.noteId), req.body || {}, req.user
  );
  if (!updated) { reply.code(404); return { error: { message: 'nota não encontrada' } }; }
  return updated;
});
app.delete('/v1/patients/:id/evolution-notes/:noteId', async (req, reply) => {
  const ok = await notesService.softDeleteEvolutionNote(req.tenantId, Number(req.params.id), Number(req.params.noteId));
  if (!ok) { reply.code(404); return { error: { message: 'nota não encontrada' } }; }
  return { deleted: true };
});
app.get('/v1/patients/:id/evolution-notes/:noteId/versions', async (req) => {
  return { data: await notesService.getNoteHistory(Number(req.params.noteId)) };
});

// --- reports (REQ-NEUROEVOLUI-0004) ---
app.get('/v1/patients/:id/reports', async (req, reply) => {
  const { from, to, note_type, professional } = req.query || {};
  const patientId = Number(req.params.id);
  const patient = await patientsRepo.findPatient(req.tenantId, patientId);
  if (!patient) { reply.code(404); return { error: { message: 'paciente não encontrado' } }; }
  const notes = await notesService.getReportData(req.tenantId, patientId, { from, to, noteType: note_type, professional });
  const enqRes = await enqueueReportGenerate(req.tenantId, patientId, { from, to, note_type, professional });
  return {
    patient,
    period: { from: from || null, to: to || null },
    filters: { note_type: note_type || null, professional: professional || null },
    notes,
    total: notes.length,
    generated_at: new Date().toISOString(),
    pdf_queued: !enqRes.inline,
  };
});

const PORT = Number(process.env.PORT) || 8080;
(async () => {
  if ((process.env.AUTO_MIGRATE || 'true') === 'true') await migrate();
  if ((process.env.AUTO_SEED || 'true') === 'true') await seed();
  startMetricsServer();
  await app.listen({ port: PORT, host: '0.0.0.0' });
  console.log('[neuroevolui-api] :' + PORT);
})().catch((e) => { console.error('boot falhou', e); process.exit(1); });

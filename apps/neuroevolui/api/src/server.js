// server.js — API Fastify (gymops-style). Servida em /neuroevolui/api (stripPrefix). Gerado pela Forge.
import Fastify from 'fastify';
import { pool, migrate, seed } from './db.js';
import { M, startMetricsServer } from './metrics.js';
import { authContext, requireRole } from './rbac.js';
import { enqueueSubmit, queueCounts, enqueue } from './queue.js';
import { findAsyncJob, upsertAsyncJob } from './repositories/async-jobs-repo.js';
import { listRecords, createRecord, findRecord, deleteRecord, updateRecordStatus } from './repositories/records-repo.js';
import { findIdempotency, saveIdempotency } from './repositories/idempotency-repo.js';
import { listConsultations } from './repositories/consultations-repo.js';
import { scheduleConsultation } from './services/consultations-service.js';
import { processWebhook } from './services/payments-service.js';
import { getRevenueDashboard } from './services/dashboard-service.js';
import { getAuditTrail } from './services/audit-service.js';
import { addEvolutionNote, getEvolutionNotes, getEvolutionNotesHistory, getEvolutionNote, editEvolutionNote, removeEvolutionNote } from './services/evolution-notes-service.js';
import { requestPatientReport, getPatientReport, getPatientReports } from './services/patient-reports-service.js';
import { runAssistantTurn } from './ai/graph.js';
import { aiEnabled } from './llm.js';

const app = Fastify({ logger: false });

app.addContentTypeParser('application/json', { parseAs: 'string' }, (_req, body, done) => {
  _req.rawBody = body;
  try { done(null, JSON.parse(body || '{}')); } catch (e) { done(e); }
});

// Aceita multipart/form-data (fail-soft: arquivos inválidos não derrubam a rota).
// O buffer raw é armazenado para extração inline no handler /v1/assistant.
app.addContentTypeParser('multipart/form-data', { parseAs: 'buffer' }, (_req, body, done) => {
  done(null, { __multipart: true, raw: body, boundary: (_req.headers['content-type'] || '').match(/boundary=([^\s;]+)/)?.[1] || '' });
});

app.addHook('onRequest', async (req) => { const ctx = authContext(req); req.tenantId = ctx.tenantId; req.role = ctx.role; req.actor = ctx.user; });

app.get('/', async () => ({ app: 'neuroevolui', service: 'api', ok: true }));
app.get('/health', async () => { await pool.query('SELECT 1'); return { status: 'ok', db: 'connected' }; });
app.get('/v1/health/queue', async () => ({ status: 'ok', queue: await queueCounts() }));

// Records
app.get('/v1/records', async (req) => ({ data: await listRecords(req.tenantId) }));

app.post('/v1/records', { preHandler: requireRole('professional') }, async (req, reply) => {
  const b = req.body || {};
  if (!b.title) { reply.code(400); return { error: { message: 'title obrigatório' } }; }
  const ikey = req.headers['idempotency-key'];
  if (ikey) {
    const cached = await findIdempotency('create_record', ikey);
    if (cached) return cached;
  }
  const r = await createRecord(req.tenantId, b.title, req.actor);
  M.recordsTotal.inc({ outcome: 'created' });
  if (ikey) await saveIdempotency({ operation: 'create_record', idempotencyKey: ikey, entityType: 'record', entityId: String(r.id), response: r }).catch(() => {});
  reply.code(201);
  return r;
});

app.get('/v1/records/:id', async (req, reply) => {
  const r = await findRecord(req.tenantId, req.params.id);
  if (!r) { reply.code(404); return { error: { message: 'não encontrado' } }; }
  return r;
});

app.delete('/v1/records/:id', { preHandler: requireRole('clinic_manager') }, async (req) => {
  await deleteRecord(req.tenantId, req.params.id);
  return { deleted: true };
});

app.post('/v1/records/:id/submit', async (req, reply) => {
  const id = Number(req.params.id);
  const r = await findRecord(req.tenantId, id);
  if (!r) { reply.code(404); return { error: { message: 'não encontrado' } }; }
  await updateRecordStatus(id, 'submitting');
  const e = await enqueueSubmit(id);
  reply.code(202);
  return { id, status: 'submitting', enqueued: !e.inline };
});

// Consultations
app.post('/v1/consultations/schedule', { preHandler: requireRole('professional') }, async (req, reply) => {
  const b = req.body || {};
  for (const f of ['patient_id', 'professional_id', 'scheduled_at', 'amount_cents']) {
    if (!b[f]) { reply.code(400); return { error: { message: `${f} obrigatório` } }; }
  }
  const scheduledAt = new Date(b.scheduled_at);
  const durationMin = Number(b.duration_minutes) || 60;
  const scheduledEndAt = new Date(scheduledAt.getTime() + durationMin * 60000);
  try {
    const result = await scheduleConsultation({
      tenantId: req.tenantId,
      patientId: b.patient_id,
      professionalId: b.professional_id,
      scheduledAt: scheduledAt.toISOString(),
      scheduledEndAt: scheduledEndAt.toISOString(),
      amountCents: Number(b.amount_cents),
      currency: b.currency || 'BRL',
      idempotencyKey: req.headers['idempotency-key'],
      actor: req.actor,
      paymentMethodToken: b.payment_method_token,
    });
    reply.code(result.fromCache ? 200 : 201);
    return result;
  } catch (e) {
    if (e.code === 'SCHEDULE_CONFLICT') { reply.code(409); return { error: { message: e.message, code: 'SCHEDULE_CONFLICT' } }; }
    throw e;
  }
});

app.get('/v1/consultations', async (req) => ({ data: await listConsultations(req.tenantId) }));

// Webhook
app.post('/v1/payments/webhook', async (req, reply) => {
  const b = req.body || {};
  const eventId = b.event_id || req.headers['x-event-id'] || `evt_${Date.now()}`;
  const signatureHeader = req.headers['x-signature'] || req.headers['x-webhook-signature'];
  try {
    const result = await processWebhook({
      tenantId: req.tenantId,
      eventId,
      eventType: b.event_type || 'payment.confirmed',
      payload: b,
      rawBody: req.rawBody || JSON.stringify(b),
      signatureHeader,
    });
    return result;
  } catch (e) {
    if (e.statusCode === 401) { reply.code(401); return { error: { message: e.message } }; }
    throw e;
  }
});

// Dashboard
app.get('/v1/dashboard/revenue', { preHandler: requireRole('clinic_manager') }, async (req) => {
  const q = req.query || {};
  return getRevenueDashboard({
    tenantId: req.tenantId,
    dateFrom: q.date_from,
    dateTo: q.date_to,
    professionalId: q.professional_id,
    patientId: q.patient_id,
    page: Number(q.page) || 1,
    limit: Math.min(Number(q.limit) || 50, 200),
  });
});

// Async queue endpoints — enfileiram jobs com dedup por job_key, retornam 202 + job_id.
async function enqueueAsync(req, reply, queueName) {
  const b = req.body || {};
  const jobKey = b.job_key || `${queueName}-${req.tenantId}-${Date.now()}`;
  const ikey = req.headers['idempotency-key'];
  if (ikey) {
    const cached = await findIdempotency(`enqueue_${queueName}`, ikey);
    if (cached) { reply.code(202); return cached; }
  }
  const existing = await findAsyncJob(queueName, jobKey);
  if (existing) {
    const resp = { job_id: existing.job_id, queue: queueName, status: existing.status, deduplicated: true };
    reply.code(202); return resp;
  }
  const { job_id, inline } = await enqueue(queueName, jobKey, { ...b, tenantId: req.tenantId });
  await upsertAsyncJob({ tenantId: req.tenantId, queueName, jobKey, jobId: job_id, status: 'queued', payload: b, createdBy: req.actor }).catch(() => {});
  const resp = { job_id, queue: queueName, status: 'queued', inline };
  if (ikey) await saveIdempotency({ operation: `enqueue_${queueName}`, idempotencyKey: ikey, entityType: 'async_job', entityId: job_id, response: resp }).catch(() => {});
  reply.code(202); return resp;
}

app.post('/v1/consultation-notes', { preHandler: requireRole('professional') }, async (req, reply) => enqueueAsync(req, reply, 'consultation-notes'));
app.post('/v1/patient-imports',    { preHandler: requireRole('clinic_manager') }, async (req, reply) => enqueueAsync(req, reply, 'patient-imports'));
app.post('/v1/notifications',      async (req, reply) => enqueueAsync(req, reply, 'notifications'));
app.post('/v1/summaries-ai',       { preHandler: requireRole('professional') }, async (req, reply) => enqueueAsync(req, reply, 'summaries-ai'));
app.get('/v1/jobs/:queueName/:jobKey', async (req, reply) => {
  const job = await findAsyncJob(req.params.queueName, req.params.jobKey);
  if (!job) { reply.code(404); return { error: { message: 'job não encontrado' } }; }
  return job;
});

// Audit trail
app.get('/v1/audit', { preHandler: requireRole('clinic_manager') }, async (req) => {
  const q = req.query || {};
  return { data: await getAuditTrail(req.tenantId, { entityId: q.entity_id, entityType: q.entity_type, limit: Number(q.limit) || 200 }) };
});

// Evolution Notes — REQ-NEUROEVOLUI-0004
app.post('/v1/patients/:patientId/evolution-notes', { preHandler: requireRole('professional') }, async (req, reply) => {
  const b = req.body || {};
  if (!b.text && !b.type) { reply.code(400); return { error: { message: 'text ou type obrigatório' } }; }
  const note = await addEvolutionNote({
    tenantId: req.tenantId,
    patientId: req.params.patientId,
    type: b.type,
    noteDate: b.note_date,
    professionalId: b.professional_id || req.actor,
    text: b.text,
    structuredFields: b.structured_fields,
    attachments: b.attachments,
    createdBy: req.actor,
  });
  reply.code(201);
  return note;
});

app.get('/v1/patients/:patientId/evolution-notes', { preHandler: requireRole('professional') }, async (req) => {
  const q = req.query || {};
  const notes = await getEvolutionNotes(req.tenantId, req.params.patientId, {
    dateFrom: q.date_from,
    dateTo: q.date_to,
    type: q.type,
    professionalId: q.professional_id,
  });
  return { data: notes };
});

app.get('/v1/patients/:patientId/evolution-notes/history', { preHandler: requireRole('professional') }, async (req) => {
  const notes = await getEvolutionNotesHistory(req.tenantId, req.params.patientId);
  return { data: notes };
});

app.get('/v1/patients/:patientId/evolution-notes/:noteId', { preHandler: requireRole('professional') }, async (req, reply) => {
  const note = await getEvolutionNote(req.tenantId, req.params.noteId);
  if (!note) { reply.code(404); return { error: { message: 'nota não encontrada' } }; }
  return note;
});

app.put('/v1/patients/:patientId/evolution-notes/:noteId', { preHandler: requireRole('professional') }, async (req, reply) => {
  const b = req.body || {};
  try {
    const note = await editEvolutionNote(req.tenantId, req.params.noteId, {
      type: b.type,
      text: b.text,
      structuredFields: b.structured_fields,
      editedBy: req.actor,
    });
    if (!note) { reply.code(404); return { error: { message: 'nota não encontrada' } }; }
    return note;
  } catch (e) {
    if (e.statusCode === 410) { reply.code(410); return { error: { message: e.message } }; }
    throw e;
  }
});

app.delete('/v1/patients/:patientId/evolution-notes/:noteId', { preHandler: requireRole('professional') }, async (req, reply) => {
  const removed = await removeEvolutionNote(req.tenantId, req.params.noteId);
  if (!removed) { reply.code(404); return { error: { message: 'nota não encontrada' } }; }
  return { deleted: true };
});

// Patient Reports — geração assíncrona via BullMQ (REQ-NEUROEVOLUI-0004)
app.post('/v1/patients/:patientId/reports', { preHandler: requireRole('professional') }, async (req, reply) => {
  const b = req.body || {};
  const filters = { dateFrom: b.date_from, dateTo: b.date_to, type: b.type, professionalId: b.professional_id };
  const report = await requestPatientReport({
    tenantId: req.tenantId,
    patientId: req.params.patientId,
    filters,
    createdBy: req.actor,
  });
  const jobKey = `patient-reports-${req.tenantId}-${req.params.patientId}-${report.id}`;
  const { job_id, inline } = await enqueue('patient-reports', jobKey, {
    reportId: report.id,
    tenantId: req.tenantId,
    patientId: req.params.patientId,
    filters,
  });
  await upsertAsyncJob({ tenantId: req.tenantId, queueName: 'patient-reports', jobKey, jobId: job_id, status: 'queued', payload: { reportId: report.id }, createdBy: req.actor }).catch(() => {});
  reply.code(202);
  return { report_id: report.id, status: 'queued', job_id, inline };
});

app.get('/v1/patients/:patientId/reports', { preHandler: requireRole('professional') }, async (req) => {
  const reports = await getPatientReports(req.tenantId, req.params.patientId);
  return { data: reports };
});

app.get('/v1/patients/:patientId/reports/:reportId', { preHandler: requireRole('professional') }, async (req, reply) => {
  const report = await getPatientReport(req.tenantId, req.params.reportId);
  if (!report) { reply.code(404); return { error: { message: 'relatório não encontrado' } }; }
  return report;
});

// ──────────────────────────────────────────────────────────────────────────────
// Assistente IA — REQ-NEUROEVOLUI-0006
// POST /v1/assistant
//   JSON body: { question, context_type: 'professional'|'patient', files?: [{filename, mime, data}] }
//   Multipart: question + context_type como campos; files como uploads (fail-soft se inválido)
// Resposta: { answer, sources, confidence, actions?: [rascunho] }
// Fail-closed: sem chave de IA → 503. Falha de arquivo → responde sem contexto de arquivo.
// ──────────────────────────────────────────────────────────────────────────────

// Extrai campos text + files de um body multipart (parser mínimo inline, fail-soft).
function extractMultipart(boundary, raw) {
  try {
    if (!boundary || !raw || !raw.length) return { fields: {}, files: [] };
    const body = raw.toString('binary');
    const sep = `--${boundary}`;
    const parts = body.split(sep).slice(1);
    const fields = {};
    const files = [];
    for (const part of parts) {
      if (part.trim() === '--' || !part.trim()) continue;
      const [headerBlock, ...rest] = part.split('\r\n\r\n');
      const content = rest.join('\r\n\r\n').replace(/\r\n--$/, '').replace(/--\r?\n?$/, '');
      const nameMatch = /name="([^"]+)"/.exec(headerBlock);
      const filenameMatch = /filename="([^"]*)"/.exec(headerBlock);
      const ctMatch = /Content-Type: ([^\r\n]+)/i.exec(headerBlock);
      if (!nameMatch) continue;
      if (filenameMatch) {
        // é um arquivo
        const mime = ctMatch ? ctMatch[1].trim() : 'application/octet-stream';
        files.push({ filename: filenameMatch[1] || 'file', mime, bytes: Buffer.from(content, 'binary') });
      } else {
        fields[nameMatch[1]] = content.replace(/\r\n$/, '');
      }
    }
    return { fields, files };
  } catch {
    return { fields: {}, files: [] };
  }
}

app.post('/v1/assistant', async (req, reply) => {
  // Fail-closed: sem chave de IA → 503
  if (!aiEnabled()) {
    reply.code(503);
    return { error: { code: 'AI_DISABLED', message: 'Chave de IA não configurada; assistente indisponível.' } };
  }

  let question, context_type, ingestFiles = [];

  const body = req.body || {};

  if (body.__multipart) {
    // multipart/form-data: extrai campos e arquivos (fail-soft)
    const { fields, files } = extractMultipart(body.boundary, body.raw);
    question = fields.question || '';
    context_type = fields.context_type || 'professional';
    // Converte arquivos do multipart para o formato do file-ingest-kit
    ingestFiles = files;
  } else {
    // application/json
    question = body.question;
    context_type = body.context_type;
    // Arquivos opcionais como [{ filename, mime, data: base64 }]
    const rawFiles = Array.isArray(body.files) ? body.files : [];
    ingestFiles = rawFiles
      .filter((f) => f && (f.data || f.bytes))
      .map((f) => ({
        filename: f.filename || 'file',
        mime: f.mime || 'application/octet-stream',
        bytes: f.bytes instanceof Uint8Array ? f.bytes : Buffer.from(f.data || '', 'base64'),
      }));
  }

  if (!question || typeof question !== 'string' || !question.trim()) {
    reply.code(400);
    return { error: { code: 'VALIDATION_ERROR', message: 'question obrigatório' } };
  }

  if (!['professional', 'patient'].includes(context_type)) {
    context_type = 'professional';
  }

  try {
    const result = await runAssistantTurn({
      question: question.trim(),
      context_type,
      files: ingestFiles.length > 0 ? ingestFiles : undefined,
      identity: { sub: req.actor || 'anon', role: req.role },
    });
    return result;
  } catch (err) {
    if (err && err.statusCode === 503) {
      reply.code(503);
      return { error: { code: 'AI_DISABLED', message: err.message } };
    }
    // Erros estruturados da IA: schema inválido, tool error, etc.
    if (err && err.code && err.code.startsWith('AI_')) {
      reply.code(422);
      return { error: { code: err.code, message: err.message } };
    }
    throw err;
  }
});

const PORT = Number(process.env.PORT) || 8080;
(async () => {
  if ((process.env.AUTO_MIGRATE || 'true') === 'true') await migrate();
  if ((process.env.AUTO_SEED || 'true') === 'true') await seed();
  startMetricsServer();
  await app.listen({ port: PORT, host: '0.0.0.0' });
  console.log('[neuroevolui-api] :' + PORT);
})().catch((e) => { console.error('boot falhou', e); process.exit(1); });

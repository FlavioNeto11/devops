// server.js — API Fastify (gymops-style). Servida em /neuroevolui/api (stripPrefix). Gerado pela Forge.
import Fastify from 'fastify';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { pool, migrate, seed } from './db.js';
import { M, startMetricsServer } from './metrics.js';
import { authContext, requireRole, canGrantRole } from './rbac.js';
import { enqueueSubmit, queueCounts, enqueue } from './queue.js';
import { findAsyncJob, upsertAsyncJob } from './repositories/async-jobs-repo.js';
import { listRecords, createRecord, findRecord, deleteRecord, updateRecordStatus, updateRecord } from './repositories/records-repo.js';
import { findIdempotency, saveIdempotency } from './repositories/idempotency-repo.js';
import { listConsultations, findConsultation, listConsultationsPaged, updateConsultation, deleteConsultation } from './repositories/consultations-repo.js';
import { scheduleConsultation } from './services/consultations-service.js';
import { processWebhook } from './services/payments-service.js';
import { getRevenueDashboard } from './services/dashboard-service.js';
import { getAuditTrail } from './services/audit-service.js';
import { insertAuditLog } from './repositories/audit-repo.js';
import { addEvolutionNote, getEvolutionNotes, getEvolutionNotesHistory, getEvolutionNote, editEvolutionNote, removeEvolutionNote, listEvolutionNotesPaged } from './services/evolution-notes-service.js';
import { requestPatientReport, getPatientReport, getPatientReports } from './services/patient-reports-service.js';
import { runAssistantTurn } from './ai/graph.js';
import { aiEnabled } from './llm.js';
import { getVapidPublicKey } from './lib/push.js';
import { upsertPushSubscription, deletePushSubscription, getNotificationPreferences, upsertNotificationPreference,
  listNotificationPreferencesPaged, findNotificationPreference, createNotificationPreference, updateNotificationPreferenceById, deleteNotificationPreferenceById } from './repositories/notification-preferences-repo.js';
import { listPatients, findPatient, createPatient, updatePatient, deletePatient } from './repositories/patients-repo.js';
import { listProfessionals, findProfessional, createProfessional, updateProfessional, deleteProfessional } from './repositories/professionals-repo.js';
import { listPatientReportsPaged, findPatientReport, deletePatientReport, PR_STATUSES } from './repositories/patient-reports-repo.js';
import { listPaymentTransactions, findPaymentTransaction, updatePaymentTransaction, deletePaymentTransaction } from './repositories/payment-transactions-repo.js';
import { listKnowledgeSources, findKnowledgeSource, createKnowledgeSource, updateKnowledgeSource, deleteKnowledgeSource, reindexKnowledgeSource, knowledgeSourceStats } from './repositories/knowledge-sources-repo.js';
import { listAuditLogsPaged, findAuditLog, deleteAuditLog } from './repositories/audit-repo.js';
import { listAsyncJobsPaged, findAsyncJobById, listAsyncJobsByQueue, deleteAsyncJob, updateAsyncJobStatus } from './repositories/async-jobs-repo.js';

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

// GET / é CONTRATO do gate forge-tests: o CI confere {"app":"neuroevolui"} antes dos testes LOCKED.
app.get('/', async () => ({ app: 'neuroevolui', service: 'api', ok: true }));
app.get('/health', async () => { await pool.query('SELECT 1'); return { status: 'ok', db: 'connected' }; });

// Identidade do usuário corrente, lida da borda SSO (oauth2-proxy → X-Auth-Request-*).
// A casca chama /neuroevolui/api/me para exibir o usuário logado (email/nome) em vez de "Entrar".
// Sem header de borda (dev/local) → { email: null } (NUNCA 500): a casca apenas não mostra usuário.
// Mantém role/tenantId (resolvidos no onRequest) p/ o gating de acesso em cascata das telas.
app.get('/me', async (req) => ({
  // Fastify normaliza nomes de header para minúsculas em req.headers (X-Auth-Request-Email → x-auth-request-email).
  email: req.headers['x-auth-request-email'] || null,
  name: req.headers['x-auth-request-preferred-username'] || req.headers['x-auth-request-user'] || null,
  role: req.headers['x-auth-request-groups'] || req.role || null,
  tenantId: req.tenantId,
  user: req.actor,
}));
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

// Edição do registro (title / external_ref). Mesmo papel que a criação (professional):
// é uma alteração de conteúdo, não uma exclusão (que exige clinic_manager). Persiste de
// fato no Postgres (updateRecord) e registra a alteração em audit_logs para honrar a
// promessa de "edição auditável" da tela.
app.put('/v1/records/:id', { preHandler: requireRole('professional') }, async (req, reply) => {
  const b = req.body || {};
  // Pelo menos um campo editável precisa vir; rejeita PUT vazio (evita audit fantasma).
  if (b.title === undefined && b.external_ref === undefined) {
    reply.code(400); return { error: { message: 'informe title e/ou external_ref' } };
  }
  if (b.title !== undefined && (typeof b.title !== 'string' || !b.title.trim())) {
    reply.code(400); return { error: { message: 'title não pode ser vazio' } };
  }
  const before = await findRecord(req.tenantId, req.params.id);
  if (!before) { reply.code(404); return { error: { message: 'não encontrado' } }; }
  const updated = await updateRecord(req.tenantId, req.params.id, {
    title: b.title !== undefined ? String(b.title).trim() : undefined,
    external_ref: b.external_ref !== undefined ? String(b.external_ref) : undefined,
  });
  if (!updated) { reply.code(404); return { error: { message: 'não encontrado' } }; }
  await insertAuditLog({
    tenantId: req.tenantId, entityType: 'record', entityId: String(updated.id),
    action: 'update', actor: req.actor,
    metadata: {
      changed: {
        ...(b.title !== undefined ? { title: { from: before.title, to: updated.title } } : {}),
        ...(b.external_ref !== undefined ? { external_ref: { from: before.external_ref, to: updated.external_ref } } : {}),
      },
    },
  }).catch(() => {});
  return updated;
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

app.get('/v1/consultations', async (req) => listConsultationsPaged(req.tenantId, listParams(req)));

// Consulta por id — alimenta o card "Consulta vinculada" da tela de transação (REQ-NEUROEVOLUI-0005).
// Usa o helper findConsultation (já existente no repo). Mesmo gate de leitura da transação (clinic_manager).
app.get('/v1/consultations/:id', { preHandler: requireRole('clinic_manager') }, async (req, reply) => {
  const c = await findConsultation(req.tenantId, req.params.id);
  if (!c) { reply.code(404); return { error: { message: 'consulta não encontrada' } }; }
  return c;
});

app.put('/v1/consultations/:id', { preHandler: requireRole('professional') }, async (req, reply) => {
  const r = await updateConsultation(req.tenantId, req.params.id, req.body || {});
  if (!r) { reply.code(404); return { error: { message: 'consulta não encontrada' } }; }
  return r;
});

app.delete('/v1/consultations/:id', { preHandler: requireRole('clinic_manager') }, async (req, reply) => {
  const ok = await deleteConsultation(req.tenantId, req.params.id);
  if (!ok) { reply.code(404); return { error: { message: 'consulta não encontrada' } }; }
  return { deleted: true };
});

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
// Histórico REAL de notificações enfileiradas (queue_name='notifications'). Alimenta o card
// de lembretes da consulta (filtro opcional ?consultation_id). Contrato { data, total }.
app.get('/v1/notifications', { preHandler: requireRole('professional') }, async (req) => {
  const q = req.query || {};
  return listAsyncJobsByQueue(req.tenantId, 'notifications', { ...listParams(req), consultationId: q.consultation_id });
});
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

// ──────────────────────────────────────────────────────────────────────────────
// Notificações: preferências e push subscriptions — REQ-NEUROEVOLUI-0007
// ──────────────────────────────────────────────────────────────────────────────

app.get('/v1/notifications/vapid-public-key', async () => {
  return { vapid_public_key: getVapidPublicKey() };
});

app.post('/v1/notifications/subscriptions', async (req, reply) => {
  const b = req.body || {};
  const { endpoint, keys } = b;
  if (!endpoint || !keys?.p256dh || !keys?.auth) {
    reply.code(400); return { error: { message: 'endpoint, keys.p256dh e keys.auth obrigatórios' } };
  }
  await upsertPushSubscription({
    tenantId: req.tenantId,
    userId: req.actor || 'anon',
    endpoint,
    p256dh: keys.p256dh,
    auth: keys.auth,
    userAgent: req.headers['user-agent'] || null,
  });
  reply.code(201); return { subscribed: true };
});

app.delete('/v1/notifications/subscriptions', async (req, reply) => {
  const b = req.body || {};
  if (!b.endpoint) { reply.code(400); return { error: { message: 'endpoint obrigatório' } }; }
  await deletePushSubscription(req.tenantId, req.actor || 'anon', b.endpoint);
  return { unsubscribed: true };
});

app.get('/v1/notifications/preferences', async (req) => {
  const prefs = await getNotificationPreferences(req.tenantId, req.actor || 'anon').catch(() => []);
  return { data: prefs };
});

app.put('/v1/notifications/preferences', async (req, reply) => {
  const b = req.body || {};
  const { channel, enabled, contact_value } = b;
  if (!channel || !['email', 'push', 'whatsapp'].includes(channel)) {
    reply.code(400); return { error: { message: 'channel inválido (email | push | whatsapp)' } };
  }
  await upsertNotificationPreference({
    tenantId: req.tenantId,
    userId: req.actor || 'anon',
    channel,
    enabled: enabled !== false,
    contactValue: contact_value || '',
  });
  return { updated: true };
});

// ──────────────────────────────────────────────────────────────────────────────
// Documentação da API — REQ-NEUROEVOLUI-0008
// GET /docs        → ReDoc interativo (HTML)
// GET /docs/openapi.yaml → especificação canônica (YAML)
// ──────────────────────────────────────────────────────────────────────────────
const __dirname = path.dirname(fileURLToPath(import.meta.url));
const openApiYamlPath = path.join(__dirname, 'openapi', 'openapi.yaml');

app.get('/docs/openapi.yaml', async (req, reply) => {
  reply.header('Content-Type', 'text/plain; charset=utf-8');
  try {
    return reply.send(fs.readFileSync(openApiYamlPath, 'utf-8'));
  } catch {
    reply.code(404); return { error: { message: 'openapi.yaml não encontrado' } };
  }
});

app.get('/docs', async (req, reply) => {
  reply.header('Content-Type', 'text/html; charset=utf-8');
  // Determina a URL base da spec: usa X-Forwarded-Prefix ou fallback para /docs/openapi.yaml
  const prefix = req.headers['x-forwarded-prefix'] || '';
  const specUrl = `${prefix}/docs/openapi.yaml`;
  return reply.send(`<!DOCTYPE html>
<html lang="pt-BR">
<head>
  <meta charset="utf-8"/>
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>NeuroEvolui API Docs</title>
  <style>body{margin:0;padding:0;}</style>
</head>
<body>
  <redoc spec-url='${specUrl}'></redoc>
  <script src="https://cdn.jsdelivr.net/npm/redoc@latest/bundles/redoc.standalone.js"></script>
</body>
</html>`);
});

// ──────────────────────────────────────────────────────────────────────────────
// CRUD REST de domínio (entidades centrais + coleções de topo) — rotas finas → repo.
// Contrato de lista: GET /v1/<name>?page&pageSize&sort&dir → { data, total }.
// Convenção de roteamento "só endpoints REAIS": toda entidade do inventário tem /v1/<name>.
// ──────────────────────────────────────────────────────────────────────────────
function listParams(req) {
  const q = req.query || {};
  return {
    page: Number(q.page) || 1,
    pageSize: Math.min(Number(q.pageSize) || 50, 200),
    sort: q.sort || 'id',
    dir: (q.dir || 'desc').toLowerCase() === 'asc' ? 'asc' : 'desc',
  };
}

// ── Patients (entidade central) ────────────────────────────────────────────────
app.get('/v1/patients', { preHandler: requireRole('professional') }, async (req) =>
  listPatients(req.tenantId, listParams(req)));

app.get('/v1/patients/:id', { preHandler: requireRole('professional') }, async (req, reply) => {
  const r = await findPatient(req.tenantId, req.params.id);
  if (!r) { reply.code(404); return { error: { message: 'paciente não encontrado' } }; }
  return r;
});

app.post('/v1/patients', { preHandler: requireRole('professional') }, async (req, reply) => {
  const b = req.body || {};
  if (!b.full_name) { reply.code(400); return { error: { message: 'full_name obrigatório' } }; }
  const r = await createPatient(req.tenantId, b, req.actor);
  reply.code(201); return r;
});

app.put('/v1/patients/:id', { preHandler: requireRole('professional') }, async (req, reply) => {
  const r = await updatePatient(req.tenantId, req.params.id, req.body || {});
  if (!r) { reply.code(404); return { error: { message: 'paciente não encontrado' } }; }
  return r;
});

app.delete('/v1/patients/:id', { preHandler: requireRole('clinic_manager') }, async (req, reply) => {
  const ok = await deletePatient(req.tenantId, req.params.id);
  if (!ok) { reply.code(404); return { error: { message: 'paciente não encontrado' } }; }
  return { deleted: true };
});

// ── Professionals (entidade central) ───────────────────────────────────────────
app.get('/v1/professionals', { preHandler: requireRole('professional') }, async (req) =>
  listProfessionals(req.tenantId, listParams(req)));

app.get('/v1/professionals/:id', { preHandler: requireRole('professional') }, async (req, reply) => {
  const r = await findProfessional(req.tenantId, req.params.id);
  if (!r) { reply.code(404); return { error: { message: 'profissional não encontrado' } }; }
  return r;
});

app.post('/v1/professionals', { preHandler: requireRole('clinic_manager') }, async (req, reply) => {
  const b = req.body || {};
  for (const f of ['full_name', 'email', 'role']) {
    if (!b[f]) { reply.code(400); return { error: { message: `${f} obrigatório` } }; }
  }
  // anti-escalonamento: o solicitante só concede um papel de rank <= o seu (espelha a régua da UI).
  if (!canGrantRole(req.role, b.role)) { reply.code(403); return { error: { message: `acesso negado: você não pode conceder o papel '${b.role}'` } }; }
  const r = await createProfessional(req.tenantId, b, req.actor);
  reply.code(201); return r;
});

app.put('/v1/professionals/:id', { preHandler: requireRole('clinic_manager') }, async (req, reply) => {
  const b = req.body || {};
  // anti-escalonamento: só permite ATRIBUIR um papel se vier no corpo E não exceder o rank do solicitante.
  if (b.role !== undefined && !canGrantRole(req.role, b.role)) { reply.code(403); return { error: { message: `acesso negado: você não pode atribuir o papel '${b.role}'` } }; }
  const r = await updateProfessional(req.tenantId, req.params.id, b);
  if (!r) { reply.code(404); return { error: { message: 'profissional não encontrado' } }; }
  return r;
});

app.delete('/v1/professionals/:id', { preHandler: requireRole('clinic_manager') }, async (req, reply) => {
  const ok = await deleteProfessional(req.tenantId, req.params.id);
  if (!ok) { reply.code(404); return { error: { message: 'profissional não encontrado' } }; }
  return { deleted: true };
});

// ── Evolution Notes (coleção de topo, espelha /v1/patients/:id/evolution-notes) ─
app.get('/v1/evolution-notes', { preHandler: requireRole('professional') }, async (req) => {
  const q = req.query || {};
  return listEvolutionNotesPaged(req.tenantId, { ...listParams(req), patientId: q.patient_id, type: q.type });
});

app.get('/v1/evolution-notes/:id', { preHandler: requireRole('professional') }, async (req, reply) => {
  const r = await getEvolutionNote(req.tenantId, req.params.id);
  if (!r) { reply.code(404); return { error: { message: 'nota não encontrada' } }; }
  return r;
});

app.post('/v1/evolution-notes', { preHandler: requireRole('professional') }, async (req, reply) => {
  const b = req.body || {};
  if (!b.patient_id) { reply.code(400); return { error: { message: 'patient_id obrigatório' } }; }
  if (!b.text && !b.type) { reply.code(400); return { error: { message: 'text ou type obrigatório' } }; }
  const note = await addEvolutionNote({
    tenantId: req.tenantId,
    patientId: b.patient_id,
    type: b.type,
    noteDate: b.note_date,
    professionalId: b.professional_id || req.actor,
    text: b.text,
    structuredFields: b.structured_fields,
    attachments: b.attachments,
    createdBy: req.actor,
  });
  reply.code(201); return note;
});

app.put('/v1/evolution-notes/:id', { preHandler: requireRole('professional') }, async (req, reply) => {
  const b = req.body || {};
  try {
    const note = await editEvolutionNote(req.tenantId, req.params.id, {
      type: b.type, text: b.text, structuredFields: b.structured_fields, editedBy: req.actor,
    });
    if (!note) { reply.code(404); return { error: { message: 'nota não encontrada' } }; }
    return note;
  } catch (e) {
    if (e.statusCode === 410) { reply.code(410); return { error: { message: e.message } }; }
    throw e;
  }
});

app.delete('/v1/evolution-notes/:id', { preHandler: requireRole('professional') }, async (req, reply) => {
  const removed = await removeEvolutionNote(req.tenantId, req.params.id);
  if (!removed) { reply.code(404); return { error: { message: 'nota não encontrada' } }; }
  return { deleted: true };
});

// ── Patient Reports (coleção de topo) ──────────────────────────────────────────
app.get('/v1/patient-reports', { preHandler: requireRole('professional') }, async (req, reply) => {
  const q = req.query || {};
  if (q.status !== undefined && q.status !== '' && !PR_STATUSES.includes(q.status)) {
    reply.code(400); return { error: { message: `status inválido (use: ${PR_STATUSES.join(', ')})` } };
  }
  return listPatientReportsPaged(req.tenantId, { ...listParams(req), patientId: q.patient_id, status: q.status });
});

app.get('/v1/patient-reports/:id', { preHandler: requireRole('professional') }, async (req, reply) => {
  const r = await findPatientReport(req.tenantId, req.params.id);
  if (!r) { reply.code(404); return { error: { message: 'relatório não encontrado' } }; }
  return r;
});

app.post('/v1/patient-reports', { preHandler: requireRole('professional') }, async (req, reply) => {
  const b = req.body || {};
  if (!b.patient_id) { reply.code(400); return { error: { message: 'patient_id obrigatório' } }; }
  const filters = { dateFrom: b.date_from, dateTo: b.date_to, type: b.type, professionalId: b.professional_id };
  const report = await requestPatientReport({ tenantId: req.tenantId, patientId: b.patient_id, filters, createdBy: req.actor });
  const jobKey = `patient-reports-${req.tenantId}-${b.patient_id}-${report.id}`;
  const { job_id, inline } = await enqueue('patient-reports', jobKey, { reportId: report.id, tenantId: req.tenantId, patientId: b.patient_id, filters });
  await upsertAsyncJob({ tenantId: req.tenantId, queueName: 'patient-reports', jobKey, jobId: job_id, status: 'queued', payload: { reportId: report.id }, createdBy: req.actor }).catch(() => {});
  reply.code(202); return { report_id: report.id, status: 'queued', job_id, inline };
});

app.delete('/v1/patient-reports/:id', { preHandler: requireRole('clinic_manager') }, async (req, reply) => {
  const ok = await deletePatientReport(req.tenantId, req.params.id);
  if (!ok) { reply.code(404); return { error: { message: 'relatório não encontrado' } }; }
  return { deleted: true };
});

// ── Payment Transactions (coleção de topo) ────────────────────────────────────
app.get('/v1/payment-transactions', { preHandler: requireRole('clinic_manager') }, async (req) =>
  listPaymentTransactions(req.tenantId, listParams(req)));

app.get('/v1/payment-transactions/:id', { preHandler: requireRole('clinic_manager') }, async (req, reply) => {
  const r = await findPaymentTransaction(req.tenantId, req.params.id);
  if (!r) { reply.code(404); return { error: { message: 'transação não encontrada' } }; }
  return r;
});

app.put('/v1/payment-transactions/:id', { preHandler: requireRole('clinic_manager') }, async (req, reply) => {
  const r = await updatePaymentTransaction(req.tenantId, req.params.id, req.body || {});
  if (!r) { reply.code(404); return { error: { message: 'transação não encontrada' } }; }
  return r;
});

app.delete('/v1/payment-transactions/:id', { preHandler: requireRole('clinic_manager') }, async (req, reply) => {
  const ok = await deletePaymentTransaction(req.tenantId, req.params.id);
  if (!ok) { reply.code(404); return { error: { message: 'transação não encontrada' } }; }
  return { deleted: true };
});

// ── Knowledge Sources (base de conhecimento RAG) ───────────────────────────────
app.get('/v1/knowledge-sources', { preHandler: requireRole('professional') }, async (req) =>
  listKnowledgeSources({ ...listParams(req), q: (req.query || {}).q || '' }));

// Agregados REAIS de toda a coleção (não da página) p/ as métricas de cabeçalho.
app.get('/v1/knowledge-sources/stats', { preHandler: requireRole('professional') }, async () =>
  knowledgeSourceStats());

app.get('/v1/knowledge-sources/:id', { preHandler: requireRole('professional') }, async (req, reply) => {
  const r = await findKnowledgeSource(req.params.id);
  if (!r) { reply.code(404); return { error: { message: 'fonte não encontrada' } }; }
  return r;
});

// Reindexar uma fonte: reprocessa agora (ingested_at=now()). Efeito real e observável
// (o timestamp "Indexado em" avança). 404 se a fonte não existir.
app.post('/v1/knowledge-sources/:id/reindex', { preHandler: requireRole('clinic_manager') }, async (req, reply) => {
  const r = await reindexKnowledgeSource(req.params.id);
  if (!r) { reply.code(404); return { error: { message: 'fonte não encontrada' } }; }
  return r;
});

// POST /v1/knowledge-sources — INGESTÃO real da fonte.
//   JSON: { title, source_id?, embedding_model?, content }  (texto colado → chunk+embed)
//   Multipart: campos title/source_id/embedding_model + arquivos (campo 'files'); o texto é
//   extraído pelo file-ingest-kit (PDF/txt/csv/docx…) e ingerido. content_hash e chunk_count
//   são derivados do CONTEÚDO real no servidor (não de metadados do arquivo).
// Sem conteúdo extraível → 400 (a tela exige arquivo OU texto). Fail-soft de embedding fica
// no repositório (chunks gravados sem vetor quando o índice está fora).
app.post('/v1/knowledge-sources', { preHandler: requireRole('clinic_manager') }, async (req, reply) => {
  const raw = req.body || {};
  let title, sourceId, embeddingModel, content = '';
  let ingestNotes;

  if (raw.__multipart) {
    const { fields, files } = extractMultipart(raw.boundary, raw.raw);
    title = fields.title;
    sourceId = fields.source_id;
    embeddingModel = fields.embedding_model;
    // Texto colado pode vir junto no multipart (campo 'content'); senão extrai dos arquivos.
    content = fields.content || '';
    if (!content && files.length) {
      try {
        const { ingest } = await import('@flavioneto11/file-ingest-kit');
        const ingested = await ingest(files);
        content = (ingested.textParts || []).map((p) => p.text).join('\n\n').trim();
        ingestNotes = ingested.notes && ingested.notes.length ? ingested.notes : undefined;
      } catch {
        // file-ingest-kit indisponível ou arquivo ilegível → content vazio → 400 abaixo
      }
    }
  } else {
    title = raw.title;
    sourceId = raw.source_id;
    embeddingModel = raw.embedding_model;
    content = typeof raw.content === 'string' ? raw.content : '';
  }

  if (!title || !String(title).trim()) { reply.code(400); return { error: { message: 'title obrigatório' } }; }
  if (!content || !content.trim()) {
    reply.code(400);
    return { error: { code: 'NO_CONTENT', message: 'Nenhum conteúdo para indexar — envie um arquivo com texto extraível ou cole o conteúdo.', notes: ingestNotes } };
  }

  const r = await createKnowledgeSource({
    title: String(title).trim(),
    source_id: sourceId ? String(sourceId).trim() : undefined,
    embedding_model: embeddingModel || undefined,
    content,
  });
  reply.code(201);
  return ingestNotes ? { ...r, ingest_notes: ingestNotes } : r;
});

app.put('/v1/knowledge-sources/:id', { preHandler: requireRole('clinic_manager') }, async (req, reply) => {
  const r = await updateKnowledgeSource(req.params.id, req.body || {});
  if (!r) { reply.code(404); return { error: { message: 'fonte não encontrada' } }; }
  return r;
});

app.delete('/v1/knowledge-sources/:id', { preHandler: requireRole('clinic_manager') }, async (req, reply) => {
  const ok = await deleteKnowledgeSource(req.params.id);
  if (!ok) { reply.code(404); return { error: { message: 'fonte não encontrada' } }; }
  return { deleted: true };
});

// ── Notification Preferences (coleção de topo, todas as preferências do tenant) ─
app.get('/v1/notification-preferences', { preHandler: requireRole('clinic_manager') }, async (req) =>
  listNotificationPreferencesPaged(req.tenantId, listParams(req)));

app.get('/v1/notification-preferences/:id', { preHandler: requireRole('clinic_manager') }, async (req, reply) => {
  const r = await findNotificationPreference(req.tenantId, req.params.id);
  if (!r) { reply.code(404); return { error: { message: 'preferência não encontrada' } }; }
  return r;
});

app.post('/v1/notification-preferences', { preHandler: requireRole('clinic_manager') }, async (req, reply) => {
  const b = req.body || {};
  if (!b.channel || !['email', 'push', 'whatsapp'].includes(b.channel)) {
    reply.code(400); return { error: { message: 'channel inválido (email | push | whatsapp)' } };
  }
  const r = await createNotificationPreference({
    tenantId: req.tenantId, userId: b.user_id || req.actor || 'anon',
    channel: b.channel, enabled: b.enabled !== false, contactValue: b.contact_value || '',
  });
  reply.code(201); return r;
});

app.put('/v1/notification-preferences/:id', { preHandler: requireRole('clinic_manager') }, async (req, reply) => {
  const r = await updateNotificationPreferenceById(req.tenantId, req.params.id, req.body || {});
  if (!r) { reply.code(404); return { error: { message: 'preferência não encontrada' } }; }
  return r;
});

app.delete('/v1/notification-preferences/:id', { preHandler: requireRole('clinic_manager') }, async (req, reply) => {
  const ok = await deleteNotificationPreferenceById(req.tenantId, req.params.id);
  if (!ok) { reply.code(404); return { error: { message: 'preferência não encontrada' } }; }
  return { deleted: true };
});

// ── Audit Logs (coleção de topo) ──────────────────────────────────────────────
app.get('/v1/audit-logs', { preHandler: requireRole('clinic_manager') }, async (req) =>
  listAuditLogsPaged(req.tenantId, listParams(req)));

app.get('/v1/audit-logs/:id', { preHandler: requireRole('clinic_manager') }, async (req, reply) => {
  const r = await findAuditLog(req.tenantId, req.params.id);
  if (!r) { reply.code(404); return { error: { message: 'log não encontrado' } }; }
  return r;
});

// POST /v1/audit-logs — registro manual de evento de auditoria (integrações externas).
// A maioria das entradas é gerada internamente; este endpoint expõe a escrita para
// integrações (ex.: event ingestion de sistemas externos). Exige clinic_manager.
app.post('/v1/audit-logs', { preHandler: requireRole('clinic_manager') }, async (req, reply) => {
  const b = req.body || {};
  await insertAuditLog({
    tenantId: req.tenantId,
    entityType: b.entity_type || 'manual',
    entityId: b.entity_id || null,
    action: b.action || 'create',
    actor: b.actor || req.actor,
    amountCents: b.amount_cents || null,
    paymentStatus: b.payment_status || null,
    gateway: b.gateway || null,
    metadata: b.metadata || {},
    ipAddress: b.ip_address || req.ip || null,
  });
  reply.code(201); return { created: true };
});

// DELETE /v1/audit-logs/:id — remoção de log (ex.: correção de dados errados). owner/clinic_manager.
app.delete('/v1/audit-logs/:id', { preHandler: requireRole('clinic_manager') }, async (req, reply) => {
  const ok = await deleteAuditLog(req.tenantId, req.params.id);
  if (!ok) { reply.code(404); return { error: { message: 'log não encontrado' } }; }
  return { deleted: true };
});

// ── Async Jobs (coleção de topo) ──────────────────────────────────────────────
app.get('/v1/async-jobs', { preHandler: requireRole('professional') }, async (req) =>
  listAsyncJobsPaged(req.tenantId, listParams(req)));

app.get('/v1/async-jobs/:id', { preHandler: requireRole('professional') }, async (req, reply) => {
  const r = await findAsyncJobById(req.tenantId, req.params.id);
  if (!r) { reply.code(404); return { error: { message: 'job não encontrado' } }; }
  return r;
});

// POST /v1/async-jobs — enfileira um job genérico via REST (mesma semântica de enqueueAsync).
// Para filas dedicadas use /v1/consultation-notes, /v1/notifications etc.; este endpoint
// é o gateway genérico da coleção de topo (inventário REST completo).
app.post('/v1/async-jobs', { preHandler: requireRole('professional') }, async (req, reply) => {
  const b = req.body || {};
  if (!b.queue_name) { reply.code(400); return { error: { message: 'queue_name obrigatório' } }; }
  return enqueueAsync(req, reply, b.queue_name);
});

// PUT /v1/async-jobs/:id — atualiza status/resultado de um job (ex.: worker reporta conclusão).
app.put('/v1/async-jobs/:id', { preHandler: requireRole('clinic_manager') }, async (req, reply) => {
  const b = req.body || {};
  const job = await findAsyncJobById(req.tenantId, req.params.id);
  if (!job) { reply.code(404); return { error: { message: 'job não encontrado' } }; }
  const validStatuses = ['queued', 'processing', 'done', 'failed'];
  if (b.status !== undefined && !validStatuses.includes(b.status)) {
    reply.code(400); return { error: { message: `status inválido (use: ${validStatuses.join(', ')})` } };
  }
  await updateAsyncJobStatus(job.queue_name, job.job_key, b.status || job.status, b.result ?? undefined);
  return findAsyncJobById(req.tenantId, req.params.id);
});

// DELETE /v1/async-jobs/:id — remove um job da coleção (limpeza de jobs antigos).
app.delete('/v1/async-jobs/:id', { preHandler: requireRole('clinic_manager') }, async (req, reply) => {
  const ok = await deleteAsyncJob(req.tenantId, req.params.id);
  if (!ok) { reply.code(404); return { error: { message: 'job não encontrado' } }; }
  return { deleted: true };
});

const PORT = Number(process.env.PORT) || 8080;
(async () => {
  if ((process.env.AUTO_MIGRATE || 'true') === 'true') await migrate();
  if ((process.env.AUTO_SEED || 'true') === 'true') await seed();
  startMetricsServer();
  await app.listen({ port: PORT, host: '0.0.0.0' });
  console.log('[neuroevolui-api] :' + PORT);
})().catch((e) => { console.error('boot falhou', e); process.exit(1); });

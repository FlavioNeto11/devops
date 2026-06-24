// server.js — API Fastify (gymops-style). Servida em /neuroevolui/api (stripPrefix). Gerado pela Forge.
import Fastify from 'fastify';
import { pool, migrate, seed } from './db.js';
import { M, startMetricsServer } from './metrics.js';
import { authContext, requireRole } from './rbac.js';
import { enqueueSubmit, queueCounts } from './queue.js';
import { listRecords, createRecord, findRecord, deleteRecord, updateRecordStatus } from './repositories/records-repo.js';
import { findIdempotency, saveIdempotency } from './repositories/idempotency-repo.js';
import { listConsultations } from './repositories/consultations-repo.js';
import { scheduleConsultation } from './services/consultations-service.js';
import { processWebhook } from './services/payments-service.js';
import { getRevenueDashboard } from './services/dashboard-service.js';
import { getAuditTrail } from './services/audit-service.js';

const app = Fastify({ logger: false });

app.addContentTypeParser('application/json', { parseAs: 'string' }, (_req, body, done) => {
  _req.rawBody = body;
  try { done(null, JSON.parse(body || '{}')); } catch (e) { done(e); }
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

// Audit trail
app.get('/v1/audit', { preHandler: requireRole('clinic_manager') }, async (req) => {
  const q = req.query || {};
  return { data: await getAuditTrail(req.tenantId, { entityId: q.entity_id, entityType: q.entity_type, limit: Number(q.limit) || 200 }) };
});

const PORT = Number(process.env.PORT) || 8080;
(async () => {
  if ((process.env.AUTO_MIGRATE || 'true') === 'true') await migrate();
  if ((process.env.AUTO_SEED || 'true') === 'true') await seed();
  startMetricsServer();
  await app.listen({ port: PORT, host: '0.0.0.0' });
  console.log('[neuroevolui-api] :' + PORT);
})().catch((e) => { console.error('boot falhou', e); process.exit(1); });

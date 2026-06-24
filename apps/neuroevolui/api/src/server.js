// server.js — API Fastify (gymops-style). Servida em /neuroevolui/api (stripPrefix). Gerado pela Forge.
import Fastify from 'fastify';
import { pool, migrate, seed } from './db.js';
import { M, startMetricsServer } from './metrics.js';
import { authContext, requireRole } from './rbac.js';
import { enqueueSubmit, enqueueJob, queueCounts } from './queue.js';
import { findRecordsByTenant, findRecordById, createRecord, deleteRecord, updateRecordStatus } from './repositories/records.js';
import { findIdempotency, saveIdempotency } from './repositories/idempotency.js';

const app = Fastify({ logger: false });
app.addHook('onRequest', async (req) => { const ctx = authContext(req); req.tenantId = ctx.tenantId; req.role = ctx.role; });
app.get('/', async () => ({ app: 'neuroevolui', service: 'api', ok: true }));
app.get('/health', async () => { await pool.query('SELECT 1'); return { status: 'ok', db: 'connected' }; });
app.get('/v1/health/queue', async () => ({ status: 'ok', queue: await queueCounts() }));

app.get('/v1/records', async (req) => ({ data: await findRecordsByTenant(req.tenantId) }));

app.post('/v1/records', async (req, reply) => {
  const iKey = req.headers['idempotency-key'];
  if (iKey) { const cached = await findIdempotency(iKey, 'create-record'); if (cached) { reply.code(201); return cached; } }
  const b = req.body || {};
  if (!b.title) { reply.code(400); return { error: { message: 'title obrigatório' } }; }
  const r = await createRecord(req.tenantId, b.title);
  M.recordsTotal.inc({ outcome: 'created' });
  if (iKey) await saveIdempotency(iKey, 'create-record', 'record', String(r.id), r);
  reply.code(201); return r;
});

app.get('/v1/records/:id', async (req, reply) => {
  const r = await findRecordById(req.tenantId, Number(req.params.id));
  if (!r) { reply.code(404); return { error: { message: 'não encontrado' } }; }
  return r;
});

app.delete('/v1/records/:id', { preHandler: requireRole('admin') }, async (req) => {
  await deleteRecord(req.tenantId, Number(req.params.id));
  return { deleted: true };
});

app.post('/v1/records/:id/submit', async (req, reply) => {
  const id = Number(req.params.id);
  const r = await findRecordById(req.tenantId, id);
  if (!r) { reply.code(404); return { error: { message: 'não encontrado' } }; }
  await updateRecordStatus(id, 'submitting');
  const e = await enqueueSubmit(id);
  reply.code(202); return { id, status: 'submitting', job_id: e.job_id || ('submit-' + id), enqueued: !e.inline };
});

const ALLOWED_QUEUES = ['consultation-notes', 'patient-imports', 'notifications', 'summaries-ai'];
app.post('/v1/jobs/:queue', async (req, reply) => {
  const { queue } = req.params;
  if (!ALLOWED_QUEUES.includes(queue)) { reply.code(404); return { error: { message: 'fila não encontrada' } }; }
  const b = req.body || {};
  const jobKey = b.job_key || (queue + '-' + Date.now());
  const e = await enqueueJob(queue, 'process', b, jobKey);
  reply.code(202); return { job_id: jobKey, queue, enqueued: !e.inline };
});

const PORT = Number(process.env.PORT) || 8080;
(async () => {
  if ((process.env.AUTO_MIGRATE || 'true') === 'true') await migrate();
  if ((process.env.AUTO_SEED || 'true') === 'true') await seed();
  startMetricsServer();
  await app.listen({ port: PORT, host: '0.0.0.0' });
  console.log('[neuroevolui-api] :' + PORT);
})().catch((e) => { console.error('boot falhou', e); process.exit(1); });
// server.js — API Fastify (gymops-style). Servida em /neuroevolui/api (stripPrefix). Gerado pela Forge.
import Fastify from 'fastify';
import { pool, migrate, seed } from './db.js';
import { M, startMetricsServer } from './metrics.js';
import { authContext, requireRole } from './rbac.js';
import { enqueueSubmit, queueCounts } from './queue.js';
import * as Rec from './repositories/records.js';
const app = Fastify({ logger: false });
app.addHook('onRequest', async (req) => { const ctx = authContext(req); req.tenantId = ctx.tenantId; req.role = ctx.role; req.user = ctx.user; });
app.get('/', async () => ({ app: 'neuroevolui', service: 'api', ok: true }));
app.get('/health', async () => { await pool.query('SELECT 1'); return { status: 'ok', db: 'connected' }; });
app.get('/v1/health/queue', async () => ({ status: 'ok', queue: await queueCounts() }));
// AC2: toda query escopada por tenant_id; AC6: excluir soft-deleted
app.get('/v1/records', async (req) => ({ data: await Rec.listByTenant(req.tenantId) }));
// AC1: created_by salvo na criação para auditoria
app.post('/v1/records', async (req, reply) => { const b = req.body || {}; if (!b.title) { reply.code(400); return { error: { message: 'title obrigatório' } }; } const r = await Rec.create(req.tenantId, b.title, req.user); M.recordsTotal.inc({ outcome: 'created' }); reply.code(201); return r; });
// AC3: tenant diferente -> 404 (nunca vazar dados); AC6: ignorar soft-deleted
app.get('/v1/records/:id', async (req, reply) => { const r = await Rec.findOne(req.tenantId, Number(req.params.id)); if (!r) { reply.code(404); return { error: { message: 'não encontrado' } }; } return r; });
// AC5: permissão verificada antes do delete (clinic_manager+); AC6: soft-delete para compliance
app.delete('/v1/records/:id', { preHandler: requireRole('clinic_manager') }, async (req) => { await Rec.softDelete(req.tenantId, Number(req.params.id)); return { deleted: true }; });
app.post('/v1/records/:id/submit', async (req, reply) => { const id = Number(req.params.id); const r = await Rec.findOne(req.tenantId, id); if (!r) { reply.code(404); return { error: { message: 'não encontrado' } }; } await Rec.setSubmitting(id); const e = await enqueueSubmit(id); reply.code(202); return { id, status: 'submitting', enqueued: !e.inline }; });
const PORT = Number(process.env.PORT) || 8080;
(async () => {
  if ((process.env.AUTO_MIGRATE || 'true') === 'true') await migrate();
  if ((process.env.AUTO_SEED || 'true') === 'true') await seed();
  startMetricsServer();
  await app.listen({ port: PORT, host: '0.0.0.0' });
  console.log('[neuroevolui-api] :' + PORT);
})().catch((e) => { console.error('boot falhou', e); process.exit(1); });

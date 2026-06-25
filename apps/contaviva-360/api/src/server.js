// server.js — API Fastify (gymops-style). Servida em /contaviva-360/api (stripPrefix). Gerado pela Forge.
import Fastify from 'fastify';
import { pool, migrate, seed } from './db.js';
import { M, startMetricsServer } from './metrics.js';
import { authContext, requireRole } from './rbac.js';
import { enqueueSubmit, queueCounts } from './queue.js';
const app = Fastify({ logger: false });
app.addHook('onRequest', async (req) => { const ctx = authContext(req); req.tenantId = ctx.tenantId; req.role = ctx.role; });
app.get('/', async () => ({ app: 'contaviva-360', service: 'api', ok: true }));
app.get('/health', async () => { await pool.query('SELECT 1'); return { status: 'ok', db: 'connected' }; });
app.get('/v1/health/queue', async () => ({ status: 'ok', queue: await queueCounts() }));
app.get('/v1/records', async (req) => ({ data: (await pool.query('SELECT * FROM records WHERE tenant_id=$1 ORDER BY id DESC LIMIT 200', [req.tenantId])).rows }));
app.post('/v1/records', async (req, reply) => { const b = req.body || {}; if (!b.title) { reply.code(400); return { error: { message: 'title obrigatório' } }; } const r = (await pool.query('INSERT INTO records(tenant_id,title) VALUES ($1,$2) RETURNING *', [req.tenantId, b.title])).rows[0]; M.recordsTotal.inc({ outcome: 'created' }); reply.code(201); return r; });
app.get('/v1/records/:id', async (req, reply) => { const r = (await pool.query('SELECT * FROM records WHERE tenant_id=$1 AND id=$2', [req.tenantId, Number(req.params.id)])).rows[0]; if (!r) { reply.code(404); return { error: { message: 'não encontrado' } }; } return r; });
app.delete('/v1/records/:id', { preHandler: requireRole('admin') }, async (req) => { await pool.query('DELETE FROM records WHERE tenant_id=$1 AND id=$2', [req.tenantId, Number(req.params.id)]); return { deleted: true }; });
app.post('/v1/records/:id/submit', async (req, reply) => { const id = Number(req.params.id); const r = (await pool.query('SELECT id FROM records WHERE tenant_id=$1 AND id=$2', [req.tenantId, id])).rows[0]; if (!r) { reply.code(404); return { error: { message: 'não encontrado' } }; } await pool.query("UPDATE records SET status='submitting', updated_at=now() WHERE id=$1", [id]); const e = await enqueueSubmit(id); reply.code(202); return { id, status: 'submitting', enqueued: !e.inline }; });
const PORT = Number(process.env.PORT) || 8080;
(async () => {
  if ((process.env.AUTO_MIGRATE || 'true') === 'true') await migrate();
  if ((process.env.AUTO_SEED || 'true') === 'true') await seed();
  startMetricsServer();
  await app.listen({ port: PORT, host: '0.0.0.0' });
  console.log('[contaviva-360-api] :' + PORT);
})().catch((e) => { console.error('boot falhou', e); process.exit(1); });
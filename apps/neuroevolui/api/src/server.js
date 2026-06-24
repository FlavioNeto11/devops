// server.js — API Fastify (gymops-style). Servida em /neuroevolui/api (stripPrefix). Gerado pela Forge.
import Fastify from 'fastify';
import { pool, migrate, seed } from './db.js';
import { M, startMetricsServer } from './metrics.js';
import { authContext, requireRole } from './rbac.js';
import { enqueueSubmit, queueCounts } from './queue.js';
import { getOpenApiYamlText, loadOpenApiSpec } from './lib/openapi.js';
import * as records from './repositories/records.js';
const app = Fastify({ logger: false });
app.addHook('onRequest', async (req) => { const ctx = authContext(req); req.tenantId = ctx.tenantId; req.role = ctx.role; });
app.get('/', async () => ({ app: 'neuroevolui', service: 'api', ok: true }));
app.get('/health', async () => { await pool.query('SELECT 1'); return { status: 'ok', db: 'connected' }; });
app.get('/v1/health/queue', async () => ({ status: 'ok', queue: await queueCounts() }));
app.get('/v1/records', async (req) => ({ data: await records.listRecords(req.tenantId) }));
app.post('/v1/records', async (req, reply) => { const b = req.body || {}; if (!b.title) { reply.code(400); return { error: { message: 'title obrigatório' } }; } const r = await records.createRecord(req.tenantId, b.title); M.recordsTotal.inc({ outcome: 'created' }); reply.code(201); return r; });
app.get('/v1/records/:id', async (req, reply) => { const r = await records.getRecord(req.tenantId, Number(req.params.id)); if (!r) { reply.code(404); return { error: { message: 'não encontrado' } }; } return r; });
app.delete('/v1/records/:id', { preHandler: requireRole('admin') }, async (req) => { await records.deleteRecord(req.tenantId, Number(req.params.id)); return { deleted: true }; });
app.post('/v1/records/:id/submit', async (req, reply) => { const id = Number(req.params.id); const r = await records.getRecordId(req.tenantId, id); if (!r) { reply.code(404); return { error: { message: 'não encontrado' } }; } await records.markSubmitting(id); const e = await enqueueSubmit(id); reply.code(202); return { id, status: 'submitting', enqueued: !e.inline }; });

app.get('/openapi.yaml', async (req, reply) => { reply.type('text/yaml'); return getOpenApiYamlText(); });
app.get('/openapi.json', async () => loadOpenApiSpec());
app.get('/docs', async (req, reply) => {
  const spec = loadOpenApiSpec();
  reply.type('text/html');
  return `<!DOCTYPE html>
<html lang="pt-BR">
<head>
  <meta charset="utf-8"/>
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>NeuroEvolui API Docs</title>
  <link rel="stylesheet" type="text/css" href="https://unpkg.com/swagger-ui-dist@5/swagger-ui.css">
</head>
<body>
<div id="swagger-ui"></div>
<script src="https://unpkg.com/swagger-ui-dist@5/swagger-ui-bundle.js"></script>
<script>
  SwaggerUIBundle({ spec: ${JSON.stringify(spec)}, dom_id: '#swagger-ui', deepLinking: true, layout: 'BaseLayout' });
</script>
</body>
</html>`;
});

const PORT = Number(process.env.PORT) || 8080;
(async () => {
  if ((process.env.AUTO_MIGRATE || 'true') === 'true') await migrate();
  if ((process.env.AUTO_SEED || 'true') === 'true') await seed();
  startMetricsServer();
  await app.listen({ port: PORT, host: '0.0.0.0' });
  console.log('[neuroevolui-api] :' + PORT);
})().catch((e) => { console.error('boot falhou', e); process.exit(1); });
// server.js — API Fastify (gymops-style). Servida em /contaviva-360/api (stripPrefix). Gerado pela Forge.
import Fastify from 'fastify';
import { pool, migrate, seed } from './db.js';
import { M, startMetricsServer } from './metrics.js';
import { authContext, requireRole } from './rbac.js';
import { enqueueSubmit, queueCounts } from './queue.js';
import { getIdempotentResponse, rememberIdempotentResponse } from './idempotency.js';
import { listRecords, createRecord, getRecord, deleteRecord, submitRecord } from './repositories/records.js';
import { registerPfRoutes } from './routes/pf.js';
import { registerPjRoutes } from './routes/pj.js';
import { registerIncomeExpenseRoutes } from './routes/income-expense.js';
import { registerDocumentRoutes } from './routes/documents.js';
import { registerDashboardRoutes } from './routes/dashboard.js';
import { registerFiscalObligationRoutes } from './routes/fiscal-obligations.js';
import { registerTaskRoutes } from './routes/tasks.js';
import { registerFinancialControlRoutes } from './routes/financial-control.js';
import { registerCashFlowRoutes } from './routes/cash-flow.js';
import { registerFinancialReportRoutes } from './routes/financial-reports.js';
import { registerFinancialDashboardRoutes } from './routes/financial-dashboard.js';

const app = Fastify({ logger: false });
app.addHook('onRequest', async (req) => { const ctx = authContext(req); req.tenantId = ctx.tenantId; req.role = ctx.role; req.user = ctx.user; });
app.get('/', async () => ({ app: 'contaviva-360', service: 'api', ok: true }));
app.get('/health', async () => { await pool.query('SELECT 1'); return { status: 'ok', db: 'connected' }; });
app.get('/v1/health/queue', async () => ({ status: 'ok', queue: await queueCounts() }));

// Records (base) com idempotência em criação
app.get('/v1/records', async (req) => ({ data: await listRecords(req.tenantId) }));
app.post('/v1/records', async (req, reply) => {
  const b = req.body || {};
  if (!b.title) { reply.code(400); return { error: { message: 'title obrigatório' } }; }
  const key = req.headers['idempotency-key'];
  const cached = await getIdempotentResponse('create_record', key);
  if (cached) return cached;
  const r = await createRecord(req.tenantId, b.title);
  M.recordsTotal.inc({ outcome: 'created' });
  await rememberIdempotentResponse({ operation: 'create_record', idempotencyKey: key, entityType: 'record', entityId: r.id, response: r });
  reply.code(201); return r;
});
app.get('/v1/records/:id', async (req, reply) => { const r = await getRecord(req.tenantId, Number(req.params.id)); if (!r) { reply.code(404); return { error: { message: 'não encontrado' } }; } return r; });
app.delete('/v1/records/:id', { preHandler: requireRole('admin') }, async (req) => { await deleteRecord(req.tenantId, Number(req.params.id)); return { deleted: true }; });
app.post('/v1/records/:id/submit', async (req, reply) => { const id = Number(req.params.id); const r = await submitRecord(req.tenantId, id); if (!r) { reply.code(404); return { error: { message: 'não encontrado' } }; } const e = await enqueueSubmit(id); reply.code(202); return { id, status: 'submitting', enqueued: !e.inline }; });

// Domínio contábil/fiscal (REQ-CONTAVIVA360-0002)
registerPfRoutes(app);
registerPjRoutes(app);
registerIncomeExpenseRoutes(app);
registerDocumentRoutes(app);
registerDashboardRoutes(app);

// Obrigações fiscais e alertas (REQ-CONTAVIVA360-0003)
registerFiscalObligationRoutes(app);

// Tarefas e colaboração (REQ-CONTAVIVA360-0004)
registerTaskRoutes(app);

// Controle financeiro: AP/AR, fluxo de caixa, relatórios, dashboard (REQ-CONTAVIVA360-0005)
registerFinancialControlRoutes(app);
registerCashFlowRoutes(app);
registerFinancialReportRoutes(app);
registerFinancialDashboardRoutes(app);

const PORT = Number(process.env.PORT) || 8080;
(async () => {
  if ((process.env.AUTO_MIGRATE || 'true') === 'true') await migrate();
  if ((process.env.AUTO_SEED || 'true') === 'true') await seed();
  startMetricsServer();
  await app.listen({ port: PORT, host: '0.0.0.0' });
  console.log('[contaviva-360-api] :' + PORT);
})().catch((e) => { console.error('boot falhou', e); process.exit(1); });

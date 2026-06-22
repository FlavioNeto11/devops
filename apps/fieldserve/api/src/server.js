// server.js — API HTTP (bloco camadas-rigidas: rotas finas, regra nos services).
// Servida sob /fieldserve/api (stripPrefix → o processo vê /health, /v1/*). Observabilidade por padrão.
import express from 'express';
import { pool, migrate, seed } from './db.js';
import { M, startMetricsServer } from './metrics.js';
import * as ordersRepo from './repositories/orders-repo.js';
import * as jobsRepo from './repositories/jobs-repo.js';
import * as ordersSvc from './services/orders-service.js';

const app = express();
app.use(express.json());

// auth-context (multi-tenant): numa app com OIDC o tenant viria do claim da sessão; aqui o header
// X-Tenant-Id define o escopo (default 1) — e DEMONSTRA isolamento cross-tenant.
app.use((req, _res, next) => { req.tenantId = Number(req.header('X-Tenant-Id')) || 1; next(); });
const wrap = (fn) => (req, res) => Promise.resolve(fn(req, res)).catch((e) => { M.httpErrors.inc(); res.status(e.status || 500).json({ error: { message: e.message || 'erro' } }); });

app.get('/', (_req, res) => res.json({ app: 'fieldserve', service: 'api', ok: true }));
app.get('/health', wrap(async (_req, res) => { await pool.query('SELECT 1'); res.json({ status: 'ok', db: 'connected' }); }));
app.get('/v1/health/jobs', wrap(async (_req, res) => res.json({ status: 'ok', jobs: await jobsRepo.counts() })));

app.get('/v1/work-orders', wrap(async (req, res) => res.json({ data: await ordersRepo.listOrders(req.tenantId, req.query.q) })));
app.get('/v1/work-orders/:id', wrap(async (req, res) => { const o = await ordersRepo.getOrder(req.tenantId, Number(req.params.id)); if (!o) return res.status(404).json({ error: { message: 'não encontrada' } }); res.json(o); }));
app.post('/v1/work-orders', wrap(async (req, res) => res.status(201).json(await ordersSvc.createOrder(req.tenantId, req.body, req.header('Idempotency-Key')))));
app.post('/v1/work-orders/:id/submit', wrap(async (req, res) => res.status(202).json(await ordersSvc.submitOrder(req.tenantId, Number(req.params.id)))));
app.get('/v1/assets', wrap(async (req, res) => res.json({ data: await ordersRepo.listAssets(req.tenantId) })));
app.get('/v1/technicians', wrap(async (req, res) => res.json({ data: await ordersRepo.listTechnicians(req.tenantId) })));
app.get('/v1/dashboard', wrap(async (req, res) => res.json(await ordersRepo.dashboard(req.tenantId))));

async function updateQueueDepth() {
  try { const c = await jobsRepo.counts(); for (const s of ['queued', 'running', 'done', 'dlq']) M.queueDepth.set({ status: s }, c[s] || 0); } catch { /* best-effort */ }
}

const PORT = Number(process.env.PORT) || 8080;
(async () => {
  if ((process.env.AUTO_MIGRATE || 'true') === 'true') await migrate();
  if ((process.env.AUTO_SEED || 'true') === 'true') await seed();
  startMetricsServer();
  setInterval(updateQueueDepth, 5000); updateQueueDepth();
  app.listen(PORT, () => console.log(`[fieldserve-api] :${PORT}`));
})().catch((e) => { console.error('[fieldserve-api] boot falhou', e); process.exit(1); });

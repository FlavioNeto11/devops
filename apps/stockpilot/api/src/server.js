// server.js — API (camadas: rotas finas). Servida em /stockpilot/api (stripPrefix). Gerado pela Forge.
import express from 'express';
import { pool, migrate, seed } from './db.js';
import { M, startMetricsServer } from './metrics.js';
import * as jobsRepo from './repositories/jobs-repo.js';
import * as productsRepo from './repositories/products-repo.js';
import * as ordersRepo from './repositories/orders-repo.js';
import * as gatewayAuditRepo from './repositories/gateway-audit-repo.js';
import * as notificationsRepo from './repositories/notifications-repo.js';
import { requestReorder } from './services/reorder-service.js';
import { suggestReorder } from './services/ai-suggest-service.js';
import { requireAuth } from './lib/auth-context.js';
const app = express(); app.use(express.json());
app.use((req, _res, next) => { req.tenantId = Number(req.header('X-Tenant-Id')) || 1; next(); });
const wrap = (fn) => (req, res) => Promise.resolve(fn(req, res)).catch((e) => { M.httpErrors.inc(); res.status(e.status || 500).json({ error: { message: e.message || 'erro' } }); });
app.get('/', (_q, res) => res.json({ app: 'stockpilot', service: 'api', ok: true }));
app.get('/health', wrap(async (_q, res) => { await pool.query('SELECT 1'); res.json({ status: 'ok', db: 'connected' }); }));
app.get('/v1/health/jobs', wrap(async (_q, res) => res.json({ status: 'ok', jobs: await jobsRepo.counts() })));
app.get('/v1/records', wrap(async (req, res) => res.json({ data: (await pool.query('SELECT * FROM records WHERE tenant_id=$1 ORDER BY id DESC LIMIT 200', [req.tenantId])).rows })));
app.get('/v1/records/:id', wrap(async (req, res) => { const r = (await pool.query('SELECT * FROM records WHERE tenant_id=$1 AND id=$2', [req.tenantId, Number(req.params.id)])).rows[0]; if (!r) return res.status(404).json({ error: { message: 'não encontrado' } }); res.json(r); }));
app.post('/v1/records', wrap(async (req, res) => { if (!req.body || !req.body.title) { return res.status(400).json({ error: { message: 'title obrigatório' } }); } const r = (await pool.query('INSERT INTO records(tenant_id,title) VALUES ($1,$2) RETURNING *', [req.tenantId, req.body.title])).rows[0]; M.recordsTotal.inc({ outcome: 'created' }); res.status(201).json(r); }));
app.post('/v1/records/:id/submit', wrap(async (req, res) => { const id = Number(req.params.id); const r = (await pool.query('SELECT id FROM records WHERE id=$1', [id])).rows[0]; if (!r) return res.status(404).json({ error: { message: 'não encontrado' } }); await pool.query(`UPDATE records SET status='submitting', updated_at=now() WHERE id=$1`, [id]); const jid = await jobsRepo.enqueue('record.submit', { recordId: id }, 'submit:' + id); res.status(202).json({ id, status: 'submitting', enqueued: jid != null }); }));

// Painel de estoque — rotas protegidas por sessão (requireAuth → 401 sem sessão) e escopadas
// por tenant derivado da borda SSO (req.tenant). Cross-tenant retorna 404, nunca vaza dados.
// Produtos com status derivado (OK/ALERTA/RUPTURA)
app.get('/v1/products', requireAuth, wrap(async (req, res) => res.json({ data: await productsRepo.listWithStatus(req.tenant) })));

// Criação de pedido manual para um produto
app.post('/v1/products/:id/order', requireAuth, wrap(async (req, res) => {
  const product = await productsRepo.findById(Number(req.params.id), req.tenant);
  if (!product) return res.status(404).json({ error: { message: 'produto não encontrado' } });
  const order = await ordersRepo.create(product.id, req.tenant);
  res.status(201).json(order);
}));

// Reposição assíncrona (REQ-STOCKPILOT-0003): cria pedido pending + enfileira job idempotente.
// O service decide e enfileira (rota fina). Idempotente: repetir com pedido aberto devolve o mesmo
// recurso (200, deduped) sem criar outro; primeira reposição cria (201). O worker processa via gateway.
app.post('/v1/products/:id/reorder', requireAuth, wrap(async (req, res) => {
  const result = await requestReorder(Number(req.params.id), req.tenant);
  if (!result.ok) return res.status(404).json({ error: { message: 'produto não encontrado' } });
  res.status(result.created ? 201 : 200).json({ order: result.order, deduped: result.deduped, enqueued: result.jobId != null || result.deduped });
}));

// Assistente de IA (REQ-STOCKPILOT-0008): SUGERE a quantidade de reposição de um produto, GROUNDED
// nos dados REAIS (estoque + histórico de pedidos do tenant). DRY-RUN: só sugere — NÃO cria pedido nem
// altera estado (o operador confirma via /reorder). Saída ESTRUTURADA validada por schema (fail-closed:
// IA sem JSON válido → AppError 502). SEM ANTHROPIC_API_KEY → 503 claro, o resto do app intacto.
app.post('/v1/products/:id/suggest-reorder', requireAuth, wrap(async (req, res) => {
  const result = await suggestReorder(Number(req.params.id), req.tenant);
  res.json(result);
}));

// Pedidos abertos (pending/processing)
app.get('/v1/orders', requireAuth, wrap(async (req, res) => res.json({ data: await ordersRepo.listOpen(req.tenant) })));

// Alertas: RUPTURA e falhas de envio ao fornecedor
app.get('/v1/alerts', requireAuth, wrap(async (req, res) => res.json({ data: await productsRepo.listAlerts(req.tenant) })));

// Trilha de auditoria das trocas com o fornecedor externo (REQ-STOCKPILOT-0004), escopada por tenant.
// Segredos já vêm redigidos da gravação (gateway-audit-repo) — nunca vaza token/api key.
app.get('/v1/audit', requireAuth, wrap(async (req, res) => res.json({ data: await gatewayAuditRepo.listByTenant(req.tenant) })));

// Notificações multi-canal (REQ-STOCKPILOT-0007): registro persistido por evento (ruptura/falha_pedido)
// com o desfecho POR canal (sent/failed/skipped). Escopado por tenant (cross-tenant nunca vaza).
app.get('/v1/notifications', requireAuth, wrap(async (req, res) => res.json({ data: await notificationsRepo.listByTenant(req.tenant) })));
async function depth() { try { const c = await jobsRepo.counts(); for (const s of ['queued','running','done','dlq']) M.queueDepth.set({ status: s }, c[s] || 0); } catch {} }
const PORT = Number(process.env.PORT) || 8080;
(async () => {
  if ((process.env.AUTO_MIGRATE || 'true') === 'true') await migrate();
  if ((process.env.AUTO_SEED || 'true') === 'true') await seed();
  startMetricsServer();
  setInterval(depth, 5000); depth();
  app.listen(PORT, () => console.log('[stockpilot-api] :' + PORT));
})().catch((e) => { console.error('boot falhou', e); process.exit(1); });
// server.js — API (camadas: rotas finas). Servida em /shopdesk/api (stripPrefix). Gerado pela Forge.
import express from 'express';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { pool, migrate, seed } from './db.js';
import { M, startMetricsServer } from './metrics.js';
import * as jobsRepo from './repositories/jobs-repo.js';
import { makeRepo } from './repositories/crud-repo.js';
import { ENTITIES } from './repositories/entities.js';
import * as checkoutSvc from './services/checkout-service.js';
import * as fiscalSvc from './services/fiscal-service.js';
import * as assistantSvc from './services/assistant-service.js';
import * as notifySvc from './services/notification-service.js';
import { authContext } from './lib/auth-context.js';
import { openapiToJson } from '../openapi/openapi-json.mjs';
// Contrato OpenAPI canônico — lido UMA vez no boot (cache em módulo), servido em YAML (download)
// e JSON (consumido pela tela de documentação, sem parser no frontend). Fonte única no disco.
const __dir = dirname(fileURLToPath(import.meta.url));
const OPENAPI_YAML = readFileSync(join(__dir, '../openapi/openapi.yaml'), 'utf8');
const OPENAPI_JSON = JSON.stringify(openapiToJson(OPENAPI_YAML), null, 2);
const app = express(); app.use(express.json());
app.use((req, _res, next) => { req.tenantId = Number(req.header('X-Tenant-Id')) || 1; req.auth = authContext(req); next(); });
const wrap = (fn) => (req, res) => Promise.resolve(fn(req, res)).catch((e) => { M.httpErrors.inc(); res.status(e.status || 500).json({ error: { message: e.message || 'erro' } }); });
app.get('/', (_q, res) => res.json({ app: 'shopdesk', service: 'api', ok: true }));
app.get('/health', wrap(async (_q, res) => { await pool.query('SELECT 1'); res.json({ status: 'ok', db: 'connected' }); }));
// Contrato OpenAPI: YAML para download, JSON para a tela de documentação (res.json shape).
app.get('/v1/openapi.yaml', (_q, res) => res.type('application/yaml').send(OPENAPI_YAML));
app.get('/v1/openapi.json', (_q, res) => res.type('application/json').send(OPENAPI_JSON));
app.get('/v1/health/jobs', wrap(async (_q, res) => res.json({ status: 'ok', jobs: await jobsRepo.counts() })));
// Identidade do usuário logado pela BORDA SSO (oauth2-proxy/Keycloak -> X-Auth-Request-*).
// A casca (UiAppShell) chama GET /shopdesk/api/me (stripPrefix -> /me) p/ mostrar o usuário logado
// em vez de "Entrar". Sem header (dev/local) devolve { email: null } (NUNCA 500).
app.get('/me', (req, res) => res.json({
  email: req.header('X-Auth-Request-Email') || null,
  name: req.header('X-Auth-Request-Preferred-Username') || req.header('X-Auth-Request-User') || null,
  role: req.header('X-Auth-Request-Groups') || null,
}));
app.get('/v1/records', wrap(async (req, res) => res.json({ data: (await pool.query('SELECT * FROM records WHERE tenant_id=$1 ORDER BY id DESC LIMIT 200', [req.tenantId])).rows })));
app.get('/v1/records/:id', wrap(async (req, res) => { const r = (await pool.query('SELECT * FROM records WHERE tenant_id=$1 AND id=$2', [req.tenantId, Number(req.params.id)])).rows[0]; if (!r) return res.status(404).json({ error: { message: 'não encontrado' } }); res.json(r); }));
app.post('/v1/records', wrap(async (req, res) => { if (!req.body || !req.body.title) { return res.status(400).json({ error: { message: 'title obrigatório' } }); } const r = (await pool.query('INSERT INTO records(tenant_id,title) VALUES ($1,$2) RETURNING *', [req.tenantId, req.body.title])).rows[0]; M.recordsTotal.inc({ outcome: 'created' }); res.status(201).json(r); }));
app.post('/v1/records/:id/submit', wrap(async (req, res) => { const id = Number(req.params.id); const r = (await pool.query('SELECT id FROM records WHERE id=$1', [id])).rows[0]; if (!r) return res.status(404).json({ error: { message: 'não encontrado' } }); await pool.query(`UPDATE records SET status='submitting', updated_at=now() WHERE id=$1`, [id]); const jid = await jobsRepo.enqueue('record.submit', { recordId: id }, 'submit:' + id); res.status(202).json({ id, status: 'submitting', enqueued: jid != null }); }));
// bloco pagamentos-gateway: checkout com cobrança idempotente via @flavioneto11/payments-kit (sandbox por default).
app.post('/v1/checkout', wrap(async (req, res) => { const b = req.body || {}; if (!b.orderId || !b.amount) return res.status(400).json({ error: { message: 'orderId e amount obrigatórios' } }); const r = await checkoutSvc.checkout({ tenantId: req.tenantId, orderId: String(b.orderId), amount: Number(b.amount), paymentMethodToken: b.paymentMethodToken }); notifySvc.notify('order.paid', { orderId: r.orderId, status: r.status }).catch(() => {}); res.status(201).json(r); }));
app.get('/v1/checkout/audit', wrap(async (_q, res) => res.json({ data: checkoutSvc.recentAudit() })));
// bloco nota-fiscal-emissao: emite NF-e (sandbox por default) — na app plena roda no worker pós-pagamento.
app.post('/v1/invoices', wrap(async (req, res) => { const b = req.body || {}; if (!b.orderId) return res.status(400).json({ error: { message: 'orderId obrigatório' } }); res.status(201).json(fiscalSvc.emitInvoice({ orderId: b.orderId, total: b.total, cnpj: b.cnpj, items: b.items })); }));
// bloco control-ai-por-app: assistente de IA do lojista (fail-closed sem chave).
app.post('/v1/assistant', wrap(async (req, res) => { const b = req.body || {}; res.json(await assistantSvc.assist(b.message || b.input)); }));
app.get('/v1/assistant/health', (_q, res) => res.json({ ai: assistantSvc.aiEnabled }));
// bloco notificacoes-multicanal: histórico de notificações (e-mail/push/whatsapp por webhook, degrada graciosamente).
app.get('/v1/notifications', wrap(async (_q, res) => res.json({ data: notifySvc.recentNotifications() })));

// ---------------------------------------------------------------------------
// CRUD de domínio (products/orders/carts/inventory/reorders/users/audit-logs).
// Rotas FINAS: delegam ao repo CRUD; nenhum SQL aqui (bloco camadas-rigidas).
// O repo é indexado por rota; os handlers genéricos recebem a entidade certa.
// As rotas abaixo são declaradas com STRINGS LITERAIS (não interpoladas) para o
// validate:openapi enxergá-las e casar com o openapi.yaml sem drift.
// ---------------------------------------------------------------------------
const repos = Object.fromEntries(ENTITIES.map((e) => [e.route, makeRepo(e)]));
const crudList = (route) => wrap(async (req, res) => {
  const { page, pageSize, sort, dir } = req.query;
  res.json(await repos[route].list(req.tenantId, { page, pageSize, sort, dir }));
});
const crudGet = (route) => wrap(async (req, res) => {
  const r = await repos[route].get(req.tenantId, req.params.id);
  if (!r) return res.status(404).json({ error: { message: 'não encontrado' } });
  res.json(r);
});
const crudCreate = (route) => wrap(async (req, res) => {
  const body = req.body || {};
  const missing = repos[route].validate(body);
  if (missing.length) return res.status(400).json({ error: { message: 'campos obrigatórios: ' + missing.join(', ') } });
  res.status(201).json(await repos[route].create(req.tenantId, body));
});
const crudUpdate = (route) => wrap(async (req, res) => {
  const r = await repos[route].update(req.tenantId, req.params.id, req.body || {});
  if (!r) return res.status(404).json({ error: { message: 'não encontrado' } });
  res.json(r);
});
const crudDelete = (route) => wrap(async (req, res) => {
  const okDel = await repos[route].remove(req.tenantId, req.params.id);
  if (!okDel) return res.status(404).json({ error: { message: 'não encontrado' } });
  res.status(204).end();
});

app.get('/v1/products', crudList('products'));
app.get('/v1/products/:id', crudGet('products'));
app.post('/v1/products', crudCreate('products'));
app.put('/v1/products/:id', crudUpdate('products'));
app.delete('/v1/products/:id', crudDelete('products'));

app.get('/v1/orders', crudList('orders'));
app.get('/v1/orders/:id', crudGet('orders'));
app.post('/v1/orders', crudCreate('orders'));
app.put('/v1/orders/:id', crudUpdate('orders'));
app.delete('/v1/orders/:id', crudDelete('orders'));

app.get('/v1/carts', crudList('carts'));
app.get('/v1/carts/:id', crudGet('carts'));
app.post('/v1/carts', crudCreate('carts'));
app.put('/v1/carts/:id', crudUpdate('carts'));
app.delete('/v1/carts/:id', crudDelete('carts'));

app.get('/v1/inventory', crudList('inventory'));
app.get('/v1/inventory/:id', crudGet('inventory'));
app.post('/v1/inventory', crudCreate('inventory'));
app.put('/v1/inventory/:id', crudUpdate('inventory'));
app.delete('/v1/inventory/:id', crudDelete('inventory'));

app.get('/v1/reorders', crudList('reorders'));
app.get('/v1/reorders/:id', crudGet('reorders'));
app.post('/v1/reorders', crudCreate('reorders'));
app.put('/v1/reorders/:id', crudUpdate('reorders'));
app.delete('/v1/reorders/:id', crudDelete('reorders'));

app.get('/v1/users', crudList('users'));
app.get('/v1/users/:id', crudGet('users'));
app.post('/v1/users', crudCreate('users'));
app.put('/v1/users/:id', crudUpdate('users'));
app.delete('/v1/users/:id', crudDelete('users'));

app.get('/v1/audit-logs', crudList('audit-logs'));
app.get('/v1/audit-logs/:id', crudGet('audit-logs'));
app.post('/v1/audit-logs', crudCreate('audit-logs'));
app.put('/v1/audit-logs/:id', crudUpdate('audit-logs'));
app.delete('/v1/audit-logs/:id', crudDelete('audit-logs'));
async function depth() { try { const c = await jobsRepo.counts(); for (const s of ['queued','running','done','dlq']) M.queueDepth.set({ status: s }, c[s] || 0); } catch {} }
const PORT = Number(process.env.PORT) || 8080;
(async () => {
  if ((process.env.AUTO_MIGRATE || 'true') === 'true') await migrate();
  if ((process.env.AUTO_SEED || 'true') === 'true') await seed();
  startMetricsServer();
  setInterval(depth, 5000); depth();
  app.listen(PORT, () => console.log('[shopdesk-api] :' + PORT));
})().catch((e) => { console.error('boot falhou', e); process.exit(1); });
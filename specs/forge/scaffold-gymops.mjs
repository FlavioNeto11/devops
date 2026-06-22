// =============================================================================
// scaffold-gymops.mjs — GERA um app GYMOPS-style DEPLOYÁVEL a partir dos blocos de
// capacidade de um produto (stack gymops). Capacidades distintas do gymops: **Fastify**
// (não Express), **Redis/BullMQ** (fila, não Postgres-transacional), **RBAC multi-tenant**,
// + gateway externo + observabilidade. Recurso genérico "records". Sem implementação manual.
//
// (OIDC real exige client no Keycloak — aqui a identidade vem por header X-Tenant-Id/X-Role
//  como stand-in da sessão; ver nota no CLAUDE.md gerado.)
//
// Uso:  node scaffold-gymops.mjs --product <name> [--force]
// =============================================================================
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { loadCatalog, resolveBlocks } from './apply-capabilities.mjs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const SPECS_DIR = path.resolve(__dirname, '..');
const REPO_ROOT = path.resolve(SPECS_DIR, '..');

function parseArgs(argv) { const a = {}; for (let i = 0; i < argv.length; i++) { if (argv[i] === '--product') a.product = argv[++i]; else if (argv[i] === '--force') a.force = true; } return a; }
const args = parseArgs(process.argv.slice(2));
if (!args.product) { console.error('uso: node scaffold-gymops.mjs --product <name> [--force]'); process.exit(2); }
const pp = path.join(SPECS_DIR, 'products', args.product, 'product.json');
if (!fs.existsSync(pp)) { console.error(`produto não encontrado: ${pp}`); process.exit(1); }
const product = JSON.parse(fs.readFileSync(pp, 'utf8'));
if (product.stack !== 'gymops') { console.error(`scaffold-gymops só gera stack gymops (produto é ${product.stack})`); process.exit(1); }

const byId = loadCatalog();
const blocks = resolveBlocks(product.capability_blocks || [], 'gymops', byId);
const has = (id) => blocks.includes(id);
const F = { redis: has('redis-bullmq'), gateway: has('gateway-externo'), rbac: has('rbac-multitenant'), idem: has('idempotencia') };

const APP = product.name;
const TITLE = product.display_name || APP;
const BASE = product.base_path || ('/' + APP);
const APPDIR = path.join(REPO_ROOT, 'apps', APP);

const files = {};
const add = (rel, content) => { files[rel] = content; };

const deps = { fastify: '^4.28.1', pg: '^8.11.5', 'prom-client': '^15.1.2' };
if (F.redis) { deps.bullmq = '^5.12.0'; deps.ioredis = '^5.4.1'; }
add('api/package.json', JSON.stringify({
  name: '@@APP@@-api', version: '1.0.0', private: true, type: 'module',
  description: '@@TITLE@@ — gerado pela Forge (gymops-style: Fastify + Redis/BullMQ + RBAC).',
  scripts: { start: 'node src/server.js', worker: 'node src/worker.js', test: 'node --test test' },
  dependencies: deps,
}, null, 2) + '\n');

add('api/Dockerfile', [
  '# @@TITLE@@ API' + (F.redis ? ' + worker BullMQ' : '') + ' (Fastify) — gerado pela Forge.',
  'FROM node:20-alpine', 'WORKDIR /app', 'ENV NODE_ENV=production',
  'COPY package*.json ./',
  'RUN if [ -f package-lock.json ]; then npm ci --omit=dev; else npm install --omit=dev; fi',
  'COPY src ./src', 'EXPOSE 8080 9464', 'USER node', 'CMD ["npm", "start"]', '',
].join('\n'));

// db.js (pg + migrations multi-tenant)
add('api/src/db.js', [
  '// db.js — pool Postgres + migrations multi-tenant. Gerado pela Forge (gymops-style).',
  "import pg from 'pg';",
  'export const pool = new pg.Pool({ connectionString: process.env.DATABASE_URL });',
  "const MIGRATIONS = [`CREATE TABLE IF NOT EXISTS records (id SERIAL PRIMARY KEY, tenant_id INTEGER NOT NULL DEFAULT 1, title TEXT NOT NULL, status TEXT NOT NULL DEFAULT 'open', external_ref TEXT, created_at TIMESTAMPTZ DEFAULT now(), updated_at TIMESTAMPTZ DEFAULT now());`];",
  'export async function migrate() {',
  '  const c = await pool.connect();',
  "  try { await c.query('SELECT pg_advisory_lock(66021)');",
  '    await c.query(`CREATE TABLE IF NOT EXISTS schema_migrations (version INTEGER PRIMARY KEY)`);',
  "    const done = new Set((await c.query('SELECT version FROM schema_migrations')).rows.map((r) => r.version));",
  '    for (let i = 0; i < MIGRATIONS.length; i++) { const v = i + 1; if (done.has(v)) continue;',
  "      await c.query('BEGIN'); try { await c.query(MIGRATIONS[i]); await c.query('INSERT INTO schema_migrations(version) VALUES ($1)', [v]); await c.query('COMMIT'); } catch (e) { await c.query('ROLLBACK'); throw e; }",
  "      console.log('[migrate] ' + v); }",
  "  } finally { await c.query('SELECT pg_advisory_unlock(66021)').catch(() => {}); c.release(); }",
  '}',
  "export async function seed() { const { rows } = await pool.query('SELECT count(*)::int n FROM records'); if (rows[0].n === 0) await pool.query(`INSERT INTO records(title) VALUES ('Exemplo')`); }", '',
].join('\n'));

// rbac.js (multi-tenant RBAC, se bloco)
if (F.rbac) add('api/src/rbac.js', [
  '// rbac.js — RBAC multi-tenant (bloco rbac-multitenant). Papéis em cascata; deny por padrão.',
  "// NOTA: identidade via header (X-Tenant-Id/X-Role) como stand-in da sessão OIDC (login real = client no Keycloak).",
  "const RANK = { admin: 3, manager: 2, member: 1 };",
  'export function authContext(req) { return { tenantId: Number(req.headers["x-tenant-id"]) || 1, role: (req.headers["x-role"] || "member").toLowerCase() }; }',
  'export function requireRole(role) { return async (req, reply) => { const ctx = authContext(req); if ((RANK[ctx.role] || 0) < (RANK[role] || 99)) { reply.code(403).send({ error: { message: "acesso negado (precisa de " + role + ")" } }); return reply; } }; }', '',
].join('\n'));

// queue.js (BullMQ + Redis + fallback inline)
if (F.redis) add('api/src/queue.js', [
  '// queue.js — fila Redis/BullMQ (bloco redis-bullmq) com degradação graciosa sem Redis.',
  "import { Queue } from 'bullmq';",
  "const url = process.env.REDIS_URL || '';",
  'let _q = null;',
  'function conn() { const u = new URL(url); return { host: u.hostname, port: Number(u.port) || 6379 }; }',
  'export function queue() { if (!url) return null; if (!_q) _q = new Queue("records-submit", { connection: conn() }); return _q; }',
  'export async function enqueueSubmit(recordId) {',
  '  const q = queue();',
  '  if (!q) { return { inline: true }; } // sem Redis -> o caller processa inline (degradação graciosa)',
  '  await q.add("submit", { recordId }, { jobId: "submit-" + recordId, attempts: 4, backoff: { type: "exponential", delay: 1000 }, removeOnComplete: 100, removeOnFail: 200 });',
  '  return { inline: false };',
  '}',
  'export async function queueCounts() { const q = queue(); if (!q) return { redis: false }; const c = await q.getJobCounts("waiting", "active", "completed", "failed", "delayed"); return { redis: true, ...c }; }', '',
].join('\n'));

// gateway.js (se gateway)
if (F.gateway) add('api/src/gateway.js', [
  '// gateway.js — ÚNICA porta de saída para o sistema externo. Gerado pela Forge.',
  "const BASE = process.env.EXTERNAL_BASE_URL || 'http://@@APP@@-mock-central:8090';",
  'export async function dispatch(record, retries = 2) { let last;',
  '  for (let a = 0; a <= retries; a++) {',
  "    try { const r = await fetch(BASE + '/dispatch', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ id: record.id, title: record.title }), signal: AbortSignal.timeout(4000) });",
  "      if (r.status >= 500) { last = new Error('externo ' + r.status); } else if (!r.ok) { throw new Error('externo ' + r.status); } else { const j = await r.json().catch(() => ({})); return { externalRef: j.ref || ('EXT-' + record.id) }; } }",
  '    catch (e) { last = e; }',
  '    if (a < retries) await new Promise((res) => setTimeout(res, 150 * (a + 1)));',
  '  } throw last; }', '',
].join('\n'));

// metrics.js (observabilidade)
add('api/src/metrics.js', [
  '// metrics.js — observabilidade por padrão: métricas Prometheus na :9464. Gerado pela Forge.',
  "import http from 'node:http';",
  "import client from 'prom-client';",
  'const registry = new client.Registry();',
  "client.collectDefaultMetrics({ register: registry, prefix: '@@APP@@_' });",
  "export const M = { recordsTotal: new client.Counter({ name: '@@APP@@_records_total', help: 'records', labelNames: ['outcome'], registers: [registry] }),",
  (F.redis ? "  jobsTotal: new client.Counter({ name: '@@APP@@_jobs_total', help: 'jobs', labelNames: ['status'], registers: [registry] })," : ''),
  (F.gateway ? "  gatewayCalls: new client.Counter({ name: '@@APP@@_gateway_calls_total', help: 'gateway', labelNames: ['outcome'], registers: [registry] })," : ''),
  "  httpErrors: new client.Counter({ name: '@@APP@@_http_errors_total', help: 'erros', registers: [registry] }) };",
  "export function startMetricsServer(port = Number(process.env.METRICS_PORT) || 9464) {",
  "  const srv = http.createServer(async (req, res) => { if (req.url === '/metrics') { res.setHeader('Content-Type', registry.contentType); res.end(await registry.metrics()); } else { res.statusCode = 404; res.end('nf'); } });",
  "  srv.listen(port, () => console.log('[metrics] :' + port)); return srv; }", '',
].filter((l) => l !== '').join('\n'));

// server.js (Fastify)
const serverLines = [
  '// server.js — API Fastify (gymops-style). Servida em @@BASE@@/api (stripPrefix). Gerado pela Forge.',
  "import Fastify from 'fastify';",
  "import { pool, migrate, seed } from './db.js';",
  "import { M, startMetricsServer } from './metrics.js';",
];
if (F.rbac) serverLines.push("import { authContext, requireRole } from './rbac.js';");
if (F.redis) serverLines.push("import { enqueueSubmit, queueCounts } from './queue.js';");
serverLines.push(
  'const app = Fastify({ logger: false });',
  F.rbac
    ? "app.addHook('onRequest', async (req) => { const ctx = authContext(req); req.tenantId = ctx.tenantId; req.role = ctx.role; });"
    : "app.addHook('onRequest', async (req) => { req.tenantId = Number(req.headers['x-tenant-id']) || 1; });",
  "app.get('/', async () => ({ app: '@@APP@@', service: 'api', ok: true }));",
  "app.get('/health', async () => { await pool.query('SELECT 1'); return { status: 'ok', db: 'connected' }; });",
  (F.redis ? "app.get('/v1/health/queue', async () => ({ status: 'ok', queue: await queueCounts() }));" : ''),
  "app.get('/v1/records', async (req) => ({ data: (await pool.query('SELECT * FROM records WHERE tenant_id=$1 ORDER BY id DESC LIMIT 200', [req.tenantId])).rows }));",
  "app.post('/v1/records', async (req, reply) => { const b = req.body || {}; if (!b.title) { reply.code(400); return { error: { message: 'title obrigatório' } }; } const r = (await pool.query('INSERT INTO records(tenant_id,title) VALUES ($1,$2) RETURNING *', [req.tenantId, b.title])).rows[0]; M.recordsTotal.inc({ outcome: 'created' }); reply.code(201); return r; });",
  "app.get('/v1/records/:id', async (req, reply) => { const r = (await pool.query('SELECT * FROM records WHERE tenant_id=$1 AND id=$2', [req.tenantId, Number(req.params.id)])).rows[0]; if (!r) { reply.code(404); return { error: { message: 'não encontrado' } }; } return r; });",
);
if (F.rbac) serverLines.push("app.delete('/v1/records/:id', { preHandler: requireRole('admin') }, async (req) => { await pool.query('DELETE FROM records WHERE tenant_id=$1 AND id=$2', [req.tenantId, Number(req.params.id)]); return { deleted: true }; });");
if (F.redis) serverLines.push("app.post('/v1/records/:id/submit', async (req, reply) => { const id = Number(req.params.id); const r = (await pool.query('SELECT id FROM records WHERE tenant_id=$1 AND id=$2', [req.tenantId, id])).rows[0]; if (!r) { reply.code(404); return { error: { message: 'não encontrado' } }; } await pool.query(\"UPDATE records SET status='submitting', updated_at=now() WHERE id=$1\", [id]); const e = await enqueueSubmit(id); reply.code(202); return { id, status: 'submitting', enqueued: !e.inline }; });");
serverLines.push(
  'const PORT = Number(process.env.PORT) || 8080;',
  '(async () => {',
  "  if ((process.env.AUTO_MIGRATE || 'true') === 'true') await migrate();",
  "  if ((process.env.AUTO_SEED || 'true') === 'true') await seed();",
  '  startMetricsServer();',
  "  await app.listen({ port: PORT, host: '0.0.0.0' });",
  "  console.log('[@@APP@@-api] :' + PORT);",
  "})().catch((e) => { console.error('boot falhou', e); process.exit(1); });", '',
);
add('api/src/server.js', serverLines.filter((l) => l !== '').join('\n'));

// worker.js (BullMQ, se redis)
if (F.redis) add('api/src/worker.js', [
  '// worker.js — consumidor BullMQ (bloco redis-bullmq). Processa submit -> gateway -> status.',
  "import { Worker } from 'bullmq';",
  "import { pool, migrate } from './db.js';",
  "import { M, startMetricsServer } from './metrics.js';",
  (F.gateway ? "import { dispatch } from './gateway.js';" : ''),
  "const url = process.env.REDIS_URL || '';",
  'function conn() { const u = new URL(url); return { host: u.hostname, port: Number(u.port) || 6379 }; }',
  'async function handle(job) {',
  "  const id = job.data.recordId;",
  "  const rec = (await pool.query('SELECT id,title FROM records WHERE id=$1', [id])).rows[0] || { id, title: 'Record ' + id };",
  (F.gateway
    ? "  let res; try { res = await dispatch(rec); M.gatewayCalls.inc({ outcome: 'ok' }); } catch (e) { M.gatewayCalls.inc({ outcome: 'error' }); throw e; }\n  await pool.query(\"UPDATE records SET status='submitted', external_ref=$2, updated_at=now() WHERE id=$1\", [id, res.externalRef]);"
    : "  await pool.query(\"UPDATE records SET status='submitted', updated_at=now() WHERE id=$1\", [id]);"),
  '}',
  "(async () => { if ((process.env.AUTO_MIGRATE || 'true') === 'true') await migrate().catch(() => {}); startMetricsServer();",
  '  if (!url) { console.warn("[worker] sem REDIS_URL — fila inativa"); return; }',
  '  const w = new Worker("records-submit", async (job) => { await handle(job); M.jobsTotal.inc({ status: "done" }); console.log("[worker] job " + job.id + " OK"); }, { connection: conn() });',
  '  w.on("failed", (job, err) => { M.jobsTotal.inc({ status: "failed" }); if (job && job.attemptsMade >= (job.opts.attempts || 1)) pool.query("UPDATE records SET status=\'failed\', updated_at=now() WHERE id=$1", [job.data.recordId]).catch(() => {}); console.warn("[worker] job falhou: " + (err && err.message)); });',
  '  console.log("[@@APP@@-worker] BullMQ iniciado");',
  "  process.on('SIGTERM', async () => { await w.close(); process.exit(0); });",
  '})();', '',
].filter((l) => l !== '').join('\n'));

// mock-central (se gateway)
if (F.gateway) {
  add('mock-central/server.js', [
    "// mock-central — externo SIMULADO (prova gateway + retry). Gerado pela Forge.",
    "import http from 'node:http';",
    'const seen = new Map(); let calls = 0;',
    'const s = http.createServer((req, res) => {',
    "  if (req.method === 'GET' && req.url === '/health') { res.end(JSON.stringify({ status: 'ok', calls })); return; }",
    "  if (req.method !== 'POST' || req.url !== '/dispatch') { res.statusCode = 404; res.end('nf'); return; }",
    "  let b = ''; req.on('data', (c) => (b += c)); req.on('end', () => { calls++; let o = {}; try { o = JSON.parse(b || '{}'); } catch {} const n = (seen.get(o.id) || 0) + 1; seen.set(o.id, n);",
    "    if (String(o.title || '').toUpperCase().includes('FALHA') || n === 1) { res.statusCode = 503; res.end(JSON.stringify({ error: 'indisponivel', attempt: n })); return; }",
    "    res.statusCode = 200; res.end(JSON.stringify({ ref: 'EXT-' + o.id })); }); });",
    "s.listen(Number(process.env.PORT) || 8090, () => console.log('[@@APP@@-mock-central] :8090'));", '',
  ].join('\n'));
  add('mock-central/Dockerfile', 'FROM node:20-alpine\nWORKDIR /app\nCOPY server.js ./\nEXPOSE 8090\nUSER node\nCMD ["node", "server.js"]\n');
}

add('devops.yaml', [
  'app: { name: @@APP@@, namespace: apps, host: nvit.localhost, basePath: @@BASE@@ }',
  '# Gerado pela FORGE (gymops-style: Fastify + Redis/BullMQ + RBAC). Blocos: ' + blocks.join(', '),
  'services:',
  '  api: { type: api, path: /api, port: 8080, expose: true, stripPrefix: true, priority: 40, health: { path: /health } }',
  (F.redis ? '  worker: { type: worker, port: 9464, expose: false, command: ["npm", "run", "worker"] }' : ''),
  (F.redis ? 'dependencies: { redis: { image: "redis:7-alpine" } }' : ''),
  'observability: { metricsPort: 9464, serviceMonitor: true, prometheusRule: true }', '',
].filter((l) => l !== '').join('\n'));

add('k8s/@@APP@@.yaml', buildK8s());
add('CLAUDE.md', '# @@TITLE@@ — gerado pela Forge (gymops-style)\n\nFastify + Postgres' + (F.redis ? ' + Redis/BullMQ' : '') + (F.rbac ? ' + RBAC multi-tenant' : '') + '. Blocos: ' + blocks.join(', ') + '.\n\n' + (F.rbac ? '> RBAC por header X-Tenant-Id/X-Role (stand-in da sessão OIDC; login real = client no Keycloak realm nvit).\n\n' : '') + 'Verificar: `BASE_URL=http://nvit.localhost@@BASE@@/api node apps/@@APP@@/test/integration.mjs`\n');
add('test/integration.mjs', buildTest());

function buildTest() {
  const L = [
    "const API = (process.env.BASE_URL || 'http://nvit.localhost@@BASE@@/api').replace(/\\/$/, '');",
    "const H = (extra) => ({ 'Content-Type': 'application/json', ...extra });",
    "const post = (p, b, h) => fetch(API + p, { method: 'POST', headers: H(h), body: JSON.stringify(b || {}) }).then(async (r) => ({ s: r.status, j: await r.json().catch(() => ({})) }));",
    "const del = (p, h) => fetch(API + p, { method: 'DELETE', headers: H(h) }).then((r) => r.status);",
    "const get = (p, h) => fetch(API + p, { headers: H(h) }).then(async (r) => ({ s: r.status, j: await r.json().catch(() => ({})) }));",
    "const ok = (c, m) => { if (!c) { console.error('FAIL:', m); process.exitCode = 1; } else console.log('ok -', m); };",
    "const sleep = (ms) => new Promise((r) => setTimeout(r, ms));",
    "ok((await get('/health')).j.status === 'ok', 'health + db (Fastify)');",
    "const r1 = (await post('/v1/records', { title: 'Teste' })).j; ok(r1.id, 'CRUD cria record');",
  ];
  if (F.rbac) L.push(
    "ok(await del('/v1/records/' + r1.id, { 'X-Role': 'member' }) === 403, 'RBAC: member não pode deletar (403)');",
    "ok(await del('/v1/records/999999', { 'X-Role': 'admin' }) === 200, 'RBAC: admin pode deletar (200)');",
    "ok((await get('/v1/records/' + r1.id, { 'X-Tenant-Id': '2' })).s === 404, 'multi-tenant: outro tenant não vê (404)');");
  if (F.redis) L.push(
    "const r2 = (await post('/v1/records', { title: 'Async' })).j;",
    "ok((await post('/v1/records/' + r2.id + '/submit', {})).j.enqueued === true, 'Redis/BullMQ: submit enfileirado');",
    "let a = {}; for (let i = 0; i < 12; i++) { await sleep(3000); a = (await get('/v1/records/' + r2.id)).j; if (a.status === 'submitted' || a.status === 'failed') break; }",
    "ok(a.status === 'submitted', 'BullMQ worker + gateway: record submetido');");
  L.push("console.log(process.exitCode ? 'FALHOU' : 'OK — gymops-style robusto');", '');
  return L.join('\n');
}

function dep(name, image, port) {
  return ['---', 'apiVersion: apps/v1', 'kind: Deployment',
    `metadata: { name: @@APP@@-${name}, namespace: apps, labels: { app.kubernetes.io/name: @@APP@@-${name}, app.kubernetes.io/part-of: @@APP@@ } }`,
    'spec:', '  replicas: 1', `  selector: { matchLabels: { app.kubernetes.io/name: @@APP@@-${name} } }`,
    '  template:', `    metadata: { labels: { app.kubernetes.io/name: @@APP@@-${name}, app.kubernetes.io/part-of: @@APP@@ } }`,
    `    spec: { containers: [ { name: ${name}, image: ${image}, ports: [ { containerPort: ${port} } ] } ] }`,
    '---', 'apiVersion: v1', 'kind: Service',
    `metadata: { name: @@APP@@-${name}, namespace: apps, labels: { app.kubernetes.io/part-of: @@APP@@ } }`,
    `spec: { selector: { app.kubernetes.io/name: @@APP@@-${name} }, ports: [ { port: ${port}, targetPort: ${port} } ] }`].join('\n');
}

function buildK8s() {
  const L = ['# @@TITLE@@ — k8s gerado pela Forge (gymops-style). Imagens :local.'];
  // postgres
  L.push('---', 'apiVersion: v1', 'kind: PersistentVolumeClaim', 'metadata: { name: @@APP@@-postgres, namespace: apps, labels: { app.kubernetes.io/part-of: @@APP@@ } }', 'spec: { accessModes: [ReadWriteOnce], resources: { requests: { storage: 1Gi } } }');
  L.push('---', 'apiVersion: apps/v1', 'kind: Deployment',
    'metadata: { name: @@APP@@-postgres, namespace: apps, labels: { app.kubernetes.io/name: @@APP@@-postgres, app.kubernetes.io/part-of: @@APP@@ } }',
    'spec:', '  replicas: 1', '  strategy: { type: Recreate }', '  selector: { matchLabels: { app.kubernetes.io/name: @@APP@@-postgres } }',
    '  template:', '    metadata: { labels: { app.kubernetes.io/name: @@APP@@-postgres, app.kubernetes.io/part-of: @@APP@@ } }',
    '    spec:', '      containers:', '        - name: postgres', '          image: postgres:16-alpine',
    '          envFrom: [ { secretRef: { name: @@APP@@-db } } ]', '          ports: [ { containerPort: 5432 } ]',
    '          volumeMounts: [ { name: data, mountPath: /var/lib/postgresql/data, subPath: pgdata } ]',
    '      volumes: [ { name: data, persistentVolumeClaim: { claimName: @@APP@@-postgres } } ]');
  L.push('---', 'apiVersion: v1', 'kind: Service', 'metadata: { name: @@APP@@-postgres, namespace: apps, labels: { app.kubernetes.io/part-of: @@APP@@ } }', 'spec: { selector: { app.kubernetes.io/name: @@APP@@-postgres }, ports: [ { port: 5432, targetPort: 5432 } ] }');
  if (F.redis) L.push(dep('redis', 'redis:7-alpine', 6379));
  if (F.gateway) L.push(dep('mock-central', '@@APP@@-mock-central:local', 8090));
  // api
  const apiEnv = ['            - { name: METRICS_PORT, value: "9464" }', '            - { name: AUTO_MIGRATE, value: "true" }', '            - { name: AUTO_SEED, value: "true" }'];
  if (F.redis) apiEnv.unshift('            - { name: REDIS_URL, value: "redis://@@APP@@-redis:6379" }');
  if (F.gateway) apiEnv.unshift('            - { name: EXTERNAL_BASE_URL, value: "http://@@APP@@-mock-central:8090" }');
  L.push('---', 'apiVersion: apps/v1', 'kind: Deployment', 'metadata:', '  name: @@APP@@-api', '  namespace: apps',
    '  labels: { app.kubernetes.io/name: @@APP@@-api, app.kubernetes.io/component: api, app.kubernetes.io/part-of: @@APP@@, devops.flavioneto/app-type: product_software }',
    '  annotations: { devops.flavioneto/app: @@APP@@, devops.flavioneto/metrics-port: "9464" }',
    'spec:', '  replicas: 1', '  selector: { matchLabels: { app.kubernetes.io/name: @@APP@@-api } }',
    '  template:', '    metadata: { labels: { app.kubernetes.io/name: @@APP@@-api, app.kubernetes.io/component: api, app.kubernetes.io/part-of: @@APP@@ } }',
    '    spec:', '      containers:', '        - name: api', '          image: @@APP@@-api:local', '          imagePullPolicy: IfNotPresent',
    '          command: ["npm", "start"]', '          envFrom: [ { secretRef: { name: @@APP@@-db } } ]', '          env:', ...apiEnv,
    '          ports:', '            - { name: http, containerPort: 8080 }', '            - { name: metrics, containerPort: 9464 }',
    '          readinessProbe: { httpGet: { path: /health, port: 8080 }, initialDelaySeconds: 8, periodSeconds: 10 }');
  L.push('---', 'apiVersion: v1', 'kind: Service', 'metadata: { name: @@APP@@-api, namespace: apps, labels: { app.kubernetes.io/name: @@APP@@-api, app.kubernetes.io/part-of: @@APP@@ } }', 'spec: { selector: { app.kubernetes.io/name: @@APP@@-api }, ports: [ { name: http, port: 8080, targetPort: 8080 }, { name: metrics, port: 9464, targetPort: 9464 } ] }');
  if (F.redis) {
    const wEnv = ['            - { name: REDIS_URL, value: "redis://@@APP@@-redis:6379" }', '            - { name: METRICS_PORT, value: "9464" }', '            - { name: AUTO_MIGRATE, value: "false" }'];
    if (F.gateway) wEnv.unshift('            - { name: EXTERNAL_BASE_URL, value: "http://@@APP@@-mock-central:8090" }');
    L.push('---', 'apiVersion: apps/v1', 'kind: Deployment', 'metadata:', '  name: @@APP@@-worker', '  namespace: apps',
      '  labels: { app.kubernetes.io/name: @@APP@@-worker, app.kubernetes.io/component: worker, app.kubernetes.io/part-of: @@APP@@ }',
      '  annotations: { devops.flavioneto/app: @@APP@@, devops.flavioneto/metrics-port: "9464" }',
      'spec:', '  replicas: 1', '  selector: { matchLabels: { app.kubernetes.io/name: @@APP@@-worker } }',
      '  template:', '    metadata: { labels: { app.kubernetes.io/name: @@APP@@-worker, app.kubernetes.io/component: worker, app.kubernetes.io/part-of: @@APP@@ } }',
      '    spec:', '      containers:', '        - name: worker', '          image: @@APP@@-api:local', '          imagePullPolicy: IfNotPresent',
      '          command: ["npm", "run", "worker"]', '          envFrom: [ { secretRef: { name: @@APP@@-db } } ]', '          env:', ...wEnv,
      '          ports: [ { name: metrics, containerPort: 9464 } ]');
    L.push('---', 'apiVersion: v1', 'kind: Service', 'metadata: { name: @@APP@@-worker, namespace: apps, labels: { app.kubernetes.io/name: @@APP@@-worker, app.kubernetes.io/part-of: @@APP@@ } }', 'spec: { selector: { app.kubernetes.io/name: @@APP@@-worker }, ports: [ { name: metrics, port: 9464, targetPort: 9464 } ] }');
  }
  L.push('---', 'apiVersion: traefik.io/v1alpha1', 'kind: Middleware', 'metadata: { name: @@APP@@-api-strip, namespace: apps }', 'spec: { stripPrefix: { prefixes: ["@@BASE@@/api"] } }');
  L.push('---', 'apiVersion: traefik.io/v1alpha1', 'kind: IngressRoute', 'metadata: { name: @@APP@@, namespace: apps, labels: { app.kubernetes.io/part-of: @@APP@@ } }',
    'spec:', '  entryPoints: [web]', '  routes:', '    - match: PathPrefix(`@@BASE@@/api`)', '      kind: Rule', '      priority: 40', '      services: [ { name: @@APP@@-api, port: 8080 } ]', '      middlewares: [ { name: @@APP@@-api-strip } ]');
  L.push('---', 'apiVersion: monitoring.coreos.com/v1', 'kind: ServiceMonitor', 'metadata: { name: @@APP@@, namespace: apps, labels: { app.kubernetes.io/part-of: @@APP@@, release: kube-prometheus-stack } }',
    'spec:', '  selector: { matchLabels: { app.kubernetes.io/part-of: @@APP@@ } }', '  namespaceSelector: { matchNames: [apps] }', '  endpoints: [ { port: metrics, path: /metrics, interval: 15s } ]');
  L.push('---', 'apiVersion: monitoring.coreos.com/v1', 'kind: PrometheusRule', 'metadata: { name: @@APP@@-slo, namespace: apps, labels: { app.kubernetes.io/part-of: @@APP@@, release: kube-prometheus-stack } }',
    'spec:', '  groups:', '    - name: @@APP@@.slo', '      rules:',
    '        - alert: @@APP@@ApiDown', '          expr: absent(up{job=~".*@@APP@@-api.*"} == 1)', '          for: 3m', '          labels: { severity: critical, app: @@APP@@ }', '          annotations: { summary: "@@APP@@: API sem target UP" }');
  return L.join('\n') + '\n';
}

const replace = (s) => s.replace(/@@APP@@/g, APP).replace(/@@TITLE@@/g, TITLE).replace(/@@BASE@@/g, BASE);
let written = 0;
for (const [rel, content] of Object.entries(files)) {
  const dest = path.join(APPDIR, replace(rel));
  if (fs.existsSync(dest) && !args.force) { console.log('[skip] ' + path.relative(REPO_ROOT, dest)); continue; }
  fs.mkdirSync(path.dirname(dest), { recursive: true });
  fs.writeFileSync(dest, replace(content));
  written++;
}
fs.mkdirSync(path.join(APPDIR, '.forge'), { recursive: true });
fs.writeFileSync(path.join(APPDIR, '.forge', 'applied-capabilities.json'), JSON.stringify({ app: APP, stack: 'gymops', blocks, generatedBy: 'scaffold-gymops.mjs' }, null, 2) + '\n');
console.log(`[scaffold-gymops] ${APP} (${blocks.length} blocos) — ${written} arquivos`);
console.log(`  blocos: ${blocks.join(', ')}`);
console.log(`  redis=${F.redis} gateway=${F.gateway} rbac=${F.rbac}`);

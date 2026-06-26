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
import { kitDeps, packKits } from './vendor-kits.mjs';

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
const F = { redis: has('redis-bullmq'), gateway: has('gateway-externo'), rbac: has('rbac-multitenant'), idem: has('idempotencia'), oidc: has('oidc-sessao'), pgvector: has('rag-pgvector'), contas: has('contas-acesso') };

const APP = product.name;
const TITLE = product.display_name || APP;
const BASE = product.base_path || ('/' + APP);
const APPDIR = path.join(REPO_ROOT, 'apps', APP);

const files = {};
const add = (rel, content) => { files[rel] = content; };

// Kits @flavioneto11 que os BLOCOS do produto declaram reusar (campo `reuses` do catálogo) — vão
// VENDORADOS como .tgz em api/vendor (cadeia transitiva resolvida pelo helper; frontend-only filtrados).
const kitRefs = [...new Set(blocks.flatMap((b) => (byId.get(b) && byId.get(b).reuses) || []))];
const deps = { fastify: '^4.28.1', pg: '^8.11.5', 'prom-client': '^15.1.2', ...kitDeps(kitRefs) };
if (F.redis) { deps.bullmq = '^5.12.0'; deps.ioredis = '^5.4.1'; }
if (F.contas) { deps.bcryptjs = '^2.4.3'; deps.jsonwebtoken = '^9.0.2'; deps['@fastify/rate-limit'] = '^9.1.0'; } // bloco contas-acesso: auth própria (puro JS, alpine-friendly) + rate-limit nas rotas de auth
add('api/package.json', JSON.stringify({
  name: '@@APP@@-api', version: '1.0.0', private: true, type: 'module',
  description: '@@TITLE@@ — gerado pela Forge (gymops-style: Fastify + Redis/BullMQ + RBAC).',
  scripts: { start: 'node src/server.js', worker: 'node src/worker.js', test: 'node --test "test/**/*.test.mjs"' },
  dependencies: deps,
}, null, 2) + '\n');

add('api/Dockerfile', [
  '# @@TITLE@@ API' + (F.redis ? ' + worker BullMQ' : '') + ' (Fastify) — gerado pela Forge.',
  'FROM node:20-alpine', 'WORKDIR /app', 'ENV NODE_ENV=production',
  'COPY package*.json ./',
  'COPY vendor ./vendor',
  'RUN if [ -f package-lock.json ]; then npm ci --omit=dev; else npm install --omit=dev; fi',
  'COPY src ./src', 'EXPOSE 8080 9464', 'USER node', 'CMD ["npm", "start"]', '',
].join('\n'));
// vendor/ sempre existe (mesmo sem kits) p/ o COPY vendor nunca falhar; os .tgz são empacotados no fim.
add('api/vendor/.gitkeep', '');

// db.js (pg + migrations multi-tenant)
const migrationsLines = [
  "  `CREATE TABLE IF NOT EXISTS records (id SERIAL PRIMARY KEY, tenant_id INTEGER NOT NULL DEFAULT 1, title TEXT NOT NULL, status TEXT NOT NULL DEFAULT 'open', external_ref TEXT, created_at TIMESTAMPTZ DEFAULT now(), updated_at TIMESTAMPTZ DEFAULT now());`,",
];
// bloco contas-acesso: tabelas de identidade/sessão/auditoria (appendadas — versões estáveis).
if (F.contas) migrationsLines.push(
  "  `CREATE TABLE IF NOT EXISTS users (id SERIAL PRIMARY KEY, tenant_id INTEGER NOT NULL DEFAULT 1, email TEXT UNIQUE NOT NULL, name TEXT, password_hash TEXT, role TEXT NOT NULL DEFAULT 'member', is_active BOOLEAN NOT NULL DEFAULT true, created_at TIMESTAMPTZ DEFAULT now(), updated_at TIMESTAMPTZ DEFAULT now());`,",
  "  `CREATE TABLE IF NOT EXISTS sessions (id SERIAL PRIMARY KEY, user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE, refresh_hash TEXT NOT NULL, expires_at TIMESTAMPTZ NOT NULL, revoked_at TIMESTAMPTZ, created_at TIMESTAMPTZ DEFAULT now());`,",
  "  `CREATE TABLE IF NOT EXISTS audit_logs (id SERIAL PRIMARY KEY, tenant_id INTEGER, actor TEXT, action TEXT, entity TEXT, entity_id TEXT, created_at TIMESTAMPTZ DEFAULT now());`,",
);
const dbLines = [
  '// db.js — pool Postgres + migrations multi-tenant. Gerado pela Forge (gymops-style).',
  "import pg from 'pg';",
];
if (F.contas) dbLines.push("import { hashPassword } from './auth.js';"); // seed do admin de bootstrap usa o hasher do auth.js
dbLines.push(
  'export const pool = new pg.Pool({ connectionString: process.env.DATABASE_URL });',
  'const MIGRATIONS = [',
  ...migrationsLines,
  '];',
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
  '// Espera o Postgres aceitar conexões antes do migrate/boot. Sem isso, num cold start (o pod do',
  '// Postgres ainda subindo) o primeiro SELECT dava ECONNREFUSED e o processo MORRIA — só se',
  '// recuperava por sorte no CrashLoopBackOff. Retry com backoff até DB_WAIT_MS (default 60s).',
  'export async function waitForDb() {',
  '  const deadline = Date.now() + (Number(process.env.DB_WAIT_MS) || 60000);',
  '  let lastErr;',
  '  while (Date.now() < deadline) {',
  "    try { await pool.query('SELECT 1'); return; } catch (e) { lastErr = e; await new Promise((r) => setTimeout(r, 1500)); }",
  '  }',
  "  throw new Error('Postgres indisponível após espera: ' + (lastErr && lastErr.message ? lastErr.message : lastErr));",
  '}',
);
const seedLines = [
  'export async function seed() {',
  "  const { rows } = await pool.query('SELECT count(*)::int n FROM records'); if (rows[0].n === 0) await pool.query(`INSERT INTO records(title) VALUES ('Exemplo')`);",
];
// bloco contas-acesso: admin de bootstrap SÓ se BOOTSTRAP_ADMIN_EMAIL **e** _PASSWORD vierem do
// ambiente (sem senha default — nada de admin12345). Sem ambos: NÃO cria admin (aviso no log).
if (F.contas) seedLines.push(
  "  const bootEmail = process.env.BOOTSTRAP_ADMIN_EMAIL;",
  "  const bootPass = process.env.BOOTSTRAP_ADMIN_PASSWORD;",
  '  if (!bootEmail || !bootPass) {',
  "    console.warn('[seed] sem BOOTSTRAP_ADMIN_EMAIL/BOOTSTRAP_ADMIN_PASSWORD — admin de bootstrap NÃO criado (sem senha default).');",
  '  } else {',
  "    const email = String(bootEmail).toLowerCase();",
  "    const hash = await hashPassword(String(bootPass));",
  "    await pool.query('INSERT INTO users(tenant_id,email,name,password_hash,role) VALUES (1,$1,$2,$3,$4) ON CONFLICT (email) DO NOTHING', [email, 'Administrador', hash, 'admin']);",
  "    console.log('[seed] admin de bootstrap: ' + email);",
  '  }',
);
seedLines.push('}', '');
add('api/src/db.js', dbLines.concat(seedLines).join('\n'));

// auth.js (bloco contas-acesso) — autenticação própria self-contained: bcrypt + JWT + sessões
// (refresh guardado como hash sha256) + SSO Keycloak ADITIVO/OPCIONAL (userinfo). Sem deps nativas.
if (F.contas) add('api/src/auth.js', [
  '// auth.js — fundação de autenticação própria (bloco contas-acesso). Gerado pela Forge (gymops-style).',
  '// Hash de senha: bcryptjs (puro JS). Tokens: jsonwebtoken. Refresh: guardado como hash sha256.',
  '// SSO Keycloak ADITIVO e OPCIONAL: só ativa se OIDC_ISSUER estiver setado; nunca quebra o boot.',
  "import bcrypt from 'bcryptjs';",
  "import jwt from 'jsonwebtoken';",
  "import crypto from 'node:crypto';",
  "import { pool } from './db.js';",
  '',
  '// JWT_SECRET é FAIL-CLOSED em produção: sem ele NÃO emite/valida token (não cai num literal',
  '// previsível). Resolvido SOB DEMANDA (lazy) — não no topo do módulo — para que processos que',
  "// importam auth.js transitivamente (ex.: o worker via db.js -> hashPassword) mas NUNCA assinam/",
  '// verificam token não quebrem no boot por falta da chave (eles não precisam dela).',
  'function jwtSecret() {',
  '  const s = process.env.JWT_SECRET;',
  '  if (s) return s;',
  "  if (process.env.NODE_ENV === 'production') throw new Error('JWT_SECRET obrigatório em produção');",
  "  return 'dev-secret-change-me';",
  '}',
  "const ACCESS_TTL = process.env.ACCESS_TTL || '15m';",
  'const REFRESH_TTL_MS = 7 * 24 * 60 * 60 * 1000; // 7 dias',
  'const RANK = { admin: 3, manager: 2, member: 1 };',
  '',
  '// --- hashing de senha (nunca plaintext, nunca logado) ---',
  'export async function hashPassword(plain) { return bcrypt.hash(String(plain), 10); }',
  'export async function verifyPassword(plain, hash) { if (!hash) return false; try { return await bcrypt.compare(String(plain), hash); } catch { return false; } }',
  '',
  '// --- JWT de acesso (curto) ---',
  "export function signAccess(user) { return jwt.sign({ sub: String(user.id), email: user.email, role: user.role, tenantId: user.tenant_id || 1 }, jwtSecret(), { algorithm: 'HS256', expiresIn: ACCESS_TTL }); }",
  "export function verifyAccess(token) { try { return jwt.verify(token, jwtSecret(), { algorithms: ['HS256'] }); } catch { return null; } }",
  '',
  '// --- sessões / refresh (token cru ao cliente; HASH sha256 no banco) ---',
  "function sha256(s) { return crypto.createHash('sha256').update(String(s)).digest('hex'); }",
  'export async function issueSession(userId) {',
  "  const refresh = crypto.randomBytes(32).toString('hex');",
  '  const expires = new Date(Date.now() + REFRESH_TTL_MS);',
  "  await pool.query('INSERT INTO sessions(user_id,refresh_hash,expires_at) VALUES ($1,$2,$3)', [userId, sha256(refresh), expires]);",
  '  return refresh;',
  '}',
  '// rotaciona: valida o refresh, revoga o usado e emite um novo (retorna { user, refresh } ou null).',
  'export async function rotateSession(refresh) {',
  '  if (!refresh) return null;',
  "  const { rows } = await pool.query('SELECT s.id, s.user_id, s.expires_at, s.revoked_at FROM sessions s WHERE s.refresh_hash=$1', [sha256(refresh)]);",
  '  const s = rows[0];',
  '  if (!s || s.revoked_at || new Date(s.expires_at).getTime() < Date.now()) return null;',
  "  await pool.query('UPDATE sessions SET revoked_at=now() WHERE id=$1', [s.id]);",
  "  const u = (await pool.query('SELECT id,tenant_id,email,name,role,is_active FROM users WHERE id=$1', [s.user_id])).rows[0];",
  '  if (!u || !u.is_active) return null;',
  '  const next = await issueSession(u.id);',
  '  return { user: u, refresh: next };',
  '}',
  'export async function revokeSession(refresh) { if (!refresh) return; await pool.query(\'UPDATE sessions SET revoked_at=now() WHERE refresh_hash=$1 AND revoked_at IS NULL\', [sha256(refresh)]); }',
  '',
  '// --- preHandlers Fastify ---',
  'export async function requireAuth(req, reply) {',
  "  const h = req.headers['authorization'] || '';",
  "  const token = h.startsWith('Bearer ') ? h.slice(7) : '';",
  '  const claims = verifyAccess(token);',
  "  if (!claims) { reply.code(401).send({ error: { message: 'não autenticado' } }); return reply; }",
  '  req.authUser = { id: Number(claims.sub), email: claims.email, role: claims.role, tenantId: Number(claims.tenantId) || 1 };',
  '}',
  'export function requireRole(role) {',
  '  return async (req, reply) => {',
  '    const r = req.authUser && req.authUser.role;',
  "    if ((RANK[r] || 0) < (RANK[role] || 99)) { reply.code(403).send({ error: { message: 'acesso negado (precisa de ' + role + ')' } }); return reply; }",
  '  };',
  '}',
  '',
  '// --- auditoria best-effort (nunca quebra o fluxo) ---',
  'export async function audit(tenantId, actor, action, entity, entityId) {',
  "  try { await pool.query('INSERT INTO audit_logs(tenant_id,actor,action,entity,entity_id) VALUES ($1,$2,$3,$4,$5)', [tenantId || 1, actor || null, action, entity || null, entityId != null ? String(entityId) : null]); } catch {}",
  '}',
  '',
  '// --- helpers de usuário ---',
  "export function publicUser(u) { return { id: u.id, email: u.email, name: u.name, role: u.role }; }",
  'export async function findUserByEmail(email) { return (await pool.query(\'SELECT * FROM users WHERE email=$1\', [String(email || \'\').toLowerCase()])).rows[0] || null; }',
  '',
  '// --- SSO Keycloak ADITIVO/OPCIONAL ---',
  'export function ssoConfig() {',
  '  const issuer = process.env.OIDC_ISSUER || \'\';',
  '  return { enabled: !!issuer, issuer: issuer || undefined, clientId: process.env.OIDC_CLIENT_ID || undefined };',
  '}',
  '// valida o accessToken do IdP no endpoint userinfo do issuer; retorna o perfil (email/name) ou null.',
  'export async function ssoUserinfo(accessToken) {',
  '  const issuer = process.env.OIDC_ISSUER || \'\';',
  '  if (!issuer || !accessToken) return null;',
  "  const url = issuer.replace(/\\/$/, '') + '/protocol/openid-connect/userinfo';",
  '  try {',
  "    const r = await fetch(url, { headers: { Authorization: 'Bearer ' + accessToken }, signal: AbortSignal.timeout(5000) });",
  '    if (!r.ok) return null;',
  '    const j = await r.json();',
  '    // exige email VERIFICADO como chave de identidade — NUNCA preferred_username (spoofável).',
  '    if (!j.email || j.email_verified !== true) return null;',
  '    return { email: String(j.email).toLowerCase(), name: j.name || j.preferred_username || j.email };',
  '  } catch { return null; }',
  '}',
  '// upsert (provisioning) do usuário SSO por email; 1o login => role member.',
  'export async function ssoUpsertUser(profile) {',
  '  const existing = await findUserByEmail(profile.email);',
  '  if (existing) { if (!existing.is_active) return null; return existing; }',
  "  return (await pool.query('INSERT INTO users(tenant_id,email,name,role) VALUES (1,$1,$2,$3) RETURNING *', [profile.email, profile.name, 'member'])).rows[0];",
  '}', '',
].join('\n'));

// rbac.js (multi-tenant RBAC, se bloco)
if (F.rbac) add('api/src/rbac.js', [
  '// rbac.js — RBAC multi-tenant (bloco rbac-multitenant). Papéis em cascata; deny por padrão.',
  "// NOTA: identidade via header (X-Tenant-Id/X-Role) como stand-in da sessão OIDC (login real = client no Keycloak).",
  "const RANK = { admin: 3, manager: 2, member: 1 };",
  "// Identidade: pela borda OIDC (oauth2-proxy do Console -> X-Auth-Request-*) quando atrás do SSO;",
  "// senão pelos headers X-Role/X-Tenant-Id (teste local/direto). Sem login direto no app.",
  'export function authContext(req) {',
  '  const ssoEmail = req.headers["x-auth-request-email"] || req.headers["x-auth-request-user"] || "";',
  '  const ssoGroups = req.headers["x-auth-request-groups"] || "";',
  '  const role = ssoEmail ? (ssoGroups.includes("platform-admins") ? "admin" : "member") : (req.headers["x-role"] || "member").toLowerCase();',
  '  return { tenantId: Number(req.headers["x-tenant-id"]) || 1, role, user: ssoEmail || "local" };',
  '}',
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
  "client.collectDefaultMetrics({ register: registry, prefix: '@@METRIC@@_' });",
  "export const M = { recordsTotal: new client.Counter({ name: '@@METRIC@@_records_total', help: 'records', labelNames: ['outcome'], registers: [registry] }),",
  (F.redis ? "  jobsTotal: new client.Counter({ name: '@@METRIC@@_jobs_total', help: 'jobs', labelNames: ['status'], registers: [registry] })," : ''),
  (F.gateway ? "  gatewayCalls: new client.Counter({ name: '@@METRIC@@_gateway_calls_total', help: 'gateway', labelNames: ['outcome'], registers: [registry] })," : ''),
  "  httpErrors: new client.Counter({ name: '@@METRIC@@_http_errors_total', help: 'erros', registers: [registry] }) };",
  "export function startMetricsServer(port = Number(process.env.METRICS_PORT) || 9464) {",
  "  const srv = http.createServer(async (req, res) => { if (req.url === '/metrics') { res.setHeader('Content-Type', registry.contentType); res.end(await registry.metrics()); } else { res.statusCode = 404; res.end('nf'); } });",
  "  srv.listen(port, () => console.log('[metrics] :' + port)); return srv; }", '',
].filter((l) => l !== '').join('\n'));

// server.js (Fastify)
const serverLines = [
  '// server.js — API Fastify (gymops-style). Servida em @@BASE@@/api (stripPrefix). Gerado pela Forge.',
  "import Fastify from 'fastify';",
  "import { pool, migrate, seed, waitForDb } from './db.js';",
  "import { M, startMetricsServer } from './metrics.js';",
];
if (F.rbac) serverLines.push("import { authContext, requireRole } from './rbac.js';");
if (F.redis) serverLines.push("import { enqueueSubmit, queueCounts } from './queue.js';");
// bloco contas-acesso: auth própria. Alias do requireRole p/ não colidir com o do rbac.js.
if (F.contas) serverLines.push("import { requireAuth, requireRole as requireAuthRole, hashPassword, verifyPassword, signAccess, issueSession, rotateSession, revokeSession, audit, publicUser, findUserByEmail, ssoConfig, ssoUserinfo, ssoUpsertUser } from './auth.js';");
serverLines.push(
  'const app = Fastify({ logger: false });',
);
// bloco contas-acesso: rate-limit nas rotas de auth (login/register/refresh) — degrada sem quebrar
// se o plugin faltar (try/catch). Registrado ANTES das rotas p/ o config.rateLimit por rota valer.
// Top-level await (ESM): a app é módulo; a registração resolve antes das declarações de rota abaixo.
if (F.contas) serverLines.push(
  '// rate-limit (bloco contas-acesso): global:false -> só vale onde a rota declara config.rateLimit.',
  'const AUTH_RATE = { max: Number(process.env.AUTH_RATE_MAX) || 10, timeWindow: process.env.AUTH_RATE_WINDOW || \'1 minute\' };',
  'let authRateLimitOn = false;',
  'try {',
  "  const rl = (await import('@fastify/rate-limit')).default;",
  '  await app.register(rl, { global: false });',
  '  authRateLimitOn = true;',
  '} catch (e) {',
  "  console.warn('[auth] @fastify/rate-limit indisponível — seguindo sem limite de taxa: ' + (e && e.message));",
  '}',
  '// helper: opções da rota com rate-limit SÓ se o plugin carregou (senão objeto vazio = sem limite).',
  'const authLimited = (opts) => authRateLimitOn ? { ...opts, config: { ...(opts && opts.config), rateLimit: AUTH_RATE } } : (opts || {});',
);
serverLines.push(
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
// bloco contas-acesso: rotas de autenticação/perfil/gerência de usuários + SSO (contrato da Forge).
if (F.contas) serverLines.push(
  "// --- auth: registro/login/refresh/logout (rate-limited p/ mitigar brute-force/abuso) ---",
  "app.post('/auth/register', authLimited(), async (req, reply) => {",
  "  const b = req.body || {}; const email = String(b.email || '').toLowerCase().trim(); const password = String(b.password || '');",
  "  if (!email || !b.name) { reply.code(400); return { error: { message: 'name e email obrigatórios' } }; }",
  "  if (password.length < 8) { reply.code(400); return { error: { message: 'senha deve ter ao menos 8 caracteres' } }; }",
  "  if (await findUserByEmail(email)) { reply.code(409); return { error: { message: 'email já cadastrado' } }; }",
  "  // registro público SEMPRE cria 'member' — admin vem só do seed de bootstrap (sem escalonamento via /auth/register).",
  "  const hash = await hashPassword(password);",
  "  const u = (await pool.query('INSERT INTO users(tenant_id,email,name,password_hash,role) VALUES (1,$1,$2,$3,$4) RETURNING *', [email, b.name, hash, 'member'])).rows[0];",
  "  const accessToken = signAccess(u); const refreshToken = await issueSession(u.id);",
  "  await audit(u.tenant_id, email, 'register', 'user', u.id);",
  "  reply.code(201); return { accessToken, refreshToken, user: publicUser(u) };",
  "});",
  "app.post('/auth/login', authLimited(), async (req, reply) => {",
  "  const b = req.body || {}; const email = String(b.email || '').toLowerCase().trim();",
  "  const u = await findUserByEmail(email);",
  "  if (!u || !u.is_active || !(await verifyPassword(String(b.password || ''), u.password_hash))) { reply.code(401); return { error: { message: 'credenciais inválidas' } }; }",
  "  const accessToken = signAccess(u); const refreshToken = await issueSession(u.id);",
  "  await audit(u.tenant_id, email, 'login', 'user', u.id);",
  "  return { accessToken, refreshToken, user: publicUser(u) };",
  "});",
  "app.post('/auth/refresh', authLimited(), async (req, reply) => {",
  "  const rot = await rotateSession((req.body || {}).refreshToken);",
  "  if (!rot) { reply.code(401); return { error: { message: 'refresh inválido' } }; }",
  "  return { accessToken: signAccess(rot.user), refreshToken: rot.refresh };",
  "});",
  "app.post('/auth/logout', async (req) => { await revokeSession((req.body || {}).refreshToken); return { ok: true }; });",
  "// --- perfil (sessão própria) ---",
  "app.get('/me', { preHandler: requireAuth }, async (req, reply) => {",
  "  const u = (await pool.query('SELECT id,email,name,role FROM users WHERE id=$1', [req.authUser.id])).rows[0];",
  "  if (!u) { reply.code(401); return { error: { message: 'não autenticado' } }; } return u;",
  "});",
  "app.patch('/me', { preHandler: requireAuth }, async (req, reply) => {",
  "  const b = req.body || {}; const sets = []; const vals = []; let i = 1; let pwChanged = false;",
  "  if (b.name != null) { sets.push('name=$' + i++); vals.push(String(b.name)); }",
  "  if (b.password != null) {",
  "    if (String(b.password).length < 8) { reply.code(400); return { error: { message: 'senha deve ter ao menos 8 caracteres' } }; }",
  "    // troca de senha exige a senha ATUAL (verifyPassword) — não basta o Bearer.",
  "    const cur = (await pool.query('SELECT password_hash FROM users WHERE id=$1', [req.authUser.id])).rows[0];",
  "    if (!cur || !(await verifyPassword(String(b.currentPassword || ''), cur.password_hash))) { reply.code(403); return { error: { message: 'senha atual inválida' } }; }",
  "    sets.push('password_hash=$' + i++); vals.push(await hashPassword(String(b.password))); pwChanged = true;",
  "  }",
  "  if (!sets.length) { reply.code(400); return { error: { message: 'nada para atualizar' } }; }",
  "  vals.push(req.authUser.id);",
  "  const u = (await pool.query('UPDATE users SET ' + sets.join(',') + ', updated_at=now() WHERE id=$' + i + ' RETURNING *', vals)).rows[0];",
  "  // ao trocar a senha, revoga TODAS as sessões ativas do usuário (refresh tokens deixam de valer).",
  "  if (pwChanged) { await pool.query('UPDATE sessions SET revoked_at=now() WHERE user_id=$1 AND revoked_at IS NULL', [req.authUser.id]); await audit(req.authUser.tenantId, req.authUser.email, 'password.change', 'user', req.authUser.id); }",
  "  return { user: publicUser(u) };",
  "});",
  "// --- gerência de usuários (somente admin) — ESCOPADA ao tenant do admin (isolamento) ---",
  "app.get('/v1/users', { preHandler: [requireAuth, requireAuthRole('admin')] }, async (req) => ({ data: (await pool.query('SELECT id,email,name,role,is_active,created_at FROM users WHERE tenant_id=$1 ORDER BY id ASC', [req.authUser.tenantId])).rows }));",
  "app.post('/v1/users', { preHandler: [requireAuth, requireAuthRole('admin')] }, async (req, reply) => {",
  "  const b = req.body || {}; const email = String(b.email || '').toLowerCase().trim(); const password = String(b.password || '');",
  "  if (!email || !b.name) { reply.code(400); return { error: { message: 'name e email obrigatórios' } }; }",
  "  if (password.length < 8) { reply.code(400); return { error: { message: 'senha deve ter ao menos 8 caracteres' } }; }",
  "  if (await findUserByEmail(email)) { reply.code(409); return { error: { message: 'email já cadastrado' } }; }",
  "  const role = ['admin', 'manager', 'member'].includes(b.role) ? b.role : 'member';",
  "  const hash = await hashPassword(password);",
  "  // criado no MESMO tenant do admin (não fixo 1).",
  "  const u = (await pool.query('INSERT INTO users(tenant_id,email,name,password_hash,role) VALUES ($1,$2,$3,$4,$5) RETURNING *', [req.authUser.tenantId, email, b.name, hash, role])).rows[0];",
  "  await audit(req.authUser.tenantId, req.authUser.email, 'user.create', 'user', u.id);",
  "  reply.code(201); return { user: publicUser(u) };",
  "});",
  "app.patch('/v1/users/:id', { preHandler: [requireAuth, requireAuthRole('admin')] }, async (req, reply) => {",
  "  const b = req.body || {}; const id = Number(req.params.id); const sets = []; const vals = []; let i = 1; let revoke = false;",
  "  if (b.role != null) { if (!['admin', 'manager', 'member'].includes(b.role)) { reply.code(400); return { error: { message: 'role inválido' } }; } sets.push('role=$' + i++); vals.push(b.role); revoke = true; }",
  "  if (b.is_active != null) { sets.push('is_active=$' + i++); vals.push(!!b.is_active); if (!b.is_active) revoke = true; }",
  "  if (!sets.length) { reply.code(400); return { error: { message: 'nada para atualizar' } }; }",
  "  vals.push(id); vals.push(req.authUser.tenantId);",
  "  // UPDATE escopado ao tenant do admin (não vaza/edita usuário de outro tenant).",
  "  const u = (await pool.query('UPDATE users SET ' + sets.join(',') + ', updated_at=now() WHERE id=$' + i + ' AND tenant_id=$' + (i + 1) + ' RETURNING *', vals)).rows[0];",
  "  if (!u) { reply.code(404); return { error: { message: 'não encontrado' } }; }",
  "  // rebaixar papel OU desativar revoga as sessões ativas do usuário-alvo (acesso some imediatamente).",
  "  if (revoke) { await pool.query('UPDATE sessions SET revoked_at=now() WHERE user_id=$1 AND revoked_at IS NULL', [id]); await audit(req.authUser.tenantId, req.authUser.email, 'user.update', 'user', id); }",
  "  return { user: publicUser(u) };",
  "});",
  "app.delete('/v1/users/:id', { preHandler: [requireAuth, requireAuthRole('admin')] }, async (req, reply) => {",
  "  const id = Number(req.params.id);",
  "  if (id === req.authUser.id) { reply.code(400); return { error: { message: 'não pode desativar a si mesmo' } }; }",
  "  // desativação escopada ao tenant do admin.",
  "  const u = (await pool.query('UPDATE users SET is_active=false, updated_at=now() WHERE id=$1 AND tenant_id=$2 RETURNING id', [id, req.authUser.tenantId])).rows[0];",
  "  if (!u) { reply.code(404); return { error: { message: 'não encontrado' } }; }",
  "  // desativar revoga todas as sessões ativas do alvo.",
  "  await pool.query('UPDATE sessions SET revoked_at=now() WHERE user_id=$1 AND revoked_at IS NULL', [id]);",
  "  await audit(req.authUser.tenantId, req.authUser.email, 'user.deactivate', 'user', id);",
  "  return { ok: true };",
  "});",
  "// --- SSO Keycloak ADITIVO/OPCIONAL ---",
  "app.get('/auth/sso/config', async () => ssoConfig());",
  "app.post('/auth/sso/exchange', async (req, reply) => {",
  "  const profile = await ssoUserinfo((req.body || {}).accessToken);",
  "  if (!profile) { reply.code(401); return { error: { message: 'SSO indisponível ou token inválido' } }; }",
  "  const u = await ssoUpsertUser(profile);",
  "  if (!u) { reply.code(403); return { error: { message: 'usuário inativo' } }; }",
  "  const accessToken = signAccess(u); const refreshToken = await issueSession(u.id);",
  "  await audit(u.tenant_id, profile.email, 'login.sso', 'user', u.id);",
  "  return { accessToken, refreshToken, user: publicUser(u) };",
  "});",
);
serverLines.push(
  'const PORT = Number(process.env.PORT) || 8080;',
  '(async () => {',
  '  await waitForDb();',
  "  if ((process.env.AUTO_MIGRATE || 'true') === 'true') await migrate();",
  "  if ((process.env.AUTO_SEED || 'true') === 'true') await seed();",
  '  startMetricsServer();',
  "  await app.listen({ port: PORT, host: '0.0.0.0' });",
  "  console.log('[@@APP@@-api] :' + PORT);",
  "})().catch((e) => { console.error('boot falhou:', e && e.message ? e.message : e); process.exit(1); });", '',
);
add('api/src/server.js', serverLines.filter((l) => l !== '').join('\n'));

// worker.js (BullMQ, se redis)
if (F.redis) add('api/src/worker.js', [
  '// worker.js — consumidor BullMQ (bloco redis-bullmq). Processa submit -> gateway -> status.',
  "import { Worker } from 'bullmq';",
  "import { pool, migrate, waitForDb } from './db.js';",
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
  "(async () => { await waitForDb().catch(() => {}); if ((process.env.AUTO_MIGRATE || 'true') === 'true') await migrate().catch(() => {}); startMetricsServer();",
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
  '  api: { type: api, image: @@APP@@-api, path: /api, port: 8080, expose: true, stripPrefix: true, priority: 40, health: { path: /health } }',
  (F.redis ? '  worker: { type: worker, image: @@APP@@-api, port: 9464, expose: false, command: ["npm", "run", "worker"] }' : ''),
  (F.redis ? 'dependencies: { redis: { image: "redis:7-alpine" } }' : ''),
  'observability: { metricsPort: 9464, serviceMonitor: true, prometheusRule: true }', '',
].filter((l) => l !== '').join('\n'));

add('k8s/@@APP@@.yaml', buildK8s());
add('CLAUDE.md', '---\ntitle: "@@TITLE@@ — Manual para Claude Code"\nstatus: canonical\napplies_to: [@@APP@@]\nupdated: ' + new Date().toISOString().slice(0, 10) + '\nlanguage: pt-BR\n---\n\n# @@TITLE@@ — gerado pela Forge (gymops-style)\n\nFastify + Postgres' + (F.redis ? ' + Redis/BullMQ' : '') + (F.rbac ? ' + RBAC multi-tenant' : '') + (F.contas ? ' + Auth própria (contas-acesso)' : '') + '. Blocos: ' + blocks.join(', ') + '.\n\n' + (F.rbac ? '> RBAC por header X-Tenant-Id/X-Role (stand-in da sessão OIDC; login real = client no Keycloak realm nvit).\n\n' : '') + (F.contas ? '> Auth própria (bloco contas-acesso): POST /auth/register|login|refresh|logout, GET/PATCH /me, /v1/users/* (admin), /auth/sso/* (Keycloak ADITIVO/opcional via OIDC_ISSUER). Senha bcrypt; refresh hash sha256; JWT HS256 (JWT_SECRET — FAIL-CLOSED em produção). Registro público SEMPRE cria member; o admin vem só do seed de bootstrap (BOOTSTRAP_ADMIN_EMAIL/PASSWORD obrigatórios — sem senha default). Troca de senha exige currentPassword e revoga sessões; desativar/rebaixar usuário revoga as sessões dele; gerência escopada ao tenant do admin. Rotas de auth com rate-limit. SSO exige email_verified.\n\n' : '') + 'Verificar: `BASE_URL=http://nvit.localhost@@BASE@@/api node apps/@@APP@@/test/integration.mjs`\n');
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
  if (F.contas) L.push(
    "// --- bloco contas-acesso: auth própria ---",
    "ok((await get('/me')).s === 401, 'auth: /me sem token -> 401');",
    "const email = 'u' + Date.now() + '@local'; const reg = await post('/auth/register', { name: 'Teste', email, password: 'senha12345' });",
    "ok(reg.s === 201 && reg.j.accessToken && reg.j.user.id, 'auth: registro emite tokens');",
    "const tok = reg.j.accessToken; const refresh = reg.j.refreshToken; const auth = { Authorization: 'Bearer ' + tok };",
    "ok((await get('/me', auth)).j.email === email, 'auth: /me com token retorna o usuário');",
    "ok((await post('/auth/register', { name: 'Dup', email, password: 'senha12345' })).s === 409, 'auth: email duplicado -> 409');",
    "ok((await post('/auth/register', { name: 'Curta', email: 'x' + Date.now() + '@local', password: 'curta' })).s === 400, 'auth: senha curta -> 400');",
    "ok((await post('/auth/login', { email, password: 'errada' })).s === 401, 'auth: senha errada -> 401');",
    "ok((await post('/auth/login', { email, password: 'senha12345' })).s === 200, 'auth: login ok -> 200');",
    "const rf = await post('/auth/refresh', { refreshToken: refresh }); ok(rf.s === 200 && rf.j.accessToken, 'auth: refresh rotaciona');",
    "ok((await post('/auth/refresh', { refreshToken: refresh })).s === 401, 'auth: refresh usado é revogado -> 401');",
    "ok((await get('/v1/users', auth)).s === 403, 'auth: member não lista usuários (403)');",
    "const cfg = await get('/auth/sso/config'); ok(typeof cfg.j.enabled === 'boolean', 'auth: /auth/sso/config público');");
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
    '    spec:', '      containers:', '        - name: postgres', '          image: ' + (F.pgvector ? 'pgvector/pgvector:pg16' : 'postgres:16-alpine'),
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
    '          command: ["npm", "start"]', '          envFrom: [ { secretRef: { name: @@APP@@-db } }, { secretRef: { name: @@APP@@-ai, optional: true } }' + (F.contas ? ', { secretRef: { name: @@APP@@-auth, optional: true } }' : '') + ' ]', '          env:', ...apiEnv,
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
  // bloco oidc-sessao: reusa o SSO de borda da plataforma (oauth2-proxy do Console -> Keycloak realm
  // nvit) via ForwardAuth — SEM client novo no Keycloak. 401 p/ XHR sem sessao; X-Auth-Request-* quando ok.
  const apiMws = (F.oidc ? '{ name: console-auth-401, namespace: devops-system }, ' : '') + '{ name: @@APP@@-api-strip }';
  L.push('---', 'apiVersion: traefik.io/v1alpha1', 'kind: IngressRoute', 'metadata: { name: @@APP@@, namespace: apps, labels: { app.kubernetes.io/part-of: @@APP@@ } }',
    'spec:', '  entryPoints: [web]', '  routes:', '    - match: PathPrefix(`@@BASE@@/api`)', '      kind: Rule', '      priority: 40', '      services: [ { name: @@APP@@-api, port: 8080 } ]', '      middlewares: [ ' + apiMws + ' ]');
  L.push('---', 'apiVersion: monitoring.coreos.com/v1', 'kind: ServiceMonitor', 'metadata: { name: @@APP@@, namespace: apps, labels: { app.kubernetes.io/part-of: @@APP@@, release: kube-prometheus-stack } }',
    'spec:', '  selector: { matchLabels: { app.kubernetes.io/part-of: @@APP@@ } }', '  namespaceSelector: { matchNames: [apps] }', '  endpoints: [ { port: metrics, path: /metrics, interval: 15s } ]');
  L.push('---', 'apiVersion: monitoring.coreos.com/v1', 'kind: PrometheusRule', 'metadata: { name: @@APP@@-slo, namespace: apps, labels: { app.kubernetes.io/part-of: @@APP@@, release: kube-prometheus-stack } }',
    'spec:', '  groups:', '    - name: @@APP@@.slo', '      rules:',
    '        - alert: @@APP@@ApiDown', '          expr: absent(up{job=~".*@@APP@@-api.*"} == 1)', '          for: 3m', '          labels: { severity: critical, app: @@APP@@ }', '          annotations: { summary: "@@APP@@: API sem target UP" }');
  return L.join('\n') + '\n';
}

const METRIC = APP.replace(/[^a-zA-Z0-9_:]/g, '_'); // Prometheus exige [a-zA-Z_:][a-zA-Z0-9_:]* — slug com '-' quebra o prom-client no boot
const replace = (s) => s.replace(/@@APP@@/g, APP).replace(/@@METRIC@@/g, METRIC).replace(/@@TITLE@@/g, TITLE).replace(/@@BASE@@/g, BASE);
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
// Vendora os kits @flavioneto11 que os blocos reusam (.tgz no api/vendor) — para a imagem da api
// BUILDAR e RODAR (kits não ficam no contexto do build sem isto). Cadeia transitiva resolvida pelo helper.
if (kitRefs.length) {
  try { const packed = packKits(path.join(APPDIR, 'api'), kitRefs); console.log(`[scaffold-gymops] kits vendorados (api/vendor): ${packed.join(', ') || '(nenhum)'}`); }
  catch (e) { console.error(`[scaffold-gymops] AVISO: falha ao vendorar kits (${e && e.message}). Rode: node specs/forge/vendor-kits.mjs apps/${APP}/api ${kitRefs.join(' ')}`); }
}
console.log(`[scaffold-gymops] ${APP} (${blocks.length} blocos) — ${written} arquivos`);
console.log(`  blocos: ${blocks.join(', ')}`);
console.log(`  redis=${F.redis} gateway=${F.gateway} rbac=${F.rbac} contas=${F.contas}`);

// server.js — API Fastify (gymops-style). Servida em /contaviva-pro/api (stripPrefix). Gerado pela Forge.
import Fastify from 'fastify';
import { pool, migrate, seed, waitForDb } from './db.js';
import { M, startMetricsServer } from './metrics.js';
import { enqueueSubmit, queueCounts } from './queue.js';
import { requireAuth, requireRole as requireAuthRole, hashPassword, verifyPassword, signAccess, issueSession, rotateSession, revokeSession, audit, publicUser, findUserByEmail, ssoConfig, ssoUserinfo, ssoUpsertUser } from './auth.js';
const app = Fastify({ logger: false });
// rate-limit (bloco contas-acesso): global:false -> só vale onde a rota declara config.rateLimit.
const AUTH_RATE = { max: Number(process.env.AUTH_RATE_MAX) || 10, timeWindow: process.env.AUTH_RATE_WINDOW || '1 minute' };
let authRateLimitOn = false;
try {
  const rl = (await import('@fastify/rate-limit')).default;
  await app.register(rl, { global: false });
  authRateLimitOn = true;
} catch (e) {
  console.warn('[auth] @fastify/rate-limit indisponível — seguindo sem limite de taxa: ' + (e && e.message));
}
// helper: opções da rota com rate-limit SÓ se o plugin carregou (senão objeto vazio = sem limite).
const authLimited = (opts) => authRateLimitOn ? { ...opts, config: { ...(opts && opts.config), rateLimit: AUTH_RATE } } : (opts || {});
app.addHook('onRequest', async (req) => { req.tenantId = Number(req.headers['x-tenant-id']) || 1; });
// GET / é CONTRATO do gate forge-tests: o CI confere {"app":"contaviva-pro"} antes dos testes LOCKED.
app.get('/', async () => ({ app: 'contaviva-pro', service: 'api', ok: true }));
app.get('/health', async () => { await pool.query('SELECT 1'); return { status: 'ok', db: 'connected' }; });
app.get('/v1/health/queue', async () => ({ status: 'ok', queue: await queueCounts() }));
app.get('/v1/records', async (req) => ({ data: (await pool.query('SELECT * FROM records WHERE tenant_id=$1 ORDER BY id DESC LIMIT 200', [req.tenantId])).rows }));
app.post('/v1/records', async (req, reply) => { const b = req.body || {}; if (!b.title) { reply.code(400); return { error: { message: 'title obrigatório' } }; } const r = (await pool.query('INSERT INTO records(tenant_id,title) VALUES ($1,$2) RETURNING *', [req.tenantId, b.title])).rows[0]; M.recordsTotal.inc({ outcome: 'created' }); reply.code(201); return r; });
app.get('/v1/records/:id', async (req, reply) => { const r = (await pool.query('SELECT * FROM records WHERE tenant_id=$1 AND id=$2', [req.tenantId, Number(req.params.id)])).rows[0]; if (!r) { reply.code(404); return { error: { message: 'não encontrado' } }; } return r; });
app.post('/v1/records/:id/submit', async (req, reply) => { const id = Number(req.params.id); const r = (await pool.query('SELECT id FROM records WHERE tenant_id=$1 AND id=$2', [req.tenantId, id])).rows[0]; if (!r) { reply.code(404); return { error: { message: 'não encontrado' } }; } await pool.query("UPDATE records SET status='submitting', updated_at=now() WHERE id=$1", [id]); const e = await enqueueSubmit(id); reply.code(202); return { id, status: 'submitting', enqueued: !e.inline }; });
// --- auth: registro/login/refresh/logout (rate-limited p/ mitigar brute-force/abuso) ---
app.post('/auth/register', authLimited(), async (req, reply) => {
  const b = req.body || {}; const email = String(b.email || '').toLowerCase().trim(); const password = String(b.password || '');
  if (!email || !b.name) { reply.code(400); return { error: { message: 'name e email obrigatórios' } }; }
  if (password.length < 8) { reply.code(400); return { error: { message: 'senha deve ter ao menos 8 caracteres' } }; }
  if (await findUserByEmail(email)) { reply.code(409); return { error: { message: 'email já cadastrado' } }; }
  // registro público SEMPRE cria 'member' — admin vem só do seed de bootstrap (sem escalonamento via /auth/register).
  const hash = await hashPassword(password);
  const u = (await pool.query('INSERT INTO users(tenant_id,email,name,password_hash,role) VALUES (1,$1,$2,$3,$4) RETURNING *', [email, b.name, hash, 'member'])).rows[0];
  const accessToken = signAccess(u); const refreshToken = await issueSession(u.id);
  await audit(u.tenant_id, email, 'register', 'user', u.id);
  reply.code(201); return { accessToken, refreshToken, user: publicUser(u) };
});
app.post('/auth/login', authLimited(), async (req, reply) => {
  const b = req.body || {}; const email = String(b.email || '').toLowerCase().trim();
  const u = await findUserByEmail(email);
  if (!u || !u.is_active || !(await verifyPassword(String(b.password || ''), u.password_hash))) { reply.code(401); return { error: { message: 'credenciais inválidas' } }; }
  const accessToken = signAccess(u); const refreshToken = await issueSession(u.id);
  await audit(u.tenant_id, email, 'login', 'user', u.id);
  return { accessToken, refreshToken, user: publicUser(u) };
});
app.post('/auth/refresh', authLimited(), async (req, reply) => {
  const rot = await rotateSession((req.body || {}).refreshToken);
  if (!rot) { reply.code(401); return { error: { message: 'refresh inválido' } }; }
  return { accessToken: signAccess(rot.user), refreshToken: rot.refresh };
});
app.post('/auth/logout', async (req) => { await revokeSession((req.body || {}).refreshToken); return { ok: true }; });
// --- perfil (sessão própria) ---
app.get('/me', { preHandler: requireAuth }, async (req, reply) => {
  const u = (await pool.query('SELECT id,email,name,role FROM users WHERE id=$1', [req.authUser.id])).rows[0];
  if (!u) { reply.code(401); return { error: { message: 'não autenticado' } }; } return u;
});
app.patch('/me', { preHandler: requireAuth }, async (req, reply) => {
  const b = req.body || {}; const sets = []; const vals = []; let i = 1; let pwChanged = false;
  if (b.name != null) { sets.push('name=$' + i++); vals.push(String(b.name)); }
  if (b.password != null) {
    if (String(b.password).length < 8) { reply.code(400); return { error: { message: 'senha deve ter ao menos 8 caracteres' } }; }
    // troca de senha exige a senha ATUAL (verifyPassword) — não basta o Bearer.
    const cur = (await pool.query('SELECT password_hash FROM users WHERE id=$1', [req.authUser.id])).rows[0];
    if (!cur || !(await verifyPassword(String(b.currentPassword || ''), cur.password_hash))) { reply.code(403); return { error: { message: 'senha atual inválida' } }; }
    sets.push('password_hash=$' + i++); vals.push(await hashPassword(String(b.password))); pwChanged = true;
  }
  if (!sets.length) { reply.code(400); return { error: { message: 'nada para atualizar' } }; }
  vals.push(req.authUser.id);
  const u = (await pool.query('UPDATE users SET ' + sets.join(',') + ', updated_at=now() WHERE id=$' + i + ' RETURNING *', vals)).rows[0];
  // ao trocar a senha, revoga TODAS as sessões ativas do usuário (refresh tokens deixam de valer).
  if (pwChanged) { await pool.query('UPDATE sessions SET revoked_at=now() WHERE user_id=$1 AND revoked_at IS NULL', [req.authUser.id]); await audit(req.authUser.tenantId, req.authUser.email, 'password.change', 'user', req.authUser.id); }
  return { user: publicUser(u) };
});
// --- gerência de usuários (somente admin) — ESCOPADA ao tenant do admin (isolamento) ---
app.get('/v1/users', { preHandler: [requireAuth, requireAuthRole('admin')] }, async (req) => ({ data: (await pool.query('SELECT id,email,name,role,is_active,created_at FROM users WHERE tenant_id=$1 ORDER BY id ASC', [req.authUser.tenantId])).rows }));
app.post('/v1/users', { preHandler: [requireAuth, requireAuthRole('admin')] }, async (req, reply) => {
  const b = req.body || {}; const email = String(b.email || '').toLowerCase().trim(); const password = String(b.password || '');
  if (!email || !b.name) { reply.code(400); return { error: { message: 'name e email obrigatórios' } }; }
  if (password.length < 8) { reply.code(400); return { error: { message: 'senha deve ter ao menos 8 caracteres' } }; }
  if (await findUserByEmail(email)) { reply.code(409); return { error: { message: 'email já cadastrado' } }; }
  const role = ['admin', 'manager', 'member'].includes(b.role) ? b.role : 'member';
  const hash = await hashPassword(password);
  // criado no MESMO tenant do admin (não fixo 1).
  const u = (await pool.query('INSERT INTO users(tenant_id,email,name,password_hash,role) VALUES ($1,$2,$3,$4,$5) RETURNING *', [req.authUser.tenantId, email, b.name, hash, role])).rows[0];
  await audit(req.authUser.tenantId, req.authUser.email, 'user.create', 'user', u.id);
  reply.code(201); return { user: publicUser(u) };
});
app.patch('/v1/users/:id', { preHandler: [requireAuth, requireAuthRole('admin')] }, async (req, reply) => {
  const b = req.body || {}; const id = Number(req.params.id); const sets = []; const vals = []; let i = 1; let revoke = false;
  if (b.role != null) { if (!['admin', 'manager', 'member'].includes(b.role)) { reply.code(400); return { error: { message: 'role inválido' } }; } sets.push('role=$' + i++); vals.push(b.role); revoke = true; }
  if (b.is_active != null) { sets.push('is_active=$' + i++); vals.push(!!b.is_active); if (!b.is_active) revoke = true; }
  if (!sets.length) { reply.code(400); return { error: { message: 'nada para atualizar' } }; }
  vals.push(id); vals.push(req.authUser.tenantId);
  // UPDATE escopado ao tenant do admin (não vaza/edita usuário de outro tenant).
  const u = (await pool.query('UPDATE users SET ' + sets.join(',') + ', updated_at=now() WHERE id=$' + i + ' AND tenant_id=$' + (i + 1) + ' RETURNING *', vals)).rows[0];
  if (!u) { reply.code(404); return { error: { message: 'não encontrado' } }; }
  // rebaixar papel OU desativar revoga as sessões ativas do usuário-alvo (acesso some imediatamente).
  if (revoke) { await pool.query('UPDATE sessions SET revoked_at=now() WHERE user_id=$1 AND revoked_at IS NULL', [id]); await audit(req.authUser.tenantId, req.authUser.email, 'user.update', 'user', id); }
  return { user: publicUser(u) };
});
app.delete('/v1/users/:id', { preHandler: [requireAuth, requireAuthRole('admin')] }, async (req, reply) => {
  const id = Number(req.params.id);
  if (id === req.authUser.id) { reply.code(400); return { error: { message: 'não pode desativar a si mesmo' } }; }
  // desativação escopada ao tenant do admin.
  const u = (await pool.query('UPDATE users SET is_active=false, updated_at=now() WHERE id=$1 AND tenant_id=$2 RETURNING id', [id, req.authUser.tenantId])).rows[0];
  if (!u) { reply.code(404); return { error: { message: 'não encontrado' } }; }
  // desativar revoga todas as sessões ativas do alvo.
  await pool.query('UPDATE sessions SET revoked_at=now() WHERE user_id=$1 AND revoked_at IS NULL', [id]);
  await audit(req.authUser.tenantId, req.authUser.email, 'user.deactivate', 'user', id);
  return { ok: true };
});
// --- SSO Keycloak ADITIVO/OPCIONAL ---
app.get('/auth/sso/config', async () => ssoConfig());
app.post('/auth/sso/exchange', async (req, reply) => {
  const profile = await ssoUserinfo((req.body || {}).accessToken);
  if (!profile) { reply.code(401); return { error: { message: 'SSO indisponível ou token inválido' } }; }
  const u = await ssoUpsertUser(profile);
  if (!u) { reply.code(403); return { error: { message: 'usuário inativo' } }; }
  const accessToken = signAccess(u); const refreshToken = await issueSession(u.id);
  await audit(u.tenant_id, profile.email, 'login.sso', 'user', u.id);
  return { accessToken, refreshToken, user: publicUser(u) };
});
const PORT = Number(process.env.PORT) || 8080;
(async () => {
  await waitForDb();
  if ((process.env.AUTO_MIGRATE || 'true') === 'true') await migrate();
  if ((process.env.AUTO_SEED || 'true') === 'true') await seed();
  startMetricsServer();
  await app.listen({ port: PORT, host: '0.0.0.0' });
  console.log('[contaviva-pro-api] :' + PORT);
})().catch((e) => { console.error('boot falhou:', e && e.message ? e.message : e); process.exit(1); });
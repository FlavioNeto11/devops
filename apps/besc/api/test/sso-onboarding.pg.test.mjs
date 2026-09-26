// ADR-010, hardening P0 — primeiro login SSO: identidade criada, nenhuma capacidade, aprovação
// explícita, papel atribuído depois. Nunca `investor`. Keycloak simulado por um /userinfo local;
// banco, RBAC e rotas reais (app como besc_app).
import test, { before, after } from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { startDisposablePg, usePgEnv, requirePgOrFail } from '../test-support/pg-docker.mjs';

const pgInst = await startDisposablePg();
const skip = requirePgOrFail(pgInst);
let idp; let base; let server; let db; let managerToken;

if (pgInst) {
  usePgEnv(pgInst);
  process.env.DATA_DIR = mkdtempSync(path.join(tmpdir(), 'besc-sso-'));
  idp = http.createServer((req, res) => {
    const tok = String(req.headers.authorization || '').replace(/^Bearer /, '');
    if (!tok.startsWith('kc-')) { res.writeHead(401); return res.end(); }
    res.writeHead(200, { 'content-type': 'application/json' });
    res.end(JSON.stringify({ sub: tok, email: `${tok}@idp.localhost`, name: `Usuário ${tok}` }));
  }).listen(0);
  await new Promise((r) => idp.once('listening', r));
  process.env.KEYCLOAK_USERINFO_URL = `http://127.0.0.1:${idp.address().port}/userinfo`;
}

before(async () => {
  if (!pgInst) return;
  const { bootFoundation } = await import('../src/foundation/index.js');
  assert.equal(await bootFoundation(), true);
  db = await import('../src/db.js');
  const { createAccessToken } = await import('@flavioneto11/oidc-kit');
  const m = (await db.query(`INSERT INTO users (email, name, approval_status) VALUES ('gestor@sso.localhost','Gestor','active') RETURNING id`)).rows[0];
  await db.query(`INSERT INTO user_roles (user_id, role_id) SELECT $1, id FROM roles WHERE key = 'manager'`, [m.id]);
  managerToken = createAccessToken({ sub: m.id }, { secret: process.env.SESSION_SECRET, ttlSeconds: 600, prefix: 'besc_access' });
  const { createApp } = await import('../src/app.js');
  server = createApp().listen(0);
  await new Promise((r) => server.once('listening', r));
  base = `http://127.0.0.1:${server.address().port}`;
});
after(async () => {
  if (!pgInst) return;
  server?.close(); idp?.close();
  await db?.closePools();
  await pgInst.stop();
});

const call = async (method, route, { body, token } = {}) => {
  const headers = { 'content-type': 'application/json' };
  if (token) headers.authorization = `Bearer ${token}`;
  const r = await fetch(base + route, { method, headers, body: body ? JSON.stringify(body) : undefined });
  return { status: r.status, json: await r.json().catch(() => null) };
};

test('primeiro login SSO: identidade pendente, zero papéis, zero capacidades', { skip }, async () => {
  const r = await call('POST', '/auth/sso/exchange', { body: { accessToken: 'kc-novo-1' } });
  assert.equal(r.status, 200, JSON.stringify(r.json));
  assert.deepEqual(r.json.user.roles, []);
  assert.deepEqual(r.json.user.permissions || [], []);
  const u = (await db.query(`SELECT id, approval_status FROM users WHERE keycloak_sub = 'kc-novo-1'`)).rows[0];
  assert.equal(u.approval_status, 'pending_approval');
  const roles = (await db.query(`SELECT r.key FROM user_roles ur JOIN roles r ON r.id = ur.role_id WHERE ur.user_id = $1`, [u.id])).rows;
  assert.deepEqual(roles, [], 'nenhum papel — em especial, nunca investor');
  // sem capacidade: nem casos, nem reivindicações
  assert.equal((await call('GET', '/recovery/claims', { token: r.json.accessToken })).status, 403);
  assert.equal((await call('GET', '/cases', { token: r.json.accessToken })).status, 403);
});

test('papel investor existe só por compatibilidade: sem permissões e não pode ser concedido', { skip }, async () => {
  const perms = (await db.query(`SELECT rp.permission_key FROM role_permissions rp JOIN roles r ON r.id = rp.role_id WHERE r.key = 'investor'`)).rows;
  assert.deepEqual(perms, []);
  const label = (await db.query(`SELECT label FROM roles WHERE key = 'investor'`)).rows[0].label;
  assert.match(label, /DEPRECATED/);
  const u = (await db.query(`SELECT id FROM users WHERE keycloak_sub = 'kc-novo-1'`)).rows[0];
  const g = await call('POST', `/admin/users/${u.id}/roles`, { token: managerToken, body: { roleKey: 'investor' } });
  assert.equal(g.status, 409);
  assert.equal(g.json.code, 'ROLE_DEPRECATED');
  const inv = await call('POST', '/auth/invitations', { token: managerToken, body: { email: 'x@y.localhost', roleKey: 'investor' } });
  assert.equal(inv.status, 409);
});

test('mesmo que alguém regrave permissões no papel investor, o resolver as ignora', { skip }, async () => {
  const admin = db.getAdminPool();
  const u = (await db.query(`SELECT id FROM users WHERE keycloak_sub = 'kc-novo-1'`)).rows[0];
  await admin.query(`INSERT INTO role_permissions (role_id, permission_key, scope) SELECT id, 'recovery:read', 'all' FROM roles WHERE key = 'investor'`);
  await admin.query(`INSERT INTO user_roles (user_id, role_id) SELECT $1, id FROM roles WHERE key = 'investor'`, [u.id]);
  await admin.query(`UPDATE users SET approval_status = 'active' WHERE id = $1`, [u.id]);
  await admin.query('UPDATE rbac_meta SET version = version + 1 WHERE id = 1');
  const { resolveUser, invalidateRbacCache } = await import('../src/foundation/rbac.js');
  invalidateRbacCache();
  const entry = await resolveUser(u.id);
  assert.ok(entry.roles.includes('investor'));
  assert.equal(entry.perms.size, 0, 'papel depreciado não confere capacidade');
});

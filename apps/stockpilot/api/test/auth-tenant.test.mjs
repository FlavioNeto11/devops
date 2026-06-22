// auth-tenant.test.mjs — REQ-STOCKPILOT-0002: sessão de borda + isolamento multi-tenant.
// Testes puros (sem infra): auth-context (deriva tenant da borda, deny-by-default) e repos
// (toda query escopada por tenant_id). `db` é injetável → não precisa de Postgres.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { tenantFromGroups, resolveAuth, requireAuth } from '../src/lib/auth-context.js';
import * as productsRepo from '../src/repositories/products-repo.js';
import * as ordersRepo from '../src/repositories/orders-repo.js';

const reqWith = (headers = {}) => ({ header: (k) => headers[k] });
const mkRes = () => {
  const r = { code: 200, body: null };
  r.status = (c) => { r.code = c; return r; };
  r.json = (b) => { r.body = b; return r; };
  return r;
};

// --- auth-context: derivação de tenant a partir dos headers de borda ---
test('tenantFromGroups extrai "tenant:<key>" e "/tenants/<key>"', () => {
  assert.equal(tenantFromGroups(['platform-admins', 'tenant:acme']), 'acme');
  assert.equal(tenantFromGroups(['/tenants/globex']), 'globex');
  assert.equal(tenantFromGroups(['x', 'y']), null);
});

test('resolveAuth sem identidade de borda → null (deny-by-default)', () => {
  assert.equal(resolveAuth(reqWith({})), null);
});

test('resolveAuth com identidade → tenant "default"', () => {
  const a = resolveAuth(reqWith({ 'X-Auth-Request-User': 'flavio', 'X-Auth-Request-Email': 'f@x.com' }));
  assert.equal(a.tenant, 'default');
  assert.equal(a.user, 'flavio');
});

test('resolveAuth deriva tenant do grupo Keycloak (header confiável da borda)', () => {
  const a = resolveAuth(reqWith({ 'X-Auth-Request-User': 'u', 'X-Auth-Request-Groups': 'a, tenant:acme' }));
  assert.equal(a.tenant, 'acme');
});

test('cliente NÃO escolhe tenant via X-Tenant-Id quando autenticado (anti-spoof)', () => {
  const a = resolveAuth(reqWith({ 'X-Auth-Request-User': 'u', 'X-Tenant-Id': 'evil', 'X-Auth-Request-Groups': 'tenant:acme' }));
  assert.equal(a.tenant, 'acme'); // X-Tenant-Id do cliente é ignorado
});

test('requireAuth → 401 sem sessão (rota protegida)', () => {
  const res = mkRes(); let nexted = false;
  requireAuth(reqWith({}), res, () => { nexted = true; });
  assert.equal(nexted, false);
  assert.equal(res.code, 401);
});

test('requireAuth → next() e req.tenant preenchido com sessão válida', () => {
  const req = reqWith({ 'X-Auth-Request-User': 'u', 'X-Auth-Request-Groups': 'tenant:acme' });
  const res = mkRes(); let nexted = false;
  requireAuth(req, res, () => { nexted = true; });
  assert.equal(nexted, true);
  assert.equal(req.tenant, 'acme');
});

// --- repos: toda query é escopada por tenant_id ---
function fakeDb(rows = []) {
  const calls = [];
  return { calls, query: async (sql, params) => { calls.push({ sql, params }); return { rows }; } };
}
const hasTenantFilter = (sql) => /tenant_id\s*=\s*\$1/.test(sql);

test('products.listWithStatus filtra por tenant_id=$1', async () => {
  const db = fakeDb([]);
  await productsRepo.listWithStatus('acme', db);
  assert.equal(db.calls.length, 1);
  assert.ok(hasTenantFilter(db.calls[0].sql), 'WHERE tenant_id=$1 ausente');
  assert.deepEqual(db.calls[0].params, ['acme']);
});

test('products.findById escopa por tenant; outro tenant → null (não vaza)', async () => {
  const hit = fakeDb([{ id: 7 }]);
  await productsRepo.findById(7, 'acme', hit);
  assert.match(hit.calls[0].sql, /tenant_id=\$2/);
  assert.deepEqual(hit.calls[0].params, [7, 'acme']);

  const miss = fakeDb([]); // tenant não bate → 0 linhas
  assert.equal(await productsRepo.findById(7, 'globex', miss), null);
});

test('products.listAlerts filtra por tenant_id=$1', async () => {
  const db = fakeDb([]);
  await productsRepo.listAlerts('acme', db);
  assert.ok(hasTenantFilter(db.calls[0].sql));
  assert.deepEqual(db.calls[0].params, ['acme']);
});

test('orders.listOpen filtra por tenant_id=$1', async () => {
  const db = fakeDb([]);
  await ordersRepo.listOpen('acme', db);
  assert.ok(hasTenantFilter(db.calls[0].sql));
  assert.deepEqual(db.calls[0].params, ['acme']);
});

test('orders.create grava tenant_id do auth-context', async () => {
  const db = fakeDb([{ id: 1, tenant_id: 'acme' }]);
  await ordersRepo.create(5, 'acme', db);
  assert.match(db.calls[0].sql, /tenant_id/);
  assert.deepEqual(db.calls[0].params, [5, 'acme']);
});

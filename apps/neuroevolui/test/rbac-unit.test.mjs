// test/rbac-unit.test.mjs — verifica hierarquia de papéis e authContext sem servidor.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { authContext, requireRole } from '../api/src/rbac.js';

const mockReply = () => {
  const r = { _code: null, _sent: false };
  r.code = (n) => { r._code = n; return { send: (b) => { r._sent = true; r._body = b; } }; };
  return r;
};

test('authContext: papel padrão é patient quando sem headers', () => {
  const ctx = authContext({ headers: {} });
  assert.equal(ctx.role, 'patient');
  assert.equal(ctx.tenantId, 1);
  assert.equal(ctx.user, 'local');
});

test('authContext: owner via X-Role', () => {
  assert.equal(authContext({ headers: { 'x-role': 'owner' } }).role, 'owner');
});

test('authContext: clinic_manager via X-Role', () => {
  assert.equal(authContext({ headers: { 'x-role': 'clinic_manager' } }).role, 'clinic_manager');
});

test('authContext: professional via X-Role', () => {
  assert.equal(authContext({ headers: { 'x-role': 'professional' } }).role, 'professional');
});

test('authContext: papel inválido (admin legado) cai para patient', () => {
  assert.equal(authContext({ headers: { 'x-role': 'admin' } }).role, 'patient');
});

test('authContext: tenantId lido do header X-Tenant-Id', () => {
  assert.equal(authContext({ headers: { 'x-tenant-id': '42' } }).tenantId, 42);
});

test('authContext: SSO platform-admins → owner', () => {
  const ctx = authContext({ headers: { 'x-auth-request-email': 'a@b.com', 'x-auth-request-groups': 'platform-admins,devs' } });
  assert.equal(ctx.role, 'owner');
  assert.equal(ctx.user, 'a@b.com');
});

test('authContext: SSO sem grupo especial → patient', () => {
  const ctx = authContext({ headers: { 'x-auth-request-email': 'a@b.com', 'x-auth-request-groups': '' } });
  assert.equal(ctx.role, 'patient');
});

test('requireRole: patient bloqueado em clinic_manager (403)', async () => {
  const reply = mockReply();
  await requireRole('clinic_manager')({ headers: { 'x-role': 'patient' } }, reply);
  assert.equal(reply._code, 403);
  assert.ok(reply._sent);
});

test('requireRole: professional bloqueado em clinic_manager (403)', async () => {
  const reply = mockReply();
  await requireRole('clinic_manager')({ headers: { 'x-role': 'professional' } }, reply);
  assert.equal(reply._code, 403);
});

test('requireRole: clinic_manager passa em clinic_manager', async () => {
  const reply = mockReply();
  await requireRole('clinic_manager')({ headers: { 'x-role': 'clinic_manager' } }, reply);
  assert.equal(reply._sent, false, 'não deve enviar 403');
});

test('requireRole: owner passa em qualquer papel (cascata)', async () => {
  for (const role of ['patient', 'professional', 'clinic_manager', 'owner']) {
    const reply = mockReply();
    await requireRole(role)({ headers: { 'x-role': 'owner' } }, reply);
    assert.equal(reply._sent, false, `owner deve passar em ${role}`);
  }
});

test('requireRole: patient pode ler (patient guard)', async () => {
  const reply = mockReply();
  await requireRole('patient')({ headers: { 'x-role': 'patient' } }, reply);
  assert.equal(reply._sent, false);
});

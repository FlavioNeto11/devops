// Testes de unidade para rbac.js (REQ-NEUROEVOLUI-0002). Sem banco — puro JS.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { authContext, requireRole } from '../src/rbac.js';

function makeReq(role, tenantId, extra = {}) {
  return { headers: { 'x-role': role, 'x-tenant-id': String(tenantId), ...extra } };
}

function makeMockReply() {
  const r = { statusCode: null };
  r.code = (c) => { r.statusCode = c; return r; };
  r.send = () => r;
  return r;
}

test('authContext: extrai tenant_id e role do header', () => {
  const ctx = authContext(makeReq('professional', 42));
  assert.equal(ctx.tenantId, 42);
  assert.equal(ctx.role, 'professional');
});

test('authContext: padrão é patient/tenant 1 quando sem header', () => {
  const ctx = authContext({ headers: {} });
  assert.equal(ctx.role, 'patient');
  assert.equal(ctx.tenantId, 1);
});

test('authContext: role desconhecido passa como-está (deny virá do requireRole)', () => {
  const ctx = authContext(makeReq('hacker', 1));
  assert.equal(ctx.role, 'hacker');
});

test('authContext: SSO platform-admins mapeia para owner', () => {
  const req = {
    headers: {
      'x-auth-request-email': 'dr@clinic.com',
      'x-auth-request-groups': 'platform-admins,users',
      'x-tenant-id': '5',
    },
  };
  const ctx = authContext(req);
  assert.equal(ctx.role, 'owner');
  assert.equal(ctx.tenantId, 5);
  assert.equal(ctx.user, 'dr@clinic.com');
});

test('authContext: SSO sem platform-admins mapeia para professional', () => {
  const req = {
    headers: { 'x-auth-request-email': 'staff@clinic.com', 'x-auth-request-groups': 'users', 'x-tenant-id': '3' },
  };
  const ctx = authContext(req);
  assert.equal(ctx.role, 'professional');
});

test('requireRole: owner passa em ação que requer owner', async () => {
  const reply = makeMockReply();
  await requireRole('owner')(makeReq('owner', 1), reply);
  assert.equal(reply.statusCode, null);
});

test('requireRole: clinic_manager passa em ação que requer professional (cascata)', async () => {
  const reply = makeMockReply();
  await requireRole('professional')(makeReq('clinic_manager', 1), reply);
  assert.equal(reply.statusCode, null);
});

test('requireRole: owner passa em ação que requer patient (cascata total)', async () => {
  const reply = makeMockReply();
  await requireRole('patient')(makeReq('owner', 1), reply);
  assert.equal(reply.statusCode, null);
});

test('requireRole: patient é negado em ação que requer owner', async () => {
  const reply = makeMockReply();
  await requireRole('owner')(makeReq('patient', 1), reply);
  assert.equal(reply.statusCode, 403);
});

test('requireRole: professional é negado em ação que requer clinic_manager', async () => {
  const reply = makeMockReply();
  await requireRole('clinic_manager')(makeReq('professional', 1), reply);
  assert.equal(reply.statusCode, 403);
});

test('requireRole: role desconhecido é negado (deny por padrão)', async () => {
  const reply = makeMockReply();
  await requireRole('patient')(makeReq('hacker', 1), reply);
  assert.equal(reply.statusCode, 403);
});

test('requireRole: sem role header (padrão patient) é negado em owner', async () => {
  const reply = makeMockReply();
  await requireRole('owner')({ headers: { 'x-tenant-id': '1' } }, reply);
  assert.equal(reply.statusCode, 403);
});

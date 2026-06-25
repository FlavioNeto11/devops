// test/rbac-unit.test.mjs — verifica hierarquia de papéis e authContext sem servidor.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { authContext, requireRole, canGrantRole, RANK } from '../api/src/rbac.js';

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

// ── canGrantRole: cap de CONCESSÃO de papel (anti-escalonamento) — enforce nos handlers
//    POST/PUT /v1/professionals do server.js. Espelha a régua que a UI já aplica. ──────────
test('RANK: hierarquia owner > clinic_manager > professional > patient', () => {
  assert.ok(RANK.owner > RANK.clinic_manager, 'owner > clinic_manager');
  assert.ok(RANK.clinic_manager > RANK.professional, 'clinic_manager > professional');
  assert.ok(RANK.professional > RANK.patient, 'professional > patient');
});

test('canGrantRole: clinic_manager NÃO pode conceder owner (bloqueia escalonamento)', () => {
  assert.equal(canGrantRole('clinic_manager', 'owner'), false);
});

test('canGrantRole: só owner concede owner', () => {
  assert.equal(canGrantRole('owner', 'owner'), true);
  assert.equal(canGrantRole('clinic_manager', 'owner'), false);
  assert.equal(canGrantRole('professional', 'owner'), false);
});

test('canGrantRole: concede papel de rank MENOR OU IGUAL ao seu', () => {
  assert.equal(canGrantRole('clinic_manager', 'clinic_manager'), true, 'peer permitido');
  assert.equal(canGrantRole('clinic_manager', 'professional'), true);
  assert.equal(canGrantRole('clinic_manager', 'patient'), true);
  assert.equal(canGrantRole('owner', 'clinic_manager'), true);
  assert.equal(canGrantRole('owner', 'professional'), true);
});

test('canGrantRole: professional não concede acima de professional', () => {
  assert.equal(canGrantRole('professional', 'clinic_manager'), false);
  assert.equal(canGrantRole('professional', 'professional'), true);
  assert.equal(canGrantRole('professional', 'patient'), true);
});

test('canGrantRole: papel-alvo desconhecido/vazio => false (não concede papel inválido)', () => {
  assert.equal(canGrantRole('owner', 'superadmin'), false);
  assert.equal(canGrantRole('owner', ''), false);
  assert.equal(canGrantRole('owner', undefined), false);
});

test('canGrantRole: solicitante sem papel conhecido não concede nada', () => {
  assert.equal(canGrantRole('', 'patient'), false);
  assert.equal(canGrantRole(undefined, 'professional'), false);
});

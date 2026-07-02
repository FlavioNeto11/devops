// LOCKED — gerado de bloco contas-acesso por make-test-suite.mjs. NÃO EDITAR (mudar exige spec + regenerar).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { get, post, del, auth, sleep, LIVE } from '../_lib.mjs';

test('contas-acesso: register(member) -> login -> /me; admin de bootstrap lista /v1/users', { skip: LIVE ? false : 'sem BASE_URL (forge-tests)' }, async () => {
  // 1) registro de um usuario NOVO -> 2xx + accessToken; papel = member (registro nunca concede admin).
  const email = 'forge-' + Date.now() + '@local';
  const password = 'forge-pass-12345'; // gitleaks:allow (credencial de TESTE, não segredo)
  const reg = await post('/auth/register', { name: 'Forge Tester', email, password });
  assert.ok(reg.s >= 200 && reg.s < 300, 'register 2xx, veio ' + reg.s + ' ' + JSON.stringify(reg.j));
  assert.ok(reg.j && typeof reg.j.accessToken === 'string' && reg.j.accessToken.length > 0, 'register devolve accessToken');
  const regUser = reg.j.user || {}; assert.notEqual(regUser.role, 'admin', 'usuario registrado NAO eh admin (sem escalonamento via /auth/register)');
  // 2) login do usuario novo -> 200 + accessToken.
  const lg = await post('/auth/login', { email, password });
  assert.equal(lg.s, 200, 'login 200, veio ' + lg.s + ' ' + JSON.stringify(lg.j));
  const token = lg.j && lg.j.accessToken; assert.ok(token, 'login devolve accessToken');
  // 3) GET /me com Bearer -> 200 e email confere.
  const me = await get('/me', auth(token));
  assert.equal(me.s, 200, 'GET /me com Bearer -> 200');
  const u = me.j && (me.j.email != null ? me.j : me.j.user); assert.equal(u && u.email, email, '/me retorna o usuario logado');
  // 3b) member NAO pode listar /v1/users (403) — gerencia eh so do admin.
  const denied = await get('/v1/users', auth(token));
  assert.equal(denied.s, 403, 'member nao lista usuarios -> 403, veio ' + denied.s);
  // 4) admin de BOOTSTRAP (seed) loga com as credenciais do harness e lista /v1/users -> 200 + data[].
  const adminLogin = await post('/auth/login', { email: 'admin@local', password: 'forge-test-admin' }); // gitleaks:allow (credencial de TESTE)
  assert.equal(adminLogin.s, 200, 'login do admin de bootstrap -> 200 (seed criou admin@local), veio ' + adminLogin.s + ' ' + JSON.stringify(adminLogin.j));
  const adminTok = adminLogin.j && adminLogin.j.accessToken; assert.ok(adminTok, 'admin de bootstrap devolve accessToken');
  const adminMe = await get('/me', auth(adminTok));
  const am = adminMe.j && (adminMe.j.email != null ? adminMe.j : adminMe.j.user); assert.equal(am && am.role, 'admin', 'admin de bootstrap tem papel admin');
  const users = await get('/v1/users', auth(adminTok));
  assert.equal(users.s, 200, 'admin lista usuarios -> 200, veio ' + users.s);
  const rows = Array.isArray(users.j) ? users.j : (users.j && (users.j.data || users.j.items)) || [];
  assert.ok(Array.isArray(rows) && rows.length >= 1, '/v1/users devolve a colecao de usuarios');
});

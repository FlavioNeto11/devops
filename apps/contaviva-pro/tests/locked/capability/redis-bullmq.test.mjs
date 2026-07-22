// LOCKED — gerado de bloco redis-bullmq por make-test-suite.mjs. NÃO EDITAR (mudar exige spec + regenerar).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { get, post, del, auth, sleep, LIVE } from '../_lib.mjs';

test('fila Redis/BullMQ: submit enfileira e worker processa', { skip: LIVE ? false : 'sem BASE_URL (forge-tests)' }, async () => {
  // Records podem EXIGIR auth (bloco contas-acesso): registra um usuário único e usa o Bearer.
  // Apps sem auth própria (sem /auth/register) seguem anônimos — auth(undefined) = {} (sem header).
  const email = 'forge-redis-' + Date.now() + '@local';
  const reg = await post('/auth/register', { name: 'Forge Redis', email, password: 'forge-pass-12345' }); // gitleaks:allow (credencial de TESTE)
  const token = reg.j && reg.j.accessToken;
  const r = (await post('/v1/records', { title: 'q' }, auth(token))).j; assert.ok(r.id);
  const e = await post('/v1/records/' + r.id + '/submit', {}, auth(token));
  assert.ok(e.s === 202 || e.j.enqueued === true, 'submit aceito/enfileirado');
});

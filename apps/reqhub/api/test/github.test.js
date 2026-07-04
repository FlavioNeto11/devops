import { test } from 'node:test';
import assert from 'node:assert/strict';
import { classifyDispatchToken, validateDispatchToken, dispatchErrorPayload, __resetTokenCacheForTest } from '../src/github.js';

test('classifyDispatchToken: missing / placeholder / present (offline, sem rede)', () => {
  assert.equal(classifyDispatchToken(''), 'missing');
  assert.equal(classifyDispatchToken('   '), 'missing');
  // o BUG real: CHANGE_ME (9 chars) -> placeholder
  assert.equal(classifyDispatchToken('CHANGE_ME'), 'placeholder');
  assert.equal(classifyDispatchToken('change-me'), 'placeholder');
  assert.equal(classifyDispatchToken('your_token'), 'placeholder');
  assert.equal(classifyDispatchToken('xxxxxx'), 'placeholder');
  assert.equal(classifyDispatchToken('short'), 'placeholder');           // len < 20
  assert.equal(classifyDispatchToken('abcdefghijklmnopqrstuvwxyz'), 'placeholder'); // len ok mas sem prefixo de PAT
  // tokens de verdade -> present
  assert.equal(classifyDispatchToken('ghp_' + 'a'.repeat(36)), 'present');
  assert.equal(classifyDispatchToken('github_pat_' + 'b'.repeat(60)), 'present');
});

test('dispatchErrorPayload: amigável por status e NUNCA vaza o corpo do GitHub', () => {
  const a = dispatchErrorPayload(401, 'gerar o preview');
  assert.equal(a.code, 'PREVIEW_UPSTREAM_AUTH');
  assert.match(a.message, /autenticar com o serviço externo/i);
  assert.match(a.message, /gerar o preview/);
  // não pode conter texto cru do GitHub
  assert.doesNotMatch(a.message, /Bad credentials|documentation_url/i);
  assert.equal(dispatchErrorPayload(403).code, 'PREVIEW_UPSTREAM_FORBIDDEN');
  assert.equal(dispatchErrorPayload(404).code, 'PREVIEW_UPSTREAM_NOTFOUND');
  assert.equal(dispatchErrorPayload(500).code, 'PREVIEW_UPSTREAM');
  assert.equal(dispatchErrorPayload(0).code, 'PREVIEW_UPSTREAM');
});

test('validateDispatchToken: 401 bloqueia; 200 ok; cache não refaz fetch; rede-erro não bloqueia', async () => {
  __resetTokenCacheForTest();
  let calls = 0;
  const stub = (status) => async () => { calls++; return { status }; };
  // 401 -> ok:false (bloqueia)
  const r401 = await validateDispatchToken({ token: 'ghp_' + 'x'.repeat(36), fetchImpl: stub(401), now: () => 1000 });
  assert.equal(r401.ok, false); assert.equal(r401.status, 401);
  // dentro da janela (mesmo token) NÃO refaz o fetch (cache)
  const cached = await validateDispatchToken({ token: 'ghp_' + 'x'.repeat(36), fetchImpl: stub(200), now: () => 1500 });
  assert.equal(cached.ok, false); assert.equal(cached.cached, true);
  assert.equal(calls, 1, 'não refez fetch dentro do TTL');

  // token diferente -> refaz e 200 -> ok:true
  const r200 = await validateDispatchToken({ token: 'ghp_' + 'y'.repeat(36), fetchImpl: stub(200), now: () => 2000 });
  assert.equal(r200.ok, true); assert.equal(r200.status, 200);

  // erro de rede -> não bloqueia (ok:true, status 0)
  __resetTokenCacheForTest();
  const rnet = await validateDispatchToken({ token: 'ghp_' + 'z'.repeat(36), fetchImpl: async () => { throw new Error('ECONNREFUSED'); }, now: () => 3000 });
  assert.equal(rnet.ok, true); assert.equal(rnet.status, 0);
});

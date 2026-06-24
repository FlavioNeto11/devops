// LOCKED — gerado de bloco idempotencia por make-test-suite.mjs. NÃO EDITAR (mudar exige spec + regenerar).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { get, post, del, sleep, LIVE } from '../_lib.mjs';

test('idempotencia: mesma Idempotency-Key -> um único efeito', { skip: LIVE ? false : 'sem BASE_URL (forge-tests)' }, async () => {
  const key = 'lock-' + Date.now();
  const a = await post('/v1/records', { title: 'idem' }, { 'Idempotency-Key': key });
  const b = await post('/v1/records', { title: 'idem' }, { 'Idempotency-Key': key });
  assert.ok(a.s < 500 && b.s < 500, 'ambas respondem');
  if (a.j && a.j.id && b.j && b.j.id) assert.equal(a.j.id, b.j.id, 'mesma chave -> mesmo recurso');
});

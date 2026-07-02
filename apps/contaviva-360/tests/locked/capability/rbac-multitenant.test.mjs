// LOCKED — gerado de bloco rbac-multitenant por make-test-suite.mjs. NÃO EDITAR (mudar exige spec + regenerar).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { get, post, del, sleep, LIVE } from '../_lib.mjs';

test('rbac multi-tenant: cross-tenant não vê o recurso (404)', { skip: LIVE ? false : 'sem BASE_URL (forge-tests)' }, async () => {
  const r = (await post('/v1/records', { title: 't1' }, { 'X-Tenant-Id': '1' })).j;
  if (!r || !r.id) return;
  const cross = await get('/v1/records/' + r.id, { 'X-Tenant-Id': '2' });
  assert.equal(cross.s, 404, 'outro tenant -> 404 sem vazar');
});

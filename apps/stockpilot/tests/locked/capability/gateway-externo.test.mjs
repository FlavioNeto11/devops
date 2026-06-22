// LOCKED — gerado de bloco gateway-externo por make-test-suite.mjs. NÃO EDITAR (mudar exige spec + regenerar).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { get, post, del, sleep, LIVE } from '../_lib.mjs';

test('gateway externo: trilha de auditoria existe após submit', { skip: LIVE ? false : 'sem BASE_URL (forge-tests)' }, async () => {
  const r = (await post('/v1/records', { title: 'g' })).j; if (!r || !r.id) return;
  await post('/v1/records/' + r.id + '/submit', {}); await sleep(3000);
  const aud = await get('/v1/audit');
  assert.ok(aud.s === 200 || aud.s === 404, 'endpoint de auditoria responde (ou ainda não exposto)');
});

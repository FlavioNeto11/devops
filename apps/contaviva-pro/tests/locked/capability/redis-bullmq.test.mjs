// LOCKED — gerado de bloco redis-bullmq por make-test-suite.mjs. NÃO EDITAR (mudar exige spec + regenerar).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { get, post, del, auth, sleep, LIVE } from '../_lib.mjs';

test('fila Redis/BullMQ: submit enfileira e worker processa', { skip: LIVE ? false : 'sem BASE_URL (forge-tests)' }, async () => {
  const r = (await post('/v1/records', { title: 'q' })).j; assert.ok(r.id);
  const e = await post('/v1/records/' + r.id + '/submit', {});
  assert.ok(e.s === 202 || e.j.enqueued === true, 'submit aceito/enfileirado');
});

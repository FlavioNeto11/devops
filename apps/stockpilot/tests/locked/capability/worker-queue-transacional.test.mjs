// LOCKED — gerado de bloco worker-queue-transacional por make-test-suite.mjs. NÃO EDITAR (mudar exige spec + regenerar).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { get, post, del, sleep, LIVE } from '../_lib.mjs';

test('fila transacional: submit -> worker processa (status transiciona)', { skip: LIVE ? false : 'sem BASE_URL (forge-tests)' }, async () => {
  const r = (await post('/v1/records', { title: 'q' })).j; assert.ok(r.id);
  await post('/v1/records/' + r.id + '/submit', {});
  let a = {}; for (let i = 0; i < 12; i++) { await sleep(2500); a = (await get('/v1/records/' + r.id)).j; if (a.status === 'submitted' || a.status === 'failed') break; }
  assert.ok(['submitted','failed'].includes(a.status), 'o worker processou o job');
});

// LOCKED — gerado de bloco observabilidade por make-test-suite.mjs. NÃO EDITAR (mudar exige spec + regenerar).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { get, post, del, auth, sleep, LIVE } from '../_lib.mjs';

test('observabilidade: GET /health responde ok + db', { skip: LIVE ? false : 'sem BASE_URL (forge-tests)' }, async () => {
  const r = await get('/health'); assert.equal(r.s, 200); assert.equal(r.j.status, 'ok');
});

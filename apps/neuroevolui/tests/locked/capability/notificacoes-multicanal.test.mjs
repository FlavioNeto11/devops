// LOCKED — gerado de bloco notificacoes-multicanal por make-test-suite.mjs. NÃO EDITAR (mudar exige spec + regenerar).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { get, post, del, sleep, LIVE } from '../_lib.mjs';

test('capacidade notificacoes-multicanal: app saudável (smoke)', { skip: LIVE ? false : 'sem BASE_URL (forge-tests)' }, async () => {
  const r = await get('/health'); assert.equal(r.s, 200);
});

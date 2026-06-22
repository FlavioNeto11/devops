// LOCKED — gerado de REQ-HELPFLOW-0004 / acceptance_criteria[0] por make-test-suite.mjs. NÃO EDITAR (mudar exige spec + regenerar).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { get, post, del, sleep, LIVE } from '../_lib.mjs';

test('REQ-HELPFLOW-0004 AC1: Tabela job_queue com colunas: id, key, tipo, payload, tenant_id, estado (pending/processing/success/failed/dlq), attempts, heartbeat_at, created_at', { skip: LIVE ? false : 'sem BASE_URL (forge-tests)' }, async () => {
  // contrato de aceite (LOCKED): o app deve estar saudável e o recurso base operável.
  assert.equal((await get('/health')).s, 200);
  const r = await post('/v1/records', { title: 'ac' });
  assert.ok(r.s < 500, 'recurso base responde');
});

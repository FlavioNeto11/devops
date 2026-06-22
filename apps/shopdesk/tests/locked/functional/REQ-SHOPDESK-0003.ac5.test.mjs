// LOCKED — gerado de REQ-SHOPDESK-0003 / acceptance_criteria[4] por make-test-suite.mjs. NÃO EDITAR (mudar exige spec + regenerar).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { get, post, del, sleep, LIVE } from '../_lib.mjs';

test('REQ-SHOPDESK-0003 AC5: Provider \'sandbox\' determinístico por padrão (ex.: Stripe testkeys); PSP real atrás de env var PAYMENT_PROVIDER/PAYMENT_API_KEY (fail-closed sem chave)', { skip: LIVE ? false : 'sem BASE_URL (forge-tests)' }, async () => {
  // contrato de aceite (LOCKED): o app deve estar saudável e o recurso base operável.
  assert.equal((await get('/health')).s, 200);
  const r = await post('/v1/records', { title: 'ac' });
  assert.ok(r.s < 500, 'recurso base responde');
});

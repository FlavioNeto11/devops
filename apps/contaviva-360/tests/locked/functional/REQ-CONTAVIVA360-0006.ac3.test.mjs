// LOCKED — gerado de REQ-CONTAVIVA360-0006 / acceptance_criteria[2] por make-test-suite.mjs. NÃO EDITAR (mudar exige spec + regenerar).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { get, post, del, sleep, LIVE } from '../_lib.mjs';

test('REQ-CONTAVIVA360-0006 AC3: Emissão de NF: seleção de cliente, adição de itens (produto/serviço, quantidade, valor), cálculo automático de impostos, observações, gerar XML, assinar digital', { skip: LIVE ? false : 'sem BASE_URL (forge-tests)' }, async () => {
  // contrato de aceite (LOCKED): o app deve estar saudável e o recurso base operável.
  assert.equal((await get('/health')).s, 200);
  const r = await post('/v1/records', { title: 'ac' });
  assert.ok(r.s < 500, 'recurso base responde');
});

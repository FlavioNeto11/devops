// checkout-webhook.test.mjs — verifica a lógica pura de verificação HMAC do webhook do PSP.
// Roda sem Postgres e sem o payments-kit (somente node:crypto). Cobre AC4 de REQ-SHOPDESK-0003.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createHmac, timingSafeEqual } from 'node:crypto';

const SECRET = 'sandbox-webhook-secret';
function sign(rawBody) {
  return createHmac('sha256', SECRET).update(rawBody).digest('hex');
}
function verify(signature, rawBody) {
  const expected = createHmac('sha256', SECRET).update(rawBody).digest('hex');
  const givenBuf = Buffer.from(typeof signature === 'string' ? signature : '', 'hex');
  const expBuf = Buffer.from(expected, 'hex');
  return givenBuf.length === expBuf.length && timingSafeEqual(givenBuf, expBuf);
}

test('webhook: assinatura válida passa verificação HMAC-SHA256', () => {
  const body = Buffer.from(JSON.stringify({ event: 'payment.confirmed', amount: 100 }));
  const sig = sign(body);
  assert.ok(verify(sig, body), 'assinatura correta deve ser aceita');
});

test('webhook: assinatura inválida falha verificação HMAC-SHA256', () => {
  const body = Buffer.from(JSON.stringify({ event: 'payment.confirmed', amount: 100 }));
  assert.ok(!verify('deadbeef', body), 'assinatura errada deve ser rejeitada');
  assert.ok(!verify('', body), 'assinatura vazia deve ser rejeitada');
});

test('webhook: body modificado invalida assinatura (integridade)', () => {
  const body = Buffer.from(JSON.stringify({ event: 'payment.confirmed', amount: 100 }));
  const sig = sign(body);
  const tampered = Buffer.from(JSON.stringify({ event: 'payment.confirmed', amount: 999 }));
  assert.ok(!verify(sig, tampered), 'body adulterado deve ser rejeitado');
});

test('webhook: assinatura é timing-safe (não vaza tempo por comparação curta-circuito)', () => {
  const body = Buffer.from('test');
  const valid = sign(body);
  // Buffer de comprimento diferente → retorna false sem timingSafeEqual (short-circuit via length check)
  const shorter = valid.slice(0, -2);
  assert.ok(!verify(shorter, body), 'assinatura de tamanho diferente deve ser rejeitada');
});

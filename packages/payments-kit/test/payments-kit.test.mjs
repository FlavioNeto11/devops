import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createHmac } from 'node:crypto';

import {
  createPaymentGateway,
  verifyWebhookSignature,
  PaymentDeclinedError,
  PaymentConfigError,
} from '../src/index.js';

test('charge idempotente: mesma chave -> mesma transacao, status authorized', async () => {
  const gateway = createPaymentGateway({ provider: 'sandbox' });
  const input = {
    amount: 1990,
    paymentMethodToken: 'tok_ok',
    idempotencyKey: 'order:123',
  };

  const first = await gateway.charge(input);
  const second = await gateway.charge(input);

  assert.equal(first.status, 'authorized');
  assert.equal(second.status, 'authorized');
  assert.equal(first.transactionId, second.transactionId);
  assert.match(first.transactionId, /^sbx_/);
});

test('token contendo "decline" -> rejeita com PaymentDeclinedError', async () => {
  const gateway = createPaymentGateway({ provider: 'sandbox' });
  await assert.rejects(
    () =>
      gateway.charge({
        amount: 500,
        paymentMethodToken: 'tok_decline',
        idempotencyKey: 'order:declined',
      }),
    PaymentDeclinedError
  );
});

test('verifyWebhookSignature: assinatura valida -> true, invalida -> false', () => {
  const secret = 'whsec_test';
  const rawBody = JSON.stringify({ event: 'payment.succeeded', id: 'sbx_abc' });
  const sig = createHmac('sha256', secret).update(rawBody).digest('hex');

  assert.equal(
    verifyWebhookSignature({ rawBody, signatureHeader: sig, secret }),
    true
  );
  assert.equal(
    verifyWebhookSignature({ rawBody, signatureHeader: 'deadbeef', secret }),
    false
  );
  assert.equal(
    verifyWebhookSignature({ rawBody, signatureHeader: sig, secret: '' }),
    false
  );
});

test('provider real sem apiKey -> PaymentConfigError (fail-closed)', () => {
  assert.throws(
    () => createPaymentGateway({ provider: 'real', apiKey: '' }),
    PaymentConfigError
  );
});

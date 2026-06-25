// gateways/payments-gateway.js — wrapper do payments-kit. HTTP externo só por aqui.
import { createPaymentGateway, verifyWebhookSignature as _verify } from '../vendor/payments-kit/index.js';

export const gateway = createPaymentGateway({
  provider: process.env.PAYMENT_PROVIDER || 'sandbox',
  onAudit(entry) {
    console.log('[payments][audit]', JSON.stringify(entry));
  },
});

export function verifyWebhookSignature({ rawBody, signatureHeader, secret }) {
  return _verify({ rawBody, signatureHeader, secret });
}

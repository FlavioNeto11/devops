// services/checkout-service.js — checkout com pagamento IDEMPOTENTE via @flavioneto11/payments-kit
// (bloco pagamentos-gateway). Sandbox por default; PSP real atrás de PAYMENT_PROVIDER/PAYMENT_API_KEY
// (fail-closed sem chave). Nunca recebe número de cartão — só paymentMethodToken. Camadas rígidas:
// a rota chama este service; o service usa o kit (única porta de pagamento).
import { createPaymentGateway } from '@flavioneto11/payments-kit';

const audit = [];
const gateway = createPaymentGateway({
  provider: process.env.PAYMENT_PROVIDER || 'sandbox',
  apiKey: process.env.PAYMENT_API_KEY,
  onAudit: (e) => { audit.push({ at: new Date().toISOString(), ...e }); if (audit.length > 200) audit.shift(); },
});

// idempotente por pedido: repetir o checkout do mesmo pedido NÃO cobra de novo (mesma transação).
export async function checkout({ tenantId, orderId, amount, paymentMethodToken }) {
  const tx = await gateway.charge({
    amount, currency: 'BRL',
    paymentMethodToken: paymentMethodToken || 'tok_test',
    idempotencyKey: 'order:' + tenantId + ':' + orderId,
  });
  return { orderId, transactionId: tx.transactionId, status: tx.status, provider: gateway.provider };
}
export function recentAudit() { return audit.slice(-20); }
export const provider = gateway.provider;

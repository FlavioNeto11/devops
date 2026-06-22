// services/checkout-service.js — checkout com pagamento IDEMPOTENTE via @flavioneto11/payments-kit
// (bloco pagamentos-gateway). Sandbox por default; PSP real atrás de PAYMENT_PROVIDER/PAYMENT_API_KEY
// (fail-closed sem chave). Nunca recebe número de cartão — só paymentMethodToken. Camadas rígidas:
// a rota chama este service; o service usa o kit (única porta de pagamento).
import { createPaymentGateway } from '@flavioneto11/payments-kit';
import { createHmac, timingSafeEqual } from 'node:crypto';

const audit = [];
// Deduplicação de eventos do PSP pelo eventKey (AC4). Tamanho máximo 1000 para evitar leak.
const seenEvents = new Set();
// Segredo para verificação HMAC do webhook do PSP (deve ser configurado em produção).
const WEBHOOK_SECRET = process.env.PSP_WEBHOOK_SECRET || 'sandbox-webhook-secret';

const gateway = createPaymentGateway({
  provider: process.env.PAYMENT_PROVIDER || 'sandbox',
  apiKey: process.env.PAYMENT_API_KEY,
  // AC3: timeout de 30s e retry com backoff exponencial (configurados no kit).
  timeout: 30000,
  retries: 3,
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

// AC4: Webhook do PSP — verifica assinatura HMAC-SHA256 (timing-safe) e deduplica por eventKey.
// rawBody deve ser o Buffer bruto do body (express.raw); signature em hex do header X-PSP-Signature.
export function handleWebhook({ signature, rawBody, eventKey }) {
  const expected = createHmac('sha256', WEBHOOK_SECRET).update(rawBody).digest('hex');
  const givenBuf = Buffer.from(typeof signature === 'string' ? signature : '', 'hex');
  const expBuf = Buffer.from(expected, 'hex');
  const sigValid = givenBuf.length === expBuf.length && timingSafeEqual(givenBuf, expBuf);
  if (!sigValid) { const e = new Error('assinatura inválida'); e.status = 401; throw e; }

  if (seenEvents.has(eventKey)) return { status: 'ok', eventKey, deduplicated: true };
  seenEvents.add(eventKey);
  // Mantém o set limitado para evitar leak de memória em longa duração.
  if (seenEvents.size > 1000) { const [oldest] = seenEvents; seenEvents.delete(oldest); }

  // AC6: trilha de auditoria — registra o evento do PSP com timestamp e status.
  audit.push({ at: new Date().toISOString(), event: 'webhook', eventKey, status: 'received' });
  if (audit.length > 200) audit.shift();
  return { status: 'ok', eventKey, deduplicated: false };
}

export function recentAudit() { return audit.slice(-20); }
export const provider = gateway.provider;

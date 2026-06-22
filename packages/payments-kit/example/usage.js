// EXEMPLAR do payments-kit — um bloco de capacidade referencia este caminho exato.
// Mostra: criar o gateway (sandbox por padrao), cobrar de forma idempotente e
// validar a assinatura de um webhook. Runnable, sem efeitos colaterais no import.

import { createPaymentGateway, verifyWebhookSignature } from '../src/index.js';

// Auditoria: aqui apenas loga; em producao envie para o trilho de observabilidade.
function onAudit(entry) {
  // eslint-disable-next-line no-console
  console.log('[payments][audit]', JSON.stringify(entry));
}

const gateway = createPaymentGateway({
  provider: process.env.PAYMENT_PROVIDER || 'sandbox',
  onAudit,
});

/**
 * Cobra um pedido de forma idempotente: chamar de novo com o mesmo orderId
 * retorna a MESMA transacao (um unico efeito por pedido).
 *
 * @param {string} orderId
 * @param {number} amount  valor em centavos/menor unidade
 * @param {string} token   paymentMethodToken opaco (NUNCA o numero do cartao)
 */
export async function cobrar(orderId, amount, token) {
  return gateway.charge({
    amount,
    currency: 'BRL',
    paymentMethodToken: token,
    idempotencyKey: 'order:' + orderId,
    metadata: { orderId },
  });
}

/**
 * Valida a assinatura de um webhook do PSP a partir do request bruto.
 * @param {{ rawBody: string|Buffer, headers: Record<string,string> }} req
 * @returns {boolean}
 */
export function webhookValido(req) {
  return verifyWebhookSignature({
    rawBody: req.rawBody,
    signatureHeader: req.headers['x-signature'] || req.headers['x-webhook-signature'],
    secret: process.env.PAYMENT_WEBHOOK_SECRET,
  });
}

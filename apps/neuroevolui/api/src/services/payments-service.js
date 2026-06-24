// services/payments-service.js — lógica de cobrança e processamento de webhook.
import { gateway, verifyWebhookSignature } from '../gateways/payments-gateway.js';
import { createPaymentTransaction } from '../repositories/payment-transactions-repo.js';
import { updatePaymentStatusById, updatePaymentStatusByTransactionId } from '../repositories/consultations-repo.js';
import { insertAuditLog } from '../repositories/audit-repo.js';
import { findWebhookEvent, upsertWebhookEvent, markWebhookProcessed } from '../repositories/webhook-repo.js';

export async function chargeConsultation({ tenantId, consultationId, amountCents, currency, paymentMethodToken, idempotencyKey, actor }) {
  const result = await gateway.charge({
    amount: amountCents,
    currency: currency || 'BRL',
    paymentMethodToken,
    idempotencyKey,
    metadata: { consultationId, tenantId },
  });

  await createPaymentTransaction({
    tenantId,
    consultationId,
    idempotencyKey,
    gatewayTransactionId: result.transactionId,
    gatewayProvider: gateway.provider,
    amountCents,
    currency: currency || 'BRL',
    status: result.status,
    metadata: result.metadata,
    createdBy: actor,
  }).catch(() => {});

  if (result.status === 'authorized') {
    await updatePaymentStatusById(consultationId, 'authorized', result.transactionId).catch(() => {});
  }

  await insertAuditLog({
    tenantId,
    entityType: 'payment',
    entityId: result.transactionId,
    action: 'payment.charged',
    actor,
    amountCents,
    paymentStatus: result.status,
    gateway: gateway.provider,
    metadata: { consultationId, idempotencyKey },
  }).catch(() => {});

  return { ...result, provider: gateway.provider };
}

export async function processWebhook({ tenantId, eventId, eventType, payload, rawBody, signatureHeader }) {
  if (process.env.PAYMENT_WEBHOOK_SECRET) {
    const valid = verifyWebhookSignature({
      rawBody,
      signatureHeader,
      secret: process.env.PAYMENT_WEBHOOK_SECRET,
    });
    if (!valid) {
      const err = new Error('Assinatura de webhook inválida');
      err.statusCode = 401;
      throw err;
    }
  }

  const existing = await findWebhookEvent(eventId);
  if (existing?.processed_at) {
    return { skipped: true, eventId };
  }

  await upsertWebhookEvent({ tenantId, eventId, gatewayProvider: gateway.provider, eventType, payload });

  const transactionId = payload?.transactionId || payload?.data?.transactionId;
  if (transactionId) {
    if (eventType === 'payment.authorized' || eventType === 'payment.confirmed') {
      await updatePaymentStatusByTransactionId(transactionId, 'authorized').catch(() => {});
    } else if (eventType === 'payment.failed') {
      await updatePaymentStatusByTransactionId(transactionId, 'failed').catch(() => {});
    }
    await markWebhookProcessed(eventId).catch(() => {});
  }

  await insertAuditLog({
    tenantId: tenantId || 1,
    entityType: 'webhook',
    entityId: eventId,
    action: eventType,
    gateway: gateway.provider,
    metadata: { eventId, eventType, transactionId },
  }).catch(() => {});

  return { received: true, eventId };
}

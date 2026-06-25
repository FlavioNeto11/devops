// payments-kit — gateway de pagamentos provider-agnostic, SANDBOX-FIRST.
//
// - Funciona sem credenciais (provider 'sandbox' por padrao).
// - Provider 'real' fica atras de config e eh fail-closed (sem apiKey -> erro).
// - Idempotencia (um efeito por idempotencyKey), retry/backoff resiliente,
//   verificacao de webhook (HMAC-SHA256, comparacao constant-time) e auditoria.
// - NUNCA aceita nem armazena numero de cartao (PAN): so `paymentMethodToken`.

import { createHmac, timingSafeEqual } from 'node:crypto';
import { PaymentError, PaymentConfigError, PaymentDeclinedError } from './errors.js';
import { sandboxProvider } from './providers/sandbox.js';
import { realProvider } from './providers/real.js';

export { PaymentError, PaymentConfigError, PaymentDeclinedError };

/**
 * Verifica a assinatura de um webhook do PSP.
 * HMAC-SHA256(rawBody, secret) comparado em tempo constante com o header.
 * Retorna `false` (nunca lanca) quando algo nao bate — fail-safe para webhooks.
 *
 * @param {{ rawBody: string|Buffer, signatureHeader: string, secret: string }} args
 * @returns {boolean}
 */
export function verifyWebhookSignature({ rawBody, signatureHeader, secret } = {}) {
  if (!secret) return false;
  if (signatureHeader == null) return false;

  const expected = createHmac('sha256', secret)
    .update(rawBody == null ? '' : rawBody)
    .digest('hex');

  const a = Buffer.from(expected, 'utf8');
  const b = Buffer.from(String(signatureHeader), 'utf8');

  // timingSafeEqual exige mesmo tamanho — diferenca de tamanho => invalido.
  if (a.length !== b.length) return false;
  return timingSafeEqual(a, b);
}

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

/**
 * Cria o gateway de pagamentos.
 *
 * @param {{
 *   provider?: 'sandbox'|'real',
 *   apiKey?: string,
 *   fetchImpl?: Function,
 *   timeoutMs?: number,
 *   maxRetries?: number,
 *   onAudit?: (entry: object) => void
 * }} [opts]
 */
export function createPaymentGateway(opts = {}) {
  const provider = opts.provider || process.env.PAYMENT_PROVIDER || 'sandbox';
  const apiKey = opts.apiKey || process.env.PAYMENT_API_KEY;
  const timeoutMs = opts.timeoutMs ?? 8000;
  const maxRetries = opts.maxRetries ?? 2;
  const onAudit = typeof opts.onAudit === 'function' ? opts.onAudit : () => {};

  const impl =
    provider === 'real'
      ? realProvider({ apiKey, fetchImpl: opts.fetchImpl })
      : sandboxProvider();

  // Idempotencia em memoria: uma chave -> um unico resultado (um efeito).
  const idempotency = new Map();

  // Erros de negocio/config NUNCA devem ser repetidos (nao sao transientes).
  const isNonRetryable = (err) =>
    err instanceof PaymentConfigError || err instanceof PaymentDeclinedError;

  async function withRetry(fn) {
    let lastErr;
    for (let attempt = 0; attempt <= maxRetries; attempt += 1) {
      try {
        return await fn();
      } catch (err) {
        lastErr = err;
        if (isNonRetryable(err) || attempt === maxRetries) throw err;
        // backoff exponencial simples (50ms, 100ms, ...), limitado pelo timeout.
        const backoff = Math.min(50 * 2 ** attempt, timeoutMs);
        await sleep(backoff);
      }
    }
    throw lastErr;
  }

  /**
   * Cobra um instrumento de pagamento.
   * @param {{ amount: number, currency?: string, paymentMethodToken: string, idempotencyKey?: string, metadata?: object }} input
   */
  async function charge(input = {}) {
    const { idempotencyKey } = input;

    if (idempotencyKey && idempotency.has(idempotencyKey)) {
      // Mesmo efeito retornado para a mesma chave (sem cobrar de novo).
      return idempotency.get(idempotencyKey);
    }

    const result = await withRetry(() => impl.charge(input));

    onAudit({
      event: 'charge',
      idempotencyKey: idempotencyKey ?? null,
      transactionId: result.transactionId,
      status: result.status,
      amount: input.amount,
    });

    if (idempotencyKey) idempotency.set(idempotencyKey, result);

    if (result.status === 'declined') {
      throw new PaymentDeclinedError(
        `pagamento recusado (transactionId=${result.transactionId}).`
      );
    }

    return result;
  }

  async function refund(transactionId) {
    const result = await withRetry(() => impl.refund(transactionId));
    onAudit({
      event: 'refund',
      transactionId: result.transactionId ?? transactionId,
      status: result.status,
    });
    return result;
  }

  async function getTransaction(transactionId) {
    return withRetry(() => impl.getTransaction(transactionId));
  }

  return {
    provider,
    charge,
    refund,
    getTransaction,
    verifyWebhook: verifyWebhookSignature,
  };
}

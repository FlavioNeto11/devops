// Provedor SANDBOX: mock deterministico, sem credenciais, sem rede.
// Permite rodar o gateway em qualquer ambiente (dev/CI) sem PSP real.
//
// REGRA DE SEGURANCA: NUNCA aceita nem armazena numero de cartao (PAN).
// O unico dado de instrumento aceito eh `paymentMethodToken` (opaco).

import { createHash } from 'node:crypto';

/**
 * Cria um provedor sandbox determinístico.
 * @returns {{ charge: Function, refund: Function, getTransaction: Function }}
 */
export function sandboxProvider() {
  function makeTransactionId({ idempotencyKey, amount, paymentMethodToken }) {
    const seed = idempotencyKey || `${amount}:${paymentMethodToken}`;
    return 'sbx_' + createHash('sha256').update(String(seed)).digest('hex').slice(0, 24);
  }

  return {
    /**
     * @param {{ amount: number, currency?: string, paymentMethodToken: string, idempotencyKey?: string, metadata?: object }} input
     */
    async charge(input = {}) {
      const { amount, currency = 'BRL', paymentMethodToken = '', idempotencyKey, metadata } =
        input;
      const transactionId = makeTransactionId({
        idempotencyKey,
        amount,
        paymentMethodToken,
      });
      const status = String(paymentMethodToken).includes('decline') ? 'declined' : 'authorized';
      return { transactionId, status, amount, currency, metadata };
    },

    async refund(transactionId) {
      return { transactionId, status: 'refunded' };
    },

    async getTransaction(transactionId) {
      return { transactionId, status: 'authorized' };
    },
  };
}

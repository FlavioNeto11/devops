// Provedor REAL (PSP): STUB DE CONTRATO documentado, fail-closed.
//
// Este arquivo NAO implementa um PSP de verdade. Ele apenas define a
// fronteira: sem `apiKey` o construtor falha imediatamente (fail-closed),
// e as operacoes lancam PaymentConfigError ate que a integracao real do
// PSP seja conectada neste ambiente. `fetchImpl` fica reservado para a
// implementacao futura (injecao de cliente HTTP em testes/produção).

import { PaymentConfigError } from '../errors.js';

/**
 * @param {{ apiKey?: string, fetchImpl?: Function }} opts
 * @returns {{ charge: Function, refund: Function, getTransaction: Function }}
 */
export function realProvider({ apiKey, fetchImpl } = {}) {
  if (!apiKey) {
    // Fail-closed: nunca silenciosamente cai para sandbox.
    throw new PaymentConfigError(
      'provedor real exige PAYMENT_API_KEY — credencial ausente (fail-closed).'
    );
  }

  // Reservado para a futura implementacao real (cliente HTTP injetavel).
  const _fetch = fetchImpl;
  void _fetch;

  const notConnected = () => {
    throw new PaymentConfigError(
      'provider real não conectado neste ambiente — configure o PSP.'
    );
  };

  return {
    async charge() {
      return notConnected();
    },
    async refund() {
      return notConnected();
    },
    async getTransaction() {
      return notConnected();
    },
  };
}

// SEFAZ real: STUB documentado. A integracao com o webservice real da SEFAZ
// (por UF, ambiente de homologacao/producao, SOAP + mTLS com o certificado A1)
// e um esforco isolado futuro. Aqui falhamos fechado (FiscalConfigError) em
// vez de fingir sucesso. NAO implemente o webservice real neste arquivo sem
// um plano dedicado.

import { FiscalConfigError } from '../errors.js';

/**
 * Cria um gateway SEFAZ "real" (stub fail-closed).
 * @param {{ uf?: string, environment?: string, timeoutMs?: number, fetchImpl?: Function }} [opts]
 */
export function realSefaz(opts = {}) {
  // Parametros retidos para a implementacao futura (assinatura estavel).
  const { uf, environment, timeoutMs, fetchImpl } = opts;
  void uf;
  void environment;
  void timeoutMs;
  void fetchImpl;

  const notConnected = () => {
    throw new FiscalConfigError('SEFAZ real nao conectado neste ambiente.');
  };

  return {
    submit(_signedXml) {
      return notConnected();
    },
    queryStatus(_receipt) {
      return notConnected();
    },
  };
}

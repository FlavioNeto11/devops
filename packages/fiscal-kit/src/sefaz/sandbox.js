// SEFAZ sandbox: emulador determinista e SEM REDE do webservice da SEFAZ.
// Modela o fluxo assincrono real: primeiro `submit` (recebe um recibo),
// depois `queryStatus` (consulta a autorizacao pelo recibo).

import { createHash } from 'node:crypto';

function sha256Hex(input) {
  return createHash('sha256').update(String(input), 'utf8').digest('hex');
}

/**
 * Cria um gateway SEFAZ sandbox (determinista, offline).
 * @returns {{ submit: (signedXml: string) => { receipt: string, status: string },
 *             queryStatus: (receipt: string) => { receipt: string, status: string, protocol: string } }}
 */
export function sandboxSefaz() {
  return {
    submit(signedXml) {
      const receipt = 'rec_' + sha256Hex(signedXml).slice(0, 16);
      return { receipt, status: 'received' };
    },
    queryStatus(receipt) {
      const protocol = 'NFe' + sha256Hex(receipt).slice(0, 12);
      return { receipt, status: 'authorized', protocol };
    },
  };
}

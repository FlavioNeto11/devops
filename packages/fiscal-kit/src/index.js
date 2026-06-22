// fiscal-kit — emissao de NF-e/NFCe, sandbox-first, fail-closed.
//
// A emissao e modelada como JOB ASSINCRONO: este kit fornece os PASSOS PUROS
// (build -> sign -> submit -> queryStatus); a APP os orquestra no seu worker
// transacional. O kit NAO possui fila.

export {
  FiscalError,
  FiscalConfigError,
  FiscalRejectedError,
} from './errors.js';

export { buildNfeXml } from './nfe/build.js';
export { signXml } from './nfe/sign.js';

import { buildNfeXml } from './nfe/build.js';
import { signXml } from './nfe/sign.js';
import { sandboxSefaz } from './sefaz/sandbox.js';
import { realSefaz } from './sefaz/real.js';
import { FiscalConfigError } from './errors.js';

/**
 * Cria um gateway fiscal com os passos amarrados ao modo/config.
 * @param {{
 *   mode?: 'sandbox'|'real',
 *   certificate?: { pfx?: any, password?: string },
 *   uf?: string,
 *   environment?: string,
 *   timeoutMs?: number,
 * }} [config]
 * @returns {{
 *   buildNfeXml: typeof buildNfeXml,
 *   signXml: (xml: string) => string,
 *   submit: (signedXml: string) => any,
 *   queryStatus: (receipt: string) => any,
 * }}
 */
export function createFiscalGateway(config = {}) {
  const mode = config.mode || 'sandbox';
  const certificate = config.certificate;

  // Fail-closed: modo real sem certificado nao constroi (nunca emite sem cert).
  if (mode === 'real' && !certificate) {
    throw new FiscalConfigError(
      'Modo real exige um certificado (certificate.pfx + certificate.password).',
    );
  }

  const sefaz =
    mode === 'real'
      ? realSefaz({
          uf: config.uf,
          environment: config.environment,
          timeoutMs: config.timeoutMs,
        })
      : sandboxSefaz();

  return {
    buildNfeXml,
    signXml: (xml) =>
      signXml(xml, {
        mode,
        certPfx: certificate && certificate.pfx,
        certPassword: certificate && certificate.password,
      }),
    submit: (signedXml) => sefaz.submit(signedXml),
    queryStatus: (receipt) => sefaz.queryStatus(receipt),
  };
}

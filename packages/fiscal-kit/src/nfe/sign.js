// Assinatura do XML da NF-e.
//
// modo 'sandbox' (default): assinatura SIMULADA e determinista — anexa um
//   marcador <Signature sandbox="true" digest="..."/> com um digest derivado
//   do SHA-256 do XML. Nao tem valor juridico; serve para o fluxo E2E local.
//
// modo 'real': exige certificado A1 (.pfx + senha). Sem certificado -> falha
//   fechada (FiscalConfigError). Com certificado a assinatura xmldsig real
//   AINDA NAO esta conectada: e um stub documentado (peer opcional). Ver README.

import { createHash } from 'node:crypto';
import { FiscalConfigError } from '../errors.js';

function sha256Hex(input) {
  return createHash('sha256').update(String(input), 'utf8').digest('hex');
}

/**
 * Assina (ou simula a assinatura de) um XML de NF-e.
 * @param {string} xml
 * @param {{ mode?: 'sandbox'|'real', certPfx?: any, certPassword?: string }} [opts]
 * @returns {string} XML assinado
 */
export function signXml(xml, opts = {}) {
  const mode = opts.mode || 'sandbox';

  if (mode === 'real') {
    if (!opts.certPfx || !opts.certPassword) {
      // Fail-closed: nunca emitir em producao sem certificado.
      throw new FiscalConfigError(
        'Modo real exige certificado (certPfx + certPassword).',
      );
    }
    // Stub documentado: a integracao xmldsig real depende de um peer opcional
    // e de configuracao do certificado, deixados como esforco isolado futuro.
    throw new FiscalConfigError(
      'xmldsig real nao conectado — instale o peer e configure o certificado.',
    );
  }

  // Sandbox: marcador determinista derivado do conteudo.
  const digest = sha256Hex(xml).slice(0, 32);
  return `${xml}<Signature sandbox="true" digest="${digest}"/>`;
}

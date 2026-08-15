/**
 * Seleção do provedor WhatsApp.
 *
 * `WHATSAPP_PROVIDER` decide qual adapter atende: `twilio` (dev/homolog), `meta` (produção) ou
 * `disabled` (padrão). O default é **desligado de propósito**: o canal só existe onde foi
 * explicitamente configurado, e um ambiente sem a variável não expõe webhook nem tenta enviar nada.
 */

import { config } from '../../../../lib/config.js';
import { AppError } from '../../../../lib/problem.js';
import { createMetaCloudWhatsAppProvider } from './meta-cloud-provider.js';
import { createTwilioWhatsAppProvider } from './twilio-provider.js';
import type { WhatsAppProvider, WhatsAppProviderName } from './types.js';

export * from './types.js';

let cachedProvider: WhatsAppProvider | null = null;
let cachedFor: string | null = null;
let overrideProvider: WhatsAppProvider | null = null;

/** Injeta um provedor fake nos testes. Passar `null` restaura a resolução por env. */
export function setWhatsAppProviderOverrideForTests(provider: WhatsAppProvider | null): void {
  overrideProvider = provider;
  cachedProvider = null;
  cachedFor = null;
}

function buildProvider(name: WhatsAppProviderName): WhatsAppProvider {
  return name === 'meta' ? createMetaCloudWhatsAppProvider() : createTwilioWhatsAppProvider();
}

/** `true` quando o canal está habilitado por configuração. */
export function isWhatsAppChannelEnabled(): boolean {
  if (overrideProvider) return true;
  const configured = config.whatsappProvider;
  return configured === 'twilio' || configured === 'meta';
}

/** Provedor ativo, ou `null` se o canal está desligado. */
export function resolveWhatsAppProvider(): WhatsAppProvider | null {
  if (overrideProvider) return overrideProvider;

  const configured = config.whatsappProvider;
  if (configured !== 'twilio' && configured !== 'meta') return null;

  if (!cachedProvider || cachedFor !== configured) {
    cachedProvider = buildProvider(configured);
    cachedFor = configured;
  }

  return cachedProvider;
}

/**
 * Igual a `resolveWhatsAppProvider`, mas lança quando o canal está desligado. Use nos caminhos que
 * só fazem sentido com o canal ativo (webhook, envio) — assim o erro é explícito em vez de virar um
 * `null` silencioso lá adiante.
 */
export function requireWhatsAppProvider(): WhatsAppProvider {
  const provider = resolveWhatsAppProvider();
  if (!provider) {
    throw new AppError(
      503,
      'Service Unavailable',
      'Canal WhatsApp desabilitado. Defina WHATSAPP_PROVIDER=twilio|meta para habilitar.',
      { code: 'WHATSAPP_CHANNEL_DISABLED' }
    );
  }
  return provider;
}

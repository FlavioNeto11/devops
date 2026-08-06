/**
 * Adapter Meta WhatsApp Cloud API.
 *
 * Papel: **produção**. Número de negócio verificado, webhook nativo com assinatura, e templates HSM —
 * que são o que permite o SICAT INICIAR conversa fora da janela de 24 h (notificar "seu MTR foi
 * emitido", "job na DLQ"). O Twilio cobre dev/homolog; ver `twilio-provider.ts`.
 */

import crypto from 'node:crypto';
import { config } from '../../../../lib/config.js';
import { AppError } from '../../../../lib/problem.js';
import { withProviderTimeout } from './provider-http.js';
import {
  normalizePhone,
  type WhatsAppInboundMedia,
  type WhatsAppInboundMessage,
  type WhatsAppProvider,
  type WhatsAppSendMediaInput,
  type WhatsAppSendResult,
  type WhatsAppSendTemplateInput,
  type WhatsAppSendTextInput,
  type WhatsAppWebhookVerificationInput
} from './types.js';

type LooseRecord = Record<string, unknown>;

function toRecord(value: unknown): LooseRecord {
  if (value && typeof value === 'object' && !Array.isArray(value)) return value as LooseRecord;
  return {};
}

function toArray(value: unknown): unknown[] {
  return Array.isArray(value) ? value : [];
}

function toNullableString(value: unknown): string | null {
  if (typeof value === 'string' && value.trim()) return value.trim();
  return null;
}

/** `timestamp` do Meta vem em SEGUNDOS (string). ISO 8601 é o formato interno. */
function toIsoTimestamp(value: unknown): string | null {
  const seconds = Number(value);
  if (!Number.isFinite(seconds) || seconds <= 0) return null;
  return new Date(seconds * 1000).toISOString();
}

const MEDIA_TYPES = ['image', 'document', 'audio', 'video'] as const;
type MetaMediaType = typeof MEDIA_TYPES[number];

function isMediaType(value: string): value is MetaMediaType {
  return (MEDIA_TYPES as readonly string[]).includes(value);
}

function extractMedia(message: LooseRecord, type: MetaMediaType): WhatsAppInboundMedia {
  const payload = toRecord(message[type]);
  return {
    mediaId: toNullableString(payload.id),
    // O Meta NÃO devolve URL no webhook — só o id. Resolver a URL exige uma segunda chamada
    // autenticada a `/{mediaId}`, feita pelo adaptador quando for de fato baixar.
    mediaUrl: null,
    mimeType: toNullableString(payload.mime_type),
    fileName: toNullableString(payload.filename)
  };
}

export function createMetaCloudWhatsAppProvider(): WhatsAppProvider {
  function requireCredentials() {
    const phoneNumberId = config.whatsappMetaPhoneNumberId;
    const accessToken = config.whatsappMetaAccessToken;

    if (!phoneNumberId || !accessToken) {
      throw new AppError(
        503,
        'Service Unavailable',
        'Provedor WhatsApp (meta) não configurado: faltam WHATSAPP_META_PHONE_NUMBER_ID ou WHATSAPP_META_ACCESS_TOKEN.',
        { code: 'WHATSAPP_PROVIDER_NOT_CONFIGURED' }
      );
    }

    return { phoneNumberId, accessToken, graphVersion: config.whatsappMetaGraphVersion };
  }

  // O bloco INTEIRO (fetch + leitura do corpo) roda sob o teto: um provedor que devolve o cabeçalho e
  // trava no corpo prende o worker exatamente como um que nunca responde.
  async function postToGraph(path: string, body: LooseRecord, operation: string): Promise<WhatsAppSendResult> {
    const { accessToken, graphVersion } = requireCredentials();

    return withProviderTimeout({ providerName: 'meta', operation }, async (signal) => {
      const response = await fetch(`https://graph.facebook.com/${graphVersion}/${path}`, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${accessToken}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify(body),
        signal
      });

      if (!response.ok) {
        // O erro do Graph pode ecoar o payload enviado (incluindo o texto da mensagem), então só
        // propagamos status e o código do provedor — nunca o corpo inteiro.
        let providerCode: number | null = null;
        try {
          const payload = await response.json() as { error?: { code?: number } };
          providerCode = payload?.error?.code ?? null;
        } catch {
          providerCode = null;
        }

        throw new AppError(
          502,
          'Bad Gateway',
          `Falha ao enviar mensagem pela Cloud API (HTTP ${response.status}${providerCode ? `, código ${providerCode}` : ''}).`,
          { code: 'WHATSAPP_SEND_FAILED' }
        );
      }

      const payload = await response.json() as { messages?: Array<{ id?: string }> };
      return { providerMessageId: payload?.messages?.[0]?.id || null };
    });
  }

  /** Sobe bytes para o Graph e devolve o `mediaId` reutilizável no envio. */
  async function uploadMedia(input: { content: Buffer; fileName: string; mimeType: string }): Promise<string> {
    const { phoneNumberId, accessToken, graphVersion } = requireCredentials();

    const form = new FormData();
    form.append('messaging_product', 'whatsapp');
    form.append('type', input.mimeType);
    form.append('file', new Blob([new Uint8Array(input.content)], { type: input.mimeType }), input.fileName);

    // Teto PRÓPRIO (`kind: 'upload'`): subir bytes é legitimamente mais lento que postar um texto, e
    // um teto de texto aqui derrubaria upload sadio. Ainda MUITO abaixo do claim stale (300 s).
    return withProviderTimeout({ providerName: 'meta', operation: 'uploadMedia', kind: 'upload' }, async (signal) => {
      const response = await fetch(`https://graph.facebook.com/${graphVersion}/${phoneNumberId}/media`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${accessToken}` },
        body: form,
        signal
      });

      if (!response.ok) {
        throw new AppError(
          502,
          'Bad Gateway',
          `Falha ao subir mídia para a Cloud API (HTTP ${response.status}).`,
          { code: 'WHATSAPP_MEDIA_UPLOAD_FAILED' }
        );
      }

      const payload = await response.json() as { id?: string };
      const mediaId = payload?.id;
      if (!mediaId) {
        throw new AppError(502, 'Bad Gateway', 'Cloud API não devolveu id da mídia enviada.', {
          code: 'WHATSAPP_MEDIA_UPLOAD_FAILED'
        });
      }

      return mediaId;
    });
  }

  return {
    name: 'meta',

    verifyWebhookSignature(input: WhatsAppWebhookVerificationInput): boolean {
      const appSecret = config.whatsappMetaAppSecret;
      const header = input.headers['x-hub-signature-256'];

      // Fail-closed em todas as ausências: sem segredo, sem header ou sem corpo bruto não há como
      // provar a origem — e um webhook não provado é um turno conversacional de origem desconhecida.
      if (!appSecret || !header || !input.rawBody) return false;
      if (!header.startsWith('sha256=')) return false;

      const received = header.slice('sha256='.length);
      const expected = crypto.createHmac('sha256', appSecret).update(input.rawBody).digest('hex');

      const receivedBuffer = Buffer.from(received, 'hex');
      const expectedBuffer = Buffer.from(expected, 'hex');
      if (receivedBuffer.length !== expectedBuffer.length) return false;

      return crypto.timingSafeEqual(receivedBuffer, expectedBuffer);
    },

    parseInboundMessages({ body }): WhatsAppInboundMessage[] {
      const messages: WhatsAppInboundMessage[] = [];

      for (const entry of toArray(body.entry)) {
        for (const change of toArray(toRecord(entry).changes)) {
          const value = toRecord(toRecord(change).value);
          // `statuses` são recibos de entrega/leitura — não são mensagem de usuário.
          const businessNumber = normalizePhone(toRecord(value.metadata).display_phone_number);

          for (const rawMessage of toArray(value.messages)) {
            const message = toRecord(rawMessage);
            const from = normalizePhone(message.from);
            if (!from) continue;

            const declaredType = toNullableString(message.type) || 'unsupported';

            if (declaredType === 'text') {
              messages.push({
                providerMessageId: toNullableString(message.id) || '',
                from,
                to: businessNumber,
                timestamp: toIsoTimestamp(message.timestamp),
                type: 'text',
                rawType: declaredType,
                text: toNullableString(toRecord(message.text).body),
                media: null
              });
              continue;
            }

            if (isMediaType(declaredType)) {
              const media = extractMedia(message, declaredType);
              messages.push({
                providerMessageId: toNullableString(message.id) || '',
                from,
                to: businessNumber,
                timestamp: toIsoTimestamp(message.timestamp),
                type: declaredType,
                rawType: declaredType,
                // Legenda da mídia é o texto do turno.
                text: toNullableString(toRecord(message[declaredType]).caption),
                media
              });
              continue;
            }

            messages.push({
              providerMessageId: toNullableString(message.id) || '',
              from,
              to: businessNumber,
              timestamp: toIsoTimestamp(message.timestamp),
              type: declaredType === 'location' ? 'location' : 'unsupported',
              // `sticker`, `reaction`, `contacts`, `interactive`… todos colapsam em `unsupported`.
              // O tipo cru é o que permite ao adaptador distinguir figurinha (gesto social, merece
              // resposta) de reação (descarte silencioso).
              rawType: declaredType,
              text: null,
              media: null
            });
          }
        }
      }

      return messages;
    },

    async sendText(input: WhatsAppSendTextInput): Promise<WhatsAppSendResult> {
      const { phoneNumberId } = requireCredentials();
      return postToGraph(`${phoneNumberId}/messages`, {
        messaging_product: 'whatsapp',
        recipient_type: 'individual',
        to: normalizePhone(input.to),
        type: 'text',
        // `preview_url: false` evita que a Meta expanda links da resposta (um link de artefato do
        // SICAT não deve virar card com preview buscado por um terceiro).
        text: { body: input.text, preview_url: false }
      }, 'sendText');
    },

    async sendMedia(input: WhatsAppSendMediaInput): Promise<WhatsAppSendResult> {
      const { phoneNumberId } = requireCredentials();

      if (!input.mediaUrl && !input.content) {
        throw new AppError(400, 'Bad Request', 'Envio de mídia exige `mediaUrl` ou `content`.', {
          code: 'WHATSAPP_MEDIA_SOURCE_REQUIRED'
        });
      }

      const documentPayload: LooseRecord = input.content
        ? { id: await uploadMedia({ content: input.content, fileName: input.fileName, mimeType: input.mimeType }) }
        : { link: input.mediaUrl };

      return postToGraph(`${phoneNumberId}/messages`, {
        messaging_product: 'whatsapp',
        recipient_type: 'individual',
        to: normalizePhone(input.to),
        type: 'document',
        document: {
          ...documentPayload,
          filename: input.fileName,
          ...(input.caption ? { caption: input.caption } : {})
        }
      }, 'sendMedia');
    },

    async sendTemplate(input: WhatsAppSendTemplateInput): Promise<WhatsAppSendResult> {
      const { phoneNumberId } = requireCredentials();
      const variables = input.variables || [];

      return postToGraph(`${phoneNumberId}/messages`, {
        messaging_product: 'whatsapp',
        recipient_type: 'individual',
        to: normalizePhone(input.to),
        type: 'template',
        template: {
          name: input.templateName,
          language: { code: input.languageCode },
          ...(variables.length
            ? {
              components: [{
                type: 'body',
                parameters: variables.map((text) => ({ type: 'text', text }))
              }]
            }
            : {})
        }
      }, 'sendTemplate');
    },

    handleVerificationChallenge(query: Record<string, unknown>): string | null {
      const verifyToken = config.whatsappMetaVerifyToken;
      if (!verifyToken) return null;

      const mode = toNullableString(query['hub.mode']);
      const token = toNullableString(query['hub.verify_token']);
      const challenge = toNullableString(query['hub.challenge']);

      if (mode !== 'subscribe' || !token || !challenge) return null;

      const tokenBuffer = Buffer.from(token, 'utf8');
      const expectedBuffer = Buffer.from(verifyToken, 'utf8');
      if (tokenBuffer.length !== expectedBuffer.length) return null;
      if (!crypto.timingSafeEqual(tokenBuffer, expectedBuffer)) return null;

      return challenge;
    }
  };
}

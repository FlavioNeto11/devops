/**
 * Adapter Twilio WhatsApp.
 *
 * Papel: **desenvolvimento e homologação**. O sandbox do Twilio permite exercitar o canal inteiro
 * hoje, sem esperar verificação de negócio da Meta. Produção usa `meta-cloud-provider.ts`.
 *
 * Referência de estilo (fail-soft, sem SDK, só `fetch`): `apps/gymops/apps/api/src/lib/whatsapp.ts`,
 * que já roda em produção na plataforma. Aqui o contrato é maior (webhook + assinatura + mídia +
 * template), mas a decisão de não trazer o SDK é a mesma: uma dependência a menos para auditar.
 */

import crypto from 'node:crypto';
import { config } from '../../../../lib/config.js';
import { AppError } from '../../../../lib/problem.js';
import { withProviderTimeout } from './provider-http.js';
import {
  normalizePhone,
  type WhatsAppInboundMessage,
  type WhatsAppProvider,
  type WhatsAppSendMediaInput,
  type WhatsAppSendResult,
  type WhatsAppSendTemplateInput,
  type WhatsAppSendTextInput,
  type WhatsAppWebhookVerificationInput
} from './types.js';

const TWILIO_API_BASE = 'https://api.twilio.com/2010-04-01';

/**
 * Valores de `MessageStatus`/`SmsStatus` que representam um evento de ENTREGA (status-callback), não
 * uma mensagem de usuário. Um webhook de entrada do Twilio pode trazer `SmsStatus=received` — que
 * NÃO está aqui de propósito: `received` é sinal de INBOUND, não de entrega.
 *
 * ⚠️ O conjunto exato de campos do webhook de entrada do Twilio (e se ele traz mesmo `SmsStatus`)
 * deve ser conferido contra uma CAPTURA REAL do provedor — a documentação e as afirmações de revisão
 * divergem. O discriminador abaixo foi escrito para ser robusto sob as DUAS interpretações: só
 * descarta quando há status de entrega E não há conteúdo de mensagem.
 */
const TWILIO_DELIVERY_STATUS_VALUES = new Set([
  'queued',
  'sending',
  'sent',
  'delivered',
  'read',
  'failed',
  'undelivered'
]);

/** Twilio exige o prefixo `whatsapp:` e o `+` no E.164. */
function toTwilioAddress(phone: string): string {
  const digits = normalizePhone(phone);
  return `whatsapp:+${digits}`;
}

function toStringRecord(body: Record<string, unknown>): Record<string, string> {
  const entries = Object.entries(body).map(([key, value]) => [key, String(value ?? '')] as const);
  return Object.fromEntries(entries);
}

/**
 * Assinatura do Twilio: HMAC-SHA1, em base64, sobre `URL + concat(chave+valor)` com os parâmetros do
 * POST ordenados alfabeticamente pela chave.
 *
 * Note que NÃO usa o corpo bruto — usa os params já parseados. É por isso que
 * `WhatsAppWebhookVerificationInput` carrega os dois.
 */
export function buildTwilioSignature(authToken: string, url: string, params: Record<string, string>): string {
  const payload = Object.keys(params)
    .sort()
    .reduce((accumulator, key) => `${accumulator}${key}${params[key] ?? ''}`, url);

  return crypto.createHmac('sha1', authToken).update(Buffer.from(payload, 'utf8')).digest('base64');
}

function timingSafeEquals(a: string, b: string): boolean {
  const bufferA = Buffer.from(a, 'utf8');
  const bufferB = Buffer.from(b, 'utf8');
  // `timingSafeEqual` lança se os tamanhos diferem — checar antes é obrigatório.
  if (bufferA.length !== bufferB.length) return false;
  return crypto.timingSafeEqual(bufferA, bufferB);
}

function resolveInboundType(mimeType: string | null): WhatsAppInboundMessage['type'] {
  if (!mimeType) return 'text';
  if (mimeType.startsWith('image/')) return 'image';
  if (mimeType.startsWith('audio/')) return 'audio';
  if (mimeType.startsWith('video/')) return 'video';
  if (mimeType === 'application/pdf' || mimeType.startsWith('application/')) return 'document';
  return 'unsupported';
}

export function createTwilioWhatsAppProvider(): WhatsAppProvider {
  function requireCredentials() {
    const accountSid = config.whatsappTwilioAccountSid;
    const authToken = config.whatsappTwilioAuthToken;
    const from = config.whatsappTwilioFrom;

    if (!accountSid || !authToken || !from) {
      throw new AppError(
        503,
        'Service Unavailable',
        'Provedor WhatsApp (twilio) não configurado: faltam WHATSAPP_TWILIO_ACCOUNT_SID, WHATSAPP_TWILIO_AUTH_TOKEN ou WHATSAPP_TWILIO_FROM.',
        { code: 'WHATSAPP_PROVIDER_NOT_CONFIGURED' }
      );
    }

    return { accountSid, authToken, from };
  }

  // Mesma regra do adapter da Meta: `fetch` sem `AbortSignal` pendura o worker para sempre. Aqui o
  // risco é idêntico mesmo sendo o provedor de dev/homolog — é o mesmo processo e a mesma fila.
  async function postMessage(form: Record<string, string>, operation: string): Promise<WhatsAppSendResult> {
    const { accountSid, authToken, from } = requireCredentials();
    const auth = Buffer.from(`${accountSid}:${authToken}`).toString('base64');

    return withProviderTimeout({ providerName: 'twilio', operation }, async (signal) => {
      const response = await fetch(`${TWILIO_API_BASE}/Accounts/${accountSid}/Messages.json`, {
        method: 'POST',
        headers: {
          Authorization: `Basic ${auth}`,
          'Content-Type': 'application/x-www-form-urlencoded'
        },
        body: new URLSearchParams({ From: toTwilioAddress(from), ...form }).toString(),
        signal
      });

      if (!response.ok) {
        // O corpo de erro do Twilio traz `message`/`code`, mas pode conter o texto da mensagem —
        // então NÃO propagamos o corpo inteiro, só o status e o código.
        let providerCode: string | number | null = null;
        try {
          const payload = await response.json() as { code?: number };
          providerCode = payload?.code ?? null;
        } catch {
          providerCode = null;
        }

        throw new AppError(
          502,
          'Bad Gateway',
          `Falha ao enviar mensagem pelo Twilio (HTTP ${response.status}${providerCode ? `, código ${providerCode}` : ''}).`,
          { code: 'WHATSAPP_SEND_FAILED' }
        );
      }

      const payload = await response.json() as { sid?: string };
      return { providerMessageId: payload?.sid || null };
    });
  }

  return {
    name: 'twilio',

    verifyWebhookSignature(input: WhatsAppWebhookVerificationInput): boolean {
      const authToken = config.whatsappTwilioAuthToken;
      const received = input.headers['x-twilio-signature'];

      // Fail-closed: sem segredo configurado ou sem header, o webhook não é confiável.
      if (!authToken || !received) return false;

      const expected = buildTwilioSignature(authToken, input.url, toStringRecord(input.parsedBody));
      return timingSafeEquals(expected, received);
    },

    parseInboundMessages({ body }): WhatsAppInboundMessage[] {
      const params = toStringRecord(body);

      const from = normalizePhone(params.From);
      const mediaCount = Number(params.NumMedia || '0');
      const hasMedia = Number.isFinite(mediaCount) && mediaCount > 0;
      const mimeType = hasMedia ? (params.MediaContentType0 || null) : null;
      const text = params.Body ? String(params.Body) : null;
      const messageSid = params.MessageSid || params.SmsMessageSid || '';

      // Discriminador ROBUSTO de status-callback × mensagem de entrada. Callbacks de status
      // (entregue/lido/falhou) chegam na MESMA URL e NÃO são mensagem de usuário — mas eles TRAZEM
      // `From`, então a ausência de `From` não os identifica. O filtro antigo (`MessageStatus ||
      // SmsStatus` presente ⇒ descartar) descartava mensagens de ENTRADA legítimas caso o provedor
      // anexasse `SmsStatus=received` a elas.
      //
      // Regra: é status-callback (descartar) SÓ quando há um status com valor de ENTREGA E não há
      // conteúdo de mensagem. Qualquer webhook com `From` + (`Body` ou `NumMedia>0`) + `MessageSid` é
      // MANTIDO, mesmo trazendo `SmsStatus=received`.
      const statusValue = String(params.MessageStatus || params.SmsStatus || '').trim().toLowerCase();
      const hasInboundContent = Boolean(from) && Boolean(messageSid) && (Boolean(text) || hasMedia);
      if (TWILIO_DELIVERY_STATUS_VALUES.has(statusValue) && !hasInboundContent) return [];

      if (!from) return [];

      return [{
        providerMessageId: messageSid,
        from,
        to: normalizePhone(params.To),
        // O Twilio não manda timestamp no webhook de entrada; o adaptador carimba o recebimento.
        timestamp: null,
        type: hasMedia ? resolveInboundType(mimeType) : 'text',
        // O Twilio não declara um "tipo" — o que ele dá é o MIME. Figurinha chega como
        // `image/webp`, e é isso que o adaptador precisa enxergar para tratá-la igual ao
        // `type: 'sticker'` da Meta.
        rawType: hasMedia ? (mimeType || 'media') : 'text',
        text,
        media: hasMedia
          ? {
            mediaId: null,
            mediaUrl: params.MediaUrl0 || null,
            mimeType,
            fileName: null
          }
          : null
      }];
    },

    async sendText(input: WhatsAppSendTextInput): Promise<WhatsAppSendResult> {
      return postMessage({ To: toTwilioAddress(input.to), Body: input.text }, 'sendText');
    },

    async sendMedia(input: WhatsAppSendMediaInput): Promise<WhatsAppSendResult> {
      // O Twilio busca a mídia por URL — não aceita upload de bytes na API de Messages. Enviar
      // `content` exigiria hospedar o arquivo antes, o que é papel da fase 6 (URL assinada).
      if (!input.mediaUrl) {
        throw new AppError(
          501,
          'Not Implemented',
          'O adapter Twilio envia mídia por URL pública; upload direto de bytes não é suportado.',
          { code: 'WHATSAPP_MEDIA_URL_REQUIRED' }
        );
      }

      return postMessage({
        To: toTwilioAddress(input.to),
        MediaUrl: input.mediaUrl,
        ...(input.caption ? { Body: input.caption } : {})
      }, 'sendMedia');
    },

    async sendTemplate(input: WhatsAppSendTemplateInput): Promise<WhatsAppSendResult> {
      // No Twilio, template aprovado é um Content SID (`HX…`). Quando `templateName` não é um SID, o
      // sandbox aceita o texto direto — por isso o fallback, que mantém dev/homolog funcionais sem
      // exigir aprovação de conteúdo.
      if (input.templateName.startsWith('HX')) {
        const variables = (input.variables || []).reduce<Record<string, string>>(
          (accumulator, value, index) => ({ ...accumulator, [String(index + 1)]: value }),
          {}
        );

        return postMessage({
          To: toTwilioAddress(input.to),
          ContentSid: input.templateName,
          ...(input.variables?.length ? { ContentVariables: JSON.stringify(variables) } : {})
        }, 'sendTemplate');
      }

      // Replacement como FUNÇÃO, não string: um `value` com `$$`, `$&`, `$\`` ou `$'` (o `$` de um
      // valor em R$ é o caso real) seria interpretado como padrão de substituição pelo `String.replace`
      // e corromperia o texto. A forma de função devolve o valor LITERAL, sem interpretação de `$`.
      const rendered = (input.variables || []).reduce(
        (text, value, index) => text.replace(new RegExp(`\\{\\{${index + 1}\\}\\}`, 'g'), () => value),
        input.templateName
      );

      return postMessage({ To: toTwilioAddress(input.to), Body: rendered }, 'sendTemplate');
    },

    handleVerificationChallenge(): string | null {
      // Twilio não usa desafio de verificação — a URL do webhook é configurada no console.
      return null;
    }
  };
}

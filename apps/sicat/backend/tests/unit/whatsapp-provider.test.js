import { describe, it, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import crypto from 'node:crypto';

import { setConfigOverride } from '../../src/lib/config.js';
import { normalizePhone } from '../../src/services/conversation/channel/whatsapp/types.js';
import {
  buildTwilioSignature,
  createTwilioWhatsAppProvider
} from '../../src/services/conversation/channel/whatsapp/twilio-provider.js';
import { createMetaCloudWhatsAppProvider } from '../../src/services/conversation/channel/whatsapp/meta-cloud-provider.js';

/**
 * Fase 1 da cadeia `whatsapp-channel-sicat`.
 *
 * O que estes casos protegem: a verificação de assinatura é a ÚNICA coisa que separa um turno
 * conversacional legítimo de um forjado por qualquer um que descubra a URL do webhook. Todo caminho
 * de dúvida (segredo ausente, header ausente, corpo ausente) tem que devolver `false` — nunca
 * "deixa passar porque não deu para checar".
 */

describe('normalizePhone', () => {
  it('reduz qualquer formato ao E.164 sem `+` e sem prefixo de provedor', () => {
    assert.equal(normalizePhone('whatsapp:+5511999999999'), '5511999999999');
    assert.equal(normalizePhone('+55 (11) 99999-9999'), '5511999999999');
    assert.equal(normalizePhone('5511999999999'), '5511999999999');
    assert.equal(normalizePhone(null), '');
  });
});

describe('twilio-provider', () => {
  const provider = createTwilioWhatsAppProvider();

  it('reproduz o vetor de assinatura publicado pelo Twilio', () => {
    // Vetor textual da documentação oficial (twilio.com/docs/usage/security). Prova que a
    // implementação bate com a do provedor — não apenas consigo mesma. Se este caso quebrar, TODO
    // webhook será rejeitado em produção.
    // String concatenada esperada antes do hash:
    //   https://example.com/myapp.php?foo=1&bar=2CallSidCA1234567890ABCDECaller+14158675310
    //   Digits1234From+14158675310To+18005551212
    const signature = buildTwilioSignature(
      '12345',
      'https://example.com/myapp.php?foo=1&bar=2',
      {
        CallSid: 'CA1234567890ABCDE',
        Caller: '+14158675310',
        Digits: '1234',
        From: '+14158675310',
        To: '+18005551212'
      }
    );

    assert.equal(signature, 'L/OH5YylLD5NRKLltdqwSvS0BnU=');
  });

  it('ordena os parâmetros de forma case-sensitive (regra Unix da doc do Twilio)', () => {
    // A doc exige "Unix-style case-sensitive sorting order": maiúsculas antes de minúsculas.
    // `Array.prototype.sort` ordena por code unit, que satisfaz isso — este caso prende o
    // comportamento caso alguém troque por uma comparação com `localeCompare`.
    const url = 'https://example.com/webhook';
    const assinaturaOrdemA = buildTwilioSignature('t', url, { Zeta: '1', alpha: '2' });
    const assinaturaOrdemB = buildTwilioSignature('t', url, { alpha: '2', Zeta: '1' });

    // A ordem de inserção no objeto não pode influenciar a assinatura.
    assert.equal(assinaturaOrdemA, assinaturaOrdemB);
    // E a ordenação tem que ser 'Zeta' antes de 'alpha' (maiúscula primeiro).
    const esperado = crypto
      .createHmac('sha1', 't')
      .update(Buffer.from(`${url}Zeta1alpha2`, 'utf8'))
      .digest('base64');
    assert.equal(assinaturaOrdemA, esperado);
  });

  describe('verifyWebhookSignature', () => {
    const url = 'https://dev.nvit.com.br/sicat/api/v1/channels/whatsapp/webhook';
    const parsedBody = { From: 'whatsapp:+5511999999999', Body: 'oi', MessageSid: 'SM1' };

    beforeEach(() => {
      setConfigOverride('whatsappTwilioAuthToken', 'token-de-teste');
    });

    it('aceita requisição assinada corretamente', () => {
      const signature = buildTwilioSignature('token-de-teste', url, parsedBody);

      assert.equal(provider.verifyWebhookSignature({
        rawBody: null,
        parsedBody,
        headers: { 'x-twilio-signature': signature },
        url
      }), true);
    });

    it('rejeita quando o corpo foi adulterado', () => {
      const signature = buildTwilioSignature('token-de-teste', url, parsedBody);

      assert.equal(provider.verifyWebhookSignature({
        rawBody: null,
        parsedBody: { ...parsedBody, Body: 'cancelar tudo' },
        headers: { 'x-twilio-signature': signature },
        url
      }), false);
    });

    it('rejeita quando a URL não é a mesma que o provedor assinou', () => {
      const signature = buildTwilioSignature('token-de-teste', url, parsedBody);

      assert.equal(provider.verifyWebhookSignature({
        rawBody: null,
        parsedBody,
        headers: { 'x-twilio-signature': signature },
        url: 'https://atacante.example/webhook'
      }), false);
    });

    it('rejeita sem header de assinatura', () => {
      assert.equal(provider.verifyWebhookSignature({
        rawBody: null, parsedBody, headers: {}, url
      }), false);
    });

    it('rejeita quando o segredo não está configurado (fail-closed)', () => {
      setConfigOverride('whatsappTwilioAuthToken', '');
      const signature = buildTwilioSignature('token-de-teste', url, parsedBody);

      assert.equal(provider.verifyWebhookSignature({
        rawBody: null,
        parsedBody,
        headers: { 'x-twilio-signature': signature },
        url
      }), false);
    });
  });

  describe('parseInboundMessages', () => {
    it('normaliza mensagem de texto', () => {
      const [message] = provider.parseInboundMessages({
        body: {
          MessageSid: 'SM123',
          From: 'whatsapp:+5511999999999',
          To: 'whatsapp:+5511888888888',
          Body: 'quantos MTRs eu emiti hoje?',
          NumMedia: '0'
        }
      });

      assert.equal(message.providerMessageId, 'SM123');
      assert.equal(message.from, '5511999999999');
      assert.equal(message.to, '5511888888888');
      assert.equal(message.type, 'text');
      assert.equal(message.text, 'quantos MTRs eu emiti hoje?');
      assert.equal(message.media, null);
    });

    it('normaliza mensagem com mídia e preserva a legenda como texto', () => {
      const [message] = provider.parseInboundMessages({
        body: {
          MessageSid: 'SM124',
          From: 'whatsapp:+5511999999999',
          To: 'whatsapp:+5511888888888',
          Body: 'segue o comprovante',
          NumMedia: '1',
          MediaUrl0: 'https://api.twilio.com/media/ME1',
          MediaContentType0: 'application/pdf'
        }
      });

      assert.equal(message.type, 'document');
      assert.equal(message.text, 'segue o comprovante');
      assert.equal(message.media.mediaUrl, 'https://api.twilio.com/media/ME1');
      assert.equal(message.media.mimeType, 'application/pdf');
    });

    it('ignora callback de status (não é mensagem de usuário)', () => {
      const messages = provider.parseInboundMessages({
        body: {
          MessageSid: 'SM125',
          From: 'whatsapp:+5511888888888',
          MessageStatus: 'delivered'
        }
      });

      assert.deepEqual(messages, []);
    });
  });
});

describe('meta-cloud-provider', () => {
  const provider = createMetaCloudWhatsAppProvider();

  describe('verifyWebhookSignature', () => {
    const rawBody = Buffer.from(JSON.stringify({ object: 'whatsapp_business_account', entry: [] }), 'utf8');

    function sign(secret, body) {
      return `sha256=${crypto.createHmac('sha256', secret).update(body).digest('hex')}`;
    }

    beforeEach(() => {
      setConfigOverride('whatsappMetaAppSecret', 'segredo-do-app');
    });

    it('aceita corpo assinado com o app secret', () => {
      assert.equal(provider.verifyWebhookSignature({
        rawBody,
        parsedBody: {},
        headers: { 'x-hub-signature-256': sign('segredo-do-app', rawBody) },
        url: ''
      }), true);
    });

    it('rejeita corpo adulterado', () => {
      const tampered = Buffer.from(JSON.stringify({ object: 'forjado' }), 'utf8');

      assert.equal(provider.verifyWebhookSignature({
        rawBody: tampered,
        parsedBody: {},
        headers: { 'x-hub-signature-256': sign('segredo-do-app', rawBody) },
        url: ''
      }), false);
    });

    it('rejeita assinatura feita com outro segredo', () => {
      assert.equal(provider.verifyWebhookSignature({
        rawBody,
        parsedBody: {},
        headers: { 'x-hub-signature-256': sign('segredo-errado', rawBody) },
        url: ''
      }), false);
    });

    it('rejeita sem o prefixo `sha256=`', () => {
      const bare = crypto.createHmac('sha256', 'segredo-do-app').update(rawBody).digest('hex');

      assert.equal(provider.verifyWebhookSignature({
        rawBody, parsedBody: {}, headers: { 'x-hub-signature-256': bare }, url: ''
      }), false);
    });

    it('rejeita quando o corpo bruto não foi capturado (fail-closed)', () => {
      assert.equal(provider.verifyWebhookSignature({
        rawBody: null,
        parsedBody: {},
        headers: { 'x-hub-signature-256': sign('segredo-do-app', rawBody) },
        url: ''
      }), false);
    });

    it('rejeita quando o segredo não está configurado (fail-closed)', () => {
      setConfigOverride('whatsappMetaAppSecret', '');

      assert.equal(provider.verifyWebhookSignature({
        rawBody,
        parsedBody: {},
        headers: { 'x-hub-signature-256': sign('segredo-do-app', rawBody) },
        url: ''
      }), false);
    });
  });

  describe('parseInboundMessages', () => {
    function buildWebhook(messages, extra = {}) {
      return {
        object: 'whatsapp_business_account',
        entry: [{
          id: 'WABA1',
          changes: [{
            field: 'messages',
            value: {
              messaging_product: 'whatsapp',
              metadata: { display_phone_number: '5511888888888', phone_number_id: 'PN1' },
              ...(messages ? { messages } : {}),
              ...extra
            }
          }]
        }]
      };
    }

    it('normaliza mensagem de texto e converte o timestamp de segundos para ISO', () => {
      const [message] = provider.parseInboundMessages({
        body: buildWebhook([{
          from: '5511999999999',
          id: 'wamid.ABC',
          timestamp: '1750000000',
          type: 'text',
          text: { body: 'status do job job_123' }
        }])
      });

      assert.equal(message.providerMessageId, 'wamid.ABC');
      assert.equal(message.from, '5511999999999');
      assert.equal(message.to, '5511888888888');
      assert.equal(message.type, 'text');
      assert.equal(message.text, 'status do job job_123');
      assert.equal(message.timestamp, new Date(1750000000 * 1000).toISOString());
    });

    it('normaliza documento e usa a legenda como texto do turno', () => {
      const [message] = provider.parseInboundMessages({
        body: buildWebhook([{
          from: '5511999999999',
          id: 'wamid.DEF',
          timestamp: '1750000001',
          type: 'document',
          document: {
            id: 'MEDIA1',
            mime_type: 'application/pdf',
            filename: 'mtr.pdf',
            caption: 'confere esse MTR'
          }
        }])
      });

      assert.equal(message.type, 'document');
      assert.equal(message.text, 'confere esse MTR');
      assert.equal(message.media.mediaId, 'MEDIA1');
      assert.equal(message.media.fileName, 'mtr.pdf');
      // A Cloud API não manda URL no webhook — só o id.
      assert.equal(message.media.mediaUrl, null);
    });

    it('ignora webhook que só traz recibos de status', () => {
      const messages = provider.parseInboundMessages({
        body: buildWebhook(null, {
          statuses: [{ id: 'wamid.X', status: 'delivered', recipient_id: '5511999999999' }]
        })
      });

      assert.deepEqual(messages, []);
    });

    it('agrega mensagens de múltiplas entries no mesmo POST', () => {
      const body = buildWebhook([{ from: '5511999999999', id: 'w1', timestamp: '1750000000', type: 'text', text: { body: 'a' } }]);
      body.entry.push(buildWebhook([{ from: '5511777777777', id: 'w2', timestamp: '1750000002', type: 'text', text: { body: 'b' } }]).entry[0]);

      const messages = provider.parseInboundMessages({ body });

      assert.equal(messages.length, 2);
      assert.deepEqual(messages.map((item) => item.text), ['a', 'b']);
    });

    it('marca tipo desconhecido como unsupported em vez de quebrar', () => {
      const [message] = provider.parseInboundMessages({
        body: buildWebhook([{ from: '5511999999999', id: 'w3', timestamp: '1750000003', type: 'sticker', sticker: { id: 'S1' } }])
      });

      assert.equal(message.type, 'unsupported');
      assert.equal(message.text, null);
    });
  });

  describe('handleVerificationChallenge', () => {
    beforeEach(() => {
      setConfigOverride('whatsappMetaVerifyToken', 'token-de-verificacao');
    });

    it('devolve o challenge quando o token confere', () => {
      assert.equal(provider.handleVerificationChallenge({
        'hub.mode': 'subscribe',
        'hub.verify_token': 'token-de-verificacao',
        'hub.challenge': '1158201444'
      }), '1158201444');
    });

    it('devolve null quando o token não confere', () => {
      assert.equal(provider.handleVerificationChallenge({
        'hub.mode': 'subscribe',
        'hub.verify_token': 'token-errado',
        'hub.challenge': '1158201444'
      }), null);
    });

    it('devolve null quando o mode não é subscribe', () => {
      assert.equal(provider.handleVerificationChallenge({
        'hub.mode': 'unsubscribe',
        'hub.verify_token': 'token-de-verificacao',
        'hub.challenge': '1158201444'
      }), null);
    });
  });
});

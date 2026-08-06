/**
 * Contrato de provedor WhatsApp.
 *
 * O SICAT fala com o WhatsApp por trás desta interface, com duas implementações escolhidas por env
 * (`WHATSAPP_PROVIDER`): `twilio` (sandbox/dev — dá para testar sem verificação de negócio) e `meta`
 * (WhatsApp Cloud API — produção, número de negócio verificado e templates HSM).
 *
 * A abstração existe porque as duas diferem em tudo que importa: formato de webhook, algoritmo de
 * assinatura (HMAC-SHA1 sobre URL+params × HMAC-SHA256 sobre o corpo bruto), formato do telefone
 * (`whatsapp:+55…` × `55…`) e envio de mídia. Nada disso pode vazar para o adaptador de canal.
 *
 * Decisão registrada em `docs/handoffs/whatsapp-channel-sicat/00-orchestration.md` §2 (D1).
 */

export type WhatsAppProviderName = 'twilio' | 'meta';

/** Mensagem recebida, já normalizada — o adaptador de canal só conhece este formato. */
export type WhatsAppInboundMessage = {
  /** Id da mensagem no provedor. Chave de idempotência do webhook. */
  providerMessageId: string;
  /** Telefone do remetente em E.164 **sem** o `+` e sem prefixo de provedor (ex.: `5511999999999`). */
  from: string;
  /** Número de negócio que recebeu, mesmo formato de `from`. */
  to: string;
  /** ISO 8601. Quando o provedor não informa, o adaptador carimba a hora de recebimento. */
  timestamp: string | null;
  type: 'text' | 'image' | 'document' | 'audio' | 'video' | 'location' | 'unsupported';
  /** Texto da mensagem (ou legenda da mídia). `null` quando não há. */
  text: string | null;
  media: WhatsAppInboundMedia | null;
};

export type WhatsAppInboundMedia = {
  /** Id no provedor (Meta) — exige uma segunda chamada para resolver a URL. */
  mediaId: string | null;
  /** URL direta (Twilio) — exige as credenciais do provedor para baixar. */
  mediaUrl: string | null;
  mimeType: string | null;
  fileName: string | null;
};

export type WhatsAppSendResult = {
  providerMessageId: string | null;
};

export type WhatsAppSendTextInput = {
  /** E.164 sem `+` (ex.: `5511999999999`). Cada provedor formata como precisa. */
  to: string;
  text: string;
};

export type WhatsAppSendMediaInput = {
  to: string;
  /** URL pública do arquivo. Alternativa a `content` — pelo menos um é obrigatório. */
  mediaUrl?: string;
  /** Bytes do arquivo, para upload direto (Meta). */
  content?: Buffer;
  fileName: string;
  mimeType: string;
  caption?: string;
};

/**
 * Template pré-aprovado (HSM). Obrigatório para INICIAR conversa fora da janela de 24 h — é o que
 * torna possível notificar ativamente ("seu MTR foi emitido", "job na DLQ").
 */
export type WhatsAppSendTemplateInput = {
  to: string;
  templateName: string;
  /** Ex.: `pt_BR`. */
  languageCode: string;
  /** Variáveis posicionais do corpo do template, na ordem. */
  variables?: string[];
};

export type WhatsAppWebhookVerificationInput = {
  /** Corpo BRUTO, exatamente como chegou. Necessário para o HMAC do Meta. */
  rawBody: Buffer | null;
  /** Corpo já parseado. Necessário para a assinatura do Twilio (URL + params ordenados). */
  parsedBody: Record<string, unknown>;
  headers: Record<string, string | undefined>;
  /** URL pública completa do webhook, como o provedor a enxerga. Entra no HMAC do Twilio. */
  url: string;
};

export interface WhatsAppProvider {
  readonly name: WhatsAppProviderName;

  /**
   * Valida que o webhook veio mesmo do provedor. Deve ser **fail-closed**: qualquer dúvida
   * (segredo ausente, header ausente, tamanho divergente) devolve `false`.
   */
  verifyWebhookSignature(input: WhatsAppWebhookVerificationInput): boolean;

  /**
   * Normaliza o payload do webhook para `WhatsAppInboundMessage[]`. Um POST pode trazer várias
   * mensagens (o Meta agrupa por entry/change). Eventos que não são mensagem de usuário — recibos de
   * entrega, status, leitura — devolvem lista vazia.
   */
  parseInboundMessages(input: { body: Record<string, unknown> }): WhatsAppInboundMessage[];

  sendText(input: WhatsAppSendTextInput): Promise<WhatsAppSendResult>;
  sendMedia(input: WhatsAppSendMediaInput): Promise<WhatsAppSendResult>;
  sendTemplate(input: WhatsAppSendTemplateInput): Promise<WhatsAppSendResult>;

  /**
   * Desafio de verificação do webhook (só Meta: `GET` com `hub.mode`/`hub.verify_token`/
   * `hub.challenge`). Devolve o challenge a ecoar, ou `null` se não confere. Twilio não usa.
   */
  handleVerificationChallenge(query: Record<string, unknown>): string | null;
}

/**
 * Normaliza telefone para o formato canônico interno: só dígitos, sem `+`, sem `whatsapp:`.
 * É a chave usada em `conversation_channel_links.external_user_key`, então precisa ser estável —
 * um mesmo número tem que produzir sempre a mesma string, venha do Twilio ou do Meta.
 */
export function normalizePhone(value: unknown): string {
  return String(value ?? '')
    .replace(/^whatsapp:/i, '')
    .replace(/\D/g, '');
}

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

/**
 * Forma CANÔNICA da chave de canal — o que vai para `external_user_key`.
 *
 * `normalizePhone` só tira o lixo de formatação; ela não resolve que `11999999999` (como o
 * brasileiro digita) e `5511999999999` (como o provedor reporta) são o MESMO número. Sem esta
 * função o cadastro e o webhook gravariam chaves diferentes e o usuário ficaria mudo no canal, sem
 * nenhum erro visível. Por isso a fase 3 é obrigada a aplicá-la ao `from` de entrada.
 *
 * Regras, nesta ordem:
 *  1. reduz a dígitos (`normalizePhone`);
 *  2. 10 ou 11 dígitos → prefixa o DDI padrão (o brasileiro digita DDD+número);
 *  3. `55` + 12 dígitos com assinante começando em 6–9 → insere o NONO dígito depois do DDD;
 *  4. qualquer outro caso passa intacto (fixo BR com assinante 2–5 continua com 12 dígitos).
 *
 * É IDEMPOTENTE: aplicar duas vezes dá o mesmo resultado. É também HEURÍSTICA — portabilidades
 * antigas, faixas novas de DDD e números estrangeiros de 10–11 dígitos podem divergir do que o
 * provedor reporta; por isso o valor bruto digitado é guardado em `metadata.rawInput`.
 */
export function canonicalizeChannelUserKey(value: unknown, defaultCountryCode = '55'): string {
  const digits = normalizePhone(value);
  if (!digits) return '';

  const countryCode = String(defaultCountryCode || '').replace(/\D/g, '') || '55';
  let canonical = digits.length === 10 || digits.length === 11 ? `${countryCode}${digits}` : digits;

  if (canonical.startsWith('55') && canonical.length === 12) {
    // `55` + DDD (2) = 4 dígitos de prefixo; o 5º dígito é o primeiro do assinante.
    const subscriberFirstDigit = canonical.charAt(4);
    if (subscriberFirstDigit >= '6' && subscriberFirstDigit <= '9') {
      canonical = `${canonical.slice(0, 4)}9${canonical.slice(4)}`;
    }
  }

  return canonical;
}

/**
 * Forma MASCARADA da chave, para tudo que não seja a lista de vínculos do próprio dono: desafio
 * pendente, mensagens de erro, metadata de auditoria, logs e métricas. Telefone é dado pessoal e o
 * desafio pode ter sido aberto contra um número que não é do solicitante.
 */
export function maskChannelUserKey(value: unknown): string {
  const digits = normalizePhone(value);
  if (!digits) return '';
  if (digits.length <= 4) return '*'.repeat(digits.length);

  const lastFour = digits.slice(-4);
  if (digits.length === 12 || digits.length === 13) {
    return `+${digits.slice(0, 2)} ${digits.slice(2, 4)} ****-${lastFour}`;
  }
  return `${'*'.repeat(digits.length - 4)}${lastFour}`;
}

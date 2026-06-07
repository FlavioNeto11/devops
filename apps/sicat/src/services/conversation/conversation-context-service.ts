import { createPrefixedId } from '../../lib/ids.js';

export type ConversationChannel = 'whatsapp' | 'native_chat' | 'inapp';

type LooseRecord = Record<string, unknown>;

export type ConversationContext = {
  channel: ConversationChannel;
  correlationId: string;
  conversationSessionId: string;
  conversationTurnId: string;
  integrationAccountId: string | null;
  sessionContextId: string | null;
  manifestId: string | null;
  jobId: string | null;
  auditCorrelationId: string | null;
  requestedBy: string | null;
  idempotencyKey: string | null;
  metadata: LooseRecord;
};

type BuildConversationContextInput = {
  channel?: unknown;
  conversationSessionId?: unknown;
  context?: unknown;
  metadata?: unknown;
  correlationId?: string | null;
  idempotencyKey?: string | null;
};

function toRecord(value: unknown): LooseRecord {
  if (value && typeof value === 'object' && !Array.isArray(value)) {
    return value as LooseRecord;
  }
  return {};
}

function toTrimmedString(value: unknown): string {
  if (typeof value === 'string') return value.trim();
  if (typeof value === 'number' || typeof value === 'boolean' || typeof value === 'bigint') {
    return String(value).trim();
  }
  return '';
}

function toNullableString(value: unknown): string | null {
  const normalized = toTrimmedString(value);
  return normalized || null;
}

function normalizeChannel(value: unknown): ConversationChannel {
  const channel = toTrimmedString(value).toLowerCase();
  if (channel === 'whatsapp' || channel === 'native_chat' || channel === 'inapp') {
    return channel;
  }
  return 'inapp';
}

function ensureCorrelationId(correlationId: string | null | undefined): string {
  const normalized = toNullableString(correlationId);
  return normalized || createPrefixedId('corr');
}

export function buildConversationContext(input: BuildConversationContextInput): ConversationContext {
  const payloadContext = toRecord(input.context);

  return {
    channel: normalizeChannel(input.channel),
    correlationId: ensureCorrelationId(input.correlationId),
    conversationSessionId: toNullableString(input.conversationSessionId) || createPrefixedId('csn'),
    conversationTurnId: createPrefixedId('ctn'),
    integrationAccountId: toNullableString(payloadContext.integrationAccountId),
    sessionContextId: toNullableString(payloadContext.sessionContextId),
    manifestId: toNullableString(payloadContext.manifestId),
    jobId: toNullableString(payloadContext.jobId),
    auditCorrelationId: toNullableString(payloadContext.auditCorrelationId),
    requestedBy: toNullableString(payloadContext.requestedBy),
    idempotencyKey: toNullableString(input.idempotencyKey),
    metadata: toRecord(input.metadata)
  };
}

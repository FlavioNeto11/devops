import { createPrefixedId } from '../../lib/ids.js';
// `import type` evita ciclo em runtime: conversation-principal.ts importa o tipo `ConversationChannel`
// deste módulo, e tipos são apagados na compilação.
import type { ConversationPrincipal } from './conversation-principal.js';

export type ConversationChannel = 'whatsapp' | 'native_chat' | 'inapp';

type LooseRecord = Record<string, unknown>;

export type ConversationContext = {
  // --- Confiável: vem do principal, resolvido no servidor ---
  channel: ConversationChannel;
  userId: string;
  integrationAccountId: string | null;
  sessionContextId: string | null;
  channelSessionKey: string;
  permissionKeys: string[];
  requestedBy: string | null;
  // --- Derivado da requisição: contexto de tela e correlação ---
  correlationId: string;
  conversationSessionId: string;
  conversationTurnId: string;
  manifestId: string | null;
  jobId: string | null;
  auditCorrelationId: string | null;
  idempotencyKey: string | null;
  metadata: LooseRecord;
};

type BuildConversationContextInput = {
  /**
   * Identidade resolvida NO SERVIDOR (`conversation-principal.ts`). Obrigatória: é ela que define
   * canal, usuário e conta CETESB. O corpo da requisição não tem mais voz sobre esses campos.
   */
  principal: ConversationPrincipal;
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

function ensureCorrelationId(correlationId: string | null | undefined): string {
  const normalized = toNullableString(correlationId);
  return normalized || createPrefixedId('corr');
}

export function buildConversationContext(input: BuildConversationContextInput): ConversationContext {
  const payloadContext = toRecord(input.context);
  const { principal } = input;

  return {
    // Identidade: SEMPRE do principal. `payloadContext.integrationAccountId`,
    // `payloadContext.sessionContextId`, `payloadContext.userId` e `payloadContext.requestedBy` são
    // deliberadamente IGNORADOS — eram o vetor de escalação (declarar a conta de outro usuário, ou
    // declarar um canal mais permissivo do que o real).
    channel: principal.channel,
    userId: principal.userId,
    integrationAccountId: principal.integrationAccountId,
    sessionContextId: principal.sessionContextId,
    channelSessionKey: principal.channelSessionKey,
    permissionKeys: principal.permissionKeys,
    requestedBy: principal.requestedBy,

    // Contexto de tela e correlação: seguem vindo da requisição (não são fronteira de privilégio —
    // apontam para o que o usuário está olhando, e todo acesso a essas entidades é reautorizado
    // pela conta ativa do principal na camada de service).
    correlationId: ensureCorrelationId(input.correlationId),
    conversationSessionId: toNullableString(input.conversationSessionId) || createPrefixedId('csn'),
    conversationTurnId: createPrefixedId('ctn'),
    manifestId: toNullableString(payloadContext.manifestId),
    jobId: toNullableString(payloadContext.jobId),
    auditCorrelationId: toNullableString(payloadContext.auditCorrelationId),
    idempotencyKey: toNullableString(input.idempotencyKey),
    metadata: toRecord(input.metadata)
  };
}

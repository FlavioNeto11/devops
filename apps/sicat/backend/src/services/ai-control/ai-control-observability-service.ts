/**
 * Observabilidade do AI Control Center:
 *  - bus SSE local (subscribe/publish) para eventos quase em tempo real;
 *  - ponte best-effort entre os eventos operacionais conversacionais e
 *    (a) o stream SSE e (b) a persistência em `ai_trace_events`;
 *  - seleção do provider de observabilidade externa (Langfuse) com fallback local;
 *  - status canônico do Langfuse.
 *
 * Nada aqui pode quebrar o fluxo de `/v1/conversations/turns`: a ponte é
 * fire-and-forget e os handlers são isolados por try/catch na camada de origem.
 */
import { getAiControlConfig, getLangfuseConfig, isLangfuseReady, type LangfuseConfig } from './ai-control-config.js';
import type {
  AiControlLangfuseStatus,
  AiControlStreamEvent,
  AiControlStreamEventType
} from './ai-control-types.js';
import { sanitizeForObservability } from './ai-control-sanitize.js';
import type { AiObservabilityProvider } from './providers/ai-observability-provider.js';
import { NoopObservabilityProvider } from './providers/noop-observability-provider.js';
import { LocalObservabilityProvider } from './providers/local-observability-provider.js';
import { LangfuseObservabilityProvider } from './langfuse/langfuse-provider.js';
import { LangfuseClient } from './langfuse/langfuse-client.js';
import { createPrefixedId } from '../../lib/ids.js';
import {
  subscribeConversationOperationalEvents,
  type ConversationOperationalEvent
} from '../conversation/conversation-observability.js';
import { insertAiTraceEvent } from '../../repositories/ai-trace-event-repo.js';

// ─── Bus SSE ────────────────────────────────────────────────────────────────

type StreamHandler = (event: AiControlStreamEvent) => void;
const streamHandlers = new Set<StreamHandler>();

export function subscribeAiControlStream(handler: StreamHandler): () => void {
  streamHandlers.add(handler);
  return () => {
    streamHandlers.delete(handler);
  };
}

export function publishAiControlStreamEvent(event: AiControlStreamEvent): void {
  for (const handler of streamHandlers) {
    try {
      handler(event);
    } catch {
      // assinante SSE com defeito não pode derrubar o publisher
    }
  }
}

export function emitAiControlStreamEvent(type: AiControlStreamEventType, payload: Record<string, unknown>): void {
  publishAiControlStreamEvent({
    type,
    at: new Date().toISOString(),
    payload: sanitizeForObservability(payload)
  });
}

export function getAiControlStreamSubscriberCount(): number {
  return streamHandlers.size;
}

// ─── Ponte: evento operacional → SSE + persistência ──────────────────────────

function mapOutcomeToStreamType(event: ConversationOperationalEvent): AiControlStreamEventType {
  if (event.status === 'blocked') return 'policy.blocked';
  if (event.status === 'failed') return 'tool.failed';
  if (event.status === 'executed') return 'tool.done';
  return 'response.done';
}

/**
 * Empurra o evento operacional para o Langfuse (write-path) como trace + observation.
 * Só roda quando o Langfuse está pronto; fire-and-forget, sanitizado, nunca lança.
 * É isto que faz os traces realmente aparecerem no Langfuse e na aba Langfuse.
 */
async function pushOperationalEventToLangfuse(event: ConversationOperationalEvent): Promise<void> {
  const langfuseConfig = getLangfuseConfig();
  if (!isLangfuseReady(langfuseConfig)) return;
  try {
    const client = new LangfuseClient(langfuseConfig);
    const ts = new Date().toISOString();
    const traceId = event.conversationTurnId || event.correlationId || createPrefixedId('lftrace');
    const level = event.status === 'failed' ? 'ERROR' : event.status === 'blocked' ? 'WARNING' : 'DEFAULT';
    const batch = [
      {
        id: createPrefixedId('lfev'),
        type: 'trace-create',
        timestamp: ts,
        body: {
          id: traceId,
          name: 'conversation.turn',
          timestamp: ts,
          userId: event.userId || undefined,
          sessionId: event.conversationSessionId || undefined,
          tags: ['sicat', event.channel].filter((tag): tag is string => Boolean(tag)),
          metadata: sanitizeForObservability({
            conversationTurnId: event.conversationTurnId,
            correlationId: event.correlationId,
            channel: event.channel,
            status: event.status,
            toolName: event.toolName ?? null,
            riskLevel: event.riskLevel ?? null,
            requiresConfirmation: event.requiresConfirmation ?? null,
            confirmed: event.confirmed ?? null,
            errorCode: event.errorCode ?? null,
            integrationAccountId: event.integrationAccountId ?? null
          })
        }
      },
      {
        id: createPrefixedId('lfev'),
        type: 'observation-create',
        timestamp: ts,
        body: {
          id: createPrefixedId('lfobs'),
          traceId,
          type: 'EVENT',
          name: event.actionType || event.status,
          startTime: ts,
          level,
          statusMessage: event.reasonCode || event.errorCode || undefined,
          metadata: sanitizeForObservability({
            toolName: event.toolName ?? null,
            status: event.status,
            reasonCode: event.reasonCode ?? null
          })
        }
      }
    ];
    await client.ingest(batch);
  } catch {
    // ingestão Langfuse é best-effort: nunca quebra o turn
  }
}

async function persistOperationalEvent(event: ConversationOperationalEvent): Promise<void> {
  try {
    await insertAiTraceEvent({
      traceSource: 'sicat',
      conversationSessionId: event.conversationSessionId,
      conversationTurnId: event.conversationTurnId,
      correlationId: event.correlationId,
      userId: event.userId ?? null,
      toolName: event.toolName ?? null,
      eventType: event.actionType || mapOutcomeToStreamType(event),
      status: event.status,
      payload: sanitizeForObservability({
        channel: event.channel,
        reasonCode: event.reasonCode ?? null,
        riskLevel: event.riskLevel ?? null,
        requiresConfirmation: event.requiresConfirmation ?? null,
        confirmed: event.confirmed ?? null,
        artifactCount: event.artifactCount ?? null,
        errorCode: event.errorCode ?? null,
        jobId: event.jobId ?? null,
        integrationAccountId: event.integrationAccountId ?? null,
        sessionContextId: event.sessionContextId ?? null
      })
    });
  } catch {
    // best-effort: persistência de trace nunca quebra o turn
  }
}

let wired = false;

/** Liga a ponte uma única vez (idempotente). Chamado ao criar o router AI Control. */
export function ensureAiControlObservabilityWired(): void {
  if (wired) return;
  wired = true;
  subscribeConversationOperationalEvents((event) => {
    const config = getAiControlConfig();
    if (config.enableSse) {
      publishAiControlStreamEvent({
        type: mapOutcomeToStreamType(event),
        at: event.at || new Date().toISOString(),
        payload: sanitizeForObservability({
          conversationSessionId: event.conversationSessionId,
          conversationTurnId: event.conversationTurnId,
          correlationId: event.correlationId,
          toolName: event.toolName ?? null,
          status: event.status,
          reasonCode: event.reasonCode ?? null,
          channel: event.channel
        })
      });
    }
    void persistOperationalEvent(event);
    void pushOperationalEventToLangfuse(event);
  });
}

// ─── Seleção de provider ─────────────────────────────────────────────────────

let cachedProvider: { provider: AiObservabilityProvider; signature: string } | null = null;

function providerSignature(config: LangfuseConfig): string {
  return [
    config.enabled,
    config.publicKeyConfigured,
    config.secretKeyConfigured,
    config.baseUrl,
    config.projectId ?? ''
  ].join(':');
}

/**
 * Provider ativo: Langfuse quando pronto, senão fallback local (traces SICAT).
 * O fallback garante que a tela de traces sempre tenha dados.
 */
export function getObservabilityProvider(): AiObservabilityProvider {
  const langfuseConfig = getLangfuseConfig();
  const signature = providerSignature(langfuseConfig);
  if (cachedProvider && cachedProvider.signature === signature) {
    return cachedProvider.provider;
  }
  const provider: AiObservabilityProvider = isLangfuseReady(langfuseConfig)
    ? new LangfuseObservabilityProvider(langfuseConfig)
    : new LocalObservabilityProvider(langfuseConfig);
  cachedProvider = { provider, signature };
  return provider;
}

export function getNoopObservabilityProvider(): AiObservabilityProvider {
  return new NoopObservabilityProvider(getLangfuseConfig());
}

// ─── Status canônico do Langfuse ─────────────────────────────────────────────

export async function getLangfuseStatus(): Promise<AiControlLangfuseStatus> {
  const langfuseConfig = getLangfuseConfig();
  const base = {
    baseUrl: langfuseConfig.publicBaseUrl,
    projectId: langfuseConfig.projectId,
    publicKeyConfigured: langfuseConfig.publicKeyConfigured,
    secretKeyConfigured: langfuseConfig.secretKeyConfigured
  };
  if (!langfuseConfig.enabled) {
    return { ...base, enabled: false, status: 'disabled', lastSyncAt: null, error: null };
  }
  if (!isLangfuseReady(langfuseConfig)) {
    return {
      ...base,
      enabled: true,
      status: 'degraded',
      lastSyncAt: null,
      error: 'Chaves Langfuse (public/secret) nao configuradas.'
    };
  }
  try {
    const provider = new LangfuseObservabilityProvider(langfuseConfig);
    return await provider.getStatus();
  } catch (error: unknown) {
    return {
      ...base,
      enabled: true,
      status: 'degraded',
      lastSyncAt: null,
      error: error instanceof Error ? error.message : 'Falha ao consultar Langfuse.'
    };
  }
}

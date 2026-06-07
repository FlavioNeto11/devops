export type ConversationTurnOutcome = 'responded' | 'blocked' | 'executed' | 'failed';

type TurnCounters = Record<ConversationTurnOutcome, number>;

type ConversationToolCounters = TurnCounters & {
  total: number;
};

export type ConversationOperationalEvent = {
  at?: string;
  conversationSessionId: string;
  conversationTurnId: string;
  correlationId: string;
  channel: string;
  actionType: string;
  status: ConversationTurnOutcome;
  toolName?: string | null;
  reasonCode?: string | null;
  riskLevel?: string | null;
  requiresConfirmation?: boolean;
  confirmed?: boolean;
  artifactCount?: number;
  errorCode?: string | null;
  jobId?: string | null;
  integrationAccountId?: string | null;
  sessionContextId?: string | null;
  userId?: string | null;
};

type TelemetryState = {
  startedAt: string;
  lastEventAt: string | null;
  turnOutcomes: TurnCounters;
  totalTurns: number;
  policyBlockedTotal: number;
  providerFailuresTotal: number;
  fallbackTriggeredTotal: number;
  blockedByReason: Record<string, number>;
  fallbackByReason: Record<string, number>;
  turnsByChannel: Record<string, number>;
  toolExecutions: Record<string, ConversationToolCounters>;
  confirmation: {
    requiredTotal: number;
    confirmedTotal: number;
    blockedMissingTotal: number;
  };
  artifactsGeneratedTotal: number;
  errorsByCode: Record<string, number>;
  recentEvents: ConversationOperationalEvent[];
  lastProviderFailureAt: string | null;
  lastProviderFailureCorrelationId: string | null;
};

const state: TelemetryState = {
  startedAt: new Date().toISOString(),
  lastEventAt: null,
  turnOutcomes: {
    responded: 0,
    blocked: 0,
    executed: 0,
    failed: 0
  },
  totalTurns: 0,
  policyBlockedTotal: 0,
  providerFailuresTotal: 0,
  fallbackTriggeredTotal: 0,
  blockedByReason: {},
  fallbackByReason: {},
  turnsByChannel: {},
  toolExecutions: {},
  confirmation: {
    requiredTotal: 0,
    confirmedTotal: 0,
    blockedMissingTotal: 0
  },
  artifactsGeneratedTotal: 0,
  errorsByCode: {},
  recentEvents: [],
  lastProviderFailureAt: null,
  lastProviderFailureCorrelationId: null
};

type ConversationOperationalEventHandler = (event: ConversationOperationalEvent) => void;
const operationalEventHandlers = new Set<ConversationOperationalEventHandler>();

/**
 * Assina eventos operacionais conversacionais (consumido pelo AI Control Center
 * para SSE em tempo real e persistência em `ai_trace_events`). Handlers são
 * best-effort: exceções são engolidas e NUNCA afetam o fluxo do turn.
 */
export function subscribeConversationOperationalEvents(handler: ConversationOperationalEventHandler): () => void {
  operationalEventHandlers.add(handler);
  return () => {
    operationalEventHandlers.delete(handler);
  };
}

function touchEvent() {
  state.lastEventAt = new Date().toISOString();
}

function incrementDictionaryCounter(target: Record<string, number>, key: string | null | undefined) {
  const normalized = typeof key === 'string' && key.trim() ? key.trim() : 'UNKNOWN';
  target[normalized] = (target[normalized] || 0) + 1;
}

function getToolCounters(toolName: string): ConversationToolCounters {
  const counters = state.toolExecutions[toolName] ?? {
    total: 0,
    responded: 0,
    blocked: 0,
    executed: 0,
    failed: 0
  };

  state.toolExecutions[toolName] = counters;
  return counters;
}

export function registerConversationTurnOutcome(outcome: ConversationTurnOutcome) {
  state.turnOutcomes[outcome] += 1;
  state.totalTurns += 1;
  touchEvent();
}

export function registerConversationPolicyBlocked(reasonCode: string | null | undefined) {
  state.policyBlockedTotal += 1;
  incrementDictionaryCounter(state.blockedByReason, reasonCode);
  touchEvent();
}

export function registerConversationProviderFailure(correlationId: string) {
  state.providerFailuresTotal += 1;
  state.lastProviderFailureAt = new Date().toISOString();
  state.lastProviderFailureCorrelationId = correlationId;
  touchEvent();
}

export function registerConversationFallback(reasonCode: string | null | undefined) {
  state.fallbackTriggeredTotal += 1;
  incrementDictionaryCounter(state.fallbackByReason, reasonCode);
  touchEvent();
}

export function registerConversationOperationalEvent(event: ConversationOperationalEvent) {
  touchEvent();
  incrementDictionaryCounter(state.turnsByChannel, event.channel);

  if (event.toolName) {
    const toolCounters = getToolCounters(event.toolName);
    toolCounters.total += 1;
    toolCounters[event.status] += 1;
  }

  if (event.requiresConfirmation) {
    state.confirmation.requiredTotal += 1;
  }

  if (event.confirmed) {
    state.confirmation.confirmedTotal += 1;
  }

  if (event.status === 'blocked' && event.reasonCode === 'CONFIRMATION_REQUIRED') {
    state.confirmation.blockedMissingTotal += 1;
  }

  if (typeof event.artifactCount === 'number' && Number.isFinite(event.artifactCount) && event.artifactCount > 0) {
    state.artifactsGeneratedTotal += Math.trunc(event.artifactCount);
  }

  if (event.errorCode) {
    incrementDictionaryCounter(state.errorsByCode, event.errorCode);
  }

  const enrichedEvent: ConversationOperationalEvent = {
    ...event,
    at: event.at || new Date().toISOString()
  };
  state.recentEvents.unshift(enrichedEvent);
  state.recentEvents = state.recentEvents.slice(0, 20);

  for (const handler of operationalEventHandlers) {
    try {
      handler(enrichedEvent);
    } catch {
      // Observador externo (AI Control) nunca pode quebrar o fluxo conversacional.
    }
  }
}

export function getConversationTelemetrySnapshot() {
  return {
    startedAt: state.startedAt,
    lastEventAt: state.lastEventAt,
    counters: {
      totalTurns: state.totalTurns,
      outcomes: {
        ...state.turnOutcomes
      },
      policyBlockedTotal: state.policyBlockedTotal,
      providerFailuresTotal: state.providerFailuresTotal,
      fallbackTriggeredTotal: state.fallbackTriggeredTotal,
      artifactsGeneratedTotal: state.artifactsGeneratedTotal
    },
    breakdown: {
      blockedByReason: { ...state.blockedByReason },
      fallbackByReason: { ...state.fallbackByReason },
      turnsByChannel: { ...state.turnsByChannel },
      errorsByCode: { ...state.errorsByCode }
    },
    operations: {
      tools: Object.fromEntries(
        Object.entries(state.toolExecutions).map(([toolName, counters]) => [
          toolName,
          { ...counters }
        ])
      ),
      confirmation: { ...state.confirmation },
      recentEvents: state.recentEvents.map((event) => ({ ...event }))
    }
  };
}

export function getConversationOperationalReadiness() {
  const providerDegraded = Boolean(state.lastProviderFailureAt);

  return {
    component: 'conversation-native-layer',
    ready: true,
    status: providerDegraded ? 'degraded' : 'ready',
    mode: providerDegraded ? 'fallback-safe' : 'normal',
    channels: ['inapp', 'native_chat'],
    provider: {
      status: providerDegraded ? 'degraded' : 'ready',
      lastFailureAt: state.lastProviderFailureAt,
      lastFailureCorrelationId: state.lastProviderFailureCorrelationId
    }
  };
}

export function resetConversationObservabilityForTests() {
  state.lastEventAt = null;
  state.turnOutcomes.responded = 0;
  state.turnOutcomes.blocked = 0;
  state.turnOutcomes.executed = 0;
  state.turnOutcomes.failed = 0;
  state.totalTurns = 0;
  state.policyBlockedTotal = 0;
  state.providerFailuresTotal = 0;
  state.fallbackTriggeredTotal = 0;
  state.blockedByReason = {};
  state.fallbackByReason = {};
  state.turnsByChannel = {};
  state.toolExecutions = {};
  state.confirmation = {
    requiredTotal: 0,
    confirmedTotal: 0,
    blockedMissingTotal: 0
  };
  state.artifactsGeneratedTotal = 0;
  state.errorsByCode = {};
  state.recentEvents = [];
  state.lastProviderFailureAt = null;
  state.lastProviderFailureCorrelationId = null;
}
import { describe, it, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import {
  getConversationOperationalReadiness,
  getConversationTelemetrySnapshot,
  registerConversationFallback,
  registerConversationOperationalEvent,
  registerConversationPolicyBlocked,
  registerConversationProviderFailure,
  registerConversationTurnOutcome,
  resetConversationObservabilityForTests
} from '../../src/services/conversation/conversation-observability.js';

describe('conversation-observability', () => {
  beforeEach(() => {
    resetConversationObservabilityForTests();
  });

  it('contabiliza outcomes, bloqueios por policy e fallback', () => {
    registerConversationTurnOutcome('responded');
    registerConversationTurnOutcome('blocked');
    registerConversationPolicyBlocked('ACTIONS_DISABLED');
    registerConversationFallback('PROVIDER_UNAVAILABLE');
    registerConversationOperationalEvent({
      conversationSessionId: 'csn_test_001',
      conversationTurnId: 'ctn_test_001',
      correlationId: 'corr_test_001',
      channel: 'inapp',
      actionType: 'tool.execute',
      status: 'executed',
      toolName: 'print_manifest',
      requiresConfirmation: true,
      confirmed: true,
      artifactCount: 2,
      jobId: 'job_test_001',
      integrationAccountId: 'acc_test_001',
      sessionContextId: 'scx_test_001',
      userId: 'qa_tester'
    });

    const snapshot = getConversationTelemetrySnapshot();

    assert.equal(snapshot.counters.totalTurns, 2);
    assert.equal(snapshot.counters.outcomes.responded, 1);
    assert.equal(snapshot.counters.outcomes.blocked, 1);
    assert.equal(snapshot.counters.policyBlockedTotal, 1);
    assert.equal(snapshot.counters.fallbackTriggeredTotal, 1);
    assert.equal(snapshot.counters.artifactsGeneratedTotal, 2);
    assert.equal(snapshot.breakdown.blockedByReason.ACTIONS_DISABLED, 1);
    assert.equal(snapshot.breakdown.fallbackByReason.PROVIDER_UNAVAILABLE, 1);
    assert.equal(snapshot.breakdown.turnsByChannel.inapp, 1);
    assert.equal(snapshot.operations.tools.print_manifest.executed, 1);
    assert.equal(snapshot.operations.confirmation.requiredTotal, 1);
    assert.equal(snapshot.operations.confirmation.confirmedTotal, 1);
    assert.equal(snapshot.operations.recentEvents[0].jobId, 'job_test_001');
  });

  it('sinaliza readiness degradado quando houve falha de provider', () => {
    registerConversationProviderFailure('corr_test_provider_failure');

    const readiness = getConversationOperationalReadiness();

    assert.equal(readiness.component, 'conversation-native-layer');
    assert.equal(readiness.ready, true);
    assert.equal(readiness.status, 'degraded');
    assert.equal(readiness.mode, 'fallback-safe');
    assert.equal(readiness.provider.lastFailureCorrelationId, 'corr_test_provider_failure');
  });
});

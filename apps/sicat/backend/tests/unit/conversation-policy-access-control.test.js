import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { evaluateConversationPolicy } from '../../src/services/conversation/conversation-policy-service.js';

function buildContext(overrides = {}) {
  return {
    channel: 'inapp',
    correlationId: 'corr_test_conversation_policy',
    conversationSessionId: 'csn_test',
    conversationTurnId: 'ctn_test',
    integrationAccountId: 'acc_test_001',
    sessionContextId: 'scx_test_001',
    manifestId: 'man_test',
    jobId: null,
    auditCorrelationId: null,
    requestedBy: 'tester',
    idempotencyKey: null,
    metadata: {},
    ...overrides
  };
}

describe('conversation-policy-access-control (phase 08)', () => {
  describe('batch limit enforcement by channel', () => {
    it('bloqueia cancelamento em lote acima do limite no native_chat (max 10)', () => {
      const decision = evaluateConversationPolicy({
        toolName: 'orchestrate_manifest_operation',
        toolArgs: {
          intent: 'manifest.batch_cancel_selected',
          manifestIds: ['man_1', 'man_2', 'man_3', 'man_4', 'man_5', 'man_6', 'man_7', 'man_8', 'man_9', 'man_10', 'man_11'],
          confirmed: true,
          allowActions: true
        },
        channel: 'native_chat',
        confirmed: true,
        allowActions: true,
        context: buildContext()
      });

      assert.equal(decision.allowed, false);
      assert.equal(decision.reasonCode, 'BATCH_LIMIT_EXCEEDED');
      assert.equal(decision.maxBatchSize, 10);
    });

    it('permite cancelamento em lote dentro do limite no native_chat (10 itens)', () => {
      const decision = evaluateConversationPolicy({
        toolName: 'orchestrate_manifest_operation',
        toolArgs: {
          intent: 'manifest.batch_cancel_selected',
          manifestIds: Array.from({ length: 10 }, (_, i) => `man_${i + 1}`)
        },
        channel: 'native_chat',
        confirmed: true,
        allowActions: true,
        context: buildContext()
      });

      assert.equal(decision.allowed, true);
      assert.equal(decision.reasonCode, null);
    });

    it('permite cancelamento em lote acima de 10 no canal inapp (max 20)', () => {
      const decision = evaluateConversationPolicy({
        toolName: 'orchestrate_manifest_operation',
        toolArgs: {
          intent: 'manifest.batch_cancel_selected',
          manifestIds: Array.from({ length: 15 }, (_, i) => `man_${i + 1}`)
        },
        channel: 'inapp',
        confirmed: true,
        allowActions: true,
        context: buildContext()
      });

      assert.equal(decision.allowed, true);
    });

    it('bloqueia replicacao segmentada acima do limite no inapp (max 20)', () => {
      const decision = evaluateConversationPolicy({
        toolName: 'orchestrate_manifest_operation',
        toolArgs: {
          intent: 'manifest.replicate_segmented',
          segments: Array.from({ length: 25 }, (_, i) => ({
            sourceManifestId: `man_${i + 1}`,
            count: 1
          })),
          confirmed: true
        },
        channel: 'inapp',
        confirmed: true,
        allowActions: true,
        context: buildContext()
      });

      assert.equal(decision.allowed, false);
      assert.equal(decision.reasonCode, 'BATCH_LIMIT_EXCEEDED');
      assert.equal(decision.maxBatchSize, 20);
    });

    it('bloqueia download em lote acima do limite no native_chat (max 10)', () => {
      const decision = evaluateConversationPolicy({
        toolName: 'orchestrate_manifest_operation',
        toolArgs: {
          intent: 'cdf.download_batch_selected',
          documentIds: Array.from({ length: 15 }, (_, i) => `doc_${i + 1}`),
          confirmed: true
        },
        channel: 'native_chat',
        confirmed: true,
        allowActions: true,
        context: buildContext()
      });

      assert.equal(decision.allowed, false);
      assert.equal(decision.reasonCode, 'BATCH_LIMIT_EXCEEDED');
      assert.equal(decision.maxBatchSize, 10);
    });
  });

  describe('cross-account scope protection', () => {
    it('bloqueia confirmacao com snapshot de outra conta', () => {
      const decision = evaluateConversationPolicy({
        toolName: 'orchestrate_manifest_operation',
        toolArgs: {
          intent: 'manifest.batch_cancel_selected',
          manifestIds: ['man_1', 'man_2'],
          snapshotAccountId: 'acc_test_002',
          confirmed: true
        },
        channel: 'inapp',
        confirmed: true,
        allowActions: true,
        context: buildContext({ integrationAccountId: 'acc_test_001' })
      });

      assert.equal(decision.allowed, false);
      assert.equal(decision.reasonCode, 'CROSS_ACCOUNT_VIOLATION');
      assert.equal(decision.enforcedScope, 'account');
    });

    it('permite confirmacao com snapshot da mesma conta', () => {
      const decision = evaluateConversationPolicy({
        toolName: 'orchestrate_manifest_operation',
        toolArgs: {
          intent: 'manifest.batch_cancel_selected',
          manifestIds: ['man_1', 'man_2'],
          snapshotAccountId: 'acc_test_001',
          confirmed: true
        },
        channel: 'inapp',
        confirmed: true,
        allowActions: true,
        context: buildContext({ integrationAccountId: 'acc_test_001' })
      });

      assert.equal(decision.allowed, true);
    });

    it('bloqueia confirmacao sensivel quando conta nao esta ativa e snapshot especifica account', () => {
      const decision = evaluateConversationPolicy({
        toolName: 'orchestrate_manifest_operation',
        toolArgs: {
          intent: 'manifest.batch_cancel_selected',
          manifestIds: ['man_1'],
          snapshotAccountId: 'acc_test_002',
          confirmed: true
        },
        channel: 'inapp',
        confirmed: true,
        allowActions: true,
        context: buildContext({ integrationAccountId: null })
      });

      assert.equal(decision.allowed, false);
      assert.equal(decision.reasonCode, 'INTEGRATION_ACCOUNT_REQUIRED');
    });
  });

  describe('session scope protection', () => {
    it('bloqueia confirmacao com snapshot de sessao diferente', () => {
      const decision = evaluateConversationPolicy({
        toolName: 'orchestrate_manifest_operation',
        toolArgs: {
          intent: 'manifest.batch_cancel_selected',
          manifestIds: ['man_1', 'man_2'],
          snapshotSessionContextId: 'scx_test_002',
          snapshotAccountId: 'acc_test_001',
          confirmed: true
        },
        channel: 'inapp',
        confirmed: true,
        allowActions: true,
        context: buildContext({
          integrationAccountId: 'acc_test_001',
          sessionContextId: 'scx_test_001'
        })
      });

      assert.equal(decision.allowed, false);
      assert.equal(decision.reasonCode, 'SESSION_SCOPE_MISMATCH');
      assert.equal(decision.enforcedScope, 'session');
    });

    it('permite confirmacao com snapshot da mesma sessao', () => {
      const decision = evaluateConversationPolicy({
        toolName: 'orchestrate_manifest_operation',
        toolArgs: {
          intent: 'manifest.batch_cancel_selected',
          manifestIds: ['man_1', 'man_2'],
          snapshotSessionContextId: 'scx_test_001',
          snapshotAccountId: 'acc_test_001',
          confirmed: true
        },
        channel: 'inapp',
        confirmed: true,
        allowActions: true,
        context: buildContext({
          integrationAccountId: 'acc_test_001',
          sessionContextId: 'scx_test_001'
        })
      });

      assert.equal(decision.allowed, true);
    });

    it('bloqueia confirmacao quando sessao nao esta ativa mas snapshot requer session', () => {
      const decision = evaluateConversationPolicy({
        toolName: 'orchestrate_manifest_operation',
        toolArgs: {
          intent: 'manifest.batch_cancel_selected',
          manifestIds: ['man_1'],
          snapshotSessionContextId: 'scx_test_001',
          snapshotAccountId: 'acc_test_001',
          confirmed: true
        },
        channel: 'inapp',
        confirmed: true,
        allowActions: true,
        context: buildContext({
          integrationAccountId: 'acc_test_001',
          sessionContextId: null
        })
      });

      assert.equal(decision.allowed, false);
      assert.equal(decision.reasonCode, 'SESSION_SCOPE_MISMATCH');
    });
  });

  describe('combined access control validations', () => {
    it('sequence: channel -> account -> permission -> batch -> scope -> confirmation', () => {
      // Test 1: Channel check (should pass)
      const decision1 = evaluateConversationPolicy({
        toolName: 'orchestrate_manifest_operation',
        toolArgs: { intent: 'manifest.batch_cancel_selected' },
        channel: 'inapp',
        confirmed: false,
        allowActions: true,
        context: buildContext()
      });
      assert.equal(decision1.reasonCode, 'CONFIRMATION_REQUIRED');

      // Test 2: With confirmation but batch exceeds limit
      const decision2 = evaluateConversationPolicy({
        toolName: 'orchestrate_manifest_operation',
        toolArgs: {
          intent: 'manifest.batch_cancel_selected',
          manifestIds: Array.from({ length: 25 }, (_, i) => `man_${i + 1}`),
          confirmed: true
        },
        channel: 'inapp',
        confirmed: true,
        allowActions: true,
        context: buildContext()
      });
      assert.equal(decision2.reasonCode, 'BATCH_LIMIT_EXCEEDED');

      // Test 3: Batch within limit, cross-account mismatch
      const decision3 = evaluateConversationPolicy({
        toolName: 'orchestrate_manifest_operation',
        toolArgs: {
          intent: 'manifest.batch_cancel_selected',
          manifestIds: ['man_1', 'man_2'],
          snapshotAccountId: 'acc_test_999',
          confirmed: true
        },
        channel: 'inapp',
        confirmed: true,
        allowActions: true,
        context: buildContext({ integrationAccountId: 'acc_test_001' })
      });
      assert.equal(decision3.reasonCode, 'CROSS_ACCOUNT_VIOLATION');

      // Test 4: All checks pass
      const decision4 = evaluateConversationPolicy({
        toolName: 'orchestrate_manifest_operation',
        toolArgs: {
          intent: 'manifest.batch_cancel_selected',
          manifestIds: ['man_1', 'man_2'],
          snapshotAccountId: 'acc_test_001',
          snapshotSessionContextId: 'scx_test_001',
          confirmed: true
        },
        channel: 'inapp',
        confirmed: true,
        allowActions: true,
        context: buildContext({
          integrationAccountId: 'acc_test_001',
          sessionContextId: 'scx_test_001'
        })
      });
      assert.equal(decision4.allowed, true);
      assert.equal(decision4.reasonCode, null);
    });

    it('preserves existing policy checks while adding new controls', () => {
      // Permission check still applies
      const contextWithLimitedPerms = buildContext({
        metadata: { permissionKeys: ['manifest.read'] }
      });

      const decision = evaluateConversationPolicy({
        toolName: 'orchestrate_manifest_operation',
        toolArgs: {
          intent: 'manifest.batch_cancel_selected',
          manifestIds: ['man_1'],
          confirmed: true
        },
        channel: 'inapp',
        confirmed: true,
        allowActions: true,
        context: contextWithLimitedPerms
      });

      assert.equal(decision.allowed, false);
      assert.equal(decision.reasonCode, 'PERMISSION_DENIED');
    });
  });

  describe('read-only operations unaffected by new controls', () => {
    it('lista de manifestos nao bloqueia por batch limit', () => {
      const decision = evaluateConversationPolicy({
        toolName: 'orchestrate_manifest_operation',
        toolArgs: {
          intent: 'manifest.list_recent_top',
          top: 100
        },
        channel: 'whatsapp',
        confirmed: false,
        allowActions: false,
        context: buildContext()
      });

      assert.equal(decision.allowed, true);
      assert.equal(decision.reasonCode, null);
    });

    it('detalhamento do conjunto selecionado nao requer confirmacao nem batch limit', () => {
      const decision = evaluateConversationPolicy({
        toolName: 'orchestrate_manifest_operation',
        toolArgs: {
          intent: 'manifest.detail_selected_set',
          manifestIds: Array.from({ length: 30 }, (_, i) => `man_${i + 1}`)
        },
        channel: 'inapp',
        confirmed: false,
        allowActions: false,
        context: buildContext()
      });

      assert.equal(decision.allowed, true);
      assert.equal(decision.reasonCode, null);
    });
  });
});

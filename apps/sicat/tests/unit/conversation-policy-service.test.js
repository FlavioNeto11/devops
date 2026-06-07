import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { evaluateConversationPolicy } from '../../src/services/conversation/conversation-policy-service.js';

function buildContext() {
  return {
    channel: 'inapp',
    correlationId: 'corr_test_conversation_policy',
    conversationSessionId: 'csn_test',
    conversationTurnId: 'ctn_test',
    integrationAccountId: 'acc_test',
    sessionContextId: 'scx_test',
    manifestId: 'man_test',
    jobId: null,
    auditCorrelationId: null,
    requestedBy: 'tester',
    idempotencyKey: null,
    metadata: {}
  };
}

describe('conversation-policy-service', () => {
  it('bloqueia cancelamento sem confirmacao explicita', () => {
    const decision = evaluateConversationPolicy({
      toolName: 'cancel_manifest',
      channel: 'inapp',
      confirmed: false,
      allowActions: true,
      context: buildContext()
    });

    assert.equal(decision.allowed, false);
    assert.equal(decision.reasonCode, 'CONFIRMATION_REQUIRED');
    assert.equal(decision.riskLevel, 'R4');
  });

  it('bloqueia submit em canal whatsapp', () => {
    const decision = evaluateConversationPolicy({
      toolName: 'submit_manifest',
      channel: 'whatsapp',
      confirmed: true,
      allowActions: true,
      context: buildContext()
    });

    assert.equal(decision.allowed, false);
    assert.equal(decision.reasonCode, 'CHANNEL_BLOCKED');
  });

  it('bloqueia replicacao sem confirmacao explicita', () => {
    const decision = evaluateConversationPolicy({
      toolName: 'replicate_manifest',
      channel: 'inapp',
      confirmed: false,
      allowActions: true,
      context: buildContext()
    });

    assert.equal(decision.allowed, false);
    assert.equal(decision.reasonCode, 'CONFIRMATION_REQUIRED');
    assert.equal(decision.riskLevel, 'R3');
  });

  it('permite consulta de dashboard em qualquer canal', () => {
    const decision = evaluateConversationPolicy({
      toolName: 'get_dashboard_overview',
      channel: 'whatsapp',
      confirmed: false,
      allowActions: false,
      context: buildContext()
    });

    assert.equal(decision.allowed, true);
    assert.equal(decision.riskLevel, 'R1');
  });

  it('bloqueia cancelamento composto sem confirmacao explicita', () => {
    const decision = evaluateConversationPolicy({
      toolName: 'orchestrate_manifest_operation',
      toolArgs: {
        intent: 'manifest.cancel_recent_excluding_first',
        selection: {
          top: 3,
          skipMostRecent: 1
        }
      },
      channel: 'inapp',
      confirmed: false,
      allowActions: true,
      context: buildContext()
    });

    assert.equal(decision.allowed, false);
    assert.equal(decision.reasonCode, 'CONFIRMATION_REQUIRED');
    assert.equal(decision.riskLevel, 'R4');
  });

  it('permite consulta composta top N em canal whatsapp', () => {
    const decision = evaluateConversationPolicy({
      toolName: 'orchestrate_manifest_operation',
      toolArgs: {
        intent: 'manifest.list_recent_top',
        selection: {
          top: 3,
          skipMostRecent: 0
        }
      },
      channel: 'whatsapp',
      confirmed: false,
      allowActions: false,
      context: buildContext()
    });

    assert.equal(decision.allowed, true);
    assert.equal(decision.riskLevel, 'R1');
  });

  it('permite detalhamento do conjunto selecionado em qualquer canal', () => {
    const decision = evaluateConversationPolicy({
      toolName: 'orchestrate_manifest_operation',
      toolArgs: {
        intent: 'manifest.detail_selected_set',
        manifestIds: ['man_1', 'man_2']
      },
      channel: 'whatsapp',
      confirmed: false,
      allowActions: false,
      context: buildContext()
    });

    assert.equal(decision.allowed, true);
    assert.equal(decision.riskLevel, 'R1');
  });

  it('permite lookup de gerador por numero de manifesto em qualquer canal', () => {
    const decision = evaluateConversationPolicy({
      toolName: 'orchestrate_manifest_operation',
      toolArgs: {
        intent: 'manifest.lookup_generator_by_number',
        manifestNumber: '260011455990'
      },
      channel: 'whatsapp',
      confirmed: false,
      allowActions: false,
      context: buildContext()
    });

    assert.equal(decision.allowed, true);
    assert.equal(decision.riskLevel, 'R1');
  });

  it('permite consulta de manifestos perguntados na memoria da sessao', () => {
    const decision = evaluateConversationPolicy({
      toolName: 'orchestrate_manifest_operation',
      toolArgs: {
        intent: 'memory.list_asked_manifests',
        manifestIds: ['260011455990']
      },
      channel: 'inapp',
      confirmed: false,
      allowActions: false,
      context: buildContext()
    });

    assert.equal(decision.allowed, true);
    assert.equal(decision.riskLevel, 'R1');
  });

  it('bloqueia operacao de manifesto quando conta CETESB ativa nao esta no contexto', () => {
    const contextWithoutAccount = {
      ...buildContext(),
      integrationAccountId: null
    };

    const decision = evaluateConversationPolicy({
      toolName: 'list_manifests',
      channel: 'inapp',
      confirmed: false,
      allowActions: true,
      context: contextWithoutAccount
    });

    assert.equal(decision.allowed, false);
    assert.equal(decision.reasonCode, 'INTEGRATION_ACCOUNT_REQUIRED');
  });

  it('bloqueia operacao quando permissionKeys existe e nao contem permissao requerida', () => {
    const contextWithPermissions = {
      ...buildContext(),
      metadata: {
        permissionKeys: ['manifest.read']
      }
    };

    const decision = evaluateConversationPolicy({
      toolName: 'cancel_manifest',
      channel: 'inapp',
      confirmed: true,
      allowActions: true,
      context: contextWithPermissions
    });

    assert.equal(decision.allowed, false);
    assert.equal(decision.reasonCode, 'PERMISSION_DENIED');
  });

  it('bloqueia batch cancel composto sem confirmacao explicita', () => {
    const decision = evaluateConversationPolicy({
      toolName: 'orchestrate_manifest_operation',
      toolArgs: {
        intent: 'manifest.batch_cancel_selected',
        manifestIds: ['man_1', 'man_2']
      },
      channel: 'inapp',
      confirmed: false,
      allowActions: true,
      context: buildContext()
    });

    assert.equal(decision.allowed, false);
    assert.equal(decision.reasonCode, 'CONFIRMATION_REQUIRED');
    assert.equal(decision.riskLevel, 'R4');
  });

  it('bloqueia download de CDF sem confirmacao explicita', () => {
    const decision = evaluateConversationPolicy({
      toolName: 'enqueue_cdf_download',
      channel: 'inapp',
      confirmed: false,
      allowActions: true,
      context: buildContext(),
      toolArgs: {
        documentId: 'cdf_doc_1'
      }
    });

    assert.equal(decision.allowed, false);
    assert.equal(decision.reasonCode, 'CONFIRMATION_REQUIRED');
    assert.equal(decision.riskLevel, 'R3');
  });

  it('permite preview de cancelamento composto sem confirmacao', () => {
    const decision = evaluateConversationPolicy({
      toolName: 'orchestrate_manifest_operation',
      toolArgs: {
        intent: 'manifest.preview_cancel_recent_excluding_first',
        selection: {
          top: 3,
          skipMostRecent: 1
        }
      },
      channel: 'whatsapp',
      confirmed: false,
      allowActions: false,
      context: buildContext()
    });

    assert.equal(decision.allowed, true);
    assert.equal(decision.riskLevel, 'R2');
  });

  it('bloqueia download em lote de cdf sem confirmacao no intent orquestrado', () => {
    const decision = evaluateConversationPolicy({
      toolName: 'orchestrate_manifest_operation',
      toolArgs: {
        intent: 'cdf.download_batch_selected',
        documentIds: ['doc_1', 'doc_2']
      },
      channel: 'inapp',
      confirmed: false,
      allowActions: true,
      context: buildContext()
    });

    assert.equal(decision.allowed, false);
    assert.equal(decision.reasonCode, 'CONFIRMATION_REQUIRED');
    assert.equal(decision.riskLevel, 'R3');
  });
});

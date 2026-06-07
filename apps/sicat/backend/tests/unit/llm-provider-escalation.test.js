import { describe, it, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { createConversationService } from '../../src/services/conversation/conversation-service.js';
import { resetConversationObservabilityForTests } from '../../src/services/conversation/conversation-observability.js';

describe('LLM Provider Escalation Detection', () => {
  beforeEach(() => {
    resetConversationObservabilityForTests();
  });

  it('test-escalation-low-confidence: ProcessTurnOutput com escalationModelUsed quando plan retorna baixa confiança escalada', async () => {
    const mockLlmPlan = {
      provider: 'layered-llm-escalated',
      confidence: 0.85,
      outputText: 'Foram encontrados jobs com status pending',
      toolCall: { name: 'list_jobs', arguments: { status: 'pending' } },
      agentModelUsed: 'gpt-5-mini',
      synthesisModelUsed: 'gpt-4.1-mini',
      escalationModelUsed: 'gpt-5.1',
      escalationReason: 'low_confidence',
      orchestration: {}
    };

    const service = createConversationService({
      llmProvider: {
        async plan() {
          return mockLlmPlan;
        }
      }
    });

    const result = await service.processTurn({
      body: {
        channel: 'inapp',
        message: { text: 'listar jobs' },
        context: {
          integrationAccountId: 'acc_test',
          sessionContextId: 'scx_test',
          requestedBy: 'qa_tester'
        }
      },
      correlationId: 'corr_escalation_low_conf',
      headers: {},
      idempotencyKey: undefined
    });

    assert.ok(result.llm, 'llm deve estar presente');
    assert.equal(result.llm.escalationModelUsed, 'gpt-5.1', 'escalationModelUsed deve ser gpt-5.1');
    assert.equal(result.llm.escalationReason, 'low_confidence', 'escalationReason deve ser low_confidence');
    assert.equal(result.llm.provider, 'layered-llm-escalated', 'provider deve ser layered-llm-escalated');
  });

  it('test-escalation-high-risk: ProcessTurnOutput com escalationModelUsed quando plan retorna alto risco escalado', async () => {
    const mockLlmPlan = {
      provider: 'layered-llm-escalated',
      confidence: 0.88,
      outputText: 'Cancelamento em lote requer revisão de segurança',
      toolCall: { name: 'orchestrate_manifest_operation', arguments: { intent: 'manifest.batch_cancel_selected' } },
      agentModelUsed: 'gpt-5-mini',
      synthesisModelUsed: 'gpt-4.1-mini',
      escalationModelUsed: 'gpt-5.1',
      escalationReason: 'high_risk',
      orchestration: {}
    };

    const service = createConversationService({
      llmProvider: {
        async plan() {
          return mockLlmPlan;
        }
      }
    });

    const result = await service.processTurn({
      body: {
        channel: 'inapp',
        message: { text: 'cancele 10000 manifestos pendentes' },
        context: {
          integrationAccountId: 'acc_test',
          sessionContextId: 'scx_test',
          requestedBy: 'qa_tester'
        }
      },
      correlationId: 'corr_escalation_high_risk',
      headers: {},
      idempotencyKey: undefined
    });

    assert.ok(result.llm, 'llm deve estar presente');
    assert.equal(result.llm.escalationModelUsed, 'gpt-5.1', 'escalationModelUsed deve ser gpt-5.1');
    assert.equal(result.llm.escalationReason, 'high_risk', 'escalationReason deve ser high_risk');
  });

  it('test-normal-flow-no-escalation: ProcessTurnOutput SEM escalationModelUsed quando sem escalation', async () => {
    const mockLlmPlan = {
      provider: 'layered-llm',
      confidence: 0.92,
      outputText: 'Listando todos os jobs',
      toolCall: { name: 'list_jobs', arguments: {} },
      agentModelUsed: 'gpt-5-mini',
      synthesisModelUsed: 'gpt-4.1-mini',
      orchestration: {}
    };

    const service = createConversationService({
      llmProvider: {
        async plan() {
          return mockLlmPlan;
        }
      }
    });

    const result = await service.processTurn({
      body: {
        channel: 'inapp',
        message: { text: 'listar todos os jobs' },
        context: {
          integrationAccountId: 'acc_test',
          sessionContextId: 'scx_test',
          requestedBy: 'qa_tester'
        }
      },
      correlationId: 'corr_no_escalation',
      headers: {},
      idempotencyKey: undefined
    });

    assert.ok(result.llm, 'llm deve estar presente');
    assert.equal(result.llm.escalationModelUsed, undefined, 'escalationModelUsed deve ser undefined sem escalation');
    assert.equal(result.llm.escalationReason, undefined, 'escalationReason deve ser undefined');
    assert.equal(result.llm.provider, 'layered-llm', 'provider deve ser layered-llm');
  });

  it('test-escalation-reason-recorded: escalationReason registra o motivo correto', async () => {
    const mockLlmPlan = {
      provider: 'layered-llm-escalated',
      confidence: 0.79,
      outputText: 'Dashboard operacional com escalation',
      toolCall: { name: 'get_dashboard_overview', arguments: {} },
      agentModelUsed: 'gpt-5-mini',
      synthesisModelUsed: 'gpt-4.1-mini',
      escalationModelUsed: 'gpt-5.1',
      escalationReason: 'quality_issue',
      orchestration: {}
    };

    const service = createConversationService({
      llmProvider: {
        async plan() {
          return mockLlmPlan;
        }
      }
    });

    const result = await service.processTurn({
      body: {
        channel: 'inapp',
        message: { text: 'quero um relatório operacional' },
        context: {
          integrationAccountId: 'acc_test',
          sessionContextId: 'scx_test',
          requestedBy: 'qa_tester'
        }
      },
      correlationId: 'corr_reason_test',
      headers: {},
      idempotencyKey: undefined
    });

    // Validar que o motivo está registrado e é um dos valores permitidos
    const allowedReasons = ['low_confidence', 'high_risk', 'quality_issue', 'tool_ambiguity', 'complexity'];
    assert.ok(
      allowedReasons.includes(result.llm.escalationReason),
      `escalationReason '${result.llm.escalationReason}' deve estar entre: ${allowedReasons.join(', ')}`
    );
    assert.equal(result.llm.escalationReason, 'quality_issue', 'escalationReason deve ser quality_issue neste caso');
  });

  it('gpt-5.1 nunca é usado como agentModel por padrão', async () => {
    const mockLlmPlan = {
      provider: 'layered-llm',
      confidence: 0.94,
      outputText: 'Listando todos os jobs com status erro',
      toolCall: { name: 'list_jobs', arguments: { status: 'ERROR' } },
      agentModelUsed: 'gpt-5-mini',
      synthesisModelUsed: 'gpt-4.1-mini',
      orchestration: {}
    };

    const service = createConversationService({
      llmProvider: {
        async plan() {
          return mockLlmPlan;
        }
      }
    });

    const result = await service.processTurn({
      body: {
        channel: 'inapp',
        message: { text: 'listar todos os jobs com status erro' },
        context: {
          integrationAccountId: 'acc_test',
          sessionContextId: 'scx_test',
          requestedBy: 'qa_tester'
        }
      },
      correlationId: 'corr_no_gpt51_default',
      headers: {},
      idempotencyKey: undefined
    });

    assert.ok(result.llm, 'llm deve estar presente');
    assert.notEqual(result.llm.agentModelUsed, 'gpt-5.1', 'agentModelUsed NÃO deve ser gpt-5.1 por padrão');
    assert.notEqual(result.llm.synthesisModelUsed, 'gpt-5.1', 'synthesisModelUsed NÃO deve ser gpt-5.1 por padrão');
    assert.equal(result.llm.escalationModelUsed, undefined, 'escalationModelUsed deve ser undefined sem escalation');
  });

  it('escalationModelUsed e escalationReason APENAS quando ambos estão presentes juntos', async () => {
    // Testa que se um está presente, o outro também deve estar
    const mockLlmPlanWithEscalation = {
      provider: 'layered-llm-escalated',
      confidence: 0.80,
      outputText: 'resposta com escalação',
      toolCall: null,
      agentModelUsed: 'gpt-5-mini',
      synthesisModelUsed: 'gpt-4.1-mini',
      escalationModelUsed: 'gpt-5.1',
      escalationReason: 'complexity',
      orchestration: {}
    };

    const service = createConversationService({
      llmProvider: {
        async plan() {
          return mockLlmPlanWithEscalation;
        }
      }
    });

    const result = await service.processTurn({
      body: {
        channel: 'inapp',
        message: { text: 'operação complexa' },
        context: {
          integrationAccountId: 'acc_test',
          sessionContextId: 'scx_test',
          requestedBy: 'qa_tester'
        }
      },
      correlationId: 'corr_both_fields',
      headers: {},
      idempotencyKey: undefined
    });

    // Se escalationModelUsed existe, escalationReason também deve existir
    if (result.llm.escalationModelUsed !== undefined) {
      assert.ok(result.llm.escalationReason, 'escalationReason deve estar presente se escalationModelUsed existe');
      assert.equal(result.llm.escalationModelUsed, 'gpt-5.1', 'escalationModelUsed deve ser gpt-5.1');
    }
  });
});

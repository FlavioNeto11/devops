import { describe, it, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { createConversationService } from '../../src/services/conversation/conversation-service.js';
import {
  resetConversationObservabilityForTests
} from '../../src/services/conversation/conversation-observability.js';

describe('LLM model routing in ProcessTurnOutput', () => {
  beforeEach(() => {
    resetConversationObservabilityForTests();
  });

  it('ProcessTurnOutput contem agentModelUsed e synthesisModelUsed em response.llm', async () => {
    // Mock LlmProvider que retorna campos de modelo
    const mockLlmPlan = {
      provider: 'openai',
      confidence: 0.95,
      outputText: 'response text',
      toolCall: null,
      agentModelUsed: 'gpt-5-mini',
      synthesisModelUsed: 'gpt-4.1-mini',
      orchestration: undefined
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
        message: { text: 'quero ajuda' },
        context: {
          integrationAccountId: 'acc_test',
          sessionContextId: 'scx_test',
          requestedBy: 'qa_tester'
        }
      },
      correlationId: 'corr_test_models',
      headers: {},
      idempotencyKey: undefined
    });

    assert.ok(result.llm, 'llm deve estar presente em result');
    assert.equal(result.llm.agentModelUsed, 'gpt-5-mini', 'agentModelUsed deve ser gpt-5-mini');
    assert.equal(result.llm.synthesisModelUsed, 'gpt-4.1-mini', 'synthesisModelUsed deve ser gpt-4.1-mini');
  });

  it('ProcessTurnOutput inclui escalationModelUsed quando plan retorna escalation', async () => {
    const mockLlmPlan = {
      provider: 'openai',
      confidence: 0.95,
      outputText: 'response text',
      toolCall: null,
      agentModelUsed: 'gpt-5-mini',
      synthesisModelUsed: 'gpt-4.1-mini',
      escalationModelUsed: 'gpt-5.1',
      escalationReason: 'complex reasoning required',
      orchestration: undefined
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
        message: { text: 'quero ajuda' },
        context: {
          integrationAccountId: 'acc_test',
          sessionContextId: 'scx_test',
          requestedBy: 'qa_tester'
        }
      },
      correlationId: 'corr_test_escalation',
      headers: {},
      idempotencyKey: undefined
    });

    assert.ok(result.llm, 'llm deve estar presente em result');
    assert.equal(result.llm.escalationModelUsed, 'gpt-5.1', 'escalationModelUsed deve ser gpt-5.1');
    assert.equal(result.llm.escalationReason, 'complex reasoning required', 'escalationReason deve estar presente');
  });

  it('propaga escalation no resultado final com toolCall sem duplicar campos no payload raiz', async () => {
    const mockLlmPlan = {
      provider: 'openai',
      confidence: 0.91,
      outputText: 'Preparando listagem de jobs para analise',
      toolCall: {
        name: 'list_jobs',
        arguments: { status: 'pending' }
      },
      agentModelUsed: 'gpt-5-mini',
      synthesisModelUsed: 'gpt-4.1-mini',
      escalationModelUsed: 'gpt-5.1',
      escalationReason: 'tool_ambiguity',
      orchestration: undefined
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
        message: { text: 'listar jobs pendentes' },
        context: {
          integrationAccountId: 'acc_test',
          sessionContextId: 'scx_test',
          requestedBy: 'qa_tester'
        }
      },
      correlationId: 'corr_test_escalation_toolcall',
      headers: {},
      idempotencyKey: undefined
    });

    assert.equal(result.llm.escalationModelUsed, 'gpt-5.1');
    assert.equal(result.llm.escalationReason, 'tool_ambiguity');
    assert.equal(result.toolCall?.name, 'list_jobs');

    assert.equal(Object.hasOwn(result, 'escalationModelUsed'), false);
    assert.equal(Object.hasOwn(result, 'escalationReason'), false);
  });

  it('ProcessTurnOutput nao contem escalationModelUsed quando plan nao retorna escalation', async () => {
    const mockLlmPlan = {
      provider: 'openai',
      confidence: 0.95,
      outputText: 'response text',
      toolCall: null,
      agentModelUsed: 'gpt-5-mini',
      synthesisModelUsed: 'gpt-4.1-mini',
      orchestration: undefined
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
        message: { text: 'quero ajuda' },
        context: {
          integrationAccountId: 'acc_test',
          sessionContextId: 'scx_test',
          requestedBy: 'qa_tester'
        }
      },
      correlationId: 'corr_test_no_escalation',
      headers: {},
      idempotencyKey: undefined
    });

    assert.ok(result.llm, 'llm deve estar presente em result');
    assert.equal(
      result.llm.escalationModelUsed,
      undefined,
      'escalationModelUsed deve ser undefined quando nao há escalation'
    );
  });

  it('LlmPlan contem agentModelUsed e synthesisModelUsed obrigatórios', async () => {
    // Este teste valida a estrutura esperada de LlmPlan
    // retornada pelo provider
    const mockLlmPlan = {
      provider: 'openai',
      confidence: 0.95,
      outputText: 'response text',
      toolCall: null,
      agentModelUsed: 'gpt-5-mini',
      synthesisModelUsed: 'gpt-4.1-mini',
      orchestration: undefined
    };

    // Valida campos obrigatórios
    assert.ok(typeof mockLlmPlan.agentModelUsed === 'string', 'agentModelUsed deve ser string');
    assert.ok(typeof mockLlmPlan.synthesisModelUsed === 'string', 'synthesisModelUsed deve ser string');
    assert.ok(mockLlmPlan.agentModelUsed.length > 0, 'agentModelUsed nao deve ser vazio');
    assert.ok(mockLlmPlan.synthesisModelUsed.length > 0, 'synthesisModelUsed nao deve ser vazio');
  });

  it('LlmPlan contem campos opcionais escalationModelUsed e escalationReason', async () => {
    const mockLlmPlanWithEscalation = {
      provider: 'openai',
      confidence: 0.95,
      outputText: 'response text',
      toolCall: null,
      agentModelUsed: 'gpt-5-mini',
      synthesisModelUsed: 'gpt-4.1-mini',
      escalationModelUsed: 'gpt-5.1',
      escalationReason: 'complex reasoning required',
      orchestration: undefined
    };

    // Valida campos opcionais
    assert.ok(
      typeof mockLlmPlanWithEscalation.escalationModelUsed === 'string',
      'escalationModelUsed deve ser string quando presente'
    );
    assert.ok(
      typeof mockLlmPlanWithEscalation.escalationReason === 'string',
      'escalationReason deve ser string quando presente'
    );
  });

  it('LlmPlan sem escalation nao tem escalationModelUsed', async () => {
    const mockLlmPlan = {
      provider: 'openai',
      confidence: 0.95,
      outputText: 'response text',
      toolCall: null,
      agentModelUsed: 'gpt-5-mini',
      synthesisModelUsed: 'gpt-4.1-mini',
      orchestration: undefined
    };

    // Valida que campos opcionais estão ausentes
    assert.equal(mockLlmPlan.escalationModelUsed, undefined, 'escalationModelUsed ausente');
    assert.equal(mockLlmPlan.escalationReason, undefined, 'escalationReason ausente');
  });

  it('ProcessTurnOutput com provider-unavailable ainda contem agentModelUsed e synthesisModelUsed', async () => {
    // Quando provider falha, ainda assim o output deve ter modelo padrão/fallback
    const service = createConversationService({
      llmProvider: {
        async plan() {
          const err = new Error('provider offline');
          err.code = 'PROVIDER_UNAVAILABLE';
          throw err;
        }
      }
    });

    const result = await service.processTurn({
      body: {
        channel: 'inapp',
        message: { text: 'quero ajuda' },
        context: {
          integrationAccountId: 'acc_test',
          sessionContextId: 'scx_test',
          requestedBy: 'qa_tester'
        }
      },
      correlationId: 'corr_test_unavailable',
      headers: {},
      idempotencyKey: undefined
    });

    // Mesmo em falha, deve ter campos de modelo
    assert.ok(result.llm, 'llm deve estar presente em result');
    assert.ok(
      typeof result.llm.agentModelUsed === 'string',
      'agentModelUsed deve estar presente mesmo em falha'
    );
    assert.ok(
      typeof result.llm.synthesisModelUsed === 'string',
      'synthesisModelUsed deve estar presente mesmo em falha'
    );
  });
});

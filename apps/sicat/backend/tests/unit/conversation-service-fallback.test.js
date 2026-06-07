import { describe, it, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { createConversationService } from '../../src/services/conversation/conversation-service.js';
import {
  getConversationTelemetrySnapshot,
  resetConversationObservabilityForTests
} from '../../src/services/conversation/conversation-observability.js';

describe('conversation-service provider unavailability', () => {
  beforeEach(() => {
    resetConversationObservabilityForTests();
  });

  it('retorna falha explicita quando provider falha', async () => {
    const service = createConversationService({
      llmProvider: {
        async plan() {
          throw new Error('provider offline');
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
      correlationId: 'corr_test_fallback',
      headers: {},
      idempotencyKey: undefined
    });

    assert.equal(result.status, 'failed');
    assert.equal(result.correlationId, 'corr_test_fallback');
    assert.equal(result.result?.reasonCode, 'PROVIDER_UNAVAILABLE');
    assert.equal(result.llm.provider, 'provider-unavailable');
    assert.match(result.responseText, /PROVIDER_UNAVAILABLE/i);
    assert.notEqual(result.status, 'responded');

    const telemetry = getConversationTelemetrySnapshot();
    assert.equal(telemetry.counters.providerFailuresTotal, 1);
    assert.equal(telemetry.counters.fallbackTriggeredTotal, 0);
    assert.equal(telemetry.counters.outcomes.failed, 1);
  });

  it('falha quando provider for rule-based', async () => {
    const service = createConversationService({
      llmProvider: {
        async plan() {
          return {
            provider: 'rule-based',
            confidence: 0.95,
            outputText: 'Resposta heuristica local',
            toolCall: null
          };
        }
      }
    });

    const result = await service.processTurn({
      body: {
        channel: 'inapp',
        message: { text: 'listar manifestos' },
        context: {
          integrationAccountId: 'acc_test',
          sessionContextId: 'scx_test',
          requestedBy: 'qa_tester'
        }
      },
      correlationId: 'corr_test_rule_based_invalid_provider',
      headers: {}
    });

    assert.equal(result.status, 'failed');
    assert.equal(result.result?.reasonCode, 'INVALID_LLM_PROVIDER');
    assert.equal(result.llm.provider, 'rule-based');
    assert.equal(result.toolCall, null);
    assert.notEqual(result.status, 'responded');
  });

  it('falha quando provider for provider-adapter', async () => {
    const service = createConversationService({
      llmProvider: {
        async plan() {
          return {
            provider: 'provider-adapter',
            confidence: 0.95,
            outputText: 'Resposta heuristica local',
            toolCall: null
          };
        }
      }
    });

    const result = await service.processTurn({
      body: {
        channel: 'inapp',
        message: { text: 'listar manifestos' },
        context: {
          integrationAccountId: 'acc_test',
          sessionContextId: 'scx_test',
          requestedBy: 'qa_tester'
        }
      },
      correlationId: 'corr_test_provider_adapter_invalid_provider',
      headers: {}
    });

    assert.equal(result.status, 'failed');
    assert.equal(result.result?.reasonCode, 'INVALID_LLM_PROVIDER');
    assert.equal(result.llm.provider, 'provider-adapter');
    assert.equal(result.toolCall, null);
    assert.notEqual(result.status, 'responded');
  });

  it('falha quando provider for deterministic', async () => {
    const service = createConversationService({
      llmProvider: {
        async plan() {
          return {
            provider: 'deterministic',
            confidence: 0.95,
            outputText: 'Resposta heuristica local',
            toolCall: null
          };
        }
      }
    });

    const result = await service.processTurn({
      body: {
        channel: 'inapp',
        message: { text: 'listar manifestos' },
        context: {
          integrationAccountId: 'acc_test',
          sessionContextId: 'scx_test',
          requestedBy: 'qa_tester'
        }
      },
      correlationId: 'corr_test_deterministic_invalid_provider',
      headers: {}
    });

    assert.equal(result.status, 'failed');
    assert.equal(result.result?.reasonCode, 'INVALID_LLM_PROVIDER');
    assert.equal(result.llm.provider, 'deterministic');
    assert.equal(result.toolCall, null);
    assert.notEqual(result.status, 'responded');
  });

  it('falha quando provider for unknown-llm', async () => {
    const service = createConversationService({
      llmProvider: {
        async plan() {
          return {
            provider: '',
            confidence: 0.95,
            outputText: 'Resposta heuristica local',
            toolCall: null
          };
        }
      }
    });

    const result = await service.processTurn({
      body: {
        channel: 'inapp',
        message: { text: 'listar manifestos' },
        context: {
          integrationAccountId: 'acc_test',
          sessionContextId: 'scx_test',
          requestedBy: 'qa_tester'
        }
      },
      correlationId: 'corr_test_unknown_invalid_provider',
      headers: {}
    });

    assert.equal(result.status, 'failed');
    assert.equal(result.result?.reasonCode, 'INVALID_LLM_PROVIDER');
    assert.equal(result.llm.provider, 'unknown-llm');
    assert.equal(result.toolCall, null);
    assert.notEqual(result.status, 'responded');
  });

  it('mantem erro tecnico minimo quando provider falha mesmo com saudacao', async () => {
    const service = createConversationService({
      llmProvider: {
        async plan() {
          throw new Error('provider offline');
        }
      }
    });

    const result = await service.processTurn({
      body: {
        channel: 'inapp',
        message: { text: 'oi' },
        context: {
          integrationAccountId: 'acc_test',
          sessionContextId: 'scx_test',
          requestedBy: 'qa_tester'
        }
      },
      correlationId: 'corr_test_greeting_fallback',
      headers: {},
      idempotencyKey: undefined
    });

    assert.equal(result.status, 'failed');
    assert.equal(result.llm.provider, 'provider-unavailable');
    assert.equal(result.toolCall, null);
    assert.equal(result.result?.reasonCode, 'PROVIDER_UNAVAILABLE');
    assert.match(result.responseText, /reasonCode=PROVIDER_UNAVAILABLE/i);

    const telemetry = getConversationTelemetrySnapshot();
    assert.equal(telemetry.counters.providerFailuresTotal, 1);
    assert.equal(telemetry.counters.fallbackTriggeredTotal, 0);
    assert.equal(telemetry.counters.outcomes.failed, 1);
  });

  it('nao responde como sucesso em indisponibilidade total do provider', async () => {
    const service = createConversationService({
      llmProvider: {
        async plan() {
          throw new Error('provider offline');
        }
      }
    });

    const result = await service.processTurn({
      body: {
        channel: 'inapp',
        message: { text: 'cancelar os 3 manifestos mais recentes ignorando o primeiro mais recente' },
        context: {
          integrationAccountId: 'acc_test',
          sessionContextId: 'scx_test',
          requestedBy: 'qa_tester'
        }
      },
      correlationId: 'corr_test_no_regex_fallback',
      headers: {},
      idempotencyKey: undefined
    });

    assert.equal(result.status, 'failed');
    assert.equal(result.toolCall, null);
    assert.equal(result.result?.reasonCode, 'PROVIDER_UNAVAILABLE');
  });

  it('responde com pergunta de esclarecimento sem emitir tool call quando intencao e unclear', async () => {
    const service = createConversationService({
      llmProvider: {
        async plan() {
          return {
            provider: 'layered-llm',
            confidence: 0.42,
            outputText: 'Pode esclarecer se voce quer listar, detalhar ou cancelar manifestos?',
            toolCall: null
          };
        }
      }
    });

    const result = await service.processTurn({
      body: {
        channel: 'inapp',
        message: { text: 'de onde vem?' },
        context: {
          integrationAccountId: 'acc_test',
          sessionContextId: 'scx_test',
          requestedBy: 'qa_tester'
        }
      },
      correlationId: 'corr_test_unclear_no_tool',
      headers: {},
      idempotencyKey: undefined
    });

    assert.equal(result.status, 'responded');
    assert.notEqual(result.llm.provider, 'explicit-tool-request');
    assert.equal(result.toolCall, null);
    assert.match(result.responseText, /esclarecer/i);
  });

  it('usa explicit-tool-request somente quando toolRequest e fornecido no body', async () => {
    const service = createConversationService({
      llmProvider: {
        async plan() {
          throw new Error('plan nao deveria ser chamado quando toolRequest e explicito');
        }
      }
    });

    const result = await service.processTurn({
      body: {
        channel: 'inapp',
        message: { text: 'executar ferramenta agora' },
        toolRequest: {
          name: 'get_dashboard_overview',
          arguments: {},
          confirmed: true
        },
        context: {
          integrationAccountId: 'acc_test',
          sessionContextId: 'scx_test',
          requestedBy: 'qa_tester'
        }
      },
      correlationId: 'corr_test_explicit_tool_request_allowed',
      headers: {}
    });

    assert.equal(result.llm.provider, 'explicit-tool-request');
    assert.equal(result.toolCall?.name, 'get_dashboard_overview');
    assert.notEqual(result.status, 'responded');
  });

  it('reprova explicit-tool-request quando toolRequest nao existe no body', async () => {
    const service = createConversationService({
      llmProvider: {
        async plan() {
          return {
            provider: 'explicit-tool-request',
            confidence: 0.99,
            outputText: 'Tool request recebido explicitamente.',
            toolCall: {
              name: 'get_dashboard_overview',
              arguments: {},
              confirmed: true
            }
          };
        }
      }
    });

    const result = await service.processTurn({
      body: {
        channel: 'inapp',
        message: { text: 'mostre o dashboard' },
        context: {
          integrationAccountId: 'acc_test',
          sessionContextId: 'scx_test',
          requestedBy: 'qa_tester'
        }
      },
      correlationId: 'corr_test_explicit_tool_without_body_tool_request',
      headers: {}
    });

    assert.equal(result.status, 'failed');
    assert.equal(result.result?.reasonCode, 'INVALID_LLM_PROVIDER');
    assert.equal(result.llm.provider, 'explicit-tool-request');
    assert.equal(result.toolCall, null);
    assert.notEqual(result.status, 'responded');
  });

  it('aplica decisao de intencao a partir da camada classifier/planner do provider', async () => {
    const service = createConversationService({
      llmProvider: {
        async plan() {
          return {
            provider: 'layered-llm',
            confidence: 0.94,
            outputText: 'Vou preparar o cancelamento composto solicitado.',
            toolCall: {
              name: 'orchestrate_manifest_operation',
              arguments: {
                intent: 'manifest.cancel_recent_excluding_first',
                selection: {
                  top: 2,
                  skipMostRecent: 1,
                  orderBy: 'recency_desc'
                }
              },
              confirmed: false
            },
            orchestration: {
              classifier: {
                intent: 'manifest.cancel_recent_excluding_first',
                confidence: 0.92,
                entities: {
                  top: 2,
                  skipMostRecent: 1
                },
                needsClarification: false,
                clarifyingQuestion: null
              },
              planner: {
                outputText: 'Vou preparar o cancelamento composto solicitado.',
                toolName: 'orchestrate_manifest_operation',
                toolArgs: {
                  intent: 'manifest.cancel_recent_excluding_first',
                  selection: {
                    top: 2,
                    skipMostRecent: 1,
                    orderBy: 'recency_desc'
                  }
                },
                confidence: 0.95,
                needsClarification: false,
                clarifyingQuestion: null
              }
            }
          };
        }
      }
    });

    const result = await service.processTurn({
      body: {
        channel: 'inapp',
        message: { text: 'cancele os 2 mais recentes ignorando o primeiro' },
        context: {
          integrationAccountId: 'acc_test',
          sessionContextId: 'scx_test',
          requestedBy: 'qa_tester'
        },
        options: {
          allowActions: true
        }
      },
      correlationId: 'corr_test_layered_classifier_planner',
      headers: {},
      idempotencyKey: undefined
    });

    assert.equal(result.llm.provider, 'layered-llm');
    assert.equal(result.toolCall?.name, 'orchestrate_manifest_operation');
    assert.equal(result.toolCall?.arguments.intent, 'manifest.cancel_recent_excluding_first');
    assert.equal(result.status, 'blocked');
    assert.equal(result.policy.reasonCode, 'CONFIRMATION_REQUIRED');
  });
});

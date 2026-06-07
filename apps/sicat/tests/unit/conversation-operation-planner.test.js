import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { buildConversationOperationPlan } from '../../src/services/conversation/planning/conversation-operation-planner.js';

describe('conversation operation planner', () => {
  it('gera plano multi-etapa com confirmacao para cancelamento composto', () => {
    const plan = buildConversationOperationPlan({
      llmPlan: {
        provider: 'mock',
        confidence: 0.9,
        outputText: 'cancelar',
        toolCall: {
          name: 'orchestrate_manifest_operation',
          arguments: {
            intent: 'manifest.cancel_recent_excluding_first',
            selection: {
              top: 3,
              skipMostRecent: 1
            }
          },
          confirmed: false
        }
      },
      context: {
        integrationAccountId: 'acc_1',
        sessionContextId: 'scx_1',
        manifestId: null
      }
    });

    assert.ok(plan);
    assert.equal(plan.intent, 'manifest.cancel_recent_excluding_first');
    assert.equal(plan.requiresConfirmation, true);
    assert.equal(plan.risk, 'R4');
    assert.ok(Array.isArray(plan.steps));
    assert.equal(plan.steps.some((step) => step.kind === 'confirm'), true);
    assert.equal(plan.steps.at(-1)?.dependsOn.includes('step_confirm'), true);
  });

  it('resolve intervalo relativo de datas no plano', () => {
    const plan = buildConversationOperationPlan({
      llmPlan: {
        provider: 'mock',
        confidence: 0.8,
        outputText: 'listar',
        toolCall: {
          name: 'orchestrate_manifest_operation',
          arguments: {
            intent: 'manifest.list_recent_top'
          }
        },
        orchestration: {
          classifier: {
            intent: 'manifest.list_recent_top',
            confidence: 0.8,
            entities: {
              lastDays: 7
            },
            needsClarification: false,
            clarifyingQuestion: null
          },
          planner: {
            outputText: 'listar',
            toolName: 'orchestrate_manifest_operation',
            toolArgs: {},
            confidence: 0.8,
            needsClarification: false,
            clarifyingQuestion: null
          }
        }
      },
      context: {
        integrationAccountId: 'acc_1',
        sessionContextId: 'scx_1',
        manifestId: null
      }
    });

    assert.ok(plan?.entities.dateRange.dateFrom);
    assert.ok(plan?.entities.dateRange.dateTo);
    assert.equal(plan?.entities.dateRange.source, 'relative');
  });

  it('gera somente etapa de preview quando acao sensivel vier em modo preview', () => {
    const plan = buildConversationOperationPlan({
      llmPlan: {
        provider: 'mock',
        confidence: 0.8,
        outputText: 'preview replicacao',
        toolCall: {
          name: 'orchestrate_manifest_operation',
          arguments: {
            intent: 'manifest.replicate_segmented',
            mode: 'preview',
            segments: [
              {
                sourceManifestId: 'man_1',
                count: 2,
                overrides: { vehiclePlate: 'ABC1D23' }
              }
            ]
          }
        }
      },
      context: {
        integrationAccountId: 'acc_1',
        sessionContextId: 'scx_1',
        manifestId: null
      }
    });

    assert.ok(plan);
    assert.equal(plan.intent, 'manifest.replicate_segmented');
    assert.equal(plan.requiresConfirmation, true);
    assert.equal(plan.steps.some((step) => step.kind === 'preview'), true);
    assert.equal(plan.steps.some((step) => step.kind === 'confirm'), false);
    assert.equal(plan.steps.some((step) => step.kind === 'action'), false);
  });
});

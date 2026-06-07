import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { describe, it } from 'node:test';
import {
  buildEscalationMetricsFromResults,
  buildReport,
  createEarlyStopState,
  resolveSmokeRunOptions,
  shouldStopEarly,
  updateEarlyStopState
} from '../../scripts/ai-smoke/run-sicat-ai-smoke.mjs';

function buildResult(input) {
  return {
    scenario: {
      id: input.id,
      category: input.category || 'general',
      prompt: 'prompt de teste'
    },
    pass: Boolean(input.pass),
    judgement: {
      score: input.score,
      recommendation: input.recommendation || null,
      unsafe: input.reasonCode ? [input.reasonCode] : []
    }
  };
}

describe('ai-smoke fail-fast options', () => {
  it('failFast fica true por default', () => {
    const options = resolveSmokeRunOptions({}, {
      catalogPath: 'docs/ai-chat/intents/sicat-chat-intent-catalog.jsonl',
      scenarioCount: 100
    });

    assert.equal(options.failFast, true);
  });

  it('--no-fail-fast desativa fail-fast', () => {
    const options = resolveSmokeRunOptions({
      failFast: false,
      provided: { failFast: true }
    }, {
      catalogPath: 'docs/ai-chat/intents/sicat-chat-intent-catalog.jsonl',
      scenarioCount: 100
    });

    assert.equal(options.failFast, false);
  });

  it('dry-run sempre desativa fail-fast', () => {
    const options = resolveSmokeRunOptions({
      dryRun: true,
      failFast: true,
      provided: { failFast: true }
    }, {
      catalogPath: 'docs/ai-chat/intents/sicat-chat-intent-catalog.sample.jsonl',
      scenarioCount: 10
    });

    assert.equal(options.failFast, false);
  });
});

describe('ai-smoke early-stop rules', () => {
  it('para apos 3 low scores consecutivos por default', () => {
    const options = resolveSmokeRunOptions({
      maxConsecutiveFailures: 0,
      provided: { maxConsecutiveFailures: true }
    }, {
      catalogPath: 'docs/ai-chat/intents/sicat-chat-intent-catalog.jsonl',
      scenarioCount: 100
    });
    const state = createEarlyStopState(options);

    updateEarlyStopState(state, buildResult({ id: 's1', pass: true, score: 0.2 }), options);
    assert.equal(shouldStopEarly(state, { id: 's1' }, options), null);

    updateEarlyStopState(state, buildResult({ id: 's2', pass: true, score: 0.3 }), options);
    assert.equal(shouldStopEarly(state, { id: 's2' }, options), null);

    updateEarlyStopState(state, buildResult({ id: 's3', pass: true, score: 0.4 }), options);
    const decision = shouldStopEarly(state, { id: 's3' }, options);

    assert.equal(decision?.reasonCode, 'MAX_CONSECUTIVE_LOW_SCORES_REACHED');
  });

  it('para apos 3 falhas consecutivas por default', () => {
    const options = resolveSmokeRunOptions({
      maxConsecutiveLowScores: 0,
      provided: { maxConsecutiveLowScores: true }
    }, {
      catalogPath: 'docs/ai-chat/intents/sicat-chat-intent-catalog.jsonl',
      scenarioCount: 100
    });
    const state = createEarlyStopState(options);

    updateEarlyStopState(state, buildResult({ id: 'f1', pass: false, score: 1 }), options);
    assert.equal(shouldStopEarly(state, { id: 'f1' }, options), null);

    updateEarlyStopState(state, buildResult({ id: 'f2', pass: false, score: 1 }), options);
    assert.equal(shouldStopEarly(state, { id: 'f2' }, options), null);

    updateEarlyStopState(state, buildResult({ id: 'f3', pass: false, score: 1 }), options);
    const decision = shouldStopEarly(state, { id: 'f3' }, options);

    assert.equal(decision?.reasonCode, 'MAX_CONSECUTIVE_FAILURES_REACHED');
  });

  it('nao para quando fail-fast esta desativado', () => {
    const options = resolveSmokeRunOptions({
      failFast: false,
      provided: { failFast: true }
    }, {
      catalogPath: 'docs/ai-chat/intents/sicat-chat-intent-catalog.jsonl',
      scenarioCount: 100
    });
    const state = createEarlyStopState(options);

    updateEarlyStopState(state, buildResult({ id: 'x1', pass: false, score: 0 }), options);
    updateEarlyStopState(state, buildResult({ id: 'x2', pass: false, score: 0 }), options);
    updateEarlyStopState(state, buildResult({ id: 'x3', pass: false, score: 0 }), options);

    assert.equal(shouldStopEarly(state, { id: 'x3' }, options), null);
  });

  it('para no fim do batch quando passRate parcial fica abaixo de 0.70', () => {
    const options = resolveSmokeRunOptions({
      maxConsecutiveFailures: 0,
      maxConsecutiveLowScores: 0,
      batchSize: 4,
      stopAfterBatchIfBelowPassRate: 0.7,
      provided: {
        maxConsecutiveFailures: true,
        maxConsecutiveLowScores: true,
        batchSize: true,
        stopAfterBatchIfBelowPassRate: true
      }
    }, {
      catalogPath: 'docs/ai-chat/intents/sicat-chat-intent-catalog.jsonl',
      scenarioCount: 100
    });
    const state = createEarlyStopState(options);

    updateEarlyStopState(state, buildResult({ id: 'b1', pass: true, score: 1 }), options);
    updateEarlyStopState(state, buildResult({ id: 'b2', pass: false, score: 1 }), options);
    updateEarlyStopState(state, buildResult({ id: 'b3', pass: false, score: 1 }), options);
    updateEarlyStopState(state, buildResult({ id: 'b4', pass: true, score: 1 }), options);

    const decision = shouldStopEarly(state, { id: 'b4' }, options);
    assert.equal(decision?.reasonCode, 'BATCH_PASS_RATE_BELOW_THRESHOLD');
  });
});

describe('ai-smoke report early-stop metadata', () => {
  it('relatorio marca earlyStopped=true quando interrompido', () => {
    const options = resolveSmokeRunOptions({}, {
      catalogPath: 'docs/ai-chat/intents/sicat-chat-intent-catalog.jsonl',
      scenarioCount: 100
    });
    const state = createEarlyStopState(options);
    const result = buildResult({ id: 'r1', pass: false, score: 0, reasonCode: 'EXECUTION_ERROR' });

    updateEarlyStopState(state, result, options);
    state.earlyStopped = true;
    state.earlyStopReason = 'MAX_CONSECUTIVE_FAILURES_REACHED';
    state.earlyStopAtScenarioId = 'r1';
    state.earlyStopAfter = 1;
    state.earlyStopCounters = {
      failed: 1,
      consecutiveFailures: 1,
      consecutiveLowScores: 1,
      passRate: 0,
      batchIndex: 1,
      batchSize: options.batchSize,
      lowScoreThreshold: options.lowScoreThreshold,
      maxConsecutiveLowScores: options.maxConsecutiveLowScores,
      maxConsecutiveFailures: options.maxConsecutiveFailures
    };

    const report = buildReport({
      startedAt: new Date().toISOString(),
      catalogPath: 'docs/ai-chat/intents/sicat-chat-intent-catalog.jsonl',
      results: [result],
      options,
      earlyStopState: state
    });

    assert.equal(report.earlyStopped, true);
    assert.equal(Boolean(report.earlyStopCounters), true);
  });

  it('relatorio inclui earlyStopReason quando interrompido', () => {
    const options = resolveSmokeRunOptions({}, {
      catalogPath: 'docs/ai-chat/intents/sicat-chat-intent-catalog.jsonl',
      scenarioCount: 100
    });
    const state = createEarlyStopState(options);
    const result = buildResult({ id: 'r2', pass: false, score: 0, reasonCode: 'EXECUTION_ERROR' });

    updateEarlyStopState(state, result, options);
    state.earlyStopped = true;
    state.earlyStopReason = 'BATCH_PASS_RATE_BELOW_THRESHOLD';
    state.earlyStopAtScenarioId = 'r2';
    state.earlyStopAfter = 1;
    state.earlyStopCounters = {
      failed: 1,
      consecutiveFailures: 1,
      consecutiveLowScores: 1,
      passRate: 0,
      batchIndex: 1,
      batchSize: options.batchSize,
      lowScoreThreshold: options.lowScoreThreshold,
      maxConsecutiveLowScores: options.maxConsecutiveLowScores,
      maxConsecutiveFailures: options.maxConsecutiveFailures
    };

    const report = buildReport({
      startedAt: new Date().toISOString(),
      catalogPath: 'docs/ai-chat/intents/sicat-chat-intent-catalog.jsonl',
      results: [result],
      options,
      earlyStopState: state
    });

    assert.equal(report.earlyStopReason, 'BATCH_PASS_RATE_BELOW_THRESHOLD');
  });
});

describe('ai-smoke escalation metrics', () => {
  it('calcula escalationMetrics com breakdown por reason', () => {
    const metrics = buildEscalationMetricsFromResults([
      {
        scenario: { id: 'e1' },
        backendResponse: {
          llm: {
            escalationModelUsed: 'gpt-5.1',
            escalationReason: 'low_confidence'
          }
        }
      },
      {
        scenario: { id: 'e2' },
        backendResponse: {
          llm: {
            escalationModelUsed: 'gpt-5.1',
            escalationReason: 'high_risk'
          }
        }
      },
      {
        scenario: { id: 'e3' },
        backendResponse: {
          llm: {
            agentModelUsed: 'gpt-5-mini'
          }
        }
      }
    ]);

    assert.equal(metrics.totalTurns, 3);
    assert.equal(metrics.totalEscalations, 2);
    assert.equal(metrics.escalationRate, 2 / 3);
    assert.equal(metrics.escalationReasons.low_confidence, 1);
    assert.equal(metrics.escalationReasons.high_risk, 1);
    assert.equal(metrics.escalationReasons.quality_issue, 0);
    assert.equal(metrics.turnsWithEscalation.length, 2);
  });

  it('marca ESCALATION_RATE_HIGH quando taxa > 20%', () => {
    const options = resolveSmokeRunOptions({}, {
      catalogPath: 'docs/ai-chat/intents/sicat-chat-intent-catalog.sample.jsonl',
      scenarioCount: 5
    });
    const state = createEarlyStopState(options);
    const result = buildResult({ id: 'ok1', pass: true, score: 1 });
    updateEarlyStopState(state, result, options);

    const report = buildReport({
      startedAt: new Date().toISOString(),
      catalogPath: 'docs/ai-chat/intents/sicat-chat-intent-catalog.sample.jsonl',
      results: [result],
      options,
      earlyStopState: state,
      escalationMetrics: {
        totalTurns: 5,
        totalEscalations: 2,
        escalationReasons: {
          low_confidence: 1,
          high_risk: 1,
          quality_issue: 0,
          tool_ambiguity: 0,
          complexity: 0
        },
        turnsWithEscalation: [
          { scenarioId: 'e1', escalationModelUsed: 'gpt-5.1', escalationReason: 'low_confidence' },
          { scenarioId: 'e2', escalationModelUsed: 'gpt-5.1', escalationReason: 'high_risk' }
        ],
        escalationRate: 0.4,
        escalationRateHigh: true,
        warningMessage: '⚠️ Escalation rate está acima de 20%. Revisar triggers ou aumentar capacity.'
      }
    });

    assert.equal(report.escalationMetrics.escalationRateHigh, true);
    assert.equal(
      report.escalationMetrics.warningMessage,
      '⚠️ Escalation rate está acima de 20%. Revisar triggers ou aumentar capacity.'
    );
  });
});

describe('package scripts full mode', () => {
  it('scripts full usam --no-fail-fast', () => {
    const packageJsonPath = path.resolve('package.json');
    const pkg = JSON.parse(fs.readFileSync(packageJsonPath, 'utf8'));

    assert.match(pkg.scripts['smoke:ai-chat:sample:full'], /--no-fail-fast/);
    assert.match(pkg.scripts['smoke:ai-chat:full'], /--no-fail-fast/);
    assert.match(pkg.scripts['smoke:ai-chat:category:full'], /--no-fail-fast/);
  });
});

/**
 * Testes do clamp de enforcement (`applyEnforcementClamp`, PR-A5) — função PURA extraída de
 * `lib/transport/rule-evaluators.ts`. Regra de ouro do programa em código: um `block` só é
 * ENFORÇÁVEL quando a versão da regra está `implementationState === 'ACTIVE'` E `blocking ===
 * true`; em qualquer outro caso vira `warn`, com o status original preservado em `rawStatus` e
 * `RULE_NOT_ENFORCEABLE` como `reasonCode`. `pass`/`warn`/`not_applicable` NUNCA são clampados.
 */

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

import { applyEnforcementClamp } from '../../src/lib/transport/rule-evaluators.js';

function buildRuleVersion(overrides = {}) {
  return {
    id: 'regrulev_fixture',
    ruleId: 'regrule_fixture',
    versionLabel: 'v2026-08-baseline',
    legalBasis: [{ reference: 'Lei 13.703/2018' }],
    summary: 'fixture',
    effectiveFrom: '2018-08-09',
    effectiveUntil: null,
    implementationState: 'ACTIVE',
    blocking: false,
    severity: 'critical',
    applicability: {},
    reasonCodes: [],
    sourceHash: null,
    reviewedBy: null,
    reviewedAt: null,
    version: 1,
    createdAt: '2026-08-13T00:00:00Z',
    updatedAt: '2026-08-13T00:00:00Z',
    ...overrides
  };
}

function buildBlockOutcome(overrides = {}) {
  return {
    status: 'block',
    reasonCode: 'FREIGHT_BELOW_FLOOR',
    humanMessage: 'Frete ofertado abaixo do piso mínimo vigente.',
    inputs: { freightFloorAmount: 3000, freightOfferedAmount: 2500 },
    result: { freightFloorAmount: 3000, freightOfferedAmount: 2500 },
    ...overrides
  };
}

describe('applyEnforcementClamp — block', () => {
  it('block + ACTIVE + blocking=false → warn, rawStatus=block, reasonCode=RULE_NOT_ENFORCEABLE', () => {
    const outcome = buildBlockOutcome();
    const ruleVersion = buildRuleVersion({ implementationState: 'ACTIVE', blocking: false });

    const clamped = applyEnforcementClamp(outcome, ruleVersion);

    assert.strictEqual(clamped.status, 'warn');
    assert.strictEqual(clamped.rawStatus, 'block');
    assert.strictEqual(clamped.reasonCode, 'RULE_NOT_ENFORCEABLE');
    assert.strictEqual(clamped.humanMessage, outcome.humanMessage, 'humanMessage original é preservada');
    assert.strictEqual(clamped.result.clamp.originalReasonCode, 'FREIGHT_BELOW_FLOOR', 'motivo original preservado no result_snapshot');
    assert.strictEqual(clamped.result.clamp.originalStatus, 'block');
    assert.strictEqual(clamped.result.freightFloorAmount, 3000, 'demais campos do result original são preservados');
  });

  it('block + UNDER_REVIEW (mesmo com blocking=true) → warn, rawStatus=block', () => {
    const outcome = buildBlockOutcome();
    const ruleVersion = buildRuleVersion({ implementationState: 'UNDER_REVIEW', blocking: true });

    const clamped = applyEnforcementClamp(outcome, ruleVersion);

    assert.strictEqual(clamped.status, 'warn');
    assert.strictEqual(clamped.rawStatus, 'block');
    assert.strictEqual(clamped.reasonCode, 'RULE_NOT_ENFORCEABLE');
  });

  it('block + ACTIVE + blocking=false + qualquer outro estado não-ACTIVE → sempre warn', () => {
    for (const implementationState of ['DRAFT', 'FUTURE', 'SUPERSEDED', 'REVOKED', 'AWAITING_REGULATION']) {
      const clamped = applyEnforcementClamp(buildBlockOutcome(), buildRuleVersion({ implementationState, blocking: false }));
      assert.strictEqual(clamped.status, 'warn', `${implementationState} deveria clampar para warn`);
      assert.strictEqual(clamped.rawStatus, 'block');
    }
  });

  it('block + ACTIVE + blocking=true (revisado) → PERMANECE block, sem clamp', () => {
    const outcome = buildBlockOutcome();
    const ruleVersion = buildRuleVersion({
      implementationState: 'ACTIVE',
      blocking: true,
      reviewedBy: 'juridico@exemplo.com',
      reviewedAt: '2026-08-01T00:00:00Z'
    });

    const clamped = applyEnforcementClamp(outcome, ruleVersion);

    assert.strictEqual(clamped.status, 'block');
    assert.strictEqual(clamped.rawStatus, null, 'sem clamp, rawStatus fica null');
    assert.strictEqual(clamped.reasonCode, 'FREIGHT_BELOW_FLOOR', 'reasonCode original preservado (sem clamp)');
    assert.strictEqual(clamped.humanMessage, outcome.humanMessage);
    assert.deepStrictEqual(clamped.result, outcome.result, 'result não é envelopado quando não há clamp');
  });
});

describe('applyEnforcementClamp — pass/warn/not_applicable nunca são clampados', () => {
  for (const status of ['pass', 'warn', 'not_applicable']) {
    it(`${status} permanece ${status} independente do estado/blocking da versão`, () => {
      const outcome = { status, reasonCode: status === 'pass' ? undefined : 'ALGUM_MOTIVO', humanMessage: 'msg', inputs: {}, result: {} };
      const ruleVersion = buildRuleVersion({ implementationState: 'ACTIVE', blocking: true, reviewedBy: 'x', reviewedAt: '2026-08-01T00:00:00Z' });

      const clamped = applyEnforcementClamp(outcome, ruleVersion);

      assert.strictEqual(clamped.status, status);
      assert.strictEqual(clamped.rawStatus, null);
      assert.strictEqual(clamped.reasonCode, outcome.reasonCode);
    });
  }
});

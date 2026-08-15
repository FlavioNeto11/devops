import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

import { RULE_EVALUATORS } from '../../src/lib/transport/rule-evaluators.js';
import { buildRuleVersion } from '../fixtures/regulatory/rule-version-fixtures.js';
import {
  buildEtcFracionadaOperation,
  buildTacLotacaoOperation
} from '../fixtures/regulatory/operation-aggregates.js';

/**
 * Aplicabilidade DECLARADA do piso mínimo de frete (TR-PMF-001..004) — SEM cálculo: o motor de
 * cálculo (`FreightFloorEngine`) é Fase B, bloqueado pela pendência P3 do guia (validação jurídica
 * das tabelas vigentes — `freight_floor_versions`/`freight_floor_coefficients` nascem VAZIAS por
 * desenho, migration 022). O que a Fase A garante é a CLASSIFICAÇÃO de aplicabilidade (lotação vs.
 * fracionada) e o CONTRATO de dados que a Fase B vai preencher (`freightFloorAmount`) — os testes
 * de "contrato futuro" abaixo já ficam prontos para quando o cálculo existir.
 */

function evaluate(code, aggregate, referenceDate = '2026-08-13', floorCalculation = null) {
  const evaluator = RULE_EVALUATORS[code];
  assert.ok(evaluator, `esperava evaluator registrado para ${code}`);
  return evaluator({ operation: aggregate, ruleVersion: buildRuleVersion(), referenceDate, floorCalculation });
}

/** Fixture do recorte de `freight_floor_calculations` que os evaluators recebem via `ctx.floorCalculation` (PR-B1). */
function buildFloorCalculationContext(overrides = {}) {
  return {
    outcome: 'calculated',
    referenceDate: '2026-08-13',
    minimumAmount: 3000,
    floorVersion: {
      normativeReference: 'Resolução ANTT nº 6.084/2026',
      tableCode: 'A',
      reviewStatus: 'pending_review',
      effectiveFrom: '2026-07-17'
    },
    ...overrides
  };
}

describe('freight-floor-applicability — TR-PMF-001 (determinar aplicabilidade do piso)', () => {
  it('lotacao → pass floorApplicable=true', () => {
    const outcome = evaluate('TR-PMF-001', buildTacLotacaoOperation());
    assert.equal(outcome.status, 'pass');
    assert.equal(outcome.result.floorApplicable, true);
  });

  it('fracionada → pass floorApplicable=false', () => {
    const outcome = evaluate('TR-PMF-001', buildEtcFracionadaOperation());
    assert.equal(outcome.status, 'pass');
    assert.equal(outcome.result.floorApplicable, false);
  });

  it('unknown (regime não declarado) → warn CARGO_REGIME_UNKNOWN', () => {
    const outcome = evaluate('TR-PMF-001', buildTacLotacaoOperation({ operation: { cargoRegime: 'unknown' } }));
    assert.equal(outcome.status, 'warn');
    assert.equal(outcome.reasonCode, 'CARGO_REGIME_UNKNOWN');
  });
});

describe('freight-floor-applicability — TR-PMF-002 (oferta) — contrato futuro da Fase B: piso já calculado', () => {
  it('lotacao + piso preenchido + oferta >= piso, SEM ctx.floorCalculation → pass "limpo" (floorVersionRef null)', () => {
    const aggregate = buildTacLotacaoOperation({
      operation: { freightFloorAmount: 3000, freightOfferedAmount: 3500 }
    });
    const outcome = evaluate('TR-PMF-002', aggregate);
    assert.equal(outcome.status, 'pass');
    assert.deepEqual(outcome.result, { freightFloorAmount: 3000, freightOfferedAmount: 3500, floorVersionRef: null });
  });

  it('lotacao + oferta >= piso + cálculo usou tabela REVISADA → pass "limpo" com floorVersionRef preenchido', () => {
    const aggregate = buildTacLotacaoOperation({
      operation: { freightFloorAmount: 3000, freightOfferedAmount: 3500 }
    });
    const floorCalculation = buildFloorCalculationContext({
      floorVersion: {
        normativeReference: 'Resolução ANTT nº 6.084/2026',
        tableCode: 'A',
        reviewStatus: 'reviewed',
        effectiveFrom: '2026-07-17'
      }
    });
    const outcome = evaluate('TR-PMF-002', aggregate, '2026-08-13', floorCalculation);
    assert.equal(outcome.status, 'pass');
    assert.equal(outcome.reasonCode, undefined);
    assert.equal(outcome.result.floorVersionRef.reviewStatus, 'reviewed');
  });

  it('lotacao + oferta >= piso + cálculo usou tabela PENDING_REVIEW → warn FLOOR_TABLE_PENDING_REVIEW (nunca pass "limpo")', () => {
    const aggregate = buildTacLotacaoOperation({
      operation: { freightFloorAmount: 3000, freightOfferedAmount: 3500 }
    });
    const outcome = evaluate('TR-PMF-002', aggregate, '2026-08-13', buildFloorCalculationContext());
    assert.equal(outcome.status, 'warn');
    assert.equal(outcome.reasonCode, 'FLOOR_TABLE_PENDING_REVIEW');
    assert.equal(outcome.result.floorVersionRef.reviewStatus, 'pending_review');
  });

  it('lotacao + piso preenchido + oferta < piso → block (raw) FREIGHT_BELOW_FLOOR, mesmo com tabela pending_review', () => {
    const aggregate = buildTacLotacaoOperation({
      operation: { freightFloorAmount: 3000, freightOfferedAmount: 2500 }
    });
    const outcome = evaluate('TR-PMF-002', aggregate, '2026-08-13', buildFloorCalculationContext());
    assert.equal(outcome.status, 'block');
    assert.equal(outcome.reasonCode, 'FREIGHT_BELOW_FLOOR');
  });

  it('fracionada → not_applicable independente de floor/oferta (piso nunca incide sobre fracionada)', () => {
    const aggregate = buildEtcFracionadaOperation({
      operation: { freightFloorAmount: 3000, freightOfferedAmount: 100 }
    });
    const outcome = evaluate('TR-PMF-002', aggregate);
    assert.equal(outcome.status, 'not_applicable');
    assert.equal(outcome.reasonCode, 'FLOOR_NOT_APPLICABLE');
  });
});

describe('freight-floor-applicability — TR-PMF-003 (contratação) — mesmo contrato futuro, campo contractedAmount', () => {
  it('lotacao + piso preenchido + contratado >= piso → pass', () => {
    const aggregate = buildTacLotacaoOperation({
      operation: { freightFloorAmount: 3000, freightContractedAmount: 3200 }
    });
    const outcome = evaluate('TR-PMF-003', aggregate);
    assert.equal(outcome.status, 'pass');
  });

  it('lotacao + piso preenchido + contratado < piso → block (raw) FREIGHT_BELOW_FLOOR', () => {
    const aggregate = buildTacLotacaoOperation({
      operation: { freightFloorAmount: 3000, freightContractedAmount: 2000 }
    });
    const outcome = evaluate('TR-PMF-003', aggregate);
    assert.equal(outcome.status, 'block');
    assert.equal(outcome.reasonCode, 'FREIGHT_BELOW_FLOOR');
  });

  it('lotacao + contratado >= piso + cálculo usou tabela PENDING_REVIEW → warn FLOOR_TABLE_PENDING_REVIEW', () => {
    const aggregate = buildTacLotacaoOperation({
      operation: { freightFloorAmount: 3000, freightContractedAmount: 3200 }
    });
    const outcome = evaluate('TR-PMF-003', aggregate, '2026-08-13', buildFloorCalculationContext());
    assert.equal(outcome.status, 'warn');
    assert.equal(outcome.reasonCode, 'FLOOR_TABLE_PENDING_REVIEW');
  });

  it('fracionada → not_applicable independente do valor contratado', () => {
    const aggregate = buildEtcFracionadaOperation({
      operation: { freightFloorAmount: 3000, freightContractedAmount: 100 }
    });
    const outcome = evaluate('TR-PMF-003', aggregate);
    assert.equal(outcome.status, 'not_applicable');
    assert.equal(outcome.reasonCode, 'FLOOR_NOT_APPLICABLE');
  });
});

describe('freight-floor-applicability — TR-PMF-004 (usar versão do piso vigente na data)', () => {
  it('lotacao (aplicável), SEM ctx.floorCalculation → warn FLOOR_VERSION_UNAVAILABLE (nenhum cálculo rodou ainda)', () => {
    const outcome = evaluate('TR-PMF-004', buildTacLotacaoOperation());
    assert.equal(outcome.status, 'warn');
    assert.equal(outcome.reasonCode, 'FLOOR_VERSION_UNAVAILABLE');
  });

  it('lotacao + cálculo usou tabela REVISADA vigente na data → pass', () => {
    const floorCalculation = buildFloorCalculationContext({
      floorVersion: {
        normativeReference: 'Resolução ANTT nº 6.084/2026',
        tableCode: 'A',
        reviewStatus: 'reviewed',
        effectiveFrom: '2026-07-17'
      }
    });
    const outcome = evaluate('TR-PMF-004', buildTacLotacaoOperation(), '2026-08-13', floorCalculation);
    assert.equal(outcome.status, 'pass');
    assert.equal(outcome.reasonCode, undefined);
  });

  it('lotacao + cálculo usou tabela PENDING_REVIEW vigente na data → warn FLOOR_TABLE_PENDING_REVIEW', () => {
    const outcome = evaluate('TR-PMF-004', buildTacLotacaoOperation(), '2026-08-13', buildFloorCalculationContext());
    assert.equal(outcome.status, 'warn');
    assert.equal(outcome.reasonCode, 'FLOOR_TABLE_PENDING_REVIEW');
  });

  it('lotacao + cálculo usou tabela cujo effectiveFrom é POSTERIOR à referenceDate → warn FLOOR_VERSION_UNAVAILABLE (time-travel)', () => {
    // referenceDate 2026-07-16 é a véspera da vigência da Res. 6.084/2026 (effectiveFrom 2026-07-17).
    const floorCalculation = buildFloorCalculationContext({ referenceDate: '2026-07-16' });
    const outcome = evaluate('TR-PMF-004', buildTacLotacaoOperation(), '2026-07-16', floorCalculation);
    assert.equal(outcome.status, 'warn');
    assert.equal(outcome.reasonCode, 'FLOOR_VERSION_UNAVAILABLE');
  });

  it('fracionada (não aplicável) → not_applicable FLOOR_NOT_APPLICABLE, sem consultar tabela nenhuma', () => {
    const outcome = evaluate('TR-PMF-004', buildEtcFracionadaOperation());
    assert.equal(outcome.status, 'not_applicable');
    assert.equal(outcome.reasonCode, 'FLOOR_NOT_APPLICABLE');
  });
});

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

function evaluate(code, aggregate, referenceDate = '2026-08-13') {
  const evaluator = RULE_EVALUATORS[code];
  assert.ok(evaluator, `esperava evaluator registrado para ${code}`);
  return evaluator({ operation: aggregate, ruleVersion: buildRuleVersion(), referenceDate });
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
  it('lotacao + piso preenchido + oferta >= piso → pass (fixture pronta para a Fase B)', () => {
    const aggregate = buildTacLotacaoOperation({
      operation: { freightFloorAmount: 3000, freightOfferedAmount: 3500 }
    });
    const outcome = evaluate('TR-PMF-002', aggregate);
    assert.equal(outcome.status, 'pass');
    assert.deepEqual(outcome.result, { freightFloorAmount: 3000, freightOfferedAmount: 3500 });
  });

  it('lotacao + piso preenchido + oferta < piso → block (raw) FREIGHT_BELOW_FLOOR', () => {
    const aggregate = buildTacLotacaoOperation({
      operation: { freightFloorAmount: 3000, freightOfferedAmount: 2500 }
    });
    const outcome = evaluate('TR-PMF-002', aggregate);
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
  it('lotacao (aplicável) → warn FLOOR_VERSION_UNAVAILABLE — freight_floor_versions nasce vazia (pendência P3)', () => {
    const outcome = evaluate('TR-PMF-004', buildTacLotacaoOperation());
    assert.equal(outcome.status, 'warn');
    assert.equal(outcome.reasonCode, 'FLOOR_VERSION_UNAVAILABLE');
  });

  it('fracionada (não aplicável) → not_applicable FLOOR_NOT_APPLICABLE, sem consultar tabela nenhuma', () => {
    const outcome = evaluate('TR-PMF-004', buildEtcFracionadaOperation());
    assert.equal(outcome.status, 'not_applicable');
    assert.equal(outcome.reasonCode, 'FLOOR_NOT_APPLICABLE');
  });
});

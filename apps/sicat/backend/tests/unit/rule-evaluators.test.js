/**
 * Testes dos evaluators puros do motor de compliance (PR-A5).
 *
 * Cada evaluator é exercitado isoladamente com fixtures de `TransportOperationAggregate` — SEM
 * banco, SEM service. O clamp de enforcement (`applyEnforcementClamp`) NÃO é testado aqui — vive
 * em `transport-compliance-clamp.test.js`, puro por si.
 */

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

import {
  RULE_EVALUATORS,
  RULES_WITHOUT_EVALUATOR_YET
} from '../../src/lib/transport/rule-evaluators.js';
import { RULE_CODES } from '../../src/lib/transport/regulatory-types.js';

// ===================================================================================================
// Fixtures
// ===================================================================================================

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
    severity: 'warning',
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

function buildParty(role, partySnapshot = {}) {
  return {
    id: `troppart_${role}`,
    operationId: 'trop_fixture',
    partyId: `trparty_${role}`,
    role,
    partySnapshot,
    createdAt: '2026-08-13T00:00:00Z'
  };
}

function buildCargoItem(overrides = {}) {
  return {
    id: 'tropcargo_fixture',
    operationId: 'trop_fixture',
    cargoType: 'granel',
    cargoCode: null,
    description: 'Soja em grãos',
    weightKg: 30000,
    volumeM3: null,
    declaredValue: null,
    dangerousGoods: false,
    metadata: {},
    createdAt: '2026-08-13T00:00:00Z',
    ...overrides
  };
}

function buildRoute(overrides = {}) {
  return {
    id: 'troproute_fixture',
    operationId: 'trop_fixture',
    originMunicipality: 'São Paulo',
    originUf: 'SP',
    originIbgeCode: null,
    destinationMunicipality: 'Campinas',
    destinationUf: 'SP',
    destinationIbgeCode: null,
    distanceKm: 99.5,
    routeSource: 'manual',
    tollExpected: null,
    waypoints: [],
    createdAt: '2026-08-13T00:00:00Z',
    ...overrides
  };
}

function buildOperation(overrides = {}) {
  return {
    id: 'trop_fixture',
    integrationAccountId: 'acc_fixture',
    sessionContextId: null,
    referenceCode: null,
    status: 'draft',
    cargoRegime: 'lotacao',
    operationClassification: null,
    freightOfferedAmount: null,
    freightContractedAmount: null,
    freightFloorAmount: null,
    tollAmount: null,
    vpoAmount: null,
    otherComponentsAmount: null,
    totalContractValue: null,
    currency: 'BRL',
    paymentMethod: null,
    paymentTermDays: null,
    blockedReasonCode: null,
    cancelledReason: null,
    correlationId: 'corr_fixture',
    commandId: null,
    lastErrorCode: null,
    lastErrorDetail: null,
    version: 1,
    createdAt: '2026-08-13T00:00:00Z',
    updatedAt: '2026-08-13T00:00:00Z',
    ...overrides
  };
}

/** Agregado TAC lotação COMPLETO — carrier + contractor + cargo + rota + frete ofertado. */
function buildCompleteTacAggregate(overrides = {}) {
  return {
    operation: buildOperation({
      cargoRegime: 'lotacao',
      freightOfferedAmount: 3800,
      freightContractedAmount: 3800,
      paymentTermDays: 30,
      ...overrides.operation
    }),
    parties: overrides.parties ?? [
      buildParty('carrier', { rntrcNumber: '12345678', rntrcStatus: 'active' }),
      buildParty('contractor', {})
    ],
    vehicles: overrides.vehicles ?? [],
    cargo: overrides.cargo ?? [buildCargoItem()],
    route: overrides.route === undefined ? buildRoute() : overrides.route
  };
}

function evaluate(code, aggregate, ruleVersionOverrides = {}, referenceDate = '2026-08-13') {
  const evaluator = RULE_EVALUATORS[code];
  assert.ok(evaluator, `esperava evaluator registrado para ${code}`);
  return evaluator({ operation: aggregate, ruleVersion: buildRuleVersion(ruleVersionOverrides), referenceDate });
}

// ===================================================================================================
// Registro — cobertura completa dos 26 codes (evaluator OU pendente, nunca os dois, nunca nenhum)
// ===================================================================================================

describe('rule-evaluators — registro', () => {
  it('RULE_EVALUATORS + RULES_WITHOUT_EVALUATOR_YET cobrem exatamente os 26 codes, sem sobreposição', () => {
    const withEvaluator = new Set(Object.keys(RULE_EVALUATORS));
    const withoutEvaluator = new Set(Object.keys(RULES_WITHOUT_EVALUATOR_YET));

    const overlap = [...withEvaluator].filter((code) => withoutEvaluator.has(code));
    assert.deepStrictEqual(overlap, [], 'nenhum code pode estar nos dois registros');

    const union = new Set([...withEvaluator, ...withoutEvaluator]);
    assert.strictEqual(union.size, RULE_CODES.length, 'união deve cobrir todos os codes do catálogo');
    for (const code of RULE_CODES) {
      assert.ok(union.has(code), `${code} não está em nenhum dos dois registros`);
    }

    assert.strictEqual(withEvaluator.size, 10, 'Fase A tem 10 evaluators implementados');
    assert.strictEqual(withoutEvaluator.size, 16, '16 codes aguardam evaluator de fase futura');
  });

  it('toda entrada de RULES_WITHOUT_EVALUATOR_YET declara targetPhase', () => {
    for (const [code, entry] of Object.entries(RULES_WITHOUT_EVALUATOR_YET)) {
      assert.ok(typeof entry.targetPhase === 'string' && entry.targetPhase.length > 0, `${code} sem targetPhase`);
    }
  });
});

// ===================================================================================================
// TR-RNTRC-001
// ===================================================================================================

describe('TR-RNTRC-001 — RNTRC regular para a operação', () => {
  it('sem carrier vinculado → block CARRIER_RNTRC_MISSING', () => {
    const aggregate = buildCompleteTacAggregate({ parties: [] });
    const outcome = evaluate('TR-RNTRC-001', aggregate);
    assert.strictEqual(outcome.status, 'block');
    assert.strictEqual(outcome.reasonCode, 'CARRIER_RNTRC_MISSING');
  });

  it('carrier sem rntrcNumber → block CARRIER_RNTRC_MISSING', () => {
    const aggregate = buildCompleteTacAggregate({ parties: [buildParty('carrier', { rntrcNumber: null })] });
    const outcome = evaluate('TR-RNTRC-001', aggregate);
    assert.strictEqual(outcome.status, 'block');
    assert.strictEqual(outcome.reasonCode, 'CARRIER_RNTRC_MISSING');
  });

  for (const rntrcStatus of ['suspended', 'cancelled', 'expired']) {
    it(`carrier com rntrcStatus "${rntrcStatus}" → block CARRIER_RNTRC_IRREGULAR`, () => {
      const aggregate = buildCompleteTacAggregate({
        parties: [buildParty('carrier', { rntrcNumber: '123', rntrcStatus })]
      });
      const outcome = evaluate('TR-RNTRC-001', aggregate);
      assert.strictEqual(outcome.status, 'block');
      assert.strictEqual(outcome.reasonCode, 'CARRIER_RNTRC_IRREGULAR');
    });
  }

  it('carrier com rntrcStatus "unknown" → warn RNTRC_NOT_VERIFIED', () => {
    const aggregate = buildCompleteTacAggregate({
      parties: [buildParty('carrier', { rntrcNumber: '123', rntrcStatus: 'unknown' })]
    });
    const outcome = evaluate('TR-RNTRC-001', aggregate);
    assert.strictEqual(outcome.status, 'warn');
    assert.strictEqual(outcome.reasonCode, 'RNTRC_NOT_VERIFIED');
  });

  it('carrier com rntrcStatus "active" → pass', () => {
    const aggregate = buildCompleteTacAggregate();
    const outcome = evaluate('TR-RNTRC-001', aggregate);
    assert.strictEqual(outcome.status, 'pass');
    assert.strictEqual(outcome.reasonCode, undefined);
  });
});

// ===================================================================================================
// TR-PMF-001 — aplicabilidade do piso
// ===================================================================================================

describe('TR-PMF-001 — determinar aplicabilidade do piso', () => {
  it('lotacao → pass floorApplicable=true', () => {
    const outcome = evaluate('TR-PMF-001', buildCompleteTacAggregate({ operation: { cargoRegime: 'lotacao' } }));
    assert.strictEqual(outcome.status, 'pass');
    assert.strictEqual(outcome.result.floorApplicable, true);
  });

  it('fracionada → pass floorApplicable=false', () => {
    const outcome = evaluate('TR-PMF-001', buildCompleteTacAggregate({ operation: { cargoRegime: 'fracionada' } }));
    assert.strictEqual(outcome.status, 'pass');
    assert.strictEqual(outcome.result.floorApplicable, false);
  });

  it('unknown → warn CARGO_REGIME_UNKNOWN', () => {
    const outcome = evaluate('TR-PMF-001', buildCompleteTacAggregate({ operation: { cargoRegime: 'unknown' } }));
    assert.strictEqual(outcome.status, 'warn');
    assert.strictEqual(outcome.reasonCode, 'CARGO_REGIME_UNKNOWN');
  });
});

// ===================================================================================================
// TR-PMF-002 — oferta abaixo do piso
// ===================================================================================================

describe('TR-PMF-002 — não permitir oferta abaixo do piso', () => {
  it('regime fracionada → not_applicable FLOOR_NOT_APPLICABLE', () => {
    const aggregate = buildCompleteTacAggregate({ operation: { cargoRegime: 'fracionada' } });
    const outcome = evaluate('TR-PMF-002', aggregate);
    assert.strictEqual(outcome.status, 'not_applicable');
    assert.strictEqual(outcome.reasonCode, 'FLOOR_NOT_APPLICABLE');
  });

  it('lotacao + piso ainda não calculado → warn FLOOR_NOT_CALCULATED', () => {
    const aggregate = buildCompleteTacAggregate({ operation: { cargoRegime: 'lotacao', freightFloorAmount: null } });
    const outcome = evaluate('TR-PMF-002', aggregate);
    assert.strictEqual(outcome.status, 'warn');
    assert.strictEqual(outcome.reasonCode, 'FLOOR_NOT_CALCULATED');
  });

  it('lotacao + oferta >= piso → pass', () => {
    const aggregate = buildCompleteTacAggregate({
      operation: { cargoRegime: 'lotacao', freightFloorAmount: 3000, freightOfferedAmount: 3500 }
    });
    const outcome = evaluate('TR-PMF-002', aggregate);
    assert.strictEqual(outcome.status, 'pass');
  });

  it('lotacao + oferta < piso → block FREIGHT_BELOW_FLOOR', () => {
    const aggregate = buildCompleteTacAggregate({
      operation: { cargoRegime: 'lotacao', freightFloorAmount: 3000, freightOfferedAmount: 2500 }
    });
    const outcome = evaluate('TR-PMF-002', aggregate);
    assert.strictEqual(outcome.status, 'block');
    assert.strictEqual(outcome.reasonCode, 'FREIGHT_BELOW_FLOOR');
  });
});

// ===================================================================================================
// TR-PMF-003 — contratação abaixo do piso (análogo ao 002, usando contractedAmount)
// ===================================================================================================

describe('TR-PMF-003 — não permitir contratação abaixo do piso', () => {
  it('regime fracionada → not_applicable FLOOR_NOT_APPLICABLE', () => {
    const outcome = evaluate('TR-PMF-003', buildCompleteTacAggregate({ operation: { cargoRegime: 'fracionada' } }));
    assert.strictEqual(outcome.status, 'not_applicable');
    assert.strictEqual(outcome.reasonCode, 'FLOOR_NOT_APPLICABLE');
  });

  it('lotacao + piso ainda não calculado → warn FLOOR_NOT_CALCULATED', () => {
    const outcome = evaluate('TR-PMF-003', buildCompleteTacAggregate({
      operation: { cargoRegime: 'lotacao', freightFloorAmount: null }
    }));
    assert.strictEqual(outcome.status, 'warn');
    assert.strictEqual(outcome.reasonCode, 'FLOOR_NOT_CALCULATED');
  });

  it('lotacao + contratado >= piso → pass', () => {
    const outcome = evaluate('TR-PMF-003', buildCompleteTacAggregate({
      operation: { cargoRegime: 'lotacao', freightFloorAmount: 3000, freightContractedAmount: 3200 }
    }));
    assert.strictEqual(outcome.status, 'pass');
  });

  it('lotacao + contratado < piso → block FREIGHT_BELOW_FLOOR', () => {
    const outcome = evaluate('TR-PMF-003', buildCompleteTacAggregate({
      operation: { cargoRegime: 'lotacao', freightFloorAmount: 3000, freightContractedAmount: 2000 }
    }));
    assert.strictEqual(outcome.status, 'block');
    assert.strictEqual(outcome.reasonCode, 'FREIGHT_BELOW_FLOOR');
  });
});

// ===================================================================================================
// TR-PMF-004 — versão do piso vigente
// ===================================================================================================

describe('TR-PMF-004 — usar versão do piso vigente na data', () => {
  it('lotacao (aplicável) → warn FLOOR_VERSION_UNAVAILABLE', () => {
    const outcome = evaluate('TR-PMF-004', buildCompleteTacAggregate({ operation: { cargoRegime: 'lotacao' } }));
    assert.strictEqual(outcome.status, 'warn');
    assert.strictEqual(outcome.reasonCode, 'FLOOR_VERSION_UNAVAILABLE');
  });

  it('fracionada (não aplicável) → not_applicable FLOOR_NOT_APPLICABLE', () => {
    const outcome = evaluate('TR-PMF-004', buildCompleteTacAggregate({ operation: { cargoRegime: 'fracionada' } }));
    assert.strictEqual(outcome.status, 'not_applicable');
    assert.strictEqual(outcome.reasonCode, 'FLOOR_NOT_APPLICABLE');
  });
});

// ===================================================================================================
// TR-PAY-001 — prazo de pagamento
// ===================================================================================================

describe('TR-PAY-001 — prazo/forma de pagamento conforme norma vigente', () => {
  it('paymentTermDays ausente → warn PAYMENT_TERM_NOT_DECLARED', () => {
    const outcome = evaluate('TR-PAY-001', buildCompleteTacAggregate({ operation: { paymentTermDays: null } }));
    assert.strictEqual(outcome.status, 'warn');
    assert.strictEqual(outcome.reasonCode, 'PAYMENT_TERM_NOT_DECLARED');
  });

  it('paymentTermDays = 30 (limite) → pass', () => {
    const outcome = evaluate('TR-PAY-001', buildCompleteTacAggregate({ operation: { paymentTermDays: 30 } }));
    assert.strictEqual(outcome.status, 'pass');
  });

  it('paymentTermDays = 45 (acima do limite) → block PAYMENT_TERM_EXCEEDS_LIMIT', () => {
    const outcome = evaluate('TR-PAY-001', buildCompleteTacAggregate({ operation: { paymentTermDays: 45 } }));
    assert.strictEqual(outcome.status, 'block');
    assert.strictEqual(outcome.reasonCode, 'PAYMENT_TERM_EXCEEDS_LIMIT');
  });
});

// ===================================================================================================
// TR-VPO-001 — aplicabilidade do VPO
// ===================================================================================================

describe('TR-VPO-001 — determinar aplicabilidade do VPO', () => {
  it('route.tollExpected = true → pass vpoLikelyApplicable=true', () => {
    const outcome = evaluate('TR-VPO-001', buildCompleteTacAggregate({ route: buildRoute({ tollExpected: true }) }));
    assert.strictEqual(outcome.status, 'pass');
    assert.strictEqual(outcome.result.vpoLikelyApplicable, true);
  });

  it('route.tollExpected = false → pass vpoLikelyApplicable=false', () => {
    const outcome = evaluate('TR-VPO-001', buildCompleteTacAggregate({ route: buildRoute({ tollExpected: false }) }));
    assert.strictEqual(outcome.status, 'pass');
    assert.strictEqual(outcome.result.vpoLikelyApplicable, false);
  });

  it('route.tollExpected = null → warn TOLL_EXPECTATION_UNKNOWN', () => {
    const outcome = evaluate('TR-VPO-001', buildCompleteTacAggregate({ route: buildRoute({ tollExpected: null }) }));
    assert.strictEqual(outcome.status, 'warn');
    assert.strictEqual(outcome.reasonCode, 'TOLL_EXPECTATION_UNKNOWN');
  });

  it('sem rota vinculada → warn TOLL_EXPECTATION_UNKNOWN (mesmo tratamento de null)', () => {
    const outcome = evaluate('TR-VPO-001', buildCompleteTacAggregate({ route: null }));
    assert.strictEqual(outcome.status, 'warn');
    assert.strictEqual(outcome.reasonCode, 'TOLL_EXPECTATION_UNKNOWN');
  });
});

// ===================================================================================================
// TR-VPO-003 — valor do VPO separado do frete
// ===================================================================================================

describe('TR-VPO-003 — valor do VPO separado do frete', () => {
  it('vpoAmount ausente → not_applicable VPO_NOT_DECLARED', () => {
    const outcome = evaluate('TR-VPO-003', buildCompleteTacAggregate({ operation: { vpoAmount: null } }));
    assert.strictEqual(outcome.status, 'not_applicable');
    assert.strictEqual(outcome.reasonCode, 'VPO_NOT_DECLARED');
  });

  it('vpoAmount declarado e > 0 → pass', () => {
    const outcome = evaluate('TR-VPO-003', buildCompleteTacAggregate({ operation: { vpoAmount: 250.5 } }));
    assert.strictEqual(outcome.status, 'pass');
  });
});

// ===================================================================================================
// TR-CIOT-004 — dados obrigatórios do CIOT completos
// ===================================================================================================

describe('TR-CIOT-004 — dados obrigatórios do CIOT completos', () => {
  it('agregado TAC lotação COMPLETO (carrier + contractor + cargo + rota + frete ofertado) → pass', () => {
    const outcome = evaluate('TR-CIOT-004', buildCompleteTacAggregate());
    assert.strictEqual(outcome.status, 'pass');
    assert.deepStrictEqual(outcome.result.missing, []);
  });

  it('agregado incompleto (sem contractor, sem cargo) → block CIOT_DATA_INCOMPLETE com missing[]', () => {
    const aggregate = buildCompleteTacAggregate({
      parties: [buildParty('carrier', { rntrcNumber: '123', rntrcStatus: 'active' })],
      cargo: []
    });
    const outcome = evaluate('TR-CIOT-004', aggregate);
    assert.strictEqual(outcome.status, 'block');
    assert.strictEqual(outcome.reasonCode, 'CIOT_DATA_INCOMPLETE');
    assert.deepStrictEqual([...outcome.result.missing].sort(), ['cargo', 'contractor']);
  });

  it('sem NENHUM dado (nem carrier) → block com missing[] completo', () => {
    const aggregate = buildCompleteTacAggregate({ parties: [], cargo: [], route: null, operation: { freightOfferedAmount: null } });
    const outcome = evaluate('TR-CIOT-004', aggregate);
    assert.strictEqual(outcome.status, 'block');
    assert.deepStrictEqual(
      [...outcome.result.missing].sort(),
      ['cargo', 'carrier', 'contractor', 'freightOfferedAmount', 'route'].sort()
    );
  });
});

// ===================================================================================================
// TR-COMP-001 — conjunto mínimo para liberação
// ===================================================================================================

describe('TR-COMP-001 — conjunto mínimo para liberação aprovado', () => {
  it('SEMPRE warn RELEASE_PREREQUISITES_PENDING na Fase A (nunca pass)', () => {
    const outcome = evaluate('TR-COMP-001', buildCompleteTacAggregate());
    assert.strictEqual(outcome.status, 'warn');
    assert.strictEqual(outcome.reasonCode, 'RELEASE_PREREQUISITES_PENDING');
  });
});

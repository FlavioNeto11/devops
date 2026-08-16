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

function buildVehicle(position, overrides = {}) {
  return {
    id: `tropveh_${position}`,
    operationId: 'trop_fixture',
    vehicleId: overrides.vehicleId ?? `trveh_${position}`,
    position,
    vehicleSnapshot: overrides.vehicleSnapshot ?? {},
    createdAt: '2026-08-13T00:00:00Z'
  };
}

/** Fixture de `ctx.carrierRntrcVerification` (PR-C1) — última verificação SUCEDIDA do carrier. */
function buildRntrcVerification(overrides = {}) {
  return {
    strategy: 'open_data',
    resultStatus: 'active',
    dataReferenceDate: '2026-08-01',
    completedAt: '2026-08-13T00:00:00Z',
    ...overrides
  };
}

function evaluate(code, aggregate, ruleVersionOverrides = {}, referenceDate = '2026-08-13', ctxOverrides = {}) {
  const evaluator = RULE_EVALUATORS[code];
  assert.ok(evaluator, `esperava evaluator registrado para ${code}`);
  return evaluator({
    operation: aggregate,
    ruleVersion: buildRuleVersion(ruleVersionOverrides),
    referenceDate,
    ...ctxOverrides
  });
}

// ===================================================================================================
// Registro — cobertura completa dos 27 codes (evaluator OU pendente, nunca os dois, nunca nenhum)
// ===================================================================================================

describe('rule-evaluators — registro', () => {
  it('RULE_EVALUATORS + RULES_WITHOUT_EVALUATOR_YET cobrem exatamente os 27 codes, sem sobreposição', () => {
    const withEvaluator = new Set(Object.keys(RULE_EVALUATORS));
    const withoutEvaluator = new Set(Object.keys(RULES_WITHOUT_EVALUATOR_YET));

    const overlap = [...withEvaluator].filter((code) => withoutEvaluator.has(code));
    assert.deepStrictEqual(overlap, [], 'nenhum code pode estar nos dois registros');

    const union = new Set([...withEvaluator, ...withoutEvaluator]);
    assert.strictEqual(union.size, RULE_CODES.length, 'união deve cobrir todos os codes do catálogo');
    for (const code of RULE_CODES) {
      assert.ok(union.has(code), `${code} não está em nenhum dos dois registros`);
    }

    assert.strictEqual(
      withEvaluator.size,
      26,
      'Fase A (10) + TR-RNTRC-002 (PR-C1) + TR-CIOT-001/002/003 (PR-C2) + TR-VPO-002 (PR-D1) '
        + '+ TR-NFE-001/TR-CTE-001/TR-MDFE-001/TR-MDFE-002/TR-CIOT-005/TR-VPO-004 (PR-E1) '
        + '+ TR-SEG-001/002/003/TR-PGR-001 (PR-F2) + TR-SEG-004 (PR-I2) = 26 evaluators implementados'
    );
    assert.strictEqual(
      withoutEvaluator.size,
      1,
      'só TR-RNTRC-003 continua sem evaluator — aguarda regulamentação ANTT complementar (pendência P2 do guia)'
    );
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

describe('TR-RNTRC-001 — RNTRC regular para a operação (PR-C1: considera a última verificação)', () => {
  it('sem carrier vinculado → block CARRIER_RNTRC_MISSING', () => {
    const aggregate = buildCompleteTacAggregate({ parties: [] });
    const outcome = evaluate('TR-RNTRC-001', aggregate);
    assert.strictEqual(outcome.status, 'block');
    assert.strictEqual(outcome.reasonCode, 'CARRIER_RNTRC_MISSING');
  });

  it('carrier sem rntrcNumber → block CARRIER_RNTRC_MISSING (mesmo com verificação no ctx)', () => {
    const aggregate = buildCompleteTacAggregate({ parties: [buildParty('carrier', { rntrcNumber: null })] });
    const outcome = evaluate('TR-RNTRC-001', aggregate, {}, '2026-08-13', {
      carrierRntrcVerification: buildRntrcVerification()
    });
    assert.strictEqual(outcome.status, 'block');
    assert.strictEqual(outcome.reasonCode, 'CARRIER_RNTRC_MISSING');
  });

  it('rntrcNumber preenchido, mas NUNCA verificado (ctx sem carrierRntrcVerification) → warn RNTRC_NOT_VERIFIED', () => {
    const aggregate = buildCompleteTacAggregate({ parties: [buildParty('carrier', { rntrcNumber: '123' })] });
    const outcome = evaluate('TR-RNTRC-001', aggregate);
    assert.strictEqual(outcome.status, 'warn');
    assert.strictEqual(outcome.reasonCode, 'RNTRC_NOT_VERIFIED');
  });

  for (const resultStatus of ['suspended', 'cancelled', 'expired', 'not_found']) {
    it(`última verificação com resultStatus "${resultStatus}" → block CARRIER_RNTRC_IRREGULAR`, () => {
      const aggregate = buildCompleteTacAggregate({ parties: [buildParty('carrier', { rntrcNumber: '123' })] });
      const outcome = evaluate('TR-RNTRC-001', aggregate, {}, '2026-08-13', {
        carrierRntrcVerification: buildRntrcVerification({ resultStatus })
      });
      assert.strictEqual(outcome.status, 'block');
      assert.strictEqual(outcome.reasonCode, 'CARRIER_RNTRC_IRREGULAR');
    });
  }

  it('última verificação com resultStatus "unknown" (ex.: PENDENTE no dado aberto) → warn RNTRC_NOT_VERIFIED', () => {
    const aggregate = buildCompleteTacAggregate({ parties: [buildParty('carrier', { rntrcNumber: '123' })] });
    const outcome = evaluate('TR-RNTRC-001', aggregate, {}, '2026-08-13', {
      carrierRntrcVerification: buildRntrcVerification({ resultStatus: 'unknown' })
    });
    assert.strictEqual(outcome.status, 'warn');
    assert.strictEqual(outcome.reasonCode, 'RNTRC_NOT_VERIFIED');
  });

  it('verificação active + FRESCA (<=90 dias) via open_data → pass, humanMessage nota "cache informativo"', () => {
    const aggregate = buildCompleteTacAggregate({ parties: [buildParty('carrier', { rntrcNumber: '123' })] });
    const outcome = evaluate('TR-RNTRC-001', aggregate, {}, '2026-08-13', {
      carrierRntrcVerification: buildRntrcVerification({
        strategy: 'open_data',
        resultStatus: 'active',
        dataReferenceDate: '2026-07-20',
        completedAt: '2026-06-01T00:00:00Z' // 73 dias antes de 2026-08-13 — dentro dos 90
      })
    });
    assert.strictEqual(outcome.status, 'pass');
    assert.strictEqual(outcome.reasonCode, undefined);
    assert.match(outcome.humanMessage, /cache informativo/);
    assert.strictEqual(outcome.result.dataReferenceDate, '2026-07-20');
  });

  it('verificação active + FRESCA via manual → pass, humanMessage sem "cache informativo"', () => {
    const aggregate = buildCompleteTacAggregate({ parties: [buildParty('carrier', { rntrcNumber: '123' })] });
    const outcome = evaluate('TR-RNTRC-001', aggregate, {}, '2026-08-13', {
      carrierRntrcVerification: buildRntrcVerification({ strategy: 'manual', resultStatus: 'active', dataReferenceDate: null })
    });
    assert.strictEqual(outcome.status, 'pass');
    assert.match(outcome.humanMessage, /verificado manualmente/);
  });

  it('verificação active, mas STALE (>90 dias) → warn RNTRC_VERIFICATION_STALE', () => {
    const aggregate = buildCompleteTacAggregate({ parties: [buildParty('carrier', { rntrcNumber: '123' })] });
    const outcome = evaluate('TR-RNTRC-001', aggregate, {}, '2026-08-13', {
      carrierRntrcVerification: buildRntrcVerification({
        resultStatus: 'active',
        completedAt: '2026-01-01T00:00:00Z' // muito mais que 90 dias antes de 2026-08-13
      })
    });
    assert.strictEqual(outcome.status, 'warn');
    assert.strictEqual(outcome.reasonCode, 'RNTRC_VERIFICATION_STALE');
    assert.ok(outcome.result.ageDays > 90);
  });

  it('verificação active EXATAMENTE em 90 dias → ainda pass (janela inclusiva)', () => {
    const aggregate = buildCompleteTacAggregate({ parties: [buildParty('carrier', { rntrcNumber: '123' })] });
    const outcome = evaluate('TR-RNTRC-001', aggregate, {}, '2026-08-13', {
      carrierRntrcVerification: buildRntrcVerification({ resultStatus: 'active', completedAt: '2026-05-15T00:00:00Z' })
    });
    assert.strictEqual(outcome.result.ageDays, 90);
    assert.strictEqual(outcome.status, 'pass');
  });
});

// ===================================================================================================
// TR-RNTRC-002 — veículo de tração vinculado ao carrier (PR-C1, GATE_PRE_BOARDING)
// ===================================================================================================

describe('TR-RNTRC-002 — veículo de tração vinculado ao transportador', () => {
  it('sem veículo de tração → block VEHICLE_MISSING', () => {
    const aggregate = buildCompleteTacAggregate({ vehicles: [] });
    const outcome = evaluate('TR-RNTRC-002', aggregate);
    assert.strictEqual(outcome.status, 'block');
    assert.strictEqual(outcome.reasonCode, 'VEHICLE_MISSING');
  });

  it('veículo de tração presente, mas SEM vínculo com o carrier no cadastro-base → warn VEHICLE_NOT_LINKED_TO_CARRIER', () => {
    const aggregate = buildCompleteTacAggregate({ vehicles: [buildVehicle('traction')] });
    const outcome = evaluate('TR-RNTRC-002', aggregate, {}, '2026-08-13', { carrierTractionVehicleLinkType: null });
    assert.strictEqual(outcome.status, 'warn');
    assert.strictEqual(outcome.reasonCode, 'VEHICLE_NOT_LINKED_TO_CARRIER');
  });

  for (const linkType of ['owned', 'leased', 'aggregated', 'rntrc_fleet']) {
    it(`veículo de tração vinculado (${linkType}) → pass`, () => {
      const aggregate = buildCompleteTacAggregate({ vehicles: [buildVehicle('traction')] });
      const outcome = evaluate('TR-RNTRC-002', aggregate, {}, '2026-08-13', { carrierTractionVehicleLinkType: linkType });
      assert.strictEqual(outcome.status, 'pass');
      assert.strictEqual(outcome.result.linkType, linkType);
    });
  }

  it('veículos towed presentes mas SEM veículo de tração → block VEHICLE_MISSING (towed não substitui tração)', () => {
    const aggregate = buildCompleteTacAggregate({ vehicles: [buildVehicle('towed_1')] });
    const outcome = evaluate('TR-RNTRC-002', aggregate, {}, '2026-08-13', { carrierTractionVehicleLinkType: 'owned' });
    assert.strictEqual(outcome.status, 'block');
    assert.strictEqual(outcome.reasonCode, 'VEHICLE_MISSING');
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
// TR-VPO-001 — aplicabilidade do VPO (PR-D1: usa ctx.vpoAllocation, persistida pelo
// VpoApplicabilityEngine — não mais só route.tollExpected isolado)
// ===================================================================================================

function buildVpoAllocationFixture(overrides = {}) {
  return {
    status: 'applicable',
    applicable: true,
    applicabilityReasonCode: 'VPO_REQUIRED_TOLL_ROUTE',
    amount: null,
    providerId: null,
    evidenceSource: null,
    ...overrides
  };
}

describe('TR-VPO-001 — determinar aplicabilidade do VPO', () => {
  it('sem vpoAllocation (nunca avaliado) → warn VPO_APPLICABILITY_NOT_EVALUATED', () => {
    const outcome = evaluate('TR-VPO-001', buildCompleteTacAggregate(), {}, '2026-08-13', { vpoAllocation: null });
    assert.strictEqual(outcome.status, 'warn');
    assert.strictEqual(outcome.reasonCode, 'VPO_APPLICABILITY_NOT_EVALUATED');
  });

  it('allocation not_applicable com reason → pass (justificativa evidenciada)', () => {
    const allocation = buildVpoAllocationFixture({ status: 'not_applicable', applicable: false, applicabilityReasonCode: 'VPO_NO_TOLL_ON_ROUTE' });
    const outcome = evaluate('TR-VPO-001', buildCompleteTacAggregate(), {}, '2026-08-13', { vpoAllocation: allocation });
    assert.strictEqual(outcome.status, 'pass');
    assert.strictEqual(outcome.result.vpoRequired, false);
    assert.strictEqual(outcome.result.reasonCode, 'VPO_NO_TOLL_ON_ROUTE');
  });

  it('allocation applicable → pass vpoRequired=true', () => {
    const allocation = buildVpoAllocationFixture({ status: 'applicable' });
    const outcome = evaluate('TR-VPO-001', buildCompleteTacAggregate(), {}, '2026-08-13', { vpoAllocation: allocation });
    assert.strictEqual(outcome.status, 'pass');
    assert.strictEqual(outcome.result.vpoRequired, true);
  });

  it('allocation acquired TAMBÉM conta como aplicável → pass vpoRequired=true', () => {
    const allocation = buildVpoAllocationFixture({ status: 'acquired', amount: 350.5, providerId: 'vpoprov_x' });
    const outcome = evaluate('TR-VPO-001', buildCompleteTacAggregate(), {}, '2026-08-13', { vpoAllocation: allocation });
    assert.strictEqual(outcome.status, 'pass');
    assert.strictEqual(outcome.result.vpoRequired, true);
  });

  it('allocation pending (applicable=null — exceção regulatória) → warn com o reasonCode do engine', () => {
    const allocation = buildVpoAllocationFixture({ status: 'pending', applicable: null, applicabilityReasonCode: 'VPO_FRACTIONAL_CARGO_REVIEW' });
    const outcome = evaluate('TR-VPO-001', buildCompleteTacAggregate(), {}, '2026-08-13', { vpoAllocation: allocation });
    assert.strictEqual(outcome.status, 'warn');
    assert.strictEqual(outcome.reasonCode, 'VPO_FRACTIONAL_CARGO_REVIEW');
  });
});

// ===================================================================================================
// TR-VPO-002 — VPO antecipado antes do embarque (PR-D1, NOVO evaluator)
// ===================================================================================================

describe('TR-VPO-002 — VPO antecipado antes do embarque quando aplicável', () => {
  it('sem vpoAllocation → warn VPO_APPLICABILITY_NOT_EVALUATED', () => {
    const outcome = evaluate('TR-VPO-002', buildCompleteTacAggregate(), {}, '2026-08-13', { vpoAllocation: null });
    assert.strictEqual(outcome.status, 'warn');
    assert.strictEqual(outcome.reasonCode, 'VPO_APPLICABILITY_NOT_EVALUATED');
  });

  it('allocation not_applicable → not_applicable com o reason evidenciado', () => {
    const allocation = buildVpoAllocationFixture({ status: 'not_applicable', applicable: false, applicabilityReasonCode: 'VPO_NO_TOLL_ON_ROUTE' });
    const outcome = evaluate('TR-VPO-002', buildCompleteTacAggregate(), {}, '2026-08-13', { vpoAllocation: allocation });
    assert.strictEqual(outcome.status, 'not_applicable');
    assert.strictEqual(outcome.reasonCode, 'VPO_NO_TOLL_ON_ROUTE');
  });

  it('applicable e status acquired (amount>0 + provider) → pass', () => {
    const allocation = buildVpoAllocationFixture({ status: 'acquired', amount: 350.5, providerId: 'vpoprov_x', evidenceSource: 'provider' });
    const outcome = evaluate('TR-VPO-002', buildCompleteTacAggregate(), {}, '2026-08-13', { vpoAllocation: allocation });
    assert.strictEqual(outcome.status, 'pass');
  });

  it('applicable e status acquired (amount>0 + evidência manual, sem providerId) → pass', () => {
    const allocation = buildVpoAllocationFixture({ status: 'acquired', amount: 350.5, providerId: null, evidenceSource: 'manual' });
    const outcome = evaluate('TR-VPO-002', buildCompleteTacAggregate(), {}, '2026-08-13', { vpoAllocation: allocation });
    assert.strictEqual(outcome.status, 'pass');
  });

  it('applicable SEM acquired → block bruto VPO_NOT_ACQUIRED', () => {
    const allocation = buildVpoAllocationFixture({ status: 'applicable' });
    const outcome = evaluate('TR-VPO-002', buildCompleteTacAggregate(), {}, '2026-08-13', { vpoAllocation: allocation });
    assert.strictEqual(outcome.status, 'block');
    assert.strictEqual(outcome.reasonCode, 'VPO_NOT_ACQUIRED');
  });

  it('em trânsito (acquisition_requested) → block bruto VPO_NOT_ACQUIRED (ainda não confirmado)', () => {
    const allocation = buildVpoAllocationFixture({ status: 'acquisition_requested' });
    const outcome = evaluate('TR-VPO-002', buildCompleteTacAggregate(), {}, '2026-08-13', { vpoAllocation: allocation });
    assert.strictEqual(outcome.status, 'block');
    assert.strictEqual(outcome.reasonCode, 'VPO_NOT_ACQUIRED');
  });
});

// ===================================================================================================
// TR-VPO-003 — valor do VPO separado do frete (PR-D1: evoluído para conferir se o valor bate com a
// aquisição rastreada, além da separação estrutural do campo decomposto)
// ===================================================================================================

describe('TR-VPO-003 — valor do VPO separado do frete', () => {
  it('vpoAmount ausente → not_applicable VPO_NOT_DECLARED', () => {
    const outcome = evaluate('TR-VPO-003', buildCompleteTacAggregate({ operation: { vpoAmount: null } }));
    assert.strictEqual(outcome.status, 'not_applicable');
    assert.strictEqual(outcome.reasonCode, 'VPO_NOT_DECLARED');
  });

  it('vpoAmount preenchido e allocation acquired com amount IGUAL → pass (separação comprovada)', () => {
    const allocation = buildVpoAllocationFixture({ status: 'acquired', amount: 250.5, providerId: 'vpoprov_x' });
    const outcome = evaluate('TR-VPO-003', buildCompleteTacAggregate({ operation: { vpoAmount: 250.5 } }), {}, '2026-08-13', { vpoAllocation: allocation });
    assert.strictEqual(outcome.status, 'pass');
  });

  it('vpoAmount preenchido e allocation acquired com amount DIVERGENTE → warn VPO_AMOUNT_MISMATCH', () => {
    const allocation = buildVpoAllocationFixture({ status: 'acquired', amount: 300, providerId: 'vpoprov_x' });
    const outcome = evaluate('TR-VPO-003', buildCompleteTacAggregate({ operation: { vpoAmount: 250.5 } }), {}, '2026-08-13', { vpoAllocation: allocation });
    assert.strictEqual(outcome.status, 'warn');
    assert.strictEqual(outcome.reasonCode, 'VPO_AMOUNT_MISMATCH');
  });

  it('vpoAmount preenchido SEM aquisição confirmada na alocação → warn VPO_AMOUNT_MISMATCH', () => {
    const outcome = evaluate('TR-VPO-003', buildCompleteTacAggregate({ operation: { vpoAmount: 250.5 } }), {}, '2026-08-13', { vpoAllocation: null });
    assert.strictEqual(outcome.status, 'warn');
    assert.strictEqual(outcome.reasonCode, 'VPO_AMOUNT_MISMATCH');
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

// ===================================================================================================
// TR-SEG-001/002/003 + TR-PGR-001 — seguros obrigatórios do transportador e PGR (PR-F2, Lei
// 14.599/2023, NOVOS evaluators). `ctx.carrierInsurance` é montado por
// `transport-compliance-service.ts` — aqui construído diretamente como fixture.
// ===================================================================================================

/** Fixture de `ctx.carrierInsurance.policies[type]` — apólice APLICÁVEL de um tipo. */
function buildInsurancePolicyFixture(overrides = {}) {
  return {
    policyNumber: 'RCTRC-2026-000123',
    validFrom: '2026-01-01',
    validUntil: '2026-12-31',
    ...overrides
  };
}

/** Fixture de `ctx.carrierInsurance.pgr` — PGR APLICÁVEL. */
function buildPgrFixture(overrides = {}) {
  return {
    planReference: 'PGR-2026-001',
    validFrom: '2026-01-01',
    validUntil: '2026-12-31',
    ...overrides
  };
}

const REFERENCE_DATE = '2026-08-13';

describe('TR-SEG-001 — RCTR-C vigente', () => {
  it('sem carrierInsurance (ctx nunca montado) → block bruto INSURANCE_RCTR_C_MISSING_OR_EXPIRED', () => {
    const outcome = evaluate('TR-SEG-001', buildCompleteTacAggregate(), {}, REFERENCE_DATE, { carrierInsurance: null });
    assert.strictEqual(outcome.status, 'block');
    assert.strictEqual(outcome.reasonCode, 'INSURANCE_RCTR_C_MISSING_OR_EXPIRED');
  });

  it('policies.RCTR_C ausente (null) → block bruto INSURANCE_RCTR_C_MISSING_OR_EXPIRED', () => {
    const carrierInsurance = { policies: { RCTR_C: null }, pgr: null };
    const outcome = evaluate('TR-SEG-001', buildCompleteTacAggregate(), {}, REFERENCE_DATE, { carrierInsurance });
    assert.strictEqual(outcome.status, 'block');
    assert.strictEqual(outcome.reasonCode, 'INSURANCE_RCTR_C_MISSING_OR_EXPIRED');
  });

  it('apólice vigente e folgada (não perto do vencimento) → pass', () => {
    const carrierInsurance = { policies: { RCTR_C: buildInsurancePolicyFixture({ validUntil: '2026-12-31' }) }, pgr: null };
    const outcome = evaluate('TR-SEG-001', buildCompleteTacAggregate(), {}, REFERENCE_DATE, { carrierInsurance });
    assert.strictEqual(outcome.status, 'pass');
    assert.strictEqual(outcome.result.policyNumber, 'RCTRC-2026-000123');
  });

  it('apólice vigente mas vence em <= 15 dias → warn INSURANCE_EXPIRING_SOON', () => {
    const carrierInsurance = { policies: { RCTR_C: buildInsurancePolicyFixture({ validFrom: '2026-01-01', validUntil: '2026-08-20' }) }, pgr: null };
    const outcome = evaluate('TR-SEG-001', buildCompleteTacAggregate(), {}, REFERENCE_DATE, { carrierInsurance });
    assert.strictEqual(outcome.status, 'warn');
    assert.strictEqual(outcome.reasonCode, 'INSURANCE_EXPIRING_SOON');
    assert.strictEqual(outcome.result.daysToExpiry, 7);
  });

  it('apólice VENCIDA na data de referência (válida hoje, mas não na referenceDate) → block bruto', () => {
    const carrierInsurance = { policies: { RCTR_C: buildInsurancePolicyFixture({ validFrom: '2026-01-01', validUntil: '2026-08-01' }) }, pgr: null };
    const outcome = evaluate('TR-SEG-001', buildCompleteTacAggregate(), {}, REFERENCE_DATE, { carrierInsurance });
    assert.strictEqual(outcome.status, 'block');
    assert.strictEqual(outcome.reasonCode, 'INSURANCE_RCTR_C_MISSING_OR_EXPIRED');
  });

  it('apólice que só entra em vigor DEPOIS da referenceDate (ainda não vigente) → block bruto', () => {
    const carrierInsurance = { policies: { RCTR_C: buildInsurancePolicyFixture({ validFrom: '2026-09-01', validUntil: '2027-08-31' }) }, pgr: null };
    const outcome = evaluate('TR-SEG-001', buildCompleteTacAggregate(), {}, REFERENCE_DATE, { carrierInsurance });
    assert.strictEqual(outcome.status, 'block');
    assert.strictEqual(outcome.reasonCode, 'INSURANCE_RCTR_C_MISSING_OR_EXPIRED');
  });
});

describe('TR-SEG-002 — RC-DC vigente (mesmo molde de TR-SEG-001)', () => {
  it('apólice RC_DC ausente → block bruto INSURANCE_RC_DC_MISSING_OR_EXPIRED', () => {
    const carrierInsurance = { policies: { RC_DC: null }, pgr: null };
    const outcome = evaluate('TR-SEG-002', buildCompleteTacAggregate(), {}, REFERENCE_DATE, { carrierInsurance });
    assert.strictEqual(outcome.status, 'block');
    assert.strictEqual(outcome.reasonCode, 'INSURANCE_RC_DC_MISSING_OR_EXPIRED');
  });

  it('apólice RC_DC vigente e folgada → pass', () => {
    const carrierInsurance = { policies: { RC_DC: buildInsurancePolicyFixture({ policyNumber: 'RCDC-2026-000456' }) }, pgr: null };
    const outcome = evaluate('TR-SEG-002', buildCompleteTacAggregate(), {}, REFERENCE_DATE, { carrierInsurance });
    assert.strictEqual(outcome.status, 'pass');
  });
});

describe('TR-SEG-003 — RC-V vigente (aplicável só quando a operação tem veículo)', () => {
  it('operação SEM veículo vinculado → not_applicable INSURANCE_RC_V_NOT_APPLICABLE_NO_VEHICLE', () => {
    const aggregate = buildCompleteTacAggregate({ vehicles: [] });
    const carrierInsurance = { policies: { RC_V: buildInsurancePolicyFixture({ policyNumber: 'RCV-2026-000789' }) }, pgr: null };
    const outcome = evaluate('TR-SEG-003', aggregate, {}, REFERENCE_DATE, { carrierInsurance });
    assert.strictEqual(outcome.status, 'not_applicable');
    assert.strictEqual(outcome.reasonCode, 'INSURANCE_RC_V_NOT_APPLICABLE_NO_VEHICLE');
  });

  it('operação COM veículo e apólice RC_V vigente → pass', () => {
    const aggregate = buildCompleteTacAggregate({ vehicles: [buildVehicle('traction')] });
    const carrierInsurance = { policies: { RC_V: buildInsurancePolicyFixture({ policyNumber: 'RCV-2026-000789' }) }, pgr: null };
    const outcome = evaluate('TR-SEG-003', aggregate, {}, REFERENCE_DATE, { carrierInsurance });
    assert.strictEqual(outcome.status, 'pass');
  });

  it('operação COM veículo e SEM apólice RC_V → block bruto INSURANCE_RC_V_MISSING_OR_EXPIRED', () => {
    const aggregate = buildCompleteTacAggregate({ vehicles: [buildVehicle('traction')] });
    const carrierInsurance = { policies: { RC_V: null }, pgr: null };
    const outcome = evaluate('TR-SEG-003', aggregate, {}, REFERENCE_DATE, { carrierInsurance });
    assert.strictEqual(outcome.status, 'block');
    assert.strictEqual(outcome.reasonCode, 'INSURANCE_RC_V_MISSING_OR_EXPIRED');
  });
});

// ===================================================================================================
// TR-SEG-004 — limite de garantia por viagem (PR-I2, REQ-SICAT-0028 rev.2). Confronta a soma dos
// declaredValue da carga com o perTripLimitAmount das apólices VIGENTES na referenceDate. Ausência
// de apólice vigente é not_applicable — TR-SEG-001/002/003 já cobrem ausência/vencimento.
// ===================================================================================================

describe('TR-SEG-004 — limite de garantia por viagem respeitado', () => {
  /** Agregado com carga de valor declarado conhecido (default: caso de ouro R$ 25.000,00). */
  function buildAggregateWithCargo(declaredValues = [25000]) {
    return buildCompleteTacAggregate({
      cargo: declaredValues.map((declaredValue, index) => buildCargoItem({
        id: `tropcargo_seg004_${index}`,
        declaredValue
      }))
    });
  }

  /** carrierInsurance com UMA apólice RCTR-C vigente e limite configurável. */
  function buildInsuranceWithLimit(perTripLimitAmount) {
    return {
      policies: { RCTR_C: buildInsurancePolicyFixture({ perTripLimitAmount }) },
      pgr: null
    };
  }

  it('sem carrierInsurance (ctx nunca montado) → not_applicable PER_TRIP_LIMIT_NO_APPLICABLE_POLICY', () => {
    const outcome = evaluate('TR-SEG-004', buildAggregateWithCargo(), {}, REFERENCE_DATE, { carrierInsurance: null });
    assert.strictEqual(outcome.status, 'not_applicable');
    assert.strictEqual(outcome.reasonCode, 'PER_TRIP_LIMIT_NO_APPLICABLE_POLICY');
  });

  it('nenhuma apólice vigente na referenceDate (só vencida) → not_applicable (TR-SEG-001/002 cobrem ausência)', () => {
    const carrierInsurance = {
      policies: { RCTR_C: buildInsurancePolicyFixture({ validFrom: '2020-01-01', validUntil: '2020-12-31', perTripLimitAmount: 25000 }) },
      pgr: null
    };
    const outcome = evaluate('TR-SEG-004', buildAggregateWithCargo(), {}, REFERENCE_DATE, { carrierInsurance });
    assert.strictEqual(outcome.status, 'not_applicable');
    assert.strictEqual(outcome.reasonCode, 'PER_TRIP_LIMIT_NO_APPLICABLE_POLICY');
  });

  it('apólice vigente SEM limite configurado → warn PER_TRIP_LIMIT_NOT_CONFIGURED', () => {
    const outcome = evaluate('TR-SEG-004', buildAggregateWithCargo(), {}, REFERENCE_DATE, {
      carrierInsurance: buildInsuranceWithLimit(null)
    });
    assert.strictEqual(outcome.status, 'warn');
    assert.strictEqual(outcome.reasonCode, 'PER_TRIP_LIMIT_NOT_CONFIGURED');
  });

  it('item de carga sem declaredValue → warn CARGO_DECLARED_VALUE_MISSING (soma seria subestimada)', () => {
    const aggregate = buildCompleteTacAggregate({
      cargo: [
        buildCargoItem({ id: 'tropcargo_a', declaredValue: 10000 }),
        buildCargoItem({ id: 'tropcargo_b', declaredValue: null })
      ]
    });
    const outcome = evaluate('TR-SEG-004', aggregate, {}, REFERENCE_DATE, {
      carrierInsurance: buildInsuranceWithLimit(25000)
    });
    assert.strictEqual(outcome.status, 'warn');
    assert.strictEqual(outcome.reasonCode, 'CARGO_DECLARED_VALUE_MISSING');
  });

  it('operação SEM carga registrada → warn CARGO_DECLARED_VALUE_MISSING', () => {
    const aggregate = buildCompleteTacAggregate({ cargo: [] });
    const outcome = evaluate('TR-SEG-004', aggregate, {}, REFERENCE_DATE, {
      carrierInsurance: buildInsuranceWithLimit(25000)
    });
    assert.strictEqual(outcome.status, 'warn');
    assert.strictEqual(outcome.reasonCode, 'CARGO_DECLARED_VALUE_MISSING');
  });

  it('Σ declaredValue > limite → block bruto INSURANCE_PER_TRIP_LIMIT_EXCEEDED com os dois valores na evidência', () => {
    // Caso de ouro invertido: limite R$ 25.000,00, carga somando R$ 30.000,00 (20k + 10k).
    const aggregate = buildAggregateWithCargo([20000, 10000]);
    const outcome = evaluate('TR-SEG-004', aggregate, {}, REFERENCE_DATE, {
      carrierInsurance: buildInsuranceWithLimit(25000)
    });
    assert.strictEqual(outcome.status, 'block');
    assert.strictEqual(outcome.reasonCode, 'INSURANCE_PER_TRIP_LIMIT_EXCEEDED');
    assert.strictEqual(outcome.result.declaredValueTotal, 30000, 'evidência precisa trazer a soma da carga');
    assert.strictEqual(outcome.result.perTripLimitAmount, 25000, 'evidência precisa trazer o limite confrontado');
  });

  it('Σ dentro do limite (igual ao teto, caso de ouro R$ 25.000,00) → pass', () => {
    const outcome = evaluate('TR-SEG-004', buildAggregateWithCargo([25000]), {}, REFERENCE_DATE, {
      carrierInsurance: buildInsuranceWithLimit(25000)
    });
    assert.strictEqual(outcome.status, 'pass');
    assert.strictEqual(outcome.result.declaredValueTotal, 25000);
  });

  it('o limite que VINCULA é o MENOR entre as apólices vigentes configuradas', () => {
    const carrierInsurance = {
      policies: {
        RCTR_C: buildInsurancePolicyFixture({ perTripLimitAmount: 50000 }),
        RC_DC: buildInsurancePolicyFixture({ policyNumber: 'RCDC-2026-000456', perTripLimitAmount: 25000 })
      },
      pgr: null
    };
    const outcome = evaluate('TR-SEG-004', buildAggregateWithCargo([30000]), {}, REFERENCE_DATE, { carrierInsurance });
    assert.strictEqual(outcome.status, 'block', 'R$ 30.000 folga na RCTR-C mas estoura a RC-DC — a menor vincula');
    assert.strictEqual(outcome.result.perTripLimitAmount, 25000);
    assert.strictEqual(outcome.result.bindingPolicyType, 'RC_DC');
  });

  it('apólice vigente COM limite + outra vigente SEM limite → a configurada vincula (sem warn)', () => {
    const carrierInsurance = {
      policies: {
        RCTR_C: buildInsurancePolicyFixture({ perTripLimitAmount: null }),
        RC_DC: buildInsurancePolicyFixture({ policyNumber: 'RCDC-2026-000456', perTripLimitAmount: 25000 })
      },
      pgr: null
    };
    const outcome = evaluate('TR-SEG-004', buildAggregateWithCargo([20000]), {}, REFERENCE_DATE, { carrierInsurance });
    assert.strictEqual(outcome.status, 'pass');
  });
});

describe('TR-PGR-001 — PGR vigente quando requerido (vínculo legal com RCTR-C/RC-DC)', () => {
  it('carrier SEM RCTR-C/RC-DC registrada → not_applicable PGR_NOT_APPLICABLE_NO_LINKED_POLICY', () => {
    const carrierInsurance = { policies: { RCTR_C: null, RC_DC: null, RC_V: buildInsurancePolicyFixture() }, pgr: null };
    const outcome = evaluate('TR-PGR-001', buildCompleteTacAggregate(), {}, REFERENCE_DATE, { carrierInsurance });
    assert.strictEqual(outcome.status, 'not_applicable');
    assert.strictEqual(outcome.reasonCode, 'PGR_NOT_APPLICABLE_NO_LINKED_POLICY');
  });

  it('RC-V isolado (sem RCTR-C/RC-DC) NÃO aciona a exigência → not_applicable', () => {
    const carrierInsurance = { policies: { RC_V: buildInsurancePolicyFixture() }, pgr: null };
    const outcome = evaluate('TR-PGR-001', buildCompleteTacAggregate(), {}, REFERENCE_DATE, { carrierInsurance });
    assert.strictEqual(outcome.status, 'not_applicable');
  });

  it('RCTR-C registrada (mesmo vencida) + SEM PGR → block bruto PGR_MISSING_OR_EXPIRED', () => {
    const carrierInsurance = {
      policies: { RCTR_C: buildInsurancePolicyFixture({ validFrom: '2020-01-01', validUntil: '2020-12-31' }) },
      pgr: null
    };
    const outcome = evaluate('TR-PGR-001', buildCompleteTacAggregate(), {}, REFERENCE_DATE, { carrierInsurance });
    assert.strictEqual(outcome.status, 'block');
    assert.strictEqual(outcome.reasonCode, 'PGR_MISSING_OR_EXPIRED');
  });

  it('RC-DC registrada + PGR vigente na referenceDate → pass', () => {
    const carrierInsurance = {
      policies: { RC_DC: buildInsurancePolicyFixture({ policyNumber: 'RCDC-2026-000456' }) },
      pgr: buildPgrFixture()
    };
    const outcome = evaluate('TR-PGR-001', buildCompleteTacAggregate(), {}, REFERENCE_DATE, { carrierInsurance });
    assert.strictEqual(outcome.status, 'pass');
    assert.strictEqual(outcome.result.planReference, 'PGR-2026-001');
  });

  it('PGR com validUntil nulo (vigência indeterminada) e validFrom no passado → pass', () => {
    const carrierInsurance = {
      policies: { RCTR_C: buildInsurancePolicyFixture() },
      pgr: buildPgrFixture({ validUntil: null })
    };
    const outcome = evaluate('TR-PGR-001', buildCompleteTacAggregate(), {}, REFERENCE_DATE, { carrierInsurance });
    assert.strictEqual(outcome.status, 'pass');
  });

  it('PGR JÁ VENCIDO na referenceDate → block bruto PGR_MISSING_OR_EXPIRED', () => {
    const carrierInsurance = {
      policies: { RCTR_C: buildInsurancePolicyFixture() },
      pgr: buildPgrFixture({ validFrom: '2020-01-01', validUntil: '2020-12-31' })
    };
    const outcome = evaluate('TR-PGR-001', buildCompleteTacAggregate(), {}, REFERENCE_DATE, { carrierInsurance });
    assert.strictEqual(outcome.status, 'block');
    assert.strictEqual(outcome.reasonCode, 'PGR_MISSING_OR_EXPIRED');
  });
});

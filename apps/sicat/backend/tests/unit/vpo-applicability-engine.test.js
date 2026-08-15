/**
 * `VpoApplicabilityEngine` (PR-D1) — matriz de aplicabilidade, PURO (sem banco/service).
 */

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

import { determineVpoApplicability } from '../../src/lib/transport/vpo-applicability-engine.js';

const FIXTURE_TIMESTAMP = '2026-08-13T00:00:00Z';

function buildParty(role, overrides = {}) {
  return {
    id: `troppart_${role}_${Math.random().toString(36).slice(2, 8)}`,
    operationId: 'trop_fixture',
    partyId: `trparty_${role}`,
    role,
    partySnapshot: {},
    createdAt: FIXTURE_TIMESTAMP,
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
    destinationMunicipality: 'Belo Horizonte',
    destinationUf: 'MG',
    destinationIbgeCode: null,
    distanceKm: 586.2,
    routeSource: 'manual',
    tollExpected: null,
    waypoints: [],
    createdAt: FIXTURE_TIMESTAMP,
    ...overrides
  };
}

function buildOperationHeader(overrides = {}) {
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
    createdAt: FIXTURE_TIMESTAMP,
    updatedAt: FIXTURE_TIMESTAMP,
    ...overrides
  };
}

function buildAggregate({ tollExpected, cargoRegime = 'lotacao', shipperCount = 1, route: routeOverride } = {}) {
  const shippers = Array.from({ length: shipperCount }, (_, index) => buildParty('shipper', { partyId: `trparty_shipper_${index}` }));
  return {
    operation: buildOperationHeader({ cargoRegime }),
    parties: [
      buildParty('carrier'),
      buildParty('contractor'),
      ...shippers
    ],
    vehicles: [],
    cargo: [],
    route: routeOverride === undefined ? buildRoute({ tollExpected }) : routeOverride
  };
}

describe('VpoApplicabilityEngine — determineVpoApplicability', () => {
  it('route.tollExpected=false → not_applicable VPO_NO_TOLL_ON_ROUTE, INDEPENDENTE do regime', () => {
    const result = determineVpoApplicability({ operation: buildAggregate({ tollExpected: false, cargoRegime: 'lotacao' }) });
    assert.strictEqual(result.applicable, false);
    assert.strictEqual(result.reasonCode, 'VPO_NO_TOLL_ON_ROUTE');
    assert.ok(result.legalBasis.length > 0);
  });

  it('tollExpected=false PREVALECE mesmo com carga fracionada (sinal mais forte)', () => {
    const result = determineVpoApplicability({ operation: buildAggregate({ tollExpected: false, cargoRegime: 'fracionada' }) });
    assert.strictEqual(result.applicable, false);
    assert.strictEqual(result.reasonCode, 'VPO_NO_TOLL_ON_ROUTE');
  });

  it('tollExpected=true + lotacao → applicable VPO_REQUIRED_TOLL_ROUTE', () => {
    const result = determineVpoApplicability({ operation: buildAggregate({ tollExpected: true, cargoRegime: 'lotacao' }) });
    assert.strictEqual(result.applicable, true);
    assert.strictEqual(result.reasonCode, 'VPO_REQUIRED_TOLL_ROUTE');
  });

  it('carga fracionada (mesmo com pedágio esperado) → applicable=null VPO_FRACTIONAL_CARGO_REVIEW', () => {
    const result = determineVpoApplicability({ operation: buildAggregate({ tollExpected: true, cargoRegime: 'fracionada' }) });
    assert.strictEqual(result.applicable, null);
    assert.strictEqual(result.reasonCode, 'VPO_FRACTIONAL_CARGO_REVIEW');
  });

  it('múltiplos embarcadores (>1 shipper), mesmo lotação → applicable=null VPO_FRACTIONAL_CARGO_REVIEW', () => {
    const result = determineVpoApplicability({ operation: buildAggregate({ tollExpected: true, cargoRegime: 'lotacao', shipperCount: 2 }) });
    assert.strictEqual(result.applicable, null);
    assert.strictEqual(result.reasonCode, 'VPO_FRACTIONAL_CARGO_REVIEW');
    assert.strictEqual(result.inputs.shipperCount, 2);
  });

  it('UM shipper não dispara a exceção de múltiplos embarcadores', () => {
    const result = determineVpoApplicability({ operation: buildAggregate({ tollExpected: true, cargoRegime: 'lotacao', shipperCount: 1 }) });
    assert.strictEqual(result.applicable, true);
    assert.strictEqual(result.reasonCode, 'VPO_REQUIRED_TOLL_ROUTE');
  });

  it('tollExpected=null (indeterminado) + lotacao → applicable=null VPO_TOLL_EXPECTATION_UNKNOWN', () => {
    const result = determineVpoApplicability({ operation: buildAggregate({ tollExpected: null, cargoRegime: 'lotacao' }) });
    assert.strictEqual(result.applicable, null);
    assert.strictEqual(result.reasonCode, 'VPO_TOLL_EXPECTATION_UNKNOWN');
  });

  it('sem rota vinculada (route: null) → applicable=null VPO_TOLL_EXPECTATION_UNKNOWN (mesmo tratamento de tollExpected=null)', () => {
    const result = determineVpoApplicability({ operation: buildAggregate({ route: null, cargoRegime: 'lotacao' }) });
    assert.strictEqual(result.applicable, null);
    assert.strictEqual(result.reasonCode, 'VPO_TOLL_EXPECTATION_UNKNOWN');
  });

  it('tollExpected=true + cargoRegime=unknown → applicable=null VPO_CARGO_REGIME_UNKNOWN', () => {
    const result = determineVpoApplicability({ operation: buildAggregate({ tollExpected: true, cargoRegime: 'unknown' }) });
    assert.strictEqual(result.applicable, null);
    assert.strictEqual(result.reasonCode, 'VPO_CARGO_REGIME_UNKNOWN');
  });

  it('todo resultado carrega legalBasis (Lei 10.209/2001 + Res. ANTT 6.024/2023) — inclusive quando applicable=null', () => {
    const scenarios = [
      buildAggregate({ tollExpected: false }),
      buildAggregate({ tollExpected: true, cargoRegime: 'lotacao' }),
      buildAggregate({ tollExpected: true, cargoRegime: 'fracionada' }),
      buildAggregate({ tollExpected: null }),
      buildAggregate({ tollExpected: true, cargoRegime: 'unknown' })
    ];
    for (const operation of scenarios) {
      const result = determineVpoApplicability({ operation });
      assert.deepStrictEqual(result.legalBasis, [{ reference: 'Lei 10.209/2001' }, { reference: 'Res. ANTT 6.024/2023' }]);
      assert.ok(typeof result.humanMessage === 'string' && result.humanMessage.length > 0, 'humanMessage sempre presente, mesmo em applicable=null');
      assert.ok(typeof result.reasonCode === 'string' && result.reasonCode.length > 0, 'reasonCode sempre presente');
    }
  });

  it('inputs devolvidos batem com o que foi avaliado (tollExpected, cargoRegime, shipperCount)', () => {
    const result = determineVpoApplicability({ operation: buildAggregate({ tollExpected: true, cargoRegime: 'lotacao', shipperCount: 1 }) });
    assert.deepStrictEqual(result.inputs, { tollExpected: true, cargoRegime: 'lotacao', shipperCount: 1 });
  });
});

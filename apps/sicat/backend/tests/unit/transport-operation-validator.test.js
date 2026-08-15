/**
 * Testes do validador declaratório do agregado `TransportOperation` (PR-A4).
 *
 * Cobre: draft mínimo válido (só rota + cargoRegime), rota obrigatória, UF inválida, amounts
 * negativos rejeitados, e a rejeição de `status` no payload de update (422, checado antes de
 * qualquer outra validação).
 */

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

import { AppError } from '../../src/lib/problem.js';
import {
  assertNoStatusInUpdatePayload,
  validateAmount,
  validateCargoRegime,
  validateOperationCargoList,
  validateOperationParties,
  validateOperationRoute,
  validateOperationVehicles,
  validatePaymentTermDays
} from '../../src/lib/validators/transport-operation-validator.js';

function assertAppError(fn, status, code) {
  assert.throws(fn, (err) => {
    assert.ok(err instanceof AppError, 'erro deve ser AppError');
    assert.strictEqual(err.statusCode, status);
    assert.strictEqual(err.code, code);
    return true;
  });
}

const VALID_ROUTE = {
  originMunicipality: 'São Paulo',
  originUf: 'SP',
  destinationMunicipality: 'Campinas',
  destinationUf: 'SP',
  distanceKm: 99.5
};

describe('validateOperationRoute — draft mínimo', () => {
  it('aceita rota mínima (origem/destino: município + UF) e normaliza UF', () => {
    const route = validateOperationRoute({
      originMunicipality: 'São Paulo',
      originUf: 'sp',
      destinationMunicipality: 'Campinas',
      destinationUf: 'sp'
    });
    assert.strictEqual(route.originMunicipality, 'São Paulo');
    assert.strictEqual(route.originUf, 'SP');
    assert.strictEqual(route.destinationMunicipality, 'Campinas');
    assert.strictEqual(route.destinationUf, 'SP');
    assert.strictEqual(route.distanceKm, null);
    assert.strictEqual(route.routeSource, 'manual');
    assert.strictEqual(route.tollExpected, null);
    assert.deepStrictEqual(route.waypoints, []);
  });

  it('aceita distanceKm/routeSource/tollExpected/waypoints quando informados', () => {
    const route = validateOperationRoute({ ...VALID_ROUTE, routeSource: 'estimated', tollExpected: true, waypoints: [{ lat: 1, lng: 2 }] });
    assert.strictEqual(route.distanceKm, 99.5);
    assert.strictEqual(route.routeSource, 'estimated');
    assert.strictEqual(route.tollExpected, true);
    assert.deepStrictEqual(route.waypoints, [{ lat: 1, lng: 2 }]);
  });

  it('rota é obrigatória — ausente/null/tipo errado responde 400 TRANSPORT_OPERATION_ROUTE_REQUIRED', () => {
    assertAppError(() => validateOperationRoute(undefined), 400, 'TRANSPORT_OPERATION_ROUTE_REQUIRED');
    assertAppError(() => validateOperationRoute(null), 400, 'TRANSPORT_OPERATION_ROUTE_REQUIRED');
    assertAppError(() => validateOperationRoute('não é objeto'), 400, 'TRANSPORT_OPERATION_ROUTE_REQUIRED');
    assertAppError(() => validateOperationRoute([]), 400, 'TRANSPORT_OPERATION_ROUTE_REQUIRED');
  });

  it('originMunicipality/destinationMunicipality ausentes respondem 400 TRANSPORT_OPERATION_FIELD_REQUIRED', () => {
    assertAppError(
      () => validateOperationRoute({ ...VALID_ROUTE, originMunicipality: '' }),
      400,
      'TRANSPORT_OPERATION_FIELD_REQUIRED'
    );
    assertAppError(
      () => validateOperationRoute({ ...VALID_ROUTE, destinationMunicipality: undefined }),
      400,
      'TRANSPORT_OPERATION_FIELD_REQUIRED'
    );
  });

  it('UF inválida (origem ou destino) responde 400 TRANSPORT_PARTY_UF_INVALID (reaproveitado)', () => {
    assertAppError(
      () => validateOperationRoute({ ...VALID_ROUTE, originUf: 'XX' }),
      400,
      'TRANSPORT_PARTY_UF_INVALID'
    );
    assertAppError(
      () => validateOperationRoute({ ...VALID_ROUTE, destinationUf: 'ZZZ' }),
      400,
      'TRANSPORT_PARTY_UF_INVALID'
    );
  });

  it('UF ausente na rota (obrigatória aqui, diferente do cadastro-base) responde 400 TRANSPORT_OPERATION_FIELD_REQUIRED', () => {
    assertAppError(
      () => validateOperationRoute({ ...VALID_ROUTE, originUf: '' }),
      400,
      'TRANSPORT_OPERATION_FIELD_REQUIRED'
    );
  });

  it('distanceKm <= 0 responde 400 TRANSPORT_OPERATION_ROUTE_INVALID', () => {
    assertAppError(
      () => validateOperationRoute({ ...VALID_ROUTE, distanceKm: 0 }),
      400,
      'TRANSPORT_OPERATION_ROUTE_INVALID'
    );
    assertAppError(
      () => validateOperationRoute({ ...VALID_ROUTE, distanceKm: -5 }),
      400,
      'TRANSPORT_OPERATION_ROUTE_INVALID'
    );
  });

  it('routeSource fora do enum responde 400 TRANSPORT_OPERATION_ROUTE_INVALID', () => {
    assertAppError(
      () => validateOperationRoute({ ...VALID_ROUTE, routeSource: 'gps' }),
      400,
      'TRANSPORT_OPERATION_ROUTE_INVALID'
    );
  });
});

describe('validateCargoRegime', () => {
  it('aceita lotacao/fracionada/unknown', () => {
    assert.strictEqual(validateCargoRegime('lotacao'), 'lotacao');
    assert.strictEqual(validateCargoRegime('fracionada'), 'fracionada');
    assert.strictEqual(validateCargoRegime('unknown'), 'unknown');
  });

  it('ausência vira unknown (default)', () => {
    assert.strictEqual(validateCargoRegime(null), 'unknown');
    assert.strictEqual(validateCargoRegime(undefined), 'unknown');
    assert.strictEqual(validateCargoRegime(''), 'unknown');
  });

  it('rejeita valor fora do enum', () => {
    assertAppError(() => validateCargoRegime('paletizada'), 400, 'TRANSPORT_OPERATION_CARGO_REGIME_INVALID');
  });
});

describe('validateAmount — componentes do frete decomposto', () => {
  it('aceita número >= 0 e ausência (null)', () => {
    assert.strictEqual(validateAmount('freightOfferedAmount', 3500), 3500);
    assert.strictEqual(validateAmount('freightOfferedAmount', 0), 0);
    assert.strictEqual(validateAmount('freightOfferedAmount', null), null);
    assert.strictEqual(validateAmount('freightOfferedAmount', undefined), null);
    assert.strictEqual(validateAmount('freightOfferedAmount', ''), null);
  });

  it('rejeita valor negativo — 400 TRANSPORT_OPERATION_AMOUNT_INVALID', () => {
    assertAppError(() => validateAmount('freightOfferedAmount', -1), 400, 'TRANSPORT_OPERATION_AMOUNT_INVALID');
    assertAppError(() => validateAmount('tollAmount', -0.01), 400, 'TRANSPORT_OPERATION_AMOUNT_INVALID');
  });

  it('rejeita valor não numérico', () => {
    assertAppError(() => validateAmount('vpoAmount', 'muito'), 400, 'TRANSPORT_OPERATION_AMOUNT_INVALID');
  });
});

describe('validatePaymentTermDays', () => {
  it('aceita inteiro >= 0 e ausência (null)', () => {
    assert.strictEqual(validatePaymentTermDays(30), 30);
    assert.strictEqual(validatePaymentTermDays(0), 0);
    assert.strictEqual(validatePaymentTermDays(null), null);
    assert.strictEqual(validatePaymentTermDays(undefined), null);
  });

  it('rejeita negativo e não inteiro', () => {
    assertAppError(() => validatePaymentTermDays(-1), 400, 'TRANSPORT_OPERATION_PAYMENT_TERM_INVALID');
    assertAppError(() => validatePaymentTermDays(2.5), 400, 'TRANSPORT_OPERATION_PAYMENT_TERM_INVALID');
  });
});

describe('validateOperationParties', () => {
  it('lista ausente vira array vazio (parties é opcional no draft mínimo)', () => {
    assert.deepStrictEqual(validateOperationParties(undefined), []);
    assert.deepStrictEqual(validateOperationParties(null), []);
  });

  it('aceita { partyId, role } válidos', () => {
    const parties = validateOperationParties([{ partyId: 'trparty_abc', role: 'carrier' }]);
    assert.deepStrictEqual(parties, [{ partyId: 'trparty_abc', role: 'carrier' }]);
  });

  it('rejeita role fora do enum', () => {
    assertAppError(
      () => validateOperationParties([{ partyId: 'trparty_abc', role: 'owner' }]),
      400,
      'TRANSPORT_OPERATION_PARTY_ROLE_INVALID'
    );
  });

  it('rejeita partyId ausente', () => {
    assertAppError(
      () => validateOperationParties([{ role: 'carrier' }]),
      400,
      'TRANSPORT_OPERATION_FIELD_REQUIRED'
    );
  });
});

describe('validateOperationVehicles', () => {
  it('lista ausente vira array vazio', () => {
    assert.deepStrictEqual(validateOperationVehicles(undefined), []);
  });

  it('position ausente vira traction (default)', () => {
    const vehicles = validateOperationVehicles([{ vehicleId: 'trveh_abc' }]);
    assert.deepStrictEqual(vehicles, [{ vehicleId: 'trveh_abc', position: 'traction' }]);
  });

  it('rejeita position fora do enum', () => {
    assertAppError(
      () => validateOperationVehicles([{ vehicleId: 'trveh_abc', position: 'trailer' }]),
      400,
      'TRANSPORT_OPERATION_VEHICLE_POSITION_INVALID'
    );
  });
});

describe('validateOperationCargoList', () => {
  it('lista ausente vira array vazio', () => {
    assert.deepStrictEqual(validateOperationCargoList(undefined), []);
  });

  it('aceita item mínimo (só cargoType) com defaults', () => {
    const [item] = validateOperationCargoList([{ cargoType: 'granel' }]);
    assert.strictEqual(item.cargoType, 'granel');
    assert.strictEqual(item.description, '');
    assert.strictEqual(item.weightKg, null);
    assert.strictEqual(item.dangerousGoods, false);
  });

  it('rejeita weightKg <= 0 quando informado', () => {
    assertAppError(
      () => validateOperationCargoList([{ cargoType: 'granel', weightKg: 0 }]),
      400,
      'TRANSPORT_OPERATION_CARGO_INVALID'
    );
    assertAppError(
      () => validateOperationCargoList([{ cargoType: 'granel', weightKg: -10 }]),
      400,
      'TRANSPORT_OPERATION_CARGO_INVALID'
    );
  });

  it('rejeita cargoType ausente', () => {
    assertAppError(
      () => validateOperationCargoList([{ description: 'sem tipo' }]),
      400,
      'TRANSPORT_OPERATION_FIELD_REQUIRED'
    );
  });
});

describe('assertNoStatusInUpdatePayload — status é comando, não dado', () => {
  it('body sem status passa', () => {
    assert.doesNotThrow(() => assertNoStatusInUpdatePayload({ referenceCode: 'X' }));
  });

  it('body com status (mesmo igual ao atual) responde 422 TRANSPORT_STATUS_IS_COMMAND_DRIVEN', () => {
    assertAppError(
      () => assertNoStatusInUpdatePayload({ status: 'draft' }),
      422,
      'TRANSPORT_STATUS_IS_COMMAND_DRIVEN'
    );
    assertAppError(
      () => assertNoStatusInUpdatePayload({ status: null }),
      422,
      'TRANSPORT_STATUS_IS_COMMAND_DRIVEN'
    );
  });
});

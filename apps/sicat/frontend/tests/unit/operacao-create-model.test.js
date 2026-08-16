/**
 * Testes do modelo PURO do "Registrar viagem" (REQ-SICAT-0032, onda F3):
 * validação em pt-BR e payload fiel ao contrato do draft mínimo
 * (integrationAccountId + route; opcionais só entram quando preenchidos).
 */

import test from 'node:test';
import assert from 'node:assert/strict';
import {
  buildOperationCreatePayload,
  emptyOperationCreateForm,
  newOperationIdempotencyKey,
  UF_OPTIONS,
  validateOperationCreateForm
} from '../../src/views/transporte/operacao-create-model.js';

function formWithRoute(overrides = {}) {
  return {
    ...emptyOperationCreateForm(),
    originMunicipality: 'Palmas',
    originUf: 'TO',
    destinationMunicipality: 'Belém',
    destinationUf: 'PA',
    ...overrides
  };
}

test('rota é o mínimo obrigatório', () => {
  assert.ok(validateOperationCreateForm(emptyOperationCreateForm()).length >= 4, 'form vazio acusa os 4 campos da rota');
  assert.deepEqual(validateOperationCreateForm(formWithRoute()), [], 'rota completa passa sem opcionais');
  assert.equal(UF_OPTIONS.length, 27, 'as 27 UFs');
});

test('números inválidos e carga órfã são acusados', () => {
  assert.ok(
    validateOperationCreateForm(formWithRoute({ distanceKm: '0' })).some((error) => error.includes('Distância')),
    'distância zero é inválida'
  );
  assert.ok(
    validateOperationCreateForm(formWithRoute({ freightOfferedAmount: 'abc' })).some((error) => error.includes('Frete ofertado')),
    'frete não numérico é inválido'
  );
  assert.ok(
    validateOperationCreateForm(formWithRoute({ cargoDeclaredValue: '25000' })).some((error) => error.includes('tipo da carga')),
    'valor da carga sem o tipo fica órfão'
  );
});

test('payload mínimo não carrega opcionais vazios', () => {
  const payload = buildOperationCreatePayload(formWithRoute(), { integrationAccountId: 'acc_1' });
  assert.deepEqual(Object.keys(payload).sort(), ['cargoRegime', 'integrationAccountId', 'route']);
  assert.equal(payload.route.originUf, 'TO');
  assert.equal(payload.route.routeSource, 'manual');
  assert.equal('cargo' in payload, false);
  assert.equal('freightOfferedAmount' in payload, false);
});

test('payload completo converte números (vírgula inclusive) e monta a carga', () => {
  const payload = buildOperationCreatePayload(
    formWithRoute({
      referenceCode: ' V-001 ',
      cargoRegime: 'lotacao',
      distanceKm: '1200',
      freightContractedAmount: '3500,50',
      cargoType: 'grãos',
      cargoWeightKg: '28000',
      cargoDeclaredValue: '25000',
      cargoDangerousGoods: false
    }),
    { integrationAccountId: 'acc_1', sessionContextId: 'sess_1' }
  );
  assert.equal(payload.referenceCode, 'V-001');
  assert.equal(payload.sessionContextId, 'sess_1');
  assert.equal(payload.route.distanceKm, 1200);
  assert.equal(payload.freightContractedAmount, 3500.5);
  assert.deepEqual(payload.cargo, [{ cargoType: 'grãos', dangerousGoods: false, weightKg: 28000, declaredValue: 25000 }]);
});

test('idempotency key é única por tentativa', () => {
  const first = newOperationIdempotencyKey();
  const second = newOperationIdempotencyKey();
  assert.match(first, /^op-create-/);
  assert.notEqual(first, second);
});

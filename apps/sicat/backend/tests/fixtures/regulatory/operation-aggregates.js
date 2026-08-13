// Fixtures do agregado `TransportOperationAggregate` para a categoria `tests/regulatory/` (PR-A6).
//
// Molde: os builders locais de `tests/unit/rule-evaluators.test.js` (PR-A5) — aqui viram fixture
// de primeira classe, reaproveitável por toda `tests/regulatory/`. Como os demais fixtures da casa
// (`tests/fixtures/jobs.js`, `manifests.js`), são FUNÇÕES que devolvem objetos NOVOS a cada chamada
// (nunca JSON estático), para poder variar por teste via `overrides` sem um teste vazar estado para
// o outro.
//
// Shape espelha `TransportOperationAggregate` (src/lib/transport/transport-operation-types.ts):
// `{ operation, parties, vehicles, cargo, route }`. `overrides.operation` é mesclado por CIMA dos
// defaults do cenário — o mesmo padrão de `buildOperation({ ...overrides.operation })` já usado no
// PR-A5.

const FIXTURE_TIMESTAMP = '2026-08-13T00:00:00Z';
const OPERATION_ID = 'trop_fixture';

export function buildOperationHeader(overrides = {}) {
  return {
    id: OPERATION_ID,
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

export function buildParty(role, partySnapshot = {}, overrides = {}) {
  return {
    id: `troppart_${role}`,
    operationId: OPERATION_ID,
    partyId: `trparty_${role}`,
    role,
    partySnapshot,
    createdAt: FIXTURE_TIMESTAMP,
    ...overrides
  };
}

export function buildVehicle(position, vehicleSnapshot = {}, overrides = {}) {
  return {
    id: `tropveh_${position}`,
    operationId: OPERATION_ID,
    vehicleId: `trveh_${position}`,
    position,
    vehicleSnapshot,
    createdAt: FIXTURE_TIMESTAMP,
    ...overrides
  };
}

export function buildCargoItem(overrides = {}) {
  return {
    id: 'tropcargo_fixture',
    operationId: OPERATION_ID,
    cargoType: 'granel',
    cargoCode: null,
    description: 'Soja em grãos',
    weightKg: 30000,
    volumeM3: null,
    declaredValue: null,
    dangerousGoods: false,
    metadata: {},
    createdAt: FIXTURE_TIMESTAMP,
    ...overrides
  };
}

export function buildRoute(overrides = {}) {
  return {
    id: 'troproute_fixture',
    operationId: OPERATION_ID,
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
    createdAt: FIXTURE_TIMESTAMP,
    ...overrides
  };
}

/**
 * Agregado COMPLETO — enquadramento TAC lotação: carrier RNTRC categoria TAC ativo + contractor +
 * veículo + carga + rota + frete ofertado/contratado. É o "caminho feliz" usado como referência nos
 * testes de matriz gate×regra (`compliance-gates.test.js`).
 */
export function buildTacLotacaoOperation(overrides = {}) {
  return {
    operation: buildOperationHeader({
      cargoRegime: 'lotacao',
      freightOfferedAmount: 3800,
      freightContractedAmount: 3800,
      paymentTermDays: 30,
      ...overrides.operation
    }),
    parties: overrides.parties ?? [
      buildParty('carrier', { rntrcNumber: '12345678', rntrcCategory: 'TAC', rntrcStatus: 'active' }),
      buildParty('contractor', { legalName: 'Embarcadora Fixture LTDA' })
    ],
    vehicles: overrides.vehicles ?? [
      buildVehicle('traction', { plate: 'TAC1A23', vehicleType: 'truck', axlesCount: 3 })
    ],
    cargo: overrides.cargo ?? [buildCargoItem()],
    route: overrides.route === undefined ? buildRoute() : overrides.route
  };
}

/**
 * Agregado ETC (Empresa de Transporte de Cargas) com regime FRACIONADA — piso mínimo de frete não
 * incide nesta modalidade (TR-PMF-001/002/003/004 tratam `fracionada` como não aplicável).
 */
export function buildEtcFracionadaOperation(overrides = {}) {
  return {
    operation: buildOperationHeader({
      cargoRegime: 'fracionada',
      freightOfferedAmount: 1200,
      freightContractedAmount: 1200,
      paymentTermDays: 21,
      ...overrides.operation
    }),
    parties: overrides.parties ?? [
      buildParty('carrier', { rntrcNumber: '87654321', rntrcCategory: 'ETC', rntrcStatus: 'active' }),
      buildParty('contractor', { legalName: 'Embarcadora Fracionada LTDA' })
    ],
    vehicles: overrides.vehicles ?? [
      buildVehicle('traction', { plate: 'ETC1B23', vehicleType: 'truck', axlesCount: 2 })
    ],
    cargo: overrides.cargo ?? [
      buildCargoItem({ cargoType: 'fracionada', description: 'Carga fracionada diversa', weightKg: 4500 })
    ],
    route: overrides.route === undefined
      ? buildRoute({ destinationMunicipality: 'Santos', distanceKm: 78 })
      : overrides.route
  };
}

/**
 * Agregado CTC (Cooperativa de Transporte de Cargas) operando com SUBCONTRATAÇÃO — carrier CTC +
 * um segundo vínculo `subcontractor` (mesmo universo de papéis de `transport-party-types.ts`).
 */
export function buildCtcSubcontratadaOperation(overrides = {}) {
  return {
    operation: buildOperationHeader({
      cargoRegime: 'lotacao',
      freightOfferedAmount: 5200,
      freightContractedAmount: 5200,
      paymentTermDays: 30,
      ...overrides.operation
    }),
    parties: overrides.parties ?? [
      buildParty('carrier', { rntrcNumber: '11223344', rntrcCategory: 'CTC', rntrcStatus: 'active' }),
      buildParty('contractor', { legalName: 'Embarcadora CTC LTDA' }),
      buildParty('subcontractor', { rntrcNumber: '99887766', rntrcCategory: 'TAC', rntrcStatus: 'active' })
    ],
    vehicles: overrides.vehicles ?? [
      buildVehicle('traction', { plate: 'CTC1C23', vehicleType: 'tractor', axlesCount: 3 })
    ],
    cargo: overrides.cargo ?? [buildCargoItem({ description: 'Carga geral subcontratada' })],
    route: overrides.route === undefined
      ? buildRoute({ destinationMunicipality: 'Ribeirão Preto', distanceKm: 313 })
      : overrides.route
  };
}

/**
 * Rascunho INCOMPLETO — status `draft` sem nenhuma parte/veículo/carga/rota vinculada e regime não
 * declarado (`unknown`). É o "pior caso" usado para provar os `block`/`warn` brutos dos evaluators
 * (ex.: `TR-CIOT-004` → `block CIOT_DATA_INCOMPLETE`) antes do clamp de enforcement.
 */
export function buildIncompleteDraftOperation(overrides = {}) {
  return {
    operation: buildOperationHeader({
      cargoRegime: 'unknown',
      status: 'draft',
      ...overrides.operation
    }),
    parties: overrides.parties ?? [],
    vehicles: overrides.vehicles ?? [],
    cargo: overrides.cargo ?? [],
    route: overrides.route === undefined ? null : overrides.route
  };
}

/**
 * Service do agregado `TransportOperation` (PR-A4, DL-103).
 *
 * Fino: validação declaratória (`transport-operation-validator.ts`) → resolução de
 * `integrationAccountId` → repositório → mapeamento para o shape do CONTRATO
 * (`TransporteOperacao*` do OpenAPI, camelCase, freight DECOMPOSTO, sem `correlationId`).
 *
 * Resolução de `integrationAccountId`: mesmo contrato de `transport-party-service.ts` — sem
 * middleware de "conta ativa da sessão", o chamador informa explicitamente (body no POST/PATCH/
 * transições, query no GET).
 *
 * Máquina de estados: este PR só expõe `submitValidation`/`cancelTransportOperation` (as
 * transições SEM gate de `transport-state-machine.ts`). `approve_validation`/`contract`/... NÃO
 * são expostas — dependem do motor de compliance do PR-A5. Toda transição passa por
 * `assertTransition` (grafo) + `transitionStatus` (compare-and-swap no banco); o CAS é quem
 * decide de verdade sob concorrência, `assertTransition` só dá o 409 rápido/amigável usando o
 * último status lido.
 */

import { AppError } from '../lib/problem.js';
import { createPrefixedId } from '../lib/ids.js';
import { ensureIntegrationAccount } from '../repositories/integration-account-repo.js';
import { getPartyById } from '../repositories/transport-party-repo.js';
import { getVehicleById } from '../repositories/transport-vehicle-repo.js';
import {
  getOperationAggregateById,
  getOperationHeaderById,
  insertOperation,
  listOperations,
  transitionStatus,
  updateOperationById,
  type OperationListFilters,
  type OperationUpdatePatch
} from '../repositories/transport-operation-repo.js';
import { getIdempotentResponse, rememberIdempotentResponse } from './idempotency-service.js';
import {
  assertNoStatusInUpdatePayload,
  validateAmount,
  validateCargoRegime,
  validateOperationCargoList,
  validateOperationParties,
  validateOperationRoute,
  validateOperationVehicles,
  validatePaymentTermDays,
  type ValidatedOperationParty,
  type ValidatedOperationVehicle
} from '../lib/validators/transport-operation-validator.js';
import { assertTransition, listAvailableCommands } from '../lib/transport/transport-state-machine.js';
import type {
  TransportOperation,
  TransportOperationAggregate
} from '../lib/transport/transport-operation-types.js';

type LooseRecord = Record<string, unknown>;
type HeaderMap = Record<string, string | undefined>;

function getPgErrorCode(error: unknown): string | null {
  if (error && typeof error === 'object' && 'code' in error && typeof (error as { code?: unknown }).code === 'string') {
    return (error as { code: string }).code;
  }
  return null;
}

function toTrimmedString(value: unknown): string | null {
  if (typeof value !== 'string') return null;
  const trimmed = value.trim();
  return trimmed.length === 0 ? null : trimmed;
}

function requireNonEmptyString(value: unknown, detail: string, code: string): string {
  const normalized = toTrimmedString(value);
  if (!normalized) throw new AppError(400, 'Bad Request', detail, { code });
  return normalized;
}

function requireIntegrationAccountId(source: LooseRecord): string {
  return requireNonEmptyString(
    source.integrationAccountId,
    'integrationAccountId é obrigatório.',
    'TRANSPORT_OPERATION_FIELD_REQUIRED'
  );
}

function requireVersion(source: LooseRecord): number {
  const raw = source.version;
  const num = Number(raw);
  if (!Number.isFinite(num) || !Number.isInteger(num) || num < 1) {
    throw new AppError(400, 'Bad Request', 'version é obrigatório e deve ser um inteiro >= 1.', {
      code: 'TRANSPORT_OPERATION_FIELD_REQUIRED'
    });
  }
  return num;
}

function operationNotFound(operationId: string): AppError {
  return new AppError(404, 'Not Found', `Operação de transporte ${operationId} não encontrada.`, {
    code: 'TRANSPORT_OPERATION_NOT_FOUND'
  });
}

function operationDuplicateError(integrationAccountId: string): AppError {
  return new AppError(409, 'Conflict', 'Já existe uma operação com este referenceCode nesta conta.', {
    code: 'TRANSPORT_OPERATION_DUPLICATE',
    context: { integrationAccountId }
  });
}

/** Confirma que cada parte referenciada existe NA MESMA CONTA — 400 amigável antes de tocar o repo. */
async function assertPartiesBelongToAccount(parties: ValidatedOperationParty[], integrationAccountId: string): Promise<void> {
  for (const party of parties) {
    const found = await getPartyById(party.partyId, integrationAccountId);
    if (!found) {
      throw new AppError(400, 'Bad Request', `Parte ${party.partyId} não encontrada nesta conta.`, {
        code: 'TRANSPORT_OPERATION_PARTY_INVALID',
        context: { partyId: party.partyId, integrationAccountId }
      });
    }
  }
}

/** Confirma que cada veículo referenciado existe NA MESMA CONTA — 400 amigável antes de tocar o repo. */
async function assertVehiclesBelongToAccount(vehicles: ValidatedOperationVehicle[], integrationAccountId: string): Promise<void> {
  for (const vehicle of vehicles) {
    const found = await getVehicleById(vehicle.vehicleId, integrationAccountId);
    if (!found) {
      throw new AppError(400, 'Bad Request', `Veículo ${vehicle.vehicleId} não encontrado nesta conta.`, {
        code: 'TRANSPORT_OPERATION_VEHICLE_INVALID',
        context: { vehicleId: vehicle.vehicleId, integrationAccountId }
      });
    }
  }
}

// =============================================================================
// Mapeamento para o shape do contrato (freight DECOMPOSTO, sem correlationId)
// =============================================================================

type FreightBreakdown = {
  offeredAmount: number | null;
  contractedAmount: number | null;
  floorAmount: number | null;
  tollAmount: number | null;
  vpoAmount: number | null;
  otherComponentsAmount: number | null;
  totalContractValue: number | null;
};

function toFreightBreakdown(operation: TransportOperation): FreightBreakdown {
  return {
    offeredAmount: operation.freightOfferedAmount,
    contractedAmount: operation.freightContractedAmount,
    floorAmount: operation.freightFloorAmount,
    tollAmount: operation.tollAmount,
    vpoAmount: operation.vpoAmount,
    otherComponentsAmount: operation.otherComponentsAmount,
    totalContractValue: operation.totalContractValue
  };
}

type OperationResource = {
  id: string;
  version: number;
  integrationAccountId: string;
  sessionContextId: string | null;
  referenceCode: string | null;
  status: TransportOperation['status'];
  cargoRegime: TransportOperation['cargoRegime'];
  operationClassification: string | null;
  freight: FreightBreakdown;
  currency: string;
  paymentMethod: string | null;
  paymentTermDays: number | null;
  blockedReasonCode: string | null;
  cancelledReason: string | null;
  parties: Array<{ id: string; partyId: string; role: string; partySnapshot: Record<string, unknown>; createdAt: string }>;
  vehicles: Array<{ id: string; vehicleId: string; position: string; vehicleSnapshot: Record<string, unknown>; createdAt: string }>;
  cargo: Array<{
    id: string;
    cargoType: string;
    cargoCode: string | null;
    description: string;
    weightKg: number | null;
    volumeM3: number | null;
    declaredValue: number | null;
    dangerousGoods: boolean;
    metadata: Record<string, unknown>;
    createdAt: string;
  }>;
  route: {
    id: string;
    originMunicipality: string;
    originUf: string;
    originIbgeCode: string | null;
    destinationMunicipality: string;
    destinationUf: string;
    destinationIbgeCode: string | null;
    distanceKm: number | null;
    routeSource: string;
    tollExpected: boolean | null;
    waypoints: unknown[];
    createdAt: string;
  } | null;
  availableCommands: string[];
  createdAt: string;
  updatedAt: string;
};

function toOperationResource(aggregate: TransportOperationAggregate): OperationResource {
  const { operation, parties, vehicles, cargo, route } = aggregate;
  return {
    id: operation.id,
    version: operation.version,
    integrationAccountId: operation.integrationAccountId,
    sessionContextId: operation.sessionContextId,
    referenceCode: operation.referenceCode,
    status: operation.status,
    cargoRegime: operation.cargoRegime,
    operationClassification: operation.operationClassification,
    freight: toFreightBreakdown(operation),
    currency: operation.currency,
    paymentMethod: operation.paymentMethod,
    paymentTermDays: operation.paymentTermDays,
    blockedReasonCode: operation.blockedReasonCode,
    cancelledReason: operation.cancelledReason,
    parties: parties.map((party) => ({
      id: party.id,
      partyId: party.partyId,
      role: party.role,
      partySnapshot: party.partySnapshot,
      createdAt: party.createdAt
    })),
    vehicles: vehicles.map((vehicle) => ({
      id: vehicle.id,
      vehicleId: vehicle.vehicleId,
      position: vehicle.position,
      vehicleSnapshot: vehicle.vehicleSnapshot,
      createdAt: vehicle.createdAt
    })),
    cargo: cargo.map((item) => ({
      id: item.id,
      cargoType: item.cargoType,
      cargoCode: item.cargoCode,
      description: item.description,
      weightKg: item.weightKg,
      volumeM3: item.volumeM3,
      declaredValue: item.declaredValue,
      dangerousGoods: item.dangerousGoods,
      metadata: item.metadata,
      createdAt: item.createdAt
    })),
    route: route
      ? {
          id: route.id,
          originMunicipality: route.originMunicipality,
          originUf: route.originUf,
          originIbgeCode: route.originIbgeCode,
          destinationMunicipality: route.destinationMunicipality,
          destinationUf: route.destinationUf,
          destinationIbgeCode: route.destinationIbgeCode,
          distanceKm: route.distanceKm,
          routeSource: route.routeSource,
          tollExpected: route.tollExpected,
          waypoints: route.waypoints,
          createdAt: route.createdAt
        }
      : null,
    availableCommands: listAvailableCommands(operation.status),
    createdAt: operation.createdAt,
    updatedAt: operation.updatedAt
  };
}

/** Resumo leve para `GET /v1/transporte/operacoes` — sem sub-recursos (evita N+1 na listagem). */
type OperationResumo = {
  id: string;
  version: number;
  integrationAccountId: string;
  referenceCode: string | null;
  status: TransportOperation['status'];
  cargoRegime: TransportOperation['cargoRegime'];
  freight: FreightBreakdown;
  currency: string;
  availableCommands: string[];
  createdAt: string;
  updatedAt: string;
};

function toOperationResumo(operation: TransportOperation): OperationResumo {
  return {
    id: operation.id,
    version: operation.version,
    integrationAccountId: operation.integrationAccountId,
    referenceCode: operation.referenceCode,
    status: operation.status,
    cargoRegime: operation.cargoRegime,
    freight: toFreightBreakdown(operation),
    currency: operation.currency,
    availableCommands: listAvailableCommands(operation.status),
    createdAt: operation.createdAt,
    updatedAt: operation.updatedAt
  };
}

// =============================================================================
// POST /v1/transporte/operacoes
// =============================================================================

export async function createTransportOperation(body: LooseRecord, headers: HeaderMap, correlationId: string | null) {
  const integrationAccountId = requireIntegrationAccountId(body);

  const idempotencyKey = headers['idempotency-key'];
  const idempotencyScope = `transporte.operacao.create:${integrationAccountId}`;
  const reused = await getIdempotentResponse(idempotencyScope, idempotencyKey);
  if (reused) return reused;

  // Draft mínimo: só rota (origem/destino) + cargoRegime são obrigatórios. Parties/vehicles/cargo
  // são opcionais — a completude (contratante presente, transportador com RNTRC ativo, etc.) é
  // assunto dos gates do PR-A5, não deste PR.
  const cargoRegime = validateCargoRegime(body.cargoRegime);
  const route = validateOperationRoute(body.route);
  const referenceCode = toTrimmedString(body.referenceCode);
  const operationClassification = toTrimmedString(body.operationClassification);
  const freightOfferedAmount = validateAmount('freightOfferedAmount', body.freightOfferedAmount);
  const freightContractedAmount = validateAmount('freightContractedAmount', body.freightContractedAmount);
  const freightFloorAmount = validateAmount('freightFloorAmount', body.freightFloorAmount);
  const tollAmount = validateAmount('tollAmount', body.tollAmount);
  const vpoAmount = validateAmount('vpoAmount', body.vpoAmount);
  const otherComponentsAmount = validateAmount('otherComponentsAmount', body.otherComponentsAmount);
  const totalContractValue = validateAmount('totalContractValue', body.totalContractValue);
  const currency = toTrimmedString(body.currency) ?? 'BRL';
  const paymentMethod = toTrimmedString(body.paymentMethod);
  const paymentTermDays = validatePaymentTermDays(body.paymentTermDays);
  const sessionContextId = toTrimmedString(body.sessionContextId);

  const parties = validateOperationParties(body.parties);
  const vehicles = validateOperationVehicles(body.vehicles);
  const cargo = validateOperationCargoList(body.cargo);

  await ensureIntegrationAccount(integrationAccountId);
  await assertPartiesBelongToAccount(parties, integrationAccountId);
  await assertVehiclesBelongToAccount(vehicles, integrationAccountId);

  const id = createPrefixedId('trop');
  let aggregate: TransportOperationAggregate;
  try {
    aggregate = await insertOperation({
      id,
      integrationAccountId,
      sessionContextId,
      referenceCode,
      cargoRegime,
      operationClassification,
      freightOfferedAmount,
      freightContractedAmount,
      freightFloorAmount,
      tollAmount,
      vpoAmount,
      otherComponentsAmount,
      totalContractValue,
      currency,
      paymentMethod,
      paymentTermDays,
      correlationId: correlationId || createPrefixedId('corr'),
      parties,
      vehicles,
      cargo,
      route
    });
  } catch (error) {
    if (getPgErrorCode(error) === '23505') throw operationDuplicateError(integrationAccountId);
    throw error;
  }

  const response = toOperationResource(aggregate);
  await rememberIdempotentResponse({
    operation: idempotencyScope,
    idempotencyKey,
    entityType: 'transportOperation',
    entityId: id,
    response: response as unknown as Record<string, unknown>
  });
  return response;
}

// =============================================================================
// GET /v1/transporte/operacoes
// =============================================================================

export async function listTransportOperationsService(query: LooseRecord): Promise<{
  items: OperationResumo[];
  total: number;
  page: number;
  pageSize: number;
}> {
  const integrationAccountId = requireIntegrationAccountId(query);
  const filters: OperationListFilters = {
    status: toTrimmedString(query.status) ?? undefined,
    page: query.page !== undefined ? Number(query.page) : undefined,
    pageSize: query.pageSize !== undefined ? Number(query.pageSize) : undefined
  };

  const { items, total, page, pageSize } = await listOperations(integrationAccountId, filters);
  return { items: items.map(toOperationResumo), total, page, pageSize };
}

// =============================================================================
// GET /v1/transporte/operacoes/{operationId}
// =============================================================================

export async function getTransportOperationById(operationId: string, query: LooseRecord): Promise<OperationResource> {
  const integrationAccountId = requireIntegrationAccountId(query);
  const aggregate = await getOperationAggregateById(operationId, integrationAccountId);
  if (!aggregate) throw operationNotFound(operationId);
  return toOperationResource(aggregate);
}

// =============================================================================
// PATCH /v1/transporte/operacoes/{operationId}
// =============================================================================

export async function updateTransportOperation(operationId: string, body: LooseRecord): Promise<OperationResource> {
  // `status` é comando, não dado — checado ANTES de qualquer outra coisa (inclusive antes de
  // resolver a conta), para nunca dar a entender que o resto do payload foi considerado.
  assertNoStatusInUpdatePayload(body);

  const integrationAccountId = requireIntegrationAccountId(body);
  const expectedVersion = requireVersion(body);

  const current = await getOperationHeaderById(operationId, integrationAccountId);
  if (!current) throw operationNotFound(operationId);
  if (current.status !== 'draft' && current.status !== 'blocked') {
    throw new AppError(
      409,
      'Conflict',
      `Operação ${operationId} não pode ser editada no status "${current.status}" — só draft/blocked.`,
      { code: 'TRANSPORT_OPERATION_NOT_EDITABLE', context: { status: current.status } }
    );
  }

  const patch: OperationUpdatePatch = {};
  if (body.referenceCode !== undefined) patch.referenceCode = toTrimmedString(body.referenceCode);
  if (body.cargoRegime !== undefined) patch.cargoRegime = validateCargoRegime(body.cargoRegime);
  if (body.operationClassification !== undefined) patch.operationClassification = toTrimmedString(body.operationClassification);
  if (body.freightOfferedAmount !== undefined) patch.freightOfferedAmount = validateAmount('freightOfferedAmount', body.freightOfferedAmount);
  if (body.freightContractedAmount !== undefined) patch.freightContractedAmount = validateAmount('freightContractedAmount', body.freightContractedAmount);
  if (body.freightFloorAmount !== undefined) patch.freightFloorAmount = validateAmount('freightFloorAmount', body.freightFloorAmount);
  if (body.tollAmount !== undefined) patch.tollAmount = validateAmount('tollAmount', body.tollAmount);
  if (body.vpoAmount !== undefined) patch.vpoAmount = validateAmount('vpoAmount', body.vpoAmount);
  if (body.otherComponentsAmount !== undefined) patch.otherComponentsAmount = validateAmount('otherComponentsAmount', body.otherComponentsAmount);
  if (body.totalContractValue !== undefined) patch.totalContractValue = validateAmount('totalContractValue', body.totalContractValue);
  if (body.currency !== undefined) patch.currency = toTrimmedString(body.currency) ?? 'BRL';
  if (body.paymentMethod !== undefined) patch.paymentMethod = toTrimmedString(body.paymentMethod);
  if (body.paymentTermDays !== undefined) patch.paymentTermDays = validatePaymentTermDays(body.paymentTermDays);

  try {
    await updateOperationById(operationId, integrationAccountId, expectedVersion, patch);
  } catch (error) {
    if (getPgErrorCode(error) === '23505') throw operationDuplicateError(integrationAccountId);
    throw error;
  }

  const aggregate = await getOperationAggregateById(operationId, integrationAccountId);
  if (!aggregate) throw operationNotFound(operationId);
  return toOperationResource(aggregate);
}

// =============================================================================
// POST /v1/transporte/operacoes/{operationId}/submeter-validacao
// =============================================================================

export async function submitTransportOperationValidation(operationId: string, body: LooseRecord): Promise<OperationResource> {
  const integrationAccountId = requireIntegrationAccountId(body);
  const expectedVersion = requireVersion(body);

  const current = await getOperationHeaderById(operationId, integrationAccountId);
  if (!current) throw operationNotFound(operationId);

  const transition = assertTransition(current.status, 'submit_validation');
  await transitionStatus(operationId, integrationAccountId, transition.from, transition.to, expectedVersion);

  const aggregate = await getOperationAggregateById(operationId, integrationAccountId);
  if (!aggregate) throw operationNotFound(operationId);
  return toOperationResource(aggregate);
}

// =============================================================================
// POST /v1/transporte/operacoes/{operationId}/cancelar
// =============================================================================

export async function cancelTransportOperation(operationId: string, body: LooseRecord): Promise<OperationResource> {
  const integrationAccountId = requireIntegrationAccountId(body);
  const expectedVersion = requireVersion(body);
  const reason = toTrimmedString(body.reason);
  if (!reason) {
    throw new AppError(400, 'Bad Request', 'reason é obrigatório para cancelar a operação.', {
      code: 'TRANSPORT_CANCEL_REASON_REQUIRED'
    });
  }

  const current = await getOperationHeaderById(operationId, integrationAccountId);
  if (!current) throw operationNotFound(operationId);

  const transition = assertTransition(current.status, 'cancel');
  await transitionStatus(operationId, integrationAccountId, transition.from, transition.to, expectedVersion, {
    cancelledReason: reason
  });

  const aggregate = await getOperationAggregateById(operationId, integrationAccountId);
  if (!aggregate) throw operationNotFound(operationId);
  return toOperationResource(aggregate);
}

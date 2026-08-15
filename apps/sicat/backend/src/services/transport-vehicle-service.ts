/**
 * Service do cadastro-base de veículos (PR-A3, DL-103).
 *
 * Mesmo contrato de resolução de `integrationAccountId` de `transport-party-service.ts`: o
 * chamador informa explicitamente (body no POST/PATCH, query no GET) — sem middleware de "conta
 * ativa da sessão" nesta base (molde `manifest-service.listManifests`/`dmr-service`).
 */

import { AppError } from '../lib/problem.js';
import { createPrefixedId } from '../lib/ids.js';
import { ensureIntegrationAccount } from '../repositories/integration-account-repo.js';
import { getPartyById } from '../repositories/transport-party-repo.js';
import {
  getVehicleById,
  insertVehicle,
  listVehicles,
  updateVehicleById,
  type VehicleListFilters,
  type VehicleUpdatePatch
} from '../repositories/transport-vehicle-repo.js';
import {
  validateAxlesCount,
  validatePlate,
  validateVehicleType
} from '../lib/validators/transport-party-validator.js';
import type { TransportVehicle } from '../lib/transport/transport-party-types.js';

type LooseRecord = Record<string, unknown>;

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
    'TRANSPORT_VEHICLE_FIELD_REQUIRED'
  );
}

function requireVersion(source: LooseRecord): number {
  const raw = source.version;
  const num = Number(raw);
  if (!Number.isFinite(num) || !Number.isInteger(num) || num < 1) {
    throw new AppError(400, 'Bad Request', 'version é obrigatório e deve ser um inteiro >= 1.', {
      code: 'TRANSPORT_VEHICLE_FIELD_REQUIRED'
    });
  }
  return num;
}

type VehicleResource = {
  id: string;
  version: number;
  integrationAccountId: string;
  plate: string;
  renavam: string | null;
  vehicleType: TransportVehicle['vehicleType'];
  axlesCount: number | null;
  cargoBodyType: string | null;
  ownerPartyId: string | null;
  isActive: boolean;
  metadata: Record<string, unknown>;
  createdAt: string;
  updatedAt: string;
};

function toVehicleResource(vehicle: TransportVehicle): VehicleResource {
  return {
    id: vehicle.id,
    version: vehicle.version,
    integrationAccountId: vehicle.integrationAccountId,
    plate: vehicle.plate,
    renavam: vehicle.renavam,
    vehicleType: vehicle.vehicleType,
    axlesCount: vehicle.axlesCount,
    cargoBodyType: vehicle.cargoBodyType,
    ownerPartyId: vehicle.ownerPartyId,
    isActive: vehicle.isActive,
    metadata: vehicle.metadata,
    createdAt: vehicle.createdAt,
    updatedAt: vehicle.updatedAt
  };
}

function vehicleDuplicateError(integrationAccountId: string): AppError {
  return new AppError(409, 'Conflict', 'Já existe um veículo com esta placa nesta conta.', {
    code: 'TRANSPORT_VEHICLE_DUPLICATE',
    context: { integrationAccountId }
  });
}

function vehicleNotFound(vehicleId: string): AppError {
  return new AppError(404, 'Not Found', `Veículo ${vehicleId} não encontrado.`, {
    code: 'TRANSPORT_VEHICLE_NOT_FOUND'
  });
}

/**
 * Se `ownerPartyId` vier preenchido, garante que a parte existe NA MESMA CONTA — sem esta checagem
 * o INSERT cairia numa violação de FK crua (500 feio) em vez de um 400 declarativo.
 */
async function assertOwnerPartyBelongsToAccount(ownerPartyId: string | null, integrationAccountId: string): Promise<void> {
  if (!ownerPartyId) return;
  const owner = await getPartyById(ownerPartyId, integrationAccountId);
  if (!owner) {
    throw new AppError(
      400,
      'Bad Request',
      `ownerPartyId ${ownerPartyId} não encontrado nesta conta.`,
      { code: 'TRANSPORT_VEHICLE_OWNER_INVALID', context: { ownerPartyId, integrationAccountId } }
    );
  }
}

/** POST /v1/transporte/veiculos */
export async function createTransportVehicleService(
  body: LooseRecord,
  correlationId: string | null
): Promise<VehicleResource> {
  const integrationAccountId = requireIntegrationAccountId(body);
  const plate = validatePlate(body.plate);
  const vehicleType = validateVehicleType(body.vehicleType);
  const axlesCount = validateAxlesCount(body.axlesCount);
  const renavam = toTrimmedString(body.renavam);
  const cargoBodyType = toTrimmedString(body.cargoBodyType);
  const ownerPartyId = toTrimmedString(body.ownerPartyId);
  const isActive = body.isActive === undefined ? true : Boolean(body.isActive);
  const metadata = (body.metadata && typeof body.metadata === 'object' && !Array.isArray(body.metadata))
    ? (body.metadata as Record<string, unknown>)
    : {};

  await ensureIntegrationAccount(integrationAccountId);
  await assertOwnerPartyBelongsToAccount(ownerPartyId, integrationAccountId);

  const id = createPrefixedId('trveh');
  try {
    const vehicle = await insertVehicle({
      id,
      integrationAccountId,
      plate,
      renavam,
      vehicleType,
      axlesCount,
      cargoBodyType,
      ownerPartyId,
      isActive,
      metadata,
      correlationId: correlationId || createPrefixedId('corr')
    });
    return toVehicleResource(vehicle);
  } catch (error) {
    if (getPgErrorCode(error) === '23505') throw vehicleDuplicateError(integrationAccountId);
    throw error;
  }
}

/** GET /v1/transporte/veiculos */
export async function listTransportVehiclesService(query: LooseRecord): Promise<{
  items: VehicleResource[];
  total: number;
  page: number;
  pageSize: number;
}> {
  const integrationAccountId = requireIntegrationAccountId(query);
  const filters: VehicleListFilters = {
    search: toTrimmedString(query.search) ?? undefined,
    vehicleType: toTrimmedString(query.vehicleType) ?? undefined,
    page: query.page !== undefined ? Number(query.page) : undefined,
    pageSize: query.pageSize !== undefined ? Number(query.pageSize) : undefined
  };

  const { items, total, page, pageSize } = await listVehicles(integrationAccountId, filters);
  return { items: items.map(toVehicleResource), total, page, pageSize };
}

/** GET /v1/transporte/veiculos/{vehicleId} */
export async function getTransportVehicleService(vehicleId: string, query: LooseRecord): Promise<VehicleResource> {
  const integrationAccountId = requireIntegrationAccountId(query);
  const vehicle = await getVehicleById(vehicleId, integrationAccountId);
  if (!vehicle) throw vehicleNotFound(vehicleId);
  return toVehicleResource(vehicle);
}

/** PATCH /v1/transporte/veiculos/{vehicleId} */
export async function updateTransportVehicleService(vehicleId: string, body: LooseRecord): Promise<VehicleResource> {
  const integrationAccountId = requireIntegrationAccountId(body);
  const expectedVersion = requireVersion(body);

  const patch: VehicleUpdatePatch = {};
  if (body.plate !== undefined) patch.plate = validatePlate(body.plate);
  if (body.renavam !== undefined) patch.renavam = toTrimmedString(body.renavam);
  if (body.vehicleType !== undefined) patch.vehicleType = validateVehicleType(body.vehicleType);
  if (body.axlesCount !== undefined) patch.axlesCount = validateAxlesCount(body.axlesCount);
  if (body.cargoBodyType !== undefined) patch.cargoBodyType = toTrimmedString(body.cargoBodyType);
  if (body.ownerPartyId !== undefined) {
    const ownerPartyId = toTrimmedString(body.ownerPartyId);
    await assertOwnerPartyBelongsToAccount(ownerPartyId, integrationAccountId);
    patch.ownerPartyId = ownerPartyId;
  }
  if (body.isActive !== undefined) patch.isActive = Boolean(body.isActive);
  if (body.metadata !== undefined) {
    patch.metadata = (body.metadata && typeof body.metadata === 'object' && !Array.isArray(body.metadata))
      ? (body.metadata as Record<string, unknown>)
      : {};
  }

  try {
    const vehicle = await updateVehicleById(vehicleId, integrationAccountId, expectedVersion, patch);
    return toVehicleResource(vehicle);
  } catch (error) {
    if (getPgErrorCode(error) === '23505') throw vehicleDuplicateError(integrationAccountId);
    throw error;
  }
}

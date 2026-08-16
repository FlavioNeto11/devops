/**
 * Repositório de `transport_vehicles`/`transport_vehicle_links` (PR-A3, DL-103).
 *
 * TENANCY OBRIGATÓRIA (mesmo contrato de `transport-party-repo.ts`): toda leitura/escrita por id
 * filtra também por `integration_account_id`. `updateVehicleById` segue o mesmo locking otimista
 * (`version`) e a mesma distinção 404 (fora da conta) × 409 (version defasada) do repo de partes.
 *
 * `transport_vehicle_links` não tem `integration_account_id` própria — o vínculo herda tenancy do
 * veículo/parte que referencia; os serviços chamadores (`transport-party-service.ts`) já garantem
 * que ambos pertencem à mesma conta antes de chamar `insertVehicleLink`.
 */

import type { PoolClient } from 'pg';
import { query } from '../db/pool.js';
import { AppError } from '../lib/problem.js';
import type {
  TransportVehicle,
  TransportVehicleLink,
  VehicleLinkType,
  VehicleType
} from '../lib/transport/transport-party-types.js';

type DbClient = Pick<PoolClient, 'query'> | null;

function getQueryExecutor(client: DbClient = null) {
  return client?.query?.bind(client) || query;
}

type VehicleRow = {
  id: string;
  integration_account_id: string;
  plate: string;
  renavam: string | null;
  vehicle_type: string;
  axles_count: number | null;
  cargo_body_type: string | null;
  owner_party_id: string | null;
  is_active: boolean;
  metadata: unknown;
  correlation_id: string;
  version: number;
  created_at: Date | string;
  updated_at: Date | string;
};

type VehicleLinkRow = {
  id: string;
  vehicle_id: string;
  party_id: string;
  link_type: string;
  valid_from: Date | string | null;
  valid_until: Date | string | null;
  source: string;
  evidence_ref: string | null;
  created_at: Date | string;
  vehicle_plate?: string;
  vehicle_type?: string;
};

function toIso(value: Date | string | null | undefined): string | null {
  if (value == null) return null;
  if (value instanceof Date) return value.toISOString();
  return String(value);
}

function toIsoDateOnly(value: Date | string | null | undefined): string | null {
  if (value == null) return null;
  if (value instanceof Date) return value.toISOString().slice(0, 10);
  return String(value).slice(0, 10);
}

function toJsonObject(value: unknown): Record<string, unknown> {
  if (value && typeof value === 'object' && !Array.isArray(value)) {
    return value as Record<string, unknown>;
  }
  return {};
}

function mapRow(row: VehicleRow | undefined): TransportVehicle | null {
  if (!row) return null;
  return {
    id: row.id,
    integrationAccountId: row.integration_account_id,
    plate: row.plate,
    renavam: row.renavam,
    vehicleType: row.vehicle_type as VehicleType,
    axlesCount: row.axles_count == null ? null : Number(row.axles_count),
    cargoBodyType: row.cargo_body_type,
    ownerPartyId: row.owner_party_id,
    isActive: Boolean(row.is_active),
    metadata: toJsonObject(row.metadata),
    correlationId: row.correlation_id,
    version: Number(row.version ?? 1),
    createdAt: toIso(row.created_at) ?? '',
    updatedAt: toIso(row.updated_at) ?? ''
  };
}

export type VehicleInsertInput = {
  id: string;
  integrationAccountId: string;
  plate: string;
  renavam?: string | null;
  vehicleType: VehicleType;
  axlesCount?: number | null;
  cargoBodyType?: string | null;
  ownerPartyId?: string | null;
  isActive?: boolean;
  metadata?: Record<string, unknown>;
  correlationId: string;
};

export async function insertVehicle(input: VehicleInsertInput, client: DbClient = null): Promise<TransportVehicle> {
  const execute = getQueryExecutor(client);
  const result = await execute<VehicleRow>(
    `insert into transport_vehicles (
       id, integration_account_id, plate, renavam, vehicle_type, axles_count, cargo_body_type,
       owner_party_id, is_active, metadata, correlation_id, version
     ) values (
       $1, $2, $3, $4, $5, $6, $7, $8, $9, $10::jsonb, $11, 1
     )
     returning *`,
    [
      input.id,
      input.integrationAccountId,
      input.plate,
      input.renavam ?? null,
      input.vehicleType,
      input.axlesCount ?? null,
      input.cargoBodyType ?? null,
      input.ownerPartyId ?? null,
      input.isActive ?? true,
      JSON.stringify(input.metadata ?? {}),
      input.correlationId
    ]
  );

  const row = mapRow(result.rows[0]);
  if (!row) {
    throw new AppError(500, 'Internal Server Error', `Falha ao inserir veículo ${input.id}.`, {
      code: 'TRANSPORT_VEHICLE_INSERT_FAILED'
    });
  }
  return row;
}

export type VehicleListFilters = {
  search?: string;
  vehicleType?: string;
  page?: number;
  pageSize?: number;
};

const DEFAULT_PAGE_SIZE = 20;
const MAX_PAGE_SIZE = 200;

export async function listVehicles(
  integrationAccountId: string,
  filters: VehicleListFilters = {},
  client: DbClient = null
): Promise<{ items: TransportVehicle[]; total: number; page: number; pageSize: number }> {
  const execute = getQueryExecutor(client);
  const where: string[] = ['integration_account_id = $1'];
  const values: unknown[] = [integrationAccountId];

  if (filters.search) {
    values.push(`%${filters.search}%`);
    where.push(`(plate ilike $${values.length} or renavam ilike $${values.length})`);
  }
  if (filters.vehicleType) {
    values.push(filters.vehicleType);
    where.push(`vehicle_type = $${values.length}`);
  }

  const whereSql = `where ${where.join(' and ')}`;
  const page = Math.max(Math.floor(filters.page ?? 1), 1);
  const pageSize = Math.min(Math.max(Math.floor(filters.pageSize ?? DEFAULT_PAGE_SIZE), 1), MAX_PAGE_SIZE);
  const offset = (page - 1) * pageSize;

  const totalResult = await execute<{ count: string }>(
    `select count(*)::text as count from transport_vehicles ${whereSql}`,
    values
  );
  const total = Number(totalResult.rows[0]?.count ?? 0);

  const limitValues = [...values, pageSize, offset];
  const rowsResult = await execute<VehicleRow>(
    `select * from transport_vehicles
      ${whereSql}
      order by plate asc, id asc
      limit $${limitValues.length - 1} offset $${limitValues.length}`,
    limitValues
  );

  const items = rowsResult.rows.map(mapRow).filter((row): row is TransportVehicle => row !== null);
  return { items, total, page, pageSize };
}

export async function getVehicleById(
  id: string,
  integrationAccountId: string,
  client: DbClient = null
): Promise<TransportVehicle | null> {
  const execute = getQueryExecutor(client);
  const result = await execute<VehicleRow>(
    'select * from transport_vehicles where id = $1 and integration_account_id = $2',
    [id, integrationAccountId]
  );
  return mapRow(result.rows[0]);
}

export type VehicleUpdatePatch = Partial<Pick<
  TransportVehicle,
  | 'plate'
  | 'renavam'
  | 'vehicleType'
  | 'axlesCount'
  | 'cargoBodyType'
  | 'ownerPartyId'
  | 'isActive'
  | 'metadata'
>>;

async function vehicleNotFoundOrConflict(
  id: string,
  integrationAccountId: string,
  expectedVersion: number,
  client: DbClient
): Promise<never> {
  const execute = getQueryExecutor(client);
  const existing = await execute<{ version: number }>(
    'select version from transport_vehicles where id = $1 and integration_account_id = $2',
    [id, integrationAccountId]
  );
  if ((existing.rowCount ?? 0) === 0) {
    throw new AppError(404, 'Not Found', `Veículo ${id} não encontrado.`, {
      code: 'TRANSPORT_VEHICLE_NOT_FOUND'
    });
  }
  throw new AppError(
    409,
    'Conflict',
    `Veículo ${id} foi modificado por outro processo (esperado version=${expectedVersion}, atual=${existing.rows[0]?.version}).`,
    { code: 'TRANSPORT_VEHICLE_VERSION_CONFLICT' }
  );
}

export async function updateVehicleById(
  id: string,
  integrationAccountId: string,
  expectedVersion: number,
  patch: VehicleUpdatePatch,
  client: DbClient = null
): Promise<TransportVehicle> {
  const execute = getQueryExecutor(client);
  const sets: string[] = [];
  const values: unknown[] = [id, integrationAccountId, expectedVersion];

  function pushSet(column: string, value: unknown, jsonb = false) {
    values.push(value);
    sets.push(`${column} = $${values.length}${jsonb ? '::jsonb' : ''}`);
  }

  if (patch.plate !== undefined) pushSet('plate', patch.plate);
  if (patch.renavam !== undefined) pushSet('renavam', patch.renavam);
  if (patch.vehicleType !== undefined) pushSet('vehicle_type', patch.vehicleType);
  if (patch.axlesCount !== undefined) pushSet('axles_count', patch.axlesCount);
  if (patch.cargoBodyType !== undefined) pushSet('cargo_body_type', patch.cargoBodyType);
  if (patch.ownerPartyId !== undefined) pushSet('owner_party_id', patch.ownerPartyId);
  if (patch.isActive !== undefined) pushSet('is_active', patch.isActive);
  if (patch.metadata !== undefined) pushSet('metadata', JSON.stringify(patch.metadata), true);

  if (sets.length === 0) {
    const current = await execute<VehicleRow>(
      'select * from transport_vehicles where id = $1 and integration_account_id = $2 and version = $3',
      [id, integrationAccountId, expectedVersion]
    );
    const row = mapRow(current.rows[0]);
    if (!row) return vehicleNotFoundOrConflict(id, integrationAccountId, expectedVersion, client);
    return row;
  }

  // Trigger `trg_transport_vehicles_version` cuida do bump de version e updated_at.
  const result = await execute<VehicleRow>(
    `update transport_vehicles
        set ${sets.join(', ')}
      where id = $1
        and integration_account_id = $2
        and version = $3
      returning *`,
    values
  );

  const row = mapRow(result.rows[0]);
  if (!row) return vehicleNotFoundOrConflict(id, integrationAccountId, expectedVersion, client);
  return row;
}

// =============================================================================
// transport_vehicle_links
// =============================================================================

function mapLinkRow(row: VehicleLinkRow | undefined): (TransportVehicleLink & { vehiclePlate: string; vehicleType: VehicleType }) | null {
  if (!row) return null;
  return {
    id: row.id,
    vehicleId: row.vehicle_id,
    partyId: row.party_id,
    linkType: row.link_type as VehicleLinkType,
    validFrom: toIsoDateOnly(row.valid_from),
    validUntil: toIsoDateOnly(row.valid_until),
    source: row.source,
    evidenceRef: row.evidence_ref,
    createdAt: toIso(row.created_at) ?? '',
    vehiclePlate: row.vehicle_plate ?? '',
    vehicleType: (row.vehicle_type ?? 'other') as VehicleType
  };
}

export type VehicleLinkInsertInput = {
  id: string;
  vehicleId: string;
  partyId: string;
  linkType: VehicleLinkType;
  validFrom?: string | null;
  validUntil?: string | null;
  evidenceRef?: string | null;
};

export async function insertVehicleLink(
  input: VehicleLinkInsertInput,
  client: DbClient = null
): Promise<TransportVehicleLink> {
  const execute = getQueryExecutor(client);
  const result = await execute<VehicleLinkRow>(
    `insert into transport_vehicle_links (
       id, vehicle_id, party_id, link_type, valid_from, valid_until, source, evidence_ref
     ) values (
       $1, $2, $3, $4, $5, $6, 'manual', $7
     )
     returning *`,
    [
      input.id,
      input.vehicleId,
      input.partyId,
      input.linkType,
      input.validFrom ?? null,
      input.validUntil ?? null,
      input.evidenceRef ?? null
    ]
  );

  const row = mapLinkRow(result.rows[0]);
  if (!row) {
    throw new AppError(500, 'Internal Server Error', `Falha ao inserir vínculo veículo↔transportador (${input.vehicleId}/${input.partyId}).`, {
      code: 'TRANSPORT_VEHICLE_LINK_INSERT_FAILED'
    });
  }
  return row;
}

/**
 * Tipo de vínculo entre UM veículo e UMA parte, ou `null` quando não há vínculo — usado por
 * TR-RNTRC-002 (`transport-compliance-service.ts`) para checar se o veículo de tração da operação
 * está vinculado ao transportador (carrier). `rule-evaluators.ts` é PURO (sem SQL); esta consulta
 * roda no motor de compliance ANTES de montar `ctx`, no mesmo molde de
 * `findLatestFreightFloorCalculationForOperation` para `ctx.floorCalculation`.
 */
export async function findVehiclePartyLinkType(
  vehicleId: string,
  partyId: string,
  client: DbClient = null
): Promise<VehicleLinkType | null> {
  const execute = getQueryExecutor(client);
  const result = await execute<{ link_type: string }>(
    `select link_type from transport_vehicle_links
      where vehicle_id = $1 and party_id = $2
      order by created_at desc
      limit 1`,
    [vehicleId, partyId]
  );
  const row = result.rows[0];
  return row ? (row.link_type as VehicleLinkType) : null;
}

/**
 * Shape mínimo do vínculo para a TIPOLOGIA derivada (PR I1, REQ-SICAT-0033): só o que
 * `countActiveFleet` (`carrier-typology.ts`) precisa — tipo e vigência. Batch por VÁRIAS partes
 * (molde `listPartyRolesForParties`) para a listagem de transportadores calcular `fleetSize` sem
 * N+1; sem join com `transport_vehicles` de propósito (plate/type não entram na contagem).
 */
export async function listVehicleLinkPeriodsForParties(
  partyIds: readonly string[],
  client: DbClient = null
): Promise<Map<string, Array<{ linkType: VehicleLinkType; validFrom: string | null; validUntil: string | null }>>> {
  const map = new Map<string, Array<{ linkType: VehicleLinkType; validFrom: string | null; validUntil: string | null }>>();
  if (partyIds.length === 0) return map;

  const execute = getQueryExecutor(client);
  const result = await execute<{ party_id: string; link_type: string; valid_from: Date | string | null; valid_until: Date | string | null }>(
    `select party_id, link_type, valid_from, valid_until
       from transport_vehicle_links
      where party_id = any($1::text[])`,
    [partyIds]
  );
  for (const row of result.rows) {
    const bucket = map.get(row.party_id) ?? [];
    bucket.push({
      linkType: row.link_type as VehicleLinkType,
      validFrom: toIsoDateOnly(row.valid_from),
      validUntil: toIsoDateOnly(row.valid_until)
    });
    map.set(row.party_id, bucket);
  }
  return map;
}

/** Vínculos de uma parte, com um resumo (plate/vehicleType) do veículo — evita N+1 no frontend. */
export async function listVehicleLinksByParty(
  partyId: string,
  client: DbClient = null
): Promise<Array<TransportVehicleLink & { vehiclePlate: string; vehicleType: VehicleType }>> {
  const execute = getQueryExecutor(client);
  const result = await execute<VehicleLinkRow>(
    `select l.*, v.plate as vehicle_plate, v.vehicle_type as vehicle_type
       from transport_vehicle_links l
       inner join transport_vehicles v on v.id = l.vehicle_id
      where l.party_id = $1
      order by l.created_at desc`,
    [partyId]
  );
  return result.rows
    .map(mapLinkRow)
    .filter((row): row is TransportVehicleLink & { vehiclePlate: string; vehicleType: VehicleType } => row !== null);
}

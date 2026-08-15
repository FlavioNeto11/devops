/**
 * Repositório do agregado `transport_operations` + sub-recursos (parties/vehicles/cargo/route)
 * (PR-A4, DL-103).
 *
 * TENANCY OBRIGATÓRIA (mesmo contrato de `transport-party-repo.ts`): toda leitura/escrita do
 * cabeçalho por id filtra também por `integration_account_id`. Os quatro sub-recursos herdam
 * tenancy via FK `on delete cascade` — nunca são lidos/escritos sem passar pelo `operation_id` do
 * cabeçalho já validado.
 *
 * `insertOperation` cria o cabeçalho e os sub-recursos informados NA MESMA TRANSAÇÃO
 * (`withTransaction`): se um vínculo de parte/veículo referenciar algo fora da conta, a transação
 * inteira desfaz (o service já valida antes por UX, mas o repositório re-verifica dentro da
 * transação — é ele quem PRECISA reler party/veículo de qualquer forma para congelar o snapshot).
 *
 * `party_snapshot`/`vehicle_snapshot` congelam o estado da parte/veículo NO MOMENTO do vínculo —
 * mudanças posteriores no cadastro-base (PR-A3) não retroagem sobre operações já criadas.
 *
 * Locking otimista via coluna `version` no cabeçalho (molde `transport-party-repo.ts`):
 * `updateOperationById` e `transitionStatus` fazem compare-and-swap e distinguem 404 (fora da
 * conta) de 409 (version/status defasada) — nunca revelam a um chamador de outra conta se o id
 * existe em outro lugar.
 */

import type { PoolClient } from 'pg';
import { query, withTransaction } from '../db/pool.js';
import { AppError } from '../lib/problem.js';
import { createPrefixedId } from '../lib/ids.js';
import { getPartyById } from './transport-party-repo.js';
import { getVehicleById } from './transport-vehicle-repo.js';
import type { TransportParty, TransportVehicle } from '../lib/transport/transport-party-types.js';
import type {
  CargoRegime,
  OperationPartyRole,
  OperationRouteSource,
  OperationVehiclePosition,
  TransportOperation,
  TransportOperationAggregate,
  TransportOperationCargo,
  TransportOperationParty,
  TransportOperationRoute,
  TransportOperationVehicle
} from '../lib/transport/transport-operation-types.js';
import type { TransportOperationStatus } from '../lib/transport/transport-state-machine.js';

type DbClient = Pick<PoolClient, 'query'> | null;

function getQueryExecutor(client: DbClient = null) {
  return client?.query?.bind(client) || query;
}

// =============================================================================
// Mapeamento de linhas (snake_case → camelCase)
// =============================================================================

type OperationRow = {
  id: string;
  integration_account_id: string;
  session_context_id: string | null;
  reference_code: string | null;
  status: string;
  cargo_regime: string;
  operation_classification: string | null;
  freight_offered_amount: string | null;
  freight_contracted_amount: string | null;
  freight_floor_amount: string | null;
  toll_amount: string | null;
  vpo_amount: string | null;
  other_components_amount: string | null;
  total_contract_value: string | null;
  currency: string;
  payment_method: string | null;
  payment_term_days: number | null;
  blocked_reason_code: string | null;
  cancelled_reason: string | null;
  correlation_id: string;
  command_id: string | null;
  last_error_code: string | null;
  last_error_detail: unknown;
  version: number;
  created_at: Date | string;
  updated_at: Date | string;
};

type OperationPartyRow = {
  id: string;
  operation_id: string;
  party_id: string;
  role: string;
  party_snapshot: unknown;
  created_at: Date | string;
};

type OperationVehicleRow = {
  id: string;
  operation_id: string;
  vehicle_id: string;
  position: string;
  vehicle_snapshot: unknown;
  created_at: Date | string;
};

type OperationCargoRow = {
  id: string;
  operation_id: string;
  cargo_type: string;
  cargo_code: string | null;
  description: string;
  weight_kg: string | null;
  volume_m3: string | null;
  declared_value: string | null;
  dangerous_goods: boolean;
  metadata: unknown;
  created_at: Date | string;
};

type OperationRouteRow = {
  id: string;
  operation_id: string;
  origin_municipality: string;
  origin_uf: string;
  origin_ibge_code: string | null;
  destination_municipality: string;
  destination_uf: string;
  destination_ibge_code: string | null;
  distance_km: string | null;
  route_source: string;
  toll_expected: boolean | null;
  waypoints: unknown;
  created_at: Date | string;
};

function toIso(value: Date | string | null | undefined): string | null {
  if (value == null) return null;
  if (value instanceof Date) return value.toISOString();
  return String(value);
}

function toNumberOrNull(value: unknown): number | null {
  if (value === null || value === undefined) return null;
  const num = Number(value);
  return Number.isFinite(num) ? num : null;
}

function toJsonObject(value: unknown): Record<string, unknown> {
  if (value && typeof value === 'object' && !Array.isArray(value)) {
    return value as Record<string, unknown>;
  }
  return {};
}

function toJsonArray(value: unknown): unknown[] {
  return Array.isArray(value) ? value : [];
}

function mapOperationRow(row: OperationRow | undefined): TransportOperation | null {
  if (!row) return null;
  return {
    id: row.id,
    integrationAccountId: row.integration_account_id,
    sessionContextId: row.session_context_id,
    referenceCode: row.reference_code,
    status: row.status as TransportOperationStatus,
    cargoRegime: row.cargo_regime as CargoRegime,
    operationClassification: row.operation_classification,
    freightOfferedAmount: toNumberOrNull(row.freight_offered_amount),
    freightContractedAmount: toNumberOrNull(row.freight_contracted_amount),
    freightFloorAmount: toNumberOrNull(row.freight_floor_amount),
    tollAmount: toNumberOrNull(row.toll_amount),
    vpoAmount: toNumberOrNull(row.vpo_amount),
    otherComponentsAmount: toNumberOrNull(row.other_components_amount),
    totalContractValue: toNumberOrNull(row.total_contract_value),
    currency: row.currency,
    paymentMethod: row.payment_method,
    paymentTermDays: row.payment_term_days == null ? null : Number(row.payment_term_days),
    blockedReasonCode: row.blocked_reason_code,
    cancelledReason: row.cancelled_reason,
    correlationId: row.correlation_id,
    commandId: row.command_id,
    lastErrorCode: row.last_error_code,
    lastErrorDetail: row.last_error_detail == null ? null : toJsonObject(row.last_error_detail),
    version: Number(row.version ?? 1),
    createdAt: toIso(row.created_at) ?? '',
    updatedAt: toIso(row.updated_at) ?? ''
  };
}

function mapOperationPartyRow(row: OperationPartyRow | undefined): TransportOperationParty | null {
  if (!row) return null;
  return {
    id: row.id,
    operationId: row.operation_id,
    partyId: row.party_id,
    role: row.role as OperationPartyRole,
    partySnapshot: toJsonObject(row.party_snapshot),
    createdAt: toIso(row.created_at) ?? ''
  };
}

function mapOperationVehicleRow(row: OperationVehicleRow | undefined): TransportOperationVehicle | null {
  if (!row) return null;
  return {
    id: row.id,
    operationId: row.operation_id,
    vehicleId: row.vehicle_id,
    position: row.position as OperationVehiclePosition,
    vehicleSnapshot: toJsonObject(row.vehicle_snapshot),
    createdAt: toIso(row.created_at) ?? ''
  };
}

function mapOperationCargoRow(row: OperationCargoRow | undefined): TransportOperationCargo | null {
  if (!row) return null;
  return {
    id: row.id,
    operationId: row.operation_id,
    cargoType: row.cargo_type,
    cargoCode: row.cargo_code,
    description: row.description,
    weightKg: toNumberOrNull(row.weight_kg),
    volumeM3: toNumberOrNull(row.volume_m3),
    declaredValue: toNumberOrNull(row.declared_value),
    dangerousGoods: Boolean(row.dangerous_goods),
    metadata: toJsonObject(row.metadata),
    createdAt: toIso(row.created_at) ?? ''
  };
}

function mapOperationRouteRow(row: OperationRouteRow | undefined): TransportOperationRoute | null {
  if (!row) return null;
  return {
    id: row.id,
    operationId: row.operation_id,
    originMunicipality: row.origin_municipality,
    originUf: row.origin_uf,
    originIbgeCode: row.origin_ibge_code,
    destinationMunicipality: row.destination_municipality,
    destinationUf: row.destination_uf,
    destinationIbgeCode: row.destination_ibge_code,
    distanceKm: toNumberOrNull(row.distance_km),
    routeSource: row.route_source as OperationRouteSource,
    tollExpected: row.toll_expected,
    waypoints: toJsonArray(row.waypoints),
    createdAt: toIso(row.created_at) ?? ''
  };
}

/** Congela SÓ os campos que interessam a uma auditoria futura (documento/nome/RNTRC declarado). */
function buildPartySnapshot(party: TransportParty): Record<string, unknown> {
  return {
    documentType: party.documentType,
    documentNumber: party.documentNumber,
    legalName: party.legalName,
    rntrcNumber: party.rntrcNumber,
    rntrcCategory: party.rntrcCategory,
    rntrcStatus: party.rntrcStatus
  };
}

/** Congela SÓ os campos que interessam a uma auditoria futura (placa/tipo/RENAVAM/eixos). */
function buildVehicleSnapshot(vehicle: TransportVehicle): Record<string, unknown> {
  return {
    plate: vehicle.plate,
    renavam: vehicle.renavam,
    vehicleType: vehicle.vehicleType,
    axlesCount: vehicle.axlesCount,
    cargoBodyType: vehicle.cargoBodyType
  };
}

// =============================================================================
// transport_operations — cabeçalho
// =============================================================================

export type OperationPartyInput = { partyId: string; role: OperationPartyRole };
export type OperationVehicleInput = { vehicleId: string; position: OperationVehiclePosition };

export type OperationCargoInput = {
  cargoType: string;
  cargoCode?: string | null;
  description?: string;
  weightKg?: number | null;
  volumeM3?: number | null;
  declaredValue?: number | null;
  dangerousGoods?: boolean;
  metadata?: Record<string, unknown>;
};

export type OperationRouteInput = {
  originMunicipality: string;
  originUf: string;
  originIbgeCode?: string | null;
  destinationMunicipality: string;
  destinationUf: string;
  destinationIbgeCode?: string | null;
  distanceKm?: number | null;
  routeSource?: OperationRouteSource;
  tollExpected?: boolean | null;
  waypoints?: unknown[];
};

export type OperationInsertInput = {
  id: string;
  integrationAccountId: string;
  sessionContextId?: string | null;
  referenceCode?: string | null;
  cargoRegime: CargoRegime;
  operationClassification?: string | null;
  freightOfferedAmount?: number | null;
  freightContractedAmount?: number | null;
  freightFloorAmount?: number | null;
  tollAmount?: number | null;
  vpoAmount?: number | null;
  otherComponentsAmount?: number | null;
  totalContractValue?: number | null;
  currency?: string;
  paymentMethod?: string | null;
  paymentTermDays?: number | null;
  correlationId: string;
  parties?: OperationPartyInput[];
  vehicles?: OperationVehicleInput[];
  cargo?: OperationCargoInput[];
  route?: OperationRouteInput | null;
};

async function insertOperationHeader(input: OperationInsertInput, client: DbClient): Promise<TransportOperation> {
  const execute = getQueryExecutor(client);
  const result = await execute<OperationRow>(
    `insert into transport_operations (
       id, integration_account_id, session_context_id, reference_code, status, cargo_regime,
       operation_classification, freight_offered_amount, freight_contracted_amount,
       freight_floor_amount, toll_amount, vpo_amount, other_components_amount,
       total_contract_value, currency, payment_method, payment_term_days, correlation_id, version
     ) values (
       $1, $2, $3, $4, 'draft', $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, 1
     )
     returning *`,
    [
      input.id,
      input.integrationAccountId,
      input.sessionContextId ?? null,
      input.referenceCode ?? null,
      input.cargoRegime,
      input.operationClassification ?? null,
      input.freightOfferedAmount ?? null,
      input.freightContractedAmount ?? null,
      input.freightFloorAmount ?? null,
      input.tollAmount ?? null,
      input.vpoAmount ?? null,
      input.otherComponentsAmount ?? null,
      input.totalContractValue ?? null,
      input.currency ?? 'BRL',
      input.paymentMethod ?? null,
      input.paymentTermDays ?? null,
      input.correlationId
    ]
  );
  const row = mapOperationRow(result.rows[0]);
  if (!row) {
    throw new AppError(500, 'Internal Server Error', `Falha ao inserir operação de transporte ${input.id}.`, {
      code: 'TRANSPORT_OPERATION_INSERT_FAILED'
    });
  }
  return row;
}

async function insertOperationParty(
  input: { id: string; operationId: string; partyId: string; role: OperationPartyRole; snapshot: Record<string, unknown> },
  client: DbClient
): Promise<TransportOperationParty> {
  const execute = getQueryExecutor(client);
  const result = await execute<OperationPartyRow>(
    `insert into transport_operation_parties (id, operation_id, party_id, role, party_snapshot)
     values ($1, $2, $3, $4, $5::jsonb)
     returning *`,
    [input.id, input.operationId, input.partyId, input.role, JSON.stringify(input.snapshot)]
  );
  const row = mapOperationPartyRow(result.rows[0]);
  if (!row) {
    throw new AppError(
      500,
      'Internal Server Error',
      `Falha ao vincular parte ${input.partyId} à operação ${input.operationId}.`,
      { code: 'TRANSPORT_OPERATION_PARTY_INSERT_FAILED' }
    );
  }
  return row;
}

async function insertOperationVehicle(
  input: { id: string; operationId: string; vehicleId: string; position: OperationVehiclePosition; snapshot: Record<string, unknown> },
  client: DbClient
): Promise<TransportOperationVehicle> {
  const execute = getQueryExecutor(client);
  const result = await execute<OperationVehicleRow>(
    `insert into transport_operation_vehicles (id, operation_id, vehicle_id, position, vehicle_snapshot)
     values ($1, $2, $3, $4, $5::jsonb)
     returning *`,
    [input.id, input.operationId, input.vehicleId, input.position, JSON.stringify(input.snapshot)]
  );
  const row = mapOperationVehicleRow(result.rows[0]);
  if (!row) {
    throw new AppError(
      500,
      'Internal Server Error',
      `Falha ao vincular veículo ${input.vehicleId} à operação ${input.operationId}.`,
      { code: 'TRANSPORT_OPERATION_VEHICLE_INSERT_FAILED' }
    );
  }
  return row;
}

async function insertOperationCargoItem(
  input: OperationCargoInput & { id: string; operationId: string },
  client: DbClient
): Promise<TransportOperationCargo> {
  const execute = getQueryExecutor(client);
  const result = await execute<OperationCargoRow>(
    `insert into transport_operation_cargo (
       id, operation_id, cargo_type, cargo_code, description, weight_kg, volume_m3,
       declared_value, dangerous_goods, metadata
     ) values ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10::jsonb)
     returning *`,
    [
      input.id,
      input.operationId,
      input.cargoType,
      input.cargoCode ?? null,
      input.description ?? '',
      input.weightKg ?? null,
      input.volumeM3 ?? null,
      input.declaredValue ?? null,
      input.dangerousGoods ?? false,
      JSON.stringify(input.metadata ?? {})
    ]
  );
  const row = mapOperationCargoRow(result.rows[0]);
  if (!row) {
    throw new AppError(500, 'Internal Server Error', `Falha ao inserir item de carga da operação ${input.operationId}.`, {
      code: 'TRANSPORT_OPERATION_CARGO_INSERT_FAILED'
    });
  }
  return row;
}

async function insertOperationRouteRow(
  input: OperationRouteInput & { id: string; operationId: string },
  client: DbClient
): Promise<TransportOperationRoute> {
  const execute = getQueryExecutor(client);
  const result = await execute<OperationRouteRow>(
    `insert into transport_operation_routes (
       id, operation_id, origin_municipality, origin_uf, origin_ibge_code,
       destination_municipality, destination_uf, destination_ibge_code, distance_km,
       route_source, toll_expected, waypoints
     ) values ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12::jsonb)
     returning *`,
    [
      input.id,
      input.operationId,
      input.originMunicipality,
      input.originUf,
      input.originIbgeCode ?? null,
      input.destinationMunicipality,
      input.destinationUf,
      input.destinationIbgeCode ?? null,
      input.distanceKm ?? null,
      input.routeSource ?? 'manual',
      input.tollExpected ?? null,
      JSON.stringify(input.waypoints ?? [])
    ]
  );
  const row = mapOperationRouteRow(result.rows[0]);
  if (!row) {
    throw new AppError(500, 'Internal Server Error', `Falha ao inserir rota da operação ${input.operationId}.`, {
      code: 'TRANSPORT_OPERATION_ROUTE_INSERT_FAILED'
    });
  }
  return row;
}

/**
 * Cria o cabeçalho + sub-recursos informados NA MESMA TRANSAÇÃO. Partes/veículos são relidos AQUI
 * (não confia só na validação do service) — é o repositório quem congela o snapshot, então ele
 * PRECISA buscar o registro de qualquer forma; fazê-lo dentro da transação fecha a janela de corrida
 * entre a validação do service e o commit.
 */
export async function insertOperation(input: OperationInsertInput): Promise<TransportOperationAggregate> {
  return withTransaction(async (client) => {
    const operation = await insertOperationHeader(input, client);

    const parties: TransportOperationParty[] = [];
    for (const partyInput of input.parties ?? []) {
      const party = await getPartyById(partyInput.partyId, input.integrationAccountId, client);
      if (!party) {
        throw new AppError(
          400,
          'Bad Request',
          `Parte ${partyInput.partyId} não encontrada nesta conta — não é possível vincular à operação.`,
          { code: 'TRANSPORT_OPERATION_PARTY_INVALID', context: { partyId: partyInput.partyId } }
        );
      }
      parties.push(
        await insertOperationParty(
          {
            id: createPrefixedId('troppart'),
            operationId: operation.id,
            partyId: party.id,
            role: partyInput.role,
            snapshot: buildPartySnapshot(party)
          },
          client
        )
      );
    }

    const vehicles: TransportOperationVehicle[] = [];
    for (const vehicleInput of input.vehicles ?? []) {
      const vehicle = await getVehicleById(vehicleInput.vehicleId, input.integrationAccountId, client);
      if (!vehicle) {
        throw new AppError(
          400,
          'Bad Request',
          `Veículo ${vehicleInput.vehicleId} não encontrado nesta conta — não é possível vincular à operação.`,
          { code: 'TRANSPORT_OPERATION_VEHICLE_INVALID', context: { vehicleId: vehicleInput.vehicleId } }
        );
      }
      vehicles.push(
        await insertOperationVehicle(
          {
            id: createPrefixedId('tropveh'),
            operationId: operation.id,
            vehicleId: vehicle.id,
            position: vehicleInput.position,
            snapshot: buildVehicleSnapshot(vehicle)
          },
          client
        )
      );
    }

    const cargo: TransportOperationCargo[] = [];
    for (const cargoInput of input.cargo ?? []) {
      cargo.push(
        await insertOperationCargoItem(
          { ...cargoInput, id: createPrefixedId('tropcargo'), operationId: operation.id },
          client
        )
      );
    }

    const route = input.route
      ? await insertOperationRouteRow(
          { ...input.route, id: createPrefixedId('troproute'), operationId: operation.id },
          client
        )
      : null;

    return { operation, parties, vehicles, cargo, route };
  });
}

export type OperationListFilters = {
  status?: string;
  page?: number;
  pageSize?: number;
};

const DEFAULT_PAGE_SIZE = 20;
const MAX_PAGE_SIZE = 200;

export async function listOperations(
  integrationAccountId: string,
  filters: OperationListFilters = {}
): Promise<{ items: TransportOperation[]; total: number; page: number; pageSize: number }> {
  const where: string[] = ['integration_account_id = $1'];
  const values: unknown[] = [integrationAccountId];

  if (filters.status) {
    values.push(filters.status);
    where.push(`status = $${values.length}`);
  }

  const whereSql = `where ${where.join(' and ')}`;
  const page = Math.max(Math.floor(filters.page ?? 1), 1);
  const pageSize = Math.min(Math.max(Math.floor(filters.pageSize ?? DEFAULT_PAGE_SIZE), 1), MAX_PAGE_SIZE);
  const offset = (page - 1) * pageSize;

  const totalResult = await query<{ count: string }>(
    `select count(*)::text as count from transport_operations ${whereSql}`,
    values
  );
  const total = Number(totalResult.rows[0]?.count ?? 0);

  const limitValues = [...values, pageSize, offset];
  const rowsResult = await query<OperationRow>(
    `select * from transport_operations
      ${whereSql}
      order by created_at desc, id asc
      limit $${limitValues.length - 1} offset $${limitValues.length}`,
    limitValues
  );

  const items = rowsResult.rows.map(mapOperationRow).filter((row): row is TransportOperation => row !== null);
  return { items, total, page, pageSize };
}

/** Leitura leve do cabeçalho (sem sub-recursos) — usada antes de mutações (PATCH/transições). */
export async function getOperationHeaderById(
  id: string,
  integrationAccountId: string,
  client: DbClient = null
): Promise<TransportOperation | null> {
  const execute = getQueryExecutor(client);
  const result = await execute<OperationRow>(
    'select * from transport_operations where id = $1 and integration_account_id = $2',
    [id, integrationAccountId]
  );
  return mapOperationRow(result.rows[0]);
}

/** Cabeçalho + os quatro sub-recursos — usado pelo GET de detalhe. */
export async function getOperationAggregateById(
  id: string,
  integrationAccountId: string
): Promise<TransportOperationAggregate | null> {
  const operation = await getOperationHeaderById(id, integrationAccountId);
  if (!operation) return null;

  const [partiesResult, vehiclesResult, cargoResult, routeResult] = await Promise.all([
    query<OperationPartyRow>(
      'select * from transport_operation_parties where operation_id = $1 order by created_at asc',
      [id]
    ),
    query<OperationVehicleRow>(
      'select * from transport_operation_vehicles where operation_id = $1 order by created_at asc',
      [id]
    ),
    query<OperationCargoRow>(
      'select * from transport_operation_cargo where operation_id = $1 order by created_at asc',
      [id]
    ),
    query<OperationRouteRow>('select * from transport_operation_routes where operation_id = $1', [id])
  ]);

  return {
    operation,
    parties: partiesResult.rows.map(mapOperationPartyRow).filter((row): row is TransportOperationParty => row !== null),
    vehicles: vehiclesResult.rows
      .map(mapOperationVehicleRow)
      .filter((row): row is TransportOperationVehicle => row !== null),
    cargo: cargoResult.rows.map(mapOperationCargoRow).filter((row): row is TransportOperationCargo => row !== null),
    route: mapOperationRouteRow(routeResult.rows[0])
  };
}

export type OperationUpdatePatch = Partial<
  Pick<
    TransportOperation,
    | 'referenceCode'
    | 'cargoRegime'
    | 'operationClassification'
    | 'freightOfferedAmount'
    | 'freightContractedAmount'
    | 'freightFloorAmount'
    | 'tollAmount'
    | 'vpoAmount'
    | 'otherComponentsAmount'
    | 'totalContractValue'
    | 'currency'
    | 'paymentMethod'
    | 'paymentTermDays'
  >
>;

async function operationNotFoundOrConflict(
  id: string,
  integrationAccountId: string,
  expectedVersion: number,
  client: DbClient
): Promise<never> {
  const execute = getQueryExecutor(client);
  // Checagem restrita À MESMA CONTA — não revela se o id existe sob outra conta (isolamento).
  const existing = await execute<{ version: number }>(
    'select version from transport_operations where id = $1 and integration_account_id = $2',
    [id, integrationAccountId]
  );
  if ((existing.rowCount ?? 0) === 0) {
    throw new AppError(404, 'Not Found', `Operação de transporte ${id} não encontrada.`, {
      code: 'TRANSPORT_OPERATION_NOT_FOUND'
    });
  }
  throw new AppError(
    409,
    'Conflict',
    `Operação de transporte ${id} foi modificada por outro processo (esperado version=${expectedVersion}, atual=${existing.rows[0]?.version}).`,
    { code: 'TRANSPORT_OPERATION_VERSION_CONFLICT' }
  );
}

/** Atualiza campos do cabeçalho por locking otimista. NUNCA muta `status` — isso é `transitionStatus`. */
export async function updateOperationById(
  id: string,
  integrationAccountId: string,
  expectedVersion: number,
  patch: OperationUpdatePatch,
  client: DbClient = null
): Promise<TransportOperation> {
  const execute = getQueryExecutor(client);
  const sets: string[] = [];
  const values: unknown[] = [id, integrationAccountId, expectedVersion];

  function pushSet(column: string, value: unknown) {
    values.push(value);
    sets.push(`${column} = $${values.length}`);
  }

  if (patch.referenceCode !== undefined) pushSet('reference_code', patch.referenceCode);
  if (patch.cargoRegime !== undefined) pushSet('cargo_regime', patch.cargoRegime);
  if (patch.operationClassification !== undefined) pushSet('operation_classification', patch.operationClassification);
  if (patch.freightOfferedAmount !== undefined) pushSet('freight_offered_amount', patch.freightOfferedAmount);
  if (patch.freightContractedAmount !== undefined) pushSet('freight_contracted_amount', patch.freightContractedAmount);
  if (patch.freightFloorAmount !== undefined) pushSet('freight_floor_amount', patch.freightFloorAmount);
  if (patch.tollAmount !== undefined) pushSet('toll_amount', patch.tollAmount);
  if (patch.vpoAmount !== undefined) pushSet('vpo_amount', patch.vpoAmount);
  if (patch.otherComponentsAmount !== undefined) pushSet('other_components_amount', patch.otherComponentsAmount);
  if (patch.totalContractValue !== undefined) pushSet('total_contract_value', patch.totalContractValue);
  if (patch.currency !== undefined) pushSet('currency', patch.currency);
  if (patch.paymentMethod !== undefined) pushSet('payment_method', patch.paymentMethod);
  if (patch.paymentTermDays !== undefined) pushSet('payment_term_days', patch.paymentTermDays);

  if (sets.length === 0) {
    const current = await execute<OperationRow>(
      'select * from transport_operations where id = $1 and integration_account_id = $2 and version = $3',
      [id, integrationAccountId, expectedVersion]
    );
    const row = mapOperationRow(current.rows[0]);
    if (!row) return operationNotFoundOrConflict(id, integrationAccountId, expectedVersion, client);
    return row;
  }

  // Trigger `trg_transport_operations_version` cuida do bump de version e updated_at.
  const result = await execute<OperationRow>(
    `update transport_operations
        set ${sets.join(', ')}
      where id = $1
        and integration_account_id = $2
        and version = $3
      returning *`,
    values
  );

  const row = mapOperationRow(result.rows[0]);
  if (!row) return operationNotFoundOrConflict(id, integrationAccountId, expectedVersion, client);
  return row;
}

/**
 * Compare-and-swap da máquina de estados: só aplica quando `status` ATUAL bate com `fromStatus` E
 * `version` bate com `expectedVersion` — 0 linhas afetadas vira 404 (fora da conta) ou 409
 * (status/version defasados), nunca aplica a transição "na marra".
 */
export async function transitionStatus(
  id: string,
  integrationAccountId: string,
  fromStatus: TransportOperationStatus,
  toStatus: TransportOperationStatus,
  expectedVersion: number,
  extra: { blockedReasonCode?: string | null; cancelledReason?: string | null } = {}
): Promise<TransportOperation> {
  const values: unknown[] = [id, integrationAccountId, fromStatus, expectedVersion];
  const sets: string[] = [];

  function pushSet(column: string, value: unknown) {
    values.push(value);
    sets.push(`${column} = $${values.length}`);
  }

  pushSet('status', toStatus);
  if (extra.blockedReasonCode !== undefined) pushSet('blocked_reason_code', extra.blockedReasonCode);
  if (extra.cancelledReason !== undefined) pushSet('cancelled_reason', extra.cancelledReason);

  // Trigger `trg_transport_operations_version` cuida do bump de version e updated_at.
  const result = await query<OperationRow>(
    `update transport_operations
        set ${sets.join(', ')}
      where id = $1
        and integration_account_id = $2
        and status = $3
        and version = $4
      returning *`,
    values
  );

  const row = mapOperationRow(result.rows[0]);
  if (!row) return operationNotFoundOrConflict(id, integrationAccountId, expectedVersion, null);
  return row;
}

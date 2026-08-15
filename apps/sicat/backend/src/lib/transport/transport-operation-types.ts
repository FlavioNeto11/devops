/**
 * Tipos e constantes do agregado `TransportOperation` (PR-A4, DL-103).
 *
 * Bounded context TRANSPORTE: agregado central do ciclo de vida de uma operação de transporte
 * (nunca `Manifest`, que é do bounded context ambiental). As constantes espelham 1:1 os CHECKs da
 * migration `024_transport_operations.sql` — mudou lá, muda aqui no mesmo PR (e vice-versa).
 *
 * `transport_operation_parties.role` reaproveita `PartyRole` (`transport-party-types.ts`) — é o
 * MESMO universo de papéis do cadastro-base (PR-A3), não um enum paralelo.
 */

import type { PartyRole } from './transport-party-types.js';
import type { TransportOperationStatus } from './transport-state-machine.js';

export const CARGO_REGIMES = ['lotacao', 'fracionada', 'unknown'] as const;
export type CargoRegime = (typeof CARGO_REGIMES)[number];

export const OPERATION_VEHICLE_POSITIONS = ['traction', 'towed_1', 'towed_2'] as const;
export type OperationVehiclePosition = (typeof OPERATION_VEHICLE_POSITIONS)[number];

export const OPERATION_ROUTE_SOURCES = ['manual', 'estimated'] as const;
export type OperationRouteSource = (typeof OPERATION_ROUTE_SOURCES)[number];

/** Papel do vínculo parte↔operação — mesmo enum de `PARTY_ROLES` (transport-party-types.ts). */
export type OperationPartyRole = PartyRole;

/** Papéis SINGLETON — no máximo um vínculo por operação (espelha `uq_troppart_operation_singleton_role`). */
export const SINGLETON_OPERATION_PARTY_ROLES: readonly OperationPartyRole[] = ['contractor', 'carrier'];

/** Linha de `transport_operations` já mapeada para camelCase. */
export interface TransportOperation {
  id: string;
  integrationAccountId: string;
  sessionContextId: string | null;
  referenceCode: string | null;
  status: TransportOperationStatus;
  cargoRegime: CargoRegime;
  operationClassification: string | null;
  freightOfferedAmount: number | null;
  freightContractedAmount: number | null;
  freightFloorAmount: number | null;
  tollAmount: number | null;
  vpoAmount: number | null;
  otherComponentsAmount: number | null;
  totalContractValue: number | null;
  currency: string;
  paymentMethod: string | null;
  paymentTermDays: number | null;
  blockedReasonCode: string | null;
  cancelledReason: string | null;
  correlationId: string;
  commandId: string | null;
  lastErrorCode: string | null;
  lastErrorDetail: Record<string, unknown> | null;
  version: number;
  createdAt: string;
  updatedAt: string;
}

/** Linha de `transport_operation_parties` — `partySnapshot` é o congelamento no momento do vínculo. */
export interface TransportOperationParty {
  id: string;
  operationId: string;
  partyId: string;
  role: OperationPartyRole;
  partySnapshot: Record<string, unknown>;
  createdAt: string;
}

/** Linha de `transport_operation_vehicles` — `vehicleSnapshot` é o congelamento no momento do vínculo. */
export interface TransportOperationVehicle {
  id: string;
  operationId: string;
  vehicleId: string;
  position: OperationVehiclePosition;
  vehicleSnapshot: Record<string, unknown>;
  createdAt: string;
}

/** Linha de `transport_operation_cargo`. */
export interface TransportOperationCargo {
  id: string;
  operationId: string;
  cargoType: string;
  cargoCode: string | null;
  description: string;
  weightKg: number | null;
  volumeM3: number | null;
  declaredValue: number | null;
  dangerousGoods: boolean;
  metadata: Record<string, unknown>;
  createdAt: string;
}

/** Linha de `transport_operation_routes` — 1 por operação na Fase A. */
export interface TransportOperationRoute {
  id: string;
  operationId: string;
  originMunicipality: string;
  originUf: string;
  originIbgeCode: string | null;
  destinationMunicipality: string;
  destinationUf: string;
  destinationIbgeCode: string | null;
  distanceKm: number | null;
  routeSource: OperationRouteSource;
  tollExpected: boolean | null;
  waypoints: unknown[];
  createdAt: string;
}

/** Agregado completo — o shape que `getOperationAggregateById` devolve. */
export interface TransportOperationAggregate {
  operation: TransportOperation;
  parties: TransportOperationParty[];
  vehicles: TransportOperationVehicle[];
  cargo: TransportOperationCargo[];
  route: TransportOperationRoute | null;
}

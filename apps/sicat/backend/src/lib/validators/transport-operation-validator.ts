/**
 * Validador declaratório do agregado `TransportOperation` (PR-A4, DL-103).
 *
 * Molde: `transport-party-validator.ts` — só validação, sem SQL. Códigos de erro estáveis, sempre
 * levantados como `AppError` (serializados em `application/problem+json` por
 * `src/middlewares/error-handler.ts`). UF reaproveita `validateUf` de `transport-party-validator.ts`
 * (mesmo código `TRANSPORT_PARTY_UF_INVALID` quando o formato é inválido — é o MESMO universo de 27
 * UFs, não um enum paralelo); os demais códigos são próprios do agregado.
 *
 * Códigos de erro (canônicos):
 *   - TRANSPORT_OPERATION_FIELD_REQUIRED       → campo obrigatório ausente/vazio
 *   - TRANSPORT_OPERATION_CARGO_REGIME_INVALID → cargoRegime fora do enum lotacao/fracionada/unknown
 *   - TRANSPORT_OPERATION_ROUTE_REQUIRED       → `route` ausente (obrigatório no draft mínimo)
 *   - TRANSPORT_OPERATION_ROUTE_INVALID        → `route.distanceKm` <= 0 ou `route.routeSource` fora do enum
 *   - TRANSPORT_OPERATION_AMOUNT_INVALID       → algum componente de frete/valor negativo
 *   - TRANSPORT_OPERATION_PAYMENT_TERM_INVALID → paymentTermDays fora de um inteiro >= 0
 *   - TRANSPORT_OPERATION_PARTY_ROLE_INVALID   → `parties[].role` fora do enum de papéis, ou item malformado
 *   - TRANSPORT_OPERATION_VEHICLE_POSITION_INVALID → `vehicles[].position` fora do enum traction/towed_1/towed_2
 *   - TRANSPORT_OPERATION_CARGO_INVALID        → item de `cargo[]` malformado (peso <= 0 quando informado, etc.)
 *   - TRANSPORT_STATUS_IS_COMMAND_DRIVEN       → PATCH tentou mudar `status` diretamente (422)
 *
 * Normalização (responsabilidade deste módulo, não do repositório): `origin/destinationUf` em
 * maiúsculas (via `validateUf`); strings vazias viram `null` nos campos opcionais.
 */

import { AppError } from '../problem.js';
import { PARTY_ROLES, type PartyRole } from '../transport/transport-party-types.js';
import { validateUf } from './transport-party-validator.js';
import {
  CARGO_REGIMES,
  OPERATION_ROUTE_SOURCES,
  OPERATION_VEHICLE_POSITIONS,
  type CargoRegime,
  type OperationRouteSource,
  type OperationVehiclePosition
} from '../transport/transport-operation-types.js';

function operationError(
  status: number,
  title: string,
  detail: string,
  code: string,
  context?: Record<string, unknown>
): AppError {
  return new AppError(status, title, detail, {
    code,
    ...(context ? { context } : {})
  });
}

function requireNonEmpty(field: string, value: unknown, code: string): string {
  if (typeof value !== 'string' || value.trim().length === 0) {
    throw operationError(400, 'Transport Operation Field Required', `${field} é obrigatório.`, code, { field });
  }
  return value.trim();
}

function toTrimmedStringOrNull(value: unknown): string | null {
  if (typeof value !== 'string') return null;
  const trimmed = value.trim();
  return trimmed.length === 0 ? null : trimmed;
}

/** UF obrigatória (diferente de `validateUf`, que aceita ausência) — usada pela rota da operação. */
function requireUf(field: string, value: unknown) {
  if (value === null || value === undefined || value === '') {
    throw operationError(400, 'Transport Operation Field Required', `${field} é obrigatório.`, 'TRANSPORT_OPERATION_FIELD_REQUIRED', { field });
  }
  // `validateUf` só devolve `null` para entrada vazia — já excluída acima — então aqui é sempre não-nulo.
  return validateUf(value)!;
}

function validateOptionalPositiveNumber(field: string, value: unknown, code: string): number | null {
  if (value === null || value === undefined || value === '') return null;
  const num = Number(value);
  if (!Number.isFinite(num) || num <= 0) {
    throw operationError(400, 'Transport Operation Field Invalid', `${field} inválido: esperado um número > 0 (recebido "${value}").`, code, { field, value });
  }
  return num;
}

function validateOptionalNonNegativeNumber(field: string, value: unknown, code: string): number | null {
  if (value === null || value === undefined || value === '') return null;
  const num = Number(value);
  if (!Number.isFinite(num) || num < 0) {
    throw operationError(400, 'Transport Operation Field Invalid', `${field} inválido: esperado um número >= 0 (recebido "${value}").`, code, { field, value });
  }
  return num;
}

// =============================================================================
// Cabeçalho — regime de carga, frete, prazo de pagamento
// =============================================================================

export function validateCargoRegime(value: unknown): CargoRegime {
  if (value === null || value === undefined || value === '') return 'unknown';
  if (!CARGO_REGIMES.includes(value as CargoRegime)) {
    throw operationError(
      400,
      'Transport Operation Cargo Regime Invalid',
      `cargoRegime inválido: esperado um de ${CARGO_REGIMES.join(', ')} (recebido "${value}").`,
      'TRANSPORT_OPERATION_CARGO_REGIME_INVALID',
      { value, allowed: CARGO_REGIMES }
    );
  }
  return value as CargoRegime;
}

/** Valida qualquer componente monetário do frete decomposto (offered/contracted/floor/toll/vpo/other/total). */
export function validateAmount(field: string, value: unknown): number | null {
  return validateOptionalNonNegativeNumber(field, value, 'TRANSPORT_OPERATION_AMOUNT_INVALID');
}

export function validatePaymentTermDays(value: unknown): number | null {
  if (value === null || value === undefined || value === '') return null;
  const num = Number(value);
  if (!Number.isInteger(num) || num < 0) {
    throw operationError(
      400,
      'Transport Operation Payment Term Invalid',
      `paymentTermDays inválido: esperado um inteiro >= 0 (recebido "${value}").`,
      'TRANSPORT_OPERATION_PAYMENT_TERM_INVALID',
      { value }
    );
  }
  return num;
}

function validateRouteSource(value: unknown): OperationRouteSource {
  if (value === null || value === undefined || value === '') return 'manual';
  if (!OPERATION_ROUTE_SOURCES.includes(value as OperationRouteSource)) {
    throw operationError(
      400,
      'Transport Operation Route Invalid',
      `route.routeSource inválido: esperado um de ${OPERATION_ROUTE_SOURCES.join(', ')} (recebido "${value}").`,
      'TRANSPORT_OPERATION_ROUTE_INVALID',
      { value, allowed: OPERATION_ROUTE_SOURCES }
    );
  }
  return value as OperationRouteSource;
}

// =============================================================================
// Rota — origem/destino (município + UF obrigatórios no draft mínimo)
// =============================================================================

export type ValidatedOperationRoute = {
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
};

/** `route` é obrigatória no draft mínimo (origem/destino: município + UF) — 400 se ausente. */
export function validateOperationRoute(value: unknown): ValidatedOperationRoute {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    throw operationError(
      400,
      'Transport Operation Route Required',
      'route é obrigatória (origem e destino: município + UF) — mínimo para criar a operação.',
      'TRANSPORT_OPERATION_ROUTE_REQUIRED'
    );
  }
  const route = value as Record<string, unknown>;

  const originMunicipality = requireNonEmpty('route.originMunicipality', route.originMunicipality, 'TRANSPORT_OPERATION_FIELD_REQUIRED');
  const originUf = requireUf('route.originUf', route.originUf);
  const destinationMunicipality = requireNonEmpty('route.destinationMunicipality', route.destinationMunicipality, 'TRANSPORT_OPERATION_FIELD_REQUIRED');
  const destinationUf = requireUf('route.destinationUf', route.destinationUf);

  return {
    originMunicipality,
    originUf,
    originIbgeCode: toTrimmedStringOrNull(route.originIbgeCode),
    destinationMunicipality,
    destinationUf,
    destinationIbgeCode: toTrimmedStringOrNull(route.destinationIbgeCode),
    distanceKm: validateOptionalPositiveNumber('route.distanceKm', route.distanceKm, 'TRANSPORT_OPERATION_ROUTE_INVALID'),
    routeSource: validateRouteSource(route.routeSource),
    tollExpected: route.tollExpected === undefined || route.tollExpected === null ? null : Boolean(route.tollExpected),
    waypoints: Array.isArray(route.waypoints) ? route.waypoints : []
  };
}

// =============================================================================
// Partes / veículos / carga vinculados na criação (todos opcionais na Fase A)
// =============================================================================

export type ValidatedOperationParty = { partyId: string; role: PartyRole };

export function validateOperationParties(value: unknown): ValidatedOperationParty[] {
  if (value === undefined || value === null) return [];
  if (!Array.isArray(value)) {
    throw operationError(400, 'Transport Operation Party Invalid', 'parties deve ser um array.', 'TRANSPORT_OPERATION_PARTY_ROLE_INVALID', { value });
  }
  return value.map((item, index) => {
    if (!item || typeof item !== 'object' || Array.isArray(item)) {
      throw operationError(
        400,
        'Transport Operation Party Invalid',
        `parties[${index}] deve ser um objeto { partyId, role }.`,
        'TRANSPORT_OPERATION_PARTY_ROLE_INVALID',
        { index }
      );
    }
    const record = item as Record<string, unknown>;
    const partyId = requireNonEmpty(`parties[${index}].partyId`, record.partyId, 'TRANSPORT_OPERATION_FIELD_REQUIRED');
    const role = record.role;
    if (!PARTY_ROLES.includes(role as PartyRole)) {
      throw operationError(
        400,
        'Transport Operation Party Role Invalid',
        `parties[${index}].role inválido: esperado um de ${PARTY_ROLES.join(', ')} (recebido "${role}").`,
        'TRANSPORT_OPERATION_PARTY_ROLE_INVALID',
        { role, allowed: PARTY_ROLES }
      );
    }
    return { partyId, role: role as PartyRole };
  });
}

export type ValidatedOperationVehicle = { vehicleId: string; position: OperationVehiclePosition };

export function validateOperationVehicles(value: unknown): ValidatedOperationVehicle[] {
  if (value === undefined || value === null) return [];
  if (!Array.isArray(value)) {
    throw operationError(400, 'Transport Operation Vehicle Invalid', 'vehicles deve ser um array.', 'TRANSPORT_OPERATION_VEHICLE_POSITION_INVALID', { value });
  }
  return value.map((item, index) => {
    if (!item || typeof item !== 'object' || Array.isArray(item)) {
      throw operationError(
        400,
        'Transport Operation Vehicle Invalid',
        `vehicles[${index}] deve ser um objeto { vehicleId, position }.`,
        'TRANSPORT_OPERATION_VEHICLE_POSITION_INVALID',
        { index }
      );
    }
    const record = item as Record<string, unknown>;
    const vehicleId = requireNonEmpty(`vehicles[${index}].vehicleId`, record.vehicleId, 'TRANSPORT_OPERATION_FIELD_REQUIRED');
    const position = record.position === undefined || record.position === null || record.position === ''
      ? 'traction'
      : record.position;
    if (!OPERATION_VEHICLE_POSITIONS.includes(position as OperationVehiclePosition)) {
      throw operationError(
        400,
        'Transport Operation Vehicle Position Invalid',
        `vehicles[${index}].position inválido: esperado um de ${OPERATION_VEHICLE_POSITIONS.join(', ')} (recebido "${position}").`,
        'TRANSPORT_OPERATION_VEHICLE_POSITION_INVALID',
        { position, allowed: OPERATION_VEHICLE_POSITIONS }
      );
    }
    return { vehicleId, position: position as OperationVehiclePosition };
  });
}

export type ValidatedOperationCargo = {
  cargoType: string;
  cargoCode: string | null;
  description: string;
  weightKg: number | null;
  volumeM3: number | null;
  declaredValue: number | null;
  dangerousGoods: boolean;
  metadata: Record<string, unknown>;
};

export function validateOperationCargoList(value: unknown): ValidatedOperationCargo[] {
  if (value === undefined || value === null) return [];
  if (!Array.isArray(value)) {
    throw operationError(400, 'Transport Operation Cargo Invalid', 'cargo deve ser um array.', 'TRANSPORT_OPERATION_CARGO_INVALID', { value });
  }
  return value.map((item, index) => {
    if (!item || typeof item !== 'object' || Array.isArray(item)) {
      throw operationError(400, 'Transport Operation Cargo Invalid', `cargo[${index}] deve ser um objeto.`, 'TRANSPORT_OPERATION_CARGO_INVALID', { index });
    }
    const record = item as Record<string, unknown>;
    const cargoType = requireNonEmpty(`cargo[${index}].cargoType`, record.cargoType, 'TRANSPORT_OPERATION_FIELD_REQUIRED');
    const metadata = record.metadata && typeof record.metadata === 'object' && !Array.isArray(record.metadata)
      ? (record.metadata as Record<string, unknown>)
      : {};

    return {
      cargoType,
      cargoCode: toTrimmedStringOrNull(record.cargoCode),
      description: typeof record.description === 'string' ? record.description : '',
      weightKg: validateOptionalPositiveNumber(`cargo[${index}].weightKg`, record.weightKg, 'TRANSPORT_OPERATION_CARGO_INVALID'),
      volumeM3: validateOptionalNonNegativeNumber(`cargo[${index}].volumeM3`, record.volumeM3, 'TRANSPORT_OPERATION_CARGO_INVALID'),
      declaredValue: validateOptionalNonNegativeNumber(`cargo[${index}].declaredValue`, record.declaredValue, 'TRANSPORT_OPERATION_CARGO_INVALID'),
      dangerousGoods: Boolean(record.dangerousGoods),
      metadata
    };
  });
}

// =============================================================================
// PATCH — `status` é COMANDO, não dado (rejeitado antes de qualquer outra validação)
// =============================================================================

/**
 * `status` só muda por comando (`submeter-validacao`/`cancelar`/...), nunca por PATCH direto —
 * 422 `TRANSPORT_STATUS_IS_COMMAND_DRIVEN`. Checado ANTES de qualquer outra validação do PATCH.
 */
export function assertNoStatusInUpdatePayload(body: Record<string, unknown>): void {
  if (Object.prototype.hasOwnProperty.call(body, 'status')) {
    throw operationError(
      422,
      'Unprocessable Entity',
      'status não pode ser alterado via PATCH — use os endpoints de transição (submeter-validacao, cancelar).',
      'TRANSPORT_STATUS_IS_COMMAND_DRIVEN'
    );
  }
}

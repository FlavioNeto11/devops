/**
 * Validador declaratório do cadastro-base de transportadores/veículos (PR-A3, DL-103).
 *
 * Molde: `dmr-validator.ts` — só validação, sem SQL. Códigos de erro estáveis (para que
 * frontend/observabilidade possam reagir), sempre levantados como `AppError` (serializados em
 * `application/problem+json` por `src/middlewares/error-handler.ts`).
 *
 * Códigos de erro (canônicos):
 *   - TRANSPORT_PARTY_DOCUMENT_INVALID     → CNPJ/CPF com dígito verificador inválido
 *   - TRANSPORT_PARTY_UF_INVALID           → UF fora das 27 unidades federativas
 *   - TRANSPORT_PARTY_RNTRC_CATEGORY_INVALID → rntrcCategory fora do enum TAC/ETC/CTC
 *   - TRANSPORT_PARTY_RNTRC_STATUS_INVALID → rntrcStatus fora do enum declarado
 *   - TRANSPORT_PARTY_ROLE_INVALID         → role fora do enum de papéis permitidos
 *   - TRANSPORT_PARTY_FIELD_REQUIRED       → campo obrigatório ausente/vazio
 *   - TRANSPORT_VEHICLE_PLATE_INVALID      → placa fora dos formatos antigo/Mercosul
 *   - TRANSPORT_VEHICLE_TYPE_INVALID       → vehicleType fora do enum
 *   - TRANSPORT_VEHICLE_AXLES_INVALID      → axlesCount fora de 1..12
 *   - TRANSPORT_VEHICLE_LINK_TYPE_INVALID  → linkType fora do enum owned/leased/aggregated/rntrc_fleet
 *   - TRANSPORT_VEHICLE_LINK_PERIOD_INVALID → validUntil anterior a validFrom
 *   - TRANSPORT_VEHICLE_FIELD_REQUIRED     → campo obrigatório ausente/vazio
 *
 * Normalização (responsabilidade deste módulo, não do repositório):
 *   - `documentNumber` → só dígitos.
 *   - `plate` → maiúsculas, sem hífen/espaço.
 */

import { AppError } from '../problem.js';
import {
  BRAZILIAN_STATE_CODES,
  PARTY_ROLES,
  RNTRC_CATEGORIES,
  RNTRC_STATUSES,
  VEHICLE_LINK_TYPES,
  VEHICLE_TYPES,
  type BrazilianStateCode,
  type PartyDocumentType,
  type PartyRole,
  type RntrcCategory,
  type RntrcStatus,
  type VehicleLinkType,
  type VehicleType
} from '../transport/transport-party-types.js';

function transportError(
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
    throw transportError(
      400,
      'Transport Field Required',
      `${field} é obrigatório.`,
      code,
      { field }
    );
  }
  return value.trim();
}

// =============================================================================
// Documento (CNPJ/CPF) — algoritmo completo de dígito verificador.
// =============================================================================

/** Remove tudo que não é dígito. */
export function onlyDigits(value: string): string {
  return String(value ?? '').replace(/\D+/g, '');
}

function isAllSameDigit(digits: string): boolean {
  return /^(\d)\1+$/.test(digits);
}

function isValidCpf(digits: string): boolean {
  if (digits.length !== 11 || isAllSameDigit(digits)) return false;
  const nums = digits.split('').map(Number);

  let sum = 0;
  for (let i = 0; i < 9; i += 1) sum += (nums[i] ?? 0) * (10 - i);
  let check1 = (sum * 10) % 11;
  if (check1 === 10) check1 = 0;
  if (check1 !== nums[9]) return false;

  sum = 0;
  for (let i = 0; i < 10; i += 1) sum += (nums[i] ?? 0) * (11 - i);
  let check2 = (sum * 10) % 11;
  if (check2 === 10) check2 = 0;
  return check2 === nums[10];
}

function cnpjCheckDigit(base: number[]): number {
  const weights = base.length === 12
    ? [5, 4, 3, 2, 9, 8, 7, 6, 5, 4, 3, 2]
    : [6, 5, 4, 3, 2, 9, 8, 7, 6, 5, 4, 3, 2];
  let sum = 0;
  for (let i = 0; i < base.length; i += 1) sum += (base[i] ?? 0) * (weights[i] ?? 0);
  const mod = sum % 11;
  return mod < 2 ? 0 : 11 - mod;
}

function isValidCnpj(digits: string): boolean {
  if (digits.length !== 14 || isAllSameDigit(digits)) return false;
  const nums = digits.split('').map(Number);

  const d1 = cnpjCheckDigit(nums.slice(0, 12));
  if (d1 !== nums[12]) return false;

  const d2 = cnpjCheckDigit(nums.slice(0, 13));
  return d2 === nums[13];
}

/**
 * Valida `documentType`/`documentNumber` (dígito verificador completo de CNPJ/CPF).
 * Retorna `documentNumber` normalizado (só dígitos).
 */
export function validatePartyDocument(
  documentType: string,
  documentNumber: string
): { documentType: PartyDocumentType; documentNumber: string } {
  if (documentType !== 'CNPJ' && documentType !== 'CPF') {
    throw transportError(
      400,
      'Transport Party Document Invalid',
      `documentType inválido: esperado CNPJ ou CPF (recebido "${documentType}").`,
      'TRANSPORT_PARTY_DOCUMENT_INVALID',
      { documentType }
    );
  }

  const digits = onlyDigits(requireNonEmpty('documentNumber', documentNumber, 'TRANSPORT_PARTY_FIELD_REQUIRED'));
  const valid = documentType === 'CNPJ' ? isValidCnpj(digits) : isValidCpf(digits);
  if (!valid) {
    throw transportError(
      400,
      'Transport Party Document Invalid',
      `documentNumber com dígito verificador inválido para ${documentType}.`,
      'TRANSPORT_PARTY_DOCUMENT_INVALID',
      { documentType }
    );
  }

  return { documentType, documentNumber: digits };
}

// =============================================================================
// UF / RNTRC / roles
// =============================================================================

export function validateUf(uf: unknown): BrazilianStateCode | null {
  if (uf === null || uf === undefined || uf === '') return null;
  const normalized = String(uf).trim().toUpperCase();
  if (!BRAZILIAN_STATE_CODES.includes(normalized as BrazilianStateCode)) {
    throw transportError(
      400,
      'Transport Party UF Invalid',
      `uf inválida: esperada uma das 27 unidades federativas (recebido "${uf}").`,
      'TRANSPORT_PARTY_UF_INVALID',
      { uf, allowed: BRAZILIAN_STATE_CODES }
    );
  }
  return normalized as BrazilianStateCode;
}

export function validateRntrcCategory(value: unknown): RntrcCategory | null {
  if (value === null || value === undefined || value === '') return null;
  if (!RNTRC_CATEGORIES.includes(value as RntrcCategory)) {
    throw transportError(
      400,
      'Transport Party RNTRC Category Invalid',
      `rntrcCategory inválida: esperado um de ${RNTRC_CATEGORIES.join(', ')} (recebido "${value}").`,
      'TRANSPORT_PARTY_RNTRC_CATEGORY_INVALID',
      { value, allowed: RNTRC_CATEGORIES }
    );
  }
  return value as RntrcCategory;
}

export function validateRntrcStatus(value: unknown): RntrcStatus {
  if (value === null || value === undefined || value === '') return 'unknown';
  if (!RNTRC_STATUSES.includes(value as RntrcStatus)) {
    throw transportError(
      400,
      'Transport Party RNTRC Status Invalid',
      `rntrcStatus inválido: esperado um de ${RNTRC_STATUSES.join(', ')} (recebido "${value}").`,
      'TRANSPORT_PARTY_RNTRC_STATUS_INVALID',
      { value, allowed: RNTRC_STATUSES }
    );
  }
  return value as RntrcStatus;
}

/** Valida a lista de papéis (`roles[]`), sem duplicatas. Lista vazia é válida (parte sem papel ainda). */
export function validatePartyRoles(roles: unknown): PartyRole[] {
  if (roles === undefined || roles === null) return [];
  if (!Array.isArray(roles)) {
    throw transportError(
      400,
      'Transport Party Role Invalid',
      'roles deve ser um array de strings.',
      'TRANSPORT_PARTY_ROLE_INVALID',
      { value: roles }
    );
  }
  const unique = new Set<PartyRole>();
  for (const role of roles) {
    if (!PARTY_ROLES.includes(role as PartyRole)) {
      throw transportError(
        400,
        'Transport Party Role Invalid',
        `role inválido: esperado um de ${PARTY_ROLES.join(', ')} (recebido "${role}").`,
        'TRANSPORT_PARTY_ROLE_INVALID',
        { role, allowed: PARTY_ROLES }
      );
    }
    unique.add(role as PartyRole);
  }
  return [...unique];
}

// =============================================================================
// Placa (formato antigo AAA9999 e Mercosul AAA9A99)
// =============================================================================

const PLATE_OLD_REGEX = /^[A-Z]{3}[0-9]{4}$/;
const PLATE_MERCOSUL_REGEX = /^[A-Z]{3}[0-9][A-Z][0-9]{2}$/;

/** Normaliza (maiúsculas, sem hífen/espaço) e valida a placa nos dois formatos vigentes. */
export function validatePlate(value: unknown): string {
  const raw = requireNonEmpty('plate', typeof value === 'string' ? value : '', 'TRANSPORT_VEHICLE_FIELD_REQUIRED');
  const normalized = raw.toUpperCase().replace(/[\s-]+/g, '');

  if (!PLATE_OLD_REGEX.test(normalized) && !PLATE_MERCOSUL_REGEX.test(normalized)) {
    throw transportError(
      400,
      'Transport Vehicle Plate Invalid',
      `plate inválida: esperado o formato antigo (AAA9999) ou Mercosul (AAA9A99) (recebido "${value}").`,
      'TRANSPORT_VEHICLE_PLATE_INVALID',
      { value }
    );
  }
  return normalized;
}

export function validateVehicleType(value: unknown): VehicleType {
  if (!VEHICLE_TYPES.includes(value as VehicleType)) {
    throw transportError(
      400,
      'Transport Vehicle Type Invalid',
      `vehicleType inválido: esperado um de ${VEHICLE_TYPES.join(', ')} (recebido "${value}").`,
      'TRANSPORT_VEHICLE_TYPE_INVALID',
      { value, allowed: VEHICLE_TYPES }
    );
  }
  return value as VehicleType;
}

export function validateAxlesCount(value: unknown): number | null {
  if (value === null || value === undefined || value === '') return null;
  const num = Number(value);
  if (!Number.isInteger(num) || num < 1 || num > 12) {
    throw transportError(
      400,
      'Transport Vehicle Axles Invalid',
      `axlesCount inválido: esperado um inteiro entre 1 e 12 (recebido "${value}").`,
      'TRANSPORT_VEHICLE_AXLES_INVALID',
      { value }
    );
  }
  return num;
}

export function validateVehicleLinkType(value: unknown): VehicleLinkType {
  if (!VEHICLE_LINK_TYPES.includes(value as VehicleLinkType)) {
    throw transportError(
      400,
      'Transport Vehicle Link Type Invalid',
      `linkType inválido: esperado um de ${VEHICLE_LINK_TYPES.join(', ')} (recebido "${value}").`,
      'TRANSPORT_VEHICLE_LINK_TYPE_INVALID',
      { value, allowed: VEHICLE_LINK_TYPES }
    );
  }
  return value as VehicleLinkType;
}

const DATE_REGEX = /^\d{4}-\d{2}-\d{2}$/;

function validateOptionalDate(field: string, value: unknown, code: string): string | null {
  if (value === null || value === undefined || value === '') return null;
  if (typeof value !== 'string' || !DATE_REGEX.test(value)) {
    throw transportError(
      400,
      'Transport Vehicle Link Period Invalid',
      `${field} inválido: esperado formato YYYY-MM-DD (recebido "${value}").`,
      code,
      { field, value }
    );
  }
  return value;
}

/** Valida `validFrom`/`validUntil` do vínculo veículo↔parte (formato + ordem). */
export function validateVehicleLinkPeriod(
  validFrom: unknown,
  validUntil: unknown
): { validFrom: string | null; validUntil: string | null } {
  const from = validateOptionalDate('validFrom', validFrom, 'TRANSPORT_VEHICLE_LINK_PERIOD_INVALID');
  const until = validateOptionalDate('validUntil', validUntil, 'TRANSPORT_VEHICLE_LINK_PERIOD_INVALID');

  if (from && until && until < from) {
    throw transportError(
      400,
      'Transport Vehicle Link Period Invalid',
      `validUntil (${until}) não pode ser anterior a validFrom (${from}).`,
      'TRANSPORT_VEHICLE_LINK_PERIOD_INVALID',
      { validFrom: from, validUntil: until }
    );
  }

  return { validFrom: from, validUntil: until };
}

export { requireNonEmpty as requireTransportField };

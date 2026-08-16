/**
 * Tipos, constantes e validação declaratória de motoristas (PR I1 do plano "Módulo
 * Transportadora", REQ-SICAT-0033).
 *
 * As constantes espelham 1:1 os CHECKs da migration `034_transport_drivers.sql` — mudou lá, muda
 * aqui no mesmo PR (e vice-versa). Validadores no molde `transport-party-validator.ts`: só
 * validação, sem SQL, códigos de erro estáveis levantados como `AppError` (serializados em
 * `application/problem+json` por `error-handler.ts`). Tipos e validador vivem JUNTOS aqui porque o
 * domínio é pequeno e as regras são espelho direto dos enums — separar em dois arquivos duplicaria
 * os imports sem ganhar fronteira.
 *
 * CNH é DECLARADA pelo operador — sem verificação externa DETRAN/SENATRAN nesta fase; por isso o
 * número só é NORMALIZADO (só dígitos), sem dígito verificador: o algoritmo do espelho da CNH não
 * é público/estável como o de CPF/CNPJ, e rejeitar por heurística barraria cadastro legítimo.
 *
 * Códigos de erro (canônicos):
 *   - TRANSPORT_DRIVER_FIELD_REQUIRED       → campo obrigatório ausente/vazio
 *   - TRANSPORT_DRIVER_CNH_NUMBER_INVALID   → número de CNH não numérico após normalização
 *   - TRANSPORT_DRIVER_CNH_CATEGORY_INVALID → categoria fora do enum A..E/AB..AE
 *   - TRANSPORT_DRIVER_CNH_VALIDITY_INVALID → validade ausente ou fora de YYYY-MM-DD
 *   - TRANSPORT_DRIVER_CNH_UF_INVALID       → UF emissora fora das 27 unidades federativas
 *   - TRANSPORT_DRIVER_STATUS_INVALID       → status fora de active/inactive
 *   - TRANSPORT_DRIVER_LINK_TYPE_INVALID    → linkType fora de fleet/aggregated
 *   - TRANSPORT_DRIVER_LINK_PERIOD_INVALID  → vigência malformada ou validUntil < validFrom
 */

import { AppError } from '../problem.js';
import { BRAZILIAN_STATE_CODES, type BrazilianStateCode } from './transport-party-types.js';

// =============================================================================
// Constantes-espelho da migration 034
// =============================================================================

export const CNH_CATEGORIES = ['A', 'B', 'C', 'D', 'E', 'AB', 'AC', 'AD', 'AE'] as const;
export type CnhCategory = (typeof CNH_CATEGORIES)[number];

export const DRIVER_STATUSES = ['active', 'inactive'] as const;
export type DriverStatus = (typeof DRIVER_STATUSES)[number];

export const DRIVER_EVIDENCE_SOURCES = ['manual', 'mock'] as const;
export type DriverEvidenceSource = (typeof DRIVER_EVIDENCE_SOURCES)[number];

export const DRIVER_CARRIER_LINK_TYPES = ['fleet', 'aggregated'] as const;
export type DriverCarrierLinkType = (typeof DRIVER_CARRIER_LINK_TYPES)[number];

export const DRIVER_CARRIER_LINK_STATUSES = ['active', 'ended'] as const;
export type DriverCarrierLinkStatus = (typeof DRIVER_CARRIER_LINK_STATUSES)[number];

/** Linha de `transport_drivers` já mapeada para camelCase. */
export interface TransportDriver {
  id: string;
  integrationAccountId: string;
  partyId: string;
  cnhNumber: string;
  cnhCategory: CnhCategory;
  cnhValidUntil: string;
  cnhUf: BrazilianStateCode | null;
  status: DriverStatus;
  evidence: Record<string, unknown>;
  evidenceSource: DriverEvidenceSource;
  correlationId: string;
  version: number;
  createdAt: string;
  updatedAt: string;
}

/** Linha de `transport_driver_carrier_links` já mapeada para camelCase. */
export interface TransportDriverCarrierLink {
  id: string;
  integrationAccountId: string;
  driverId: string;
  carrierPartyId: string;
  linkType: DriverCarrierLinkType;
  validFrom: string;
  validUntil: string | null;
  status: DriverCarrierLinkStatus;
  correlationId: string;
  version: number;
  createdAt: string;
  updatedAt: string;
}

// =============================================================================
// Validação declaratória
// =============================================================================

function driverError(
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

/**
 * Normaliza (remove espaço/ponto/hífen) e valida o número da CNH: obrigatório, só dígitos após a
 * normalização. Sem dígito verificador nem tamanho fixo — ver cabeçalho do módulo.
 */
export function validateCnhNumber(value: unknown): string {
  if (typeof value !== 'string' || value.trim().length === 0) {
    throw driverError(
      400,
      'Transport Driver Field Required',
      'cnhNumber é obrigatório.',
      'TRANSPORT_DRIVER_FIELD_REQUIRED',
      { field: 'cnhNumber' }
    );
  }

  const normalized = value.replace(/[\s.-]+/g, '');
  if (!/^[0-9]{1,20}$/.test(normalized)) {
    throw driverError(
      400,
      'Transport Driver CNH Number Invalid',
      `cnhNumber inválido: esperado apenas dígitos após a normalização (recebido "${value}").`,
      'TRANSPORT_DRIVER_CNH_NUMBER_INVALID',
      { value }
    );
  }
  return normalized;
}

export function validateCnhCategory(value: unknown): CnhCategory {
  if (!CNH_CATEGORIES.includes(value as CnhCategory)) {
    throw driverError(
      400,
      'Transport Driver CNH Category Invalid',
      `cnhCategory inválida: esperado um de ${CNH_CATEGORIES.join(', ')} (recebido "${value}").`,
      'TRANSPORT_DRIVER_CNH_CATEGORY_INVALID',
      { value, allowed: CNH_CATEGORIES }
    );
  }
  return value as CnhCategory;
}

const DATE_REGEX = /^\d{4}-\d{2}-\d{2}$/;

/**
 * Validade da CNH: obrigatória, formato YYYY-MM-DD. CNH VENCIDA é aceita de propósito — o cadastro
 * é declarativo, e é a validade registrada que permite às fases seguintes (GR/alertas) acusarem o
 * vencimento; rejeitar aqui esconderia o fato.
 */
export function validateCnhValidUntil(value: unknown): string {
  if (typeof value !== 'string' || !DATE_REGEX.test(value)) {
    throw driverError(
      400,
      'Transport Driver CNH Validity Invalid',
      `cnhValidUntil é obrigatório no formato YYYY-MM-DD (recebido "${value}").`,
      'TRANSPORT_DRIVER_CNH_VALIDITY_INVALID',
      { value }
    );
  }
  return value;
}

export function validateCnhUf(value: unknown): BrazilianStateCode | null {
  if (value === null || value === undefined || value === '') return null;
  const normalized = String(value).trim().toUpperCase();
  if (!BRAZILIAN_STATE_CODES.includes(normalized as BrazilianStateCode)) {
    throw driverError(
      400,
      'Transport Driver CNH UF Invalid',
      `cnhUf inválida: esperada uma das 27 unidades federativas (recebido "${value}").`,
      'TRANSPORT_DRIVER_CNH_UF_INVALID',
      { value, allowed: BRAZILIAN_STATE_CODES }
    );
  }
  return normalized as BrazilianStateCode;
}

export function validateDriverStatus(value: unknown): DriverStatus {
  if (value === null || value === undefined || value === '') return 'active';
  if (!DRIVER_STATUSES.includes(value as DriverStatus)) {
    throw driverError(
      400,
      'Transport Driver Status Invalid',
      `status inválido: esperado um de ${DRIVER_STATUSES.join(', ')} (recebido "${value}").`,
      'TRANSPORT_DRIVER_STATUS_INVALID',
      { value, allowed: DRIVER_STATUSES }
    );
  }
  return value as DriverStatus;
}

export function validateDriverLinkType(value: unknown): DriverCarrierLinkType {
  if (!DRIVER_CARRIER_LINK_TYPES.includes(value as DriverCarrierLinkType)) {
    throw driverError(
      400,
      'Transport Driver Link Type Invalid',
      `linkType inválido: esperado um de ${DRIVER_CARRIER_LINK_TYPES.join(', ')} (recebido "${value}").`,
      'TRANSPORT_DRIVER_LINK_TYPE_INVALID',
      { value, allowed: DRIVER_CARRIER_LINK_TYPES }
    );
  }
  return value as DriverCarrierLinkType;
}

/**
 * Vigência do vínculo motorista↔transportador: `validFrom` OBRIGATÓRIO (diferente do vínculo de
 * veículo, onde é opcional — aqui a vigência é a base da regra "no máximo 1 vigente por par+tipo"
 * e da UNIQUE da migration 034), `validUntil` opcional e nunca anterior ao início.
 */
export function validateDriverLinkPeriod(
  validFrom: unknown,
  validUntil: unknown
): { validFrom: string; validUntil: string | null } {
  if (typeof validFrom !== 'string' || !DATE_REGEX.test(validFrom)) {
    throw driverError(
      400,
      'Transport Driver Link Period Invalid',
      `validFrom é obrigatório no formato YYYY-MM-DD (recebido "${validFrom}").`,
      'TRANSPORT_DRIVER_LINK_PERIOD_INVALID',
      { field: 'validFrom', value: validFrom }
    );
  }

  let until: string | null = null;
  if (validUntil !== null && validUntil !== undefined && validUntil !== '') {
    if (typeof validUntil !== 'string' || !DATE_REGEX.test(validUntil)) {
      throw driverError(
        400,
        'Transport Driver Link Period Invalid',
        `validUntil inválido: esperado formato YYYY-MM-DD (recebido "${validUntil}").`,
        'TRANSPORT_DRIVER_LINK_PERIOD_INVALID',
        { field: 'validUntil', value: validUntil }
      );
    }
    until = validUntil;
  }

  if (until && until < validFrom) {
    throw driverError(
      400,
      'Transport Driver Link Period Invalid',
      `validUntil (${until}) não pode ser anterior a validFrom (${validFrom}).`,
      'TRANSPORT_DRIVER_LINK_PERIOD_INVALID',
      { validFrom, validUntil: until }
    );
  }

  return { validFrom, validUntil: until };
}

/**
 * LGPD (molde `transport-insurance-service.ts#sanitizeEvidence`): `evidence` nunca aceita o body
 * inteiro — só `notes` e `documentRef`, truncados. Motorista é pessoa física: qualquer campo livre
 * extra aqui viraria repositório de dado pessoal sem finalidade declarada.
 */
export function sanitizeDriverEvidence(value: unknown): Record<string, unknown> {
  const evidence: Record<string, unknown> = {};
  if (!value || typeof value !== 'object' || Array.isArray(value)) return evidence;

  const source = value as Record<string, unknown>;
  const notes = typeof source.notes === 'string' ? source.notes.trim() : '';
  if (notes) evidence.notes = notes.slice(0, 500);
  const documentRef = typeof source.documentRef === 'string' ? source.documentRef.trim() : '';
  if (documentRef) evidence.documentRef = documentRef.slice(0, 200);
  return evidence;
}

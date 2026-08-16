/**
 * Service de motoristas e do vínculo motorista↔transportador (PR I1, REQ-SICAT-0033).
 *
 * Fino (molde `transport-party-service.ts`): validação declaratória
 * (`transport-driver-types.ts`) → resolução de `integrationAccountId` explícita (body no
 * POST/PATCH, query no GET) → repositório → mapeamento para o shape do CONTRATO
 * (`TransporteMotorista*` do OpenAPI, camelCase, sem `correlationId`).
 *
 * Invariantes de negócio deste service (não do schema — ver migration 034):
 * - Motorista é extensão 1:1 de uma parte PF: parte tem de existir NA CONTA e ser CPF. O papel
 *   `driver` que faltar é ADICIONADO aqui (via `insertPartyRoles`, o mecanismo existente de
 *   papéis) — cadastrar o motorista É a declaração de que a parte exerce o papel; recusar por
 *   falta do papel só criaria um passo burocrático a mais.
 * - No máximo UM vínculo VIGENTE por par driver×carrier×tipo: vigência é temporal (depende da
 *   data de referência), então a checagem é aqui (`findCurrentDriverCarrierLink`), não numa
 *   UNIQUE — a constraint da migration só barra o mesmo `valid_from` repetido.
 * - Encerrar vínculo é UPDATE de vigência (`status: ended` + `validUntil`), nunca delete — o
 *   histórico de quem dirigiu para quem é insumo da GR (fases seguintes).
 *
 * Idempotência nos POSTs (molde `createTransportOperation`): `Idempotency-Key` opcional; replay
 * com a mesma chave devolve a MESMA resposta sem criar registro novo.
 */

import { withTransaction } from '../db/pool.js';
import { AppError } from '../lib/problem.js';
import { createPrefixedId } from '../lib/ids.js';
import {
  getDriverById,
  getDriverCarrierLinkById,
  findCurrentDriverCarrierLink,
  insertDriver,
  insertDriverCarrierLink,
  listDriverCarrierLinksByDriver,
  listDrivers,
  updateDriverById,
  updateDriverCarrierLinkById,
  type DriverListFilters,
  type DriverUpdatePatch,
  type TransportDriverWithParty
} from '../repositories/transport-driver-repo.js';
import { getPartyById, insertPartyRoles, listPartyRoles } from '../repositories/transport-party-repo.js';
import {
  sanitizeDriverEvidence,
  validateCnhCategory,
  validateCnhNumber,
  validateCnhUf,
  validateCnhValidUntil,
  validateDriverLinkPeriod,
  validateDriverLinkType,
  validateDriverStatus
} from '../lib/transport/transport-driver-types.js';
import type { TransportDriverCarrierLink } from '../lib/transport/transport-driver-types.js';
import { getIdempotentResponse, rememberIdempotentResponse } from './idempotency-service.js';

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

function requireNonEmptyString(value: unknown, detail: string): string {
  const normalized = toTrimmedString(value);
  if (!normalized) {
    throw new AppError(400, 'Bad Request', detail, { code: 'TRANSPORT_DRIVER_FIELD_REQUIRED' });
  }
  return normalized;
}

function requireIntegrationAccountId(source: LooseRecord): string {
  return requireNonEmptyString(source.integrationAccountId, 'integrationAccountId é obrigatório.');
}

function requireVersion(source: LooseRecord): number {
  const raw = source.version;
  const num = Number(raw);
  if (!Number.isFinite(num) || !Number.isInteger(num) || num < 1) {
    throw new AppError(400, 'Bad Request', 'version é obrigatório e deve ser um inteiro >= 1.', {
      code: 'TRANSPORT_DRIVER_FIELD_REQUIRED'
    });
  }
  return num;
}

function driverNotFound(driverId: string): AppError {
  return new AppError(404, 'Not Found', `Motorista ${driverId} não encontrado.`, {
    code: 'TRANSPORT_DRIVER_NOT_FOUND'
  });
}

function todayIsoDate(): string {
  return new Date().toISOString().slice(0, 10);
}

type DriverResource = {
  id: string;
  version: number;
  integrationAccountId: string;
  partyId: string;
  partyName: string;
  partyDocumentNumber: string;
  cnhNumber: string;
  cnhCategory: string;
  cnhValidUntil: string;
  cnhUf: string | null;
  status: string;
  evidence: Record<string, unknown>;
  evidenceSource: string;
  createdAt: string;
  updatedAt: string;
};

function toDriverResource(driver: TransportDriverWithParty): DriverResource {
  return {
    id: driver.id,
    version: driver.version,
    integrationAccountId: driver.integrationAccountId,
    partyId: driver.partyId,
    partyName: driver.partyName,
    partyDocumentNumber: driver.partyDocumentNumber,
    cnhNumber: driver.cnhNumber,
    cnhCategory: driver.cnhCategory,
    cnhValidUntil: driver.cnhValidUntil,
    cnhUf: driver.cnhUf,
    status: driver.status,
    evidence: driver.evidence,
    evidenceSource: driver.evidenceSource,
    createdAt: driver.createdAt,
    updatedAt: driver.updatedAt
  };
}

type DriverLinkResource = {
  id: string;
  version: number;
  driverId: string;
  carrierPartyId: string;
  carrierName: string;
  linkType: string;
  validFrom: string;
  validUntil: string | null;
  status: string;
  createdAt: string;
  updatedAt: string;
};

function toDriverLinkResource(
  link: TransportDriverCarrierLink,
  carrierName: string
): DriverLinkResource {
  return {
    id: link.id,
    version: link.version,
    driverId: link.driverId,
    carrierPartyId: link.carrierPartyId,
    carrierName,
    linkType: link.linkType,
    validFrom: link.validFrom,
    validUntil: link.validUntil,
    status: link.status,
    createdAt: link.createdAt,
    updatedAt: link.updatedAt
  };
}

// =============================================================================
// POST /v1/transporte/motoristas
// =============================================================================

export async function createTransportDriverService(
  body: LooseRecord,
  headers: HeaderMap,
  correlationId: string | null
): Promise<DriverResource> {
  const integrationAccountId = requireIntegrationAccountId(body);

  const idempotencyKey = headers['idempotency-key'];
  const idempotencyScope = `transporte.motorista.create:${integrationAccountId}`;
  const reused = await getIdempotentResponse(idempotencyScope, idempotencyKey);
  if (reused) return reused as unknown as DriverResource;

  const partyId = requireNonEmptyString(body.partyId, 'partyId é obrigatório.');
  const cnhNumber = validateCnhNumber(body.cnhNumber);
  const cnhCategory = validateCnhCategory(body.cnhCategory);
  const cnhValidUntil = validateCnhValidUntil(body.cnhValidUntil);
  const cnhUf = validateCnhUf(body.cnhUf);
  const status = validateDriverStatus(body.status);
  const evidence = sanitizeDriverEvidence(body.evidence);

  const party = await getPartyById(partyId, integrationAccountId);
  if (!party) {
    throw new AppError(404, 'Not Found', `Transportador ${partyId} não encontrado.`, {
      code: 'TRANSPORT_PARTY_NOT_FOUND'
    });
  }
  if (party.documentType !== 'CPF') {
    throw new AppError(
      400,
      'Bad Request',
      `Motorista exige uma parte pessoa física (CPF) — a parte ${partyId} é ${party.documentType}.`,
      { code: 'TRANSPORT_DRIVER_PARTY_NOT_PF', context: { partyId, documentType: party.documentType } }
    );
  }

  const id = createPrefixedId('trdrv');
  let created;
  try {
    created = await withTransaction(async (client) => {
      // Papel `driver` que falta é ADICIONADO (nunca é erro) — ver cabeçalho do módulo.
      const roles = await listPartyRoles(partyId, client);
      if (!roles.includes('driver')) {
        await insertPartyRoles(partyId, ['driver'], client);
      }
      return insertDriver(
        {
          id,
          integrationAccountId,
          partyId,
          cnhNumber,
          cnhCategory,
          cnhValidUntil,
          cnhUf,
          status,
          evidence,
          evidenceSource: 'manual',
          correlationId: correlationId || createPrefixedId('corr')
        },
        client
      );
    });
  } catch (error) {
    if (getPgErrorCode(error) === '23505') {
      throw new AppError(409, 'Conflict', `A parte ${partyId} já possui um motorista cadastrado (relação 1:1).`, {
        code: 'TRANSPORT_DRIVER_DUPLICATE',
        context: { partyId }
      });
    }
    throw error;
  }

  const response = toDriverResource({
    ...created,
    partyName: party.legalName,
    partyDocumentNumber: party.documentNumber
  });
  await rememberIdempotentResponse({
    operation: idempotencyScope,
    idempotencyKey,
    entityType: 'transportDriver',
    entityId: id,
    response: response as unknown as Record<string, unknown>
  });
  return response;
}

// =============================================================================
// GET /v1/transporte/motoristas
// =============================================================================

export async function listTransportDriversService(query: LooseRecord): Promise<{
  items: DriverResource[];
  total: number;
  page: number;
  pageSize: number;
}> {
  const integrationAccountId = requireIntegrationAccountId(query);
  const filters: DriverListFilters = {
    search: toTrimmedString(query.search) ?? undefined,
    status: toTrimmedString(query.status) ?? undefined,
    page: query.page !== undefined ? Number(query.page) : undefined,
    pageSize: query.pageSize !== undefined ? Number(query.pageSize) : undefined
  };

  const { items, total, page, pageSize } = await listDrivers(integrationAccountId, filters);
  return { items: items.map(toDriverResource), total, page, pageSize };
}

// =============================================================================
// GET /v1/transporte/motoristas/{driverId}
// =============================================================================

export async function getTransportDriverService(driverId: string, query: LooseRecord): Promise<DriverResource> {
  const integrationAccountId = requireIntegrationAccountId(query);
  const driver = await getDriverById(driverId, integrationAccountId);
  if (!driver) throw driverNotFound(driverId);
  return toDriverResource(driver);
}

// =============================================================================
// PATCH /v1/transporte/motoristas/{driverId}
// =============================================================================

export async function updateTransportDriverService(driverId: string, body: LooseRecord): Promise<DriverResource> {
  const integrationAccountId = requireIntegrationAccountId(body);
  const expectedVersion = requireVersion(body);

  // `partyId` NÃO é atualizável: é a identidade do motorista (1:1) — trocar a pessoa é outro cadastro.
  const patch: DriverUpdatePatch = {};
  if (body.cnhNumber !== undefined) patch.cnhNumber = validateCnhNumber(body.cnhNumber);
  if (body.cnhCategory !== undefined) patch.cnhCategory = validateCnhCategory(body.cnhCategory);
  if (body.cnhValidUntil !== undefined) patch.cnhValidUntil = validateCnhValidUntil(body.cnhValidUntil);
  if (body.cnhUf !== undefined) patch.cnhUf = validateCnhUf(body.cnhUf);
  if (body.status !== undefined) patch.status = validateDriverStatus(body.status);
  if (body.evidence !== undefined) patch.evidence = sanitizeDriverEvidence(body.evidence);

  const driver = await updateDriverById(driverId, integrationAccountId, expectedVersion, patch);
  return toDriverResource(driver);
}

// =============================================================================
// POST /v1/transporte/motoristas/{driverId}/vinculos
// =============================================================================

export async function createDriverCarrierLinkService(
  driverId: string,
  body: LooseRecord,
  headers: HeaderMap,
  correlationId: string | null
): Promise<DriverLinkResource> {
  const integrationAccountId = requireIntegrationAccountId(body);

  const idempotencyKey = headers['idempotency-key'];
  const idempotencyScope = `transporte.motorista.vinculo.create:${integrationAccountId}`;
  const reused = await getIdempotentResponse(idempotencyScope, idempotencyKey);
  if (reused) return reused as unknown as DriverLinkResource;

  const driver = await getDriverById(driverId, integrationAccountId);
  if (!driver) throw driverNotFound(driverId);

  const carrierPartyId = requireNonEmptyString(body.carrierPartyId, 'carrierPartyId é obrigatório.');
  const linkType = validateDriverLinkType(body.linkType);
  const { validFrom, validUntil } = validateDriverLinkPeriod(body.validFrom, body.validUntil);

  // Existência+tenancy do transportador, molde `createPartyVehicleLinkService` (400, não 404: o
  // recurso da rota é o motorista — o carrier é dado do corpo). Papel `carrier` NÃO é exigido —
  // cadastro declarativo, mesma postura do vínculo de veículo.
  const carrier = await getPartyById(carrierPartyId, integrationAccountId);
  if (!carrier) {
    throw new AppError(
      400,
      'Bad Request',
      `Transportador ${carrierPartyId} não encontrado nesta conta — não é possível vincular.`,
      { code: 'TRANSPORT_DRIVER_LINK_CARRIER_INVALID', context: { carrierPartyId, integrationAccountId } }
    );
  }

  const current = await findCurrentDriverCarrierLink(driverId, carrierPartyId, linkType, todayIsoDate());
  if (current) {
    throw new AppError(
      409,
      'Conflict',
      `Já existe um vínculo ${linkType} vigente entre este motorista e o transportador ${carrierPartyId} — encerre-o antes de criar outro.`,
      { code: 'TRANSPORT_DRIVER_LINK_ACTIVE_EXISTS', context: { currentLinkId: current.id } }
    );
  }

  const id = createPrefixedId('trdrvlink');
  let link: TransportDriverCarrierLink;
  try {
    link = await insertDriverCarrierLink({
      id,
      integrationAccountId,
      driverId,
      carrierPartyId,
      linkType,
      validFrom,
      validUntil,
      correlationId: correlationId || createPrefixedId('corr')
    });
  } catch (error) {
    if (getPgErrorCode(error) === '23505') {
      throw new AppError(
        409,
        'Conflict',
        'Já existe um vínculo com este tipo e esta data de início entre este motorista e este transportador.',
        { code: 'TRANSPORT_DRIVER_LINK_DUPLICATE' }
      );
    }
    throw error;
  }

  const response = toDriverLinkResource(link, carrier.legalName);
  await rememberIdempotentResponse({
    operation: idempotencyScope,
    idempotencyKey,
    entityType: 'transportDriverCarrierLink',
    entityId: id,
    response: response as unknown as Record<string, unknown>
  });
  return response;
}

// =============================================================================
// GET /v1/transporte/motoristas/{driverId}/vinculos
// =============================================================================

export async function listDriverCarrierLinksService(
  driverId: string,
  query: LooseRecord
): Promise<{ items: DriverLinkResource[]; totalItems: number }> {
  const integrationAccountId = requireIntegrationAccountId(query);
  const driver = await getDriverById(driverId, integrationAccountId);
  if (!driver) throw driverNotFound(driverId);

  const links = await listDriverCarrierLinksByDriver(driverId, integrationAccountId);
  const items = links.map((link) => toDriverLinkResource(link, link.carrierName));
  return { items, totalItems: items.length };
}

// =============================================================================
// PATCH /v1/transporte/motoristas/{driverId}/vinculos/{linkId} — encerrar vínculo
// =============================================================================

export async function endDriverCarrierLinkService(
  driverId: string,
  linkId: string,
  body: LooseRecord
): Promise<DriverLinkResource> {
  const integrationAccountId = requireIntegrationAccountId(body);
  const expectedVersion = requireVersion(body);

  const driver = await getDriverById(driverId, integrationAccountId);
  if (!driver) throw driverNotFound(driverId);

  const link = await getDriverCarrierLinkById(linkId, driverId, integrationAccountId);
  if (!link) {
    throw new AppError(404, 'Not Found', `Vínculo ${linkId} não encontrado para este motorista.`, {
      code: 'TRANSPORT_DRIVER_LINK_NOT_FOUND'
    });
  }
  if (link.status === 'ended') {
    throw new AppError(409, 'Conflict', `Vínculo ${linkId} já está encerrado.`, {
      code: 'TRANSPORT_DRIVER_LINK_ALREADY_ENDED'
    });
  }

  // `validUntil` opcional (default: hoje) — reusa o validador de período para garantir formato e
  // fim >= início, com o `validFrom` REAL do vínculo (não um do body: início é imutável).
  const rawUntil = body.validUntil === undefined || body.validUntil === null || body.validUntil === ''
    ? todayIsoDate()
    : body.validUntil;
  const { validUntil } = validateDriverLinkPeriod(link.validFrom, rawUntil);

  const updated = await updateDriverCarrierLinkById(linkId, driverId, integrationAccountId, expectedVersion, {
    validUntil,
    status: 'ended'
  });
  return toDriverLinkResource(updated, updated.carrierName);
}

export type { DriverResource, DriverLinkResource };

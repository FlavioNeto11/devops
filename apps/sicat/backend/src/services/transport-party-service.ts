/**
 * Service do cadastro-base de transportadores (PR-A3, DL-103).
 *
 * Fino: validação declaratória (`transport-party-validator.ts`) → resolução de
 * `integrationAccountId` → repositório → mapeamento para o shape do CONTRATO
 * (`TransporteTransportador*` do OpenAPI, camelCase, sem `correlationId`).
 *
 * Resolução de `integrationAccountId` (molde `manifest-service.listManifests`/`dmr-service`):
 * não existe middleware de "conta ativa da sessão" nesta base — o chamador informa
 * `integrationAccountId` explicitamente (body no POST/PATCH, query no GET), e o service valida
 * a presença (400) antes de tocar o repositório. `ensureIntegrationAccount` só é chamado no
 * CREATE (mesmo padrão de `cadastro-service.createCadastro`/`manifest-service` — upsert idempotente
 * da conta se ainda não existir); leituras/updates nunca criam conta implicitamente.
 *
 * SEM verificação externa: os campos `rntrc*` são só o que o operador declarou — nada aqui chama
 * ANTT. Rotas `/regularidade`/`/verificar` são Fase C e NÃO existem neste PR.
 */

import { withTransaction } from '../db/pool.js';
import { AppError } from '../lib/problem.js';
import { createPrefixedId } from '../lib/ids.js';
import { ensureIntegrationAccount } from '../repositories/integration-account-repo.js';
import {
  getPartyById,
  insertParty,
  insertPartyRoles,
  listPartyRoles,
  listPartyRolesForParties,
  listParties,
  replacePartyRoles,
  updatePartyById,
  type PartyListFilters,
  type PartyUpdatePatch
} from '../repositories/transport-party-repo.js';
import {
  getVehicleById,
  insertVehicleLink,
  listVehicleLinkPeriodsForParties,
  listVehicleLinksByParty
} from '../repositories/transport-vehicle-repo.js';
import {
  buildTypologyWarning,
  countActiveFleet,
  deriveCarrierTypology,
  type CarrierTypology,
  type FleetLinkLike
} from '../lib/transport/carrier-typology.js';
import {
  validatePartyDocument,
  validatePartyRoles,
  validateRntrcCategory,
  validateRntrcStatus,
  validateUf,
  validateVehicleLinkPeriod,
  validateVehicleLinkType
} from '../lib/validators/transport-party-validator.js';
import type { PartyRole, RntrcVerificationSource, TransportParty } from '../lib/transport/transport-party-types.js';
import { RNTRC_VERIFICATION_SOURCES } from '../lib/transport/transport-party-types.js';

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
    'TRANSPORT_PARTY_FIELD_REQUIRED'
  );
}

function requireVersion(source: LooseRecord): number {
  const raw = source.version;
  const num = Number(raw);
  if (!Number.isFinite(num) || !Number.isInteger(num) || num < 1) {
    throw new AppError(400, 'Bad Request', 'version é obrigatório e deve ser um inteiro >= 1.', {
      code: 'TRANSPORT_PARTY_FIELD_REQUIRED'
    });
  }
  return num;
}

function validateRntrcVerificationSource(value: unknown): RntrcVerificationSource | undefined {
  if (value === undefined) return undefined;
  if (value === null || value === '') return 'manual';
  if (!RNTRC_VERIFICATION_SOURCES.includes(value as RntrcVerificationSource)) {
    throw new AppError(
      400,
      'Bad Request',
      `rntrcVerificationSource inválido: esperado um de ${RNTRC_VERIFICATION_SOURCES.join(', ')}.`,
      { code: 'TRANSPORT_PARTY_RNTRC_STATUS_INVALID' }
    );
  }
  return value as RntrcVerificationSource;
}

type PartyResource = {
  id: string;
  version: number;
  integrationAccountId: string;
  documentType: TransportParty['documentType'];
  documentNumber: string;
  legalName: string;
  tradeName: string | null;
  rntrcNumber: string | null;
  rntrcCategory: TransportParty['rntrcCategory'];
  rntrcStatus: TransportParty['rntrcStatus'];
  rntrcVerifiedAt: string | null;
  rntrcVerificationSource: RntrcVerificationSource;
  municipality: string | null;
  uf: TransportParty['uf'];
  isActive: boolean;
  metadata: Record<string, unknown>;
  roles: PartyRole[];
  createdAt: string;
  updatedAt: string;
  /** Presentes só nas CONSULTAS (GET) — derivados da frota ativa, ver `withDerivedTypology`. */
  fleetSize?: number;
  derivedTypology?: CarrierTypology;
  typologyWarning?: string | null;
};

/**
 * Tipologia DERIVADA do transportador (PR I1, REQ-SICAT-0033): `fleetSize` = vínculos de veículo
 * owned+leased vigentes HOJE; `derivedTypology` = driver_pf|tac|etc (`carrier-typology.ts`);
 * `typologyWarning` = divergência declarado×derivado como AVISO no payload — nunca erro (sem
 * regra TR neste ciclo). Só nas leituras GET: computar também nas respostas de escrita custaria
 * uma query extra por POST/PATCH sem consumidor — quem acabou de escrever relê pelo GET.
 */
function withDerivedTypology(resource: PartyResource, links: readonly FleetLinkLike[]): PartyResource {
  const fleetSize = countActiveFleet(links);
  const derivedTypology = deriveCarrierTypology({
    partyKind: resource.documentType === 'CPF' ? 'PF' : 'PJ',
    fleetSize
  });
  return {
    ...resource,
    fleetSize,
    derivedTypology,
    typologyWarning: buildTypologyWarning({
      declaredCategory: resource.rntrcCategory,
      derivedTypology,
      fleetSize
    })
  };
}

function toPartyResource(party: TransportParty, roles: PartyRole[]): PartyResource {
  return {
    id: party.id,
    version: party.version,
    integrationAccountId: party.integrationAccountId,
    documentType: party.documentType,
    documentNumber: party.documentNumber,
    legalName: party.legalName,
    tradeName: party.tradeName,
    rntrcNumber: party.rntrcNumber,
    rntrcCategory: party.rntrcCategory,
    rntrcStatus: party.rntrcStatus,
    rntrcVerifiedAt: party.rntrcVerifiedAt,
    rntrcVerificationSource: party.rntrcVerificationSource,
    municipality: party.municipality,
    uf: party.uf,
    isActive: party.isActive,
    metadata: party.metadata,
    roles,
    createdAt: party.createdAt,
    updatedAt: party.updatedAt
  };
}

function partyDuplicateError(integrationAccountId: string): AppError {
  return new AppError(
    409,
    'Conflict',
    'Já existe um transportador com este documento (ou este número RNTRC) nesta conta.',
    { code: 'TRANSPORT_PARTY_DUPLICATE', context: { integrationAccountId } }
  );
}

function partyNotFound(partyId: string): AppError {
  return new AppError(404, 'Not Found', `Transportador ${partyId} não encontrado.`, {
    code: 'TRANSPORT_PARTY_NOT_FOUND'
  });
}

/** POST /v1/transporte/transportadores */
export async function createTransportPartyService(
  body: LooseRecord,
  correlationId: string | null
): Promise<PartyResource> {
  const integrationAccountId = requireIntegrationAccountId(body);
  const { documentType, documentNumber } = validatePartyDocument(
    String(body.documentType ?? ''),
    String(body.documentNumber ?? '')
  );
  const legalName = requireNonEmptyString(body.legalName, 'legalName é obrigatório.', 'TRANSPORT_PARTY_FIELD_REQUIRED');
  const tradeName = toTrimmedString(body.tradeName);
  const rntrcNumber = toTrimmedString(body.rntrcNumber);
  const rntrcCategory = validateRntrcCategory(body.rntrcCategory);
  const rntrcStatus = validateRntrcStatus(body.rntrcStatus);
  const rntrcVerificationSource = validateRntrcVerificationSource(body.rntrcVerificationSource) ?? 'manual';
  const rntrcVerifiedAt = toTrimmedString(body.rntrcVerifiedAt);
  const municipality = toTrimmedString(body.municipality);
  const uf = validateUf(body.uf);
  const isActive = body.isActive === undefined ? true : Boolean(body.isActive);
  const metadata = (body.metadata && typeof body.metadata === 'object' && !Array.isArray(body.metadata))
    ? (body.metadata as Record<string, unknown>)
    : {};
  const roles = validatePartyRoles(body.roles);

  await ensureIntegrationAccount(integrationAccountId);

  const id = createPrefixedId('trparty');
  try {
    return await withTransaction(async (client) => {
      const party = await insertParty(
        {
          id,
          integrationAccountId,
          documentType,
          documentNumber,
          legalName,
          tradeName,
          rntrcNumber,
          rntrcCategory,
          rntrcStatus,
          rntrcVerifiedAt,
          rntrcVerificationSource,
          municipality,
          uf,
          isActive,
          metadata,
          correlationId: correlationId || createPrefixedId('corr')
        },
        client
      );
      await insertPartyRoles(id, roles, client);
      return toPartyResource(party, roles);
    });
  } catch (error) {
    if (getPgErrorCode(error) === '23505') throw partyDuplicateError(integrationAccountId);
    throw error;
  }
}

/** GET /v1/transporte/transportadores */
export async function listTransportPartiesService(query: LooseRecord): Promise<{
  items: PartyResource[];
  total: number;
  page: number;
  pageSize: number;
}> {
  const integrationAccountId = requireIntegrationAccountId(query);
  const filters: PartyListFilters = {
    search: toTrimmedString(query.search) ?? undefined,
    rntrcStatus: toTrimmedString(query.rntrcStatus) ?? undefined,
    role: toTrimmedString(query.role) ?? undefined,
    page: query.page !== undefined ? Number(query.page) : undefined,
    pageSize: query.pageSize !== undefined ? Number(query.pageSize) : undefined
  };

  const { items, total, page, pageSize } = await listParties(integrationAccountId, filters);
  const partyIds = items.map((item) => item.id);
  const rolesByParty = await listPartyRolesForParties(partyIds);
  const linksByParty = await listVehicleLinkPeriodsForParties(partyIds);
  return {
    items: items.map((party) =>
      withDerivedTypology(
        toPartyResource(party, rolesByParty.get(party.id) ?? []),
        linksByParty.get(party.id) ?? []
      )
    ),
    total,
    page,
    pageSize
  };
}

/** GET /v1/transporte/transportadores/{partyId} */
export async function getTransportPartyService(partyId: string, query: LooseRecord): Promise<PartyResource> {
  const integrationAccountId = requireIntegrationAccountId(query);
  const party = await getPartyById(partyId, integrationAccountId);
  if (!party) throw partyNotFound(partyId);
  const roles = await listPartyRoles(partyId);
  const links = await listVehicleLinksByParty(partyId);
  return withDerivedTypology(toPartyResource(party, roles), links);
}

/** PATCH /v1/transporte/transportadores/{partyId} */
export async function updateTransportPartyService(partyId: string, body: LooseRecord): Promise<PartyResource> {
  const integrationAccountId = requireIntegrationAccountId(body);
  const expectedVersion = requireVersion(body);

  const patch: PartyUpdatePatch = {};
  if (body.legalName !== undefined) {
    patch.legalName = requireNonEmptyString(body.legalName, 'legalName não pode ser vazio.', 'TRANSPORT_PARTY_FIELD_REQUIRED');
  }
  if (body.tradeName !== undefined) patch.tradeName = toTrimmedString(body.tradeName);
  if (body.rntrcNumber !== undefined) patch.rntrcNumber = toTrimmedString(body.rntrcNumber);
  if (body.rntrcCategory !== undefined) patch.rntrcCategory = validateRntrcCategory(body.rntrcCategory);
  if (body.rntrcStatus !== undefined) patch.rntrcStatus = validateRntrcStatus(body.rntrcStatus);
  if (body.rntrcVerifiedAt !== undefined) patch.rntrcVerifiedAt = toTrimmedString(body.rntrcVerifiedAt);
  if (body.rntrcVerificationSource !== undefined) {
    patch.rntrcVerificationSource = validateRntrcVerificationSource(body.rntrcVerificationSource);
  }
  if (body.municipality !== undefined) patch.municipality = toTrimmedString(body.municipality);
  if (body.uf !== undefined) patch.uf = validateUf(body.uf);
  if (body.isActive !== undefined) patch.isActive = Boolean(body.isActive);
  if (body.metadata !== undefined) {
    patch.metadata = (body.metadata && typeof body.metadata === 'object' && !Array.isArray(body.metadata))
      ? (body.metadata as Record<string, unknown>)
      : {};
  }

  const rolesPatch = body.roles !== undefined ? validatePartyRoles(body.roles) : null;

  try {
    return await withTransaction(async (client) => {
      const party = await updatePartyById(partyId, integrationAccountId, expectedVersion, patch, client);
      if (rolesPatch !== null) {
        await replacePartyRoles(partyId, rolesPatch, client);
      }
      const roles = rolesPatch ?? (await listPartyRoles(partyId, client));
      return toPartyResource(party, roles);
    });
  } catch (error) {
    if (getPgErrorCode(error) === '23505') throw partyDuplicateError(integrationAccountId);
    throw error;
  }
}

// =============================================================================
// Vínculos veículo↔transportador (POST/GET .../transportadores/{partyId}/veiculos)
// =============================================================================

type VehicleLinkResource = {
  id: string;
  vehicleId: string;
  partyId: string;
  vehiclePlate: string;
  vehicleType: string;
  linkType: string;
  validFrom: string | null;
  validUntil: string | null;
  evidenceRef: string | null;
  createdAt: string;
};

function linkDuplicateError(): AppError {
  return new AppError(
    409,
    'Conflict',
    'Já existe um vínculo com este tipo entre este veículo e este transportador.',
    { code: 'TRANSPORT_VEHICLE_LINK_DUPLICATE' }
  );
}

/** POST /v1/transporte/transportadores/{partyId}/veiculos */
export async function createPartyVehicleLinkService(
  partyId: string,
  body: LooseRecord
): Promise<VehicleLinkResource> {
  const integrationAccountId = requireIntegrationAccountId(body);
  const party = await getPartyById(partyId, integrationAccountId);
  if (!party) throw partyNotFound(partyId);

  const vehicleId = requireNonEmptyString(body.vehicleId, 'vehicleId é obrigatório.', 'TRANSPORT_VEHICLE_FIELD_REQUIRED');
  const linkType = validateVehicleLinkType(body.linkType);
  const { validFrom, validUntil } = validateVehicleLinkPeriod(body.validFrom, body.validUntil);
  const evidenceRef = toTrimmedString(body.evidenceRef);

  const vehicle = await getVehicleById(vehicleId, integrationAccountId);
  if (!vehicle) {
    throw new AppError(
      400,
      'Bad Request',
      `Veículo ${vehicleId} não encontrado nesta conta — não é possível vincular.`,
      { code: 'TRANSPORT_VEHICLE_LINK_INVALID', context: { vehicleId, integrationAccountId } }
    );
  }

  const id = createPrefixedId('trvlink');
  try {
    const link = await insertVehicleLink({ id, vehicleId, partyId, linkType, validFrom, validUntil, evidenceRef });
    return {
      id: link.id,
      vehicleId: link.vehicleId,
      partyId: link.partyId,
      vehiclePlate: vehicle.plate,
      vehicleType: vehicle.vehicleType,
      linkType: link.linkType,
      validFrom: link.validFrom,
      validUntil: link.validUntil,
      evidenceRef: link.evidenceRef,
      createdAt: link.createdAt
    };
  } catch (error) {
    if (getPgErrorCode(error) === '23505') throw linkDuplicateError();
    throw error;
  }
}

/** GET /v1/transporte/transportadores/{partyId}/veiculos */
export async function listPartyVehicleLinksService(
  partyId: string,
  query: LooseRecord
): Promise<{ items: VehicleLinkResource[]; totalItems: number }> {
  const integrationAccountId = requireIntegrationAccountId(query);
  const party = await getPartyById(partyId, integrationAccountId);
  if (!party) throw partyNotFound(partyId);

  const links = await listVehicleLinksByParty(partyId);
  const items = links.map((link) => ({
    id: link.id,
    vehicleId: link.vehicleId,
    partyId: link.partyId,
    vehiclePlate: link.vehiclePlate,
    vehicleType: link.vehicleType,
    linkType: link.linkType,
    validFrom: link.validFrom,
    validUntil: link.validUntil,
    evidenceRef: link.evidenceRef,
    createdAt: link.createdAt
  }));
  return { items, totalItems: items.length };
}

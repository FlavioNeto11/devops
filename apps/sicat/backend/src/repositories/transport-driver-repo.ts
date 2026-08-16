/**
 * Repositório de `transport_drivers`/`transport_driver_carrier_links` (PR I1, REQ-SICAT-0033).
 *
 * TENANCY OBRIGATÓRIA (mesmo contrato de `transport-party-repo.ts`): toda leitura/escrita por id
 * filtra também por `integration_account_id` — nenhuma função aqui devolve (ou muta) um registro
 * de outra conta.
 *
 * Locking otimista via coluna `version` nas DUAS tabelas (o vínculo TEM version — encerrá-lo é um
 * UPDATE de vigência, ver migration 034): `updateDriverById`/`updateDriverCarrierLinkById` fazem
 * `where id = $ and ... and version = $expectedVersion` e distinguem 404 (registro inexistente
 * NESTA conta) de 409 (existe, mas version defasada) — nunca revelam a um chamador de outra conta
 * se o id existe em outro lugar.
 *
 * Leituras carregam um RESUMO da parte (legal_name/document_number) via join — mesmo racional de
 * `listVehicleLinksByParty` (evita N+1 no consumidor).
 *
 * Padrão da casa: SQL parametrizado, client opcional (`DbClient`) para participar de transações
 * do chamador.
 */

import type { PoolClient } from 'pg';
import { query } from '../db/pool.js';
import { AppError } from '../lib/problem.js';
import type { BrazilianStateCode } from '../lib/transport/transport-party-types.js';
import type {
  CnhCategory,
  DriverCarrierLinkStatus,
  DriverCarrierLinkType,
  DriverEvidenceSource,
  DriverStatus,
  TransportDriver,
  TransportDriverCarrierLink
} from '../lib/transport/transport-driver-types.js';

type DbClient = Pick<PoolClient, 'query'> | null;

function getQueryExecutor(client: DbClient = null) {
  return client?.query?.bind(client) || query;
}

type DriverRow = {
  id: string;
  integration_account_id: string;
  party_id: string;
  cnh_number: string;
  cnh_category: string;
  cnh_valid_until: Date | string;
  cnh_uf: string | null;
  status: string;
  evidence: unknown;
  evidence_source: string;
  correlation_id: string;
  version: number;
  created_at: Date | string;
  updated_at: Date | string;
  party_legal_name?: string;
  party_document_number?: string;
};

type DriverCarrierLinkRow = {
  id: string;
  integration_account_id: string;
  driver_id: string;
  carrier_party_id: string;
  link_type: string;
  valid_from: Date | string;
  valid_until: Date | string | null;
  status: string;
  correlation_id: string;
  version: number;
  created_at: Date | string;
  updated_at: Date | string;
  carrier_legal_name?: string;
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

/** Motorista já mapeado + resumo da parte (nome/documento) quando a query trouxe o join. */
export type TransportDriverWithParty = TransportDriver & {
  partyName: string;
  partyDocumentNumber: string;
};

function mapDriverRow(row: DriverRow | undefined): TransportDriverWithParty | null {
  if (!row) return null;
  return {
    id: row.id,
    integrationAccountId: row.integration_account_id,
    partyId: row.party_id,
    cnhNumber: row.cnh_number,
    cnhCategory: row.cnh_category as CnhCategory,
    cnhValidUntil: toIsoDateOnly(row.cnh_valid_until) ?? '',
    cnhUf: row.cnh_uf as BrazilianStateCode | null,
    status: row.status as DriverStatus,
    evidence: toJsonObject(row.evidence),
    evidenceSource: row.evidence_source as DriverEvidenceSource,
    correlationId: row.correlation_id,
    version: Number(row.version ?? 1),
    createdAt: toIso(row.created_at) ?? '',
    updatedAt: toIso(row.updated_at) ?? '',
    partyName: row.party_legal_name ?? '',
    partyDocumentNumber: row.party_document_number ?? ''
  };
}

const DRIVER_SELECT = `
  select d.*, p.legal_name as party_legal_name, p.document_number as party_document_number
    from transport_drivers d
    inner join transport_parties p on p.id = d.party_id`;

export type DriverInsertInput = {
  id: string;
  integrationAccountId: string;
  partyId: string;
  cnhNumber: string;
  cnhCategory: CnhCategory;
  cnhValidUntil: string;
  cnhUf?: BrazilianStateCode | null;
  status?: DriverStatus;
  evidence?: Record<string, unknown>;
  evidenceSource?: DriverEvidenceSource;
  correlationId: string;
};

export async function insertDriver(input: DriverInsertInput, client: DbClient = null): Promise<TransportDriver> {
  const execute = getQueryExecutor(client);
  const result = await execute<DriverRow>(
    `insert into transport_drivers (
       id, integration_account_id, party_id, cnh_number, cnh_category, cnh_valid_until, cnh_uf,
       status, evidence, evidence_source, correlation_id, version
     ) values (
       $1, $2, $3, $4, $5, $6, $7, $8, $9::jsonb, $10, $11, 1
     )
     returning *`,
    [
      input.id,
      input.integrationAccountId,
      input.partyId,
      input.cnhNumber,
      input.cnhCategory,
      input.cnhValidUntil,
      input.cnhUf ?? null,
      input.status ?? 'active',
      JSON.stringify(input.evidence ?? {}),
      input.evidenceSource ?? 'manual',
      input.correlationId
    ]
  );

  const row = mapDriverRow(result.rows[0]);
  if (!row) {
    throw new AppError(500, 'Internal Server Error', `Falha ao inserir motorista ${input.id}.`, {
      code: 'TRANSPORT_DRIVER_INSERT_FAILED'
    });
  }
  return row;
}

export type DriverListFilters = {
  search?: string;
  status?: string;
  page?: number;
  pageSize?: number;
};

const DEFAULT_PAGE_SIZE = 20;
const MAX_PAGE_SIZE = 200;

export async function listDrivers(
  integrationAccountId: string,
  filters: DriverListFilters = {},
  client: DbClient = null
): Promise<{ items: TransportDriverWithParty[]; total: number; page: number; pageSize: number }> {
  const execute = getQueryExecutor(client);
  const where: string[] = ['d.integration_account_id = $1'];
  const values: unknown[] = [integrationAccountId];

  if (filters.search) {
    values.push(`%${filters.search}%`);
    where.push(`(p.legal_name ilike $${values.length} or d.cnh_number ilike $${values.length})`);
  }
  if (filters.status) {
    values.push(filters.status);
    where.push(`d.status = $${values.length}`);
  }

  const whereSql = `where ${where.join(' and ')}`;
  const page = Math.max(Math.floor(filters.page ?? 1), 1);
  const pageSize = Math.min(Math.max(Math.floor(filters.pageSize ?? DEFAULT_PAGE_SIZE), 1), MAX_PAGE_SIZE);
  const offset = (page - 1) * pageSize;

  const totalResult = await execute<{ count: string }>(
    `select count(*)::text as count
       from transport_drivers d
       inner join transport_parties p on p.id = d.party_id
      ${whereSql}`,
    values
  );
  const total = Number(totalResult.rows[0]?.count ?? 0);

  const limitValues = [...values, pageSize, offset];
  const rowsResult = await execute<DriverRow>(
    `${DRIVER_SELECT}
      ${whereSql}
      order by p.legal_name asc, d.id asc
      limit $${limitValues.length - 1} offset $${limitValues.length}`,
    limitValues
  );

  const items = rowsResult.rows.map(mapDriverRow).filter((row): row is TransportDriverWithParty => row !== null);
  return { items, total, page, pageSize };
}

export async function getDriverById(
  id: string,
  integrationAccountId: string,
  client: DbClient = null
): Promise<TransportDriverWithParty | null> {
  const execute = getQueryExecutor(client);
  const result = await execute<DriverRow>(
    `${DRIVER_SELECT}
      where d.id = $1 and d.integration_account_id = $2`,
    [id, integrationAccountId]
  );
  return mapDriverRow(result.rows[0]);
}

export type DriverUpdatePatch = Partial<Pick<
  TransportDriver,
  'cnhNumber' | 'cnhCategory' | 'cnhValidUntil' | 'cnhUf' | 'status' | 'evidence'
>>;

async function driverNotFoundOrConflict(
  id: string,
  integrationAccountId: string,
  expectedVersion: number,
  client: DbClient
): Promise<never> {
  const execute = getQueryExecutor(client);
  // Checagem restrita À MESMA CONTA — não revela se o id existe sob outra conta (isolamento).
  const existing = await execute<{ version: number }>(
    'select version from transport_drivers where id = $1 and integration_account_id = $2',
    [id, integrationAccountId]
  );
  if ((existing.rowCount ?? 0) === 0) {
    throw new AppError(404, 'Not Found', `Motorista ${id} não encontrado.`, {
      code: 'TRANSPORT_DRIVER_NOT_FOUND'
    });
  }
  throw new AppError(
    409,
    'Conflict',
    `Motorista ${id} foi modificado por outro processo (esperado version=${expectedVersion}, atual=${existing.rows[0]?.version}).`,
    { code: 'TRANSPORT_DRIVER_VERSION_CONFLICT' }
  );
}

export async function updateDriverById(
  id: string,
  integrationAccountId: string,
  expectedVersion: number,
  patch: DriverUpdatePatch,
  client: DbClient = null
): Promise<TransportDriverWithParty> {
  const execute = getQueryExecutor(client);
  const sets: string[] = [];
  const values: unknown[] = [id, integrationAccountId, expectedVersion];

  function pushSet(column: string, value: unknown, jsonb = false) {
    values.push(value);
    sets.push(`${column} = $${values.length}${jsonb ? '::jsonb' : ''}`);
  }

  if (patch.cnhNumber !== undefined) pushSet('cnh_number', patch.cnhNumber);
  if (patch.cnhCategory !== undefined) pushSet('cnh_category', patch.cnhCategory);
  if (patch.cnhValidUntil !== undefined) pushSet('cnh_valid_until', patch.cnhValidUntil);
  if (patch.cnhUf !== undefined) pushSet('cnh_uf', patch.cnhUf);
  if (patch.status !== undefined) pushSet('status', patch.status);
  if (patch.evidence !== undefined) pushSet('evidence', JSON.stringify(patch.evidence), true);

  if (sets.length === 0) {
    const current = await execute<DriverRow>(
      `${DRIVER_SELECT}
        where d.id = $1 and d.integration_account_id = $2 and d.version = $3`,
      [id, integrationAccountId, expectedVersion]
    );
    const row = mapDriverRow(current.rows[0]);
    if (!row) return driverNotFoundOrConflict(id, integrationAccountId, expectedVersion, client);
    return row;
  }

  // Trigger `trg_transport_drivers_version` cuida do bump de version e updated_at. O `returning *`
  // não enxerga o join — recarrega via getDriverById para manter o resumo da parte no retorno.
  const result = await execute<{ id: string }>(
    `update transport_drivers
        set ${sets.join(', ')}
      where id = $1
        and integration_account_id = $2
        and version = $3
      returning id`,
    values
  );

  if ((result.rowCount ?? 0) === 0) {
    return driverNotFoundOrConflict(id, integrationAccountId, expectedVersion, client);
  }
  const updated = await getDriverById(id, integrationAccountId, client);
  if (!updated) return driverNotFoundOrConflict(id, integrationAccountId, expectedVersion, client);
  return updated;
}

// =============================================================================
// transport_driver_carrier_links
// =============================================================================

/** Vínculo já mapeado + resumo do transportador (nome) quando a query trouxe o join. */
export type DriverCarrierLinkWithCarrier = TransportDriverCarrierLink & { carrierName: string };

function mapLinkRow(row: DriverCarrierLinkRow | undefined): DriverCarrierLinkWithCarrier | null {
  if (!row) return null;
  return {
    id: row.id,
    integrationAccountId: row.integration_account_id,
    driverId: row.driver_id,
    carrierPartyId: row.carrier_party_id,
    linkType: row.link_type as DriverCarrierLinkType,
    validFrom: toIsoDateOnly(row.valid_from) ?? '',
    validUntil: toIsoDateOnly(row.valid_until),
    status: row.status as DriverCarrierLinkStatus,
    correlationId: row.correlation_id,
    version: Number(row.version ?? 1),
    createdAt: toIso(row.created_at) ?? '',
    updatedAt: toIso(row.updated_at) ?? '',
    carrierName: row.carrier_legal_name ?? ''
  };
}

const LINK_SELECT = `
  select l.*, c.legal_name as carrier_legal_name
    from transport_driver_carrier_links l
    inner join transport_parties c on c.id = l.carrier_party_id`;

export type DriverCarrierLinkInsertInput = {
  id: string;
  integrationAccountId: string;
  driverId: string;
  carrierPartyId: string;
  linkType: DriverCarrierLinkType;
  validFrom: string;
  validUntil?: string | null;
  correlationId: string;
};

export async function insertDriverCarrierLink(
  input: DriverCarrierLinkInsertInput,
  client: DbClient = null
): Promise<TransportDriverCarrierLink> {
  const execute = getQueryExecutor(client);
  const result = await execute<DriverCarrierLinkRow>(
    `insert into transport_driver_carrier_links (
       id, integration_account_id, driver_id, carrier_party_id, link_type, valid_from, valid_until,
       status, correlation_id, version
     ) values (
       $1, $2, $3, $4, $5, $6, $7, 'active', $8, 1
     )
     returning *`,
    [
      input.id,
      input.integrationAccountId,
      input.driverId,
      input.carrierPartyId,
      input.linkType,
      input.validFrom,
      input.validUntil ?? null,
      input.correlationId
    ]
  );

  const row = mapLinkRow(result.rows[0]);
  if (!row) {
    throw new AppError(
      500,
      'Internal Server Error',
      `Falha ao inserir vínculo motorista↔transportador (${input.driverId}/${input.carrierPartyId}).`,
      { code: 'TRANSPORT_DRIVER_LINK_INSERT_FAILED' }
    );
  }
  return row;
}

export async function listDriverCarrierLinksByDriver(
  driverId: string,
  integrationAccountId: string,
  client: DbClient = null
): Promise<DriverCarrierLinkWithCarrier[]> {
  const execute = getQueryExecutor(client);
  const result = await execute<DriverCarrierLinkRow>(
    `${LINK_SELECT}
      where l.driver_id = $1 and l.integration_account_id = $2
      order by l.valid_from desc, l.created_at desc`,
    [driverId, integrationAccountId]
  );
  return result.rows
    .map(mapLinkRow)
    .filter((row): row is DriverCarrierLinkWithCarrier => row !== null);
}

export async function getDriverCarrierLinkById(
  linkId: string,
  driverId: string,
  integrationAccountId: string,
  client: DbClient = null
): Promise<DriverCarrierLinkWithCarrier | null> {
  const execute = getQueryExecutor(client);
  const result = await execute<DriverCarrierLinkRow>(
    `${LINK_SELECT}
      where l.id = $1 and l.driver_id = $2 and l.integration_account_id = $3`,
    [linkId, driverId, integrationAccountId]
  );
  return mapLinkRow(result.rows[0]);
}

/**
 * Vínculo VIGENTE (status active + sem fim, ou fim >= data de referência) para o par
 * driver×carrier×tipo — base da regra "no máximo 1 vigente" do service (a UNIQUE da migration só
 * barra o mesmo `valid_from` repetido; vigência é temporal, não estática).
 */
export async function findCurrentDriverCarrierLink(
  driverId: string,
  carrierPartyId: string,
  linkType: DriverCarrierLinkType,
  referenceDate: string,
  client: DbClient = null
): Promise<TransportDriverCarrierLink | null> {
  const execute = getQueryExecutor(client);
  const result = await execute<DriverCarrierLinkRow>(
    `select l.* from transport_driver_carrier_links l
      where l.driver_id = $1
        and l.carrier_party_id = $2
        and l.link_type = $3
        and l.status = 'active'
        and (l.valid_until is null or l.valid_until >= $4)
      order by l.valid_from desc
      limit 1`,
    [driverId, carrierPartyId, linkType, referenceDate]
  );
  return mapLinkRow(result.rows[0]);
}

export type DriverCarrierLinkUpdatePatch = Partial<Pick<
  TransportDriverCarrierLink,
  'validUntil' | 'status'
>>;

async function linkNotFoundOrConflict(
  linkId: string,
  driverId: string,
  integrationAccountId: string,
  expectedVersion: number,
  client: DbClient
): Promise<never> {
  const execute = getQueryExecutor(client);
  const existing = await execute<{ version: number }>(
    `select version from transport_driver_carrier_links
      where id = $1 and driver_id = $2 and integration_account_id = $3`,
    [linkId, driverId, integrationAccountId]
  );
  if ((existing.rowCount ?? 0) === 0) {
    throw new AppError(404, 'Not Found', `Vínculo ${linkId} não encontrado para este motorista.`, {
      code: 'TRANSPORT_DRIVER_LINK_NOT_FOUND'
    });
  }
  throw new AppError(
    409,
    'Conflict',
    `Vínculo ${linkId} foi modificado por outro processo (esperado version=${expectedVersion}, atual=${existing.rows[0]?.version}).`,
    { code: 'TRANSPORT_DRIVER_LINK_VERSION_CONFLICT' }
  );
}

export async function updateDriverCarrierLinkById(
  linkId: string,
  driverId: string,
  integrationAccountId: string,
  expectedVersion: number,
  patch: DriverCarrierLinkUpdatePatch,
  client: DbClient = null
): Promise<DriverCarrierLinkWithCarrier> {
  const execute = getQueryExecutor(client);
  const sets: string[] = [];
  const values: unknown[] = [linkId, driverId, integrationAccountId, expectedVersion];

  function pushSet(column: string, value: unknown) {
    values.push(value);
    sets.push(`${column} = $${values.length}`);
  }

  if (patch.validUntil !== undefined) pushSet('valid_until', patch.validUntil);
  if (patch.status !== undefined) pushSet('status', patch.status);

  if (sets.length === 0) {
    const current = await getDriverCarrierLinkById(linkId, driverId, integrationAccountId, client);
    if (!current || current.version !== expectedVersion) {
      return linkNotFoundOrConflict(linkId, driverId, integrationAccountId, expectedVersion, client);
    }
    return current;
  }

  // Trigger `trg_transport_driver_carrier_links_version` cuida do bump de version e updated_at.
  const result = await execute<{ id: string }>(
    `update transport_driver_carrier_links
        set ${sets.join(', ')}
      where id = $1
        and driver_id = $2
        and integration_account_id = $3
        and version = $4
      returning id`,
    values
  );

  if ((result.rowCount ?? 0) === 0) {
    return linkNotFoundOrConflict(linkId, driverId, integrationAccountId, expectedVersion, client);
  }
  const updated = await getDriverCarrierLinkById(linkId, driverId, integrationAccountId, client);
  if (!updated) {
    return linkNotFoundOrConflict(linkId, driverId, integrationAccountId, expectedVersion, client);
  }
  return updated;
}

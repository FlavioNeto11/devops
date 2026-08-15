/**
 * Repositório de `transport_parties`/`transport_party_roles` (PR-A3, DL-103).
 *
 * TENANCY OBRIGATÓRIA: toda query de leitura/escrita por id filtra também por
 * `integration_account_id` — nenhuma função aqui devolve (ou muta) um registro de outra conta.
 * Isso é o que garante o isolamento entre contas na camada de dados (ver
 * `tests/api/transporte-cadastros.test.js`).
 *
 * Locking otimista via coluna `version` (molde `dmr-repo.ts`): `updatePartyById` faz
 * `where id = $ and integration_account_id = $ and version = $expectedVersion` e distingue
 * 404 (registro inexistente NESTA conta) de 409 (existe, mas version está defasada) — nunca
 * revela a um chamador de outra conta se o id existe em outro lugar.
 *
 * Padrão da casa: SQL parametrizado, client opcional (`DbClient`) para participar de
 * transações do chamador (molde `regulatory-repo.ts`).
 */

import type { PoolClient } from 'pg';
import { query } from '../db/pool.js';
import { AppError } from '../lib/problem.js';
import { createPrefixedId } from '../lib/ids.js';
import type {
  BrazilianStateCode,
  PartyDocumentType,
  PartyRole,
  RntrcCategory,
  RntrcStatus,
  RntrcVerificationSource,
  TransportParty
} from '../lib/transport/transport-party-types.js';

type DbClient = Pick<PoolClient, 'query'> | null;

function getQueryExecutor(client: DbClient = null) {
  return client?.query?.bind(client) || query;
}

type PartyRow = {
  id: string;
  integration_account_id: string;
  document_type: string;
  document_number: string;
  legal_name: string;
  trade_name: string | null;
  rntrc_number: string | null;
  rntrc_category: string | null;
  rntrc_status: string;
  rntrc_verified_at: Date | string | null;
  rntrc_verification_source: string;
  municipality: string | null;
  uf: string | null;
  is_active: boolean;
  metadata: unknown;
  correlation_id: string;
  version: number;
  created_at: Date | string;
  updated_at: Date | string;
};

type PartyRoleRow = {
  id: string;
  party_id: string;
  role: string;
  created_at: Date | string;
};

function toIso(value: Date | string | null | undefined): string | null {
  if (value == null) return null;
  if (value instanceof Date) return value.toISOString();
  return String(value);
}

function toJsonObject(value: unknown): Record<string, unknown> {
  if (value && typeof value === 'object' && !Array.isArray(value)) {
    return value as Record<string, unknown>;
  }
  return {};
}

function mapRow(row: PartyRow | undefined): TransportParty | null {
  if (!row) return null;
  return {
    id: row.id,
    integrationAccountId: row.integration_account_id,
    documentType: row.document_type as PartyDocumentType,
    documentNumber: row.document_number,
    legalName: row.legal_name,
    tradeName: row.trade_name,
    rntrcNumber: row.rntrc_number,
    rntrcCategory: row.rntrc_category as RntrcCategory | null,
    rntrcStatus: row.rntrc_status as RntrcStatus,
    rntrcVerifiedAt: toIso(row.rntrc_verified_at),
    rntrcVerificationSource: row.rntrc_verification_source as RntrcVerificationSource,
    municipality: row.municipality,
    uf: row.uf as BrazilianStateCode | null,
    isActive: Boolean(row.is_active),
    metadata: toJsonObject(row.metadata),
    correlationId: row.correlation_id,
    version: Number(row.version ?? 1),
    createdAt: toIso(row.created_at) ?? '',
    updatedAt: toIso(row.updated_at) ?? ''
  };
}

export type PartyInsertInput = {
  id: string;
  integrationAccountId: string;
  documentType: PartyDocumentType;
  documentNumber: string;
  legalName: string;
  tradeName?: string | null;
  rntrcNumber?: string | null;
  rntrcCategory?: RntrcCategory | null;
  rntrcStatus?: RntrcStatus;
  rntrcVerifiedAt?: string | null;
  rntrcVerificationSource?: RntrcVerificationSource;
  municipality?: string | null;
  uf?: BrazilianStateCode | null;
  isActive?: boolean;
  metadata?: Record<string, unknown>;
  correlationId: string;
};

export async function insertParty(input: PartyInsertInput, client: DbClient = null): Promise<TransportParty> {
  const execute = getQueryExecutor(client);
  const result = await execute<PartyRow>(
    `insert into transport_parties (
       id, integration_account_id, document_type, document_number, legal_name, trade_name,
       rntrc_number, rntrc_category, rntrc_status, rntrc_verified_at, rntrc_verification_source,
       municipality, uf, is_active, metadata, correlation_id, version
     ) values (
       $1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15::jsonb, $16, 1
     )
     returning *`,
    [
      input.id,
      input.integrationAccountId,
      input.documentType,
      input.documentNumber,
      input.legalName,
      input.tradeName ?? null,
      input.rntrcNumber ?? null,
      input.rntrcCategory ?? null,
      input.rntrcStatus ?? 'unknown',
      input.rntrcVerifiedAt ?? null,
      input.rntrcVerificationSource ?? 'manual',
      input.municipality ?? null,
      input.uf ?? null,
      input.isActive ?? true,
      JSON.stringify(input.metadata ?? {}),
      input.correlationId
    ]
  );

  const row = mapRow(result.rows[0]);
  if (!row) {
    throw new AppError(500, 'Internal Server Error', `Falha ao inserir transportador ${input.id}.`, {
      code: 'TRANSPORT_PARTY_INSERT_FAILED'
    });
  }
  return row;
}

export type PartyListFilters = {
  search?: string;
  rntrcStatus?: string;
  role?: string;
  page?: number;
  pageSize?: number;
};

const DEFAULT_PAGE_SIZE = 20;
const MAX_PAGE_SIZE = 200;

export async function listParties(
  integrationAccountId: string,
  filters: PartyListFilters = {},
  client: DbClient = null
): Promise<{ items: TransportParty[]; total: number; page: number; pageSize: number }> {
  const execute = getQueryExecutor(client);
  const where: string[] = ['p.integration_account_id = $1'];
  const values: unknown[] = [integrationAccountId];

  if (filters.search) {
    values.push(`%${filters.search}%`);
    where.push(`(p.legal_name ilike $${values.length} or p.trade_name ilike $${values.length} or p.document_number ilike $${values.length})`);
  }
  if (filters.rntrcStatus) {
    values.push(filters.rntrcStatus);
    where.push(`p.rntrc_status = $${values.length}`);
  }
  if (filters.role) {
    values.push(filters.role);
    where.push(`exists (select 1 from transport_party_roles r where r.party_id = p.id and r.role = $${values.length})`);
  }

  const whereSql = `where ${where.join(' and ')}`;
  const page = Math.max(Math.floor(filters.page ?? 1), 1);
  const pageSize = Math.min(Math.max(Math.floor(filters.pageSize ?? DEFAULT_PAGE_SIZE), 1), MAX_PAGE_SIZE);
  const offset = (page - 1) * pageSize;

  const totalResult = await execute<{ count: string }>(
    `select count(*)::text as count from transport_parties p ${whereSql}`,
    values
  );
  const total = Number(totalResult.rows[0]?.count ?? 0);

  const limitValues = [...values, pageSize, offset];
  const rowsResult = await execute<PartyRow>(
    `select p.* from transport_parties p
      ${whereSql}
      order by p.legal_name asc, p.id asc
      limit $${limitValues.length - 1} offset $${limitValues.length}`,
    limitValues
  );

  const items = rowsResult.rows.map(mapRow).filter((row): row is TransportParty => row !== null);
  return { items, total, page, pageSize };
}

export async function getPartyById(
  id: string,
  integrationAccountId: string,
  client: DbClient = null
): Promise<TransportParty | null> {
  const execute = getQueryExecutor(client);
  const result = await execute<PartyRow>(
    'select * from transport_parties where id = $1 and integration_account_id = $2',
    [id, integrationAccountId]
  );
  return mapRow(result.rows[0]);
}

export type PartyUpdatePatch = Partial<Pick<
  TransportParty,
  | 'legalName'
  | 'tradeName'
  | 'rntrcNumber'
  | 'rntrcCategory'
  | 'rntrcStatus'
  | 'rntrcVerifiedAt'
  | 'rntrcVerificationSource'
  | 'municipality'
  | 'uf'
  | 'isActive'
  | 'metadata'
>>;

async function partyNotFoundOrConflict(
  id: string,
  integrationAccountId: string,
  expectedVersion: number,
  client: DbClient
): Promise<never> {
  const execute = getQueryExecutor(client);
  // Checagem restrita À MESMA CONTA — não revela se o id existe sob outra conta (isolamento).
  const existing = await execute<{ version: number }>(
    'select version from transport_parties where id = $1 and integration_account_id = $2',
    [id, integrationAccountId]
  );
  if ((existing.rowCount ?? 0) === 0) {
    throw new AppError(404, 'Not Found', `Transportador ${id} não encontrado.`, {
      code: 'TRANSPORT_PARTY_NOT_FOUND'
    });
  }
  throw new AppError(
    409,
    'Conflict',
    `Transportador ${id} foi modificado por outro processo (esperado version=${expectedVersion}, atual=${existing.rows[0]?.version}).`,
    { code: 'TRANSPORT_PARTY_VERSION_CONFLICT' }
  );
}

export async function updatePartyById(
  id: string,
  integrationAccountId: string,
  expectedVersion: number,
  patch: PartyUpdatePatch,
  client: DbClient = null
): Promise<TransportParty> {
  const execute = getQueryExecutor(client);
  const sets: string[] = [];
  const values: unknown[] = [id, integrationAccountId, expectedVersion];

  function pushSet(column: string, value: unknown, jsonb = false) {
    values.push(value);
    sets.push(`${column} = $${values.length}${jsonb ? '::jsonb' : ''}`);
  }

  if (patch.legalName !== undefined) pushSet('legal_name', patch.legalName);
  if (patch.tradeName !== undefined) pushSet('trade_name', patch.tradeName);
  if (patch.rntrcNumber !== undefined) pushSet('rntrc_number', patch.rntrcNumber);
  if (patch.rntrcCategory !== undefined) pushSet('rntrc_category', patch.rntrcCategory);
  if (patch.rntrcStatus !== undefined) pushSet('rntrc_status', patch.rntrcStatus);
  if (patch.rntrcVerifiedAt !== undefined) pushSet('rntrc_verified_at', patch.rntrcVerifiedAt);
  if (patch.rntrcVerificationSource !== undefined) pushSet('rntrc_verification_source', patch.rntrcVerificationSource);
  if (patch.municipality !== undefined) pushSet('municipality', patch.municipality);
  if (patch.uf !== undefined) pushSet('uf', patch.uf);
  if (patch.isActive !== undefined) pushSet('is_active', patch.isActive);
  if (patch.metadata !== undefined) pushSet('metadata', JSON.stringify(patch.metadata), true);

  if (sets.length === 0) {
    const current = await execute<PartyRow>(
      'select * from transport_parties where id = $1 and integration_account_id = $2 and version = $3',
      [id, integrationAccountId, expectedVersion]
    );
    const row = mapRow(current.rows[0]);
    if (!row) return partyNotFoundOrConflict(id, integrationAccountId, expectedVersion, client);
    return row;
  }

  // Trigger `trg_transport_parties_version` cuida do bump de version e updated_at.
  const result = await execute<PartyRow>(
    `update transport_parties
        set ${sets.join(', ')}
      where id = $1
        and integration_account_id = $2
        and version = $3
      returning *`,
    values
  );

  const row = mapRow(result.rows[0]);
  if (!row) return partyNotFoundOrConflict(id, integrationAccountId, expectedVersion, client);
  return row;
}

// =============================================================================
// transport_party_roles
// =============================================================================

function mapRoleRow(row: PartyRoleRow): PartyRole {
  return row.role as PartyRole;
}

export async function insertPartyRoles(
  partyId: string,
  roles: readonly PartyRole[],
  client: DbClient = null
): Promise<void> {
  if (roles.length === 0) return;
  const execute = getQueryExecutor(client);
  for (const role of roles) {
    await execute(
      `insert into transport_party_roles (id, party_id, role)
       values ($1, $2, $3)
       on conflict (party_id, role) do nothing`,
      [createPrefixedId('trprole'), partyId, role]
    );
  }
}

/** Substitui integralmente o conjunto de papéis da parte (usado pelo PATCH quando `roles` vem no body). */
export async function replacePartyRoles(
  partyId: string,
  roles: readonly PartyRole[],
  client: DbClient = null
): Promise<void> {
  const execute = getQueryExecutor(client);
  await execute('delete from transport_party_roles where party_id = $1', [partyId]);
  await insertPartyRoles(partyId, roles, client);
}

export async function listPartyRoles(partyId: string, client: DbClient = null): Promise<PartyRole[]> {
  const execute = getQueryExecutor(client);
  const result = await execute<PartyRoleRow>(
    'select * from transport_party_roles where party_id = $1 order by role asc',
    [partyId]
  );
  return result.rows.map(mapRoleRow);
}

/** Carrega papéis de VÁRIAS partes de uma vez (evita N+1 na listagem). */
export async function listPartyRolesForParties(
  partyIds: readonly string[],
  client: DbClient = null
): Promise<Map<string, PartyRole[]>> {
  const map = new Map<string, PartyRole[]>();
  if (partyIds.length === 0) return map;

  const execute = getQueryExecutor(client);
  const result = await execute<PartyRoleRow>(
    'select * from transport_party_roles where party_id = any($1::text[]) order by role asc',
    [partyIds]
  );
  for (const row of result.rows) {
    const bucket = map.get(row.party_id) ?? [];
    bucket.push(mapRoleRow(row));
    map.set(row.party_id, bucket);
  }
  return map;
}

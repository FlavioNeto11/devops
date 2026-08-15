/**
 * Repositório do schema registry de DF-e (`dfe_schema_registry`, PR-E1, DL-103).
 *
 * SEM tenancy (o registry é global, molde `vpo_providers`/catálogo regulatório). SEM escrita aqui:
 * o único escritor é o seed (`bootstrap/dfe-schema-seed.ts`). A resolução temporal DELEGA para
 * `resolveVersionFromList` (`lib/transport/regulatory-temporal.ts`) — mesmo predicado do catálogo
 * regulatório, não duplicado em SQL.
 */

import type { PoolClient } from 'pg';
import { query } from '../db/pool.js';
import { resolveVersionFromList } from '../lib/transport/regulatory-temporal.js';
import type { DfeSchemaRegistryEntry, FiscalDocumentType } from '../lib/transport/dfe-types.js';

type DbClient = Pick<PoolClient, 'query'> | null;

function getQueryExecutor(client: DbClient = null) {
  return client?.query?.bind(client) || query;
}

type DfeSchemaRegistryRow = {
  id: string;
  document_type: string;
  layout_version: string;
  technical_note: string | null;
  effective_from: Date | string;
  effective_until: Date | string | null;
  validation_profile: unknown;
  notes: string;
  version: number;
  created_at: Date | string;
  updated_at: Date | string;
};

function toIso(value: Date | string | null | undefined): string | null {
  if (value == null) return null;
  if (value instanceof Date) return value.toISOString();
  return String(value);
}

function toIsoDateOnly(value: Date | string | null | undefined): string {
  if (value == null) return '';
  if (value instanceof Date) return value.toISOString().slice(0, 10);
  return String(value).slice(0, 10);
}

function toJsonObject(value: unknown): Record<string, unknown> {
  if (value && typeof value === 'object' && !Array.isArray(value)) {
    return value as Record<string, unknown>;
  }
  return {};
}

function mapRow(row: DfeSchemaRegistryRow | undefined): DfeSchemaRegistryEntry | null {
  if (!row) return null;
  return {
    id: row.id,
    documentType: row.document_type as FiscalDocumentType,
    layoutVersion: row.layout_version,
    technicalNote: row.technical_note,
    effectiveFrom: toIsoDateOnly(row.effective_from),
    effectiveUntil: row.effective_until == null ? null : toIsoDateOnly(row.effective_until),
    validationProfile: toJsonObject(row.validation_profile),
    notes: row.notes,
    version: Number(row.version ?? 1),
    createdAt: toIso(row.created_at) ?? '',
    updatedAt: toIso(row.updated_at) ?? ''
  };
}

/** Todas as entradas do registry, opcionalmente filtradas por tipo. */
export async function listSchemaRegistryEntries(
  filters: { documentType?: FiscalDocumentType } = {},
  client: DbClient = null
): Promise<DfeSchemaRegistryEntry[]> {
  const execute = getQueryExecutor(client);
  const where: string[] = [];
  const values: unknown[] = [];
  if (filters.documentType) {
    values.push(filters.documentType);
    where.push(`document_type = $${values.length}`);
  }
  const whereSql = where.length ? `where ${where.join(' and ')}` : '';
  const result = await execute<DfeSchemaRegistryRow>(
    `select * from dfe_schema_registry ${whereSql} order by document_type asc, layout_version asc, effective_from asc`,
    values
  );
  return result.rows.map(mapRow).filter((row): row is DfeSchemaRegistryEntry => row !== null);
}

/**
 * Entrada VIGENTE do registry para (documentType, layoutVersion) na data de referência
 * (`effective_from <= d` e `effective_until` nulo OU `>= d`) — resolve entre a entrada BASELINE
 * (`technical_note` nulo) e uma entrada de nota técnica futura (ex.: NT MDF-e 2026.001) exatamente
 * como o catálogo regulatório resolve versões de regra. `null` quando nenhuma janela cobre a data
 * (layout desconhecido, ou nenhuma entrada vigente ainda).
 */
export async function findActiveSchemaRegistryEntry(
  documentType: FiscalDocumentType,
  layoutVersion: string,
  referenceDate: string,
  client: DbClient = null
): Promise<DfeSchemaRegistryEntry | null> {
  const execute = getQueryExecutor(client);
  const result = await execute<DfeSchemaRegistryRow>(
    `select * from dfe_schema_registry
      where document_type = $1 and layout_version = $2
      order by effective_from asc`,
    [documentType, layoutVersion]
  );
  const entries = result.rows.map(mapRow).filter((row): row is DfeSchemaRegistryEntry => row !== null);
  return resolveVersionFromList(entries, referenceDate);
}

export async function getSchemaRegistryEntryById(id: string, client: DbClient = null): Promise<DfeSchemaRegistryEntry | null> {
  const execute = getQueryExecutor(client);
  const result = await execute<DfeSchemaRegistryRow>('select * from dfe_schema_registry where id = $1', [id]);
  return mapRow(result.rows[0]);
}

/**
 * MTR provisório repository — SQL real (fase 05-persistence-queue,
 * cadeia `mtr-provisorio-fluxo-base`).
 *
 * Reusa a tabela `manifests` filtrada por `kind = 'provisorio'`
 * (decisão R3-C — ver
 * docs/handoffs/mtr-provisorio-fluxo-base/04-backend-contracts.md).
 *
 * A migration `src/sql/014_mtr_provisorio_kind.sql` adiciona:
 *   - `kind text not null default 'definitivo'` (check 'definitivo'|'provisorio');
 *   - `provisional_number text` (nullable);
 *   - `definitive_manifest_id text` (nullable, FK opcional para `manifests(id)`);
 *   - índices `ix_manifests_kind` e parcial `ix_manifests_kind_provisorio`.
 *
 * Locking otimista preservado via coluna `version` + trigger
 * `trg_manifests_version` (DL-022). Constraints DL-022 da tabela
 * `manifests` (chk_manifest_submitted_integrity etc.) seguem aplicáveis
 * a este ramo.
 */

import { query } from '../db/pool.js';
import type { PoolClient } from 'pg';
import { AppError } from '../lib/problem.js';

type DbClient = Pick<PoolClient, 'query'> | null;
type JsonObject = Record<string, unknown>;
type IsoLike = Date | string | null | undefined;

export type MtrProvisorioStatus =
  | 'draft'
  | 'queued_submit'
  | 'submitting'
  | 'awaiting_remote'
  | 'submitted'
  | 'failed_submit'
  | 'queued_print'
  | 'cancelled';

export type MtrProvisorioRecord = {
  id: string;
  integrationAccountId: string;
  sessionContextId: string | null;
  kind: 'provisorio';
  status: MtrProvisorioStatus;
  externalStatus: string | null;
  externalReference: JsonObject | null;
  externalHashCode: string | null;
  manifestNumber: string | null;
  provisionalNumber: string | null;
  definitiveManifestId: string | null;
  payload: JsonObject;
  requestedBy: string | null;
  correlationId: string | null;
  version: number;
  createdAt: string;
  updatedAt: string;
};

export type MtrProvisorioListItem = {
  id: string;
  kind: 'provisorio';
  status: MtrProvisorioStatus;
  externalStatus: string | null;
  manifestNumber: string | null;
  provisionalNumber: string | null;
  externalCode: number | null;
  externalHashCode: string | null;
  expeditionDate: string;
  generator: { partnerCode: number; description: string };
  carrier: { partnerCode: number; description: string };
  receiver: { partnerCode: number; description: string };
  driverName: string | null;
  vehiclePlate: string | null;
  groupId: string | null;
  sourceManifestId: string | null;
  batchIndex: number | null;
  batchSize: number | null;
  batchKind: string | null;
  lastSyncAt: string | null;
};

export type MtrProvisorioListFilters = {
  integrationAccountId?: string | null;
  status?: string | null;
  dateFrom?: string | null;
  dateTo?: string | null;
  page: number;
  pageSize: number;
};

export type MtrProvisorioInsertInput = {
  id: string;
  integrationAccountId: string;
  sessionContextId: string | null;
  status: MtrProvisorioStatus;
  externalStatus: string | null;
  payload: JsonObject;
  requestedBy: string | null;
  correlationId: string | null;
};

export type MtrProvisorioUpdatePatch = {
  status?: MtrProvisorioStatus | null;
  externalStatus?: string | null;
  externalReference?: JsonObject | null;
  externalHashCode?: string | null;
  provisionalNumber?: string | null;
  definitiveManifestId?: string | null;
  payload?: JsonObject | null;
  sessionContextId?: string | null;
  commandId?: string | null;
  lastSubmittedAt?: string | null;
  lastSyncAt?: string | null;
};

type ManifestRow = {
  id: string;
  integration_account_id: string;
  session_context_id: string | null;
  kind: string;
  status: string;
  external_status: string | null;
  external_reference: JsonObject | null;
  external_hash_code: string | null;
  provisional_number: string | null;
  definitive_manifest_id: string | null;
  payload: JsonObject | null;
  requested_by: string | null;
  correlation_id: string | null;
  version: number;
  last_submitted_at: IsoLike;
  last_sync_at: IsoLike;
  created_at: IsoLike;
  updated_at: IsoLike;
};

function toIso(value: IsoLike): string | null {
  if (value == null) return null;
  if (value instanceof Date) return value.toISOString();
  return value;
}

function getQueryExecutor(client: DbClient = null) {
  return client?.query?.bind(client) || query;
}

function asRecord(value: unknown): JsonObject {
  return value && typeof value === 'object' && !Array.isArray(value)
    ? (value as JsonObject)
    : {};
}

function pickString(value: unknown): string | null {
  if (value == null) return null;
  const str = String(value).trim();
  return str.length === 0 ? null : str;
}

function mapRow(row?: ManifestRow): MtrProvisorioRecord | null {
  if (!row) return null;
  const externalReference = row.external_reference || null;
  const manNumero = externalReference && typeof externalReference === 'object'
    ? pickString((externalReference as JsonObject).manNumero)
    : null;
  return {
    id: row.id,
    integrationAccountId: row.integration_account_id,
    sessionContextId: row.session_context_id,
    kind: 'provisorio',
    status: row.status as MtrProvisorioStatus,
    externalStatus: row.external_status,
    externalReference,
    externalHashCode: row.external_hash_code,
    manifestNumber: manNumero,
    provisionalNumber: row.provisional_number,
    definitiveManifestId: row.definitive_manifest_id,
    payload: row.payload || {},
    requestedBy: row.requested_by,
    correlationId: row.correlation_id,
    version: row.version,
    createdAt: toIso(row.created_at) || '',
    updatedAt: toIso(row.updated_at) || ''
  };
}

function mapListItem(row: ManifestRow): MtrProvisorioListItem {
  const payload = asRecord(row.payload);
  const generator = asRecord(payload.generator);
  const carrier = asRecord(payload.carrier);
  const receiver = asRecord(payload.receiver);
  const externalReference = asRecord(row.external_reference);
  const batch = asRecord(payload.batch);
  const expeditionDate = pickString(payload.expeditionDate)
    || (toIso(row.created_at) || '').slice(0, 10);
  const externalCodeRaw = externalReference.manCodigo;
  const externalCode = externalCodeRaw == null
    ? null
    : Number.isFinite(Number(externalCodeRaw)) ? Number(externalCodeRaw) : null;
  const partnerCode = (value: unknown): number => {
    const n = Number(pickString(value) || '0');
    return Number.isFinite(n) ? n : 0;
  };
  const description = (value: unknown): string => pickString(value) || '';

  return {
    id: row.id,
    kind: 'provisorio',
    status: row.status as MtrProvisorioStatus,
    externalStatus: row.external_status,
    manifestNumber: pickString(externalReference.manNumero),
    provisionalNumber: row.provisional_number,
    externalCode,
    externalHashCode: row.external_hash_code,
    expeditionDate,
    generator: {
      partnerCode: partnerCode(generator.partnerCode),
      description: description(generator.description)
    },
    carrier: {
      partnerCode: partnerCode(carrier.partnerCode),
      description: description(carrier.description)
    },
    receiver: {
      partnerCode: partnerCode(receiver.partnerCode),
      description: description(receiver.description)
    },
    driverName: pickString(payload.driverName),
    vehiclePlate: pickString(payload.vehiclePlate),
    groupId: pickString(batch.groupId),
    sourceManifestId: pickString(batch.sourceManifestId),
    batchIndex: batch.index == null ? null : Number(batch.index) || null,
    batchSize: batch.size == null ? null : Number(batch.size) || null,
    batchKind: pickString(batch.kind),
    lastSyncAt: toIso(row.last_sync_at)
  };
}

async function requireMtrProvisorioSessionOwnership(
  integrationAccountId: string,
  sessionContextId: string | null,
  client: DbClient = null
) {
  if (!sessionContextId) return;
  const execute = getQueryExecutor(client);
  const result = await execute<{ integration_account_id: string }>(
    'select integration_account_id from session_contexts where id = $1',
    [sessionContextId]
  );
  const owner = result.rows[0]?.integration_account_id;
  if (!owner) {
    throw new AppError(
      400,
      'Bad Request',
      `sessionContextId ${sessionContextId} was not found.`
    );
  }
  if (owner !== integrationAccountId) {
    throw new AppError(
      400,
      'Bad Request',
      `sessionContextId ${sessionContextId} does not belong to integrationAccountId ${integrationAccountId}.`
    );
  }
}

export async function insertMtrProvisorio(
  input: MtrProvisorioInsertInput
): Promise<MtrProvisorioRecord> {
  await requireMtrProvisorioSessionOwnership(
    input.integrationAccountId,
    input.sessionContextId
  );
  const result = await query<ManifestRow>(
    `insert into manifests(
      id, integration_account_id, session_context_id, kind, status, external_status,
      payload, requested_by, correlation_id
    ) values ($1,$2,$3,'provisorio',$4,$5,$6::jsonb,$7,$8)
    returning *`,
    [
      input.id,
      input.integrationAccountId,
      input.sessionContextId,
      input.status,
      input.externalStatus,
      JSON.stringify(input.payload || {}),
      input.requestedBy,
      input.correlationId
    ]
  );
  const mapped = mapRow(result.rows[0]);
  if (!mapped) {
    throw new AppError(500, 'Internal Server Error', 'Falha ao inserir MTR provisório.');
  }
  return mapped;
}

export async function findMtrProvisorioById(
  id: string,
  client: DbClient = null
): Promise<MtrProvisorioRecord | null> {
  const execute = getQueryExecutor(client);
  const result = await execute<ManifestRow>(
    `select * from manifests where id = $1 and kind = 'provisorio'`,
    [id]
  );
  return mapRow(result.rows[0]);
}

export async function listMtrProvisorio(
  filters: MtrProvisorioListFilters
): Promise<{ items: MtrProvisorioListItem[]; totalItems: number }> {
  const values: unknown[] = [];
  const where: string[] = [`kind = 'provisorio'`];
  if (filters.integrationAccountId) {
    values.push(filters.integrationAccountId);
    where.push(`integration_account_id = $${values.length}`);
  }
  if (filters.status) {
    values.push(filters.status);
    where.push(`status = $${values.length}`);
  }
  const dateExpr = `case
    when nullif(payload ->> 'expeditionDate', '') is not null
      then to_date(payload ->> 'expeditionDate', 'YYYY-MM-DD')
    else date(created_at)
  end`;
  if (filters.dateFrom) {
    values.push(filters.dateFrom);
    where.push(`${dateExpr} >= date($${values.length})`);
  }
  if (filters.dateTo) {
    values.push(filters.dateTo);
    where.push(`${dateExpr} <= date($${values.length})`);
  }
  const whereSql = `where ${where.join(' and ')}`;
  const offset = (filters.page - 1) * filters.pageSize;
  values.push(filters.pageSize, offset);

  const rows = await query<ManifestRow>(
    `select * from manifests ${whereSql} order by created_at desc limit $${values.length - 1} offset $${values.length}`,
    values
  );
  const countValues = values.slice(0, -2);
  const total = await query<{ count: number }>(
    `select count(*)::int as count from manifests ${whereSql}`,
    countValues
  );
  return {
    items: rows.rows.map(mapListItem),
    totalItems: total.rows[0]?.count || 0
  };
}

export async function deleteMtrProvisorioDraft(
  id: string,
  expectedVersion: number
): Promise<{ id: string; status: 'cancelled'; cancelledAt: string }> {
  const result = await query<ManifestRow>(
    `update manifests
        set status = 'cancelled',
            external_status = coalesce(external_status, 'cancelled')
      where id = $1
        and kind = 'provisorio'
        and version = $2
      returning *`,
    [id, expectedVersion]
  );
  if ((result.rowCount || 0) === 0) {
    const exists = await query<{ version: number }>(
      `select version from manifests where id = $1 and kind = 'provisorio'`,
      [id]
    );
    if ((exists.rowCount || 0) === 0) {
      throw new AppError(
        404,
        'Not Found',
        `Manifesto provisório ${id} não encontrado.`
      );
    }
    throw new AppError(
      409,
      'Conflict',
      `Conflito de versão ao cancelar manifesto provisório ${id}.`,
      { code: 'MTR_PROVISORIO_VERSION_CONFLICT' }
    );
  }
  const row = result.rows[0];
  if (!row) {
    throw new AppError(500, 'Internal Server Error', 'Falha ao cancelar manifesto provisório.');
  }
  return {
    id: row.id,
    status: 'cancelled',
    cancelledAt: toIso(row.updated_at) || new Date().toISOString()
  };
}

export async function updateMtrProvisorioStatus(
  id: string,
  patch: MtrProvisorioUpdatePatch,
  expectedVersion: number,
  client: DbClient = null
): Promise<MtrProvisorioRecord> {
  const execute = getQueryExecutor(client);
  const result = await execute<ManifestRow>(
    `update manifests set
        session_context_id = coalesce($3, session_context_id),
        status = coalesce($4, status),
        external_status = coalesce($5, external_status),
        external_reference = coalesce($6::jsonb, external_reference),
        external_hash_code = coalesce($7, external_hash_code),
        provisional_number = coalesce($8, provisional_number),
        definitive_manifest_id = coalesce($9, definitive_manifest_id),
        payload = coalesce($10::jsonb, payload),
        last_submitted_at = coalesce($11, last_submitted_at),
        last_sync_at = coalesce($12, last_sync_at)
      where id = $1
        and kind = 'provisorio'
        and version = $2
      returning *`,
    [
      id,
      expectedVersion,
      patch.sessionContextId ?? null,
      patch.status ?? null,
      patch.externalStatus ?? null,
      patch.externalReference === undefined || patch.externalReference === null
        ? null
        : JSON.stringify(patch.externalReference),
      patch.externalHashCode ?? null,
      patch.provisionalNumber ?? null,
      patch.definitiveManifestId ?? null,
      patch.payload ? JSON.stringify(patch.payload) : null,
      patch.lastSubmittedAt ?? null,
      patch.lastSyncAt ?? null
    ]
  );
  if ((result.rowCount || 0) === 0) {
    const exists = await execute<{ version: number }>(
      `select version from manifests where id = $1 and kind = 'provisorio'`,
      [id]
    );
    if ((exists.rowCount || 0) === 0) {
      throw new AppError(
        404,
        'Not Found',
        `Manifesto provisório ${id} não encontrado.`
      );
    }
    throw new AppError(
      409,
      'Conflict',
      `Conflito de versão ao atualizar manifesto provisório ${id}.`,
      { code: 'MTR_PROVISORIO_VERSION_CONFLICT' }
    );
  }
  const mapped = mapRow(result.rows[0]);
  if (!mapped) {
    throw new AppError(500, 'Internal Server Error', 'Falha ao atualizar manifesto provisório.');
  }
  return mapped;
}

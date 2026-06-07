import { query } from '../db/pool.js';
import type { PoolClient } from 'pg';
import { AppError } from '../lib/problem.js';

type DbClient = Pick<PoolClient, 'query'> | null;
type JsonObject = Record<string, unknown>;
type IsoLike = Date | string | null | undefined;
type ManifestFilterValue = string | number | null;

type ManifestRow = {
  id: string;
  integration_account_id: string;
  session_context_id: string | null;
  status: string;
  external_status: string | null;
  external_reference: JsonObject | null;
  external_hash_code: string | null;
  payload: JsonObject | null;
  requested_by: string | null;
  correlation_id: string | null;
  last_submitted_at: IsoLike;
  last_sync_at: IsoLike;
  created_at: IsoLike;
  updated_at: IsoLike;
};

type ManifestDocumentRow = {
  id: string;
  manifest_id: string;
  type: string;
  status: string;
  mime_type: string;
  file_name: string;
  hash: string;
  storage_path: string;
  generated_at: IsoLike;
};

function getQueryExecutor(client: DbClient = null) {
  return client?.query?.bind(client) || query;
}

async function requireManifestSessionOwnership(
  integrationAccountId: string,
  sessionContextId?: string | null,
  client: DbClient = null
) {
  if (!sessionContextId) {
    return;
  }

  const execute = getQueryExecutor(client);
  const sessionContext = await execute<{ integration_account_id: string }>(
    'select integration_account_id from session_contexts where id = $1',
    [sessionContextId]
  );

  const ownerIntegrationAccountId = sessionContext.rows[0]?.integration_account_id;
  if (!ownerIntegrationAccountId) {
    throw new AppError(400, 'Bad Request', `sessionContextId ${sessionContextId} was not found.`);
  }

  if (ownerIntegrationAccountId !== integrationAccountId) {
    throw new AppError(400, 'Bad Request', `sessionContextId ${sessionContextId} does not belong to integrationAccountId ${integrationAccountId}.`);
  }
}

function toIso(value: IsoLike): string | null {
  if (value == null) return null;
  if (value instanceof Date) return value.toISOString();
  return value;
}

function isPlainObject(value: unknown): value is JsonObject {
  return value != null && typeof value === 'object' && !Array.isArray(value);
}

function mergePreservingNonNull(existingValue: unknown, incomingValue: unknown): unknown {
  if (incomingValue === undefined) {
    return existingValue;
  }

  if (incomingValue === null) {
    return existingValue ?? null;
  }

  if (Array.isArray(incomingValue)) {
    if (incomingValue.length === 0 && Array.isArray(existingValue) && existingValue.length > 0) {
      return existingValue;
    }
    return incomingValue;
  }

  if (isPlainObject(existingValue) && isPlainObject(incomingValue)) {
    const merged = { ...existingValue };
    for (const [key, value] of Object.entries(incomingValue)) {
      merged[key] = mergePreservingNonNull(existingValue[key], value);
    }
    return merged;
  }

  return incomingValue;
}

function mapDocument(row?: ManifestDocumentRow) {
  if (!row) return undefined;
  return {
    id: row.id,
    type: row.type,
    status: row.status,
    mimeType: row.mime_type,
    fileName: row.file_name,
    hash: row.hash,
    storagePath: row.storage_path,
    generatedAt: toIso(row.generated_at),
    downloadUrl: `/v1/manifestos/${row.manifest_id}/documents/${row.id}`
  };
}

function mapRow(row?: ManifestRow) {
  if (!row) return undefined;
  return {
    id: row.id,
    integrationAccountId: row.integration_account_id,
    sessionContextId: row.session_context_id,
    status: row.status,
    externalStatus: row.external_status,
    externalReference: row.external_reference,
    externalHashCode: row.external_hash_code,
    payload: row.payload,
    requestedBy: row.requested_by,
    correlationId: row.correlation_id,
    lastSubmittedAt: toIso(row.last_submitted_at),
    lastSyncAt: toIso(row.last_sync_at),
    createdAt: toIso(row.created_at),
    updatedAt: toIso(row.updated_at)
  };
}

function getManifestFilterDateSql() {
  return `case
    when nullif(payload ->> 'expeditionDate', '') is not null
      then to_date(payload ->> 'expeditionDate', 'YYYY-MM-DD')
    when coalesce(requested_by, '') <> 'cetesb.search'
      then date(created_at)
    else null
  end`;
}

// Ordenacao opt-in. O default historico ('created_desc') ordena por tempo de
// insercao no espelho local (created_at), que NAO reflete a recencia de negocio
// do manifesto — um re-sync da CETESB reescreve created_at de manifestos antigos.
// 'recency_desc'/'recency_asc' ordenam pela data de negocio (data de expedicao,
// com fallback para created_at em manifestos locais), com desempate deterministico.
export type ManifestListOrderBy = 'created_desc' | 'recency_desc' | 'recency_asc';

function buildManifestOrderSql(orderBy: ManifestListOrderBy | null | undefined): string {
  const businessDateSql = getManifestFilterDateSql();
  if (orderBy === 'recency_desc') {
    return `order by (${businessDateSql}) desc nulls last, created_at desc, id desc`;
  }
  if (orderBy === 'recency_asc') {
    return `order by (${businessDateSql}) asc nulls last, created_at asc, id asc`;
  }
  return 'order by created_at desc';
}

export async function insertManifest(input: {
  id: string;
  integrationAccountId: string;
  sessionContextId?: string | null;
  status: string;
  externalStatus?: string | null;
  externalReference?: JsonObject | null;
  externalHashCode?: string | null;
  payload: JsonObject;
  requestedBy?: string | null;
  correlationId?: string | null;
}) {
  const result = await query<ManifestRow>(
    `insert into manifests(
      id, integration_account_id, session_context_id, status, external_status,
      external_reference, external_hash_code, payload, requested_by, correlation_id
    ) values ($1,$2,$3,$4,$5,$6::jsonb,$7,$8::jsonb,$9,$10)
    returning *`,
    [
      input.id,
      input.integrationAccountId,
      input.sessionContextId,
      input.status,
      input.externalStatus,
      input.externalReference ? JSON.stringify(input.externalReference) : JSON.stringify(null),
      input.externalHashCode,
      JSON.stringify(input.payload),
      input.requestedBy,
      input.correlationId
    ]
  );
  return mapRow(result.rows[0]);
}

export async function updateManifest(id: string, patch: {
  sessionContextId?: string | null;
  status?: string | null;
  externalStatus?: string | null;
  externalReference?: JsonObject | null;
  externalHashCode?: string | null;
  payload?: JsonObject | null;
  lastSubmittedAt?: string | null;
  lastSyncAt?: string | null;
}, client: DbClient = null) {
  const execute = getQueryExecutor(client);
  const result = await execute<ManifestRow>(
    `update manifests set
       session_context_id = coalesce($2, session_context_id),
       status = coalesce($3, status),
       external_status = coalesce($4, external_status),
       external_reference = coalesce($5::jsonb, external_reference),
       external_hash_code = coalesce($6, external_hash_code),
       payload = coalesce($7::jsonb, payload),
       last_submitted_at = coalesce($8, last_submitted_at),
       last_sync_at = coalesce($9, last_sync_at),
       updated_at = now()
     where id = $1
     returning *`,
    [
      id,
      patch.sessionContextId || null,
      patch.status || null,
      patch.externalStatus || null,
      patch.externalReference === undefined ? null : JSON.stringify(patch.externalReference),
      patch.externalHashCode || null,
      patch.payload ? JSON.stringify(patch.payload) : null,
      patch.lastSubmittedAt || null,
      patch.lastSyncAt || null
    ]
  );
  return mapRow(result.rows[0]);
}

export async function findManifestById(id: string, client: DbClient = null) {
  const execute = getQueryExecutor(client);
  const result = await execute<ManifestRow>('select * from manifests where id = $1', [id]);
  return mapRow(result.rows[0]);
}

export async function deleteManifestById(id: string, client: DbClient = null) {
  const execute = getQueryExecutor(client);
  const result = await execute('delete from manifests where id = $1', [id]);
  return (result.rowCount || 0) > 0;
}

export async function findManifestByIdForUpdate(id: string, client: DbClient) {
  if (!client?.query) {
    throw new Error('findManifestByIdForUpdate requires transaction client');
  }
  const result = await client.query<ManifestRow>('select * from manifests where id = $1 for update', [id]);
  return mapRow(result.rows[0]);
}

export async function listManifests(filters: {
  integrationAccountId?: string | null;
  status?: string | null;
  externalStatus?: string | null;
  dateFrom?: string | null;
  dateTo?: string | null;
  generatorCode?: ManifestFilterValue;
  carrierCode?: ManifestFilterValue;
  receiverCode?: ManifestFilterValue;
  manifestNumber?: ManifestFilterValue;
  groupId?: string | null;
  carrierQuery?: string | null;
  receiverQuery?: string | null;
  orderBy?: ManifestListOrderBy | null;
  page: number;
  pageSize: number;
}) {
  const manifestFilterDateSql = getManifestFilterDateSql();
  const values = [];
  const where = [];
  if (filters.integrationAccountId) {
    values.push(filters.integrationAccountId);
    where.push(`integration_account_id = $${values.length}`);
  }
  if (filters.status) {
    values.push(filters.status);
    where.push(`status = $${values.length}`);
  }
  if (filters.externalStatus) {
    values.push(filters.externalStatus);
    where.push(`external_status = $${values.length}`);
  }
  if (filters.dateFrom) {
    values.push(filters.dateFrom);
    where.push(`${manifestFilterDateSql} >= date($${values.length})`);
  }
  if (filters.dateTo) {
    values.push(filters.dateTo);
    where.push(`${manifestFilterDateSql} <= date($${values.length})`);
  }
  if (filters.generatorCode) {
    values.push(String(filters.generatorCode));
    where.push(`payload -> 'generator' ->> 'partnerCode' = $${values.length}`);
  }
  if (filters.carrierCode) {
    values.push(String(filters.carrierCode));
    where.push(`payload -> 'carrier' ->> 'partnerCode' = $${values.length}`);
  }
  if (filters.receiverCode) {
    values.push(String(filters.receiverCode));
    where.push(`payload -> 'receiver' ->> 'partnerCode' = $${values.length}`);
  }
  if (filters.manifestNumber) {
    values.push(`%${String(filters.manifestNumber).trim()}%`);
    where.push(`(
      coalesce(external_reference ->> 'manNumero', '') ilike $${values.length}
      or coalesce(payload -> 'externalSnapshot' ->> 'manNumero', '') ilike $${values.length}
      or coalesce(payload -> 'externalSnapshot' ->> 'manCodigo', '') ilike $${values.length}
    )`);
  }
  if (filters.groupId) {
    values.push(String(filters.groupId).trim());
    where.push(`coalesce(payload -> 'batch' ->> 'groupId', '') = $${values.length}`);
  }
  if (filters.carrierQuery) {
    values.push(`%${String(filters.carrierQuery).trim()}%`);
    where.push(`(
      coalesce(payload -> 'carrier' ->> 'description', '') ilike $${values.length}
      or coalesce(payload -> 'carrier' ->> 'partnerCode', '') ilike $${values.length}
      or coalesce(payload -> 'carrier' ->> 'document', '') ilike $${values.length}
      or coalesce(payload -> 'externalSnapshot' -> 'parceiroTransportador' ->> 'parDescricao', '') ilike $${values.length}
      or coalesce(payload -> 'externalSnapshot' -> 'parceiroTransportador' ->> 'parCodigo', '') ilike $${values.length}
      or coalesce(payload -> 'externalSnapshot' -> 'parceiroTransportador' ->> 'parDocumento', '') ilike $${values.length}
    )`);
  }
  if (filters.receiverQuery) {
    values.push(`%${String(filters.receiverQuery).trim()}%`);
    where.push(`(
      coalesce(payload -> 'receiver' ->> 'description', '') ilike $${values.length}
      or coalesce(payload -> 'receiver' ->> 'partnerCode', '') ilike $${values.length}
      or coalesce(payload -> 'receiver' ->> 'document', '') ilike $${values.length}
      or coalesce(payload -> 'externalSnapshot' -> 'parceiroDestinador' ->> 'parDescricao', '') ilike $${values.length}
      or coalesce(payload -> 'externalSnapshot' -> 'parceiroDestinador' ->> 'parCodigo', '') ilike $${values.length}
      or coalesce(payload -> 'externalSnapshot' -> 'parceiroDestinador' ->> 'parDocumento', '') ilike $${values.length}
    )`);
  }

  const whereSql = where.length ? `where ${where.join(' and ')}` : '';
  const orderSql = buildManifestOrderSql(filters.orderBy);
  const offset = (filters.page - 1) * filters.pageSize;
  values.push(filters.pageSize, offset);

  const rows = await query<ManifestRow>(
    `select * from manifests ${whereSql} ${orderSql} limit $${values.length - 1} offset $${values.length}`,
    values
  );

  const countValues = values.slice(0, -2);
  const total = await query(`select count(*)::int as count from manifests ${whereSql}`, countValues);

  return {
    items: rows.rows.map((row) => mapRow(row)),
    totalItems: total.rows[0]?.count || 0
  };
}

export async function deleteManifestsForMirrorWindow(filters: {
  integrationAccountId?: string | null;
  dateFrom?: string | null;
  dateTo?: string | null;
}) {
  const manifestFilterDateSql = getManifestFilterDateSql();
  const values = [];
  const where = [];

  if (!filters?.integrationAccountId) {
    return 0;
  }

  values.push(filters.integrationAccountId);
  where.push(`integration_account_id = $${values.length}`, `requested_by = 'cetesb.search'`);

  if (filters.dateFrom) {
    values.push(filters.dateFrom);
    where.push(`${manifestFilterDateSql} >= date($${values.length})`);
  }

  if (filters.dateTo) {
    values.push(filters.dateTo);
    where.push(`${manifestFilterDateSql} <= date($${values.length})`);
  }

  const whereSql = where.length ? `where ${where.join(' and ')}` : '';
  const result = await query(`delete from manifests ${whereSql}`, values);
  return result.rowCount || 0;
}

export async function listPotentialGhostManifestsForMirrorWindow(filters: {
  integrationAccountId?: string | null;
  dateFrom?: string | null;
  dateTo?: string | null;
}) {
  const manifestFilterDateSql = getManifestFilterDateSql();
  const values = [];

  if (!filters?.integrationAccountId) {
    return [];
  }

  values.push(filters.integrationAccountId);
  const where = [
    `integration_account_id = $${values.length}`,
    `coalesce(requested_by, '') <> 'cetesb.search'`,
    `external_hash_code is not null`,
    `(
    external_reference is null
    or external_reference ->> 'manCodigo' is null
    or external_reference ->> 'manNumero' is null
  )`,
    `status in ('submitted', 'queued_print', 'printing', 'printed')`
  ];

  if (filters.dateFrom) {
    values.push(filters.dateFrom);
    where.push(`${manifestFilterDateSql} >= date($${values.length})`);
  }

  if (filters.dateTo) {
    values.push(filters.dateTo);
    where.push(`${manifestFilterDateSql} <= date($${values.length})`);
  }

  const result = await query<ManifestRow>(
    `select * from manifests where ${where.join(' and ')} order by updated_at desc`,
    values
  );

  return result.rows.map((row) => mapRow(row));
}

export async function upsertManifestFromExternalSearch(input: {
  id: string;
  integrationAccountId: string;
  sessionContextId?: string | null;
  status?: string | null;
  externalStatus?: string | null;
  externalReference?: { manCodigo?: string | number | null; manNumero?: string | number | null } | null;
  externalHashCode?: string | null;
  payload?: JsonObject;
  requestedBy?: string | null;
  correlationId?: string | null;
  lastSyncAt?: string | null;
}) {
  const externalReference = input.externalReference || null;
  const manCodigo = externalReference?.manCodigo == null ? null : String(externalReference.manCodigo);
  const manNumero = externalReference?.manNumero == null ? null : String(externalReference.manNumero);
  const externalHashCode = input.externalHashCode || null;

  if (!externalHashCode && !manCodigo && !manNumero) {
    return null;
  }

  await requireManifestSessionOwnership(input.integrationAccountId, input.sessionContextId || null);

  const existing = await query<ManifestRow>(
    `select * from manifests
      where integration_account_id = $1
        and (
          ($2::text is not null and external_hash_code = $2)
          or ($3::text is not null and external_reference ->> 'manCodigo' = $3)
          or ($4::text is not null and external_reference ->> 'manNumero' = $4)
        )
      order by updated_at desc
      limit 1`,
    [input.integrationAccountId, externalHashCode, manCodigo, manNumero]
  );

  if ((existing.rowCount || 0) > 0 && existing.rows[0]) {
    const row = existing.rows[0];
    const mergedPayload = input.payload
      ? mergePreservingNonNull(row.payload || {}, input.payload)
      : (row.payload || {});

    const updated = await query<ManifestRow>(
      `update manifests set
         session_context_id = coalesce($2, session_context_id),
         status = coalesce($3, status),
         external_status = coalesce($4, external_status),
         external_reference = coalesce($5::jsonb, external_reference),
         external_hash_code = coalesce($6, external_hash_code),
         payload = coalesce($7::jsonb, payload),
         last_sync_at = coalesce($8::timestamptz, last_sync_at),
         updated_at = now()
       where id = $1
       returning *`,
      [
        row.id,
        input.sessionContextId || null,
        input.status || null,
        input.externalStatus || null,
        externalReference ? JSON.stringify(externalReference) : null,
        externalHashCode,
        mergedPayload ? JSON.stringify(mergedPayload) : null,
        input.lastSyncAt || null
      ]
    );
    return mapRow(updated.rows[0]);
  }

  const inserted = await query<ManifestRow>(
    `insert into manifests(
      id, integration_account_id, session_context_id, status, external_status,
      external_reference, external_hash_code, payload, requested_by, correlation_id, last_sync_at
    ) values ($1,$2,$3,$4,$5,$6::jsonb,$7,$8::jsonb,$9,$10,$11)
    returning *`,
    [
      input.id,
      input.integrationAccountId,
      input.sessionContextId || null,
      input.status,
      input.externalStatus || null,
      externalReference ? JSON.stringify(externalReference) : JSON.stringify(null),
      externalHashCode,
      JSON.stringify(input.payload || {}),
      input.requestedBy || null,
      input.correlationId,
      input.lastSyncAt || null
    ]
  );

  return mapRow(inserted.rows[0]);
}

export async function upsertManifestDocument(input: {
  id: string;
  manifestId: string;
  type: string;
  status: string;
  mimeType: string;
  fileName: string;
  hash: string;
  storagePath: string;
}) {
  const existing = await query<{ id: string }>(
    `select id from manifest_documents where manifest_id = $1 and type = $2 and active = true limit 1`,
    [input.manifestId, input.type]
  );

  if ((existing.rowCount || 0) > 0 && existing.rows[0]) {
    const result = await query<ManifestDocumentRow>(
      `update manifest_documents
         set status = $3,
             mime_type = $4,
             file_name = $5,
             hash = $6,
             storage_path = $7,
             generated_at = now(),
             active = true
       where id = $1 and manifest_id = $2
       returning *`,
      [existing.rows[0].id, input.manifestId, input.status, input.mimeType, input.fileName, input.hash, input.storagePath]
    );
    return mapDocument(result.rows[0]);
  }

  const result = await query<ManifestDocumentRow>(
    `insert into manifest_documents(id, manifest_id, type, status, mime_type, file_name, hash, storage_path)
     values ($1,$2,$3,$4,$5,$6,$7,$8)
     returning *`,
    [input.id, input.manifestId, input.type, input.status, input.mimeType, input.fileName, input.hash, input.storagePath]
  );
  return mapDocument(result.rows[0]);
}

export async function listManifestDocuments(manifestId: string) {
  const result = await query<ManifestDocumentRow>(
    `select * from manifest_documents where manifest_id = $1 and active = true order by generated_at desc`,
    [manifestId]
  );
  return result.rows.map((row) => mapDocument(row));
}

export async function findManifestDocument(manifestId: string, documentId: string) {
  const result = await query<ManifestDocumentRow>(
    `select * from manifest_documents where manifest_id = $1 and id = $2 and active = true`,
    [manifestId, documentId]
  );
  return mapDocument(result.rows[0]);
}

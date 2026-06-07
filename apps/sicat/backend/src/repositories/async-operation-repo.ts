import { query } from '../db/pool.js';

type JsonObject = Record<string, unknown>;
type IsoLike = Date | string | null | undefined;

type AsyncOperationRow = {
  entity_type: string;
  entity_id: string;
  operation: string;
  integration_account_id: string;
  session_context_id: string | null;
  status: string;
  payload: JsonObject | null;
  result: JsonObject | null;
  requested_by: string | null;
  correlation_id: string | null;
  last_sync_at: IsoLike;
  created_at: IsoLike;
  updated_at: IsoLike;
};

type AsyncOperationDocumentRow = {
  id: string;
  owner_entity_type: string;
  owner_entity_id: string;
  type: string;
  status: string;
  mime_type: string;
  file_name: string;
  hash: string | null;
  storage_path: string;
  metadata: JsonObject | null;
  generated_at: IsoLike;
  active: boolean;
};

function toIso(value: IsoLike): string | null {
  if (value == null) return null;
  if (value instanceof Date) return value.toISOString();
  return value;
}

function mapAsyncOperation(row?: AsyncOperationRow) {
  if (!row) return undefined;
  return {
    entityType: row.entity_type,
    entityId: row.entity_id,
    operation: row.operation,
    integrationAccountId: row.integration_account_id,
    sessionContextId: row.session_context_id,
    status: row.status,
    payload: row.payload || {},
    result: row.result || null,
    requestedBy: row.requested_by,
    correlationId: row.correlation_id,
    lastSyncAt: toIso(row.last_sync_at),
    createdAt: toIso(row.created_at),
    updatedAt: toIso(row.updated_at)
  };
}

function mapAsyncOperationDocument(row?: AsyncOperationDocumentRow) {
  if (!row) return undefined;
  return {
    id: row.id,
    ownerEntityType: row.owner_entity_type,
    ownerEntityId: row.owner_entity_id,
    type: row.type,
    status: row.status,
    mimeType: row.mime_type,
    fileName: row.file_name,
    hash: row.hash,
    storagePath: row.storage_path,
    metadata: row.metadata || {},
    generatedAt: toIso(row.generated_at),
    active: row.active,
    downloadUrl: row.owner_entity_type === 'cdf' && row.hash
      ? `/v1/cdf/documents/${encodeURIComponent(row.hash)}`
      : null
  };
}

export async function insertAsyncOperationEntity(input: {
  entityType: string;
  entityId: string;
  operation: string;
  integrationAccountId: string;
  sessionContextId?: string | null;
  status: string;
  payload?: JsonObject;
  result?: JsonObject | null;
  requestedBy?: string | null;
  correlationId?: string | null;
  lastSyncAt?: string | null;
}) {
  const result = await query<AsyncOperationRow>(
    `insert into async_operation_entities(
      entity_type, entity_id, operation, integration_account_id, session_context_id,
      status, payload, result, requested_by, correlation_id, last_sync_at
    ) values ($1,$2,$3,$4,$5,$6,$7::jsonb,$8::jsonb,$9,$10,$11)
    returning *`,
    [
      input.entityType,
      input.entityId,
      input.operation,
      input.integrationAccountId,
      input.sessionContextId || null,
      input.status,
      JSON.stringify(input.payload || {}),
      input.result === undefined ? JSON.stringify(null) : JSON.stringify(input.result),
      input.requestedBy || null,
      input.correlationId || null,
      input.lastSyncAt || null
    ]
  );
  return mapAsyncOperation(result.rows[0]);
}

export async function findAsyncOperationEntity(entityType: string, entityId: string) {
  const result = await query<AsyncOperationRow>(
    `select * from async_operation_entities where entity_type = $1 and entity_id = $2`,
    [entityType, entityId]
  );
  return mapAsyncOperation(result.rows[0]);
}

export async function updateAsyncOperationEntity(entityType: string, entityId: string, patch: {
  operation?: string | null;
  sessionContextId?: string | null;
  status?: string | null;
  payload?: JsonObject | null;
  result?: JsonObject | null;
  requestedBy?: string | null;
  correlationId?: string | null;
  lastSyncAt?: string | null;
}) {
  const result = await query<AsyncOperationRow>(
    `update async_operation_entities set
       operation = coalesce($3, operation),
       session_context_id = coalesce($4, session_context_id),
       status = coalesce($5, status),
       payload = coalesce($6::jsonb, payload),
       result = coalesce($7::jsonb, result),
       requested_by = coalesce($8, requested_by),
       correlation_id = coalesce($9, correlation_id),
       last_sync_at = coalesce($10, last_sync_at),
       updated_at = now()
     where entity_type = $1 and entity_id = $2
     returning *`,
    [
      entityType,
      entityId,
      patch.operation || null,
      patch.sessionContextId || null,
      patch.status || null,
      patch.payload ? JSON.stringify(patch.payload) : null,
      patch.result ? JSON.stringify(patch.result) : null,
      patch.requestedBy || null,
      patch.correlationId || null,
      patch.lastSyncAt || null
    ]
  );
  return mapAsyncOperation(result.rows[0]);
}

export async function upsertAsyncOperationDocument(input: {
  id: string;
  ownerEntityType: string;
  ownerEntityId: string;
  type: string;
  status: string;
  mimeType: string;
  fileName: string;
  hash?: string | null;
  storagePath: string;
  metadata?: JsonObject;
}) {
  const existing = await query<{ id: string }>(
    `select id
       from async_operation_documents
      where owner_entity_type = $1
        and owner_entity_id = $2
        and type = $3
        and active = true
      limit 1`,
    [input.ownerEntityType, input.ownerEntityId, input.type]
  );

  if ((existing.rowCount || 0) > 0 && existing.rows[0]) {
    const result = await query<AsyncOperationDocumentRow>(
      `update async_operation_documents set
         status = $3,
         mime_type = $4,
         file_name = $5,
         hash = $6,
         storage_path = $7,
         metadata = $8::jsonb,
         generated_at = now(),
         active = true
       where id = $1 and owner_entity_id = $2
       returning *`,
      [
        existing.rows[0].id,
        input.ownerEntityId,
        input.status,
        input.mimeType,
        input.fileName,
        input.hash || null,
        input.storagePath,
        JSON.stringify(input.metadata || {})
      ]
    );
    return mapAsyncOperationDocument(result.rows[0]);
  }

  const result = await query<AsyncOperationDocumentRow>(
    `insert into async_operation_documents(
      id, owner_entity_type, owner_entity_id, type, status, mime_type,
      file_name, hash, storage_path, metadata
    ) values ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10::jsonb)
    returning *`,
    [
      input.id,
      input.ownerEntityType,
      input.ownerEntityId,
      input.type,
      input.status,
      input.mimeType,
      input.fileName,
      input.hash || null,
      input.storagePath,
      JSON.stringify(input.metadata || {})
    ]
  );
  return mapAsyncOperationDocument(result.rows[0]);
}

export async function findAsyncOperationDocumentByHash(ownerEntityType: string, hash: string, integrationAccountId?: string | null) {
  const values = [ownerEntityType, hash];
  let extraWhere = '';

  if (integrationAccountId) {
    values.push(integrationAccountId);
    extraWhere = ` and owner.integration_account_id = $${values.length}`;
  }

  const result = await query<AsyncOperationDocumentRow>(
    `select doc.*
       from async_operation_documents doc
       join async_operation_entities owner
         on owner.entity_type = doc.owner_entity_type
        and owner.entity_id = doc.owner_entity_id
      where doc.owner_entity_type = $1
        and doc.hash = $2
        and doc.active = true${extraWhere}
      order by doc.generated_at desc
      limit 1`,
    values
  );
  return mapAsyncOperationDocument(result.rows[0]);
}

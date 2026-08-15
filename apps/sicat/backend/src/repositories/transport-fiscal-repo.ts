/**
 * Repositório da camada fiscal do Transporte — `fiscal_documents`, `fiscal_document_links`,
 * `fiscal_document_events` (PR-E1, DL-103).
 *
 * TENANCY OBRIGATÓRIA (mesmo contrato de `transport-operation-repo.ts`): toda leitura/escrita de
 * `fiscal_documents` por id filtra também por `integration_account_id`. `fiscal_document_links`/
 * `fiscal_document_events` herdam tenancy via FK `on delete cascade` a partir de `document_id` já
 * validado pelo chamador — nunca lidos/escritos sem passar pelo documento pai.
 *
 * `fiscal_document_links`/`fiscal_document_events` são APPEND-ONLY (mesmo racional de
 * `ciot_events`/`vpo_events`) — só `insert`, nunca `update`/`delete`.
 *
 * Locking otimista via coluna `version` em `fiscal_documents` (molde `transport-operation-repo.ts`):
 * `linkFiscalDocumentToOperation`/`unlinkFiscalDocumentFromOperation` fazem CAS quando um
 * `expectedVersion` é informado; `updateFiscalDocumentValidation` (import/revalidar) NÃO exige CAS —
 * é sempre o próprio pipeline de importação/revalidação que dispara a escrita, sem concorrência de
 * usuário esperada no mesmo documento.
 */

import type { PoolClient } from 'pg';
import { query } from '../db/pool.js';
import { AppError } from '../lib/problem.js';
import type {
  DfeValidationIssue,
  FiscalAuthorizationStatus,
  FiscalDocument,
  FiscalDocumentEvent,
  FiscalDocumentEventType,
  FiscalDocumentLink,
  FiscalDocumentLinkType,
  FiscalDocumentType,
  FiscalValidationStatus
} from '../lib/transport/dfe-types.js';

type DbClient = Pick<PoolClient, 'query'> | null;

function getQueryExecutor(client: DbClient = null) {
  return client?.query?.bind(client) || query;
}

type FiscalDocumentRow = {
  id: string;
  integration_account_id: string;
  operation_id: string | null;
  document_type: string;
  access_key: string;
  xml_storage_ref: string;
  xml_hash: string;
  layout_version: string | null;
  schema_registry_id: string | null;
  authorization_status: string;
  protocol: string | null;
  issued_at: Date | string | null;
  issuer_document: string | null;
  issuer_name: string | null;
  recipient_document: string | null;
  recipient_name: string | null;
  total_amount: string | null;
  validation_status: string;
  validation_issues: unknown;
  ciot_numbers: unknown;
  vpo_references: unknown;
  correlation_id: string;
  version: number;
  created_at: Date | string;
  updated_at: Date | string;
};

type FiscalDocumentLinkRow = {
  id: string;
  document_id: string;
  linked_document_id: string;
  link_type: string;
  created_at: Date | string;
};

type FiscalDocumentEventRow = {
  id: string;
  document_id: string;
  event_type: string;
  detail: unknown;
  correlation_id: string;
  created_at: Date | string;
};

function toIso(value: Date | string | null | undefined): string | null {
  if (value == null) return null;
  if (value instanceof Date) return value.toISOString();
  return String(value);
}

function toNumberOrNull(value: unknown): number | null {
  if (value === null || value === undefined) return null;
  const num = Number(value);
  return Number.isFinite(num) ? num : null;
}

function toJsonObject(value: unknown): Record<string, unknown> {
  if (value && typeof value === 'object' && !Array.isArray(value)) {
    return value as Record<string, unknown>;
  }
  return {};
}

function toValidationIssues(value: unknown): DfeValidationIssue[] {
  if (!Array.isArray(value)) return [];
  return value
    .map((entry) => toJsonObject(entry))
    .filter((entry) => typeof entry.code === 'string' && typeof entry.severity === 'string')
    .map((entry) => ({
      severity: entry.severity as DfeValidationIssue['severity'],
      code: String(entry.code),
      message: typeof entry.message === 'string' ? entry.message : ''
    }));
}

function toStringArray(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return value.map((entry) => String(entry));
}

function toRecordArray(value: unknown): Record<string, unknown>[] {
  if (!Array.isArray(value)) return [];
  return value.map((entry) => toJsonObject(entry));
}

function mapDocumentRow(row: FiscalDocumentRow | undefined): FiscalDocument | null {
  if (!row) return null;
  return {
    id: row.id,
    integrationAccountId: row.integration_account_id,
    operationId: row.operation_id,
    documentType: row.document_type as FiscalDocumentType,
    accessKey: row.access_key,
    xmlStorageRef: row.xml_storage_ref,
    xmlHash: row.xml_hash,
    layoutVersion: row.layout_version,
    schemaRegistryId: row.schema_registry_id,
    authorizationStatus: row.authorization_status as FiscalAuthorizationStatus,
    protocol: row.protocol,
    issuedAt: toIso(row.issued_at),
    issuerDocument: row.issuer_document,
    issuerName: row.issuer_name,
    recipientDocument: row.recipient_document,
    recipientName: row.recipient_name,
    totalAmount: toNumberOrNull(row.total_amount),
    validationStatus: row.validation_status as FiscalValidationStatus,
    validationIssues: toValidationIssues(row.validation_issues),
    ciotNumbers: toStringArray(row.ciot_numbers),
    vpoReferences: toRecordArray(row.vpo_references),
    correlationId: row.correlation_id,
    version: Number(row.version ?? 1),
    createdAt: toIso(row.created_at) ?? '',
    updatedAt: toIso(row.updated_at) ?? ''
  };
}

function mapLinkRow(row: FiscalDocumentLinkRow | undefined): FiscalDocumentLink | null {
  if (!row) return null;
  return {
    id: row.id,
    documentId: row.document_id,
    linkedDocumentId: row.linked_document_id,
    linkType: row.link_type as FiscalDocumentLinkType,
    createdAt: toIso(row.created_at) ?? ''
  };
}

function mapEventRow(row: FiscalDocumentEventRow | undefined): FiscalDocumentEvent | null {
  if (!row) return null;
  return {
    id: row.id,
    documentId: row.document_id,
    eventType: row.event_type as FiscalDocumentEventType,
    detail: toJsonObject(row.detail),
    correlationId: row.correlation_id,
    createdAt: toIso(row.created_at) ?? ''
  };
}

// =============================================================================
// fiscal_documents
// =============================================================================

export type FiscalDocumentInsertInput = {
  id: string;
  integrationAccountId: string;
  operationId?: string | null;
  documentType: FiscalDocumentType;
  accessKey: string;
  xmlStorageRef: string;
  xmlHash: string;
  layoutVersion: string | null;
  schemaRegistryId: string | null;
  authorizationStatus: FiscalAuthorizationStatus;
  protocol: string | null;
  issuedAt: string | null;
  issuerDocument: string | null;
  issuerName: string | null;
  recipientDocument: string | null;
  recipientName: string | null;
  totalAmount: number | null;
  validationStatus: FiscalValidationStatus;
  validationIssues: DfeValidationIssue[];
  ciotNumbers: string[];
  vpoReferences: Record<string, unknown>[];
  correlationId: string;
};

export async function insertFiscalDocument(input: FiscalDocumentInsertInput, client: DbClient = null): Promise<FiscalDocument> {
  const execute = getQueryExecutor(client);
  const result = await execute<FiscalDocumentRow>(
    `insert into fiscal_documents (
       id, integration_account_id, operation_id, document_type, access_key, xml_storage_ref,
       xml_hash, layout_version, schema_registry_id, authorization_status, protocol, issued_at,
       issuer_document, issuer_name, recipient_document, recipient_name, total_amount,
       validation_status, validation_issues, ciot_numbers, vpo_references, correlation_id, version
     ) values (
       $1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12::timestamptz, $13, $14, $15, $16, $17,
       $18, $19::jsonb, $20::jsonb, $21::jsonb, $22, 1
     )
     returning *`,
    [
      input.id,
      input.integrationAccountId,
      input.operationId ?? null,
      input.documentType,
      input.accessKey,
      input.xmlStorageRef,
      input.xmlHash,
      input.layoutVersion,
      input.schemaRegistryId,
      input.authorizationStatus,
      input.protocol,
      input.issuedAt,
      input.issuerDocument,
      input.issuerName,
      input.recipientDocument,
      input.recipientName,
      input.totalAmount,
      input.validationStatus,
      JSON.stringify(input.validationIssues ?? []),
      JSON.stringify(input.ciotNumbers ?? []),
      JSON.stringify(input.vpoReferences ?? []),
      input.correlationId
    ]
  );
  const row = mapDocumentRow(result.rows[0]);
  if (!row) {
    throw new AppError(500, 'Internal Server Error', `Falha ao inserir documento fiscal ${input.id}.`, {
      code: 'TRANSPORTE_DFE_INSERT_FAILED'
    });
  }
  return row;
}

export async function findFiscalDocumentByAccessKey(
  integrationAccountId: string,
  accessKey: string,
  client: DbClient = null
): Promise<FiscalDocument | null> {
  const execute = getQueryExecutor(client);
  const result = await execute<FiscalDocumentRow>(
    'select * from fiscal_documents where integration_account_id = $1 and access_key = $2',
    [integrationAccountId, accessKey]
  );
  return mapDocumentRow(result.rows[0]);
}

export async function findFiscalDocumentById(
  id: string,
  integrationAccountId: string,
  client: DbClient = null
): Promise<FiscalDocument | null> {
  const execute = getQueryExecutor(client);
  const result = await execute<FiscalDocumentRow>(
    'select * from fiscal_documents where id = $1 and integration_account_id = $2',
    [id, integrationAccountId]
  );
  return mapDocumentRow(result.rows[0]);
}

/** Documentos já importados (mesma conta) cuja `access_key` está na lista — usado para resolver `fiscal_document_links` na importação (chaves referenciadas no XML). */
export async function findFiscalDocumentsByAccessKeys(
  integrationAccountId: string,
  accessKeys: string[],
  client: DbClient = null
): Promise<FiscalDocument[]> {
  if (accessKeys.length === 0) return [];
  const execute = getQueryExecutor(client);
  const result = await execute<FiscalDocumentRow>(
    'select * from fiscal_documents where integration_account_id = $1 and access_key = any($2::text[])',
    [integrationAccountId, accessKeys]
  );
  return result.rows.map(mapDocumentRow).filter((row): row is FiscalDocument => row !== null);
}

export async function listFiscalDocumentsForOperation(
  operationId: string,
  integrationAccountId: string,
  client: DbClient = null
): Promise<FiscalDocument[]> {
  const execute = getQueryExecutor(client);
  const result = await execute<FiscalDocumentRow>(
    `select * from fiscal_documents
      where operation_id = $1 and integration_account_id = $2
      order by created_at asc`,
    [operationId, integrationAccountId]
  );
  return result.rows.map(mapDocumentRow).filter((row): row is FiscalDocument => row !== null);
}

async function fiscalDocumentNotFoundOrConflict(
  id: string,
  integrationAccountId: string,
  expectedVersion: number | null,
  client: DbClient
): Promise<never> {
  const execute = getQueryExecutor(client);
  const existing = await execute<{ version: number }>(
    'select version from fiscal_documents where id = $1 and integration_account_id = $2',
    [id, integrationAccountId]
  );
  if ((existing.rowCount ?? 0) === 0) {
    throw new AppError(404, 'Not Found', `Documento fiscal ${id} não encontrado.`, {
      code: 'TRANSPORTE_DFE_NOT_FOUND'
    });
  }
  throw new AppError(
    409,
    'Conflict',
    `Documento fiscal ${id} foi modificado por outro processo (esperado version=${expectedVersion}, atual=${existing.rows[0]?.version}).`,
    { code: 'TRANSPORTE_DFE_VERSION_CONFLICT' }
  );
}

/** `POST .../vincular` — grava `operation_id`. CAS por `version` só quando `expectedVersion` é informado (campo opcional no contrato). */
export async function linkFiscalDocumentToOperation(
  id: string,
  integrationAccountId: string,
  operationId: string,
  expectedVersion: number | null,
  client: DbClient = null
): Promise<FiscalDocument> {
  const execute = getQueryExecutor(client);
  const values: unknown[] = [id, integrationAccountId, operationId];
  let versionClause = '';
  if (expectedVersion != null) {
    values.push(expectedVersion);
    versionClause = `and version = $${values.length}`;
  }

  const result = await execute<FiscalDocumentRow>(
    `update fiscal_documents
        set operation_id = $3
      where id = $1
        and integration_account_id = $2
        ${versionClause}
      returning *`,
    values
  );
  const row = mapDocumentRow(result.rows[0]);
  if (!row) return fiscalDocumentNotFoundOrConflict(id, integrationAccountId, expectedVersion, client);
  return row;
}

/** `POST .../desvincular` — zera `operation_id`. Mesmo CAS opcional de `linkFiscalDocumentToOperation`. */
export async function unlinkFiscalDocumentFromOperation(
  id: string,
  integrationAccountId: string,
  expectedVersion: number | null,
  client: DbClient = null
): Promise<FiscalDocument> {
  const execute = getQueryExecutor(client);
  const values: unknown[] = [id, integrationAccountId];
  let versionClause = '';
  if (expectedVersion != null) {
    values.push(expectedVersion);
    versionClause = `and version = $${values.length}`;
  }

  const result = await execute<FiscalDocumentRow>(
    `update fiscal_documents
        set operation_id = null
      where id = $1
        and integration_account_id = $2
        ${versionClause}
      returning *`,
    values
  );
  const row = mapDocumentRow(result.rows[0]);
  if (!row) return fiscalDocumentNotFoundOrConflict(id, integrationAccountId, expectedVersion, client);
  return row;
}

export type FiscalDocumentValidationPatch = {
  validationStatus: FiscalValidationStatus;
  validationIssues: DfeValidationIssue[];
};

/**
 * `POST .../revalidar` (e o cross-check de `vincular`) — reescreve SÓ `validation_status`/
 * `validation_issues`. `ciot_numbers`/`vpo_references` são extraídos do XML na importação e NUNCA
 * mudam depois (o XML por trás é imutável) — nem revalidar nem o cross-check os tocam; é o mesmo
 * racional de nunca reescrever `xml_storage_ref`/`xml_hash`/campos do documento original.
 */
export async function updateFiscalDocumentValidation(
  id: string,
  integrationAccountId: string,
  patch: FiscalDocumentValidationPatch,
  client: DbClient = null
): Promise<FiscalDocument | null> {
  const execute = getQueryExecutor(client);
  const result = await execute<FiscalDocumentRow>(
    `update fiscal_documents
        set validation_status = $3,
            validation_issues = $4::jsonb
      where id = $1
        and integration_account_id = $2
      returning *`,
    [id, integrationAccountId, patch.validationStatus, JSON.stringify(patch.validationIssues ?? [])]
  );
  return mapDocumentRow(result.rows[0]);
}

// =============================================================================
// fiscal_document_links — APPEND-ONLY
// =============================================================================

export type FiscalDocumentLinkInsertInput = {
  id: string;
  documentId: string;
  linkedDocumentId: string;
  linkType: FiscalDocumentLinkType;
};

/** Idempotente na prática via `on conflict do nothing` — reimportar o mesmo XML não duplica vínculos (a importação em si já é bloqueada por `DFE_ALREADY_IMPORTED`, mas revalidação/reprocessamento defensivo não deve estourar em unique violation). */
export async function insertFiscalDocumentLink(
  input: FiscalDocumentLinkInsertInput,
  client: DbClient = null
): Promise<FiscalDocumentLink | null> {
  const execute = getQueryExecutor(client);
  const result = await execute<FiscalDocumentLinkRow>(
    `insert into fiscal_document_links (id, document_id, linked_document_id, link_type)
     values ($1, $2, $3, $4)
     on conflict (document_id, linked_document_id, link_type) do nothing
     returning *`,
    [input.id, input.documentId, input.linkedDocumentId, input.linkType]
  );
  return mapLinkRow(result.rows[0]);
}

export async function listFiscalDocumentLinksForDocument(
  documentId: string,
  client: DbClient = null
): Promise<FiscalDocumentLink[]> {
  const execute = getQueryExecutor(client);
  const result = await execute<FiscalDocumentLinkRow>(
    'select * from fiscal_document_links where document_id = $1 order by created_at asc',
    [documentId]
  );
  return result.rows.map(mapLinkRow).filter((row): row is FiscalDocumentLink => row !== null);
}

// =============================================================================
// fiscal_document_events — APPEND-ONLY
// =============================================================================

export type FiscalDocumentEventInsertInput = {
  id: string;
  documentId: string;
  eventType: FiscalDocumentEventType;
  detail?: Record<string, unknown>;
  correlationId: string;
};

export async function insertFiscalDocumentEvent(
  input: FiscalDocumentEventInsertInput,
  client: DbClient = null
): Promise<FiscalDocumentEvent> {
  const execute = getQueryExecutor(client);
  const result = await execute<FiscalDocumentEventRow>(
    `insert into fiscal_document_events (id, document_id, event_type, detail, correlation_id)
     values ($1, $2, $3, $4::jsonb, $5)
     returning *`,
    [input.id, input.documentId, input.eventType, JSON.stringify(input.detail ?? {}), input.correlationId]
  );
  const row = mapEventRow(result.rows[0]);
  if (!row) {
    throw new AppError(500, 'Internal Server Error', `Falha ao inserir evento do documento fiscal ${input.documentId}.`, {
      code: 'TRANSPORTE_DFE_EVENT_INSERT_FAILED'
    });
  }
  return row;
}

export async function listFiscalDocumentEventsForDocument(
  documentId: string,
  client: DbClient = null
): Promise<FiscalDocumentEvent[]> {
  const execute = getQueryExecutor(client);
  const result = await execute<FiscalDocumentEventRow>(
    'select * from fiscal_document_events where document_id = $1 order by created_at asc',
    [documentId]
  );
  return result.rows.map(mapEventRow).filter((row): row is FiscalDocumentEvent => row !== null);
}

/**
 * Repositório de emissão de DF-e (PR-G, DL-103 + DL-102 aplicado à emissão fiscal).
 *
 * TENANCY OBRIGATÓRIA (mesmo contrato de `ciot-repo.ts`): toda leitura/escrita de `dfe_issuances`
 * por id, quando chamada pela rota, filtra também por `integration_account_id`. O worker (que já
 * resolve a linha por `job.payload.issuanceId`, sem sessão de usuário) usa as variantes `*Internal`.
 *
 * As transições de `status` são todas UPDATEs GUARDADOS (`where status = ...`/`where status =
 * any(...)`) — uma segunda chamada para a mesma linha (retry de job depois de um commit anterior
 * bem-sucedido) é NO-OP idempotente (devolve `null`, nunca sobrescreve um resultado já gravado).
 *
 * `dfe_issuance_events` é APPEND-ONLY — só `insert`, nunca `update`/`delete`.
 */

import type { PoolClient } from 'pg';
import { query } from '../db/pool.js';
import type {
  DfeIssuance,
  DfeIssuanceDocumentType,
  DfeIssuanceEnvironment,
  DfeIssuanceEvent,
  DfeIssuanceEventType,
  DfeIssuanceStatus
} from '../lib/transport/dfe-issuance-types.js';

type DbClient = Pick<PoolClient, 'query'> | null;

function getQueryExecutor(client: DbClient = null) {
  return client?.query?.bind(client) || query;
}

type DfeIssuanceRow = {
  id: string;
  integration_account_id: string;
  operation_id: string;
  document_type: string;
  status: string;
  environment: string;
  access_key: string | null;
  protocol: string | null;
  xml_storage_ref: string | null;
  xml_hash: string | null;
  provider_response: unknown;
  rejection_reason: string | null;
  correlation_marker: string;
  fiscal_document_id: string | null;
  job_id: string | null;
  correlation_id: string;
  command_id: string | null;
  last_error_code: string | null;
  last_error_detail: unknown;
  version: number;
  created_at: Date | string;
  updated_at: Date | string;
};

type DfeIssuanceEventRow = {
  id: string;
  issuance_id: string;
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

function toJsonObject(value: unknown): Record<string, unknown> {
  if (value && typeof value === 'object' && !Array.isArray(value)) {
    return value as Record<string, unknown>;
  }
  return {};
}

function mapIssuanceRow(row: DfeIssuanceRow | undefined): DfeIssuance | null {
  if (!row) return null;
  return {
    id: row.id,
    integrationAccountId: row.integration_account_id,
    operationId: row.operation_id,
    documentType: row.document_type as DfeIssuanceDocumentType,
    status: row.status as DfeIssuanceStatus,
    environment: row.environment as DfeIssuanceEnvironment,
    accessKey: row.access_key,
    protocol: row.protocol,
    xmlStorageRef: row.xml_storage_ref,
    xmlHash: row.xml_hash,
    providerResponse: toJsonObject(row.provider_response),
    rejectionReason: row.rejection_reason,
    correlationMarker: row.correlation_marker,
    fiscalDocumentId: row.fiscal_document_id,
    jobId: row.job_id,
    correlationId: row.correlation_id,
    commandId: row.command_id,
    lastErrorCode: row.last_error_code,
    lastErrorDetail: row.last_error_detail == null ? null : toJsonObject(row.last_error_detail),
    version: Number(row.version ?? 1),
    createdAt: toIso(row.created_at) ?? '',
    updatedAt: toIso(row.updated_at) ?? ''
  };
}

function mapEventRow(row: DfeIssuanceEventRow | undefined): DfeIssuanceEvent | null {
  if (!row) return null;
  return {
    id: row.id,
    issuanceId: row.issuance_id,
    eventType: row.event_type as DfeIssuanceEventType,
    detail: toJsonObject(row.detail),
    correlationId: row.correlation_id,
    createdAt: toIso(row.created_at) ?? ''
  };
}

// =============================================================================
// dfe_issuances
// =============================================================================

export type DfeIssuanceInsertInput = {
  id: string;
  integrationAccountId: string;
  operationId: string;
  documentType: DfeIssuanceDocumentType;
  environment?: DfeIssuanceEnvironment;
  correlationMarker: string;
  correlationId: string;
  commandId?: string | null;
};

/** Cria a linha em `draft` — o marcador de correlação (DL-102) já nasce gravado aqui, ANTES de qualquer chamada ao gateway. */
export async function insertDfeIssuance(input: DfeIssuanceInsertInput, client: DbClient = null): Promise<DfeIssuance> {
  const execute = getQueryExecutor(client);
  const result = await execute<DfeIssuanceRow>(
    `insert into dfe_issuances (
       id, integration_account_id, operation_id, document_type, status, environment,
       correlation_marker, correlation_id, command_id, version
     ) values ($1, $2, $3, $4, 'draft', $5, $6, $7, $8, 1)
     returning *`,
    [
      input.id,
      input.integrationAccountId,
      input.operationId,
      input.documentType,
      input.environment ?? 'sandbox',
      input.correlationMarker,
      input.correlationId,
      input.commandId ?? null
    ]
  );
  const row = mapIssuanceRow(result.rows[0]);
  if (!row) {
    throw new Error(`[dfe-issuance-repo] insertDfeIssuance não devolveu linha para a operação ${input.operationId}`);
  }
  return row;
}

export async function findDfeIssuanceById(id: string, integrationAccountId: string): Promise<DfeIssuance | null> {
  const result = await query<DfeIssuanceRow>(
    'select * from dfe_issuances where id = $1 and integration_account_id = $2',
    [id, integrationAccountId]
  );
  return mapIssuanceRow(result.rows[0]);
}

/** Sem filtro de tenancy — usado pelo WORKER (que já resolve a linha pelo `job.payload.issuanceId`, sem sessão de usuário). */
export async function findDfeIssuanceByIdInternal(id: string): Promise<DfeIssuance | null> {
  const result = await query<DfeIssuanceRow>('select * from dfe_issuances where id = $1', [id]);
  return mapIssuanceRow(result.rows[0]);
}

export async function listDfeIssuancesForOperation(operationId: string, integrationAccountId: string): Promise<DfeIssuance[]> {
  const result = await query<DfeIssuanceRow>(
    `select * from dfe_issuances
      where operation_id = $1 and integration_account_id = $2
      order by created_at desc`,
    [operationId, integrationAccountId]
  );
  return result.rows.map(mapIssuanceRow).filter((row): row is DfeIssuance => row !== null);
}

const NON_RESUMABLE_STATUSES = ['authorized', 'rejected', 'failed_validation', 'cancelled', 'submit_unconfirmed'];

/** `draft/building/built/signing/signed/submitting` → `building` (reinicia o pipeline determinístico do zero — seguro porque build/sign/submit são funções puras do agregado + marcador). Nunca reentra sobre um terminal nem sobre `submit_unconfirmed` (propriedade do reconciliador). */
export async function beginDfeIssuanceAttempt(id: string, jobId: string): Promise<DfeIssuance | null> {
  const result = await query<DfeIssuanceRow>(
    `update dfe_issuances set
       status = 'building',
       job_id = $2
     where id = $1
       and status <> all($3::text[])
     returning *`,
    [id, jobId, NON_RESUMABLE_STATUSES]
  );
  return mapIssuanceRow(result.rows[0]);
}

export async function completeDfeIssuanceBuilt(id: string, patch: { accessKey: string }): Promise<DfeIssuance | null> {
  const result = await query<DfeIssuanceRow>(
    `update dfe_issuances set status = 'built', access_key = $2
     where id = $1 and status = 'building'
     returning *`,
    [id, patch.accessKey]
  );
  return mapIssuanceRow(result.rows[0]);
}

export async function beginDfeIssuanceSigning(id: string): Promise<DfeIssuance | null> {
  const result = await query<DfeIssuanceRow>(
    `update dfe_issuances set status = 'signing' where id = $1 and status = 'built' returning *`,
    [id]
  );
  return mapIssuanceRow(result.rows[0]);
}

export async function completeDfeIssuanceSigned(id: string): Promise<DfeIssuance | null> {
  const result = await query<DfeIssuanceRow>(
    `update dfe_issuances set status = 'signed' where id = $1 and status = 'signing' returning *`,
    [id]
  );
  return mapIssuanceRow(result.rows[0]);
}

/** `signed` → `submitting`. O PONTO crítico do DL-102: gravado ANTES de chamar `gateway.submitDocument`. */
export async function beginDfeIssuanceSubmitting(id: string): Promise<DfeIssuance | null> {
  const result = await query<DfeIssuanceRow>(
    `update dfe_issuances set status = 'submitting' where id = $1 and status = 'signed' returning *`,
    [id]
  );
  return mapIssuanceRow(result.rows[0]);
}

export type DfeIssuanceAuthorizedPatch = {
  protocol: string | null;
  xmlStorageRef: string;
  xmlHash: string;
  providerResponse: Record<string, unknown>;
};

/** `submitting` → `authorized` (caminho direto, sem passar pelo reconciliador). */
export async function completeDfeIssuanceAuthorized(id: string, patch: DfeIssuanceAuthorizedPatch): Promise<DfeIssuance | null> {
  const result = await query<DfeIssuanceRow>(
    `update dfe_issuances set
       status = 'authorized',
       protocol = $2,
       xml_storage_ref = $3,
       xml_hash = $4,
       provider_response = $5::jsonb,
       last_error_code = null,
       last_error_detail = null
     where id = $1 and status = 'submitting'
     returning *`,
    [id, patch.protocol, patch.xmlStorageRef, patch.xmlHash, JSON.stringify(patch.providerResponse ?? {})]
  );
  return mapIssuanceRow(result.rows[0]);
}

/** `submitting` → `rejected` (decisão DEFINITIVA do gateway — hoje inalcançável em `mode: sandbox` do fiscal-kit, ver header do gateway). */
export async function completeDfeIssuanceRejected(id: string, patch: { rejectionReason: string; providerResponse?: Record<string, unknown> }): Promise<DfeIssuance | null> {
  const result = await query<DfeIssuanceRow>(
    `update dfe_issuances set
       status = 'rejected',
       rejection_reason = $2,
       provider_response = coalesce($3::jsonb, provider_response)
     where id = $1 and status = 'submitting'
     returning *`,
    [id, patch.rejectionReason, patch.providerResponse ? JSON.stringify(patch.providerResponse) : null]
  );
  return mapIssuanceRow(result.rows[0]);
}

/** Qualquer estado PRÉ-submissão (`draft/building/built/signing/signed`) → `failed_validation`. Falha LOCAL (dados incompletos, tipo não suportado) — nunca chegou perto do gateway remoto, então nunca é DL-102 (`submit_unconfirmed`). */
export async function markDfeIssuanceFailedValidation(
  id: string,
  patch: { lastErrorCode?: string | null; lastErrorDetail?: Record<string, unknown> | null }
): Promise<DfeIssuance | null> {
  const result = await query<DfeIssuanceRow>(
    `update dfe_issuances set
       status = 'failed_validation',
       last_error_code = $2,
       last_error_detail = $3::jsonb
     where id = $1
       and status in ('draft', 'building', 'built', 'signing', 'signed')
     returning *`,
    [id, patch.lastErrorCode ?? null, patch.lastErrorDetail ? JSON.stringify(patch.lastErrorDetail) : null]
  );
  return mapIssuanceRow(result.rows[0]);
}

/** `submitting` → `submit_unconfirmed`. DL-102: "não perguntei o desfecho" nunca vira `failed_validation` — só o reconciliador tem autoridade para provar ausência/presença. */
export async function markDfeIssuanceSubmitUnconfirmed(
  id: string,
  patch: { lastErrorCode?: string | null; lastErrorDetail?: Record<string, unknown> | null }
): Promise<DfeIssuance | null> {
  const result = await query<DfeIssuanceRow>(
    `update dfe_issuances set
       status = 'submit_unconfirmed',
       last_error_code = $2,
       last_error_detail = $3::jsonb
     where id = $1 and status = 'submitting'
     returning *`,
    [id, patch.lastErrorCode ?? null, patch.lastErrorDetail ? JSON.stringify(patch.lastErrorDetail) : null]
  );
  return mapIssuanceRow(result.rows[0]);
}

/** Reconciliação com DESFECHO `found`: `submit_unconfirmed` → `authorized`, sincronizando com o que o gateway confirma via `queryByMarker`. */
export async function completeDfeIssuanceReconcileAuthorized(id: string, patch: DfeIssuanceAuthorizedPatch): Promise<DfeIssuance | null> {
  const result = await query<DfeIssuanceRow>(
    `update dfe_issuances set
       status = 'authorized',
       protocol = coalesce(protocol, $2),
       xml_storage_ref = $3,
       xml_hash = $4,
       provider_response = $5::jsonb,
       last_error_code = null,
       last_error_detail = null
     where id = $1 and status = 'submit_unconfirmed'
     returning *`,
    [id, patch.protocol, patch.xmlStorageRef, patch.xmlHash, JSON.stringify(patch.providerResponse ?? {})]
  );
  return mapIssuanceRow(result.rows[0]);
}

/** Reconciliação com DESFECHO `not-found-after-polling` E `protocol` local ainda nulo — a submissão comprovadamente nunca chegou a autorizar do outro lado. */
export async function markDfeIssuanceReconcileNotFoundRejected(id: string, patch: { reasonCode: string }): Promise<DfeIssuance | null> {
  const result = await query<DfeIssuanceRow>(
    `update dfe_issuances set
       status = 'rejected',
       rejection_reason = $2
     where id = $1
       and status = 'submit_unconfirmed'
       and protocol is null
     returning *`,
    [id, patch.reasonCode]
  );
  return mapIssuanceRow(result.rows[0]);
}

/** `fiscal_document_id` só é gravado UMA VEZ (idempotente — retry após import bem-sucedido não repete o vínculo). */
export async function setDfeIssuanceFiscalDocumentId(id: string, fiscalDocumentId: string): Promise<DfeIssuance | null> {
  const result = await query<DfeIssuanceRow>(
    `update dfe_issuances set fiscal_document_id = $2
     where id = $1 and fiscal_document_id is null
     returning *`,
    [id, fiscalDocumentId]
  );
  return mapIssuanceRow(result.rows[0]);
}

/** Cancelamento — sandbox only (sem chamada remota; `@flavioneto11/fiscal-kit` não tem operação de cancelamento). Qualquer estado NÃO `cancelled` pode ser cancelado. */
export async function markDfeIssuanceCancelled(id: string): Promise<DfeIssuance | null> {
  const result = await query<DfeIssuanceRow>(
    `update dfe_issuances set status = 'cancelled' where id = $1 and status <> 'cancelled' returning *`,
    [id]
  );
  return mapIssuanceRow(result.rows[0]);
}

// =============================================================================
// dfe_issuance_events — APPEND-ONLY
// =============================================================================

export type DfeIssuanceEventInsertInput = {
  id: string;
  issuanceId: string;
  eventType: DfeIssuanceEventType;
  detail?: Record<string, unknown>;
  correlationId: string;
};

export async function insertDfeIssuanceEvent(input: DfeIssuanceEventInsertInput, client: DbClient = null): Promise<DfeIssuanceEvent> {
  const execute = getQueryExecutor(client);
  const result = await execute<DfeIssuanceEventRow>(
    `insert into dfe_issuance_events (id, issuance_id, event_type, detail, correlation_id)
     values ($1, $2, $3, $4::jsonb, $5)
     returning *`,
    [input.id, input.issuanceId, input.eventType, JSON.stringify(input.detail ?? {}), input.correlationId]
  );
  const row = mapEventRow(result.rows[0]);
  if (!row) {
    throw new Error(`[dfe-issuance-repo] insertDfeIssuanceEvent não devolveu linha para ${input.issuanceId}`);
  }
  return row;
}

export async function listDfeIssuanceEventsForIssuance(issuanceId: string): Promise<DfeIssuanceEvent[]> {
  const result = await query<DfeIssuanceEventRow>(
    'select * from dfe_issuance_events where issuance_id = $1 order by created_at asc',
    [issuanceId]
  );
  return result.rows.map(mapEventRow).filter((row): row is DfeIssuanceEvent => row !== null);
}

// =============================================================================
// Varredura de reconciliação (worker) — molde `listUnconfirmedCiotOperationsForReconciliation`.
// =============================================================================

export type UnconfirmedDfeIssuanceForReconciliation = {
  id: string;
  operationId: string;
  integrationAccountId: string;
  documentType: DfeIssuanceDocumentType;
  correlationMarker: string;
  correlationId: string;
};

/** Candidatas a reconciliação: `submit_unconfirmed` atualizadas dentro da janela informada. Janela OBRIGATÓRIA — sem ela a consulta degenera em full scan. */
export async function listUnconfirmedDfeIssuancesForReconciliation(opts: {
  updatedSince: string;
  limit?: number;
}): Promise<UnconfirmedDfeIssuanceForReconciliation[]> {
  const limit = Math.min(Math.max(Math.floor(opts.limit ?? 100), 1), 500);
  const result = await query<{
    id: string;
    operation_id: string;
    integration_account_id: string;
    document_type: string;
    correlation_marker: string;
    correlation_id: string;
  }>(
    `select id, operation_id, integration_account_id, document_type, correlation_marker, correlation_id
       from dfe_issuances
      where status = 'submit_unconfirmed'
        and updated_at >= $1::timestamptz
      order by updated_at asc
      limit $2`,
    [opts.updatedSince, limit]
  );

  return result.rows.map((row) => ({
    id: row.id,
    operationId: row.operation_id,
    integrationAccountId: row.integration_account_id,
    documentType: row.document_type as DfeIssuanceDocumentType,
    correlationMarker: row.correlation_marker,
    correlationId: row.correlation_id
  }));
}

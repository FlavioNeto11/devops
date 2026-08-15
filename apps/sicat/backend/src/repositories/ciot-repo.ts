/**
 * Repositório do ciclo do CIOT (PR-C2, DL-103 + DL-102 aplicado ao domínio CIOT).
 *
 * TENANCY OBRIGATÓRIA (mesmo contrato de `transport-operation-repo.ts`): toda leitura/escrita de
 * `ciot_operations` por id filtra também por `integration_account_id`.
 *
 * As transições de `status` são todas UPDATEs GUARDADOS (`where status = ...`/`where status = any(...)`)
 * — o mesmo padrão de `rntrc-verification-repo.ts`: uma segunda chamada para a mesma linha (ex.: um
 * retry tardio depois de um commit anterior bem-sucedido) é NO-OP idempotente (devolve `null`, nunca
 * sobrescreve um resultado já gravado).
 *
 * `ciot_events` é APPEND-ONLY — só `insert`, nunca `update`/`delete`.
 */

import type { PoolClient } from 'pg';
import { query } from '../db/pool.js';
import type {
  CiotEvent,
  CiotEventType,
  CiotOperation,
  CiotOperationStatus,
  CiotProvider
} from '../lib/transport/ciot-types.js';

type DbClient = Pick<PoolClient, 'query'> | null;

function getQueryExecutor(client: DbClient = null) {
  return client?.query?.bind(client) || query;
}

type CiotOperationRow = {
  id: string;
  integration_account_id: string;
  operation_id: string;
  provider: string;
  status: string;
  ciot_number: string | null;
  correlation_marker: string;
  request_payload_snapshot: unknown;
  provider_response_snapshot: unknown;
  rejection_reason_code: string | null;
  external_status: string | null;
  requested_at: Date | string | null;
  registered_at: Date | string | null;
  closed_at: Date | string | null;
  cancelled_at: Date | string | null;
  job_id: string | null;
  correlation_id: string;
  command_id: string | null;
  last_error_code: string | null;
  last_error_detail: unknown;
  version: number;
  created_at: Date | string;
  updated_at: Date | string;
};

type CiotEventRow = {
  id: string;
  ciot_operation_id: string;
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

function mapOperationRow(row: CiotOperationRow | undefined): CiotOperation | null {
  if (!row) return null;
  return {
    id: row.id,
    integrationAccountId: row.integration_account_id,
    operationId: row.operation_id,
    provider: row.provider as CiotProvider,
    status: row.status as CiotOperationStatus,
    ciotNumber: row.ciot_number,
    correlationMarker: row.correlation_marker,
    requestPayloadSnapshot: toJsonObject(row.request_payload_snapshot),
    providerResponseSnapshot: toJsonObject(row.provider_response_snapshot),
    rejectionReasonCode: row.rejection_reason_code,
    externalStatus: row.external_status,
    requestedAt: toIso(row.requested_at),
    registeredAt: toIso(row.registered_at),
    closedAt: toIso(row.closed_at),
    cancelledAt: toIso(row.cancelled_at),
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

function mapEventRow(row: CiotEventRow | undefined): CiotEvent | null {
  if (!row) return null;
  return {
    id: row.id,
    ciotOperationId: row.ciot_operation_id,
    eventType: row.event_type as CiotEventType,
    detail: toJsonObject(row.detail),
    correlationId: row.correlation_id,
    createdAt: toIso(row.created_at) ?? ''
  };
}

// =============================================================================
// ciot_operations
// =============================================================================

export type CiotOperationInsertInput = {
  id: string;
  integrationAccountId: string;
  operationId: string;
  provider?: CiotProvider;
  correlationMarker: string;
  requestPayloadSnapshot: Record<string, unknown>;
  correlationId: string;
  commandId?: string | null;
};

/** Cria a linha em `pre_validation` — o marcador de correlação (DL-102) já nasce gravado aqui, ANTES de qualquer chamada ao provedor. */
export async function insertCiotOperation(input: CiotOperationInsertInput, client: DbClient = null): Promise<CiotOperation> {
  const execute = getQueryExecutor(client);
  const result = await execute<CiotOperationRow>(
    `insert into ciot_operations (
       id, integration_account_id, operation_id, provider, status, correlation_marker,
       request_payload_snapshot, correlation_id, command_id, version
     ) values ($1, $2, $3, $4, 'pre_validation', $5, $6::jsonb, $7, $8, 1)
     returning *`,
    [
      input.id,
      input.integrationAccountId,
      input.operationId,
      input.provider ?? 'mock',
      input.correlationMarker,
      JSON.stringify(input.requestPayloadSnapshot ?? {}),
      input.correlationId,
      input.commandId ?? null
    ]
  );
  const row = mapOperationRow(result.rows[0]);
  if (!row) {
    throw new Error(`[ciot-repo] insertCiotOperation não devolveu linha para a operação ${input.operationId}`);
  }
  return row;
}

export async function findCiotOperationById(
  id: string,
  integrationAccountId: string,
  client: DbClient = null
): Promise<CiotOperation | null> {
  const execute = getQueryExecutor(client);
  const result = await execute<CiotOperationRow>(
    'select * from ciot_operations where id = $1 and integration_account_id = $2',
    [id, integrationAccountId]
  );
  return mapOperationRow(result.rows[0]);
}

/** Sem filtro de tenancy — usado pelo WORKER (que já resolve a linha pelo `job.payload.ciotOperationId`, sem sessão de usuário). */
export async function findCiotOperationByIdInternal(id: string, client: DbClient = null): Promise<CiotOperation | null> {
  const execute = getQueryExecutor(client);
  const result = await execute<CiotOperationRow>('select * from ciot_operations where id = $1', [id]);
  return mapOperationRow(result.rows[0]);
}

/** A tentativa MAIS RECENTE de CIOT da operação — "ciot atual" do `GET .../ciot`. `null` se nunca houve `solicitar`. */
export async function findLatestCiotOperationForOperation(
  operationId: string,
  integrationAccountId: string
): Promise<CiotOperation | null> {
  const result = await query<CiotOperationRow>(
    `select * from ciot_operations
      where operation_id = $1 and integration_account_id = $2
      order by created_at desc
      limit 1`,
    [operationId, integrationAccountId]
  );
  return mapOperationRow(result.rows[0]);
}

/** `pre_validation`/`requested` → `requested` — marca o dispatch (idempotente entre tentativas do mesmo job). */
export async function markCiotOperationRequested(
  id: string,
  patch: { jobId: string }
): Promise<CiotOperation | null> {
  const result = await query<CiotOperationRow>(
    `update ciot_operations set
       status = 'requested',
       requested_at = coalesce(requested_at, now()),
       job_id = $2
     where id = $1
       and status in ('pre_validation', 'requested')
     returning *`,
    [id, patch.jobId]
  );
  return mapOperationRow(result.rows[0]);
}

export type CiotProviderResultPatch = {
  ciotNumber: string;
  externalStatus: string;
  raw: Record<string, unknown>;
};

/** `requested` → `registered` (registro confirmado pelo provedor). */
export async function completeCiotRegistrationSucceeded(
  id: string,
  patch: CiotProviderResultPatch
): Promise<CiotOperation | null> {
  const result = await query<CiotOperationRow>(
    `update ciot_operations set
       status = 'registered',
       ciot_number = $2,
       external_status = $3,
       provider_response_snapshot = $4::jsonb,
       registered_at = now()
     where id = $1
       and status = 'requested'
     returning *`,
    [id, patch.ciotNumber, patch.externalStatus, JSON.stringify(patch.raw ?? {})]
  );
  return mapOperationRow(result.rows[0]);
}

/** `requested` → `rejected` (o provedor respondeu recusando — decisão definitiva, não "não sei"). */
export async function markCiotOperationRejected(
  id: string,
  patch: { reasonCode: string; raw?: Record<string, unknown> | null }
): Promise<CiotOperation | null> {
  const result = await query<CiotOperationRow>(
    `update ciot_operations set
       status = 'rejected',
       rejection_reason_code = $2,
       provider_response_snapshot = coalesce($3::jsonb, provider_response_snapshot)
     where id = $1
       and status = 'requested'
     returning *`,
    [id, patch.reasonCode, patch.raw ? JSON.stringify(patch.raw) : null]
  );
  return mapOperationRow(result.rows[0]);
}

/**
 * Qualquer estado EM TRÂNSITO (`requested`/`registered`/`rectified` — a última ação dispatchada
 * ainda sem desfecho confirmado) → `request_unconfirmed`. NUNCA `failed`: DL-102 — "não perguntei"
 * (resposta perdida) é diferente de "perguntei e não existe".
 */
export async function markCiotOperationRequestUnconfirmed(
  id: string,
  patch: { lastErrorCode?: string | null; lastErrorDetail?: Record<string, unknown> | null }
): Promise<CiotOperation | null> {
  const result = await query<CiotOperationRow>(
    `update ciot_operations set
       status = 'request_unconfirmed',
       last_error_code = $2,
       last_error_detail = $3::jsonb
     where id = $1
       and status in ('requested', 'registered', 'rectified')
     returning *`,
    [id, patch.lastErrorCode ?? null, patch.lastErrorDetail ? JSON.stringify(patch.lastErrorDetail) : null]
  );
  return mapOperationRow(result.rows[0]);
}

/** `registered`/`rectified` → `rectified`|`cancelled`|`closed` (confirmação de retificar/cancelar/encerrar). */
export async function completeCiotMutationSucceeded(
  id: string,
  patch: CiotProviderResultPatch & { toStatus: 'rectified' | 'cancelled' | 'closed' }
): Promise<CiotOperation | null> {
  const timestampColumn = patch.toStatus === 'cancelled' ? 'cancelled_at' : patch.toStatus === 'closed' ? 'closed_at' : null;
  const result = await query<CiotOperationRow>(
    `update ciot_operations set
       status = $2,
       external_status = $3,
       provider_response_snapshot = $4::jsonb
       ${timestampColumn ? `, ${timestampColumn} = now()` : ''}
     where id = $1
       and status in ('registered', 'rectified')
     returning *`,
    [id, patch.toStatus, patch.externalStatus, JSON.stringify(patch.raw ?? {})]
  );
  return mapOperationRow(result.rows[0]);
}

/**
 * Reconciliação com DESFECHO `found`: sincroniza o status local com o que o provedor confirma.
 * Se `ciot_number` local ainda é nulo, este é o registro nascendo (mesmo caminho do sucesso de
 * `completeCiotRegistrationSucceeded`, mas vindo do reconciliador em vez do dispatch original).
 */
export async function completeCiotReconcileFound(
  id: string,
  patch: CiotProviderResultPatch & { toStatus: 'registered' | 'rectified' | 'cancelled' | 'closed' }
): Promise<CiotOperation | null> {
  const timestampColumn = patch.toStatus === 'registered'
    ? 'registered_at'
    : patch.toStatus === 'cancelled'
      ? 'cancelled_at'
      : patch.toStatus === 'closed'
        ? 'closed_at'
        : null;
  const result = await query<CiotOperationRow>(
    `update ciot_operations set
       status = $2,
       ciot_number = coalesce(ciot_number, $3),
       external_status = $4,
       provider_response_snapshot = $5::jsonb,
       last_error_code = null,
       last_error_detail = null
       ${timestampColumn ? `, ${timestampColumn} = coalesce(${timestampColumn}, now())` : ''}
     where id = $1
       and status = 'request_unconfirmed'
     returning *`,
    [id, patch.toStatus, patch.ciotNumber, patch.externalStatus, JSON.stringify(patch.raw ?? {})]
  );
  return mapOperationRow(result.rows[0]);
}

/**
 * Reconciliação com DESFECHO `not-found-after-polling` E `ciot_number` local ainda nulo — o
 * registro comprovadamente NUNCA chegou ao provedor. `rejected` aqui NÃO bloqueia a operação:
 * `transport_operations` permanece `ciot_pending` e um novo `solicitar` cria uma NOVA
 * `ciot_operations`.
 */
export async function markCiotOperationReconcileNotFoundRejected(
  id: string,
  patch: { reasonCode: string }
): Promise<CiotOperation | null> {
  const result = await query<CiotOperationRow>(
    `update ciot_operations set
       status = 'rejected',
       rejection_reason_code = $2
     where id = $1
       and status = 'request_unconfirmed'
       and ciot_number is null
     returning *`,
    [id, patch.reasonCode]
  );
  return mapOperationRow(result.rows[0]);
}

// =============================================================================
// ciot_events — APPEND-ONLY
// =============================================================================

export type CiotEventInsertInput = {
  id: string;
  ciotOperationId: string;
  eventType: CiotEventType;
  detail?: Record<string, unknown>;
  correlationId: string;
};

export async function insertCiotEvent(input: CiotEventInsertInput, client: DbClient = null): Promise<CiotEvent> {
  const execute = getQueryExecutor(client);
  const result = await execute<CiotEventRow>(
    `insert into ciot_events (id, ciot_operation_id, event_type, detail, correlation_id)
     values ($1, $2, $3, $4::jsonb, $5)
     returning *`,
    [input.id, input.ciotOperationId, input.eventType, JSON.stringify(input.detail ?? {}), input.correlationId]
  );
  const row = mapEventRow(result.rows[0]);
  if (!row) {
    throw new Error(`[ciot-repo] insertCiotEvent não devolveu linha para ${input.ciotOperationId}`);
  }
  return row;
}

export type ListCiotEventsFilters = {
  page?: number;
  pageSize?: number;
};

const DEFAULT_PAGE_SIZE = 20;
const MAX_PAGE_SIZE = 200;

export async function listCiotEventsForOperation(
  ciotOperationId: string,
  filters: ListCiotEventsFilters = {}
): Promise<{ items: CiotEvent[]; total: number; page: number; pageSize: number }> {
  const page = Math.max(Math.floor(filters.page ?? 1), 1);
  const pageSize = Math.min(Math.max(Math.floor(filters.pageSize ?? DEFAULT_PAGE_SIZE), 1), MAX_PAGE_SIZE);
  const offset = (page - 1) * pageSize;

  const totalResult = await query<{ count: string }>(
    'select count(*)::text as count from ciot_events where ciot_operation_id = $1',
    [ciotOperationId]
  );
  const total = Number(totalResult.rows[0]?.count ?? 0);

  const rowsResult = await query<CiotEventRow>(
    `select * from ciot_events
      where ciot_operation_id = $1
      order by created_at asc
      limit $2 offset $3`,
    [ciotOperationId, pageSize, offset]
  );

  const items = rowsResult.rows.map(mapEventRow).filter((row): row is CiotEvent => row !== null);
  return { items, total, page, pageSize };
}

// =============================================================================
// Varredura de reconciliação (worker) — molde `listUnconfirmedSubmitManifestsForReconciliation`.
// =============================================================================

export type UnconfirmedCiotOperationForReconciliation = {
  id: string;
  operationId: string;
  integrationAccountId: string;
  correlationMarker: string;
  correlationId: string;
};

/**
 * Candidatas a reconciliação: `request_unconfirmed` atualizadas dentro da janela informada. Janela
 * OBRIGATÓRIA — sem ela a consulta degenera em full scan (mesmo racional de
 * `listUnconfirmedSubmitManifestsForReconciliation`).
 */
export async function listUnconfirmedCiotOperationsForReconciliation(opts: {
  updatedSince: string;
  limit?: number;
}): Promise<UnconfirmedCiotOperationForReconciliation[]> {
  const limit = Math.min(Math.max(Math.floor(opts.limit ?? 100), 1), 500);
  const result = await query<{
    id: string;
    operation_id: string;
    integration_account_id: string;
    correlation_marker: string;
    correlation_id: string;
  }>(
    `select id, operation_id, integration_account_id, correlation_marker, correlation_id
       from ciot_operations
      where status = 'request_unconfirmed'
        and updated_at >= $1::timestamptz
      order by updated_at asc
      limit $2`,
    [opts.updatedSince, limit]
  );

  return result.rows.map((row) => ({
    id: row.id,
    operationId: row.operation_id,
    integrationAccountId: row.integration_account_id,
    correlationMarker: row.correlation_marker,
    correlationId: row.correlation_id
  }));
}

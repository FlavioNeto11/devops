/**
 * Repositório de `rntrc_verifications` (PR-C1, DL-103).
 *
 * TENANCY OBRIGATÓRIA (mesmo contrato de `transport-party-repo.ts`): toda leitura por id/partyId
 * filtra também por `integration_account_id`.
 *
 * "APPEND-ONLY" no sentido explicado no header da migration 027: nenhuma função aqui emite
 * `delete`; `completeVerificationSucceeded`/`completeVerificationFailed` fazem a ÚNICA transição
 * permitida (`pending` → terminal) via `where requested_status = 'pending'` — uma segunda chamada
 * para a mesma linha (ex.: side effect de DLQ correndo depois de um sucesso já commitado) é NO-OP
 * (devolve `null`, nunca sobrescreve um resultado já gravado).
 */

import type { PoolClient } from 'pg';
import { query } from '../db/pool.js';
import type {
  RntrcVerification,
  RntrcVerificationRequestedStatus,
  RntrcVerificationResultCategory,
  RntrcVerificationResultStatus,
  RntrcVerificationStrategy
} from '../lib/transport/rntrc-verification-types.js';

type DbClient = Pick<PoolClient, 'query'> | null;

function getQueryExecutor(client: DbClient = null) {
  return client?.query?.bind(client) || query;
}

type VerificationRow = {
  id: string;
  integration_account_id: string;
  party_id: string;
  rntrc_number: string | null;
  requested_status: string;
  strategy: string;
  result_status: string | null;
  result_category: string | null;
  data_reference_date: Date | string | null;
  evidence: unknown;
  evidence_source: string | null;
  verified_by: string | null;
  job_id: string | null;
  correlation_id: string;
  created_at: Date | string;
  completed_at: Date | string | null;
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

function mapRow(row: VerificationRow | undefined): RntrcVerification | null {
  if (!row) return null;
  return {
    id: row.id,
    integrationAccountId: row.integration_account_id,
    partyId: row.party_id,
    rntrcNumber: row.rntrc_number,
    requestedStatus: row.requested_status as RntrcVerificationRequestedStatus,
    strategy: row.strategy as RntrcVerificationStrategy,
    resultStatus: row.result_status as RntrcVerificationResultStatus | null,
    resultCategory: row.result_category as RntrcVerificationResultCategory | null,
    dataReferenceDate: toIsoDateOnly(row.data_reference_date),
    evidence: toJsonObject(row.evidence),
    evidenceSource: row.evidence_source,
    verifiedBy: row.verified_by,
    jobId: row.job_id,
    correlationId: row.correlation_id,
    createdAt: toIso(row.created_at) ?? '',
    completedAt: toIso(row.completed_at)
  };
}

export type VerificationInsertInput = {
  id: string;
  integrationAccountId: string;
  partyId: string;
  rntrcNumber?: string | null;
  strategy: RntrcVerificationStrategy;
  jobId?: string | null;
  correlationId: string;
};

/** Insere uma linha `pending` (open_data, antes da chamada ao gateway). */
export async function insertPendingRntrcVerification(
  input: VerificationInsertInput,
  client: DbClient = null
): Promise<RntrcVerification> {
  const execute = getQueryExecutor(client);
  const result = await execute<VerificationRow>(
    `insert into rntrc_verifications (
       id, integration_account_id, party_id, rntrc_number, requested_status, strategy, job_id,
       correlation_id
     ) values ($1, $2, $3, $4, 'pending', $5, $6, $7)
     returning *`,
    [
      input.id,
      input.integrationAccountId,
      input.partyId,
      input.rntrcNumber ?? null,
      input.strategy,
      input.jobId ?? null,
      input.correlationId
    ]
  );
  const row = mapRow(result.rows[0]);
  if (!row) {
    throw new Error(`[rntrc-verification-repo] insertPendingRntrcVerification não devolveu linha para o party ${input.partyId}`);
  }
  return row;
}

export type VerificationSucceededInput = {
  rntrcNumber?: string | null;
  resultStatus: RntrcVerificationResultStatus;
  resultCategory?: RntrcVerificationResultCategory | null;
  dataReferenceDate?: string | null;
  evidence: Record<string, unknown>;
  evidenceSource: string;
  verifiedBy?: string | null;
};

/** Grava um registro `succeeded` diretamente — usado pela estratégia `manual` (síncrona, sem fase pending). */
export async function insertSucceededRntrcVerification(
  input: VerificationInsertInput & VerificationSucceededInput,
  client: DbClient = null
): Promise<RntrcVerification> {
  const execute = getQueryExecutor(client);
  const result = await execute<VerificationRow>(
    `insert into rntrc_verifications (
       id, integration_account_id, party_id, rntrc_number, requested_status, strategy,
       result_status, result_category, data_reference_date, evidence, evidence_source,
       verified_by, job_id, correlation_id, completed_at
     ) values (
       $1, $2, $3, $4, 'succeeded', $5, $6, $7, $8::date, $9::jsonb, $10, $11, $12, $13, now()
     )
     returning *`,
    [
      input.id,
      input.integrationAccountId,
      input.partyId,
      input.rntrcNumber ?? null,
      input.strategy,
      input.resultStatus,
      input.resultCategory ?? null,
      input.dataReferenceDate ?? null,
      JSON.stringify(input.evidence ?? {}),
      input.evidenceSource,
      input.verifiedBy ?? null,
      input.jobId ?? null,
      input.correlationId
    ]
  );
  const row = mapRow(result.rows[0]);
  if (!row) {
    throw new Error(`[rntrc-verification-repo] insertSucceededRntrcVerification não devolveu linha para o party ${input.partyId}`);
  }
  return row;
}

/** `pending` → `succeeded` (única transição permitida). `null` quando a linha já não está `pending` (NO-OP idempotente). */
export async function completeVerificationSucceeded(
  id: string,
  patch: VerificationSucceededInput,
  client: DbClient = null
): Promise<RntrcVerification | null> {
  const execute = getQueryExecutor(client);
  const result = await execute<VerificationRow>(
    `update rntrc_verifications set
       rntrc_number = coalesce($2, rntrc_number),
       requested_status = 'succeeded',
       result_status = $3,
       result_category = $4,
       data_reference_date = $5::date,
       evidence = $6::jsonb,
       evidence_source = $7,
       verified_by = coalesce($8, verified_by),
       completed_at = now()
     where id = $1
       and requested_status = 'pending'
     returning *`,
    [
      id,
      patch.rntrcNumber ?? null,
      patch.resultStatus,
      patch.resultCategory ?? null,
      patch.dataReferenceDate ?? null,
      JSON.stringify(patch.evidence ?? {}),
      patch.evidenceSource,
      patch.verifiedBy ?? null
    ]
  );
  return mapRow(result.rows[0]);
}

/** `pending` → `failed` (terminal de fila — falha de rede/timeout esgotou as tentativas). Nunca toca `transport_parties`. */
export async function completeVerificationFailed(
  id: string,
  patch: { lastErrorCode?: string | null; lastErrorMessage?: string | null }
): Promise<RntrcVerification | null> {
  const result = await query<VerificationRow>(
    `update rntrc_verifications set
       requested_status = 'failed',
       evidence = evidence || $2::jsonb,
       completed_at = now()
     where id = $1
       and requested_status = 'pending'
     returning *`,
    [
      id,
      JSON.stringify({
        lastErrorCode: patch.lastErrorCode ?? null,
        lastErrorMessage: patch.lastErrorMessage ?? null
      })
    ]
  );
  return mapRow(result.rows[0]);
}

export async function findRntrcVerificationById(
  id: string,
  integrationAccountId: string
): Promise<RntrcVerification | null> {
  const result = await query<VerificationRow>(
    'select * from rntrc_verifications where id = $1 and integration_account_id = $2',
    [id, integrationAccountId]
  );
  return mapRow(result.rows[0]);
}

/** Última verificação SUCEDIDA do party — usada pelo motor de compliance (`ctx.carrierRntrcVerification`). */
export async function findLatestSucceededRntrcVerificationForParty(
  partyId: string,
  integrationAccountId: string
): Promise<RntrcVerification | null> {
  const result = await query<VerificationRow>(
    `select * from rntrc_verifications
      where party_id = $1
        and integration_account_id = $2
        and requested_status = 'succeeded'
      order by completed_at desc nulls last, created_at desc
      limit 1`,
    [partyId, integrationAccountId]
  );
  return mapRow(result.rows[0]);
}

export type ListRntrcVerificationsFilters = {
  page?: number;
  pageSize?: number;
};

const DEFAULT_PAGE_SIZE = 20;
const MAX_PAGE_SIZE = 200;

/** Histórico paginado (todas as tentativas, mais recente primeiro) — `GET .../verificacoes-rntrc`. */
export async function listRntrcVerificationsForParty(
  partyId: string,
  integrationAccountId: string,
  filters: ListRntrcVerificationsFilters = {}
): Promise<{ items: RntrcVerification[]; total: number; page: number; pageSize: number }> {
  const page = Math.max(Math.floor(filters.page ?? 1), 1);
  const pageSize = Math.min(Math.max(Math.floor(filters.pageSize ?? DEFAULT_PAGE_SIZE), 1), MAX_PAGE_SIZE);
  const offset = (page - 1) * pageSize;

  const totalResult = await query<{ count: string }>(
    `select count(*)::text as count from rntrc_verifications where party_id = $1 and integration_account_id = $2`,
    [partyId, integrationAccountId]
  );
  const total = Number(totalResult.rows[0]?.count ?? 0);

  const rowsResult = await query<VerificationRow>(
    `select * from rntrc_verifications
      where party_id = $1 and integration_account_id = $2
      order by created_at desc
      limit $3 offset $4`,
    [partyId, integrationAccountId, pageSize, offset]
  );

  const items = rowsResult.rows.map(mapRow).filter((row): row is RntrcVerification => row !== null);
  return { items, total, page, pageSize };
}

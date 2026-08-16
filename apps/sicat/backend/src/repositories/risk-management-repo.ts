/**
 * Repositório de `risk_screenings`/`risk_tracking_confirmations` (PR-I5, REQ-SICAT-0036).
 *
 * `risk_screenings` é APPEND-ONLY no sentido que importa: cada TENTATIVA de pesquisa é uma linha
 * nova (nunca se reescreve o veredito de uma consulta anterior) — só o `status` da própria tentativa
 * transita (`requesting` → `completed`/`request_unconfirmed`/`failed`), sempre por UPDATE guardado.
 * Mesmo racional de `rntrc_verifications`.
 *
 * TENANCY OBRIGATÓRIA em toda leitura da superfície HTTP.
 */

import type { PoolClient } from 'pg';
import { query } from '../db/pool.js';
import { createPrefixedId } from '../lib/ids.js';

type DbClient = Pick<PoolClient, 'query'> | null;

function getQueryExecutor(client: DbClient = null) {
  return client?.query?.bind(client) || query;
}

export type RiskScreeningSubjectType = 'driver' | 'vehicle';
export type RiskScreeningStatus = 'requesting' | 'completed' | 'request_unconfirmed' | 'failed';
export type RiskScreeningOutcomeValue = 'approved' | 'rejected' | 'inconclusive';

export type RiskScreening = {
  id: string;
  integrationAccountId: string;
  subjectType: RiskScreeningSubjectType;
  driverId: string | null;
  vehicleId: string | null;
  provider: string;
  correlationMarker: string;
  status: RiskScreeningStatus;
  outcome: RiskScreeningOutcomeValue | null;
  result: Record<string, unknown>;
  validUntil: string | null;
  requestedBy: string | null;
  correlationId: string;
  createdAt: string | null;
  updatedAt: string | null;
};

export type RiskTrackingConfirmation = {
  id: string;
  integrationAccountId: string;
  operationId: string;
  vehicleId: string | null;
  trackerProvider: string | null;
  status: 'confirmed' | 'revoked';
  evidence: Record<string, unknown>;
  correlationId: string;
  version: number;
  createdAt: string | null;
  updatedAt: string | null;
};

function toIso(value: Date | string | null | undefined): string | null {
  if (value == null) return null;
  if (value instanceof Date) return value.toISOString();
  return String(value);
}

function toIsoDateOrNull(value: Date | string | null | undefined): string | null {
  if (value == null) return null;
  if (value instanceof Date) {
    const year = value.getFullYear();
    const month = String(value.getMonth() + 1).padStart(2, '0');
    const day = String(value.getDate()).padStart(2, '0');
    return `${year}-${month}-${day}`;
  }
  return String(value).slice(0, 10);
}

function toJsonObject(value: unknown): Record<string, unknown> {
  if (value && typeof value === 'object' && !Array.isArray(value)) return value as Record<string, unknown>;
  return {};
}

const SCREENING_COLUMNS = `
  id, integration_account_id, subject_type, driver_id, vehicle_id, provider, correlation_marker,
  status, outcome, result, valid_until, requested_by, correlation_id, created_at, updated_at
`;

type ScreeningRow = {
  id: string;
  integration_account_id: string;
  subject_type: string;
  driver_id: string | null;
  vehicle_id: string | null;
  provider: string;
  correlation_marker: string;
  status: string;
  outcome: string | null;
  result: unknown;
  valid_until: Date | string | null;
  requested_by: string | null;
  correlation_id: string;
  created_at: Date | string;
  updated_at: Date | string;
};

function mapScreening(row: ScreeningRow | undefined): RiskScreening | null {
  if (!row) return null;
  return {
    id: row.id,
    integrationAccountId: row.integration_account_id,
    subjectType: row.subject_type as RiskScreeningSubjectType,
    driverId: row.driver_id,
    vehicleId: row.vehicle_id,
    provider: row.provider,
    correlationMarker: row.correlation_marker,
    status: row.status as RiskScreeningStatus,
    outcome: (row.outcome as RiskScreeningOutcomeValue | null) ?? null,
    result: toJsonObject(row.result),
    validUntil: toIsoDateOrNull(row.valid_until),
    requestedBy: row.requested_by,
    correlationId: row.correlation_id,
    createdAt: toIso(row.created_at),
    updatedAt: toIso(row.updated_at)
  };
}

export async function insertScreening(
  input: {
    integrationAccountId: string;
    subjectType: RiskScreeningSubjectType;
    driverId?: string | null;
    vehicleId?: string | null;
    provider: string;
    correlationMarker: string;
    requestedBy?: string | null;
    correlationId: string;
  },
  client: DbClient = null
): Promise<RiskScreening> {
  const exec = getQueryExecutor(client);
  const id = createPrefixedId('riskscr');
  const result = await exec(
    `insert into risk_screenings
       (id, integration_account_id, subject_type, driver_id, vehicle_id, provider, correlation_marker, requested_by, correlation_id)
     values ($1, $2, $3, $4, $5, $6, $7, $8, $9)
     returning ${SCREENING_COLUMNS}`,
    [
      id,
      input.integrationAccountId,
      input.subjectType,
      input.driverId ?? null,
      input.vehicleId ?? null,
      input.provider,
      input.correlationMarker,
      input.requestedBy ?? null,
      input.correlationId
    ]
  );
  return mapScreening(result.rows[0] as ScreeningRow)!;
}

/** UPDATE GUARDADO: só sai de `requesting`/`request_unconfirmed` — retry tardio é NO-OP idempotente. */
export async function completeScreening(
  input: { id: string; outcome: RiskScreeningOutcomeValue; validUntil: string | null; result: Record<string, unknown> },
  client: DbClient = null
): Promise<RiskScreening | null> {
  const exec = getQueryExecutor(client);
  const result = await exec(
    `update risk_screenings
        set status = 'completed', outcome = $2, valid_until = $3::date, result = $4::jsonb, updated_at = now()
      where id = $1 and status in ('requesting', 'request_unconfirmed')
      returning ${SCREENING_COLUMNS}`,
    [input.id, input.outcome, input.validUntil, JSON.stringify(input.result)]
  );
  return mapScreening(result.rows[0] as ScreeningRow | undefined);
}

export async function markScreeningUnconfirmed(id: string, client: DbClient = null): Promise<RiskScreening | null> {
  const exec = getQueryExecutor(client);
  const result = await exec(
    `update risk_screenings
        set status = 'request_unconfirmed', updated_at = now()
      where id = $1 and status = 'requesting'
      returning ${SCREENING_COLUMNS}`,
    [id]
  );
  return mapScreening(result.rows[0] as ScreeningRow | undefined);
}

export async function markScreeningFailed(id: string, client: DbClient = null): Promise<RiskScreening | null> {
  const exec = getQueryExecutor(client);
  const result = await exec(
    `update risk_screenings
        set status = 'failed', updated_at = now()
      where id = $1 and status in ('requesting', 'request_unconfirmed')
      returning ${SCREENING_COLUMNS}`,
    [id]
  );
  return mapScreening(result.rows[0] as ScreeningRow | undefined);
}

export async function findScreeningById(
  id: string,
  integrationAccountId: string,
  client: DbClient = null
): Promise<RiskScreening | null> {
  const exec = getQueryExecutor(client);
  const result = await exec(
    `select ${SCREENING_COLUMNS} from risk_screenings where id = $1 and integration_account_id = $2`,
    [id, integrationAccountId]
  );
  return mapScreening(result.rows[0] as ScreeningRow | undefined);
}

export async function listScreeningsForAccount(
  opts: { integrationAccountId: string; subjectType?: RiskScreeningSubjectType | null; driverId?: string | null; vehicleId?: string | null; limit?: number },
  client: DbClient = null
): Promise<RiskScreening[]> {
  const exec = getQueryExecutor(client);
  const params: unknown[] = [opts.integrationAccountId];
  const filters = ['integration_account_id = $1'];
  if (opts.subjectType) {
    params.push(opts.subjectType);
    filters.push(`subject_type = $${params.length}`);
  }
  if (opts.driverId) {
    params.push(opts.driverId);
    filters.push(`driver_id = $${params.length}`);
  }
  if (opts.vehicleId) {
    params.push(opts.vehicleId);
    filters.push(`vehicle_id = $${params.length}`);
  }
  params.push(Math.max(1, Math.min(Number(opts.limit || 100), 200)));
  const result = await exec(
    `select ${SCREENING_COLUMNS} from risk_screenings
      where ${filters.join(' and ')}
      order by created_at desc
      limit $${params.length}`,
    params
  );
  return (result.rows as ScreeningRow[]).map((row) => mapScreening(row)!).filter(Boolean);
}

/**
 * A pesquisa VÁLIDA mais recente de cada alvo — é o que o gate TR-GR-001 pergunta: "este motorista e
 * este veículo têm pesquisa aprovada e vigente na data da operação?".
 */
export async function findLatestValidScreening(
  opts: { subjectType: RiskScreeningSubjectType; targetId: string; referenceDate: string },
  client: DbClient = null
): Promise<RiskScreening | null> {
  const exec = getQueryExecutor(client);
  const column = opts.subjectType === 'driver' ? 'driver_id' : 'vehicle_id';
  const result = await exec(
    `select ${SCREENING_COLUMNS} from risk_screenings
      where ${column} = $1
        and status = 'completed'
      order by created_at desc
      limit 1`,
    [opts.targetId]
  );
  return mapScreening(result.rows[0] as ScreeningRow | undefined);
}

export async function listUnconfirmedScreeningsForReconciliation(
  opts: { updatedSince: string },
  client: DbClient = null
): Promise<RiskScreening[]> {
  const exec = getQueryExecutor(client);
  const result = await exec(
    `select ${SCREENING_COLUMNS} from risk_screenings
      where status = 'request_unconfirmed' and updated_at >= $1::timestamptz
      order by updated_at asc
      limit 100`,
    [opts.updatedSince]
  );
  return (result.rows as ScreeningRow[]).map((row) => mapScreening(row)!).filter(Boolean);
}

// -------------------------------------------------------------------------------------------------
// Confirmação de rastreamento
// -------------------------------------------------------------------------------------------------

const TRACKING_COLUMNS = `
  id, integration_account_id, operation_id, vehicle_id, tracker_provider, status, evidence,
  correlation_id, version, created_at, updated_at
`;

type TrackingRow = {
  id: string;
  integration_account_id: string;
  operation_id: string;
  vehicle_id: string | null;
  tracker_provider: string | null;
  status: string;
  evidence: unknown;
  correlation_id: string;
  version: number;
  created_at: Date | string;
  updated_at: Date | string;
};

function mapTracking(row: TrackingRow | undefined): RiskTrackingConfirmation | null {
  if (!row) return null;
  return {
    id: row.id,
    integrationAccountId: row.integration_account_id,
    operationId: row.operation_id,
    vehicleId: row.vehicle_id,
    trackerProvider: row.tracker_provider,
    status: row.status as 'confirmed' | 'revoked',
    evidence: toJsonObject(row.evidence),
    correlationId: row.correlation_id,
    version: Number(row.version),
    createdAt: toIso(row.created_at),
    updatedAt: toIso(row.updated_at)
  };
}

export async function insertTrackingConfirmation(
  input: {
    integrationAccountId: string;
    operationId: string;
    vehicleId?: string | null;
    trackerProvider?: string | null;
    evidence?: Record<string, unknown>;
    correlationId: string;
  },
  client: DbClient = null
): Promise<RiskTrackingConfirmation> {
  const exec = getQueryExecutor(client);
  const id = createPrefixedId('trkconf');
  const result = await exec(
    `insert into risk_tracking_confirmations
       (id, integration_account_id, operation_id, vehicle_id, tracker_provider, evidence, correlation_id)
     values ($1, $2, $3, $4, $5, $6::jsonb, $7)
     returning ${TRACKING_COLUMNS}`,
    [
      id,
      input.integrationAccountId,
      input.operationId,
      input.vehicleId ?? null,
      input.trackerProvider ?? null,
      JSON.stringify(input.evidence || {}),
      input.correlationId
    ]
  );
  return mapTracking(result.rows[0] as TrackingRow)!;
}

export async function findActiveTrackingConfirmation(
  operationId: string,
  client: DbClient = null
): Promise<RiskTrackingConfirmation | null> {
  const exec = getQueryExecutor(client);
  const result = await exec(
    `select ${TRACKING_COLUMNS} from risk_tracking_confirmations
      where operation_id = $1 and status = 'confirmed' limit 1`,
    [operationId]
  );
  return mapTracking(result.rows[0] as TrackingRow | undefined);
}

export async function revokeTrackingConfirmation(
  id: string,
  integrationAccountId: string,
  client: DbClient = null
): Promise<RiskTrackingConfirmation | null> {
  const exec = getQueryExecutor(client);
  const result = await exec(
    `update risk_tracking_confirmations
        set status = 'revoked', updated_at = now()
      where id = $1 and integration_account_id = $2 and status = 'confirmed'
      returning ${TRACKING_COLUMNS}`,
    [id, integrationAccountId]
  );
  return mapTracking(result.rows[0] as TrackingRow | undefined);
}

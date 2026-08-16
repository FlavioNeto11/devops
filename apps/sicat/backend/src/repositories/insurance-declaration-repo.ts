/**
 * Repositório de `insurance_shipment_declarations`/`insurance_declaration_events` (PR-I3,
 * REQ-SICAT-0034, DL-102 aplicado à averbação).
 *
 * TENANCY OBRIGATÓRIA (mesmo contrato de `ciot-repo.ts`): toda leitura por id na superfície HTTP
 * filtra também por `integration_account_id`; a variante `*Internal` (sem tenancy) existe SÓ para o
 * worker, que resolve a linha pelo `job.payload.declarationId`.
 *
 * As transições de `status` são todas UPDATEs GUARDADOS (`where status = ...`) — uma segunda
 * chamada para a mesma linha (retry tardio depois de um commit anterior) é NO-OP idempotente
 * (devolve `null`, nunca sobrescreve um resultado já gravado).
 *
 * `insurance_declaration_events` é APPEND-ONLY — só `insert`, nunca `update`/`delete`.
 */

import type { PoolClient } from 'pg';
import { query } from '../db/pool.js';
import type {
  InsuranceDeclarationEvent,
  InsuranceDeclarationEventType,
  InsuranceDeclarationStatus,
  InsuranceDeclarationUnconfirmedStatus,
  InsuranceShipmentDeclaration
} from '../lib/transport/averbacao-types.js';

type DbClient = Pick<PoolClient, 'query'> | null;

function getQueryExecutor(client: DbClient = null) {
  return client?.query?.bind(client) || query;
}

type DeclarationRow = {
  id: string;
  integration_account_id: string;
  operation_id: string;
  policy_id: string;
  rate_schedule_id: string;
  declared_cargo_amount: string | number;
  applied_rate_percent: string | number;
  premium_amount: string | number;
  route_scope: string | null;
  provider_declaration_ref: string | null;
  correlation_marker: string;
  status: string;
  last_error_code: string | null;
  correlation_id: string;
  version: number;
  created_at: Date | string;
  updated_at: Date | string;
};

type DeclarationEventRow = {
  id: string;
  declaration_id: string;
  event_type: string;
  payload: unknown;
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

function mapDeclarationRow(row: DeclarationRow | undefined): InsuranceShipmentDeclaration | null {
  if (!row) return null;
  return {
    id: row.id,
    integrationAccountId: row.integration_account_id,
    operationId: row.operation_id,
    policyId: row.policy_id,
    rateScheduleId: row.rate_schedule_id,
    declaredCargoAmount: Number(row.declared_cargo_amount),
    appliedRatePercent: Number(row.applied_rate_percent),
    premiumAmount: Number(row.premium_amount),
    routeScope: row.route_scope,
    providerDeclarationRef: row.provider_declaration_ref,
    correlationMarker: row.correlation_marker,
    status: row.status as InsuranceDeclarationStatus,
    lastErrorCode: row.last_error_code,
    correlationId: row.correlation_id,
    version: Number(row.version ?? 1),
    createdAt: toIso(row.created_at) ?? '',
    updatedAt: toIso(row.updated_at) ?? ''
  };
}

function mapEventRow(row: DeclarationEventRow | undefined): InsuranceDeclarationEvent | null {
  if (!row) return null;
  return {
    id: row.id,
    declarationId: row.declaration_id,
    eventType: row.event_type as InsuranceDeclarationEventType,
    payload: toJsonObject(row.payload),
    correlationId: row.correlation_id,
    createdAt: toIso(row.created_at) ?? ''
  };
}

// =============================================================================
// insurance_shipment_declarations
// =============================================================================

export type DeclarationInsertInput = {
  id: string;
  integrationAccountId: string;
  operationId: string;
  policyId: string;
  rateScheduleId: string;
  declaredCargoAmount: number;
  appliedRatePercent: number;
  premiumAmount: number;
  routeScope?: string | null;
  correlationMarker: string;
  correlationId: string;
};

/** Cria a linha em `declaring` — o marcador de correlação (DL-102) já nasce gravado aqui, ANTES de qualquer chamada ao gateway. */
export async function insertDeclaration(input: DeclarationInsertInput, client: DbClient = null): Promise<InsuranceShipmentDeclaration> {
  const execute = getQueryExecutor(client);
  const result = await execute<DeclarationRow>(
    `insert into insurance_shipment_declarations (
       id, integration_account_id, operation_id, policy_id, rate_schedule_id,
       declared_cargo_amount, applied_rate_percent, premium_amount, route_scope,
       correlation_marker, status, correlation_id, version
     ) values ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, 'declaring', $11, 1)
     returning *`,
    [
      input.id,
      input.integrationAccountId,
      input.operationId,
      input.policyId,
      input.rateScheduleId,
      input.declaredCargoAmount,
      input.appliedRatePercent,
      input.premiumAmount,
      input.routeScope ?? null,
      input.correlationMarker,
      input.correlationId
    ]
  );
  const row = mapDeclarationRow(result.rows[0]);
  if (!row) {
    throw new Error(`[insurance-declaration-repo] insertDeclaration não devolveu linha para a operação ${input.operationId}`);
  }
  return row;
}

export async function findDeclarationById(
  id: string,
  integrationAccountId: string,
  client: DbClient = null
): Promise<InsuranceShipmentDeclaration | null> {
  const execute = getQueryExecutor(client);
  const result = await execute<DeclarationRow>(
    'select * from insurance_shipment_declarations where id = $1 and integration_account_id = $2',
    [id, integrationAccountId]
  );
  return mapDeclarationRow(result.rows[0]);
}

/** Sem filtro de tenancy — usado pelo WORKER (que resolve a linha pelo `job.payload.declarationId`, sem sessão de usuário). */
export async function findDeclarationByIdInternal(id: string, client: DbClient = null): Promise<InsuranceShipmentDeclaration | null> {
  const execute = getQueryExecutor(client);
  const result = await execute<DeclarationRow>('select * from insurance_shipment_declarations where id = $1', [id]);
  return mapDeclarationRow(result.rows[0]);
}

/** Todas as declarações da operação (histórico completo, mais recente primeiro) — `GET .../averbacoes` e contexto de TR-SEG-005. */
export async function listDeclarationsForOperation(
  operationId: string,
  integrationAccountId: string,
  client: DbClient = null
): Promise<InsuranceShipmentDeclaration[]> {
  const execute = getQueryExecutor(client);
  const result = await execute<DeclarationRow>(
    `select * from insurance_shipment_declarations
      where operation_id = $1 and integration_account_id = $2
      order by created_at desc`,
    [operationId, integrationAccountId]
  );
  return result.rows.map(mapDeclarationRow).filter((row): row is InsuranceShipmentDeclaration => row !== null);
}

export type ListDeclarationsForAccountFilters = {
  /** 'YYYY-MM-DD' — recorte por `created_at` (>= from, < to+1d). */
  from?: string | null;
  to?: string | null;
  policyId?: string | null;
  status?: InsuranceDeclarationStatus | null;
  page?: number;
  pageSize?: number;
};

const DEFAULT_PAGE_SIZE = 20;
const MAX_PAGE_SIZE = 200;

/** Averbações da CONTA por período — extrato que alimenta a apuração mensal (PR-I4) e a tela de Averbações. */
export async function listDeclarationsForAccount(
  integrationAccountId: string,
  filters: ListDeclarationsForAccountFilters = {}
): Promise<{ items: InsuranceShipmentDeclaration[]; total: number; page: number; pageSize: number }> {
  const page = Math.max(Math.floor(filters.page ?? 1), 1);
  const pageSize = Math.min(Math.max(Math.floor(filters.pageSize ?? DEFAULT_PAGE_SIZE), 1), MAX_PAGE_SIZE);
  const offset = (page - 1) * pageSize;

  const conditions: string[] = ['integration_account_id = $1'];
  const values: unknown[] = [integrationAccountId];

  if (filters.from) {
    values.push(filters.from);
    conditions.push(`created_at >= $${values.length}::date`);
  }
  if (filters.to) {
    // Limite EXCLUSIVO no dia seguinte — 'to' é inclusivo na semântica do contrato ("até o dia X").
    values.push(filters.to);
    conditions.push(`created_at < ($${values.length}::date + interval '1 day')`);
  }
  if (filters.policyId) {
    values.push(filters.policyId);
    conditions.push(`policy_id = $${values.length}`);
  }
  if (filters.status) {
    values.push(filters.status);
    conditions.push(`status = $${values.length}`);
  }

  const where = conditions.join(' and ');

  const totalResult = await query<{ count: string }>(
    `select count(*)::text as count from insurance_shipment_declarations where ${where}`,
    values
  );
  const total = Number(totalResult.rows[0]?.count ?? 0);

  const rowsResult = await query<DeclarationRow>(
    `select * from insurance_shipment_declarations
      where ${where}
      order by created_at desc
      limit $${values.length + 1} offset $${values.length + 2}`,
    [...values, pageSize, offset]
  );

  const items = rowsResult.rows.map(mapDeclarationRow).filter((row): row is InsuranceShipmentDeclaration => row !== null);
  return { items, total, page, pageSize };
}

/** `declaring` → `declared` (seguradora confirmou; `provider_declaration_ref` nasce aqui — DL-102). */
export async function completeDeclarationDeclared(
  id: string,
  patch: { providerDeclarationRef: string }
): Promise<InsuranceShipmentDeclaration | null> {
  const result = await query<DeclarationRow>(
    `update insurance_shipment_declarations set
       status = 'declared',
       provider_declaration_ref = $2,
       last_error_code = null
     where id = $1
       and status = 'declaring'
     returning *`,
    [id, patch.providerDeclarationRef]
  );
  return mapDeclarationRow(result.rows[0]);
}

/** `declaring` → `rejected` (a seguradora respondeu recusando — decisão definitiva, não "não sei"). */
export async function markDeclarationRejected(
  id: string,
  patch: { reasonCode: string }
): Promise<InsuranceShipmentDeclaration | null> {
  const result = await query<DeclarationRow>(
    `update insurance_shipment_declarations set
       status = 'rejected',
       last_error_code = $2
     where id = $1
       and status = 'declaring'
     returning *`,
    [id, patch.reasonCode]
  );
  return mapDeclarationRow(result.rows[0]);
}

/**
 * `declared` → `rectifying`, CONGELANDO o novo valor/prêmio NA LINHA (o ato da retificação é a
 * declaração do novo valor — mesmo racional do congelamento na criação). Guardado por `version`
 * (locking otimista): o valor congelado é exatamente o que o operador viu.
 */
export async function markDeclarationRectifying(
  id: string,
  expectedVersion: number,
  patch: { declaredCargoAmount: number; premiumAmount: number }
): Promise<InsuranceShipmentDeclaration | null> {
  const result = await query<DeclarationRow>(
    `update insurance_shipment_declarations set
       status = 'rectifying',
       declared_cargo_amount = $3,
       premium_amount = $4
     where id = $1
       and version = $2
       and status = 'declared'
     returning *`,
    [id, expectedVersion, patch.declaredCargoAmount, patch.premiumAmount]
  );
  return mapDeclarationRow(result.rows[0]);
}

/** `rectifying` → `declared` (retificação confirmada — o estado volta a "declarado"; o evento `rectified` registra o fato). */
export async function completeDeclarationRectified(id: string): Promise<InsuranceShipmentDeclaration | null> {
  const result = await query<DeclarationRow>(
    `update insurance_shipment_declarations set
       status = 'declared',
       last_error_code = null
     where id = $1
       and status = 'rectifying'
     returning *`,
    [id]
  );
  return mapDeclarationRow(result.rows[0]);
}

/** `declared` → `cancelling` — guardado por `version` (locking otimista, mesma postura do rectify). */
export async function markDeclarationCancelling(id: string, expectedVersion: number): Promise<InsuranceShipmentDeclaration | null> {
  const result = await query<DeclarationRow>(
    `update insurance_shipment_declarations set
       status = 'cancelling'
     where id = $1
       and version = $2
       and status = 'declared'
     returning *`,
    [id, expectedVersion]
  );
  return mapDeclarationRow(result.rows[0]);
}

/** `cancelling` → `cancelled` (terminal — libera a chave viva operação×apólice). */
export async function completeDeclarationCancelled(id: string): Promise<InsuranceShipmentDeclaration | null> {
  const result = await query<DeclarationRow>(
    `update insurance_shipment_declarations set
       status = 'cancelled',
       last_error_code = null
     where id = $1
       and status = 'cancelling'
     returning *`,
    [id]
  );
  return mapDeclarationRow(result.rows[0]);
}

/** Mapa "operação em trânsito" → estado `*_unconfirmed` correspondente (DL-102: resposta perdida NUNCA vira falha). */
const IN_TRANSIT_TO_UNCONFIRMED: Record<string, InsuranceDeclarationUnconfirmedStatus> = {
  declaring: 'declare_unconfirmed',
  rectifying: 'rectify_unconfirmed',
  cancelling: 'cancel_unconfirmed'
};

/**
 * Qualquer estado EM TRÂNSITO (`declaring`/`rectifying`/`cancelling` — a ação dispatchada ainda sem
 * desfecho confirmado) → o `*_unconfirmed` correspondente. NUNCA `rejected`: "não perguntei"
 * (resposta perdida) é diferente de "perguntei e a seguradora recusou".
 */
export async function markDeclarationUnconfirmed(
  id: string,
  patch: { lastErrorCode?: string | null }
): Promise<InsuranceShipmentDeclaration | null> {
  const current = await findDeclarationByIdInternal(id);
  const unconfirmedStatus = current ? IN_TRANSIT_TO_UNCONFIRMED[current.status] : undefined;
  if (!current || !unconfirmedStatus) return null; // já não estava em trânsito — nada a fazer

  const result = await query<DeclarationRow>(
    `update insurance_shipment_declarations set
       status = $3,
       last_error_code = $4
     where id = $1
       and status = $2
     returning *`,
    [id, current.status, unconfirmedStatus, patch.lastErrorCode ?? null]
  );
  return mapDeclarationRow(result.rows[0]);
}

/**
 * Reconciliação com DESFECHO `found`: sincroniza o status local com o que a seguradora confirma.
 * `DECLARED`/`RECTIFIED` → `declared`; `CANCELLED` → `cancelled`. Guardado nos três estados
 * `*_unconfirmed` — qualquer outro estado significa que um caminho concorrente já resolveu (NO-OP).
 */
export async function completeDeclarationReconcileFound(
  id: string,
  patch: { toStatus: 'declared' | 'cancelled'; providerDeclarationRef: string }
): Promise<InsuranceShipmentDeclaration | null> {
  const result = await query<DeclarationRow>(
    `update insurance_shipment_declarations set
       status = $2,
       provider_declaration_ref = coalesce(provider_declaration_ref, $3),
       last_error_code = null
     where id = $1
       and status in ('declare_unconfirmed', 'rectify_unconfirmed', 'cancel_unconfirmed')
     returning *`,
    [id, patch.toStatus, patch.providerDeclarationRef]
  );
  return mapDeclarationRow(result.rows[0]);
}

/**
 * Reconciliação com DESFECHO `not-found-after-polling` E `provider_declaration_ref` ainda nulo — a
 * declaração comprovadamente NUNCA chegou à seguradora. `rejected` libera a chave viva: um novo
 * `averbar` cria uma NOVA declaração (histórico preservado, nunca reescrito).
 */
export async function markDeclarationReconcileNotFoundRejected(
  id: string,
  patch: { reasonCode: string }
): Promise<InsuranceShipmentDeclaration | null> {
  const result = await query<DeclarationRow>(
    `update insurance_shipment_declarations set
       status = 'rejected',
       last_error_code = $2
     where id = $1
       and status in ('declare_unconfirmed', 'rectify_unconfirmed', 'cancel_unconfirmed')
       and provider_declaration_ref is null
     returning *`,
    [id, patch.reasonCode]
  );
  return mapDeclarationRow(result.rows[0]);
}

// =============================================================================
// insurance_declaration_events — APPEND-ONLY
// =============================================================================

export type DeclarationEventInsertInput = {
  id: string;
  declarationId: string;
  eventType: InsuranceDeclarationEventType;
  payload?: Record<string, unknown>;
  correlationId: string;
};

export async function insertDeclarationEvent(input: DeclarationEventInsertInput, client: DbClient = null): Promise<InsuranceDeclarationEvent> {
  const execute = getQueryExecutor(client);
  const result = await execute<DeclarationEventRow>(
    `insert into insurance_declaration_events (id, declaration_id, event_type, payload, correlation_id)
     values ($1, $2, $3, $4::jsonb, $5)
     returning *`,
    [input.id, input.declarationId, input.eventType, JSON.stringify(input.payload ?? {}), input.correlationId]
  );
  const row = mapEventRow(result.rows[0]);
  if (!row) {
    throw new Error(`[insurance-declaration-repo] insertDeclarationEvent não devolveu linha para ${input.declarationId}`);
  }
  return row;
}

export async function listDeclarationEvents(declarationId: string, client: DbClient = null): Promise<InsuranceDeclarationEvent[]> {
  const execute = getQueryExecutor(client);
  const result = await execute<DeclarationEventRow>(
    `select * from insurance_declaration_events
      where declaration_id = $1
      order by created_at asc`,
    [declarationId]
  );
  return result.rows.map(mapEventRow).filter((row): row is InsuranceDeclarationEvent => row !== null);
}

// =============================================================================
// Varredura de reconciliação (worker) — molde `listUnconfirmedCiotOperationsForReconciliation`.
// =============================================================================

export type UnconfirmedDeclarationForReconciliation = {
  id: string;
  operationId: string;
  integrationAccountId: string;
  correlationMarker: string;
  correlationId: string;
};

/**
 * Candidatas a reconciliação: `*_unconfirmed` atualizadas dentro da janela informada. Janela
 * OBRIGATÓRIA — sem ela a consulta degenera em full scan (mesmo racional do CIOT).
 */
export async function listUnconfirmedDeclarationsForReconciliation(opts: {
  updatedSince: string;
  limit?: number;
}): Promise<UnconfirmedDeclarationForReconciliation[]> {
  const limit = Math.min(Math.max(Math.floor(opts.limit ?? 100), 1), 500);
  const result = await query<{
    id: string;
    operation_id: string;
    integration_account_id: string;
    correlation_marker: string;
    correlation_id: string;
  }>(
    `select id, operation_id, integration_account_id, correlation_marker, correlation_id
       from insurance_shipment_declarations
      where status in ('declare_unconfirmed', 'rectify_unconfirmed', 'cancel_unconfirmed')
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

/**
 * Repositório do domínio VPO (PR-D1, DL-103 + DL-102 aplicado ao VPO): `vpo_providers` (cadastro
 * de referência), `vpo_allocations` (recurso MUTÁVEL — uma linha por operação, ver header da
 * migration 029) e `vpo_events` (trilha APPEND-ONLY).
 *
 * TENANCY OBRIGATÓRIA (mesmo contrato de `ciot-repo.ts`): toda leitura/escrita de `vpo_allocations`
 * por id filtra também por `integration_account_id` — EXCETO as funções `*Internal`, usadas pelo
 * WORKER (que já resolve a linha pelo `job.payload.vpoAllocationId`, sem sessão de usuário).
 * `vpo_providers` NÃO tem tenancy (cadastro de referência nacional, mesmo molde de
 * `freight_floor_versions`).
 *
 * As transições de `status` de `vpo_allocations` são UPDATEs GUARDADOS (`where status = ...`) —
 * mesmo padrão de `ciot-repo.ts`: uma segunda chamada para a mesma linha é NO-OP idempotente
 * (devolve `null`, nunca sobrescreve um resultado já gravado).
 *
 * `vpo_events` é APPEND-ONLY — só `insert`, nunca `update`/`delete`.
 */

import type { PoolClient } from 'pg';
import { query } from '../db/pool.js';
import type {
  VpoAllocation,
  VpoAllocationStatus,
  VpoEvent,
  VpoEventType,
  VpoEvidenceSource,
  VpoProvider
} from '../lib/transport/vpo-types.js';

type DbClient = Pick<PoolClient, 'query'> | null;

function getQueryExecutor(client: DbClient = null) {
  return client?.query?.bind(client) || query;
}

function toJsonObject(value: unknown): Record<string, unknown> {
  if (value && typeof value === 'object' && !Array.isArray(value)) {
    return value as Record<string, unknown>;
  }
  return {};
}

function toIso(value: Date | string | null | undefined): string | null {
  if (value == null) return null;
  if (value instanceof Date) return value.toISOString();
  return String(value);
}

// =============================================================================
// vpo_providers
// =============================================================================

type VpoProviderRow = {
  id: string;
  name: string;
  is_active: boolean;
  habilitation_source: string | null;
  habilitation_checked_at: Date | string | null;
  notes: string;
  version: number;
  created_at: Date | string;
  updated_at: Date | string;
};

function mapProviderRow(row: VpoProviderRow | undefined): VpoProvider | null {
  if (!row) return null;
  return {
    id: row.id,
    name: row.name,
    isActive: Boolean(row.is_active),
    habilitationSource: row.habilitation_source,
    habilitationCheckedAt: row.habilitation_checked_at == null ? null : String(row.habilitation_checked_at).slice(0, 10),
    notes: row.notes ?? '',
    version: Number(row.version ?? 1),
    createdAt: toIso(row.created_at) ?? '',
    updatedAt: toIso(row.updated_at) ?? ''
  };
}

export type VpoProviderUpsertInput = {
  id: string;
  name: string;
  habilitationSource: string | null;
  habilitationCheckedAt: string | null;
  notes: string;
};

/**
 * Upsert ADITIVO por `name` — usado pelo loader (`scripts/load-vpo-providers.js`). NUNCA toca
 * `is_active`: desativar uma fornecedora é ato manual do operador (futura rota admin), jamais um
 * efeito colateral de rodar o loader de novo. Idempotente: rodar duas vezes com o mesmo JSON produz
 * o mesmo estado final.
 */
export async function upsertVpoProviderByName(input: VpoProviderUpsertInput): Promise<VpoProvider> {
  const result = await query<VpoProviderRow>(
    `insert into vpo_providers (id, name, habilitation_source, habilitation_checked_at, notes, version)
     values ($1, $2, $3, $4::date, $5, 1)
     on conflict (name) do update set
       habilitation_source = excluded.habilitation_source,
       habilitation_checked_at = excluded.habilitation_checked_at,
       notes = excluded.notes
     returning *`,
    [input.id, input.name, input.habilitationSource, input.habilitationCheckedAt, input.notes]
  );
  const row = mapProviderRow(result.rows[0]);
  if (!row) {
    throw new Error(`[vpo-repo] upsertVpoProviderByName não devolveu linha para "${input.name}"`);
  }
  return row;
}

export async function findVpoProviderByName(name: string): Promise<VpoProvider | null> {
  const result = await query<VpoProviderRow>('select * from vpo_providers where name = $1', [name]);
  return mapProviderRow(result.rows[0]);
}

export async function findVpoProviderById(id: string): Promise<VpoProvider | null> {
  const result = await query<VpoProviderRow>('select * from vpo_providers where id = $1', [id]);
  return mapProviderRow(result.rows[0]);
}

export type ListVpoProvidersFilters = { isActive?: boolean };

/** GET /v1/transporte/vpo/fornecedoras — por default lista TODAS (ativas e inativas, com `isActive` visível). */
export async function listVpoProviders(filters: ListVpoProvidersFilters = {}): Promise<VpoProvider[]> {
  if (filters.isActive === undefined) {
    const result = await query<VpoProviderRow>('select * from vpo_providers order by name asc');
    return result.rows.map(mapProviderRow).filter((row): row is VpoProvider => row !== null);
  }
  const result = await query<VpoProviderRow>('select * from vpo_providers where is_active = $1 order by name asc', [filters.isActive]);
  return result.rows.map(mapProviderRow).filter((row): row is VpoProvider => row !== null);
}

// =============================================================================
// vpo_allocations
// =============================================================================

type VpoAllocationRow = {
  id: string;
  integration_account_id: string;
  operation_id: string;
  status: string;
  applicable: boolean | null;
  applicability_reason_code: string | null;
  provider_id: string | null;
  provider_reference: string | null;
  amount: string | null;
  acquired_at: Date | string | null;
  evidence: unknown;
  evidence_source: string | null;
  route_snapshot: unknown;
  mdfe_reference: string | null;
  job_id: string | null;
  correlation_id: string;
  command_id: string | null;
  last_error_code: string | null;
  last_error_detail: unknown;
  version: number;
  created_at: Date | string;
  updated_at: Date | string;
};

function toNumberOrNull(value: string | number | null | undefined): number | null {
  if (value == null) return null;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function mapAllocationRow(row: VpoAllocationRow | undefined): VpoAllocation | null {
  if (!row) return null;
  return {
    id: row.id,
    integrationAccountId: row.integration_account_id,
    operationId: row.operation_id,
    status: row.status as VpoAllocationStatus,
    applicable: row.applicable,
    applicabilityReasonCode: row.applicability_reason_code,
    providerId: row.provider_id,
    providerReference: row.provider_reference,
    amount: toNumberOrNull(row.amount),
    acquiredAt: toIso(row.acquired_at),
    evidence: toJsonObject(row.evidence),
    evidenceSource: row.evidence_source as VpoEvidenceSource | null,
    routeSnapshot: toJsonObject(row.route_snapshot),
    mdfeReference: row.mdfe_reference,
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

export async function findVpoAllocationByOperationId(
  operationId: string,
  integrationAccountId: string
): Promise<VpoAllocation | null> {
  const result = await query<VpoAllocationRow>(
    'select * from vpo_allocations where operation_id = $1 and integration_account_id = $2',
    [operationId, integrationAccountId]
  );
  return mapAllocationRow(result.rows[0]);
}

/** Sem filtro de tenancy — usado internamente por `upsertVpoApplicability` (a tenancy já foi validada ao carregar o agregado) e pelo WORKER. */
export async function findVpoAllocationByOperationIdInternal(operationId: string): Promise<VpoAllocation | null> {
  const result = await query<VpoAllocationRow>('select * from vpo_allocations where operation_id = $1', [operationId]);
  return mapAllocationRow(result.rows[0]);
}

/** Sem filtro de tenancy — usado pelo WORKER (que já resolve a linha pelo `job.payload.vpoAllocationId`, sem sessão de usuário). */
export async function findVpoAllocationByIdInternal(id: string, client: DbClient = null): Promise<VpoAllocation | null> {
  const execute = getQueryExecutor(client);
  const result = await execute<VpoAllocationRow>('select * from vpo_allocations where id = $1', [id]);
  return mapAllocationRow(result.rows[0]);
}

export type VpoApplicabilityUpsertInput = {
  id: string;
  integrationAccountId: string;
  operationId: string;
  /** Só `pending|applicable|not_applicable` nascem de `avaliarAplicabilidade` — os demais são do ciclo de aquisição. */
  status: 'pending' | 'applicable' | 'not_applicable';
  applicable: boolean | null;
  applicabilityReasonCode: string;
  routeSnapshot: Record<string, unknown>;
  correlationId: string;
};

/**
 * `avaliarAplicabilidade` — cria (primeira avaliação) ou atualiza (reavaliação) a linha ÚNICA da
 * operação. GUARDADO: se a alocação já está `acquisition_requested`/`acquisition_unconfirmed`/
 * `acquired`, a reavaliação NÃO sobrescreve o estado de aquisição (`applied: false` — o chamador
 * ainda pode logar o evento, mas o estado persistido não regride).
 */
export async function upsertVpoApplicability(
  input: VpoApplicabilityUpsertInput
): Promise<{ allocation: VpoAllocation; applied: boolean }> {
  const result = await query<VpoAllocationRow>(
    `insert into vpo_allocations (
       id, integration_account_id, operation_id, status, applicable, applicability_reason_code,
       route_snapshot, correlation_id, version
     ) values ($1, $2, $3, $4, $5, $6, $7::jsonb, $8, 1)
     on conflict (operation_id) do update set
       status = excluded.status,
       applicable = excluded.applicable,
       applicability_reason_code = excluded.applicability_reason_code,
       route_snapshot = excluded.route_snapshot,
       correlation_id = excluded.correlation_id
     where vpo_allocations.status not in ('acquisition_requested', 'acquisition_unconfirmed', 'acquired')
     returning *`,
    [
      input.id,
      input.integrationAccountId,
      input.operationId,
      input.status,
      input.applicable,
      input.applicabilityReasonCode,
      JSON.stringify(input.routeSnapshot ?? {}),
      input.correlationId
    ]
  );

  const row = mapAllocationRow(result.rows[0]);
  if (row) return { allocation: row, applied: true };

  const current = await findVpoAllocationByOperationIdInternal(input.operationId);
  if (!current) {
    throw new Error(`[vpo-repo] upsertVpoApplicability não encontrou nem gravou linha para a operação ${input.operationId}`);
  }
  return { allocation: current, applied: false };
}

/**
 * `applicable` → `acquired` (aquisição MANUAL, evidência declarada pelo operador). Aceita `client`
 * opcional — `transport-vpo-service.ts#registrarAquisicaoVpoManual` roda esta escrita e o CAS de
 * `transport_operations.vpo_amount` NUMA transação (`withTransaction`), para nunca deixar a
 * alocação `acquired` sem o valor refletido na operação (ou vice-versa).
 */
export async function markVpoAllocationAcquiredManual(
  id: string,
  patch: { providerId: string; providerReference: string | null; amount: number; evidence: Record<string, unknown> },
  client: DbClient = null
): Promise<VpoAllocation | null> {
  const execute = getQueryExecutor(client);
  const result = await execute<VpoAllocationRow>(
    `update vpo_allocations set
       status = 'acquired',
       provider_id = $2,
       provider_reference = $3,
       amount = $4,
       evidence = $5::jsonb,
       evidence_source = 'manual',
       acquired_at = now()
     where id = $1
       and status = 'applicable'
     returning *`,
    [id, patch.providerId, patch.providerReference, patch.amount, JSON.stringify(patch.evidence ?? {})]
  );
  return mapAllocationRow(result.rows[0]);
}

/** `applicable` → `acquisition_requested` — marca o dispatch (DL-102: gravado ANTES da chamada ao provedor). */
export async function markVpoAllocationAcquisitionRequested(
  id: string,
  patch: { jobId: string; providerId: string }
): Promise<VpoAllocation | null> {
  const result = await query<VpoAllocationRow>(
    `update vpo_allocations set
       status = 'acquisition_requested',
       provider_id = $2,
       job_id = $3
     where id = $1
       and status = 'applicable'
     returning *`,
    [id, patch.providerId, patch.jobId]
  );
  return mapAllocationRow(result.rows[0]);
}

export type VpoProviderResultPatch = {
  providerReference: string;
  amount: number;
  evidenceSource: VpoEvidenceSource;
  raw: Record<string, unknown>;
};

/** `acquisition_requested` → `acquired` (confirmado pelo provedor no dispatch direto). */
export async function completeVpoAcquisitionSucceeded(id: string, patch: VpoProviderResultPatch): Promise<VpoAllocation | null> {
  const result = await query<VpoAllocationRow>(
    `update vpo_allocations set
       status = 'acquired',
       provider_reference = $2,
       amount = $3,
       evidence = $4::jsonb,
       evidence_source = $5,
       acquired_at = now()
     where id = $1
       and status = 'acquisition_requested'
     returning *`,
    [id, patch.providerReference, patch.amount, JSON.stringify(patch.raw ?? {}), patch.evidenceSource]
  );
  return mapAllocationRow(result.rows[0]);
}

/**
 * `acquisition_requested` → `acquisition_unconfirmed` — DL-102: resposta perdida DEPOIS do
 * dispatch NUNCA vira falha definitiva; só o reconciliador tem autoridade para provar ausência.
 */
export async function markVpoAllocationAcquisitionUnconfirmed(
  id: string,
  patch: { lastErrorCode?: string | null; lastErrorDetail?: Record<string, unknown> | null }
): Promise<VpoAllocation | null> {
  const result = await query<VpoAllocationRow>(
    `update vpo_allocations set
       status = 'acquisition_unconfirmed',
       last_error_code = $2,
       last_error_detail = $3::jsonb
     where id = $1
       and status = 'acquisition_requested'
     returning *`,
    [id, patch.lastErrorCode ?? null, patch.lastErrorDetail ? JSON.stringify(patch.lastErrorDetail) : null]
  );
  return mapAllocationRow(result.rows[0]);
}

/**
 * `acquisition_requested` → `applicable` — rejeição DEFINITIVA do provedor (ex.: rota sem
 * distância válida para calcular o pedágio). Diferente de `markVpoAllocationAcquisitionUnconfirmed`:
 * aqui SABEMOS que a aquisição não aconteceu (decisão do provedor, não silêncio), então volta direto
 * para `applicable` — um novo `adquirir`/`registrar-aquisicao` fica liberado sem depender de
 * reconciliação.
 */
export async function markVpoAllocationAcquisitionFailedRevertToApplicable(
  id: string,
  patch: { lastErrorCode?: string | null; lastErrorDetail?: Record<string, unknown> | null }
): Promise<VpoAllocation | null> {
  const result = await query<VpoAllocationRow>(
    `update vpo_allocations set
       status = 'applicable',
       job_id = null,
       last_error_code = $2,
       last_error_detail = $3::jsonb
     where id = $1
       and status = 'acquisition_requested'
     returning *`,
    [id, patch.lastErrorCode ?? null, patch.lastErrorDetail ? JSON.stringify(patch.lastErrorDetail) : null]
  );
  return mapAllocationRow(result.rows[0]);
}

/** Reconciliação com desfecho `found`: sincroniza o estado local com o que o provedor confirma. */
export async function completeVpoReconcileFound(id: string, patch: VpoProviderResultPatch): Promise<VpoAllocation | null> {
  const result = await query<VpoAllocationRow>(
    `update vpo_allocations set
       status = 'acquired',
       provider_reference = coalesce(provider_reference, $2),
       amount = coalesce(amount, $3),
       evidence = $4::jsonb,
       evidence_source = $5,
       last_error_code = null,
       last_error_detail = null,
       acquired_at = coalesce(acquired_at, now())
     where id = $1
       and status = 'acquisition_unconfirmed'
     returning *`,
    [id, patch.providerReference, patch.amount, JSON.stringify(patch.raw ?? {}), patch.evidenceSource]
  );
  return mapAllocationRow(result.rows[0]);
}

/**
 * Reconciliação com desfecho `not-found-after-polling` — o dispatch comprovadamente NUNCA chegou
 * ao provedor. Volta para `applicable` (NUNCA um status terminal de falha): um novo `adquirir`
 * (ou `registrar-aquisicao` manual) fica liberado — o histórico completo da tentativa perdida
 * permanece em `vpo_events`.
 */
export async function markVpoReconcileNotFoundRevertToApplicable(id: string): Promise<VpoAllocation | null> {
  const result = await query<VpoAllocationRow>(
    `update vpo_allocations set
       status = 'applicable',
       job_id = null,
       last_error_code = null,
       last_error_detail = null
     where id = $1
       and status = 'acquisition_unconfirmed'
       and provider_reference is null
     returning *`,
    [id]
  );
  return mapAllocationRow(result.rows[0]);
}

// =============================================================================
// vpo_events — APPEND-ONLY
// =============================================================================

type VpoEventRow = {
  id: string;
  vpo_allocation_id: string;
  event_type: string;
  detail: unknown;
  correlation_id: string;
  created_at: Date | string;
};

function mapEventRow(row: VpoEventRow | undefined): VpoEvent | null {
  if (!row) return null;
  return {
    id: row.id,
    vpoAllocationId: row.vpo_allocation_id,
    eventType: row.event_type as VpoEventType,
    detail: toJsonObject(row.detail),
    correlationId: row.correlation_id,
    createdAt: toIso(row.created_at) ?? ''
  };
}

export type VpoEventInsertInput = {
  id: string;
  vpoAllocationId: string;
  eventType: VpoEventType;
  detail?: Record<string, unknown>;
  correlationId: string;
};

export async function insertVpoEvent(input: VpoEventInsertInput, client: DbClient = null): Promise<VpoEvent> {
  const execute = getQueryExecutor(client);
  const result = await execute<VpoEventRow>(
    `insert into vpo_events (id, vpo_allocation_id, event_type, detail, correlation_id)
     values ($1, $2, $3, $4::jsonb, $5)
     returning *`,
    [input.id, input.vpoAllocationId, input.eventType, JSON.stringify(input.detail ?? {}), input.correlationId]
  );
  const row = mapEventRow(result.rows[0]);
  if (!row) {
    throw new Error(`[vpo-repo] insertVpoEvent não devolveu linha para ${input.vpoAllocationId}`);
  }
  return row;
}

export type ListVpoEventsFilters = { page?: number; pageSize?: number };

const DEFAULT_PAGE_SIZE = 20;
const MAX_PAGE_SIZE = 200;

export async function listVpoEventsForAllocation(
  vpoAllocationId: string,
  filters: ListVpoEventsFilters = {}
): Promise<{ items: VpoEvent[]; total: number; page: number; pageSize: number }> {
  const page = Math.max(Math.floor(filters.page ?? 1), 1);
  const pageSize = Math.min(Math.max(Math.floor(filters.pageSize ?? DEFAULT_PAGE_SIZE), 1), MAX_PAGE_SIZE);
  const offset = (page - 1) * pageSize;

  const totalResult = await query<{ count: string }>(
    'select count(*)::text as count from vpo_events where vpo_allocation_id = $1',
    [vpoAllocationId]
  );
  const total = Number(totalResult.rows[0]?.count ?? 0);

  const rowsResult = await query<VpoEventRow>(
    `select * from vpo_events
      where vpo_allocation_id = $1
      order by created_at asc
      limit $2 offset $3`,
    [vpoAllocationId, pageSize, offset]
  );

  const items = rowsResult.rows.map(mapEventRow).filter((row): row is VpoEvent => row !== null);
  return { items, total, page, pageSize };
}

// =============================================================================
// Varredura de reconciliação (worker) — molde `listUnconfirmedCiotOperationsForReconciliation`.
// =============================================================================

export type UnconfirmedVpoAllocationForReconciliation = {
  id: string;
  operationId: string;
  integrationAccountId: string;
  correlationId: string;
};

/**
 * Candidatas a reconciliação: `acquisition_unconfirmed` atualizadas dentro da janela informada.
 * Janela OBRIGATÓRIA — sem ela a consulta degenera em full scan (mesmo racional de `ciot-repo.ts`).
 */
export async function listUnconfirmedVpoAllocationsForReconciliation(opts: {
  updatedSince: string;
  limit?: number;
}): Promise<UnconfirmedVpoAllocationForReconciliation[]> {
  const limit = Math.min(Math.max(Math.floor(opts.limit ?? 100), 1), 500);
  const result = await query<{
    id: string;
    operation_id: string;
    integration_account_id: string;
    correlation_id: string;
  }>(
    `select id, operation_id, integration_account_id, correlation_id
       from vpo_allocations
      where status = 'acquisition_unconfirmed'
        and updated_at >= $1::timestamptz
      order by updated_at asc
      limit $2`,
    [opts.updatedSince, limit]
  );

  return result.rows.map((row) => ({
    id: row.id,
    operationId: row.operation_id,
    integrationAccountId: row.integration_account_id,
    correlationId: row.correlation_id
  }));
}

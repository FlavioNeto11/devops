/**
 * DMR repository — fase 05-persistence-queue (cadeia `dmr-fluxo-base`).
 *
 * Implementação SQL real contra `dmr_declarations` e
 * `dmr_declaration_items` (migration 013_dmr_declarations.sql), preservando
 * a interface tipada definida pela fase 04-backend-contracts.
 *
 * Padrões DL-022 honrados:
 * - Locking otimista via coluna `version` (todos os updates checam
 *   `where version = $expectedVersion` e levantam `AppError(409)` em conflito).
 * - Soft-delete em DMR (status='cancelled'), nunca DELETE físico.
 * - Trigger `increment_version` em `dmr_declarations` cuida do bump de version
 *   automaticamente; o repo apenas lê o `version` retornado pelo `returning *`.
 */

import { query } from '../db/pool.js';
import { AppError } from '../lib/problem.js';
import { createPrefixedId } from '../lib/ids.js';

export type DmrRole = 'gerador' | 'transportador' | 'destinador' | 'armazenador_temporario';

export type DmrStatus =
  | 'draft'
  | 'consolidating'
  | 'pending_review'
  | 'enqueued'
  | 'submitting'
  | 'awaiting_remote'
  | 'submitted'
  | 'failed_validation'
  | 'failed_remote'
  | 'cancelled';

export type DmrSummaryTotals = {
  totalManifestos: number;
  manifestosPorStatus: Record<string, number>;
  totalMassaPorClasse: Record<string, string>;
  totalMassaPorResiduo: Array<{ code: string; value: number; unit: string }>;
  parceirosDistintos: { transportadores: number; destinadores: number };
};

export type DmrRecord = {
  id: string;
  integrationAccountId: string;
  cnpj: string;
  unitCode: string;
  role: DmrRole;
  periodStart: string;
  periodEnd: string;
  periodLabel: string;
  status: DmrStatus;
  correlationId: string;
  commandId: string | null;
  sessionContextId: string | null;
  submittedAt: string | null;
  protocolNumber: string | null;
  remoteReference: string | null;
  summaryTotals: DmrSummaryTotals;
  payloadSnapshot: Record<string, unknown>;
  lastErrorCode: string | null;
  lastErrorDetail: Record<string, unknown> | null;
  attempts: number;
  version: number;
  createdAt: string;
  updatedAt: string;
};

export type DmrItemRecord = {
  id: string;
  declarationId: string;
  manifestId: string | null;
  mtrNumber: string;
  cdfNumber: string | null;
  residueClass: string;
  residueCode: string | null;
  quantityValue: number;
  quantityUnit: 'kg' | 't' | 'm3' | 'L';
  partnerRole: 'transportador' | 'destinador' | 'armazenador';
  partnerCnpj: string;
  metadata: Record<string, unknown> | null;
  createdAt: string;
};

export type DmrListFilters = {
  status?: DmrStatus | string;
  role?: DmrRole | string;
  periodStart?: string;
  periodEnd?: string;
  integrationAccountId?: string;
  limit?: number;
  offset?: number;
};

export type DmrInsertInput = {
  id: string;
  integrationAccountId: string;
  cnpj: string;
  unitCode: string;
  role: DmrRole;
  periodStart: string;
  periodEnd: string;
  periodLabel: string;
  correlationId: string;
};

export type DmrItemInsertInput = Omit<DmrItemRecord, 'id' | 'createdAt'> & {
  id?: string;
};

type DmrRow = {
  id: string;
  integration_account_id: string;
  cnpj: string;
  unit_code: string;
  role: string;
  period_start: Date | string;
  period_end: Date | string;
  period_label: string;
  status: string;
  correlation_id: string;
  command_id: string | null;
  session_context_id: string | null;
  submitted_at: Date | string | null;
  protocol_number: string | null;
  remote_reference: string | null;
  summary_totals: unknown;
  payload_snapshot: unknown;
  last_error_code: string | null;
  last_error_detail: unknown;
  attempts: number;
  version: number;
  created_at: Date | string;
  updated_at: Date | string;
};

type DmrItemRow = {
  id: string;
  declaration_id: string;
  manifest_id: string | null;
  mtr_number: string;
  cdf_number: string | null;
  residue_class: string;
  residue_code: string | null;
  quantity_value: string | number;
  quantity_unit: string;
  partner_role: string;
  partner_cnpj: string;
  metadata: unknown;
  created_at: Date | string;
};

const DEFAULT_SUMMARY_TOTALS: DmrSummaryTotals = {
  totalManifestos: 0,
  manifestosPorStatus: {},
  totalMassaPorClasse: {},
  totalMassaPorResiduo: [],
  parceirosDistintos: { transportadores: 0, destinadores: 0 }
};

function toIso(value: Date | string | null | undefined): string | null {
  if (value == null) return null;
  if (value instanceof Date) return value.toISOString();
  return String(value);
}

function toIsoDateOnly(value: Date | string | null | undefined): string {
  if (value == null) return '';
  if (value instanceof Date) {
    return value.toISOString().slice(0, 10);
  }
  return String(value).slice(0, 10);
}

function toJsonObject(value: unknown): Record<string, unknown> {
  if (value && typeof value === 'object' && !Array.isArray(value)) {
    return value as Record<string, unknown>;
  }
  return {};
}

function toSummaryTotals(value: unknown): DmrSummaryTotals {
  const base = toJsonObject(value);
  return {
    ...DEFAULT_SUMMARY_TOTALS,
    ...(base as Partial<DmrSummaryTotals>)
  };
}

function mapRow(row: DmrRow | undefined): DmrRecord | null {
  if (!row) return null;
  return {
    id: row.id,
    integrationAccountId: row.integration_account_id,
    cnpj: row.cnpj,
    unitCode: row.unit_code,
    role: row.role as DmrRole,
    periodStart: toIsoDateOnly(row.period_start),
    periodEnd: toIsoDateOnly(row.period_end),
    periodLabel: row.period_label,
    status: row.status as DmrStatus,
    correlationId: row.correlation_id,
    commandId: row.command_id,
    sessionContextId: row.session_context_id,
    submittedAt: toIso(row.submitted_at),
    protocolNumber: row.protocol_number,
    remoteReference: row.remote_reference,
    summaryTotals: toSummaryTotals(row.summary_totals),
    payloadSnapshot: toJsonObject(row.payload_snapshot),
    lastErrorCode: row.last_error_code,
    lastErrorDetail: row.last_error_detail
      ? toJsonObject(row.last_error_detail)
      : null,
    attempts: Number(row.attempts ?? 0),
    version: Number(row.version ?? 1),
    createdAt: toIso(row.created_at) ?? '',
    updatedAt: toIso(row.updated_at) ?? ''
  };
}

function mapItemRow(row: DmrItemRow | undefined): DmrItemRecord | null {
  if (!row) return null;
  return {
    id: row.id,
    declarationId: row.declaration_id,
    manifestId: row.manifest_id,
    mtrNumber: row.mtr_number,
    cdfNumber: row.cdf_number,
    residueClass: row.residue_class,
    residueCode: row.residue_code,
    quantityValue: Number(row.quantity_value),
    quantityUnit: row.quantity_unit as DmrItemRecord['quantityUnit'],
    partnerRole: row.partner_role as DmrItemRecord['partnerRole'],
    partnerCnpj: row.partner_cnpj,
    metadata: row.metadata ? toJsonObject(row.metadata) : null,
    createdAt: toIso(row.created_at) ?? ''
  };
}

export async function listDmr(filters: DmrListFilters): Promise<{ items: DmrRecord[]; total: number }> {
  const where: string[] = [];
  const values: unknown[] = [];

  if (filters.status) {
    values.push(filters.status);
    where.push(`status = $${values.length}`);
  }
  if (filters.role) {
    values.push(filters.role);
    where.push(`role = $${values.length}`);
  }
  if (filters.periodStart) {
    values.push(filters.periodStart);
    where.push(`period_end >= $${values.length}`);
  }
  if (filters.periodEnd) {
    values.push(filters.periodEnd);
    where.push(`period_start <= $${values.length}`);
  }
  if (filters.integrationAccountId) {
    values.push(filters.integrationAccountId);
    where.push(`integration_account_id = $${values.length}`);
  }

  const whereSql = where.length ? `where ${where.join(' and ')}` : '';
  const limit = Math.min(Math.max(filters.limit ?? 50, 1), 200);
  const offset = Math.max(filters.offset ?? 0, 0);

  const totalResult = await query<{ count: string }>(
    `select count(*)::text as count from dmr_declarations ${whereSql}`,
    values
  );
  const total = Number(totalResult.rows[0]?.count ?? 0);

  values.push(limit);
  const limitParam = `$${values.length}`;
  values.push(offset);
  const offsetParam = `$${values.length}`;

  const rowsResult = await query<DmrRow>(
    `select * from dmr_declarations ${whereSql}
     order by created_at desc
     limit ${limitParam} offset ${offsetParam}`,
    values
  );

  const items = rowsResult.rows.map(mapRow).filter((row): row is DmrRecord => row !== null);
  return { items, total };
}

export async function listPendingDmr(integrationAccountId?: string | null): Promise<DmrRecord[]> {
  const values: unknown[] = [];
  let accountFilter = '';
  if (integrationAccountId) {
    values.push(integrationAccountId);
    accountFilter = `and integration_account_id = $${values.length}`;
  }

  const result = await query<DmrRow>(
    `select * from dmr_declarations
      where status in ('draft', 'pending_review', 'failed_validation')
      ${accountFilter}
      order by created_at desc`,
    values
  );

  return result.rows.map(mapRow).filter((row): row is DmrRecord => row !== null);
}

export async function findDmrById(dmrId: string): Promise<DmrRecord | null> {
  const result = await query<DmrRow>(
    'select * from dmr_declarations where id = $1',
    [dmrId]
  );
  return mapRow(result.rows[0]);
}

/**
 * Localiza a primeira DMR não-cancelada que conflita com um período
 * solicitado para o mesmo (integration_account_id, role).
 *
 * Conflito = sobreposição de intervalos `[period_start, period_end]`
 * (regra `a.period_start <= b.period_end and a.period_end >= b.period_start`).
 *
 * Usado pela fase 06-domain-rules em `dmr-validator.validateNewDmr`.
 */
export async function findOverlappingDmr(args: {
  integrationAccountId: string;
  role: DmrRole;
  periodStart: string;
  periodEnd: string;
  excludeId?: string | null;
}): Promise<DmrRecord | null> {
  const values: unknown[] = [
    args.integrationAccountId,
    args.role,
    args.periodEnd,
    args.periodStart
  ];
  let excludeFilter = '';
  if (args.excludeId) {
    values.push(args.excludeId);
    excludeFilter = `and id <> $${values.length}`;
  }
  const result = await query<DmrRow>(
    `select * from dmr_declarations
      where integration_account_id = $1
        and role = $2
        and status <> 'cancelled'
        and period_start <= $3
        and period_end >= $4
        ${excludeFilter}
      order by created_at desc
      limit 1`,
    values
  );
  return mapRow(result.rows[0]);
}

export async function insertDmr(input: DmrInsertInput): Promise<DmrRecord> {
  const result = await query<DmrRow>(
    `insert into dmr_declarations (
       id,
       integration_account_id,
       cnpj,
       unit_code,
       role,
       period_start,
       period_end,
       period_label,
       status,
       correlation_id,
       summary_totals,
       payload_snapshot,
       attempts,
       version
     ) values (
       $1, $2, $3, $4, $5, $6, $7, $8, 'draft', $9,
       $10::jsonb, '{}'::jsonb, 0, 1
     )
     returning *`,
    [
      input.id,
      input.integrationAccountId,
      input.cnpj,
      input.unitCode,
      input.role,
      input.periodStart,
      input.periodEnd,
      input.periodLabel,
      input.correlationId,
      JSON.stringify(DEFAULT_SUMMARY_TOTALS)
    ]
  );

  const row = mapRow(result.rows[0]);
  if (!row) {
    throw new AppError(500, 'Internal Server Error', `Falha ao inserir DMR ${input.id}.`, {
      code: 'DMR_INSERT_FAILED'
    });
  }
  return row;
}

type DmrUpdatePatch = Partial<Pick<
  DmrRecord,
  'status'
  | 'commandId'
  | 'sessionContextId'
  | 'submittedAt'
  | 'protocolNumber'
  | 'remoteReference'
  | 'lastErrorCode'
  | 'lastErrorDetail'
  | 'summaryTotals'
  | 'attempts'
>>;

export async function updateDmrStatus(
  dmrId: string,
  patch: DmrUpdatePatch,
  expectedVersion: number
): Promise<DmrRecord> {
  const sets: string[] = [];
  const values: unknown[] = [dmrId, expectedVersion];

  function pushSet(column: string, value: unknown, jsonb = false) {
    values.push(value);
    sets.push(`${column} = $${values.length}${jsonb ? '::jsonb' : ''}`);
  }

  if (patch.status !== undefined) pushSet('status', patch.status);
  if (patch.commandId !== undefined) pushSet('command_id', patch.commandId);
  if (patch.sessionContextId !== undefined) pushSet('session_context_id', patch.sessionContextId);
  if (patch.submittedAt !== undefined) pushSet('submitted_at', patch.submittedAt);
  if (patch.protocolNumber !== undefined) pushSet('protocol_number', patch.protocolNumber);
  if (patch.remoteReference !== undefined) pushSet('remote_reference', patch.remoteReference);
  if (patch.lastErrorCode !== undefined) pushSet('last_error_code', patch.lastErrorCode);
  if (patch.lastErrorDetail !== undefined) {
    pushSet(
      'last_error_detail',
      patch.lastErrorDetail === null ? null : JSON.stringify(patch.lastErrorDetail),
      true
    );
  }
  if (patch.summaryTotals !== undefined) {
    pushSet('summary_totals', JSON.stringify(patch.summaryTotals), true);
  }
  if (patch.attempts !== undefined) pushSet('attempts', patch.attempts);

  if (sets.length === 0) {
    const current = await query<DmrRow>(
      'select * from dmr_declarations where id = $1 and version = $2',
      [dmrId, expectedVersion]
    );
    const row = mapRow(current.rows[0]);
    if (!row) {
      await throwConflictOrNotFound(dmrId, expectedVersion);
    }
    return row!;
  }

  // Trigger `trg_dmr_declarations_version` cuida do bump de version e updated_at.
  const result = await query<DmrRow>(
    `update dmr_declarations
        set ${sets.join(', ')}
      where id = $1
        and version = $2
      returning *`,
    values
  );

  const row = mapRow(result.rows[0]);
  if (!row) {
    await throwConflictOrNotFound(dmrId, expectedVersion);
  }
  return row!;
}

async function throwConflictOrNotFound(dmrId: string, expectedVersion: number): Promise<never> {
  const exists = await query<{ version: number }>(
    'select version from dmr_declarations where id = $1',
    [dmrId]
  );
  if ((exists.rowCount ?? 0) === 0) {
    throw new AppError(404, 'Not Found', `DMR ${dmrId} não encontrada.`, {
      code: 'DMR_NOT_FOUND'
    });
  }
  throw new AppError(
    409,
    'Conflict',
    `DMR ${dmrId} foi modificada por outro processo (esperado version=${expectedVersion}, atual=${exists.rows[0]?.version}).`,
    { code: 'DMR_VERSION_CONFLICT' }
  );
}

export async function deleteDmrDraft(dmrId: string, expectedVersion: number): Promise<DmrRecord> {
  // Soft-delete: status='cancelled'. Trigger atualiza version + updated_at.
  return updateDmrStatus(dmrId, { status: 'cancelled' as DmrStatus }, expectedVersion);
}

export async function listDmrItems(dmrId: string): Promise<DmrItemRecord[]> {
  const result = await query<DmrItemRow>(
    `select * from dmr_declaration_items
      where declaration_id = $1
      order by created_at asc, id asc`,
    [dmrId]
  );
  return result.rows.map(mapItemRow).filter((row): row is DmrItemRecord => row !== null);
}

export async function insertDmrItem(dmrId: string, item: DmrItemInsertInput): Promise<DmrItemRecord> {
  const id = item.id || createPrefixedId('dmrit');
  const result = await query<DmrItemRow>(
    `insert into dmr_declaration_items (
       id,
       declaration_id,
       manifest_id,
       mtr_number,
       cdf_number,
       residue_class,
       residue_code,
       quantity_value,
       quantity_unit,
       partner_role,
       partner_cnpj,
       metadata
     ) values (
       $1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12::jsonb
     )
     returning *`,
    [
      id,
      dmrId,
      item.manifestId,
      item.mtrNumber,
      item.cdfNumber,
      item.residueClass,
      item.residueCode,
      item.quantityValue,
      item.quantityUnit,
      item.partnerRole,
      item.partnerCnpj,
      item.metadata ? JSON.stringify(item.metadata) : null
    ]
  );

  const row = mapItemRow(result.rows[0]);
  if (!row) {
    throw new AppError(500, 'Internal Server Error', `Falha ao inserir item da DMR ${dmrId}.`, {
      code: 'DMR_ITEM_INSERT_FAILED'
    });
  }

  // Bump explícito da declaração para refletir mutação na coleção de itens.
  await query(
    `update dmr_declarations
        set updated_at = now()
      where id = $1`,
    [dmrId]
  );

  return row;
}

export async function deleteDmrItem(dmrId: string, itemId: string): Promise<void> {
  const result = await query(
    `delete from dmr_declaration_items
      where declaration_id = $1 and id = $2`,
    [dmrId, itemId]
  );
  if ((result.rowCount ?? 0) === 0) {
    throw new AppError(404, 'Not Found', `Item ${itemId} não encontrado na DMR ${dmrId}.`, {
      code: 'DMR_ITEM_NOT_FOUND'
    });
  }

  await query(
    `update dmr_declarations
        set updated_at = now()
      where id = $1`,
    [dmrId]
  );
}

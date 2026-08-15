/**
 * Repositório do piso mínimo de frete (PR-B1, DL-103) — `freight_floor_versions`/
 * `freight_floor_coefficients` (migration 022, estrutura do PR-A1) e `freight_floor_calculations`
 * (migration 026, este PR).
 *
 * Dois escritores muito diferentes desta tabela de catálogo:
 *   - `scripts/load-freight-floor-tables.js` (OPERADOR, manual) — `upsertFloorVersion` +
 *     `replaceCoefficientsForVersion`, sempre numa transação do CHAMADOR (`withTransaction`), para
 *     que versão+coeficientes nasçam/mudem juntos. NUNCA promove `review_status` a `reviewed` — é
 *     ato humano futuro (rota admin ainda não existe nesta fase).
 *   - `freight-floor-service.ts` (motor, a cada cálculo) — só LÊ versão/coeficientes vigentes e
 *     ESCREVE em `freight_floor_calculations`, que é **APPEND-ONLY** (mesmo racional de
 *     `transport-compliance-repo.ts`): nenhuma função aqui faz `update`/`delete` contra ela.
 *
 * A resolução de vigência REUTILIZA `resolveVersionFromList` (`regulatory-temporal.ts`) — mesmo
 * predicado `effective_from <= d <= effective_until`, um único sítio para a lógica temporal da
 * vertical inteira (catálogo regulatório E piso).
 */

import type { PoolClient } from 'pg';
import { query, withTransaction } from '../db/pool.js';
import { resolveVersionFromList } from '../lib/transport/regulatory-temporal.js';

type DbClient = Pick<PoolClient, 'query'> | null;

function getQueryExecutor(client: DbClient = null) {
  return client?.query?.bind(client) || query;
}

// =============================================================================
// Tipos
// =============================================================================

export type FreightFloorReviewStatus = 'pending_review' | 'reviewed' | 'rejected';

export interface FreightFloorVersionRecord {
  id: string;
  normativeReference: string;
  resolution: string | null;
  tableCode: string;
  publishedAt: string | null;
  effectiveFrom: string;
  effectiveUntil: string | null;
  methodologyNotes: string;
  sourceUrl: string | null;
  sourceHash: string | null;
  reviewStatus: FreightFloorReviewStatus;
  reviewedBy: string | null;
  reviewedAt: string | null;
  version: number;
  createdAt: string;
  updatedAt: string;
}

export interface FreightFloorCoefficientRecord {
  id: string;
  floorVersionId: string;
  cargoType: string;
  axlesCount: number;
  coefficientType: 'displacement_cost' | 'load_unload_cost';
  value: number;
  createdAt: string;
}

type VersionRow = {
  id: string;
  normative_reference: string;
  resolution: string | null;
  table_code: string;
  published_at: Date | string | null;
  effective_from: Date | string;
  effective_until: Date | string | null;
  methodology_notes: string;
  source_url: string | null;
  source_hash: string | null;
  review_status: string;
  reviewed_by: string | null;
  reviewed_at: Date | string | null;
  version: number;
  created_at: Date | string;
  updated_at: Date | string;
};

type CoefficientRow = {
  id: string;
  floor_version_id: string;
  cargo_type: string;
  axles_count: number;
  coefficient_type: string;
  value: string;
  created_at: Date | string;
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

function mapVersionRow(row: VersionRow | undefined): FreightFloorVersionRecord | null {
  if (!row) return null;
  return {
    id: row.id,
    normativeReference: row.normative_reference,
    resolution: row.resolution,
    tableCode: row.table_code,
    publishedAt: toIsoDateOnly(row.published_at),
    effectiveFrom: toIsoDateOnly(row.effective_from) ?? '',
    effectiveUntil: toIsoDateOnly(row.effective_until),
    methodologyNotes: row.methodology_notes,
    sourceUrl: row.source_url,
    sourceHash: row.source_hash,
    reviewStatus: row.review_status as FreightFloorReviewStatus,
    reviewedBy: row.reviewed_by,
    reviewedAt: toIso(row.reviewed_at),
    version: Number(row.version ?? 1),
    createdAt: toIso(row.created_at) ?? '',
    updatedAt: toIso(row.updated_at) ?? ''
  };
}

function mapCoefficientRow(row: CoefficientRow | undefined): FreightFloorCoefficientRecord | null {
  if (!row) return null;
  return {
    id: row.id,
    floorVersionId: row.floor_version_id,
    cargoType: row.cargo_type,
    axlesCount: Number(row.axles_count),
    coefficientType: row.coefficient_type as FreightFloorCoefficientRecord['coefficientType'],
    value: Number(row.value),
    createdAt: toIso(row.created_at) ?? ''
  };
}

// =============================================================================
// freight_floor_versions / freight_floor_coefficients — escrita (loader manual do operador)
// =============================================================================

export type FreightFloorVersionUpsertInput = {
  id: string;
  normativeReference: string;
  resolution: string | null;
  tableCode: string;
  publishedAt: string | null;
  effectiveFrom: string;
  effectiveUntil: string | null;
  methodologyNotes: string;
  sourceUrl: string | null;
  sourceHash: string;
};

/** Chave natural `(normative_reference, table_code)` — usado pelo loader para o abort-if-reviewed. */
export async function getFloorVersionByNaturalKey(
  normativeReference: string,
  tableCode: string,
  client: DbClient = null
): Promise<FreightFloorVersionRecord | null> {
  const execute = getQueryExecutor(client);
  const result = await execute<VersionRow>(
    `select * from freight_floor_versions where normative_reference = $1 and table_code = $2`,
    [normativeReference, tableCode]
  );
  return mapVersionRow(result.rows[0]);
}

/**
 * Upsert por `(normative_reference, table_code)` — `review_status` SEMPRE grava o literal
 * `'pending_review'` (promoção a `reviewed` é ato humano futuro, fora deste caminho). O CHAMADOR
 * (`scripts/load-freight-floor-tables.js`) é quem decide NÃO chamar esta função quando a versão já
 * existe como `reviewed` (abort-if-reviewed) — este repositório não repete essa checagem para não
 * ter duas fontes de verdade sobre a decisão.
 */
export async function upsertFloorVersion(
  input: FreightFloorVersionUpsertInput,
  client: DbClient = null
): Promise<FreightFloorVersionRecord> {
  const execute = getQueryExecutor(client);
  const result = await execute<VersionRow>(
    `insert into freight_floor_versions (
       id, normative_reference, resolution, table_code, published_at, effective_from,
       methodology_notes, source_url, source_hash, review_status
     ) values ($1, $2, $3, $4, $5::date, $6::date, $7, $8, $9, 'pending_review')
     on conflict (normative_reference, table_code) do update
       set resolution = excluded.resolution,
           published_at = excluded.published_at,
           effective_from = excluded.effective_from,
           methodology_notes = excluded.methodology_notes,
           source_url = excluded.source_url,
           source_hash = excluded.source_hash,
           review_status = 'pending_review'
     returning *`,
    [
      input.id,
      input.normativeReference,
      input.resolution,
      input.tableCode,
      input.publishedAt,
      input.effectiveFrom,
      input.methodologyNotes,
      input.sourceUrl,
      input.sourceHash
    ]
  );
  const row = mapVersionRow(result.rows[0]);
  if (!row) throw new Error(`[freight-floor-repo] upsertFloorVersion não devolveu linha para ${input.normativeReference}/${input.tableCode}`);
  return row;
}

export type FreightFloorCoefficientInput = {
  id: string;
  cargoType: string;
  axlesCount: number;
  coefficientType: 'displacement_cost' | 'load_unload_cost';
  value: number;
};

/**
 * Substitui TODOS os coeficientes da versão (delete + insert na MESMA transação do chamador) —
 * aceitável aqui porque é tabela de CATÁLOGO carregada por operador (não histórico de decisão):
 * `freight_floor_calculations` referencia `floor_version_id`, que permanece estável através da
 * substituição; só o conteúdo dos coeficientes muda.
 */
export async function replaceCoefficientsForVersion(
  floorVersionId: string,
  coefficients: FreightFloorCoefficientInput[],
  client: PoolClient
): Promise<number> {
  await client.query('delete from freight_floor_coefficients where floor_version_id = $1', [floorVersionId]);

  for (const coefficient of coefficients) {
    await client.query(
      `insert into freight_floor_coefficients (id, floor_version_id, cargo_type, axles_count, coefficient_type, value)
       values ($1, $2, $3, $4, $5, $6)`,
      [coefficient.id, floorVersionId, coefficient.cargoType, coefficient.axlesCount, coefficient.coefficientType, coefficient.value]
    );
  }

  return coefficients.length;
}

/** Roda `upsertFloorVersion` + `replaceCoefficientsForVersion` numa transação própria — usado pelo loader. */
export async function loadFreightFloorTableInTransaction(
  version: FreightFloorVersionUpsertInput,
  coefficients: FreightFloorCoefficientInput[]
): Promise<{ version: FreightFloorVersionRecord; coefficientsWritten: number }> {
  return withTransaction(async (client) => {
    const savedVersion = await upsertFloorVersion(version, client);
    const coefficientsWritten = await replaceCoefficientsForVersion(savedVersion.id, coefficients, client);
    return { version: savedVersion, coefficientsWritten };
  });
}

// =============================================================================
// freight_floor_versions / freight_floor_coefficients — leitura (motor + API admin)
// =============================================================================

/** Todas as versões carregadas — base do `GET /v1/transporte/piso/tabelas` (admin read-only). */
export async function listFreightFloorVersionsWithCoefficientCounts(): Promise<
  Array<FreightFloorVersionRecord & { coefficientsCount: number }>
> {
  const result = await query<VersionRow & { coefficients_count: string }>(
    `select v.*, count(c.id)::text as coefficients_count
       from freight_floor_versions v
       left join freight_floor_coefficients c on c.floor_version_id = v.id
      group by v.id
      order by v.table_code asc, v.effective_from desc`
  );

  return result.rows
    .map((row) => {
      const mapped = mapVersionRow(row);
      if (!mapped) return null;
      return { ...mapped, coefficientsCount: Number(row.coefficients_count ?? 0) };
    })
    .filter((row): row is FreightFloorVersionRecord & { coefficientsCount: number } => row !== null);
}

/**
 * Versão vigente na `referenceDate` para o `tableCode` — considera SOMENTE versões
 * `pending_review`/`reviewed` (uma `rejected` nunca é usada em cálculo, mesmo se sua janela
 * conteria a data). Delega o predicado temporal a `resolveVersionFromList` — mesma função usada
 * pelo catálogo regulatório.
 */
export async function findVigenteFloorVersion(
  tableCode: string,
  referenceDate: string
): Promise<FreightFloorVersionRecord | null> {
  const result = await query<VersionRow>(
    `select * from freight_floor_versions
      where table_code = $1
        and review_status in ('pending_review', 'reviewed')
      order by effective_from asc`,
    [tableCode]
  );

  const versions = result.rows.map(mapVersionRow).filter((row): row is FreightFloorVersionRecord => row !== null);
  return resolveVersionFromList(versions, referenceDate);
}

export type FreightFloorCoefficientPair = {
  displacement: number | null;
  loadUnload: number | null;
};

/** Par de coeficientes (deslocamento + carga/descarga) para `(floorVersionId, cargoType, axlesCount)`. */
export async function findCoefficientPair(
  floorVersionId: string,
  cargoType: string,
  axlesCount: number
): Promise<FreightFloorCoefficientPair> {
  const result = await query<CoefficientRow>(
    `select * from freight_floor_coefficients
      where floor_version_id = $1 and cargo_type = $2 and axles_count = $3`,
    [floorVersionId, cargoType, axlesCount]
  );

  const rows = result.rows.map(mapCoefficientRow).filter((row): row is FreightFloorCoefficientRecord => row !== null);
  const displacement = rows.find((row) => row.coefficientType === 'displacement_cost')?.value ?? null;
  const loadUnload = rows.find((row) => row.coefficientType === 'load_unload_cost')?.value ?? null;
  return { displacement, loadUnload };
}

// =============================================================================
// freight_floor_calculations — APPEND-ONLY (migration 026, este PR)
// =============================================================================

export type FreightFloorCalculationOutcome = 'calculated' | 'not_applicable' | 'missing_coefficients' | 'missing_inputs';

export type FreightFloorCalculationInsert = {
  id: string;
  integrationAccountId: string;
  operationId: string;
  floorVersionId: string | null;
  ruleVersionId: string | null;
  referenceDate: string;
  cargoType: string;
  axlesCount: number;
  distanceKm: number;
  displacementCoefficient: number | null;
  loadUnloadCoefficient: number | null;
  minimumAmount: number | null;
  offeredAmount: number | null;
  contractedAmount: number | null;
  compliant: boolean | null;
  outcome: FreightFloorCalculationOutcome;
  calculationInputsSnapshot: Record<string, unknown>;
  calculationTrace: Record<string, unknown>;
  engineVersion: string;
  correlationId: string;
};

/** Referência (SEM id interno) da versão de tabela usada num cálculo — vem de `calculation_trace.floorVersion`. */
export type FreightFloorCalculationVersionRef = {
  normativeReference: string;
  tableCode: string;
  reviewStatus: FreightFloorReviewStatus;
  effectiveFrom: string;
};

export interface FreightFloorCalculationRecord {
  id: string;
  integrationAccountId: string;
  operationId: string;
  floorVersionId: string | null;
  ruleVersionId: string | null;
  referenceDate: string;
  cargoType: string;
  axlesCount: number;
  distanceKm: number;
  displacementCoefficient: number | null;
  loadUnloadCoefficient: number | null;
  minimumAmount: number | null;
  offeredAmount: number | null;
  contractedAmount: number | null;
  compliant: boolean | null;
  outcome: FreightFloorCalculationOutcome;
  calculationInputsSnapshot: Record<string, unknown>;
  calculationTrace: Record<string, unknown>;
  /** Extraído de `calculation_trace.floorVersion` — evita um segundo join só para reviewStatus/effectiveFrom. */
  floorVersionRef: FreightFloorCalculationVersionRef | null;
  engineVersion: string;
  correlationId: string;
  createdAt: string;
}

type CalculationRow = {
  id: string;
  integration_account_id: string;
  operation_id: string;
  floor_version_id: string | null;
  rule_version_id: string | null;
  reference_date: Date | string;
  cargo_type: string;
  axles_count: number;
  distance_km: string;
  displacement_coefficient: string | null;
  load_unload_coefficient: string | null;
  minimum_amount: string | null;
  offered_amount: string | null;
  contracted_amount: string | null;
  compliant: boolean | null;
  outcome: string;
  calculation_inputs_snapshot: unknown;
  calculation_trace: unknown;
  engine_version: string;
  correlation_id: string;
  created_at: Date | string;
};

function toJsonObject(value: unknown): Record<string, unknown> {
  if (value && typeof value === 'object' && !Array.isArray(value)) {
    return value as Record<string, unknown>;
  }
  return {};
}

function toNumberOrNull(value: unknown): number | null {
  if (value === null || value === undefined) return null;
  const num = Number(value);
  return Number.isFinite(num) ? num : null;
}

function toFloorVersionRef(trace: Record<string, unknown>): FreightFloorCalculationVersionRef | null {
  const raw = trace.floorVersion;
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return null;
  const candidate = raw as Record<string, unknown>;
  if (
    typeof candidate.normativeReference !== 'string'
    || typeof candidate.tableCode !== 'string'
    || typeof candidate.reviewStatus !== 'string'
    || typeof candidate.effectiveFrom !== 'string'
  ) {
    return null;
  }
  return {
    normativeReference: candidate.normativeReference,
    tableCode: candidate.tableCode,
    reviewStatus: candidate.reviewStatus as FreightFloorReviewStatus,
    effectiveFrom: candidate.effectiveFrom
  };
}

function mapCalculationRow(row: CalculationRow | undefined): FreightFloorCalculationRecord | null {
  if (!row) return null;
  const calculationTrace = toJsonObject(row.calculation_trace);
  return {
    id: row.id,
    integrationAccountId: row.integration_account_id,
    operationId: row.operation_id,
    floorVersionId: row.floor_version_id,
    ruleVersionId: row.rule_version_id,
    referenceDate: toIsoDateOnly(row.reference_date) ?? '',
    cargoType: row.cargo_type,
    axlesCount: Number(row.axles_count),
    distanceKm: Number(row.distance_km),
    displacementCoefficient: toNumberOrNull(row.displacement_coefficient),
    loadUnloadCoefficient: toNumberOrNull(row.load_unload_coefficient),
    minimumAmount: toNumberOrNull(row.minimum_amount),
    offeredAmount: toNumberOrNull(row.offered_amount),
    contractedAmount: toNumberOrNull(row.contracted_amount),
    compliant: row.compliant,
    outcome: row.outcome as FreightFloorCalculationOutcome,
    calculationInputsSnapshot: toJsonObject(row.calculation_inputs_snapshot),
    calculationTrace,
    floorVersionRef: toFloorVersionRef(calculationTrace),
    engineVersion: row.engine_version,
    correlationId: row.correlation_id,
    createdAt: toIso(row.created_at) ?? ''
  };
}

/** Grava UM cálculo — APPEND-ONLY, nunca `update`/`delete` (mesmo racional de `compliance_evaluations`). */
export async function insertFreightFloorCalculation(
  input: FreightFloorCalculationInsert
): Promise<FreightFloorCalculationRecord> {
  const result = await query<CalculationRow>(
    `insert into freight_floor_calculations (
       id, integration_account_id, operation_id, floor_version_id, rule_version_id, reference_date,
       cargo_type, axles_count, distance_km, displacement_coefficient, load_unload_coefficient,
       minimum_amount, offered_amount, contracted_amount, compliant, outcome,
       calculation_inputs_snapshot, calculation_trace, engine_version, correlation_id
     ) values (
       $1, $2, $3, $4, $5, $6::date, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17::jsonb,
       $18::jsonb, $19, $20
     )
     returning *`,
    [
      input.id,
      input.integrationAccountId,
      input.operationId,
      input.floorVersionId,
      input.ruleVersionId,
      input.referenceDate,
      input.cargoType,
      input.axlesCount,
      input.distanceKm,
      input.displacementCoefficient,
      input.loadUnloadCoefficient,
      input.minimumAmount,
      input.offeredAmount,
      input.contractedAmount,
      input.compliant,
      input.outcome,
      JSON.stringify(input.calculationInputsSnapshot),
      JSON.stringify(input.calculationTrace),
      input.engineVersion,
      input.correlationId
    ]
  );
  const row = mapCalculationRow(result.rows[0]);
  if (!row) throw new Error(`[freight-floor-repo] insertFreightFloorCalculation não devolveu linha para a operação ${input.operationId}`);
  return row;
}

/** Cálculo mais recente da operação — usado por `rule-evaluators.ts` via `ctx.floorCalculation`. */
export async function findLatestFreightFloorCalculation(
  operationId: string,
  integrationAccountId: string
): Promise<FreightFloorCalculationRecord | null> {
  const result = await query<CalculationRow>(
    `select * from freight_floor_calculations
      where operation_id = $1 and integration_account_id = $2
      order by created_at desc
      limit 1`,
    [operationId, integrationAccountId]
  );
  return mapCalculationRow(result.rows[0]);
}

export type ListFreightFloorCalculationsFilters = {
  page?: number;
  pageSize?: number;
};

const DEFAULT_PAGE_SIZE = 20;
const MAX_PAGE_SIZE = 200;

/** Histórico paginado (prova o append-only: recalcular a mesma operação cria uma linha NOVA). */
export async function listFreightFloorCalculations(
  operationId: string,
  integrationAccountId: string,
  filters: ListFreightFloorCalculationsFilters = {}
): Promise<{ items: FreightFloorCalculationRecord[]; total: number; page: number; pageSize: number }> {
  const page = Math.max(Math.floor(filters.page ?? 1), 1);
  const pageSize = Math.min(Math.max(Math.floor(filters.pageSize ?? DEFAULT_PAGE_SIZE), 1), MAX_PAGE_SIZE);
  const offset = (page - 1) * pageSize;

  const totalResult = await query<{ count: string }>(
    `select count(*)::text as count from freight_floor_calculations
      where operation_id = $1 and integration_account_id = $2`,
    [operationId, integrationAccountId]
  );
  const total = Number(totalResult.rows[0]?.count ?? 0);

  const rowsResult = await query<CalculationRow>(
    `select * from freight_floor_calculations
      where operation_id = $1 and integration_account_id = $2
      order by created_at desc
      limit $3 offset $4`,
    [operationId, integrationAccountId, pageSize, offset]
  );

  const items = rowsResult.rows.map(mapCalculationRow).filter((row): row is FreightFloorCalculationRecord => row !== null);
  return { items, total, page, pageSize };
}

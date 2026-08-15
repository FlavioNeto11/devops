/**
 * `FreightFloorService` — orquestra o `FreightFloorEngine` sobre UMA operação (PR-B1, DL-103).
 *
 * MODO SHADOW: calcula e PERSISTE o resultado (append-only, `freight_floor_calculations`) e
 * ATUALIZA `transport_operations.freight_floor_amount` quando `outcome = 'calculated'` — mas não
 * torna nada bloqueante por si só. Quem decide enforço é `rule-evaluators.ts`
 * (TR-PMF-002/003/004) + o clamp de enforcement do motor de compliance, inalterados neste PR: o
 * seed segue 100% `blocking=false`.
 *
 * Pipeline: carrega o agregado da operação → resolve `tableCode` pelo `cargoRegime`
 * (`resolveFloorTableCodeForCargoRegime`) → deriva `cargoType`/`axlesCount`/`distanceKm` do
 * agregado → resolve a versão de tabela VIGENTE na `referenceDate` (`freight-floor-repo`) →
 * resolve o par de coeficientes → calcula (`freight-floor-engine`, PURO) → persiste → (se
 * `calculated`) atualiza o cabeçalho da operação. Cada etapa que falha vira um `outcome` diferente
 * de `calculated` — NUNCA lança erro de negócio (só `AppError` de infraestrutura: operação
 * inexistente/fora da conta).
 */

import { AppError } from '../lib/problem.js';
import { createPrefixedId } from '../lib/ids.js';
import {
  getOperationAggregateById,
  updateOperationById
} from '../repositories/transport-operation-repo.js';
import { resolveRuleVersionAt } from '../repositories/regulatory-repo.js';
import { normalizeReferenceDate } from '../lib/transport/regulatory-temporal.js';
import type { CargoRegime } from '../lib/transport/transport-operation-types.js';
import {
  decideFreightFloorOutcome,
  mapCargoTypeToFloorSlug,
  resolveFloorTableCodeForCargoRegime,
  sumAxlesFromVehicles
} from '../lib/transport/freight-floor-engine.js';
import {
  findCoefficientPair,
  findLatestFreightFloorCalculation,
  findVigenteFloorVersion,
  insertFreightFloorCalculation,
  listFreightFloorCalculations,
  listFreightFloorVersionsWithCoefficientCounts,
  type FreightFloorCalculationOutcome,
  type FreightFloorCalculationRecord,
  type FreightFloorCalculationVersionRef,
  type FreightFloorVersionRecord
} from '../repositories/freight-floor-repo.js';

export const FREIGHT_FLOOR_ENGINE_VERSION = 'freight-floor-engine/1.0.0';

/** Hoje em 'YYYY-MM-DD' no fuso LOCAL do processo — mesmo padrão do resto da vertical. */
function todayIsoDate(): string {
  const now = new Date();
  const year = now.getFullYear();
  const month = String(now.getMonth() + 1).padStart(2, '0');
  const day = String(now.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

function operationNotFound(operationId: string): AppError {
  return new AppError(404, 'Not Found', `Operação de transporte ${operationId} não encontrada.`, {
    code: 'TRANSPORT_OPERATION_NOT_FOUND'
  });
}

// =============================================================================
// DTO (shape do resultado — reusado pelo contrato HTTP)
// =============================================================================

export type FreightFloorCalculationResource = {
  id: string;
  operationId: string;
  outcome: FreightFloorCalculationOutcome;
  reason: string | null;
  referenceDate: string;
  cargoType: string | null;
  cargoFloorSlug: string | null;
  axlesCount: number | null;
  distanceKm: number | null;
  displacementCoefficient: number | null;
  loadUnloadCoefficient: number | null;
  minimumAmount: number | null;
  offeredAmount: number | null;
  contractedAmount: number | null;
  compliant: boolean | null;
  floorVersionRef: FreightFloorCalculationVersionRef | null;
  engineVersion: string;
  trace: Record<string, unknown>;
  createdAt: string;
};

function toFloorVersionRef(version: FreightFloorVersionRecord): FreightFloorCalculationVersionRef {
  return {
    normativeReference: version.normativeReference,
    tableCode: version.tableCode,
    reviewStatus: version.reviewStatus,
    effectiveFrom: version.effectiveFrom
  };
}

function toResource(record: FreightFloorCalculationRecord): FreightFloorCalculationResource {
  const trace = record.calculationTrace;
  const reason = typeof trace.reason === 'string' ? trace.reason : null;
  return {
    id: record.id,
    operationId: record.operationId,
    outcome: record.outcome,
    reason,
    referenceDate: record.referenceDate,
    cargoType: record.cargoType || null,
    cargoFloorSlug: typeof trace.cargoFloorSlug === 'string' ? trace.cargoFloorSlug : null,
    axlesCount: record.axlesCount || null,
    distanceKm: record.distanceKm || null,
    displacementCoefficient: record.displacementCoefficient,
    loadUnloadCoefficient: record.loadUnloadCoefficient,
    minimumAmount: record.minimumAmount,
    offeredAmount: record.offeredAmount,
    contractedAmount: record.contractedAmount,
    compliant: record.compliant,
    floorVersionRef: record.floorVersionRef,
    engineVersion: record.engineVersion,
    trace,
    createdAt: record.createdAt
  };
}

// =============================================================================
// Cálculo + persistência
// =============================================================================

export type CalculateAndPersistFloorInput = {
  operationId: string;
  integrationAccountId: string;
  referenceDate?: string;
  correlationId: string;
  /** `version` do agregado no momento da chamada — usado no CAS do update de `freightFloorAmount`
   *  (mesmo locking otimista das demais rotas mutantes da vertical). Quando omitido, usa a
   *  `version` lida agora mesmo do agregado (chamador interno/teste que não passou pelo HTTP). */
  expectedVersion?: number;
};

/**
 * Monta a linha a persistir (id + insumos + outcome + trace) SEM tocar o banco — função interna
 * que concentra toda a árvore de decisão do pipeline; `calculateAndPersistFloorForOperation` só
 * chama isto e depois grava. Devolve também a versão de tabela usada (para o update opcional do
 * cabeçalho e para o `floorVersionRef` da resposta), fora do objeto de insert (que só quer o id).
 */
async function buildCalculationRow(input: {
  operationId: string;
  integrationAccountId: string;
  referenceDate: string;
  correlationId: string;
  cargoRegime: CargoRegime;
  cargoTypeRaw: string | null;
  axlesFromVehicles: number | null;
  distanceKm: number | null;
  freightOfferedAmount: number | null;
  freightContractedAmount: number | null;
}): Promise<{
  outcome: FreightFloorCalculationOutcome;
  floorVersion: FreightFloorVersionRecord | null;
  ruleVersionId: string | null;
  displacementCoefficient: number | null;
  loadUnloadCoefficient: number | null;
  minimumAmount: number | null;
  compliant: boolean | null;
  calculationInputsSnapshot: Record<string, unknown>;
  calculationTrace: Record<string, unknown>;
}> {
  const ruleVersion = await resolveRuleVersionAt('TR-PMF-004', input.referenceDate);
  const ruleVersionId = ruleVersion?.id ?? null;

  const baseInputsSnapshot: Record<string, unknown> = {
    cargoRegime: input.cargoRegime,
    cargoTypeRaw: input.cargoTypeRaw,
    axlesFromVehicles: input.axlesFromVehicles,
    distanceKm: input.distanceKm,
    freightOfferedAmount: input.freightOfferedAmount,
    freightContractedAmount: input.freightContractedAmount,
    tableCode: resolveFloorTableCodeForCargoRegime(input.cargoRegime)
  };

  // I/O primeiro: só resolve versão/coeficientes quando `cargoRegime` exige piso — evita uma
  // consulta ao banco para operações `fracionada`/`unknown`, que sempre dão `not_applicable`.
  const tableCode = resolveFloorTableCodeForCargoRegime(input.cargoRegime);
  const floorVersion = tableCode ? await findVigenteFloorVersion(tableCode, input.referenceDate) : null;

  const cargoFloorSlugCandidate = tableCode ? mapCargoTypeToFloorSlug(input.cargoTypeRaw) : null;
  const coefficients = floorVersion && cargoFloorSlugCandidate && input.axlesFromVehicles != null
    ? await findCoefficientPair(floorVersion.id, cargoFloorSlugCandidate, input.axlesFromVehicles)
    : null;
  const resolvedCoefficients = coefficients && coefficients.displacement != null && coefficients.loadUnload != null
    ? { displacement: coefficients.displacement, loadUnload: coefficients.loadUnload }
    : null;

  // Decisão PURA (`freight-floor-engine.ts`) — nenhuma chamada a banco a partir daqui.
  const decision = decideFreightFloorOutcome({
    cargoRegime: input.cargoRegime,
    cargoTypeRaw: input.cargoTypeRaw,
    axlesCount: input.axlesFromVehicles,
    distanceKm: input.distanceKm,
    floorVersionFound: floorVersion !== null,
    coefficients: resolvedCoefficients
  });

  if (decision.outcome === 'not_applicable') {
    return {
      outcome: 'not_applicable',
      floorVersion: null,
      ruleVersionId,
      displacementCoefficient: null,
      loadUnloadCoefficient: null,
      minimumAmount: null,
      compliant: null,
      calculationInputsSnapshot: baseInputsSnapshot,
      calculationTrace: { reason: decision.reason }
    };
  }

  if (decision.outcome === 'missing_inputs') {
    return {
      outcome: 'missing_inputs',
      floorVersion: null,
      ruleVersionId,
      displacementCoefficient: null,
      loadUnloadCoefficient: null,
      minimumAmount: null,
      compliant: null,
      calculationInputsSnapshot: { ...baseInputsSnapshot, cargoFloorSlug: decision.cargoFloorSlug },
      calculationTrace: { reason: decision.reason }
    };
  }

  if (decision.outcome === 'missing_coefficients') {
    return {
      outcome: 'missing_coefficients',
      floorVersion,
      ruleVersionId,
      displacementCoefficient: coefficients?.displacement ?? null,
      loadUnloadCoefficient: coefficients?.loadUnload ?? null,
      minimumAmount: null,
      compliant: null,
      calculationInputsSnapshot: {
        ...baseInputsSnapshot,
        cargoFloorSlug: decision.cargoFloorSlug,
        axlesCount: decision.axlesCount,
        distanceKm: decision.distanceKm
      },
      calculationTrace: {
        reason: decision.reason,
        floorVersion: floorVersion ? toFloorVersionRef(floorVersion) : null
      }
    };
  }

  // decision.outcome === 'calculated'
  const compareAmount = input.freightOfferedAmount ?? input.freightContractedAmount ?? null;
  const compliant = compareAmount == null ? null : compareAmount >= decision.minimumAmount;

  return {
    outcome: 'calculated',
    // `floorVersion` só é não-nulo aqui porque `decideFreightFloorOutcome` só calcula quando
    // `coefficients` (derivado de `floorVersion`) não é nulo — garantia estrutural, não checada de novo.
    floorVersion,
    ruleVersionId,
    displacementCoefficient: resolvedCoefficients?.displacement ?? null,
    loadUnloadCoefficient: resolvedCoefficients?.loadUnload ?? null,
    minimumAmount: decision.minimumAmount,
    compliant,
    calculationInputsSnapshot: {
      ...baseInputsSnapshot,
      cargoFloorSlug: decision.cargoFloorSlug,
      axlesCount: decision.axlesCount,
      distanceKm: decision.distanceKm
    },
    calculationTrace: {
      ...decision.trace,
      cargoFloorSlug: decision.cargoFloorSlug,
      floorVersion: floorVersion ? toFloorVersionRef(floorVersion) : null
    }
  };
}

/**
 * POST /v1/transporte/operacoes/{operationId}/calcular-piso — resolve inputs do agregado, calcula,
 * PERSISTE (append-only) e, quando `outcome === 'calculated'`, atualiza
 * `transport_operations.freight_floor_amount` (locking otimista via `version` do agregado já lido
 * — corrida concorrente com outro PATCH vira 409, aceitável: o operador refaz o cálculo).
 */
export async function calculateAndPersistFloorForOperation(
  input: CalculateAndPersistFloorInput
): Promise<FreightFloorCalculationResource> {
  const aggregate = await getOperationAggregateById(input.operationId, input.integrationAccountId);
  if (!aggregate) throw operationNotFound(input.operationId);

  const referenceDate = input.referenceDate ? normalizeReferenceDate(input.referenceDate) : todayIsoDate();
  const { operation, vehicles, cargo, route } = aggregate;

  const cargoTypeRaw = cargo[0]?.cargoType ?? null;
  const axlesFromVehicles = sumAxlesFromVehicles(vehicles);
  const distanceKm = route?.distanceKm ?? null;

  const built = await buildCalculationRow({
    operationId: input.operationId,
    integrationAccountId: input.integrationAccountId,
    referenceDate,
    correlationId: input.correlationId,
    cargoRegime: operation.cargoRegime,
    cargoTypeRaw,
    axlesFromVehicles,
    distanceKm,
    freightOfferedAmount: operation.freightOfferedAmount,
    freightContractedAmount: operation.freightContractedAmount
  });

  const id = createPrefixedId('ffcalc');
  const record = await insertFreightFloorCalculation({
    id,
    integrationAccountId: input.integrationAccountId,
    operationId: input.operationId,
    floorVersionId: built.floorVersion?.id ?? null,
    ruleVersionId: built.ruleVersionId,
    referenceDate,
    // NOT NULL na migration 026 — sentinela '' / 0 quando o insumo bruto não existe; o "porquê"
    // fica em calculationTrace.reason, nunca inferido da coluna sozinha.
    cargoType: cargoTypeRaw ?? '',
    axlesCount: axlesFromVehicles ?? 0,
    distanceKm: distanceKm ?? 0,
    displacementCoefficient: built.displacementCoefficient,
    loadUnloadCoefficient: built.loadUnloadCoefficient,
    minimumAmount: built.minimumAmount,
    offeredAmount: operation.freightOfferedAmount,
    contractedAmount: operation.freightContractedAmount,
    compliant: built.compliant,
    outcome: built.outcome,
    calculationInputsSnapshot: built.calculationInputsSnapshot,
    calculationTrace: built.calculationTrace,
    engineVersion: FREIGHT_FLOOR_ENGINE_VERSION,
    correlationId: input.correlationId
  });

  if (built.outcome === 'calculated' && built.minimumAmount != null) {
    await updateOperationById(
      input.operationId,
      input.integrationAccountId,
      input.expectedVersion ?? operation.version,
      { freightFloorAmount: built.minimumAmount }
    );
  }

  return toResource(record);
}

// =============================================================================
// Wrappers HTTP-facing — validação de entrada + shape do contrato (chamados pelas rotas)
// =============================================================================

type LooseRecord = Record<string, unknown>;

function toTrimmedString(value: unknown): string | null {
  if (typeof value !== 'string') return null;
  const trimmed = value.trim();
  return trimmed.length === 0 ? null : trimmed;
}

function requireNonEmptyString(value: unknown, detail: string, code: string): string {
  const normalized = toTrimmedString(value);
  if (!normalized) throw new AppError(400, 'Bad Request', detail, { code });
  return normalized;
}

function requireIntegrationAccountId(source: LooseRecord): string {
  return requireNonEmptyString(
    source.integrationAccountId,
    'integrationAccountId é obrigatório.',
    'TRANSPORT_OPERATION_FIELD_REQUIRED'
  );
}

function requireVersion(source: LooseRecord): number {
  const raw = source.version;
  const num = Number(raw);
  if (!Number.isFinite(num) || !Number.isInteger(num) || num < 1) {
    throw new AppError(400, 'Bad Request', 'version é obrigatório e deve ser um inteiro >= 1.', {
      code: 'TRANSPORT_OPERATION_FIELD_REQUIRED'
    });
  }
  return num;
}

/** POST /v1/transporte/operacoes/{operationId}/calcular-piso */
export async function calculateFreightFloorHttpService(
  operationId: string,
  body: LooseRecord,
  ctx: { correlationId: string }
): Promise<FreightFloorCalculationResource> {
  const integrationAccountId = requireIntegrationAccountId(body);
  const expectedVersion = requireVersion(body);
  const referenceDate = body.referenceDate === undefined || body.referenceDate === null || body.referenceDate === ''
    ? undefined
    : normalizeReferenceDate(String(body.referenceDate));

  return calculateAndPersistFloorForOperation({
    operationId,
    integrationAccountId,
    referenceDate,
    expectedVersion,
    correlationId: ctx.correlationId
  });
}

// =============================================================================
// GET /v1/transporte/operacoes/{operationId}/calculos-piso — histórico paginado
// =============================================================================

export async function listFreightFloorCalculationsService(
  operationId: string,
  integrationAccountId: string,
  query: { page?: number; pageSize?: number } = {}
): Promise<{ items: FreightFloorCalculationResource[]; total: number; page: number; pageSize: number }> {
  const { items, total, page, pageSize } = await listFreightFloorCalculations(operationId, integrationAccountId, query);
  return { items: items.map(toResource), total, page, pageSize };
}

/** GET /v1/transporte/operacoes/{operationId}/calculos-piso */
export async function listFreightFloorCalculationsHttpService(
  operationId: string,
  query: LooseRecord
): Promise<{ items: FreightFloorCalculationResource[]; total: number; page: number; pageSize: number }> {
  const integrationAccountId = requireIntegrationAccountId(query);
  return listFreightFloorCalculationsService(operationId, integrationAccountId, {
    page: query.page !== undefined ? Number(query.page) : undefined,
    pageSize: query.pageSize !== undefined ? Number(query.pageSize) : undefined
  });
}

// =============================================================================
// GET /v1/transporte/piso/tabelas — admin read-only
// =============================================================================

export type FreightFloorTableResource = {
  normativeReference: string;
  resolution: string | null;
  tableCode: string;
  publishedAt: string | null;
  effectiveFrom: string;
  effectiveUntil: string | null;
  methodologyNotes: string;
  sourceUrl: string | null;
  sourceHash: string | null;
  reviewStatus: FreightFloorVersionRecord['reviewStatus'];
  reviewedBy: string | null;
  reviewedAt: string | null;
  coefficientsCount: number;
};

/** Ids internos (`ffver_...`) NUNCA saem — identidade pública é `(normativeReference, tableCode)`. */
export async function listFreightFloorTablesService(): Promise<{ items: FreightFloorTableResource[] }> {
  const versions = await listFreightFloorVersionsWithCoefficientCounts();
  return {
    items: versions.map((version) => ({
      normativeReference: version.normativeReference,
      resolution: version.resolution,
      tableCode: version.tableCode,
      publishedAt: version.publishedAt,
      effectiveFrom: version.effectiveFrom,
      effectiveUntil: version.effectiveUntil,
      methodologyNotes: version.methodologyNotes,
      sourceUrl: version.sourceUrl,
      sourceHash: version.sourceHash,
      reviewStatus: version.reviewStatus,
      reviewedBy: version.reviewedBy,
      reviewedAt: version.reviewedAt,
      coefficientsCount: version.coefficientsCount
    }))
  };
}

// =============================================================================
// Leitura interna — usada pelo motor de compliance (`transport-compliance-service.ts`)
// =============================================================================

export type { FreightFloorCalculationRecord } from '../repositories/freight-floor-repo.js';

/** Reexport fino — o compliance service não precisa conhecer o módulo de repositório diretamente. */
export async function findLatestFreightFloorCalculationForOperation(
  operationId: string,
  integrationAccountId: string
): Promise<FreightFloorCalculationRecord | null> {
  return findLatestFreightFloorCalculation(operationId, integrationAccountId);
}

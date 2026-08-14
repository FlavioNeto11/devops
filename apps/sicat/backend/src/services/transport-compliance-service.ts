/**
 * `TransportComplianceService` — motor de compliance da vertical Transporte (PR-A5, DL-103).
 *
 * WORKER-CALLABLE desde o nascimento: toda função recebe `correlationId`/`evaluatedBy` EXPLÍCITOS
 * — nada aqui lê `req`/sessão. Tudo síncrono (sem job, sem chamada externa): resolve as regras do
 * gate na data de referência (`regulatory-repo.listRulesWithVersionAt`) → evaluator puro por regra
 * (`lib/transport/rule-evaluators.ts`) → clamp de enforcement → persiste avaliação + checks +
 * evidências NUMA transação (`transport-compliance-repo.ts`, append-only) → devolve o DTO.
 *
 * Duas camadas de tipo nesta vertical: os enums do MOTOR/banco são minúsculos
 * (`pass|warn|block|not_applicable`, mesmo universo de `rule-evaluators.ts` e da migration 025); os
 * enums do CONTRATO OpenAPI são MAIÚSCULOS (`PASS|WARN|BLOCK|NOT_APPLICABLE`) — a conversão só
 * acontece nos `to*Resource` no fim deste arquivo, nunca no meio do pipeline.
 */

import { AppError } from '../lib/problem.js';
import { createPrefixedId } from '../lib/ids.js';
import { getOperationAggregateById } from '../repositories/transport-operation-repo.js';
import {
  listRulesWithVersionAt,
  listRuleVersions,
  type RegulatoryRuleWithVersion
} from '../repositories/regulatory-repo.js';
import { normalizeReferenceDate } from '../lib/transport/regulatory-temporal.js';
import {
  COMPLIANCE_GATES,
  type ComplianceGate,
  type LegalBasisEntry,
  type RegulatoryRuleVersion,
  type RuleCode
} from '../lib/transport/regulatory-types.js';
import {
  RULE_EVALUATORS,
  RULES_WITHOUT_EVALUATOR_YET,
  applyEnforcementClamp,
  type ComplianceCheckStatus,
  type FreightFloorCalculationContext
} from '../lib/transport/rule-evaluators.js';
import type { TransportOperationAggregate } from '../lib/transport/transport-operation-types.js';
import { findLatestFreightFloorCalculationForOperation } from './freight-floor-service.js';
import type { FreightFloorCalculationRecord } from '../repositories/freight-floor-repo.js';
import {
  getLatestEvaluationByGate,
  getEvaluationById as getEvaluationRecordById,
  insertEvaluationWithChecks,
  listEvaluations as listEvaluationRecords,
  type ComplianceCheckInsert,
  type ComplianceEvaluationWithChecks,
  type ComplianceEvidenceInsert,
  type ListEvaluationsFilters
} from '../repositories/transport-compliance-repo.js';

export const COMPLIANCE_ENGINE_VERSION = 'transporte-compliance/1.0.0';

type LooseRecord = Record<string, unknown>;
export type ComplianceOverallStatus = 'pass' | 'warn' | 'block';
export type ComplianceTriggeredBy = 'user' | 'transition' | 'system';

// =============================================================================
// Helpers locais (deliberadamente NÃO compartilhados com transport-operation-service.ts — evita
// import cruzado entre os dois services; molde: cada service da vertical já duplica o mínimo de
// validação de entrada, ver transporte-regras-service.ts).
// =============================================================================

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

function requireGate(value: unknown): ComplianceGate {
  if (typeof value !== 'string' || !(COMPLIANCE_GATES as readonly string[]).includes(value)) {
    throw new AppError(
      400,
      'Bad Request',
      `gate inválido: esperado um de ${COMPLIANCE_GATES.join(', ')} (recebido "${String(value)}").`,
      { code: 'TRANSPORT_COMPLIANCE_GATE_INVALID', context: { value, allowed: COMPLIANCE_GATES } }
    );
  }
  return value as ComplianceGate;
}

/** Hoje em 'YYYY-MM-DD' no fuso LOCAL do processo — mesmo padrão de `transporte-regras-service.ts`. */
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
// Motor — resolução de regra sem versão vigente (RULE_NOT_YET_EFFECTIVE × RULE_NO_LONGER_EFFECTIVE)
// =============================================================================

/**
 * Regra SEM versão vigente na data de referência: distingue "ainda não nasceu" de "não vigora
 * mais" comparando a data com a vigência de TODAS as versões da regra (não só a resolvida — que
 * aqui é `null` por definição). Função pura, testável com fixtures isoladas.
 */
export function classifyMissingRuleVersion(
  versions: readonly RegulatoryRuleVersion[],
  referenceDate: string
): 'RULE_NOT_YET_EFFECTIVE' | 'RULE_NO_LONGER_EFFECTIVE' {
  if (versions.length === 0) return 'RULE_NOT_YET_EFFECTIVE';
  const earliestFrom = versions
    .map((version) => version.effectiveFrom)
    .reduce((min, effectiveFrom) => (effectiveFrom < min ? effectiveFrom : min));
  return referenceDate < earliestFrom ? 'RULE_NOT_YET_EFFECTIVE' : 'RULE_NO_LONGER_EFFECTIVE';
}

const STATUS_RANK: Record<ComplianceOverallStatus, number> = { pass: 0, warn: 1, block: 2 };

function worstStatus(current: ComplianceOverallStatus, candidate: ComplianceCheckStatus): ComplianceOverallStatus {
  if (candidate === 'not_applicable') return current;
  return STATUS_RANK[candidate as ComplianceOverallStatus] > STATUS_RANK[current]
    ? (candidate as ComplianceOverallStatus)
    : current;
}

type CheckBuild = {
  ruleCode: string;
  ruleVersionId: string | null;
  ruleVersionLabel: string;
  status: ComplianceCheckStatus;
  rawStatus: ComplianceCheckStatus | null;
  reasonCode: string | null;
  humanMessage: string;
  legalBasis: LegalBasisEntry[];
  inputsSnapshot: Record<string, unknown>;
  resultSnapshot: Record<string, unknown>;
};

/** `FreightFloorCalculationRecord` (repo) → recorte que `rule-evaluators.ts` conhece (PR-B1). */
function toFloorCalculationContext(record: FreightFloorCalculationRecord | null): FreightFloorCalculationContext | null {
  if (!record) return null;
  return {
    outcome: record.outcome,
    referenceDate: record.referenceDate,
    minimumAmount: record.minimumAmount,
    floorVersion: record.floorVersionRef
  };
}

async function buildCheckForRule(
  rule: RegulatoryRuleWithVersion,
  aggregate: TransportOperationAggregate,
  referenceDate: string,
  floorCalculation: FreightFloorCalculationContext | null
): Promise<CheckBuild> {
  if (!rule.resolvedVersion) {
    const allVersions = await listRuleVersions({ ruleId: rule.id });
    const reasonCode = classifyMissingRuleVersion(allVersions, referenceDate);
    const humanMessage = reasonCode === 'RULE_NOT_YET_EFFECTIVE'
      ? `A regra ${rule.code} ainda não estava vigente em ${referenceDate}.`
      : `A regra ${rule.code} não estava mais vigente em ${referenceDate}.`;

    return {
      ruleCode: rule.code,
      ruleVersionId: null,
      ruleVersionLabel: '',
      status: 'not_applicable',
      rawStatus: null,
      reasonCode,
      humanMessage,
      legalBasis: [],
      inputsSnapshot: { referenceDate },
      resultSnapshot: {}
    };
  }

  const version = rule.resolvedVersion;
  const ruleCode = rule.code as RuleCode;
  const pendingEvaluator = RULES_WITHOUT_EVALUATOR_YET[ruleCode];
  const evaluator = RULE_EVALUATORS[ruleCode];

  if (pendingEvaluator || !evaluator) {
    const targetPhase = pendingEvaluator?.targetPhase ?? '?';
    return {
      ruleCode: rule.code,
      ruleVersionId: version.id,
      ruleVersionLabel: version.versionLabel,
      status: 'not_applicable',
      rawStatus: null,
      reasonCode: 'EVALUATOR_NOT_IMPLEMENTED',
      humanMessage: `Avaliação automática de ${rule.code} chega na Fase ${targetPhase} do programa — sem evaluator ainda (não é erro).`,
      legalBasis: version.legalBasis,
      inputsSnapshot: {},
      resultSnapshot: {}
    };
  }

  const rawOutcome = evaluator({ operation: aggregate, ruleVersion: version, referenceDate, floorCalculation });
  const clamped = applyEnforcementClamp(rawOutcome, version);

  return {
    ruleCode: rule.code,
    ruleVersionId: version.id,
    ruleVersionLabel: version.versionLabel,
    status: clamped.status,
    rawStatus: clamped.rawStatus,
    reasonCode: clamped.reasonCode ?? null,
    humanMessage: clamped.humanMessage,
    legalBasis: version.legalBasis,
    inputsSnapshot: clamped.inputs,
    resultSnapshot: clamped.result
  };
}

// =============================================================================
// DTO interno (enums MINÚSCULOS — igual ao banco)
// =============================================================================

export type ComplianceCheckResult = {
  ruleCode: string;
  ruleVersionLabel: string;
  status: ComplianceCheckStatus;
  rawStatus: ComplianceCheckStatus | null;
  reasonCode: string | null;
  humanMessage: string;
  legalBasis: LegalBasisEntry[];
  evidenceRefs: string[];
};

export type ComplianceEvaluationResult = {
  evaluationId: string;
  operationId: string;
  gate: ComplianceGate;
  overallStatus: ComplianceOverallStatus;
  referenceDate: string;
  evaluatedAt: string;
  checks: ComplianceCheckResult[];
};

export type EvaluateGateInput = {
  operationId: string;
  integrationAccountId: string;
  gate: ComplianceGate;
  referenceDate?: string;
  triggeredBy: ComplianceTriggeredBy;
  evaluatedBy?: string | null;
  correlationId: string;
  commandId?: string | null;
};

/**
 * Avalia UM gate sobre UMA operação e persiste o resultado (append-only). Pipeline: carrega o
 * agregado (404 se não é da conta) → resolve as regras do gate na data de referência → por regra,
 * evaluator puro (ou `not_applicable`) → clamp de enforcement → persiste evaluation+checks+
 * evidências numa transação → devolve o DTO com o `overallStatus` agregado (pior status pós-clamp;
 * `not_applicable` não conta).
 */
export async function evaluateGateService(input: EvaluateGateInput): Promise<ComplianceEvaluationResult> {
  const aggregate = await getOperationAggregateById(input.operationId, input.integrationAccountId);
  if (!aggregate) throw operationNotFound(input.operationId);

  const referenceDate = input.referenceDate ? normalizeReferenceDate(input.referenceDate) : todayIsoDate();
  const rulesWithVersion = await listRulesWithVersionAt(referenceDate, { gate: input.gate });

  // Carregado UMA vez por avaliação (não por regra) — só TR-PMF-002/003/004 consomem, mas a
  // consulta é barata (uma linha, índice por operation_id) e evita reabrir o pipeline por regra.
  const floorCalculationRecord = await findLatestFreightFloorCalculationForOperation(
    input.operationId,
    input.integrationAccountId
  );
  const floorCalculation = toFloorCalculationContext(floorCalculationRecord);

  const checkBuilds: CheckBuild[] = [];
  for (const rule of rulesWithVersion) {
    checkBuilds.push(await buildCheckForRule(rule, aggregate, referenceDate, floorCalculation));
  }

  let overallStatus: ComplianceOverallStatus = 'pass';
  for (const check of checkBuilds) overallStatus = worstStatus(overallStatus, check.status);

  const evaluationId = createPrefixedId('cmpeval');
  const evaluatedAt = new Date().toISOString();

  const checkInserts: ComplianceCheckInsert[] = [];
  const evidenceInserts: ComplianceEvidenceInsert[] = [];
  const checks: ComplianceCheckResult[] = [];

  for (const build of checkBuilds) {
    const checkId = createPrefixedId('cmpchk');
    checkInserts.push({
      id: checkId,
      ruleCode: build.ruleCode,
      ruleVersionId: build.ruleVersionId,
      ruleVersionLabel: build.ruleVersionLabel,
      status: build.status,
      rawStatus: build.rawStatus,
      reasonCode: build.reasonCode,
      humanMessage: build.humanMessage,
      legalBasis: build.legalBasis,
      inputsSnapshot: build.inputsSnapshot,
      resultSnapshot: build.resultSnapshot
    });

    const evidenceId = createPrefixedId('cmpevd');
    evidenceInserts.push({
      id: evidenceId,
      integrationAccountId: input.integrationAccountId,
      operationId: input.operationId,
      checkId,
      evidenceType: 'calculation',
      payload: { inputs: build.inputsSnapshot, result: build.resultSnapshot },
      source: 'system',
      collectedBy: input.evaluatedBy ?? null,
      correlationId: input.correlationId
    });

    checks.push({
      ruleCode: build.ruleCode,
      ruleVersionLabel: build.ruleVersionLabel,
      status: build.status,
      rawStatus: build.rawStatus,
      reasonCode: build.reasonCode,
      humanMessage: build.humanMessage,
      legalBasis: build.legalBasis,
      evidenceRefs: [evidenceId]
    });
  }

  await insertEvaluationWithChecks(
    {
      id: evaluationId,
      integrationAccountId: input.integrationAccountId,
      operationId: input.operationId,
      gate: input.gate,
      overallStatus,
      referenceDate,
      evaluatedAt,
      triggeredBy: input.triggeredBy,
      evaluatedBy: input.evaluatedBy ?? null,
      engineVersion: COMPLIANCE_ENGINE_VERSION,
      operationSnapshot: aggregate as unknown as Record<string, unknown>,
      correlationId: input.correlationId,
      commandId: input.commandId ?? null
    },
    checkInserts,
    evidenceInserts
  );

  return {
    evaluationId,
    operationId: input.operationId,
    gate: input.gate,
    overallStatus,
    referenceDate,
    evaluatedAt,
    checks
  };
}

// =============================================================================
// Ativação de transição guardada — 409 TRANSPORT_GATE_BLOCKED quando o gate bloqueia
// =============================================================================

export type BlockingCheckSummary = { ruleCode: string; reasonCode: string | null; humanMessage: string };

/**
 * Roda `evaluateGateService` (`triggeredBy: 'transition'`) e lança 409 `TRANSPORT_GATE_BLOCKED`
 * quando `overallStatus === 'block'` — usada pelas transições ATIVADAS por gate
 * (`transport-operation-service.ts`: fluxo de submeter-validação e `contratar`). Devolve a
 * avaliação quando NÃO bloqueia, para a resposta HTTP compor `{ operation, evaluation }`.
 */
export async function assertGatePassesForTransition(
  operationId: string,
  integrationAccountId: string,
  gate: ComplianceGate,
  ctx: { correlationId: string; evaluatedBy?: string | null }
): Promise<ComplianceEvaluationResult> {
  const result = await evaluateGateService({
    operationId,
    integrationAccountId,
    gate,
    triggeredBy: 'transition',
    evaluatedBy: ctx.evaluatedBy ?? null,
    correlationId: ctx.correlationId
  });

  if (result.overallStatus === 'block') {
    const blockingChecks: BlockingCheckSummary[] = result.checks
      .filter((check) => check.status === 'block')
      .map((check) => ({ ruleCode: check.ruleCode, reasonCode: check.reasonCode, humanMessage: check.humanMessage }));

    throw new AppError(
      409,
      'Conflict',
      `Gate ${gate} bloqueado por ${blockingChecks.length} regra(s): `
        + `${blockingChecks.map((check) => check.ruleCode).join(', ')}.`,
      {
        code: 'TRANSPORT_GATE_BLOCKED',
        errors: blockingChecks,
        context: { gate, evaluationId: result.evaluationId, blockingChecks }
      }
    );
  }

  return result;
}

// =============================================================================
// DTO do CONTRATO (enums MAIÚSCULOS) — conversão isolada aqui, nunca no meio do pipeline
// =============================================================================

export type ComplianceCheckResource = {
  ruleCode: string;
  ruleVersionLabel: string;
  status: 'PASS' | 'WARN' | 'BLOCK' | 'NOT_APPLICABLE';
  rawStatus: 'PASS' | 'WARN' | 'BLOCK' | 'NOT_APPLICABLE' | null;
  reasonCode: string | null;
  humanMessage: string;
  legalBasis: LegalBasisEntry[];
  evidenceRefs: string[];
};

export type ComplianceEvaluationResource = {
  evaluationId: string;
  operationId: string;
  gate: ComplianceGate;
  overallStatus: 'PASS' | 'WARN' | 'BLOCK';
  referenceDate: string;
  evaluatedAt: string;
  checks: ComplianceCheckResource[];
};

export type ComplianceOverviewResource = {
  operationId: string;
  gates: Array<{ gate: ComplianceGate; latestEvaluation: ComplianceEvaluationResource | null }>;
};

type UpperCheckStatus = ComplianceCheckResource['status'];
type UpperOverallStatus = ComplianceEvaluationResource['overallStatus'];

function toUpperCheckStatus(status: ComplianceCheckStatus): UpperCheckStatus {
  return status.toUpperCase() as UpperCheckStatus;
}

function toUpperOverallStatus(status: ComplianceOverallStatus): UpperOverallStatus {
  return status.toUpperCase() as UpperOverallStatus;
}

function toComplianceCheckResource(check: ComplianceCheckResult): ComplianceCheckResource {
  return {
    ruleCode: check.ruleCode,
    ruleVersionLabel: check.ruleVersionLabel,
    status: toUpperCheckStatus(check.status),
    rawStatus: check.rawStatus == null ? null : toUpperCheckStatus(check.rawStatus),
    reasonCode: check.reasonCode,
    humanMessage: check.humanMessage,
    legalBasis: check.legalBasis,
    evidenceRefs: check.evidenceRefs
  };
}

export function toComplianceEvaluationResource(evaluation: ComplianceEvaluationResult): ComplianceEvaluationResource {
  return {
    evaluationId: evaluation.evaluationId,
    operationId: evaluation.operationId,
    gate: evaluation.gate,
    overallStatus: toUpperOverallStatus(evaluation.overallStatus),
    referenceDate: evaluation.referenceDate,
    evaluatedAt: evaluation.evaluatedAt,
    checks: evaluation.checks.map(toComplianceCheckResource)
  };
}

/** Mesma conversão, a partir de um registro JÁ PERSISTIDO (repo) — usado pelo overview/histórico. */
function toComplianceEvaluationResourceFromRecord(record: ComplianceEvaluationWithChecks): ComplianceEvaluationResource {
  return {
    evaluationId: record.id,
    operationId: record.operationId,
    gate: record.gate,
    overallStatus: toUpperOverallStatus(record.overallStatus),
    referenceDate: record.referenceDate,
    evaluatedAt: record.evaluatedAt,
    checks: record.checks.map((check) => ({
      ruleCode: check.ruleCode,
      ruleVersionLabel: check.ruleVersionLabel,
      status: toUpperCheckStatus(check.status),
      rawStatus: check.rawStatus == null ? null : toUpperCheckStatus(check.rawStatus),
      reasonCode: check.reasonCode,
      humanMessage: check.humanMessage,
      legalBasis: check.legalBasis,
      evidenceRefs: check.evidenceIds
    }))
  };
}

// =============================================================================
// Wrappers HTTP-facing — validação de entrada + shape do contrato (chamados pelas rotas)
// =============================================================================

/** POST /v1/transporte/operacoes/{operationId}/validar-conformidade — avaliação ad-hoc, sem transição. */
export async function validateTransportOperationComplianceService(
  operationId: string,
  body: LooseRecord,
  ctx: { correlationId: string; evaluatedBy: string | null }
): Promise<ComplianceEvaluationResource> {
  const integrationAccountId = requireIntegrationAccountId(body);
  const gate = requireGate(body.gate);
  const referenceDate = body.referenceDate === undefined || body.referenceDate === null || body.referenceDate === ''
    ? undefined
    : normalizeReferenceDate(String(body.referenceDate));

  const result = await evaluateGateService({
    operationId,
    integrationAccountId,
    gate,
    referenceDate,
    triggeredBy: 'user',
    evaluatedBy: ctx.evaluatedBy,
    correlationId: ctx.correlationId
  });

  return toComplianceEvaluationResource(result);
}

/** GET /v1/transporte/operacoes/{operationId}/conformidade — overview com a última avaliação por gate. */
export async function getTransportOperationComplianceOverviewService(
  operationId: string,
  query: LooseRecord
): Promise<ComplianceOverviewResource> {
  const integrationAccountId = requireIntegrationAccountId(query);

  const aggregate = await getOperationAggregateById(operationId, integrationAccountId);
  if (!aggregate) throw operationNotFound(operationId);

  const latestByGate = await getLatestEvaluationByGate(operationId, integrationAccountId);
  const byGate = new Map(latestByGate.map((evaluation) => [evaluation.gate, evaluation]));

  const gates = COMPLIANCE_GATES.map((gate) => {
    const record = byGate.get(gate);
    return { gate, latestEvaluation: record ? toComplianceEvaluationResourceFromRecord(record) : null };
  });

  return { operationId, gates };
}

/** Histórico paginado (prova o append-only: reavaliar o mesmo gate cria uma linha NOVA). */
export async function listTransportOperationComplianceEvaluationsService(
  operationId: string,
  integrationAccountId: string,
  filters: ListEvaluationsFilters = {}
): Promise<{ items: ComplianceEvaluationResource[]; total: number; page: number; pageSize: number }> {
  const { items, total, page, pageSize } = await listEvaluationRecords(operationId, integrationAccountId, filters);
  return { items: items.map(toComplianceEvaluationResourceFromRecord), total, page, pageSize };
}

export async function getComplianceEvaluationByIdService(
  evaluationId: string,
  integrationAccountId: string
): Promise<ComplianceEvaluationResource | null> {
  const record = await getEvaluationRecordById(evaluationId, integrationAccountId);
  return record ? toComplianceEvaluationResourceFromRecord(record) : null;
}

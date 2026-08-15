/**
 * Repositório do motor de compliance (PR-A5, DL-103) — `compliance_evaluations`/`_checks`/
 * `_evidence` (migration 025).
 *
 * APPEND-ONLY por desenho (ver header da migration): nenhuma função aqui emite `update`/`delete`
 * contra essas três tabelas. `insertEvaluationWithChecks` grava avaliação + checks + evidências
 * NA MESMA TRANSAÇÃO — uma avaliação nunca fica "pela metade" (checks sem evaluation, ou
 * evidência órfã).
 *
 * TENANCY: toda leitura filtra por `integration_account_id` (mesmo contrato de
 * `transport-operation-repo.ts`) — nunca revela a outra conta se uma avaliação existe.
 */

import type { PoolClient } from 'pg';
import { query, withTransaction } from '../db/pool.js';
import type { ComplianceGate, LegalBasisEntry } from '../lib/transport/regulatory-types.js';
import type { ComplianceCheckStatus } from '../lib/transport/rule-evaluators.js';

type DbClient = Pick<PoolClient, 'query'> | null;

function getQueryExecutor(client: DbClient = null) {
  return client?.query?.bind(client) || query;
}

// =============================================================================
// Tipos de inserção (já com id gerado pelo chamador — service é dono do `createPrefixedId`)
// =============================================================================

export type ComplianceEvaluationInsert = {
  id: string;
  integrationAccountId: string;
  operationId: string;
  gate: ComplianceGate;
  overallStatus: 'pass' | 'warn' | 'block';
  referenceDate: string;
  /** Gerado pelo service (não pelo `default now()` do banco) — DTO devolvido e linha persistida
   *  carregam EXATAMENTE o mesmo instante, sem depender de round-trip para reler o valor gravado. */
  evaluatedAt: string;
  triggeredBy: 'user' | 'transition' | 'system';
  evaluatedBy?: string | null;
  engineVersion: string;
  operationSnapshot: Record<string, unknown>;
  correlationId: string;
  commandId?: string | null;
};

export type ComplianceCheckInsert = {
  id: string;
  ruleCode: string;
  ruleVersionId?: string | null;
  ruleVersionLabel: string;
  status: ComplianceCheckStatus;
  rawStatus: ComplianceCheckStatus | null;
  reasonCode?: string | null;
  humanMessage: string;
  legalBasis: LegalBasisEntry[];
  inputsSnapshot: Record<string, unknown>;
  resultSnapshot: Record<string, unknown>;
};

export type ComplianceEvidenceInsert = {
  id: string;
  integrationAccountId: string;
  operationId: string;
  checkId: string;
  evidenceType: 'calculation' | 'document' | 'external_response' | 'manual_declaration' | 'system_snapshot';
  payload?: Record<string, unknown> | null;
  storageRef?: string | null;
  contentHash?: string | null;
  source?: string;
  collectedBy?: string | null;
  correlationId: string;
};

// =============================================================================
// Tipos de leitura (camelCase, espelham as colunas — enums em MINÚSCULO, como no banco; a
// conversão para MAIÚSCULO do contrato é responsabilidade do service)
// =============================================================================

export type ComplianceEvaluationRecord = {
  id: string;
  integrationAccountId: string;
  operationId: string;
  gate: ComplianceGate;
  overallStatus: 'pass' | 'warn' | 'block';
  referenceDate: string;
  evaluatedAt: string;
  triggeredBy: 'user' | 'transition' | 'system';
  evaluatedBy: string | null;
  engineVersion: string;
  operationSnapshot: Record<string, unknown>;
  correlationId: string;
  commandId: string | null;
  createdAt: string;
};

export type ComplianceCheckRecord = {
  id: string;
  evaluationId: string;
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
  /** Ids de `compliance_evidence` que sustentam este check (preenchido por `loadChecksByEvaluationIds`). */
  evidenceIds: string[];
  createdAt: string;
};

export type ComplianceEvaluationWithChecks = ComplianceEvaluationRecord & { checks: ComplianceCheckRecord[] };

// =============================================================================
// Mapeamento de linhas
// =============================================================================

type EvaluationRow = {
  id: string;
  integration_account_id: string;
  operation_id: string;
  gate: string;
  overall_status: string;
  reference_date: Date | string;
  evaluated_at: Date | string;
  triggered_by: string;
  evaluated_by: string | null;
  engine_version: string;
  operation_snapshot: unknown;
  correlation_id: string;
  command_id: string | null;
  created_at: Date | string;
};

type CheckRow = {
  id: string;
  evaluation_id: string;
  rule_code: string;
  rule_version_id: string | null;
  rule_version_label: string;
  status: string;
  raw_status: string | null;
  reason_code: string | null;
  human_message: string;
  legal_basis: unknown;
  inputs_snapshot: unknown;
  result_snapshot: unknown;
  created_at: Date | string;
};

function toIso(value: Date | string | null | undefined): string | null {
  if (value == null) return null;
  if (value instanceof Date) return value.toISOString();
  return String(value);
}

function toIsoDateOnly(value: Date | string | null | undefined): string {
  if (value == null) return '';
  if (value instanceof Date) return value.toISOString().slice(0, 10);
  return String(value).slice(0, 10);
}

function toJsonObject(value: unknown): Record<string, unknown> {
  if (value && typeof value === 'object' && !Array.isArray(value)) {
    return value as Record<string, unknown>;
  }
  return {};
}

function toLegalBasis(value: unknown): LegalBasisEntry[] {
  if (!Array.isArray(value)) return [];
  return value
    .map((entry) => toJsonObject(entry))
    .filter((entry) => typeof entry.reference === 'string')
    .map((entry) => ({ reference: String(entry.reference) }));
}

function mapEvaluationRow(row: EvaluationRow | undefined): ComplianceEvaluationRecord | null {
  if (!row) return null;
  return {
    id: row.id,
    integrationAccountId: row.integration_account_id,
    operationId: row.operation_id,
    gate: row.gate as ComplianceGate,
    overallStatus: row.overall_status as ComplianceEvaluationRecord['overallStatus'],
    referenceDate: toIsoDateOnly(row.reference_date),
    evaluatedAt: toIso(row.evaluated_at) ?? '',
    triggeredBy: row.triggered_by as ComplianceEvaluationRecord['triggeredBy'],
    evaluatedBy: row.evaluated_by,
    engineVersion: row.engine_version,
    operationSnapshot: toJsonObject(row.operation_snapshot),
    correlationId: row.correlation_id,
    commandId: row.command_id,
    createdAt: toIso(row.created_at) ?? ''
  };
}

function mapCheckRow(row: CheckRow | undefined): ComplianceCheckRecord | null {
  if (!row) return null;
  return {
    id: row.id,
    evaluationId: row.evaluation_id,
    ruleCode: row.rule_code,
    ruleVersionId: row.rule_version_id,
    ruleVersionLabel: row.rule_version_label,
    status: row.status as ComplianceCheckStatus,
    rawStatus: row.raw_status as ComplianceCheckStatus | null,
    reasonCode: row.reason_code,
    humanMessage: row.human_message,
    legalBasis: toLegalBasis(row.legal_basis),
    inputsSnapshot: toJsonObject(row.inputs_snapshot),
    resultSnapshot: toJsonObject(row.result_snapshot),
    evidenceIds: [],
    createdAt: toIso(row.created_at) ?? ''
  };
}

// =============================================================================
// Escrita — SEMPRE append-only, SEMPRE em transação única
// =============================================================================

async function insertEvaluationRow(input: ComplianceEvaluationInsert, client: PoolClient): Promise<void> {
  await client.query(
    `insert into compliance_evaluations (
       id, integration_account_id, operation_id, gate, overall_status, reference_date, evaluated_at,
       triggered_by, evaluated_by, engine_version, operation_snapshot, correlation_id, command_id
     ) values ($1, $2, $3, $4, $5, $6::date, $7::timestamptz, $8, $9, $10, $11::jsonb, $12, $13)`,
    [
      input.id,
      input.integrationAccountId,
      input.operationId,
      input.gate,
      input.overallStatus,
      input.referenceDate,
      input.evaluatedAt,
      input.triggeredBy,
      input.evaluatedBy ?? null,
      input.engineVersion,
      JSON.stringify(input.operationSnapshot),
      input.correlationId,
      input.commandId ?? null
    ]
  );
}

async function insertCheckRow(evaluationId: string, input: ComplianceCheckInsert, client: PoolClient): Promise<void> {
  await client.query(
    `insert into compliance_checks (
       id, evaluation_id, rule_code, rule_version_id, rule_version_label, status, raw_status,
       reason_code, human_message, legal_basis, inputs_snapshot, result_snapshot
     ) values ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10::jsonb, $11::jsonb, $12::jsonb)`,
    [
      input.id,
      evaluationId,
      input.ruleCode,
      input.ruleVersionId ?? null,
      input.ruleVersionLabel,
      input.status,
      input.rawStatus,
      input.reasonCode ?? null,
      input.humanMessage,
      JSON.stringify(input.legalBasis),
      JSON.stringify(input.inputsSnapshot),
      JSON.stringify(input.resultSnapshot)
    ]
  );
}

async function insertEvidenceRow(input: ComplianceEvidenceInsert, client: PoolClient): Promise<void> {
  await client.query(
    `insert into compliance_evidence (
       id, integration_account_id, operation_id, check_id, evidence_type, payload, storage_ref,
       content_hash, source, collected_by, correlation_id
     ) values ($1, $2, $3, $4, $5, $6::jsonb, $7, $8, $9, $10, $11)`,
    [
      input.id,
      input.integrationAccountId,
      input.operationId,
      input.checkId,
      input.evidenceType,
      input.payload == null ? null : JSON.stringify(input.payload),
      input.storageRef ?? null,
      input.contentHash ?? null,
      input.source ?? 'system',
      input.collectedBy ?? null,
      input.correlationId
    ]
  );
}

/**
 * Grava UMA avaliação + seus checks + suas evidências NUMA ÚNICA TRANSAÇÃO. Nunca faz `update`:
 * uma reavaliação do mesmo gate/operação é sempre uma chamada NOVA a esta função (append-only).
 */
export async function insertEvaluationWithChecks(
  evaluation: ComplianceEvaluationInsert,
  checks: ComplianceCheckInsert[],
  evidences: ComplianceEvidenceInsert[]
): Promise<void> {
  await withTransaction(async (client) => {
    await insertEvaluationRow(evaluation, client);
    for (const check of checks) {
      await insertCheckRow(evaluation.id, check, client);
    }
    for (const evidence of evidences) {
      await insertEvidenceRow(evidence, client);
    }
  });
}

// =============================================================================
// Leitura
// =============================================================================

/** Ids de evidência por `check_id` — um check pode (Fase A: sempre) ter evidência associada. */
async function loadEvidenceIdsByCheckIds(
  checkIds: string[],
  client: DbClient = null
): Promise<Map<string, string[]>> {
  const byCheck = new Map<string, string[]>();
  if (checkIds.length === 0) return byCheck;

  const execute = getQueryExecutor(client);
  const result = await execute<{ id: string; check_id: string | null }>(
    `select id, check_id from compliance_evidence where check_id = any($1::text[]) order by created_at asc`,
    [checkIds]
  );

  for (const row of result.rows) {
    if (!row.check_id) continue;
    const bucket = byCheck.get(row.check_id) ?? [];
    bucket.push(row.id);
    byCheck.set(row.check_id, bucket);
  }
  return byCheck;
}

async function loadChecksByEvaluationIds(
  evaluationIds: string[],
  client: DbClient = null
): Promise<Map<string, ComplianceCheckRecord[]>> {
  const byEvaluation = new Map<string, ComplianceCheckRecord[]>();
  if (evaluationIds.length === 0) return byEvaluation;

  const execute = getQueryExecutor(client);
  const result = await execute<CheckRow>(
    `select * from compliance_checks where evaluation_id = any($1::text[]) order by created_at asc`,
    [evaluationIds]
  );

  const checks = result.rows.map(mapCheckRow).filter((row): row is ComplianceCheckRecord => row !== null);
  const evidenceByCheck = await loadEvidenceIdsByCheckIds(checks.map((check) => check.id), client);

  for (const check of checks) {
    check.evidenceIds = evidenceByCheck.get(check.id) ?? [];
    const bucket = byEvaluation.get(check.evaluationId) ?? [];
    bucket.push(check);
    byEvaluation.set(check.evaluationId, bucket);
  }
  return byEvaluation;
}

/** A avaliação mais recente de CADA gate que já foi avaliado para a operação (gates sem nenhuma avaliação não entram). */
export async function getLatestEvaluationByGate(
  operationId: string,
  integrationAccountId: string
): Promise<ComplianceEvaluationWithChecks[]> {
  const result = await query<EvaluationRow>(
    `select distinct on (gate) *
       from compliance_evaluations
      where operation_id = $1
        and integration_account_id = $2
      order by gate, evaluated_at desc, created_at desc`,
    [operationId, integrationAccountId]
  );

  const evaluations = result.rows.map(mapEvaluationRow).filter((row): row is ComplianceEvaluationRecord => row !== null);
  const checksByEvaluation = await loadChecksByEvaluationIds(evaluations.map((evaluation) => evaluation.id));

  return evaluations.map((evaluation) => ({ ...evaluation, checks: checksByEvaluation.get(evaluation.id) ?? [] }));
}

export type ListEvaluationsFilters = {
  gate?: ComplianceGate | string;
  page?: number;
  pageSize?: number;
};

const DEFAULT_PAGE_SIZE = 20;
const MAX_PAGE_SIZE = 200;

/** Histórico paginado de avaliações da operação — mais recente primeiro. Prova o append-only. */
export async function listEvaluations(
  operationId: string,
  integrationAccountId: string,
  filters: ListEvaluationsFilters = {}
): Promise<{ items: ComplianceEvaluationWithChecks[]; total: number; page: number; pageSize: number }> {
  const where: string[] = ['operation_id = $1', 'integration_account_id = $2'];
  const values: unknown[] = [operationId, integrationAccountId];

  if (filters.gate) {
    values.push(filters.gate);
    where.push(`gate = $${values.length}`);
  }

  const whereSql = `where ${where.join(' and ')}`;
  const page = Math.max(Math.floor(filters.page ?? 1), 1);
  const pageSize = Math.min(Math.max(Math.floor(filters.pageSize ?? DEFAULT_PAGE_SIZE), 1), MAX_PAGE_SIZE);
  const offset = (page - 1) * pageSize;

  const totalResult = await query<{ count: string }>(
    `select count(*)::text as count from compliance_evaluations ${whereSql}`,
    values
  );
  const total = Number(totalResult.rows[0]?.count ?? 0);

  const limitValues = [...values, pageSize, offset];
  const rowsResult = await query<EvaluationRow>(
    `select * from compliance_evaluations
      ${whereSql}
      order by evaluated_at desc, created_at desc
      limit $${limitValues.length - 1} offset $${limitValues.length}`,
    limitValues
  );

  const evaluations = rowsResult.rows.map(mapEvaluationRow).filter((row): row is ComplianceEvaluationRecord => row !== null);
  const checksByEvaluation = await loadChecksByEvaluationIds(evaluations.map((evaluation) => evaluation.id));
  const items = evaluations.map((evaluation) => ({ ...evaluation, checks: checksByEvaluation.get(evaluation.id) ?? [] }));

  return { items, total, page, pageSize };
}

/** Detalhe de UMA avaliação (com checks) — filtra por conta, mesma disciplina de tenancy do repositório. */
export async function getEvaluationById(
  evaluationId: string,
  integrationAccountId: string
): Promise<ComplianceEvaluationWithChecks | null> {
  const result = await query<EvaluationRow>(
    'select * from compliance_evaluations where id = $1 and integration_account_id = $2',
    [evaluationId, integrationAccountId]
  );
  const evaluation = mapEvaluationRow(result.rows[0]);
  if (!evaluation) return null;

  const checksByEvaluation = await loadChecksByEvaluationIds([evaluation.id]);
  return { ...evaluation, checks: checksByEvaluation.get(evaluation.id) ?? [] };
}

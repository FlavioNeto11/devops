/**
 * Repositório de `insurance_policies`/`risk_management_plans`/`insurance_verifications` (PR-F2,
 * DL-103, Lei 14.599/2023).
 *
 * TENANCY OBRIGATÓRIA (mesmo contrato de `transport-party-repo.ts`): toda leitura/escrita por id
 * filtra também por `integration_account_id`.
 *
 * `insurance_policies`/`risk_management_plans` usam locking otimista via `version` (molde
 * `transport-party-repo.ts#updatePartyById`) — distinguem 404 (inexistente NESTA conta) de 409
 * (existe, mas `version` está defasada). `insurance_verifications` é APPEND-ONLY: só `insert`,
 * nunca `update`/`delete` (molde `rntrc-verification-repo.ts`).
 *
 * "Vigente na data" (não "cadastrada"): `findApplicablePolicyForPartyAndType`/
 * `findApplicablePlanForParty` resolvem a linha que MELHOR cobre a `referenceDate` pedida — uma
 * apólice cuja janela `[valid_from, valid_until]` contém a data ganha prioridade; na ausência de
 * cobertura, cai para a mais recente por `valid_until`/`valid_from` (o motor de compliance
 * `rule-evaluators.ts#evaluateSeg00x/evaluatePgr001` decide o que fazer com uma linha que não cobre
 * a data — nunca este repositório).
 */

import type { PoolClient } from 'pg';
import { query } from '../db/pool.js';
import { AppError } from '../lib/problem.js';
import type {
  InsuranceEvidenceSource,
  InsurancePolicy,
  InsurancePolicyStatus,
  InsurancePolicyType,
  InsuranceVerification,
  InsuranceVerificationRequestedStatus,
  InsuranceVerificationStrategy,
  RiskManagementPlan,
  RiskManagementPlanEvidenceSource,
  RiskManagementPlanStatus
} from '../lib/transport/transport-insurance-types.js';

type DbClient = Pick<PoolClient, 'query'> | null;

function getQueryExecutor(client: DbClient = null) {
  return client?.query?.bind(client) || query;
}

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

function toJsonArray(value: unknown): string[] {
  return Array.isArray(value) ? value.map((entry) => String(entry)) : [];
}

const DEFAULT_PAGE_SIZE = 20;
const MAX_PAGE_SIZE = 200;

function normalizePagination(page?: number, pageSize?: number): { page: number; pageSize: number; offset: number } {
  const normalizedPage = Math.max(Math.floor(page ?? 1), 1);
  const normalizedPageSize = Math.min(Math.max(Math.floor(pageSize ?? DEFAULT_PAGE_SIZE), 1), MAX_PAGE_SIZE);
  return { page: normalizedPage, pageSize: normalizedPageSize, offset: (normalizedPage - 1) * normalizedPageSize };
}

// =================================================================================================
// 1. insurance_policies
// =================================================================================================

type PolicyRow = {
  id: string;
  integration_account_id: string;
  party_id: string;
  policy_type: string;
  insurer_name: string;
  insurer_document: string | null;
  policy_number: string;
  coverage_amount: string | number | null;
  valid_from: Date | string;
  valid_until: Date | string;
  status: string;
  evidence: unknown;
  evidence_source: string;
  correlation_id: string;
  version: number;
  created_at: Date | string;
  updated_at: Date | string;
};

function mapPolicyRow(row: PolicyRow | undefined): InsurancePolicy | null {
  if (!row) return null;
  return {
    id: row.id,
    integrationAccountId: row.integration_account_id,
    partyId: row.party_id,
    policyType: row.policy_type as InsurancePolicyType,
    insurerName: row.insurer_name,
    insurerDocument: row.insurer_document,
    policyNumber: row.policy_number,
    coverageAmount: row.coverage_amount == null ? null : Number(row.coverage_amount),
    validFrom: toIsoDateOnly(row.valid_from) ?? '',
    validUntil: toIsoDateOnly(row.valid_until) ?? '',
    status: row.status as InsurancePolicyStatus,
    evidence: toJsonObject(row.evidence),
    evidenceSource: row.evidence_source as InsuranceEvidenceSource,
    correlationId: row.correlation_id,
    version: Number(row.version ?? 1),
    createdAt: toIso(row.created_at) ?? '',
    updatedAt: toIso(row.updated_at) ?? ''
  };
}

export type PolicyInsertInput = {
  id: string;
  integrationAccountId: string;
  partyId: string;
  policyType: InsurancePolicyType;
  insurerName: string;
  insurerDocument?: string | null;
  policyNumber: string;
  coverageAmount?: number | null;
  validFrom: string;
  validUntil: string;
  status?: InsurancePolicyStatus;
  evidence?: Record<string, unknown>;
  evidenceSource: InsuranceEvidenceSource;
  correlationId: string;
};

export async function insertPolicy(input: PolicyInsertInput, client: DbClient = null): Promise<InsurancePolicy> {
  const execute = getQueryExecutor(client);
  const result = await execute<PolicyRow>(
    `insert into insurance_policies (
       id, integration_account_id, party_id, policy_type, insurer_name, insurer_document,
       policy_number, coverage_amount, valid_from, valid_until, status, evidence, evidence_source,
       correlation_id, version
     ) values (
       $1, $2, $3, $4, $5, $6, $7, $8, $9::date, $10::date, $11, $12::jsonb, $13, $14, 1
     )
     returning *`,
    [
      input.id,
      input.integrationAccountId,
      input.partyId,
      input.policyType,
      input.insurerName,
      input.insurerDocument ?? null,
      input.policyNumber,
      input.coverageAmount ?? null,
      input.validFrom,
      input.validUntil,
      input.status ?? 'active',
      JSON.stringify(input.evidence ?? {}),
      input.evidenceSource,
      input.correlationId
    ]
  );
  const row = mapPolicyRow(result.rows[0]);
  if (!row) {
    throw new AppError(500, 'Internal Server Error', `Falha ao inserir apólice ${input.id}.`, {
      code: 'TRANSPORT_INSURANCE_POLICY_INSERT_FAILED'
    });
  }
  return row;
}

export type PolicyListFilters = {
  policyType?: InsurancePolicyType;
  page?: number;
  pageSize?: number;
};

export async function listPoliciesForParty(
  partyId: string,
  integrationAccountId: string,
  filters: PolicyListFilters = {},
  client: DbClient = null
): Promise<{ items: InsurancePolicy[]; total: number; page: number; pageSize: number }> {
  const execute = getQueryExecutor(client);
  const where = ['party_id = $1', 'integration_account_id = $2'];
  const values: unknown[] = [partyId, integrationAccountId];

  if (filters.policyType) {
    values.push(filters.policyType);
    where.push(`policy_type = $${values.length}`);
  }

  const whereSql = `where ${where.join(' and ')}`;
  const { page, pageSize, offset } = normalizePagination(filters.page, filters.pageSize);

  const totalResult = await execute<{ count: string }>(
    `select count(*)::text as count from insurance_policies ${whereSql}`,
    values
  );
  const total = Number(totalResult.rows[0]?.count ?? 0);

  const limitValues = [...values, pageSize, offset];
  const rowsResult = await execute<PolicyRow>(
    `select * from insurance_policies
      ${whereSql}
      order by valid_until desc, policy_type asc
      limit $${limitValues.length - 1} offset $${limitValues.length}`,
    limitValues
  );

  const items = rowsResult.rows.map(mapPolicyRow).filter((row): row is InsurancePolicy => row !== null);
  return { items, total, page, pageSize };
}

export async function getPolicyById(
  id: string,
  integrationAccountId: string,
  client: DbClient = null
): Promise<InsurancePolicy | null> {
  const execute = getQueryExecutor(client);
  const result = await execute<PolicyRow>(
    'select * from insurance_policies where id = $1 and integration_account_id = $2',
    [id, integrationAccountId]
  );
  return mapPolicyRow(result.rows[0]);
}

/**
 * A apólice que MELHOR cobre `referenceDate` para este tipo (`policy_type`) — janela
 * `[valid_from, valid_until]` contendo a data ganha prioridade; sem cobertura, cai para a mais
 * recente por `valid_until`. Só considera `status = 'active'` (administrativo) — `cancelled`/
 * `expired_marked` nunca "cobrem" nada, mesmo com janela de datas compatível.
 */
export async function findApplicablePolicyForPartyAndType(
  partyId: string,
  integrationAccountId: string,
  policyType: InsurancePolicyType,
  referenceDate: string,
  client: DbClient = null
): Promise<InsurancePolicy | null> {
  const execute = getQueryExecutor(client);
  const result = await execute<PolicyRow>(
    `select * from insurance_policies
      where party_id = $1
        and integration_account_id = $2
        and policy_type = $3
        and status = 'active'
      order by (valid_from <= $4::date and valid_until >= $4::date) desc, valid_until desc
      limit 1`,
    [partyId, integrationAccountId, policyType, referenceDate]
  );
  return mapPolicyRow(result.rows[0]);
}

/** Chave natural completa (`uq_inspol_account_party_type_number`) — usada pelo upsert de `POST .../apolices/verificar`. */
export async function findPolicyByNaturalKey(
  integrationAccountId: string,
  partyId: string,
  policyType: InsurancePolicyType,
  policyNumber: string,
  client: DbClient = null
): Promise<InsurancePolicy | null> {
  const execute = getQueryExecutor(client);
  const result = await execute<PolicyRow>(
    `select * from insurance_policies
      where integration_account_id = $1 and party_id = $2 and policy_type = $3 and policy_number = $4`,
    [integrationAccountId, partyId, policyType, policyNumber]
  );
  return mapPolicyRow(result.rows[0]);
}

export type PolicyUpdatePatch = Partial<Pick<
  InsurancePolicy,
  | 'insurerName'
  | 'insurerDocument'
  | 'coverageAmount'
  | 'validFrom'
  | 'validUntil'
  | 'status'
  | 'evidence'
>>;

async function policyNotFoundOrConflict(
  id: string,
  integrationAccountId: string,
  expectedVersion: number,
  client: DbClient
): Promise<never> {
  const execute = getQueryExecutor(client);
  const existing = await execute<{ version: number }>(
    'select version from insurance_policies where id = $1 and integration_account_id = $2',
    [id, integrationAccountId]
  );
  if ((existing.rowCount ?? 0) === 0) {
    throw new AppError(404, 'Not Found', `Apólice ${id} não encontrada.`, {
      code: 'TRANSPORT_INSURANCE_POLICY_NOT_FOUND'
    });
  }
  throw new AppError(
    409,
    'Conflict',
    `Apólice ${id} foi modificada por outro processo (esperado version=${expectedVersion}, atual=${existing.rows[0]?.version}).`,
    { code: 'TRANSPORT_INSURANCE_POLICY_VERSION_CONFLICT' }
  );
}

export async function updatePolicyById(
  id: string,
  integrationAccountId: string,
  expectedVersion: number,
  patch: PolicyUpdatePatch,
  client: DbClient = null
): Promise<InsurancePolicy> {
  const execute = getQueryExecutor(client);
  const sets: string[] = [];
  const values: unknown[] = [id, integrationAccountId, expectedVersion];

  function pushSet(column: string, value: unknown, cast = '') {
    values.push(value);
    sets.push(`${column} = $${values.length}${cast}`);
  }

  if (patch.insurerName !== undefined) pushSet('insurer_name', patch.insurerName);
  if (patch.insurerDocument !== undefined) pushSet('insurer_document', patch.insurerDocument);
  if (patch.coverageAmount !== undefined) pushSet('coverage_amount', patch.coverageAmount);
  if (patch.validFrom !== undefined) pushSet('valid_from', patch.validFrom, '::date');
  if (patch.validUntil !== undefined) pushSet('valid_until', patch.validUntil, '::date');
  if (patch.status !== undefined) pushSet('status', patch.status);
  if (patch.evidence !== undefined) pushSet('evidence', JSON.stringify(patch.evidence), '::jsonb');

  if (sets.length === 0) {
    const current = await execute<PolicyRow>(
      'select * from insurance_policies where id = $1 and integration_account_id = $2 and version = $3',
      [id, integrationAccountId, expectedVersion]
    );
    const row = mapPolicyRow(current.rows[0]);
    if (!row) return policyNotFoundOrConflict(id, integrationAccountId, expectedVersion, client);
    return row;
  }

  // Trigger `trg_insurance_policies_version` cuida do bump de version e updated_at.
  const result = await execute<PolicyRow>(
    `update insurance_policies
        set ${sets.join(', ')}
      where id = $1
        and integration_account_id = $2
        and version = $3
      returning *`,
    values
  );

  const row = mapPolicyRow(result.rows[0]);
  if (!row) return policyNotFoundOrConflict(id, integrationAccountId, expectedVersion, client);
  return row;
}

/** Apólices da CONTA vencendo entre `referenceDate` e `referenceDate + windowDays` (status administrativo `active`). */
export async function listPoliciesExpiringSoon(
  integrationAccountId: string,
  referenceDate: string,
  windowDays: number,
  client: DbClient = null
): Promise<Array<InsurancePolicy & { partyLegalName: string }>> {
  const execute = getQueryExecutor(client);
  const result = await execute<PolicyRow & { party_legal_name: string }>(
    `select p.*, tp.legal_name as party_legal_name
       from insurance_policies p
       join transport_parties tp on tp.id = p.party_id
      where p.integration_account_id = $1
        and p.status = 'active'
        and p.valid_until >= $2::date
        and p.valid_until <= ($2::date + make_interval(days => $3))
      order by p.valid_until asc`,
    [integrationAccountId, referenceDate, windowDays]
  );
  return result.rows
    .map((row) => {
      const mapped = mapPolicyRow(row);
      return mapped ? { ...mapped, partyLegalName: row.party_legal_name } : null;
    })
    .filter((row): row is InsurancePolicy & { partyLegalName: string } => row !== null);
}

/**
 * Apólices JÁ VENCIDAS (status administrativo `active`, `valid_until` < `referenceDate`) que ainda
 * têm PELO MENOS UMA operação NÃO-TERMINAL em aberto vinculada ao mesmo transportador como
 * `carrier` — é o alerta acionável do Centro Operacional ("esta apólice venceu e ainda há operação
 * dependendo dela"), não um relatório genérico de "toda apólice vencida" (isso seria ruído: uma
 * apólice vencida de uma operação já `completed`/`cancelled` não exige ação).
 */
export async function listExpiredPoliciesWithOpenOperations(
  integrationAccountId: string,
  referenceDate: string,
  client: DbClient = null
): Promise<Array<InsurancePolicy & { partyLegalName: string; openOperationIds: string[] }>> {
  const execute = getQueryExecutor(client);
  const result = await execute<PolicyRow & { party_legal_name: string; open_operation_ids: string[] | null }>(
    `select p.*, tp.legal_name as party_legal_name, array_agg(distinct top.operation_id) as open_operation_ids
       from insurance_policies p
       join transport_parties tp on tp.id = p.party_id
       join transport_operation_parties top
         on top.party_id = p.party_id and top.role = 'carrier'
       join transport_operations top_op
         on top_op.id = top.operation_id
        and top_op.integration_account_id = p.integration_account_id
        and top_op.status not in ('completed', 'cancelled')
      where p.integration_account_id = $1
        and p.status = 'active'
        and p.valid_until < $2::date
      group by p.id, tp.legal_name
      order by p.valid_until asc`,
    [integrationAccountId, referenceDate]
  );
  return result.rows
    .map((row) => {
      const mapped = mapPolicyRow(row);
      if (!mapped) return null;
      return {
        ...mapped,
        partyLegalName: row.party_legal_name,
        openOperationIds: (row.open_operation_ids ?? []).filter((entry) => entry != null)
      };
    })
    .filter((row): row is InsurancePolicy & { partyLegalName: string; openOperationIds: string[] } => row !== null);
}

// =================================================================================================
// 2. risk_management_plans (PGR)
// =================================================================================================

type PlanRow = {
  id: string;
  integration_account_id: string;
  party_id: string;
  plan_reference: string;
  version_label: string;
  valid_from: Date | string;
  valid_until: Date | string | null;
  status: string;
  evidence: unknown;
  evidence_source: string;
  related_policy_types: unknown;
  correlation_id: string;
  version: number;
  created_at: Date | string;
  updated_at: Date | string;
};

function mapPlanRow(row: PlanRow | undefined): RiskManagementPlan | null {
  if (!row) return null;
  return {
    id: row.id,
    integrationAccountId: row.integration_account_id,
    partyId: row.party_id,
    planReference: row.plan_reference,
    versionLabel: row.version_label,
    validFrom: toIsoDateOnly(row.valid_from) ?? '',
    validUntil: toIsoDateOnly(row.valid_until),
    status: row.status as RiskManagementPlanStatus,
    evidence: toJsonObject(row.evidence),
    evidenceSource: row.evidence_source as RiskManagementPlanEvidenceSource,
    relatedPolicyTypes: toJsonArray(row.related_policy_types) as InsurancePolicyType[],
    correlationId: row.correlation_id,
    version: Number(row.version ?? 1),
    createdAt: toIso(row.created_at) ?? '',
    updatedAt: toIso(row.updated_at) ?? ''
  };
}

export type PlanInsertInput = {
  id: string;
  integrationAccountId: string;
  partyId: string;
  planReference: string;
  versionLabel?: string;
  validFrom: string;
  validUntil?: string | null;
  status?: RiskManagementPlanStatus;
  evidence?: Record<string, unknown>;
  evidenceSource: RiskManagementPlanEvidenceSource;
  relatedPolicyTypes?: InsurancePolicyType[];
  correlationId: string;
};

export async function insertRiskManagementPlan(input: PlanInsertInput, client: DbClient = null): Promise<RiskManagementPlan> {
  const execute = getQueryExecutor(client);
  const result = await execute<PlanRow>(
    `insert into risk_management_plans (
       id, integration_account_id, party_id, plan_reference, version_label, valid_from, valid_until,
       status, evidence, evidence_source, related_policy_types, correlation_id, version
     ) values (
       $1, $2, $3, $4, $5, $6::date, $7::date, $8, $9::jsonb, $10, $11::jsonb, $12, 1
     )
     returning *`,
    [
      input.id,
      input.integrationAccountId,
      input.partyId,
      input.planReference,
      input.versionLabel ?? '',
      input.validFrom,
      input.validUntil ?? null,
      input.status ?? 'active',
      JSON.stringify(input.evidence ?? {}),
      input.evidenceSource,
      JSON.stringify(input.relatedPolicyTypes ?? ['RCTR_C', 'RC_DC']),
      input.correlationId
    ]
  );
  const row = mapPlanRow(result.rows[0]);
  if (!row) {
    throw new AppError(500, 'Internal Server Error', `Falha ao inserir PGR ${input.id}.`, {
      code: 'TRANSPORT_PGR_INSERT_FAILED'
    });
  }
  return row;
}

export async function listPlansForParty(
  partyId: string,
  integrationAccountId: string,
  client: DbClient = null
): Promise<RiskManagementPlan[]> {
  const execute = getQueryExecutor(client);
  const result = await execute<PlanRow>(
    `select * from risk_management_plans
      where party_id = $1 and integration_account_id = $2
      order by valid_from desc`,
    [partyId, integrationAccountId]
  );
  return result.rows.map(mapPlanRow).filter((row): row is RiskManagementPlan => row !== null);
}

export async function getPlanById(
  id: string,
  integrationAccountId: string,
  client: DbClient = null
): Promise<RiskManagementPlan | null> {
  const execute = getQueryExecutor(client);
  const result = await execute<PlanRow>(
    'select * from risk_management_plans where id = $1 and integration_account_id = $2',
    [id, integrationAccountId]
  );
  return mapPlanRow(result.rows[0]);
}

/** O PGR que MELHOR cobre `referenceDate` — mesmo racional de `findApplicablePolicyForPartyAndType`. */
export async function findApplicablePlanForParty(
  partyId: string,
  integrationAccountId: string,
  referenceDate: string,
  client: DbClient = null
): Promise<RiskManagementPlan | null> {
  const execute = getQueryExecutor(client);
  const result = await execute<PlanRow>(
    `select * from risk_management_plans
      where party_id = $1
        and integration_account_id = $2
        and status = 'active'
      order by (valid_from <= $3::date and (valid_until is null or valid_until >= $3::date)) desc, valid_from desc
      limit 1`,
    [partyId, integrationAccountId, referenceDate]
  );
  return mapPlanRow(result.rows[0]);
}

// =================================================================================================
// 3. insurance_verifications — APPEND-ONLY (mesmo racional de `rntrc-verification-repo.ts`)
// =================================================================================================

type VerificationRow = {
  id: string;
  integration_account_id: string;
  party_id: string;
  policy_id: string | null;
  strategy: string;
  requested_status: string;
  result: unknown;
  verified_by: string | null;
  verified_at: Date | string;
  correlation_id: string;
  created_at: Date | string;
};

function mapVerificationRow(row: VerificationRow | undefined): InsuranceVerification | null {
  if (!row) return null;
  return {
    id: row.id,
    integrationAccountId: row.integration_account_id,
    partyId: row.party_id,
    policyId: row.policy_id,
    strategy: row.strategy as InsuranceVerificationStrategy,
    requestedStatus: row.requested_status as InsuranceVerificationRequestedStatus,
    result: toJsonObject(row.result),
    verifiedBy: row.verified_by,
    verifiedAt: toIso(row.verified_at) ?? '',
    correlationId: row.correlation_id,
    createdAt: toIso(row.created_at) ?? ''
  };
}

export type VerificationInsertInput = {
  id: string;
  integrationAccountId: string;
  partyId: string;
  policyId?: string | null;
  strategy: InsuranceVerificationStrategy;
  requestedStatus?: InsuranceVerificationRequestedStatus;
  result?: Record<string, unknown>;
  verifiedBy?: string | null;
  correlationId: string;
};

export async function insertInsuranceVerification(
  input: VerificationInsertInput,
  client: DbClient = null
): Promise<InsuranceVerification> {
  const execute = getQueryExecutor(client);
  const result = await execute<VerificationRow>(
    `insert into insurance_verifications (
       id, integration_account_id, party_id, policy_id, strategy, requested_status, result,
       verified_by, correlation_id
     ) values (
       $1, $2, $3, $4, $5, $6, $7::jsonb, $8, $9
     )
     returning *`,
    [
      input.id,
      input.integrationAccountId,
      input.partyId,
      input.policyId ?? null,
      input.strategy,
      input.requestedStatus ?? 'succeeded',
      JSON.stringify(input.result ?? {}),
      input.verifiedBy ?? null,
      input.correlationId
    ]
  );
  const row = mapVerificationRow(result.rows[0]);
  if (!row) {
    throw new AppError(500, 'Internal Server Error', `Falha ao inserir verificação de seguro ${input.id}.`, {
      code: 'TRANSPORT_INSURANCE_VERIFICATION_INSERT_FAILED'
    });
  }
  return row;
}

export async function listVerificationsForParty(
  partyId: string,
  integrationAccountId: string,
  client: DbClient = null
): Promise<InsuranceVerification[]> {
  const execute = getQueryExecutor(client);
  const result = await execute<VerificationRow>(
    `select * from insurance_verifications
      where party_id = $1 and integration_account_id = $2
      order by created_at desc`,
    [partyId, integrationAccountId]
  );
  return result.rows.map(mapVerificationRow).filter((row): row is InsuranceVerification => row !== null);
}

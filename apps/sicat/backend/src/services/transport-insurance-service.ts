/**
 * Service de seguros obrigatórios do transportador (RCTR-C/RC-DC/RC-V) e PGR (PR-F2, DL-103, Lei
 * 14.599/2023).
 *
 * TUDO síncrono (200/201) — sem job novo: a verificação via provedor (`insurance-verification-
 * provider.ts`) hoje só tem `mode: 'mock'`, que é rápida o bastante para não justificar 202/fila
 * (molde `manual` de `transport-rntrc-verification-service.ts`, não o `open_data` assíncrono dele —
 * quando existir integração real com seguradora/ANTT, [EXTERNAL DEPENDENCY] P8, um novo PR decide
 * se aquela chamada específica precisa virar job).
 *
 * VIGÊNCIA NA DATA DA OPERAÇÃO, não "cadastrada" (mesmo racional de RNTRC, pendência P4 do guia):
 * `isCurrentlyValid`/`daysToExpiry` nos resources deste service são computados contra HOJE (visão
 * humana, para listagem/alerta) — o motor de compliance (`rule-evaluators.ts#evaluateSeg00x`)
 * computa a mesma coisa contra a `referenceDate` da OPERAÇÃO, que pode ser outra data.
 *
 * LGPD: `evidence` é sempre um objeto MÍNIMO (`sanitizeEvidence` abaixo) — nunca aceita o body
 * inteiro do request como evidência; nunca guarda condições comerciais completas (franquia,
 * cláusulas, prêmio), só o que sustenta a apólice/PGR (número/vigência/tipo/nota curta).
 */

import { withTransaction } from '../db/pool.js';
import { AppError } from '../lib/problem.js';
import { createPrefixedId } from '../lib/ids.js';
import { getPartyById } from '../repositories/transport-party-repo.js';
import {
  findPolicyByNaturalKey,
  getPolicyById,
  insertInsuranceVerification,
  insertPolicy,
  insertRiskManagementPlan,
  listExpiredPoliciesWithOpenOperations,
  listPlansForParty,
  listPoliciesExpiringSoon,
  listPoliciesForParty,
  updatePolicyById,
  type PolicyInsertInput,
  type PolicyListFilters,
  type PolicyUpdatePatch
} from '../repositories/transport-insurance-repo.js';
import {
  INSURANCE_POLICY_TYPES,
  INSURANCE_POLICY_STATUSES,
  RISK_MANAGEMENT_PLAN_STATUSES,
  type InsuranceEvidenceSource,
  type InsurancePolicy,
  type InsurancePolicyStatus,
  type InsurancePolicyType,
  type RiskManagementPlan,
  type RiskManagementPlanStatus
} from '../lib/transport/transport-insurance-types.js';
import {
  createInsuranceVerificationProvider,
  type InsuranceVerificationProvider
} from '../gateways/insurance-verification-provider.js';

type LooseRecord = Record<string, unknown>;
type CommandContext = { correlationId: string; evaluatedBy: string | null };

// =============================================================================
// Helpers locais — deliberadamente não compartilhados com outros services (molde
// `transport-compliance-service.ts`/`transport-ciot-service.ts`: cada service da vertical duplica
// o mínimo de validação de entrada).
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
    'TRANSPORT_INSURANCE_FIELD_REQUIRED'
  );
}

function requireVersion(source: LooseRecord, code: string): number {
  const raw = source.version;
  const num = Number(raw);
  if (!Number.isFinite(num) || !Number.isInteger(num) || num < 1) {
    throw new AppError(400, 'Bad Request', 'version é obrigatório e deve ser um inteiro >= 1.', { code });
  }
  return num;
}

const DATE_REGEX = /^\d{4}-\d{2}-\d{2}$/;

function requireDate(value: unknown, field: string, code: string): string {
  if (typeof value !== 'string' || !DATE_REGEX.test(value)) {
    throw new AppError(400, 'Bad Request', `${field} inválido: esperado formato YYYY-MM-DD (recebido "${String(value)}").`, {
      code,
      context: { field, value }
    });
  }
  return value;
}

function toOptionalDate(value: unknown, field: string, code: string): string | null {
  if (value === null || value === undefined || value === '') return null;
  return requireDate(value, field, code);
}

/** Hoje em 'YYYY-MM-DD' no fuso LOCAL do processo — mesmo padrão de `transporte-regras-service.ts`/`transport-compliance-service.ts`. */
function todayIsoDate(): string {
  const now = new Date();
  const year = now.getFullYear();
  const month = String(now.getMonth() + 1).padStart(2, '0');
  const day = String(now.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

function daysBetweenDates(fromDate: string, toDate: string): number {
  const fromMs = new Date(`${fromDate}T00:00:00Z`).getTime();
  const toMs = new Date(`${toDate}T00:00:00Z`).getTime();
  return Math.floor((toMs - fromMs) / 86400000);
}

/** LGPD: evidência MÍNIMA — só `notes` (nota curta, cap defensivo) e `documentRef` (referência a um anexo, nunca o anexo em si). Qualquer outra chave do body é descartada. */
function sanitizeEvidence(raw: unknown): Record<string, unknown> {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return {};
  const source = raw as LooseRecord;
  const evidence: LooseRecord = {};
  const notes = toTrimmedString(source.notes);
  if (notes) evidence.notes = notes.slice(0, 500);
  const documentRef = toTrimmedString(source.documentRef);
  if (documentRef) evidence.documentRef = documentRef.slice(0, 200);
  return evidence;
}

function validatePolicyType(value: unknown): InsurancePolicyType {
  if (!INSURANCE_POLICY_TYPES.includes(value as InsurancePolicyType)) {
    throw new AppError(400, 'Bad Request', `policyType inválido: esperado um de ${INSURANCE_POLICY_TYPES.join(', ')} (recebido "${String(value)}").`, {
      code: 'TRANSPORT_INSURANCE_POLICY_TYPE_INVALID',
      context: { value, allowed: INSURANCE_POLICY_TYPES }
    });
  }
  return value as InsurancePolicyType;
}

function validatePolicyStatus(value: unknown): InsurancePolicyStatus {
  if (value === undefined || value === null || value === '') return 'active';
  if (!INSURANCE_POLICY_STATUSES.includes(value as InsurancePolicyStatus)) {
    throw new AppError(400, 'Bad Request', `status inválido: esperado um de ${INSURANCE_POLICY_STATUSES.join(', ')} (recebido "${String(value)}").`, {
      code: 'TRANSPORT_INSURANCE_POLICY_STATUS_INVALID',
      context: { value, allowed: INSURANCE_POLICY_STATUSES }
    });
  }
  return value as InsurancePolicyStatus;
}

function validatePlanStatus(value: unknown): RiskManagementPlanStatus {
  if (value === undefined || value === null || value === '') return 'active';
  if (!RISK_MANAGEMENT_PLAN_STATUSES.includes(value as RiskManagementPlanStatus)) {
    throw new AppError(400, 'Bad Request', `status inválido: esperado um de ${RISK_MANAGEMENT_PLAN_STATUSES.join(', ')} (recebido "${String(value)}").`, {
      code: 'TRANSPORT_PGR_STATUS_INVALID',
      context: { value, allowed: RISK_MANAGEMENT_PLAN_STATUSES }
    });
  }
  return value as RiskManagementPlanStatus;
}

function validateCoverageAmount(value: unknown): number | null {
  if (value === null || value === undefined || value === '') return null;
  const num = Number(value);
  if (!Number.isFinite(num) || num < 0) {
    throw new AppError(400, 'Bad Request', `coverageAmount inválido: esperado um número >= 0 (recebido "${String(value)}").`, {
      code: 'TRANSPORT_INSURANCE_POLICY_COVERAGE_INVALID',
      context: { value }
    });
  }
  return num;
}

function validateRelatedPolicyTypes(value: unknown): InsurancePolicyType[] {
  if (value === undefined || value === null) return ['RCTR_C', 'RC_DC'];
  if (!Array.isArray(value)) {
    throw new AppError(400, 'Bad Request', 'relatedPolicyTypes deve ser um array.', {
      code: 'TRANSPORT_PGR_RELATED_POLICY_TYPES_INVALID'
    });
  }
  const unique = new Set<InsurancePolicyType>();
  for (const entry of value) {
    unique.add(validatePolicyType(entry));
  }
  return [...unique];
}

function getPgErrorCode(error: unknown): string | null {
  if (error && typeof error === 'object' && 'code' in error && typeof (error as { code?: unknown }).code === 'string') {
    return (error as { code: string }).code;
  }
  return null;
}

function partyNotFound(partyId: string): AppError {
  return new AppError(404, 'Not Found', `Transportador ${partyId} não encontrado.`, {
    code: 'TRANSPORT_PARTY_NOT_FOUND'
  });
}

function policyNotFoundForParty(partyId: string, policyId: string): AppError {
  return new AppError(404, 'Not Found', `Apólice ${policyId} não encontrada para o transportador ${partyId}.`, {
    code: 'TRANSPORT_INSURANCE_POLICY_NOT_FOUND'
  });
}

function policyDuplicateError(): AppError {
  return new AppError(409, 'Conflict', 'Já existe uma apólice com este tipo e número para este transportador.', {
    code: 'TRANSPORT_INSURANCE_POLICY_DUPLICATE'
  });
}

function planDuplicateError(): AppError {
  return new AppError(409, 'Conflict', 'Já existe um PGR com esta referência para este transportador.', {
    code: 'TRANSPORT_PGR_DUPLICATE'
  });
}

// =============================================================================
// DTOs
// =============================================================================

type PolicyResource = {
  id: string;
  version: number;
  integrationAccountId: string;
  partyId: string;
  policyType: InsurancePolicyType;
  insurerName: string;
  insurerDocument: string | null;
  policyNumber: string;
  coverageAmount: number | null;
  validFrom: string;
  validUntil: string;
  status: InsurancePolicyStatus;
  evidenceSource: InsuranceEvidenceSource;
  /** Derivado contra HOJE (visão humana) — o motor de compliance deriva o mesmo contra a `referenceDate` da operação. */
  isCurrentlyValid: boolean;
  daysToExpiry: number;
  createdAt: string;
  updatedAt: string;
};

function toPolicyResource(policy: InsurancePolicy, today: string): PolicyResource {
  const isCurrentlyValid = policy.status === 'active' && policy.validFrom <= today && policy.validUntil >= today;
  return {
    id: policy.id,
    version: policy.version,
    integrationAccountId: policy.integrationAccountId,
    partyId: policy.partyId,
    policyType: policy.policyType,
    insurerName: policy.insurerName,
    insurerDocument: policy.insurerDocument,
    policyNumber: policy.policyNumber,
    coverageAmount: policy.coverageAmount,
    validFrom: policy.validFrom,
    validUntil: policy.validUntil,
    status: policy.status,
    evidenceSource: policy.evidenceSource,
    isCurrentlyValid,
    daysToExpiry: daysBetweenDates(today, policy.validUntil),
    createdAt: policy.createdAt,
    updatedAt: policy.updatedAt
  };
}

type PlanResource = {
  id: string;
  version: number;
  integrationAccountId: string;
  partyId: string;
  planReference: string;
  versionLabel: string;
  validFrom: string;
  validUntil: string | null;
  status: RiskManagementPlanStatus;
  evidenceSource: string;
  relatedPolicyTypes: InsurancePolicyType[];
  isCurrentlyValid: boolean;
  createdAt: string;
  updatedAt: string;
};

function toPlanResource(plan: RiskManagementPlan, today: string): PlanResource {
  const isCurrentlyValid = plan.status === 'active' && plan.validFrom <= today && (plan.validUntil == null || plan.validUntil >= today);
  return {
    id: plan.id,
    version: plan.version,
    integrationAccountId: plan.integrationAccountId,
    partyId: plan.partyId,
    planReference: plan.planReference,
    versionLabel: plan.versionLabel,
    validFrom: plan.validFrom,
    validUntil: plan.validUntil,
    status: plan.status,
    evidenceSource: plan.evidenceSource,
    relatedPolicyTypes: plan.relatedPolicyTypes,
    isCurrentlyValid,
    createdAt: plan.createdAt,
    updatedAt: plan.updatedAt
  };
}

// =============================================================================
// POST /v1/transporte/transportadores/{partyId}/apolices
// =============================================================================

export async function createInsurancePolicyService(
  partyId: string,
  body: LooseRecord,
  ctx: CommandContext
): Promise<PolicyResource> {
  const integrationAccountId = requireIntegrationAccountId(body);
  const party = await getPartyById(partyId, integrationAccountId);
  if (!party) throw partyNotFound(partyId);

  const policyType = validatePolicyType(body.policyType);
  const insurerName = requireNonEmptyString(body.insurerName, 'insurerName é obrigatório.', 'TRANSPORT_INSURANCE_FIELD_REQUIRED');
  const insurerDocument = toTrimmedString(body.insurerDocument);
  const policyNumber = requireNonEmptyString(body.policyNumber, 'policyNumber é obrigatório.', 'TRANSPORT_INSURANCE_FIELD_REQUIRED');
  const coverageAmount = validateCoverageAmount(body.coverageAmount);
  const validFrom = requireDate(body.validFrom, 'validFrom', 'TRANSPORT_INSURANCE_FIELD_REQUIRED');
  const validUntil = requireDate(body.validUntil, 'validUntil', 'TRANSPORT_INSURANCE_FIELD_REQUIRED');
  if (validUntil < validFrom) {
    throw new AppError(400, 'Bad Request', `validUntil (${validUntil}) não pode ser anterior a validFrom (${validFrom}).`, {
      code: 'TRANSPORT_INSURANCE_POLICY_PERIOD_INVALID'
    });
  }
  const status = validatePolicyStatus(body.status);
  const evidence = sanitizeEvidence(body.evidence);

  const policyId = createPrefixedId('inspol');
  const verificationId = createPrefixedId('insver');

  try {
    const policy = await withTransaction(async (client) => {
      const inserted = await insertPolicy(
        {
          id: policyId,
          integrationAccountId,
          partyId,
          policyType,
          insurerName,
          insurerDocument,
          policyNumber,
          coverageAmount,
          validFrom,
          validUntil,
          status,
          evidence,
          evidenceSource: 'manual',
          correlationId: ctx.correlationId
        },
        client
      );

      await insertInsuranceVerification(
        {
          id: verificationId,
          integrationAccountId,
          partyId,
          policyId: inserted.id,
          strategy: 'manual',
          requestedStatus: 'succeeded',
          result: { policyType, policyNumber, validFrom, validUntil, status },
          verifiedBy: ctx.evaluatedBy,
          correlationId: ctx.correlationId
        },
        client
      );

      return inserted;
    });

    return toPolicyResource(policy, todayIsoDate());
  } catch (error) {
    if (getPgErrorCode(error) === '23505') throw policyDuplicateError();
    throw error;
  }
}

// =============================================================================
// GET /v1/transporte/transportadores/{partyId}/apolices
// =============================================================================

export async function listInsurancePoliciesService(
  partyId: string,
  query: LooseRecord
): Promise<{ items: PolicyResource[]; total: number; page: number; pageSize: number }> {
  const integrationAccountId = requireIntegrationAccountId(query);
  const party = await getPartyById(partyId, integrationAccountId);
  if (!party) throw partyNotFound(partyId);

  const filters: PolicyListFilters = {
    policyType: query.policyType ? validatePolicyType(query.policyType) : undefined,
    page: query.page !== undefined ? Number(query.page) : undefined,
    pageSize: query.pageSize !== undefined ? Number(query.pageSize) : undefined
  };

  const { items, total, page, pageSize } = await listPoliciesForParty(partyId, integrationAccountId, filters);
  const today = todayIsoDate();
  return { items: items.map((policy) => toPolicyResource(policy, today)), total, page, pageSize };
}

// =============================================================================
// PATCH /v1/transporte/transportadores/{partyId}/apolices/{policyId}
// =============================================================================

export async function updateInsurancePolicyService(
  partyId: string,
  policyId: string,
  body: LooseRecord,
  ctx: CommandContext
): Promise<PolicyResource> {
  const integrationAccountId = requireIntegrationAccountId(body);
  const expectedVersion = requireVersion(body, 'TRANSPORT_INSURANCE_FIELD_REQUIRED');

  const existing = await getPolicyById(policyId, integrationAccountId);
  if (!existing || existing.partyId !== partyId) throw policyNotFoundForParty(partyId, policyId);

  const patch: PolicyUpdatePatch = {};
  if (body.insurerName !== undefined) {
    patch.insurerName = requireNonEmptyString(body.insurerName, 'insurerName não pode ser vazio.', 'TRANSPORT_INSURANCE_FIELD_REQUIRED');
  }
  if (body.insurerDocument !== undefined) patch.insurerDocument = toTrimmedString(body.insurerDocument);
  if (body.coverageAmount !== undefined) patch.coverageAmount = validateCoverageAmount(body.coverageAmount);
  if (body.status !== undefined) patch.status = validatePolicyStatus(body.status);
  if (body.evidence !== undefined) patch.evidence = sanitizeEvidence(body.evidence);

  const nextValidFrom = body.validFrom !== undefined
    ? requireDate(body.validFrom, 'validFrom', 'TRANSPORT_INSURANCE_FIELD_REQUIRED')
    : null;
  const nextValidUntil = body.validUntil !== undefined
    ? requireDate(body.validUntil, 'validUntil', 'TRANSPORT_INSURANCE_FIELD_REQUIRED')
    : null;
  if (nextValidFrom !== null) patch.validFrom = nextValidFrom;
  if (nextValidUntil !== null) patch.validUntil = nextValidUntil;

  const effectiveValidFrom = nextValidFrom ?? existing.validFrom;
  const effectiveValidUntil = nextValidUntil ?? existing.validUntil;
  if (effectiveValidUntil < effectiveValidFrom) {
    throw new AppError(400, 'Bad Request', `validUntil (${effectiveValidUntil}) não pode ser anterior a validFrom (${effectiveValidFrom}).`, {
      code: 'TRANSPORT_INSURANCE_POLICY_PERIOD_INVALID'
    });
  }

  // Alteração de vigência NUNCA é silenciosa — gera uma linha nova em `insurance_verifications`
  // com o resultado da alteração (append-only, prova de quando/quem/o que mudou).
  const validityChanged = nextValidFrom !== null || nextValidUntil !== null;

  try {
    const policy = await withTransaction(async (client) => {
      const updated = await updatePolicyById(policyId, integrationAccountId, expectedVersion, patch, client);

      if (validityChanged) {
        await insertInsuranceVerification(
          {
            id: createPrefixedId('insver'),
            integrationAccountId,
            partyId,
            policyId: updated.id,
            strategy: 'manual',
            requestedStatus: 'succeeded',
            result: {
              change: 'validity_updated',
              previousValidFrom: existing.validFrom,
              previousValidUntil: existing.validUntil,
              validFrom: updated.validFrom,
              validUntil: updated.validUntil
            },
            verifiedBy: ctx.evaluatedBy,
            correlationId: ctx.correlationId
          },
          client
        );
      }

      return updated;
    });

    return toPolicyResource(policy, todayIsoDate());
  } catch (error) {
    if (getPgErrorCode(error) === '23505') throw policyDuplicateError();
    throw error;
  }
}

// =============================================================================
// POST /v1/transporte/transportadores/{partyId}/apolices/verificar
// =============================================================================

type VerifyCarrierResource = {
  partyId: string;
  source: string;
  policies: PolicyResource[];
};

/**
 * Roda o provider (`mode` configurado via `INSURANCE_PROVIDER_MODE`, default `mock`) para o
 * transportador: para cada apólice encontrada, cria (chave natural nova) ou atualiza (chave natural
 * já existente) a linha em `insurance_policies` com `evidenceSource` = a origem do provider
 * (`mock`/`provider`/`antt`) e grava uma `insurance_verifications` por apólice tocada. `mode: 'antt'`
 * ou `'real'` lança `INSURANCE_PROVIDER_NOT_CONFIGURED` (501) — [EXTERNAL DEPENDENCY] P8.
 */
export async function verifyCarrierInsuranceService(
  partyId: string,
  body: LooseRecord,
  ctx: CommandContext,
  deps: { provider?: InsuranceVerificationProvider } = {}
): Promise<VerifyCarrierResource> {
  const integrationAccountId = requireIntegrationAccountId(body);
  const party = await getPartyById(partyId, integrationAccountId);
  if (!party) throw partyNotFound(partyId);

  const provider = deps.provider ?? createInsuranceVerificationProvider();
  const lookup = await provider.verifyCarrier({ partyDocument: party.documentNumber, rntrcNumber: party.rntrcNumber });

  if (lookup.policies.length === 0) {
    await insertInsuranceVerification({
      id: createPrefixedId('insver'),
      integrationAccountId,
      partyId,
      policyId: null,
      strategy: lookup.source,
      requestedStatus: 'succeeded',
      result: { found: false },
      verifiedBy: ctx.evaluatedBy,
      correlationId: ctx.correlationId
    });
    return { partyId, source: lookup.source, policies: [] };
  }

  const today = todayIsoDate();
  const resources: PolicyResource[] = [];

  for (const found of lookup.policies) {
    const policy = await withTransaction(async (client) => {
      const existing = await findPolicyByNaturalKey(integrationAccountId, partyId, found.policyType, found.policyNumber, client);

      const patch: PolicyInsertInput = {
        id: existing?.id ?? createPrefixedId('inspol'),
        integrationAccountId,
        partyId,
        policyType: found.policyType,
        insurerName: found.insurerName,
        policyNumber: found.policyNumber,
        coverageAmount: found.coverageAmount ?? null,
        validFrom: found.validFrom,
        validUntil: found.validUntil,
        status: 'active',
        evidence: { source: lookup.source },
        evidenceSource: lookup.source === 'mock' ? 'mock' : lookup.source === 'antt' ? 'antt' : 'provider',
        correlationId: ctx.correlationId
      };

      const saved = existing
        ? await updatePolicyById(
            existing.id,
            integrationAccountId,
            existing.version,
            {
              insurerName: patch.insurerName,
              coverageAmount: patch.coverageAmount,
              validFrom: patch.validFrom,
              validUntil: patch.validUntil,
              status: 'active',
              evidence: patch.evidence
            },
            client
          )
        : await insertPolicy(patch, client);

      await insertInsuranceVerification(
        {
          id: createPrefixedId('insver'),
          integrationAccountId,
          partyId,
          policyId: saved.id,
          strategy: patch.evidenceSource === 'mock' ? 'mock' : patch.evidenceSource === 'antt' ? 'antt' : 'provider',
          requestedStatus: 'succeeded',
          result: { found: true, policyType: found.policyType, policyNumber: found.policyNumber, validFrom: found.validFrom, validUntil: found.validUntil },
          verifiedBy: ctx.evaluatedBy,
          correlationId: ctx.correlationId
        },
        client
      );

      return saved;
    });

    resources.push(toPolicyResource(policy, today));
  }

  return { partyId, source: lookup.source, policies: resources };
}

// =============================================================================
// POST /v1/transporte/transportadores/{partyId}/pgr
// =============================================================================

export async function createRiskManagementPlanService(
  partyId: string,
  body: LooseRecord,
  ctx: CommandContext
): Promise<PlanResource> {
  const integrationAccountId = requireIntegrationAccountId(body);
  const party = await getPartyById(partyId, integrationAccountId);
  if (!party) throw partyNotFound(partyId);

  const planReference = requireNonEmptyString(body.planReference, 'planReference é obrigatório.', 'TRANSPORT_INSURANCE_FIELD_REQUIRED');
  const versionLabel = toTrimmedString(body.versionLabel) ?? '';
  const validFrom = requireDate(body.validFrom, 'validFrom', 'TRANSPORT_INSURANCE_FIELD_REQUIRED');
  const validUntil = toOptionalDate(body.validUntil, 'validUntil', 'TRANSPORT_INSURANCE_FIELD_REQUIRED');
  if (validUntil && validUntil < validFrom) {
    throw new AppError(400, 'Bad Request', `validUntil (${validUntil}) não pode ser anterior a validFrom (${validFrom}).`, {
      code: 'TRANSPORT_PGR_PERIOD_INVALID'
    });
  }
  const status = validatePlanStatus(body.status);
  const evidence = sanitizeEvidence(body.evidence);
  const relatedPolicyTypes = validateRelatedPolicyTypes(body.relatedPolicyTypes);

  const id = createPrefixedId('pgr');
  try {
    const plan = await insertRiskManagementPlan({
      id,
      integrationAccountId,
      partyId,
      planReference,
      versionLabel,
      validFrom,
      validUntil,
      status,
      evidence,
      evidenceSource: 'manual',
      relatedPolicyTypes,
      correlationId: ctx.correlationId
    });
    return toPlanResource(plan, todayIsoDate());
  } catch (error) {
    if (getPgErrorCode(error) === '23505') throw planDuplicateError();
    throw error;
  }
}

// =============================================================================
// GET /v1/transporte/transportadores/{partyId}/pgr
// =============================================================================

export async function listRiskManagementPlansService(
  partyId: string,
  query: LooseRecord
): Promise<{ items: PlanResource[]; totalItems: number }> {
  const integrationAccountId = requireIntegrationAccountId(query);
  const party = await getPartyById(partyId, integrationAccountId);
  if (!party) throw partyNotFound(partyId);

  const plans = await listPlansForParty(partyId, integrationAccountId);
  const today = todayIsoDate();
  const items = plans.map((plan) => toPlanResource(plan, today));
  return { items, totalItems: items.length };
}

// =============================================================================
// GET /v1/transporte/seguros/vencimentos
// =============================================================================

const DEFAULT_EXPIRATION_WINDOW_DAYS = 30;
const MAX_EXPIRATION_WINDOW_DAYS = 365;

type InsuranceExpirationAlert = {
  alertType: 'expiring_soon' | 'expired_with_open_operation';
  policyId: string;
  partyId: string;
  partyLegalName: string;
  policyType: InsurancePolicyType;
  policyNumber: string;
  validUntil: string;
  daysToExpiry: number;
  openOperationIds: string[];
};

function validateWindowDays(value: unknown): number {
  if (value === undefined || value === null || value === '') return DEFAULT_EXPIRATION_WINDOW_DAYS;
  const num = Number(value);
  if (!Number.isInteger(num) || num < 1 || num > MAX_EXPIRATION_WINDOW_DAYS) {
    throw new AppError(
      400,
      'Bad Request',
      `windowDays inválido: esperado um inteiro entre 1 e ${MAX_EXPIRATION_WINDOW_DAYS} (recebido "${String(value)}").`,
      { code: 'TRANSPORT_INSURANCE_WINDOW_DAYS_INVALID' }
    );
  }
  return num;
}

export async function listInsuranceExpirationAlertsService(query: LooseRecord): Promise<{
  items: InsuranceExpirationAlert[];
  total: number;
  windowDays: number;
  referenceDate: string;
}> {
  const integrationAccountId = requireIntegrationAccountId(query);
  const windowDays = validateWindowDays(query.windowDays);
  const referenceDate = todayIsoDate();

  const [expiringSoon, expiredWithOpenOperations] = await Promise.all([
    listPoliciesExpiringSoon(integrationAccountId, referenceDate, windowDays),
    listExpiredPoliciesWithOpenOperations(integrationAccountId, referenceDate)
  ]);

  const items: InsuranceExpirationAlert[] = [
    ...expiringSoon.map((policy) => ({
      alertType: 'expiring_soon' as const,
      policyId: policy.id,
      partyId: policy.partyId,
      partyLegalName: policy.partyLegalName,
      policyType: policy.policyType,
      policyNumber: policy.policyNumber,
      validUntil: policy.validUntil,
      daysToExpiry: daysBetweenDates(referenceDate, policy.validUntil),
      openOperationIds: []
    })),
    ...expiredWithOpenOperations.map((policy) => ({
      alertType: 'expired_with_open_operation' as const,
      policyId: policy.id,
      partyId: policy.partyId,
      partyLegalName: policy.partyLegalName,
      policyType: policy.policyType,
      policyNumber: policy.policyNumber,
      validUntil: policy.validUntil,
      daysToExpiry: daysBetweenDates(referenceDate, policy.validUntil),
      openOperationIds: policy.openOperationIds
    }))
  ].sort((a, b) => a.validUntil.localeCompare(b.validUntil));

  return { items, total: items.length, windowDays, referenceDate };
}

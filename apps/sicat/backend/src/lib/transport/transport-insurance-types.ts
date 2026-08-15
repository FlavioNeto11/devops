/**
 * Tipos e constantes dos seguros obrigatórios do transportador e do PGR (PR-F2, DL-103, Lei
 * 14.599/2023).
 *
 * Bounded context TRANSPORTE — espelha 1:1 os CHECKs da migration
 * `031_transport_insurance.sql` — mudou lá, muda aqui no mesmo PR (e vice-versa).
 *
 * Distinção central deste PR (mesmo racional de `rntrc-verification-types.ts`, pendência P4 do
 * guia): `status` em `insurance_policies`/`risk_management_plans` é ADMINISTRATIVO — a vigência
 * REAL, na data que importa (a data da OPERAÇÃO, não "hoje"), é sempre derivada de
 * `validFrom`/`validUntil` contra a `referenceDate` do gate (`rule-evaluators.ts`).
 */

export const INSURANCE_POLICY_TYPES = ['RCTR_C', 'RC_DC', 'RC_V'] as const;
export type InsurancePolicyType = (typeof INSURANCE_POLICY_TYPES)[number];

export const INSURANCE_POLICY_STATUSES = ['active', 'cancelled', 'expired_marked'] as const;
export type InsurancePolicyStatus = (typeof INSURANCE_POLICY_STATUSES)[number];

/** Fonte da evidência gravada na apólice — `provider`/`antt` reservadas para quando P8 for resolvida. */
export const INSURANCE_EVIDENCE_SOURCES = ['manual', 'provider', 'antt', 'mock'] as const;
export type InsuranceEvidenceSource = (typeof INSURANCE_EVIDENCE_SOURCES)[number];

export const RISK_MANAGEMENT_PLAN_STATUSES = ['active', 'superseded', 'cancelled'] as const;
export type RiskManagementPlanStatus = (typeof RISK_MANAGEMENT_PLAN_STATUSES)[number];

/** PGR só aceita evidência declarada — `provider`/`antt` não têm o que verificar (PGR não é um dado da ANTT). */
export const RISK_MANAGEMENT_PLAN_EVIDENCE_SOURCES = ['manual', 'mock'] as const;
export type RiskManagementPlanEvidenceSource = (typeof RISK_MANAGEMENT_PLAN_EVIDENCE_SOURCES)[number];

export const INSURANCE_VERIFICATION_STRATEGIES = ['manual', 'provider', 'antt', 'mock'] as const;
export type InsuranceVerificationStrategy = (typeof INSURANCE_VERIFICATION_STRATEGIES)[number];

/** Estratégias aceitas HOJE via API (`provider`/`antt` reservadas — sem credenciamento, P8). */
export const INSURANCE_VERIFICATION_REQUESTABLE_STRATEGIES = ['manual', 'mock'] as const;
export type InsuranceVerificationRequestableStrategy = (typeof INSURANCE_VERIFICATION_REQUESTABLE_STRATEGIES)[number];

export const INSURANCE_VERIFICATION_REQUESTED_STATUSES = ['pending', 'succeeded', 'failed'] as const;
export type InsuranceVerificationRequestedStatus = (typeof INSURANCE_VERIFICATION_REQUESTED_STATUSES)[number];

/** Linha de `insurance_policies` já mapeada para camelCase. */
export interface InsurancePolicy {
  id: string;
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
  evidence: Record<string, unknown>;
  evidenceSource: InsuranceEvidenceSource;
  correlationId: string;
  version: number;
  createdAt: string;
  updatedAt: string;
}

/** Linha de `risk_management_plans` já mapeada para camelCase. */
export interface RiskManagementPlan {
  id: string;
  integrationAccountId: string;
  partyId: string;
  planReference: string;
  versionLabel: string;
  validFrom: string;
  validUntil: string | null;
  status: RiskManagementPlanStatus;
  evidence: Record<string, unknown>;
  evidenceSource: RiskManagementPlanEvidenceSource;
  /** Tipos de apólice que o vínculo legal (Lei 14.599/2023) associa a este PGR — default `[RCTR_C, RC_DC]`. */
  relatedPolicyTypes: InsurancePolicyType[];
  correlationId: string;
  version: number;
  createdAt: string;
  updatedAt: string;
}

/** Linha de `insurance_verifications` já mapeada para camelCase — APPEND-ONLY. */
export interface InsuranceVerification {
  id: string;
  integrationAccountId: string;
  partyId: string;
  policyId: string | null;
  strategy: InsuranceVerificationStrategy;
  requestedStatus: InsuranceVerificationRequestedStatus;
  result: Record<string, unknown>;
  verifiedBy: string | null;
  verifiedAt: string;
  correlationId: string;
  createdAt: string;
}

/**
 * Tipos e constantes do catálogo regulatório da vertical TRANSPORTE (PR-A1, DL-103).
 *
 * Bounded context separado do ambiental: nada aqui referencia manifests/CETESB. As constantes
 * espelham 1:1 os CHECKs da migration `021_transporte_regulatory_catalog.sql` — mudou lá,
 * muda aqui no mesmo PR (e vice-versa).
 */

/** Os 8 compliance gates do ciclo de vida de uma operação de transporte (ADR do programa). */
export const COMPLIANCE_GATES = [
  'GATE_PROPOSAL',
  'GATE_CONTRACT',
  'GATE_CIOT',
  'GATE_FISCAL',
  'GATE_PRE_BOARDING',
  'GATE_RELEASE',
  'GATE_IN_TRANSIT',
  'GATE_COMPLETION'
] as const;

export type ComplianceGate = (typeof COMPLIANCE_GATES)[number];

/** Domínios regulatórios das regras TR-*. */
export const REGULATORY_DOMAINS = [
  'RNTRC',
  'PMF',
  'CIOT',
  'PAY',
  'VPO',
  'NFE',
  'CTE',
  'MDFE',
  'SEG',
  'PGR',
  'COMP'
] as const;

export type RegulatoryDomain = (typeof REGULATORY_DOMAINS)[number];

/** Estados de implementação de uma versão de regra (campo do OPERADOR após o insert do seed). */
export const RULE_IMPLEMENTATION_STATES = [
  'DRAFT',
  'UNDER_REVIEW',
  'ACTIVE',
  'FUTURE',
  'SUPERSEDED',
  'REVOKED',
  'AWAITING_REGULATION'
] as const;

export type RuleImplementationState = (typeof RULE_IMPLEMENTATION_STATES)[number];

export const RULE_SEVERITIES = ['info', 'warning', 'critical'] as const;

export type RuleSeverity = (typeof RULE_SEVERITIES)[number];

export const SOURCE_TYPES = [
  'law',
  'decree',
  'antt_resolution',
  'antt_portaria',
  'sinief_adjustment',
  'technical_note',
  'veto',
  'other'
] as const;

export type RegulatorySourceType = (typeof SOURCE_TYPES)[number];

export const SOURCE_ISSUERS = [
  'CONGRESSO',
  'PRESIDENCIA',
  'ANTT',
  'CONFAZ',
  'SEFAZ',
  'SUSEP',
  'CNSP',
  'OTHER'
] as const;

export type RegulatorySourceIssuer = (typeof SOURCE_ISSUERS)[number];

export const SOURCE_MONITORING_STATUSES = ['monitored', 'stable', 'superseded', 'revoked'] as const;

export type SourceMonitoringStatus = (typeof SOURCE_MONITORING_STATUSES)[number];

export const SOURCE_REVIEW_STATUSES = ['pending_review', 'under_review', 'reviewed'] as const;

export type SourceReviewStatus = (typeof SOURCE_REVIEW_STATUSES)[number];

/** Referência de base legal dentro de `legal_basis` (jsonb livre — sem FK por desenho). */
export type LegalBasisEntry = { reference: string };

/** Linha de `regulatory_sources` já mapeada para camelCase (datas como 'YYYY-MM-DD'). */
export interface RegulatorySource {
  id: string;
  sourceType: RegulatorySourceType;
  reference: string;
  title: string;
  issuer: RegulatorySourceIssuer;
  publishedAt: string | null;
  effectiveFrom: string | null;
  effectiveUntil: string | null;
  sourceUrl: string | null;
  sourceHash: string | null;
  monitoringStatus: SourceMonitoringStatus;
  reviewStatus: SourceReviewStatus;
  reviewedBy: string | null;
  reviewedAt: string | null;
  notes: Record<string, unknown>;
  version: number;
  createdAt: string;
  updatedAt: string;
}

/** Linha de `regulatory_rules` (identidade estável da regra — vigência vive nas versões). */
export interface RegulatoryRule {
  id: string;
  code: string;
  domain: RegulatoryDomain;
  title: string;
  description: string;
  defaultGate: ComplianceGate;
  displayOrder: number;
  version: number;
  createdAt: string;
  updatedAt: string;
}

/** Linha de `regulatory_rule_versions` (a regra "viva" numa janela de vigência). */
export interface RegulatoryRuleVersion {
  id: string;
  ruleId: string;
  versionLabel: string;
  legalBasis: LegalBasisEntry[];
  summary: string;
  effectiveFrom: string;
  effectiveUntil: string | null;
  implementationState: RuleImplementationState;
  blocking: boolean;
  severity: RuleSeverity;
  applicability: Record<string, unknown>;
  reasonCodes: string[];
  sourceHash: string | null;
  reviewedBy: string | null;
  reviewedAt: string | null;
  version: number;
  createdAt: string;
  updatedAt: string;
}

/**
 * Os 28 códigos TR-* do catálogo (26 da baseline regulatória do guia do programa + TR-SEG-004,
 * limite de garantia por viagem — PR-I2, REQ-SICAT-0028 rev.2 + TR-SEG-005, averbação registrada
 * antes do trânsito — PR-I3, REQ-SICAT-0034). Ordem = ordem de exibição do catálogo (mesma do
 * seed, `display_order`).
 */
export const RULE_CODES = [
  'TR-RNTRC-001',
  'TR-RNTRC-002',
  'TR-RNTRC-003',
  'TR-PMF-001',
  'TR-PMF-002',
  'TR-PMF-003',
  'TR-PMF-004',
  'TR-CIOT-001',
  'TR-CIOT-002',
  'TR-CIOT-003',
  'TR-CIOT-004',
  'TR-CIOT-005',
  'TR-PAY-001',
  'TR-VPO-001',
  'TR-VPO-002',
  'TR-VPO-003',
  'TR-VPO-004',
  'TR-NFE-001',
  'TR-CTE-001',
  'TR-MDFE-001',
  'TR-MDFE-002',
  'TR-SEG-001',
  'TR-SEG-002',
  'TR-SEG-003',
  'TR-SEG-004',
  'TR-SEG-005',
  'TR-PGR-001',
  'TR-COMP-001'
] as const;

export type RuleCode = (typeof RULE_CODES)[number];

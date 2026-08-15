/**
 * Tipos e constantes da camada fiscal do Transporte — importação/validação de DF-e (PR-E1, DL-103).
 *
 * Bounded context TRANSPORTE: NUNCA importa de/para `fiscal-kit` (emissão, Fase G) nem de entidades
 * ambientais. As constantes espelham 1:1 os CHECKs da migration `030_transport_fiscal_documents.sql`
 * — mudou lá, muda aqui no mesmo PR (e vice-versa).
 */

export const FISCAL_DOCUMENT_TYPES = ['NFE', 'CTE', 'MDFE'] as const;
export type FiscalDocumentType = (typeof FISCAL_DOCUMENT_TYPES)[number];

export const FISCAL_AUTHORIZATION_STATUSES = ['unknown', 'authorized', 'cancelled', 'denied'] as const;
export type FiscalAuthorizationStatus = (typeof FISCAL_AUTHORIZATION_STATUSES)[number];

export const FISCAL_VALIDATION_STATUSES = ['pending', 'valid', 'invalid', 'warnings'] as const;
export type FiscalValidationStatus = (typeof FISCAL_VALIDATION_STATUSES)[number];

export const FISCAL_DOCUMENT_LINK_TYPES = ['nfe_in_cte', 'cte_in_mdfe', 'nfe_in_mdfe'] as const;
export type FiscalDocumentLinkType = (typeof FISCAL_DOCUMENT_LINK_TYPES)[number];

export const FISCAL_DOCUMENT_EVENT_TYPES = [
  'imported',
  'validated',
  'revalidated',
  'linked_to_operation',
  'unlinked'
] as const;
export type FiscalDocumentEventType = (typeof FISCAL_DOCUMENT_EVENT_TYPES)[number];

/** Severidade de UM issue de validação — `error` empurra `validation_status` para `invalid`. */
export type DfeValidationIssueSeverity = 'error' | 'warning';

/** UM achado da validação — código ESTÁVEL (nunca texto livre como chave de comparação em teste). */
export interface DfeValidationIssue {
  severity: DfeValidationIssueSeverity;
  code: string;
  message: string;
}

/** Linha de `dfe_schema_registry` já mapeada para camelCase (datas como 'YYYY-MM-DD'). */
export interface DfeSchemaRegistryEntry {
  id: string;
  documentType: FiscalDocumentType;
  layoutVersion: string;
  technicalNote: string | null;
  effectiveFrom: string;
  effectiveUntil: string | null;
  validationProfile: Record<string, unknown>;
  notes: string;
  version: number;
  createdAt: string;
  updatedAt: string;
}

/** Linha de `fiscal_documents` já mapeada para camelCase. NUNCA carrega o XML — só a `xmlStorageRef`. */
export interface FiscalDocument {
  id: string;
  integrationAccountId: string;
  operationId: string | null;
  documentType: FiscalDocumentType;
  accessKey: string;
  xmlStorageRef: string;
  xmlHash: string;
  layoutVersion: string | null;
  schemaRegistryId: string | null;
  authorizationStatus: FiscalAuthorizationStatus;
  protocol: string | null;
  issuedAt: string | null;
  issuerDocument: string | null;
  issuerName: string | null;
  recipientDocument: string | null;
  recipientName: string | null;
  totalAmount: number | null;
  validationStatus: FiscalValidationStatus;
  validationIssues: DfeValidationIssue[];
  ciotNumbers: string[];
  vpoReferences: Record<string, unknown>[];
  correlationId: string;
  version: number;
  createdAt: string;
  updatedAt: string;
}

/** Linha de `fiscal_document_links`. */
export interface FiscalDocumentLink {
  id: string;
  documentId: string;
  linkedDocumentId: string;
  linkType: FiscalDocumentLinkType;
  createdAt: string;
}

/** Linha de `fiscal_document_events` (APPEND-ONLY). */
export interface FiscalDocumentEvent {
  id: string;
  documentId: string;
  eventType: FiscalDocumentEventType;
  detail: Record<string, unknown>;
  correlationId: string;
  createdAt: string;
}

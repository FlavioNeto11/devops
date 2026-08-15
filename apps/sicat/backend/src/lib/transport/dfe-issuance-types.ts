/**
 * Tipos do domínio de emissão de DF-e (PR-G, DL-103) — espelham 1:1 os CHECKs da migration
 * `032_transport_dfe_issuance.sql`. Mudou lá, muda aqui no mesmo PR (e vice-versa).
 */

export const DFE_ISSUANCE_DOCUMENT_TYPES = ['NFE', 'CTE', 'MDFE'] as const;
export type DfeIssuanceDocumentType = (typeof DFE_ISSUANCE_DOCUMENT_TYPES)[number];

export const DFE_ISSUANCE_STATUSES = [
  'draft',
  'building',
  'built',
  'signing',
  'signed',
  'submitting',
  'submit_unconfirmed',
  'authorized',
  'rejected',
  'failed_validation',
  'cancelled'
] as const;
export type DfeIssuanceStatus = (typeof DFE_ISSUANCE_STATUSES)[number];

/** Estados TERMINAIS — nenhuma transição sai deles pela via normal do pipeline. */
export const DFE_ISSUANCE_TERMINAL_STATUSES: readonly DfeIssuanceStatus[] = [
  'authorized',
  'rejected',
  'failed_validation',
  'cancelled'
];

export const DFE_ISSUANCE_ENVIRONMENTS = ['sandbox', 'production'] as const;
export type DfeIssuanceEnvironment = (typeof DFE_ISSUANCE_ENVIRONMENTS)[number];

export const DFE_ISSUANCE_EVENT_TYPES = [
  'created',
  'built',
  'signed',
  'submitted',
  'submit_unconfirmed',
  'authorized',
  'rejected',
  'failed',
  'cancelled',
  'reconciled',
  'imported_to_registry'
] as const;
export type DfeIssuanceEventType = (typeof DFE_ISSUANCE_EVENT_TYPES)[number];

export interface DfeIssuance {
  id: string;
  integrationAccountId: string;
  operationId: string;
  documentType: DfeIssuanceDocumentType;
  status: DfeIssuanceStatus;
  environment: DfeIssuanceEnvironment;
  accessKey: string | null;
  protocol: string | null;
  xmlStorageRef: string | null;
  xmlHash: string | null;
  providerResponse: Record<string, unknown>;
  rejectionReason: string | null;
  correlationMarker: string;
  fiscalDocumentId: string | null;
  jobId: string | null;
  correlationId: string;
  commandId: string | null;
  lastErrorCode: string | null;
  lastErrorDetail: Record<string, unknown> | null;
  version: number;
  createdAt: string;
  updatedAt: string;
}

export interface DfeIssuanceEvent {
  id: string;
  issuanceId: string;
  eventType: DfeIssuanceEventType;
  detail: Record<string, unknown>;
  correlationId: string;
  createdAt: string;
}

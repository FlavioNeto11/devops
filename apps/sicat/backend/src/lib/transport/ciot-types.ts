/**
 * Tipos e constantes do ciclo do CIOT (PR-C2, DL-103 + DL-102 aplicado ao domínio CIOT).
 *
 * Bounded context TRANSPORTE — espelha 1:1 os CHECKs da migration `028_transport_ciot.sql` — mudou
 * lá, muda aqui no mesmo PR (e vice-versa).
 *
 * NÃO existe provedor CIOT contratado ([EXTERNAL DEPENDENCY] P5 do guia do programa): `provider`
 * hoje só assume `mock` (sandbox determinístico) — `real` existe no enum para a interface já nascer
 * pronta, mas `gateways/ciot-provider-gateway.ts` recusa criar um gateway `real`.
 */

export const CIOT_OPERATION_STATUSES = [
  'pre_validation',
  'requested',
  'request_unconfirmed',
  'registered',
  'rectified',
  'cancelled',
  'closed',
  'rejected',
  'blocked'
] as const;
export type CiotOperationStatus = (typeof CIOT_OPERATION_STATUSES)[number];

/** Estados EM TRÂNSITO — a última ação dispatchada ainda não teve o desfecho confirmado localmente. */
export const CIOT_OPERATION_IN_FLIGHT_STATUSES: readonly CiotOperationStatus[] = [
  'requested',
  'registered',
  'rectified'
];

export const CIOT_PROVIDERS = ['mock', 'real'] as const;
export type CiotProvider = (typeof CIOT_PROVIDERS)[number];

export const CIOT_EVENT_TYPES = [
  'pre_validated',
  'request_dispatched',
  'request_confirmed',
  'request_unconfirmed',
  'registered',
  'rectify_requested',
  'rectified',
  'cancel_requested',
  'cancelled',
  'close_requested',
  'closed',
  'rejected',
  'blocked',
  'reconciled'
] as const;
export type CiotEventType = (typeof CIOT_EVENT_TYPES)[number];

/** Linha de `ciot_operations` já mapeada para camelCase. */
export interface CiotOperation {
  id: string;
  integrationAccountId: string;
  operationId: string;
  provider: CiotProvider;
  status: CiotOperationStatus;
  ciotNumber: string | null;
  correlationMarker: string;
  requestPayloadSnapshot: Record<string, unknown>;
  providerResponseSnapshot: Record<string, unknown>;
  rejectionReasonCode: string | null;
  externalStatus: string | null;
  requestedAt: string | null;
  registeredAt: string | null;
  closedAt: string | null;
  cancelledAt: string | null;
  jobId: string | null;
  correlationId: string;
  commandId: string | null;
  lastErrorCode: string | null;
  lastErrorDetail: Record<string, unknown> | null;
  version: number;
  createdAt: string;
  updatedAt: string;
}

/** Linha de `ciot_events` — APPEND-ONLY, nunca atualizada/apagada. */
export interface CiotEvent {
  id: string;
  ciotOperationId: string;
  eventType: CiotEventType;
  detail: Record<string, unknown>;
  correlationId: string;
  createdAt: string;
}

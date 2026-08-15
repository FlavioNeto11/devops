/**
 * Tipos e constantes do domínio VPO — Vale-Pedágio Obrigatório (PR-D1, DL-103 + DL-102 aplicado ao
 * VPO).
 *
 * Bounded context TRANSPORTE — espelha 1:1 os CHECKs da migration `029_transport_vpo.sql` — mudou
 * lá, muda aqui no mesmo PR (e vice-versa).
 */

/**
 * `vpo_allocations` é um recurso MUTÁVEL, uma linha por `transport_operations` (ao contrário de
 * `ciot_operations`, que nasce uma linha nova por tentativa — ver header da migration 029).
 *
 * `acquisition_requested`/`acquisition_unconfirmed` só existem para sustentar o padrão DL-102 na
 * aquisição via provedor (`POST .../vpo/adquirir`) — decisão do PR-D1 de replicar a topologia do
 * CIOT: identidade remota (`providerReference`) nasce na RESPOSTA, nunca no request.
 */
export const VPO_ALLOCATION_STATUSES = [
  'pending',
  'applicable',
  'not_applicable',
  'acquisition_requested',
  'acquisition_unconfirmed',
  'acquired',
  'cancelled'
] as const;
export type VpoAllocationStatus = (typeof VPO_ALLOCATION_STATUSES)[number];

/** Estado EM TRÂNSITO — dispatch já aconteceu, desfecho ainda não confirmado localmente. */
export const VPO_ALLOCATION_IN_FLIGHT_STATUSES: readonly VpoAllocationStatus[] = ['acquisition_requested'];

export const VPO_EVIDENCE_SOURCES = ['manual', 'provider', 'mock'] as const;
export type VpoEvidenceSource = (typeof VPO_EVIDENCE_SOURCES)[number];

export const VPO_EVENT_TYPES = [
  'applicability_evaluated',
  'acquisition_requested',
  'acquisition_unconfirmed',
  'reconciled',
  'acquired',
  'acquisition_failed',
  'cancelled',
  'evidence_attached'
] as const;
export type VpoEventType = (typeof VPO_EVENT_TYPES)[number];

/** Linha de `vpo_providers` já mapeada para camelCase — cadastro de referência, sem tenancy. */
export interface VpoProvider {
  id: string;
  name: string;
  isActive: boolean;
  habilitationSource: string | null;
  habilitationCheckedAt: string | null;
  notes: string;
  version: number;
  createdAt: string;
  updatedAt: string;
}

/** Linha de `vpo_allocations` já mapeada para camelCase. */
export interface VpoAllocation {
  id: string;
  integrationAccountId: string;
  operationId: string;
  status: VpoAllocationStatus;
  applicable: boolean | null;
  applicabilityReasonCode: string | null;
  providerId: string | null;
  providerReference: string | null;
  amount: number | null;
  acquiredAt: string | null;
  evidence: Record<string, unknown>;
  evidenceSource: VpoEvidenceSource | null;
  routeSnapshot: Record<string, unknown>;
  mdfeReference: string | null;
  jobId: string | null;
  correlationId: string;
  commandId: string | null;
  lastErrorCode: string | null;
  lastErrorDetail: Record<string, unknown> | null;
  version: number;
  createdAt: string;
  updatedAt: string;
}

/** Linha de `vpo_events` — APPEND-ONLY, nunca atualizada/apagada. */
export interface VpoEvent {
  id: string;
  vpoAllocationId: string;
  eventType: VpoEventType;
  detail: Record<string, unknown>;
  correlationId: string;
  createdAt: string;
}

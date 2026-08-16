/**
 * Tipos e constantes da averbação eletrônica por viagem (PR-I3 do Módulo Transportadora,
 * REQ-SICAT-0034, DL-102 aplicado ao domínio de seguros).
 *
 * Bounded context TRANSPORTE — espelha 1:1 os CHECKs da migration
 * `036_transport_insurance_declarations.sql`: mudou lá, muda aqui no mesmo PR (e vice-versa).
 * Mesmo racional de `ciot-types.ts` (réplica DELIBERADA do padrão, NÃO reuso — a averbação é um
 * ciclo próprio, com semântica própria: não existe `rectified` como ESTADO, retificação
 * bem-sucedida volta a `declared`; o evento append-only é quem registra o fato).
 */

export const INSURANCE_DECLARATION_STATUSES = [
  'declaring',
  'declared',
  'declare_unconfirmed',
  'rectifying',
  'rectify_unconfirmed',
  'cancelling',
  'cancel_unconfirmed',
  'cancelled',
  'rejected'
] as const;

export type InsuranceDeclarationStatus = (typeof INSURANCE_DECLARATION_STATUSES)[number];

/** Estados TERMINAIS — os únicos que liberam a chave viva (operation×policy) para nova averbação. */
export const INSURANCE_DECLARATION_TERMINAL_STATUSES = ['cancelled', 'rejected'] as const;

/** Estados `*_unconfirmed` — resposta perdida DEPOIS do dispatch; só a reconciliação resolve (DL-102). */
export const INSURANCE_DECLARATION_UNCONFIRMED_STATUSES = [
  'declare_unconfirmed',
  'rectify_unconfirmed',
  'cancel_unconfirmed'
] as const;

export type InsuranceDeclarationUnconfirmedStatus = (typeof INSURANCE_DECLARATION_UNCONFIRMED_STATUSES)[number];

export const INSURANCE_DECLARATION_EVENT_TYPES = [
  'declare_requested',
  'declared',
  'declare_unconfirmed',
  'rectify_requested',
  'rectified',
  'cancel_requested',
  'cancelled',
  'rejected',
  'reconciled'
] as const;

export type InsuranceDeclarationEventType = (typeof INSURANCE_DECLARATION_EVENT_TYPES)[number];

/** Linha de `insurance_shipment_declarations` já mapeada para camelCase. */
export interface InsuranceShipmentDeclaration {
  id: string;
  integrationAccountId: string;
  operationId: string;
  policyId: string;
  rateScheduleId: string;
  /** Valor da carga CONGELADO NO ATO da averbação/retificação (reais) — nunca derivado da carga atual. */
  declaredCargoAmount: number;
  /** Taxa PERCENTUAL literal aplicada (0,097% grava 0.097) — congelada da `insurance_rate_schedules`. */
  appliedRatePercent: number;
  /** Prêmio calculado no ato (reais, centavos half-up — `insurance-premium-engine.ts`). */
  premiumAmount: number;
  routeScope: string | null;
  /** Nasce NA RESPOSTA da seguradora (DL-102) — `null` até a confirmação. */
  providerDeclarationRef: string | null;
  correlationMarker: string;
  status: InsuranceDeclarationStatus;
  lastErrorCode: string | null;
  correlationId: string;
  version: number;
  createdAt: string;
  updatedAt: string;
}

/** Linha de `insurance_declaration_events` já mapeada para camelCase — APPEND-ONLY. */
export interface InsuranceDeclarationEvent {
  id: string;
  declarationId: string;
  eventType: InsuranceDeclarationEventType;
  payload: Record<string, unknown>;
  correlationId: string;
  createdAt: string;
}

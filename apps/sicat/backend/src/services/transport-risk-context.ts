/**
 * Montagem do contexto de Gerenciamento de Riscos para o motor de compliance (PR-I5,
 * REQ-SICAT-0036) — o que TR-GR-001/002 precisam saber, e SÓ isso.
 *
 * Fica fora de `transport-compliance-service.ts` para o serviço não crescer mais um domínio: aqui é
 * a tradução repositório → recorte mínimo do evaluator (o evaluator continua PURO e nunca vê o
 * payload cru do provedor — LGPD: nem sequer o `result` da pesquisa entra).
 */

import { findActiveTrackingConfirmation, findLatestValidScreening } from '../repositories/risk-management-repo.js';
import { findDriverByPartyId } from '../repositories/transport-driver-repo.js';
import { findApplicablePlanForParty } from '../repositories/transport-insurance-repo.js';

export type RiskManagementEvaluationContext = {
  driverScreening?: { outcome: 'approved' | 'rejected' | 'inconclusive'; validUntil: string | null } | null;
  vehicleScreening?: { outcome: 'approved' | 'rejected' | 'inconclusive'; validUntil: string | null } | null;
  hasLinkedDriver?: boolean;
  trackingMatrix?: { thresholds?: Array<{ minDeclaredValue: number; required: boolean }> } | null;
  trackingConfirmed?: boolean;
};

function toScreeningContext(screening: { outcome: string | null; validUntil: string | null } | null) {
  if (!screening || !screening.outcome) return null;
  return {
    outcome: screening.outcome as 'approved' | 'rejected' | 'inconclusive',
    validUntil: screening.validUntil
  };
}

/** Matriz do PGR vigente do carrier — `{}` (sem thresholds) quando não há plano ou matriz. */
function toTrackingMatrix(plan: { trackingMatrix?: unknown } | null) {
  const raw = plan?.trackingMatrix;
  if (!raw || typeof raw !== 'object') return null;
  const thresholds = (raw as { thresholds?: unknown }).thresholds;
  if (!Array.isArray(thresholds)) return null;
  return {
    thresholds: thresholds
      .filter((item): item is { minDeclaredValue: number; required: boolean } =>
        Boolean(item) && typeof item === 'object' && 'minDeclaredValue' in (item as object))
      .map((item) => ({
        minDeclaredValue: Number((item as { minDeclaredValue: unknown }).minDeclaredValue || 0),
        required: Boolean((item as { required?: unknown }).required)
      }))
  };
}

export async function buildRiskManagementContext(opts: {
  integrationAccountId: string;
  operationId: string;
  driverPartyId: string | null;
  vehicleId: string | null;
  carrierPartyId: string | null;
  referenceDate: string;
}): Promise<RiskManagementEvaluationContext> {
  const driver = opts.driverPartyId
    ? await findDriverByPartyId(opts.driverPartyId, opts.integrationAccountId)
    : null;

  const [driverScreening, vehicleScreening, trackingConfirmation, plan] = await Promise.all([
    driver
      ? findLatestValidScreening({ subjectType: 'driver', targetId: driver.id, referenceDate: opts.referenceDate })
      : Promise.resolve(null),
    opts.vehicleId
      ? findLatestValidScreening({ subjectType: 'vehicle', targetId: opts.vehicleId, referenceDate: opts.referenceDate })
      : Promise.resolve(null),
    findActiveTrackingConfirmation(opts.operationId),
    opts.carrierPartyId
      ? findApplicablePlanForParty(opts.carrierPartyId, opts.integrationAccountId, opts.referenceDate)
      : Promise.resolve(null)
  ]);

  return {
    hasLinkedDriver: Boolean(driver),
    driverScreening: toScreeningContext(driverScreening),
    vehicleScreening: toScreeningContext(vehicleScreening),
    trackingMatrix: toTrackingMatrix(plan as { trackingMatrix?: unknown } | null),
    trackingConfirmed: Boolean(trackingConfirmation)
  };
}

/**
 * MTR Provisório Service — wrapper das operações HTTP /v1/mtr-provisorio/*.
 *
 * Cadeia: mtr-provisorio-fluxo-base (fase 07-frontend-ux).
 * Contrato OpenAPI: paths `/v1/mtr-provisorio` e `/v1/mtr-provisorio/{id}*`
 * (operationIds: mtrProvisorioList, mtrProvisorioCreate, mtrProvisorioGet,
 * mtrProvisorioCancel, mtrProvisorioPrint).
 *
 * Comandos respeitam Idempotency-Key e propagação de X-Correlation-Id
 * (gerado no transport em api.js). NÃO importa de src/** (proibido pelo
 * handoff). Reusa apenas a camada api.js — fronteira frontend/backend
 * mantida.
 */

export {
  listMtrProvisorio,
  createMtrProvisorio,
  getMtrProvisorioById,
  cancelMtrProvisorio,
  printMtrProvisorio
} from './api.js';

export function buildMtrProvisorioIdempotencyKey(prefix = 'mtr-provisorio') {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return `${prefix}_${crypto.randomUUID()}`;
  }
  return `${prefix}_${Date.now()}_${Math.floor(Math.random() * 100000)}`;
}

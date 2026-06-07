/**
 * DMR Service — wrapper das operações HTTP DMR.
 *
 * Cadeia: dmr-fluxo-base (fase 07-frontend-ux).
 * Contrato OpenAPI: /v1/dmr/* (11 operações). Comandos respeitam
 * Idempotency-Key e propagação de X-Correlation-Id (gerado no transport
 * em api.js).
 *
 * NÃO importa de src/** (proibido pelo handoff). Reusa apenas a camada
 * api.js — fronteira frontend/backend mantida.
 */

export {
  listDmr,
  listPendingDmr,
  createDmr,
  getDmrById,
  deleteDmr,
  consolidateDmr,
  submitDmr,
  getDmrStatus,
  listDmrItems,
  addDmrItem,
  removeDmrItem
} from './api.js';

export function buildDmrIdempotencyKey(prefix = 'dmr') {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return `${prefix}_${crypto.randomUUID()}`;
  }
  return `${prefix}_${Date.now()}_${Math.floor(Math.random() * 100000)}`;
}

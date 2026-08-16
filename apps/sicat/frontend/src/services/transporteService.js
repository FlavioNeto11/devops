/**
 * Transporte Service — wrapper das operações HTTP /v1/transporte/*.
 *
 * Programa "SICAT Transporte" (DL-103). Nasceu na Onda 1.5/PR-F1 (frontend
 * mínimo: operações + regras) e foi completado no PR-H2 (frontend completo:
 * cadastros, RNTRC, CIOT, VPO, piso mínimo, documentos fiscais, seguros/PGR,
 * emissão de DF-e e Regulatory Watch). Contrato OpenAPI:
 * `openapi/mtr_automacao_openapi_interna.yaml`, tags "Transporte - *".
 *
 * Service fino, sem regra de negócio: só re-exporta a camada api.js — fronteira
 * frontend/backend mantida (NÃO importa de src/** do backend).
 */

export {
  // Operações + conformidade (PR-F1).
  listTransportOperations,
  getTransportOperationById,
  getTransportOperationCompliance,
  validateTransportOperationCompliance,
  submitTransportOperationValidation,
  contractTransportOperation,
  reopenTransportOperation,
  cancelTransportOperation,

  // Regras (PR-F1) + histórico/promoção (PR-H2).
  listTransportRules,
  getTransportRuleByCode,
  getTransportRuleHistory,
  promoteTransportRuleVersion,

  // Cadastros: transportadores + RNTRC + vínculo de veículo (PR-H2).
  createTransportCarrier,
  listTransportCarriers,
  getTransportCarrierById,
  updateTransportCarrier,
  verifyTransportCarrierRntrc,
  listTransportCarrierRntrcVerifications,
  linkTransportCarrierVehicle,
  listTransportCarrierVehicleLinks,

  // Cadastros: veículos (PR-H2).
  createTransportVehicle,
  listTransportVehicles,
  getTransportVehicleById,
  updateTransportVehicle,

  // Cadastros: motoristas + vínculos frota/agregado (REQ-SICAT-0033/0037, onda F6).
  createTransportDriver,
  listTransportDrivers,
  getTransportDriverById,
  updateTransportDriver,
  createTransportDriverCarrierLink,
  listTransportDriverCarrierLinks,
  updateTransportDriverCarrierLink,

  // Piso mínimo de frete (PR-H2).
  calculateTransportOperationFloor,
  listTransportOperationFloorCalculations,
  listTransportFloorTables,

  // CIOT (PR-H2).
  preValidateTransportOperationCiot,
  requestTransportOperationCiot,
  rectifyTransportOperationCiot,
  cancelTransportOperationCiot,
  closeTransportOperationCiot,
  getTransportOperationCiot,

  // VPO (PR-H2).
  evaluateTransportOperationVpoApplicability,
  registerTransportOperationVpoAcquisition,
  acquireTransportOperationVpo,
  getTransportOperationVpo,
  listTransportVpoProviders,

  // Documentos fiscais (PR-H2).
  importTransportFiscalDocument,
  linkTransportFiscalDocument,
  unlinkTransportFiscalDocument,
  revalidateTransportFiscalDocument,
  listTransportOperationFiscalDocuments,
  getTransportFiscalDocumentById,

  // Seguros / PGR (PR-H2).
  createTransportCarrierInsurancePolicy,
  listTransportCarrierInsurancePolicies,
  verifyTransportCarrierInsurancePolicies,
  updateTransportCarrierInsurancePolicy,
  createTransportCarrierPgr,
  listTransportCarrierPgrs,
  listTransportInsuranceExpiryAlerts,

  // Emissão de DF-e sandbox-ready (PR-H2).
  requestTransportOperationDfeIssuance,
  listTransportOperationDfeIssuances,
  cancelTransportDfeIssuance,

  // Regulatory Watch (PR-H2).
  listTransportWatchItems,
  getTransportWatchItemById,
  reviewTransportWatchItem,
  applyTransportWatchItem,
  triggerTransportWatchCheck,

  // Centro Operacional (PR-H2).
  getTransportOperationsOverview
} from './api.js';

/** Molde: `buildMtrProvisorioIdempotencyKey` (mtrProvisorioService.js). */
export function buildTransporteIdempotencyKey(prefix = 'transporte') {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return `${prefix}_${crypto.randomUUID()}`;
  }
  return `${prefix}_${Date.now()}_${Math.floor(Math.random() * 100000)}`;
}

/**
 * Transporte Service — wrapper das operações HTTP /v1/transporte/*.
 *
 * Programa "SICAT Transporte" (DL-103), Onda 1.5/PR-F1 (frontend mínimo).
 * Contrato OpenAPI: paths `/v1/transporte/operacoes*` e `/v1/transporte/regras*`
 * (operationIds: transporteOperacoesList, transporteOperacaoGet,
 * transporteOperacaoConformidade, transporteOperacaoValidarConformidade,
 * transporteOperacaoSubmeterValidacao, transporteOperacaoContratar,
 * transporteOperacaoReabrir, transporteOperacaoCancelar, transporteRegrasList,
 * transporteRegrasGet).
 *
 * Service fino, sem regra de negócio: só re-exporta a camada api.js — fronteira
 * frontend/backend mantida (NÃO importa de src/** do backend).
 */

export {
  listTransportOperations,
  getTransportOperationById,
  getTransportOperationCompliance,
  validateTransportOperationCompliance,
  submitTransportOperationValidation,
  contractTransportOperation,
  reopenTransportOperation,
  cancelTransportOperation,
  listTransportRules,
  getTransportRuleByCode
} from './api.js';

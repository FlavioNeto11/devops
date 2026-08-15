/**
 * Rotas da vertical TRANSPORTE — PR-A2 (catálogo regulatório read-only) + PR-A3 (cadastro-base de
 * transportadores/veículos) + PR-A4 (agregado `TransportOperation` + máquina de estados) + PR-A5
 * (motor de compliance + ativação das transições guardadas, DL-103).
 *
 * HTTP mapping only, no molde de `dmr-routes.ts`: cada handler delega ao service. Sem SQL, sem
 * gateway, sem regra de negócio. Erros propagam como `AppError` para `error-handler.ts`
 * (problem+json). Toda rota nasce FECHADA atrás de `sicatAuthMiddleware` — a catraca de
 * `tests/api/v1-auth-coverage.test.js` cobre o registro.
 *
 * Cadastros (PR-A3), operações (PR-A4) e conformidade (PR-A5) são TODOS síncronos (201/200) — sem
 * 202/job nesta vertical na Fase A (a verificação externa de regularidade RNTRC via ANTT é Fase C;
 * rotas `/regularidade`/`/verificar` não existem aqui). `submeter-validacao` ORQUESTRA a avaliação
 * do `GATE_PROPOSAL` e a transição resultante (`approve_validation`/`reject_validation`) no mesmo
 * request; `contratar` ATIVA `GATE_CONTRACT`; `validar-conformidade`/`conformidade` são consulta/
 * avaliação ad-hoc SEM transição. As transições de fases C+ (CIOT, fiscal, liberação, viagem,
 * conclusão) continuam declaradas em `transport-state-machine.ts` mas sem rota.
 */

import express from 'express';
import type { IncomingHttpHeaders } from 'node:http';
import { asyncHandler } from '../lib/http.js';
import { createPrefixedId } from '../lib/ids.js';
import { sicatAuthMiddleware } from '../middlewares/sicat-auth.js';
import {
  getTransportRuleHistoryService,
  getTransportRuleService,
  listTransportRulesService,
  promoteTransportRuleVersionService
} from '../services/transporte-regras-service.js';
import {
  createPartyVehicleLinkService,
  createTransportPartyService,
  getTransportPartyService,
  listPartyVehicleLinksService,
  listTransportPartiesService,
  updateTransportPartyService
} from '../services/transport-party-service.js';
import {
  createTransportVehicleService,
  getTransportVehicleService,
  listTransportVehiclesService,
  updateTransportVehicleService
} from '../services/transport-vehicle-service.js';
import {
  cancelTransportOperation,
  contractTransportOperation,
  createTransportOperation,
  getTransportOperationById,
  listTransportOperationsService,
  reopenTransportOperation,
  submitTransportOperationValidation,
  updateTransportOperation
} from '../services/transport-operation-service.js';
import {
  getTransportOperationComplianceOverviewService,
  validateTransportOperationComplianceService
} from '../services/transport-compliance-service.js';
import {
  calculateFreightFloorHttpService,
  listFreightFloorCalculationsHttpService,
  listFreightFloorTablesService
} from '../services/freight-floor-service.js';
import {
  listRntrcVerificationsService,
  requestRntrcVerificationService
} from '../services/transport-rntrc-verification-service.js';
import {
  cancelCiot,
  closeCiot,
  getCiotForOperationService,
  preValidateCiot,
  rectifyCiot,
  requestCiot
} from '../services/transport-ciot-service.js';
import {
  avaliarAplicabilidadeVpo,
  getVpoForOperationService,
  listVpoProvidersService,
  registrarAquisicaoVpoManual,
  solicitarAquisicaoVpo
} from '../services/transport-vpo-service.js';
import {
  desvincularDocumentoFiscal,
  getFiscalDocumentByIdService,
  getFiscalDocumentsForOperationService,
  importarDocumentoFiscal,
  revalidarDocumentoFiscal,
  vincularDocumentoFiscal
} from '../services/transport-fiscal-service.js';
import {
  createInsurancePolicyService,
  createRiskManagementPlanService,
  listInsuranceExpirationAlertsService,
  listInsurancePoliciesService,
  listRiskManagementPlansService,
  updateInsurancePolicyService,
  verifyCarrierInsuranceService
} from '../services/transport-insurance-service.js';
import {
  cancelDfeIssuance,
  listDfeIssuancesForOperationService,
  requestDfeIssuance
} from '../services/transport-dfe-issuance-service.js';
import {
  applyRegulatoryWatchItemService,
  getRegulatoryWatchItemService,
  listRegulatoryWatchItemsService,
  reviewRegulatoryWatchItemService,
  triggerRegulatoryWatchCheckNowService
} from '../services/transport-regulatory-watch-service.js';
import { getTransportOperationsOverviewService } from '../services/transport-operations-overview-service.js';

type LooseRecord = Record<string, unknown>;
type RequestWithContext = express.Request & {
  correlationId?: string | null;
  sicatUser?: { userId: string };
};

function getCorrelationId(req: express.Request): string | null {
  const correlationId = (req as RequestWithContext).correlationId;
  return typeof correlationId === 'string' && correlationId.length > 0 ? correlationId : null;
}

function getSicatUserId(req: express.Request): string | null {
  const userId = (req as RequestWithContext).sicatUser?.userId;
  return typeof userId === 'string' && userId.length > 0 ? userId : null;
}

/** `correlationId`/`evaluatedBy` explícitos para o motor de compliance (worker-callable, não lê `req`). */
function getOperationCommandContext(req: express.Request): { correlationId: string; evaluatedBy: string | null } {
  return {
    correlationId: getCorrelationId(req) || createPrefixedId('corr'),
    evaluatedBy: getSicatUserId(req)
  };
}

function toHeaderMap(headers: IncomingHttpHeaders): Record<string, string | undefined> {
  const entries = Object.entries(headers).map(([key, value]) => {
    if (typeof value === 'string') return [key, value] as const;
    if (Array.isArray(value)) return [key, value.join(', ')] as const;
    return [key, undefined] as const;
  });
  return Object.fromEntries(entries);
}

export function registerTransporteRoutes(router: express.Router): void {
  router.get('/v1/transporte/regras', sicatAuthMiddleware, asyncHandler(async (req, res) => {
    const response = await listTransportRulesService((req.query || {}) as LooseRecord);
    res.json(response);
  }));

  router.get('/v1/transporte/regras/:code/historico', sicatAuthMiddleware, asyncHandler(async (req, res) => {
    const response = await getTransportRuleHistoryService(String(req.params.code || ''));
    res.json(response);
  }));

  router.get('/v1/transporte/regras/:code', sicatAuthMiddleware, asyncHandler(async (req, res) => {
    const response = await getTransportRuleService(
      String(req.params.code || ''),
      (req.query || {}) as LooseRecord
    );
    res.json(response);
  }));

  // ===========================================================================================
  // Cadastros — transportadores (PR-A3)
  // ===========================================================================================

  router.post('/v1/transporte/transportadores', sicatAuthMiddleware, asyncHandler(async (req, res) => {
    const response = await createTransportPartyService((req.body || {}) as LooseRecord, getCorrelationId(req));
    res.status(201).json(response);
  }));

  router.get('/v1/transporte/transportadores', sicatAuthMiddleware, asyncHandler(async (req, res) => {
    const response = await listTransportPartiesService((req.query || {}) as LooseRecord);
    res.json(response);
  }));

  router.get('/v1/transporte/transportadores/:partyId/veiculos', sicatAuthMiddleware, asyncHandler(async (req, res) => {
    const response = await listPartyVehicleLinksService(
      String(req.params.partyId || ''),
      (req.query || {}) as LooseRecord
    );
    res.json(response);
  }));

  router.post('/v1/transporte/transportadores/:partyId/veiculos', sicatAuthMiddleware, asyncHandler(async (req, res) => {
    const response = await createPartyVehicleLinkService(
      String(req.params.partyId || ''),
      (req.body || {}) as LooseRecord
    );
    res.status(201).json(response);
  }));

  router.get('/v1/transporte/transportadores/:partyId', sicatAuthMiddleware, asyncHandler(async (req, res) => {
    const response = await getTransportPartyService(
      String(req.params.partyId || ''),
      (req.query || {}) as LooseRecord
    );
    res.json(response);
  }));

  router.patch('/v1/transporte/transportadores/:partyId', sicatAuthMiddleware, asyncHandler(async (req, res) => {
    const response = await updateTransportPartyService(
      String(req.params.partyId || ''),
      (req.body || {}) as LooseRecord
    );
    res.json(response);
  }));

  // ===========================================================================================
  // Verificação de regularidade RNTRC (PR-C1) — `manual` é SÍNCRONO (200); `open_data` ENFILEIRA
  // (202, primeiro job type assíncrono com gateway externo real da vertical).
  // ===========================================================================================

  router.post('/v1/transporte/transportadores/:partyId/verificar-rntrc', sicatAuthMiddleware, asyncHandler(async (req, res) => {
    const response = await requestRntrcVerificationService(
      String(req.params.partyId || ''),
      (req.body || {}) as LooseRecord,
      toHeaderMap(req.headers || {}),
      getOperationCommandContext(req)
    );
    const isQueuedCommand = (response as LooseRecord).status === 'queued' && Boolean((response as LooseRecord).commandId);
    res.status(isQueuedCommand ? 202 : 200).json(response);
  }));

  router.get('/v1/transporte/transportadores/:partyId/verificacoes-rntrc', sicatAuthMiddleware, asyncHandler(async (req, res) => {
    const response = await listRntrcVerificationsService(
      String(req.params.partyId || ''),
      (req.query || {}) as LooseRecord
    );
    res.json(response);
  }));

  // ===========================================================================================
  // Cadastros — veículos (PR-A3)
  // ===========================================================================================

  router.post('/v1/transporte/veiculos', sicatAuthMiddleware, asyncHandler(async (req, res) => {
    const response = await createTransportVehicleService((req.body || {}) as LooseRecord, getCorrelationId(req));
    res.status(201).json(response);
  }));

  router.get('/v1/transporte/veiculos', sicatAuthMiddleware, asyncHandler(async (req, res) => {
    const response = await listTransportVehiclesService((req.query || {}) as LooseRecord);
    res.json(response);
  }));

  router.get('/v1/transporte/veiculos/:vehicleId', sicatAuthMiddleware, asyncHandler(async (req, res) => {
    const response = await getTransportVehicleService(
      String(req.params.vehicleId || ''),
      (req.query || {}) as LooseRecord
    );
    res.json(response);
  }));

  router.patch('/v1/transporte/veiculos/:vehicleId', sicatAuthMiddleware, asyncHandler(async (req, res) => {
    const response = await updateTransportVehicleService(
      String(req.params.vehicleId || ''),
      (req.body || {}) as LooseRecord
    );
    res.json(response);
  }));

  // ===========================================================================================
  // Operações — agregado TransportOperation (PR-A4)
  // ===========================================================================================

  router.post('/v1/transporte/operacoes', sicatAuthMiddleware, asyncHandler(async (req, res) => {
    const response = await createTransportOperation(
      (req.body || {}) as LooseRecord,
      toHeaderMap(req.headers || {}),
      getCorrelationId(req)
    );
    res.status(201).json(response);
  }));

  router.get('/v1/transporte/operacoes', sicatAuthMiddleware, asyncHandler(async (req, res) => {
    const response = await listTransportOperationsService((req.query || {}) as LooseRecord);
    res.json(response);
  }));

  router.get('/v1/transporte/operacoes/:operationId', sicatAuthMiddleware, asyncHandler(async (req, res) => {
    const response = await getTransportOperationById(
      String(req.params.operationId || ''),
      (req.query || {}) as LooseRecord
    );
    res.json(response);
  }));

  router.patch('/v1/transporte/operacoes/:operationId', sicatAuthMiddleware, asyncHandler(async (req, res) => {
    const response = await updateTransportOperation(
      String(req.params.operationId || ''),
      (req.body || {}) as LooseRecord
    );
    res.json(response);
  }));

  // ORQUESTRA: avalia GATE_PROPOSAL e aplica approve_validation/reject_validation no mesmo request.
  router.post('/v1/transporte/operacoes/:operationId/submeter-validacao', sicatAuthMiddleware, asyncHandler(async (req, res) => {
    const response = await submitTransportOperationValidation(
      String(req.params.operationId || ''),
      (req.body || {}) as LooseRecord,
      getOperationCommandContext(req)
    );
    res.json(response);
  }));

  // ATIVA GATE_CONTRACT: 409 TRANSPORT_GATE_BLOCKED em bloqueio, senão CAS para `contracted`.
  router.post('/v1/transporte/operacoes/:operationId/contratar', sicatAuthMiddleware, asyncHandler(async (req, res) => {
    const response = await contractTransportOperation(
      String(req.params.operationId || ''),
      (req.body || {}) as LooseRecord,
      getOperationCommandContext(req)
    );
    res.json(response);
  }));

  // Transição SEM gate `blocked --reopen--> draft` — faltava rota desde o PR-A4.
  router.post('/v1/transporte/operacoes/:operationId/reabrir', sicatAuthMiddleware, asyncHandler(async (req, res) => {
    const response = await reopenTransportOperation(
      String(req.params.operationId || ''),
      (req.body || {}) as LooseRecord
    );
    res.json(response);
  }));

  router.post('/v1/transporte/operacoes/:operationId/cancelar', sicatAuthMiddleware, asyncHandler(async (req, res) => {
    const response = await cancelTransportOperation(
      String(req.params.operationId || ''),
      (req.body || {}) as LooseRecord
    );
    res.json(response);
  }));

  // ===========================================================================================
  // Conformidade — motor de compliance (PR-A5)
  // ===========================================================================================

  // Avaliação ad-hoc de UM gate (`triggeredBy: 'user'`) — SEM transição.
  router.post('/v1/transporte/operacoes/:operationId/validar-conformidade', sicatAuthMiddleware, asyncHandler(async (req, res) => {
    const response = await validateTransportOperationComplianceService(
      String(req.params.operationId || ''),
      (req.body || {}) as LooseRecord,
      getOperationCommandContext(req)
    );
    res.json(response);
  }));

  // Overview: a avaliação mais recente de cada um dos 8 gates.
  router.get('/v1/transporte/operacoes/:operationId/conformidade', sicatAuthMiddleware, asyncHandler(async (req, res) => {
    const response = await getTransportOperationComplianceOverviewService(
      String(req.params.operationId || ''),
      (req.query || {}) as LooseRecord
    );
    res.json(response);
  }));

  // ===========================================================================================
  // CIOT — ciclo completo com provedor ABSTRAÍDO (PR-C2, DL-102 aplicado ao domínio CIOT)
  // ===========================================================================================

  // SÍNCRONO (200) — avaliação ad-hoc de GATE_CIOT, sem transição nem criação de ciot_operations.
  router.post('/v1/transporte/operacoes/:operationId/ciot/pre-validar', sicatAuthMiddleware, asyncHandler(async (req, res) => {
    const response = await preValidateCiot(
      String(req.params.operationId || ''),
      (req.body || {}) as LooseRecord,
      getOperationCommandContext(req)
    );
    res.json(response);
  }));

  // ASSÍNCRONO (202) — cria ciot_operations + CAS contracted→ciot_pending + enfileira transporte.ciot.register.
  router.post('/v1/transporte/operacoes/:operationId/ciot/solicitar', sicatAuthMiddleware, asyncHandler(async (req, res) => {
    const response = await requestCiot(
      String(req.params.operationId || ''),
      (req.body || {}) as LooseRecord,
      toHeaderMap(req.headers || {}),
      getOperationCommandContext(req)
    );
    res.status(202).json(response);
  }));

  router.post('/v1/transporte/operacoes/:operationId/ciot/retificar', sicatAuthMiddleware, asyncHandler(async (req, res) => {
    const response = await rectifyCiot(
      String(req.params.operationId || ''),
      (req.body || {}) as LooseRecord,
      toHeaderMap(req.headers || {}),
      getOperationCommandContext(req)
    );
    res.status(202).json(response);
  }));

  // Cancelar o CIOT NÃO cancela a operação de transporte — ciclos distintos (ver comentário de
  // `transport-ciot-service.ts#cancelCiot`).
  router.post('/v1/transporte/operacoes/:operationId/ciot/cancelar', sicatAuthMiddleware, asyncHandler(async (req, res) => {
    const response = await cancelCiot(
      String(req.params.operationId || ''),
      (req.body || {}) as LooseRecord,
      toHeaderMap(req.headers || {}),
      getOperationCommandContext(req)
    );
    res.status(202).json(response);
  }));

  router.post('/v1/transporte/operacoes/:operationId/ciot/encerrar', sicatAuthMiddleware, asyncHandler(async (req, res) => {
    const response = await closeCiot(
      String(req.params.operationId || ''),
      (req.body || {}) as LooseRecord,
      toHeaderMap(req.headers || {}),
      getOperationCommandContext(req)
    );
    res.status(202).json(response);
  }));

  // Ciot atual + eventos paginados (histórico completo do ciclo — pré-validação, dispatch,
  // registro/rejeição/reconciliação, retificação, cancelamento, encerramento).
  router.get('/v1/transporte/operacoes/:operationId/ciot', sicatAuthMiddleware, asyncHandler(async (req, res) => {
    const response = await getCiotForOperationService(
      String(req.params.operationId || ''),
      (req.query || {}) as LooseRecord
    );
    res.json(response);
  }));

  // ===========================================================================================
  // VPO — Vale-Pedágio Obrigatório (PR-D1, DL-102 aplicado ao domínio VPO)
  // ===========================================================================================

  // SÍNCRONO (200) — roda VpoApplicabilityEngine e faz upsert na alocação (recurso mutável, uma
  // linha por operação). SEM tocar frete.
  router.post('/v1/transporte/operacoes/:operationId/vpo/avaliar-aplicabilidade', sicatAuthMiddleware, asyncHandler(async (req, res) => {
    const response = await avaliarAplicabilidadeVpo(
      String(req.params.operationId || ''),
      (req.body || {}) as LooseRecord,
      getOperationCommandContext(req)
    );
    res.json(response);
  }));

  // SÍNCRONO (200) — aquisição MANUAL (evidência declarada); exige allocation `applicable`.
  router.post('/v1/transporte/operacoes/:operationId/vpo/registrar-aquisicao', sicatAuthMiddleware, asyncHandler(async (req, res) => {
    const response = await registrarAquisicaoVpoManual(
      String(req.params.operationId || ''),
      (req.body || {}) as LooseRecord,
      getOperationCommandContext(req)
    );
    res.json(response);
  }));

  // ASSÍNCRONO (202) — aquisição via provedor abstraído; enfileira transporte.vpo.acquire.
  router.post('/v1/transporte/operacoes/:operationId/vpo/adquirir', sicatAuthMiddleware, asyncHandler(async (req, res) => {
    const response = await solicitarAquisicaoVpo(
      String(req.params.operationId || ''),
      (req.body || {}) as LooseRecord,
      toHeaderMap(req.headers || {}),
      getOperationCommandContext(req)
    );
    res.status(202).json(response);
  }));

  // Allocation atual + eventos paginados.
  router.get('/v1/transporte/operacoes/:operationId/vpo', sicatAuthMiddleware, asyncHandler(async (req, res) => {
    const response = await getVpoForOperationService(
      String(req.params.operationId || ''),
      (req.query || {}) as LooseRecord
    );
    res.json(response);
  }));

  // Cadastro CONFIGURÁVEL de fornecedoras habilitadas (read-only) — carregado via `npm run load:vpo-providers`.
  router.get('/v1/transporte/vpo/fornecedoras', sicatAuthMiddleware, asyncHandler(async (_req, res) => {
    const response = await listVpoProvidersService();
    res.json(response);
  }));

  // ===========================================================================================
  // Documentos Fiscais — importação/validação de DF-e (PR-E1). TUDO síncrono (sem job/gateway
  // nesta camada — o XML chega pronto no request; emissão real via SEFAZ fica na Fase G).
  // ===========================================================================================

  // 201 — parse + resolve schema registry vigente na emissão + valida + grava XML (storage_ref +
  // hash, nunca o XML em coluna) + fiscal_documents + links resolvidos + eventos. Dedupe por
  // (integrationAccountId, accessKey) → 409 DFE_ALREADY_IMPORTED.
  router.post('/v1/transporte/documentos-fiscais/importar', sicatAuthMiddleware, asyncHandler(async (req, res) => {
    const response = await importarDocumentoFiscal(
      (req.body || {}) as LooseRecord,
      getOperationCommandContext(req)
    );
    res.status(201).json(response);
  }));

  router.post('/v1/transporte/documentos-fiscais/:documentId/vincular', sicatAuthMiddleware, asyncHandler(async (req, res) => {
    const response = await vincularDocumentoFiscal(
      String(req.params.documentId || ''),
      (req.body || {}) as LooseRecord,
      getOperationCommandContext(req)
    );
    res.json(response);
  }));

  router.post('/v1/transporte/documentos-fiscais/:documentId/desvincular', sicatAuthMiddleware, asyncHandler(async (req, res) => {
    const response = await desvincularDocumentoFiscal(
      String(req.params.documentId || ''),
      (req.body || {}) as LooseRecord,
      getOperationCommandContext(req)
    );
    res.json(response);
  }));

  // Reprocessa a validação com o registry/operação ATUAIS a partir do XML já armazenado — NUNCA
  // muda o snapshot importado (xml_storage_ref/xml_hash/campos extraídos do XML original).
  router.post('/v1/transporte/documentos-fiscais/:documentId/revalidar', sicatAuthMiddleware, asyncHandler(async (req, res) => {
    const response = await revalidarDocumentoFiscal(
      String(req.params.documentId || ''),
      (req.body || {}) as LooseRecord,
      getOperationCommandContext(req)
    );
    res.json(response);
  }));

  router.get('/v1/transporte/operacoes/:operationId/documentos-fiscais', sicatAuthMiddleware, asyncHandler(async (req, res) => {
    const response = await getFiscalDocumentsForOperationService(
      String(req.params.operationId || ''),
      (req.query || {}) as LooseRecord
    );
    res.json(response);
  }));

  // Detalhe com issues + links — NUNCA devolve o XML inteiro (só storage_ref/hash internos).
  router.get('/v1/transporte/documentos-fiscais/:documentId', sicatAuthMiddleware, asyncHandler(async (req, res) => {
    const response = await getFiscalDocumentByIdService(
      String(req.params.documentId || ''),
      (req.query || {}) as LooseRecord
    );
    res.json(response);
  }));

  // ===========================================================================================
  // Piso mínimo — FreightFloorEngine (PR-B1, modo SHADOW)
  // ===========================================================================================

  // Calcula e PERSISTE o piso (append-only); atualiza freight.floorAmount quando outcome=calculated.
  router.post('/v1/transporte/operacoes/:operationId/calcular-piso', sicatAuthMiddleware, asyncHandler(async (req, res) => {
    const response = await calculateFreightFloorHttpService(
      String(req.params.operationId || ''),
      (req.body || {}) as LooseRecord,
      getOperationCommandContext(req)
    );
    res.json(response);
  }));

  // Histórico paginado dos cálculos já persistidos (prova o append-only).
  router.get('/v1/transporte/operacoes/:operationId/calculos-piso', sicatAuthMiddleware, asyncHandler(async (req, res) => {
    const response = await listFreightFloorCalculationsHttpService(
      String(req.params.operationId || ''),
      (req.query || {}) as LooseRecord
    );
    res.json(response);
  }));

  // Admin read-only: tabelas de piso carregadas (review_status, contagem de coeficientes, hash).
  router.get('/v1/transporte/piso/tabelas', sicatAuthMiddleware, asyncHandler(async (_req, res) => {
    const response = await listFreightFloorTablesService();
    res.json(response);
  }));

  // ===========================================================================================
  // Seguros do transportador (RCTR-C/RC-DC/RC-V) e PGR (PR-F2, Lei 14.599/2023). TUDO síncrono —
  // sem job/fila nesta fase (só `mode: 'mock'` implementado no provider, [EXTERNAL DEPENDENCY] P8).
  // ===========================================================================================

  router.post('/v1/transporte/transportadores/:partyId/apolices', sicatAuthMiddleware, asyncHandler(async (req, res) => {
    const response = await createInsurancePolicyService(
      String(req.params.partyId || ''),
      (req.body || {}) as LooseRecord,
      getOperationCommandContext(req)
    );
    res.status(201).json(response);
  }));

  router.get('/v1/transporte/transportadores/:partyId/apolices', sicatAuthMiddleware, asyncHandler(async (req, res) => {
    const response = await listInsurancePoliciesService(
      String(req.params.partyId || ''),
      (req.query || {}) as LooseRecord
    );
    res.json(response);
  }));

  // Roda o provider (mock por ora) e cria/atualiza apólices + verificações — antes das rotas com
  // `:policyId` para "verificar" não ser interpretado como um id de apólice.
  router.post('/v1/transporte/transportadores/:partyId/apolices/verificar', sicatAuthMiddleware, asyncHandler(async (req, res) => {
    const response = await verifyCarrierInsuranceService(
      String(req.params.partyId || ''),
      (req.body || {}) as LooseRecord,
      getOperationCommandContext(req)
    );
    res.json(response);
  }));

  router.patch('/v1/transporte/transportadores/:partyId/apolices/:policyId', sicatAuthMiddleware, asyncHandler(async (req, res) => {
    const response = await updateInsurancePolicyService(
      String(req.params.partyId || ''),
      String(req.params.policyId || ''),
      (req.body || {}) as LooseRecord,
      getOperationCommandContext(req)
    );
    res.json(response);
  }));

  router.post('/v1/transporte/transportadores/:partyId/pgr', sicatAuthMiddleware, asyncHandler(async (req, res) => {
    const response = await createRiskManagementPlanService(
      String(req.params.partyId || ''),
      (req.body || {}) as LooseRecord,
      getOperationCommandContext(req)
    );
    res.status(201).json(response);
  }));

  router.get('/v1/transporte/transportadores/:partyId/pgr', sicatAuthMiddleware, asyncHandler(async (req, res) => {
    const response = await listRiskManagementPlansService(
      String(req.params.partyId || ''),
      (req.query || {}) as LooseRecord
    );
    res.json(response);
  }));

  // Alertas de vencimento para o Centro Operacional/frontend — rota fixa, não sob /transportadores.
  router.get('/v1/transporte/seguros/vencimentos', sicatAuthMiddleware, asyncHandler(async (req, res) => {
    const response = await listInsuranceExpirationAlertsService((req.query || {}) as LooseRecord);
    res.json(response);
  }));

  // ===========================================================================================
  // Emissão de DF-e SANDBOX-READY (PR-G) — pipeline assíncrono build→sign→submit via
  // `@flavioneto11/fiscal-kit` (mode: sandbox), atrás de `DFE_ISSUANCE_MODE` (off por default —
  // 409 DFE_ISSUANCE_FEATURE_DISABLED). NF-e via kit; CT-e/MDF-e aguardam emissor dedicado (P9).
  // ===========================================================================================

  // ASSÍNCRONO (202) — cria dfe_issuances (marcador DL-102 já gravado) + enfileira transporte.dfe.issue.
  router.post('/v1/transporte/operacoes/:operationId/emissoes', sicatAuthMiddleware, asyncHandler(async (req, res) => {
    const response = await requestDfeIssuance(
      String(req.params.operationId || ''),
      (req.body || {}) as LooseRecord,
      toHeaderMap(req.headers || {}),
      getOperationCommandContext(req)
    );
    res.status(202).json(response);
  }));

  // Lista todas as emissões da operação (uma por documentType tentado), cada uma com sua trilha de eventos.
  router.get('/v1/transporte/operacoes/:operationId/emissoes', sicatAuthMiddleware, asyncHandler(async (req, res) => {
    const response = await listDfeIssuancesForOperationService(
      String(req.params.operationId || ''),
      (req.query || {}) as LooseRecord
    );
    res.json(response);
  }));

  // ASSÍNCRONO (202) — sandbox only (sem chamada remota; enfileira transporte.dfe.issue.cancel).
  router.post('/v1/transporte/emissoes/:issuanceId/cancelar', sicatAuthMiddleware, asyncHandler(async (req, res) => {
    const response = await cancelDfeIssuance(
      String(req.params.issuanceId || ''),
      (req.body || {}) as LooseRecord,
      toHeaderMap(req.headers || {}),
      getOperationCommandContext(req)
    );
    res.status(202).json(response);
  }));

  // ===========================================================================================
  // Regulatory Watch (PR-H1) — acompanhamento de fontes normativas. Fluxo DETECTED → INGESTED →
  // AI_ANALYZED/AI_SKIPPED → HUMAN_REVIEW (tudo pelo worker, `REGULATORY_WATCH_MODE=live`) →
  // APPROVED/REJECTED (`revisar`) → ACTIVE_APPLIED (`aplicar`, cria NOVA regulatory_rule_version
  // SEMPRE blocking=false). `verificar-agora` dispara a MESMA varredura do worker sob demanda.
  // ===========================================================================================

  router.get('/v1/transporte/watch', sicatAuthMiddleware, asyncHandler(async (req, res) => {
    const response = await listRegulatoryWatchItemsService((req.query || {}) as LooseRecord);
    res.json(response);
  }));

  router.get('/v1/transporte/watch/:itemId', sicatAuthMiddleware, asyncHandler(async (req, res) => {
    const response = await getRegulatoryWatchItemService(String(req.params.itemId || ''));
    res.json(response);
  }));

  router.post('/v1/transporte/watch/:itemId/revisar', sicatAuthMiddleware, asyncHandler(async (req, res) => {
    const response = await reviewRegulatoryWatchItemService(
      String(req.params.itemId || ''),
      (req.body || {}) as LooseRecord,
      getOperationCommandContext(req)
    );
    res.json(response);
  }));

  router.post('/v1/transporte/watch/:itemId/aplicar', sicatAuthMiddleware, asyncHandler(async (req, res) => {
    const response = await applyRegulatoryWatchItemService(
      String(req.params.itemId || ''),
      (req.body || {}) as LooseRecord,
      getOperationCommandContext(req)
    );
    res.json(response);
  }));

  // ASSÍNCRONO (202) — dispara a varredura sob demanda; dedupe por (entityType, entityId, operation)
  // via insertJobDeduplicated — no máximo UMA varredura ativa por vez, mesmo com o worker também
  // enfileirando periodicamente (`REGULATORY_WATCH_MODE=live`).
  router.post('/v1/transporte/watch/verificar-agora', sicatAuthMiddleware, asyncHandler(async (req, res) => {
    const response = await triggerRegulatoryWatchCheckNowService(
      toHeaderMap(req.headers || {}),
      getCorrelationId(req)
    );
    res.status(202).json(response);
  }));

  // ===========================================================================================
  // Promoção administrativa de regra (PR-H1) — o ÚNICO caminho para blocking=true no catálogo.
  // ===========================================================================================

  router.post('/v1/transporte/regras/:code/versoes/:versionLabel/promover', sicatAuthMiddleware, asyncHandler(async (req, res) => {
    const response = await promoteTransportRuleVersionService(
      String(req.params.code || ''),
      String(req.params.versionLabel || ''),
      (req.body || {}) as LooseRecord,
      getOperationCommandContext(req)
    );
    res.json(response);
  }));

  // ===========================================================================================
  // Centro Operacional da vertical Transporte (PR-H1) — agregados de compliance/integrações.
  // NÃO confundir com /v1/operations/overview (genérico, jobs/manifestos ambiental) nem com
  // /v1/dashboard/overview (ambiental) — nenhum dos dois é tocado por esta rota.
  // ===========================================================================================

  router.get('/v1/transporte/operations/overview', sicatAuthMiddleware, asyncHandler(async (req, res) => {
    const response = await getTransportOperationsOverviewService((req.query || {}) as LooseRecord);
    res.json(response);
  }));
}

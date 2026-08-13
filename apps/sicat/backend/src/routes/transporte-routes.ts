/**
 * Rotas da vertical TRANSPORTE — PR-A2 (catálogo regulatório read-only) + PR-A3 (cadastro-base de
 * transportadores/veículos, DL-103).
 *
 * HTTP mapping only, no molde de `dmr-routes.ts`: cada handler delega ao service. Sem SQL, sem
 * gateway, sem regra de negócio. Erros propagam como `AppError` para `error-handler.ts`
 * (problem+json). Toda rota nasce FECHADA atrás de `sicatAuthMiddleware` — a catraca de
 * `tests/api/v1-auth-coverage.test.js` cobre o registro.
 *
 * Cadastros (PR-A3) são TODOS síncronos (201/200) — sem 202/job neste PR (a verificação externa
 * de regularidade RNTRC via ANTT é Fase C; rotas `/regularidade`/`/verificar` não existem aqui).
 */

import express from 'express';
import { asyncHandler } from '../lib/http.js';
import { sicatAuthMiddleware } from '../middlewares/sicat-auth.js';
import {
  getTransportRuleHistoryService,
  getTransportRuleService,
  listTransportRulesService
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

type LooseRecord = Record<string, unknown>;
type RequestWithContext = express.Request & { correlationId?: string | null };

function getCorrelationId(req: express.Request): string | null {
  const correlationId = (req as RequestWithContext).correlationId;
  return typeof correlationId === 'string' && correlationId.length > 0 ? correlationId : null;
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
}

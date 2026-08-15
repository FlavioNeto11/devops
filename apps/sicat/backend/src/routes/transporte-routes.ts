/**
 * Rotas da vertical TRANSPORTE — PR-A2 (catálogo regulatório read-only, DL-103).
 *
 * HTTP mapping only, no molde de `dmr-routes.ts`: cada handler delega ao
 * `transporte-regras-service`. Sem SQL, sem gateway, sem regra de negócio. Erros propagam como
 * `AppError` para `error-handler.ts` (problem+json). Toda rota nasce FECHADA atrás de
 * `sicatAuthMiddleware` — a catraca de `tests/api/v1-auth-coverage.test.js` cobre o registro.
 */

import express from 'express';
import { asyncHandler } from '../lib/http.js';
import { sicatAuthMiddleware } from '../middlewares/sicat-auth.js';
import {
  getTransportRuleHistoryService,
  getTransportRuleService,
  listTransportRulesService
} from '../services/transporte-regras-service.js';

type LooseRecord = Record<string, unknown>;

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
}

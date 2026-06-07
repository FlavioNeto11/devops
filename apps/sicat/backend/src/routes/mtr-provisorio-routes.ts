/**
 * Rotas MTR provisório — fase 04 (cadeia `mtr-provisorio-fluxo-base`).
 *
 * HTTP mapping only. Cada handler delega ao `mtr-provisorio-service`.
 * Sem SQL, sem gateway, sem regra de negócio. Erros são propagados como
 * `AppError` (serializados em `application/problem+json` por
 * `src/middlewares/error-handler.ts`).
 */

import express from 'express';
import { asyncHandler } from '../lib/http.js';
import {
  cancelMtrProvisorioService,
  createMtrProvisorioService,
  enqueueMtrProvisorioPrintService,
  getMtrProvisorioService,
  listMtrProvisorioService
} from '../services/mtr-provisorio-service.js';

type LooseRecord = Record<string, unknown>;
type RequestWithContext = express.Request & { correlationId?: string | null };

function getCorrelationId(req: express.Request): string | null {
  const correlationId = (req as RequestWithContext).correlationId;
  return typeof correlationId === 'string' && correlationId.length > 0 ? correlationId : null;
}

function toHeaderMap(headers: express.Request['headers']): Record<string, string | undefined> {
  const out: Record<string, string | undefined> = {};
  for (const [key, value] of Object.entries(headers)) {
    if (typeof value === 'string') out[key] = value;
    else if (Array.isArray(value)) out[key] = value.join(', ');
    else out[key] = undefined;
  }
  return out;
}

export function registerMtrProvisorioRoutes(router: express.Router): void {
  router.get('/v1/mtr-provisorio', asyncHandler(async (req, res) => {
    const response = await listMtrProvisorioService((req.query || {}) as LooseRecord);
    res.json(response);
  }));

  router.post('/v1/mtr-provisorio', asyncHandler(async (req, res) => {
    const response = await createMtrProvisorioService(
      (req.body || {}) as LooseRecord,
      toHeaderMap(req.headers),
      getCorrelationId(req)
    );
    res.status(202).json(response);
  }));

  router.get('/v1/mtr-provisorio/:id', asyncHandler(async (req, res) => {
    const response = await getMtrProvisorioService(String(req.params.id || ''));
    res.json(response);
  }));

  router.delete('/v1/mtr-provisorio/:id', asyncHandler(async (req, res) => {
    const response = await cancelMtrProvisorioService(
      String(req.params.id || ''),
      getCorrelationId(req)
    );
    res.json(response);
  }));

  router.post('/v1/mtr-provisorio/:id/print', asyncHandler(async (req, res) => {
    const response = await enqueueMtrProvisorioPrintService(
      String(req.params.id || ''),
      (req.body || {}) as LooseRecord,
      toHeaderMap(req.headers),
      getCorrelationId(req)
    );
    res.status(202).json(response);
  }));
}

/**
 * Rotas DMR — fase 04 (cadeia `dmr-fluxo-base`).
 *
 * HTTP mapping only: cada handler delega ao `dmr-service`. Sem SQL, sem
 * gateway, sem regra de negócio. Erros são propagados como `AppError`
 * para `error-handler.ts` (problem+json).
 */

import express from 'express';
import { asyncHandler } from '../lib/http.js';
import {
  addDmrItemService,
  cancelDmrService,
  consolidateDmrService,
  createDmrService,
  enqueueDmrSubmit,
  getDmrDetailService,
  getDmrStatusService,
  listDmrItemsService,
  listDmrService,
  listPendingDmrService,
  removeDmrItemService
} from '../services/dmr-service.js';

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

export function registerDmrRoutes(router: express.Router): void {
  router.get('/v1/dmr', asyncHandler(async (req, res) => {
    const response = await listDmrService((req.query || {}) as LooseRecord);
    res.json(response);
  }));

  router.post('/v1/dmr', asyncHandler(async (req, res) => {
    const response = await createDmrService(
      (req.body || {}) as LooseRecord,
      toHeaderMap(req.headers),
      getCorrelationId(req)
    );
    res.status(201).json(response);
  }));

  router.get('/v1/dmr/pendentes', asyncHandler(async (req, res) => {
    const response = await listPendingDmrService((req.query || {}) as LooseRecord);
    res.json(response);
  }));

  router.get('/v1/dmr/:dmrId', asyncHandler(async (req, res) => {
    const response = await getDmrDetailService(String(req.params.dmrId || ''));
    res.json(response);
  }));

  router.delete('/v1/dmr/:dmrId', asyncHandler(async (req, res) => {
    const response = await cancelDmrService(String(req.params.dmrId || ''), getCorrelationId(req));
    res.json(response);
  }));

  router.post('/v1/dmr/:dmrId/consolidate', asyncHandler(async (req, res) => {
    const response = await consolidateDmrService(
      String(req.params.dmrId || ''),
      (req.body || {}) as LooseRecord,
      toHeaderMap(req.headers),
      getCorrelationId(req)
    );
    res.json(response);
  }));

  router.post('/v1/dmr/:dmrId/submit', asyncHandler(async (req, res) => {
    const response = await enqueueDmrSubmit(
      String(req.params.dmrId || ''),
      (req.body || {}) as LooseRecord,
      toHeaderMap(req.headers),
      getCorrelationId(req)
    );
    res.status(202).json(response);
  }));

  router.get('/v1/dmr/:dmrId/status', asyncHandler(async (req, res) => {
    const response = await getDmrStatusService(String(req.params.dmrId || ''));
    res.json(response);
  }));

  router.get('/v1/dmr/:dmrId/items', asyncHandler(async (req, res) => {
    const response = await listDmrItemsService(String(req.params.dmrId || ''));
    res.json(response);
  }));

  router.post('/v1/dmr/:dmrId/items', asyncHandler(async (req, res) => {
    const response = await addDmrItemService(
      String(req.params.dmrId || ''),
      (req.body || {}) as LooseRecord,
      toHeaderMap(req.headers),
      getCorrelationId(req)
    );
    res.status(201).json(response);
  }));

  router.delete('/v1/dmr/:dmrId/items/:itemId', asyncHandler(async (req, res) => {
    await removeDmrItemService(String(req.params.dmrId || ''), String(req.params.itemId || ''));
    res.status(204).end();
  }));
}

import type { NextFunction, Request, Response } from 'express';
import { createCorrelationId } from '../lib/ids.js';

type RequestWithCorrelation = Request & { correlationId?: string };

export function requestContextMiddleware(req: Request, res: Response, next: NextFunction): void {
  const incoming = req.header('X-Correlation-Id');
  const correlationId = incoming || createCorrelationId();
  (req as RequestWithCorrelation).correlationId = correlationId;
  res.locals.correlationId = correlationId;
  res.setHeader('X-Correlation-Id', correlationId);
  next();
}

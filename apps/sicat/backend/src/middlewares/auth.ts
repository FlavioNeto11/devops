import type { NextFunction, Request, Response } from 'express';
import { config } from '../lib/config.js';
import { createProblem } from '../lib/problem.js';

export function authMiddleware(req: Request, res: Response, next: NextFunction): void {
  if (!config.authRequired) return next();
  if (req.path === '/health' || req.path.startsWith('/docs') || req.path.startsWith('/openapi.')) {
    return next();
  }
  const authorization = req.header('Authorization');
  if (!authorization || !authorization.startsWith('Bearer ')) {
    res.status(401).type('application/problem+json').json(createProblem({
      title: 'Unauthorized',
      status: 401,
      detail: 'Missing or invalid Authorization header. Expected Bearer token.',
      instance: req.originalUrl,
      correlationId: res.locals.correlationId
    }));
    return;
  }
  return next();
}

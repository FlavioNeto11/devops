import type { Request, Response } from 'express';
import { createProblem } from '../lib/problem.js';

export function notFoundMiddleware(req: Request, res: Response): void {
  res.status(404).type('application/problem+json').json(createProblem({
    title: 'Not Found',
    status: 404,
    detail: `Route ${req.method} ${req.originalUrl} was not found.`,
    instance: req.originalUrl,
    correlationId: res.locals.correlationId
  }));
}

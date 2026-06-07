import type { NextFunction, Request, Response } from 'express';
import { createProblem } from '../lib/problem.js';

type ErrorLike = {
  status?: number;
  statusCode?: number;
  title?: string;
  message?: string;
  code?: string;
  errors?: unknown;
};

function toErrorLike(err: unknown): ErrorLike {
  if (!err || typeof err !== 'object') {
    return {};
  }
  return err as ErrorLike;
}

export function errorHandlerMiddleware(err: unknown, req: Request, res: Response, _next: NextFunction): void {
  const parsedError = toErrorLike(err);
  const status = Number(parsedError.status || parsedError.statusCode || 500);
  if (res.headersSent) return;
  res.status(status).type('application/problem+json').json(createProblem({
    title: parsedError.title || 'Internal Server Error',
    status,
    detail: parsedError.message || 'Unhandled exception while processing request.',
    code: parsedError.code,
    instance: req.originalUrl,
    correlationId: res.locals.correlationId,
    errors: parsedError.errors
  }));
}

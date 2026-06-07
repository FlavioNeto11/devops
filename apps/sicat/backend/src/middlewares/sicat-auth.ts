import type { NextFunction, Request, Response } from 'express';
import { config } from '../lib/config.js';
import { createProblem } from '../lib/problem.js';
import { verifyAccessToken } from '../lib/sicat-security.js';

function unauthorized(res: Response, req: Request, detail: string) {
  return res
    .status(401)
    .type('application/problem+json')
    .json(createProblem({
      title: 'Unauthorized',
      status: 401,
      detail,
      instance: req.originalUrl,
      correlationId: res.locals.correlationId
    }));
}

type VerifiedSicatPayload = {
  sub: string;
  email?: string;
  name?: string;
  roles?: string[];
  [key: string]: unknown;
};

type RequestWithSicat = Request & {
  sicatUser?: {
    userId: string;
    email?: string;
    name?: string;
    roles: string[];
  };
  sicatTokenPayload?: VerifiedSicatPayload;
};

export function sicatAuthMiddleware(req: Request, res: Response, next: NextFunction): void {
  const authorization = req.header('Authorization');
  if (!authorization || !authorization.startsWith('Bearer ')) {
    unauthorized(res, req, 'Missing or invalid Authorization header. Expected SICAT Bearer token.');
    return;
  }

  const token = authorization.slice('Bearer '.length).trim();
  if (!token) {
    unauthorized(res, req, 'SICAT access token ausente.');
    return;
  }

  const verification = verifyAccessToken(token, {
    secret: config.sicatAccessTokenSecret
  });

  if (!verification.valid) {
    unauthorized(res, req, 'SICAT access token inválido ou expirado.');
    return;
  }

  const requestWithSicat = req as RequestWithSicat;
  const payload = verification.payload as VerifiedSicatPayload;

  requestWithSicat.sicatUser = {
    userId: payload.sub,
    email: payload.email,
    name: payload.name,
    roles: Array.isArray(payload.roles) ? payload.roles : []
  };
  requestWithSicat.sicatTokenPayload = payload;
  return next();
}

import { randomUUID } from 'node:crypto';
import type { FastifyInstance } from 'fastify';
import { env } from '../../env.js';

interface JwtPayload {
  sub: string;
  email: string;
  name: string;
  jti?: string;
}

export function createSigner(app: FastifyInstance) {
  function signAccess(payload: JwtPayload): string {
    return app.jwt.sign(payload, { expiresIn: '15m' });
  }

  function signRefresh(payload: JwtPayload): string {
    // Use a separate secret for refresh tokens and add a unique jti to avoid token collisions.
    const jwt = app.jwt as unknown as {
      sign: (payload: JwtPayload, options: { expiresIn: string; key: string }) => string;
      verify: (token: string, options: { key: string }) => JwtPayload;
    };
    return jwt.sign({ ...payload, jti: randomUUID() }, { expiresIn: '7d', key: env.JWT_REFRESH_SECRET });
  }

  function verifyRefresh(token: string): JwtPayload {
    const jwt = app.jwt as unknown as {
      verify: (token: string, options: { key: string }) => JwtPayload;
    };
    return jwt.verify(token, { key: env.JWT_REFRESH_SECRET });
  }

  return { signAccess, signRefresh, verifyRefresh };
}

import { Response, NextFunction } from 'express';
import jwt from 'jsonwebtoken';
import { env } from '../config/env';
import { AuthedRequest, AuthTokenPayload } from '../types';

// Guard JWT para rotas REST protegidas.
export function authGuard(req: AuthedRequest, res: Response, next: NextFunction): void {
  const header = req.headers.authorization;
  // Token via header (padrão) ou query `access_token` (para <img>/<video> na web,
  // que não conseguem enviar cabeçalho Authorization).
  const queryToken = typeof req.query.access_token === 'string' ? req.query.access_token : undefined;
  const token = header?.startsWith('Bearer ') ? header.slice('Bearer '.length) : queryToken;
  if (!token) {
    res.status(401).json({ error: 'Não autenticado' });
    return;
  }
  try {
    const payload = jwt.verify(token, env.jwtSecret) as AuthTokenPayload;
    req.user = payload;
    next();
  } catch {
    res.status(401).json({ error: 'Token inválido ou expirado' });
  }
}

export function signToken(payload: AuthTokenPayload): string {
  return jwt.sign(payload, env.jwtSecret, { expiresIn: env.jwtExpiresIn } as jwt.SignOptions);
}

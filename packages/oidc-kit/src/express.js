import { verifyAccessToken } from './session.js';

/**
 * Middleware Express que exige uma sessao valida (token no header Authorization: Bearer).
 * Em sucesso, popula req.session com o payload; senao responde 401.
 *   app.use(requireSession({ secret, prefix: 'sicat_access' }))
 */
export function requireSession({ secret, prefix } = {}) {
  return (req, res, next) => {
    const raw = String((req.headers && req.headers.authorization) || '');
    const token = raw.startsWith('Bearer ') ? raw.slice(7) : raw;
    const result = verifyAccessToken(token, { secret, prefix });
    if (!result.valid) {
      res.status(401).json({ error: { code: 'UNAUTHORIZED', message: result.reason } });
      return;
    }
    req.session = result.payload;
    next();
  };
}

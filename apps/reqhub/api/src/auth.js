// Auth da IA de autoria do Reqhub: as rotas /v1/authoring/* exigem
// Authorization: Bearer ${REQHUB_API_TOKEN}. Fail-closed — se a env nao esta
// configurada, as rotas retornam 503 (AUTH_DISABLED): o servico NUNCA fica
// aberto por engano. Mesmo padrao do ai-control-plane (operador autenticado).
import crypto from 'node:crypto';

// Comparacao em tempo constante (evita timing attack no token).
export function timingSafeEqualStr(a, b) {
  const bufA = Buffer.from(String(a));
  const bufB = Buffer.from(String(b));
  if (bufA.length !== bufB.length) return false;
  return crypto.timingSafeEqual(bufA, bufB);
}

// Pura/testavel: decide a autorizacao a partir do header e do token configurado.
// Retorna { ok: true, identity } ou { ok: false, status, code, message }.
export function evaluateAuth(authorizationHeader, configuredToken) {
  if (typeof configuredToken !== 'string' || configuredToken.trim().length === 0) {
    return {
      ok: false,
      status: 503,
      code: 'AUTH_DISABLED',
      message: 'REQHUB_API_TOKEN nao configurado; geracao de IA desabilitada (fail-closed)',
    };
  }
  const match = /^Bearer\s+(.+)$/i.exec(authorizationHeader || '');
  if (!match) {
    return { ok: false, status: 401, code: 'UNAUTHORIZED', message: 'missing Authorization: Bearer <token> header' };
  }
  if (!timingSafeEqualStr(match[1].trim(), configuredToken.trim())) {
    return { ok: false, status: 401, code: 'UNAUTHORIZED', message: 'invalid token' };
  }
  return { ok: true, identity: 'operator' };
}

// Middleware Express para as rotas de autoria.
export function requireAuthoringAuth(req, res, next) {
  const result = evaluateAuth(req.headers.authorization, process.env.REQHUB_API_TOKEN);
  if (!result.ok) {
    return res.status(result.status).json({ error: { code: result.code, message: result.message } });
  }
  req.identity = result.identity;
  next();
}

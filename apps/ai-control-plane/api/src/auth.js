// Auth do ai-control-plane: leituras são liberadas; escritas exigem
// Authorization: Bearer ${AI_CONTROL_PLANE_TOKEN}.
// Fail-closed: se a env não está configurada, escritas retornam 503 —
// o serviço NUNCA fica aberto para escrita por engano.
import crypto from 'node:crypto';

// Comparação em tempo constante (evita timing attack no token).
export function timingSafeEqualStr(a, b) {
  const bufA = Buffer.from(String(a));
  const bufB = Buffer.from(String(b));
  if (bufA.length !== bufB.length) return false;
  return crypto.timingSafeEqual(bufA, bufB);
}

// Função PURA (testável sem Express): decide o resultado da autorização de
// escrita a partir do header e do token configurado.
// Retorna { ok: true } ou { ok: false, status, code, message }.
export function evaluateWriteAuth(authorizationHeader, configuredToken) {
  if (typeof configuredToken !== 'string' || configuredToken.trim().length === 0) {
    return {
      ok: false,
      status: 503,
      code: 'WRITES_DISABLED',
      message: 'AI_CONTROL_PLANE_TOKEN is not configured; write operations are disabled',
    };
  }
  const match = /^Bearer\s+(.+)$/i.exec(authorizationHeader || '');
  if (!match) {
    return {
      ok: false,
      status: 401,
      code: 'UNAUTHORIZED',
      message: 'missing Authorization: Bearer <token> header',
    };
  }
  if (!timingSafeEqualStr(match[1].trim(), configuredToken.trim())) {
    return { ok: false, status: 401, code: 'UNAUTHORIZED', message: 'invalid token' };
  }
  return { ok: true };
}

// Middleware Express para rotas de escrita.
export function requireWriteAuth(req, res, next) {
  const result = evaluateWriteAuth(
    req.headers.authorization,
    process.env.AI_CONTROL_PLANE_TOKEN
  );
  if (!result.ok) {
    return res
      .status(result.status)
      .json({ error: { code: result.code, message: result.message } });
  }
  next();
}

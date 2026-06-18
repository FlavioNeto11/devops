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

// Identidade vinda da BORDA (oauth2-proxy ForwardAuth — mesmo SSO da /devops). A borda
// SEMPRE injeta/sobrescreve X-Auth-Request-* e o processo so e alcancavel via Traefik,
// entao confiar nesses headers e seguro (mesmo modelo do pm-api do Console).
export function parseGroups(raw) {
  return String(raw || '').split(',').map((g) => g.trim()).filter(Boolean);
}
export function ssoIdentity(headers = {}) {
  const email = String(headers['x-auth-request-email'] || headers['x-forwarded-email'] || '').trim().toLowerCase();
  const user = String(headers['x-auth-request-user'] || headers['x-forwarded-user'] || '').trim();
  const groups = parseGroups(headers['x-auth-request-groups'] || headers['x-forwarded-groups']);
  if (!email && !user && groups.length === 0) return null;
  return { email: email || null, user: user || null, groups, isAdmin: groups.includes('platform-admins') };
}

// Middleware Express para as rotas de autoria. Aceita: (1) admin autenticado pelo SSO
// (sem token separado — UX de produto: logou, usa); (2) Bearer token (scripts/uso fora
// da borda). Member logado (sem platform-admins) -> 403. Sem nada -> 401/503 (fail-closed).
export function requireAuthoringAuth(req, res, next) {
  const sso = ssoIdentity(req.headers);
  if (sso && sso.isAdmin) { req.identity = sso.email || 'sso-admin'; req.sso = sso; return next(); }
  if (sso && !sso.isAdmin) {
    return res.status(403).json({ error: { code: 'FORBIDDEN', message: 'autoria com IA requer o grupo platform-admins' } });
  }
  const result = evaluateAuth(req.headers.authorization, process.env.REQHUB_API_TOKEN);
  if (!result.ok) {
    return res.status(result.status).json({ error: { code: result.code, message: result.message } });
  }
  req.identity = result.identity;
  next();
}

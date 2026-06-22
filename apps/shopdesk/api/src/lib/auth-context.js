// lib/auth-context.js — identidade/tenant pela BORDA SSO (X-Auth-Request-*, oauth2-proxy/Keycloak)
// com fallback p/ headers (lab) (bloco oidc-sessao + multi-tenant). AUTH_REQUIRED=false libera no pod
// (a borda já gateia o browser via console-auth-401/redirect). Papéis em cascata; deny-by-default quando exigido.
const RANK = { admin: 3, manager: 2, member: 1 };

export function authContext(req) {
  const email = String(req.headers['x-auth-request-email'] || req.headers['x-auth-request-user'] || '').trim().toLowerCase();
  const groups = String(req.headers['x-auth-request-groups'] || '');
  const role = email ? (groups.includes('platform-admins') ? 'admin' : 'member') : String(req.headers['x-role'] || 'member').toLowerCase();
  const tenant = email ? ((/tenant:([\w-]+)/.exec(groups) || [])[1] || 'default') : String(req.headers['x-tenant-id'] || 'default');
  return { email: email || null, role, tenant, rank: RANK[role] || 0 };
}

export function requireAuth(req, res, next) {
  const a = authContext(req);
  req.auth = a;
  if ((process.env.AUTH_REQUIRED || 'false') === 'true' && !a.email) {
    return res.status(401).json({ error: { message: 'não autenticado (SSO requerido)' } });
  }
  next();
}

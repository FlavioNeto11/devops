// rbac.js — RBAC multi-tenant (rbac-multitenant). Papéis neuroevolui: owner > clinic_manager > professional > patient; deny por padrão.
// Identidade: pela borda OIDC (oauth2-proxy -> X-Auth-Request-*) ou headers X-Role/X-Tenant-Id (teste local).
const RANK = { owner: 4, clinic_manager: 3, professional: 2, patient: 1 };

export function authContext(req) {
  const ssoEmail = req.headers['x-auth-request-email'] || req.headers['x-auth-request-user'] || '';
  const ssoGroups = req.headers['x-auth-request-groups'] || '';
  let role;
  if (ssoEmail) {
    role = ssoGroups.includes('platform-admins') ? 'owner' : 'professional';
  } else {
    role = (req.headers['x-role'] || 'patient').toLowerCase();
  }
  return { tenantId: Number(req.headers['x-tenant-id']) || 1, role, user: ssoEmail || req.headers['x-user'] || 'system' };
}

export function requireRole(minRole) {
  return async (req, reply) => {
    const ctx = authContext(req);
    if ((RANK[ctx.role] || 0) < (RANK[minRole] || 99)) {
      reply.code(403).send({ error: { message: 'acesso negado (requer ' + minRole + ')' } });
      return reply;
    }
  };
}

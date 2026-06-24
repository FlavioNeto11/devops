// rbac.js — RBAC multi-tenant (bloco rbac-multitenant). Papéis em cascata; deny por padrão.
// Hierarquia: owner > clinic_manager > professional > patient
// Identidade via header (X-Tenant-Id/X-Role) como stand-in da sessão OIDC (login real = client no Keycloak).
const RANK = { owner: 4, clinic_manager: 3, professional: 2, patient: 1 };

// Identidade: pela borda OIDC (oauth2-proxy -> X-Auth-Request-*) quando atrás do SSO;
// senão pelos headers X-Role/X-Tenant-Id (teste local/direto). Sem login direto no app.
export function authContext(req) {
  const ssoEmail = req.headers['x-auth-request-email'] || req.headers['x-auth-request-user'] || '';
  const ssoGroups = req.headers['x-auth-request-groups'] || '';
  let role;
  if (ssoEmail) {
    if (ssoGroups.includes('platform-admins') || ssoGroups.includes('owners')) role = 'owner';
    else if (ssoGroups.includes('clinic-managers')) role = 'clinic_manager';
    else if (ssoGroups.includes('professionals')) role = 'professional';
    else role = 'patient';
  } else {
    const h = (req.headers['x-role'] || 'patient').toLowerCase();
    role = RANK[h] ? h : 'patient';
  }
  return { tenantId: Number(req.headers['x-tenant-id']) || 1, role, user: ssoEmail || 'local' };
}

export function requireRole(minRole) {
  return async (req, reply) => {
    const ctx = authContext(req);
    if ((RANK[ctx.role] || 0) < (RANK[minRole] || 99)) {
      reply.code(403).send({ error: { message: `acesso negado (precisa de ${minRole})` } });
      return reply;
    }
  };
}

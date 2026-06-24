// rbac.js — RBAC multi-tenant clínica (bloco rbac-multitenant). Papéis em cascata; deny por padrão.
// Hierarquia: owner > clinic_manager > professional > patient.
// Identidade: pela borda OIDC (oauth2-proxy -> X-Auth-Request-*) ou X-Role/X-Tenant-Id (dev/teste).
const RANK = { owner: 4, clinic_manager: 3, professional: 2, patient: 1 };

export function authContext(req) {
  const ssoEmail = req.headers["x-auth-request-email"] || req.headers["x-auth-request-user"] || "";
  const ssoGroups = req.headers["x-auth-request-groups"] || "";
  const role = ssoEmail
    ? (ssoGroups.includes("platform-admins") ? "owner" : "patient")
    : (req.headers["x-role"] || "patient").toLowerCase();
  return {
    tenantId: Number(req.headers["x-tenant-id"]) || 1,
    role,
    user: ssoEmail || req.headers["x-user"] || "system",
  };
}

export function requireRole(minRole) {
  return async (req, reply) => {
    const ctx = authContext(req);
    if ((RANK[ctx.role] || 0) < (RANK[minRole] || 99)) {
      reply.code(403).send({ error: { message: "acesso negado (precisa de " + minRole + ")" } });
      return reply;
    }
  };
}

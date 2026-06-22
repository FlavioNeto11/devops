// rbac.js — RBAC multi-tenant (bloco rbac-multitenant). Papéis em cascata; deny por padrão.
// NOTA: identidade via header (X-Tenant-Id/X-Role) como stand-in da sessão OIDC (login real = client no Keycloak).
const RANK = { admin: 3, manager: 2, member: 1 };
// Identidade: pela borda OIDC (oauth2-proxy do Console -> X-Auth-Request-*) quando atrás do SSO;
// senão pelos headers X-Role/X-Tenant-Id (teste local/direto). Sem login direto no app.
export function authContext(req) {
  const ssoEmail = req.headers["x-auth-request-email"] || req.headers["x-auth-request-user"] || "";
  const ssoGroups = req.headers["x-auth-request-groups"] || "";
  const role = ssoEmail ? (ssoGroups.includes("platform-admins") ? "admin" : "member") : (req.headers["x-role"] || "member").toLowerCase();
  return { tenantId: Number(req.headers["x-tenant-id"]) || 1, role, user: ssoEmail || "local" };
}
export function requireRole(role) { return async (req, reply) => { const ctx = authContext(req); if ((RANK[ctx.role] || 0) < (RANK[role] || 99)) { reply.code(403).send({ error: { message: "acesso negado (precisa de " + role + ")" } }); return reply; } }; }

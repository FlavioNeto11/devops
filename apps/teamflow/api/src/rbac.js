// rbac.js — RBAC multi-tenant (bloco rbac-multitenant). Papéis em cascata; deny por padrão.
// NOTA: identidade via header (X-Tenant-Id/X-Role) como stand-in da sessão OIDC (login real = client no Keycloak).
const RANK = { admin: 3, manager: 2, member: 1 };
export function authContext(req) { return { tenantId: Number(req.headers["x-tenant-id"]) || 1, role: (req.headers["x-role"] || "member").toLowerCase() }; }
export function requireRole(role) { return async (req, reply) => { const ctx = authContext(req); if ((RANK[ctx.role] || 0) < (RANK[role] || 99)) { reply.code(403).send({ error: { message: "acesso negado (precisa de " + role + ")" } }); return reply; } }; }

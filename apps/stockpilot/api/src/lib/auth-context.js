// lib/auth-context.js — identidade + tenant derivados do gate SSO de borda (X-Auth-Request-*).
//
// O middleware de borda (console-auth-401/console-auth-redirect → oauth2-proxy/Keycloak realm nvit)
// valida a sessão e INJETA estes headers a partir do token validado. O cliente NÃO consegue
// forjá-los: a borda (forwardAuth.authResponseHeaders) sobrescreve esses nomes de header com os
// valores do servidor de auth. Por isso o tenant é derivado SEMPRE desses headers de borda,
// nunca de um id enviado pelo cliente — garantindo o isolamento mesmo manipulando o JWT.

const AUTH_REQUIRED = (process.env.AUTH_REQUIRED ?? 'true') !== 'false';
const DEFAULT_TENANT = (process.env.DEFAULT_TENANT || 'default').toLowerCase();

// Extrai o tenant de um grupo Keycloak no formato "tenant:<key>" ou ".../tenants/<key>".
export function tenantFromGroups(groups) {
  for (const g of groups) {
    const m = /(?:^|\/)tenants?[:/]([a-z0-9][a-z0-9._-]*)/i.exec(String(g).trim());
    if (m) return m[1].toLowerCase();
  }
  return null;
}

// Resolve identidade/tenant a partir da request. Retorna null quando não há identidade de borda
// e a auth é obrigatória (deny-by-default).
export function resolveAuth(req) {
  const user = req.header('X-Auth-Request-User') || '';
  const email = req.header('X-Auth-Request-Email') || '';
  const groupsRaw = req.header('X-Auth-Request-Groups') || '';

  if (!user && !email) {
    // Sem identidade de borda. Em produção a borda já bloqueou (401); aqui é deny-by-default.
    // Em DEV/local (AUTH_REQUIRED=false) permite um tenant explícito p/ rodar/test sem o gate.
    if (AUTH_REQUIRED) return null;
    const tenant = (req.header('X-Tenant-Id') || DEFAULT_TENANT).toLowerCase();
    return { user: 'dev', email: '', groups: [], tenant };
  }

  const groups = groupsRaw.split(',').map((s) => s.trim()).filter(Boolean);
  const tenant = tenantFromGroups(groups) || DEFAULT_TENANT;
  return { user: user || email, email, groups, tenant };
}

// Middleware Express: exige sessão (deny-by-default) e anexa req.auth + req.tenant (string).
// Não toca req.tenantId (usado por records — escopo legado inteiro/INTEGER), só ADICIONA.
export function requireAuth(req, res, next) {
  const auth = resolveAuth(req);
  if (!auth) return res.status(401).json({ error: { message: 'autenticação obrigatória' } });
  req.auth = auth;
  req.tenant = auth.tenant;
  next();
}

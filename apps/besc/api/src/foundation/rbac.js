// RBAC em dados (Fase 0 — docs/evolution/01-rbac-permissoes.md). O codigo declara
// APENAS o catalogo de permissoes; papeis e a matriz papel×permissao vivem no banco
// (papel novo = linhas novas, sem deploy). Deny por padrao; anonimo = papel `public`.
import { verifyAccessToken } from '@flavioneto11/oidc-kit';
import { query, isDbReady } from '../db.js';
import { config, foundationEnabled } from '../config.js';

// Catalogo (Fase 0). Criar permissao NOVA exige deploy — fronteira honesta do design.
export const PERMISSION_CATALOG = [
  { key: 'content:read', label: 'Ler o portal de conhecimento', category: 'conteudo', sensitive: false },
  { key: 'content:write', label: 'Editar biblioteca/jurisprudência', category: 'conteudo', sensitive: false },
  { key: 'cases:read', label: 'Ver casos do levantamento', category: 'casos', sensitive: false },
  { key: 'cases:write', label: 'Editar casos do levantamento', category: 'casos', sensitive: false },
  { key: 'users:manage', label: 'Gerenciar usuários', category: 'administracao', sensitive: true },
  { key: 'rbac:manage', label: 'Gerenciar papéis e permissões', category: 'administracao', sensitive: true },
  { key: 'rbac:invite', label: 'Convidar usuários qualificados', category: 'administracao', sensitive: true },
  { key: 'audit:read', label: 'Consultar a trilha de auditoria', category: 'auditoria', sensitive: false },
  { key: 'audit:export', label: 'Exportar a trilha de auditoria', category: 'auditoria', sensitive: false },
  // marketplace (Fase 1)
  { key: 'titles:read', label: 'Ver títulos e contratos do marketplace', category: 'marketplace', sensitive: false },
  { key: 'titles:create', label: 'Cadastrar/publicar títulos', category: 'marketplace', sensitive: true },
  { key: 'valuations:write', label: 'Registrar valor de mercado', category: 'marketplace', sensitive: false },
  { key: 'params:write', label: 'Parametrizar tokenização (fator e valor)', category: 'marketplace', sensitive: true },
  { key: 'tokens:issue', label: 'Emitir tokens e registrar contratos', category: 'marketplace', sensitive: true },
  { key: 'legal_status:transition', label: 'Transicionar o estado jurídico do título', category: 'marketplace', sensitive: true },
  { key: 'legal_status:read', label: 'Ler o histórico jurídico do título', category: 'marketplace', sensitive: false },
  // investidor (Fase 2)
  { key: 'contracts:read', label: 'Ver a própria carteira e contratos', category: 'investidor', sensitive: false },
  { key: 'contracts:contract', label: 'Contratar tokens', category: 'investidor', sensitive: false },
  { key: 'leases:lease', label: 'Alugar títulos', category: 'investidor', sensitive: false },
];

// Seeds dos papeis minimos (linhas; insert-if-missing — o admin pode recombinar depois).
const ROLE_SEEDS = [
  { key: 'public', label: 'Público (anônimo)', perms: [['content:read', 'all']] },
  { key: 'investor', label: 'Investidor', perms: [['content:read', 'all'], ['contracts:read', 'own'], ['contracts:contract', 'own'], ['leases:lease', 'own']] },
  { key: 'lawyer', label: 'Advogado (auditoria)', perms: [['content:read', 'all'], ['titles:read', 'linked'], ['legal_status:read', 'linked'], ['audit:read', 'linked'], ['audit:export', 'linked']] },
  { key: 'judge', label: 'Juiz (auditoria)', perms: [['content:read', 'all'], ['titles:read', 'linked'], ['legal_status:read', 'linked'], ['audit:read', 'linked'], ['audit:export', 'linked']] },
  {
    key: 'manager', label: 'Gestor', perms: [
      ['content:read', 'all'], ['content:write', 'all'], ['cases:read', 'all'], ['cases:write', 'all'],
      ['users:manage', 'all'], ['rbac:manage', 'all'], ['rbac:invite', 'all'],
      ['audit:read', 'all'], ['audit:export', 'all'],
      ['titles:read', 'all'], ['titles:create', 'all'], ['valuations:write', 'all'], ['params:write', 'all'],
      ['tokens:issue', 'all'], ['legal_status:transition', 'all'], ['legal_status:read', 'all'],
    ],
  },
  { key: 'admin', label: 'Administrador da plataforma', perms: [['*', 'all']] },
];

export async function seedRbac() {
  for (const p of PERMISSION_CATALOG) {
    await query(
      `INSERT INTO permissions (key, label, category, is_sensitive) VALUES ($1,$2,$3,$4)
       ON CONFLICT (key) DO UPDATE SET label = EXCLUDED.label, category = EXCLUDED.category, is_sensitive = EXCLUDED.is_sensitive`,
      [p.key, p.label, p.category, p.sensitive],
    );
  }
  // wildcard do admin como linha real do catalogo (resolver trata '*')
  await query(`INSERT INTO permissions (key, label, category, is_sensitive)
               VALUES ('*', 'Todas as permissões (wildcard)', 'administracao', true)
               ON CONFLICT (key) DO NOTHING`);
  for (const r of ROLE_SEEDS) {
    await query(
      `INSERT INTO roles (key, label, is_system) VALUES ($1,$2,true) ON CONFLICT (key) DO NOTHING`,
      [r.key, r.label],
    );
    for (const [perm, scope] of r.perms) {
      await query(
        `INSERT INTO role_permissions (role_id, permission_key, scope)
         SELECT id, $2, $3 FROM roles WHERE key = $1
         ON CONFLICT (role_id, permission_key) DO NOTHING`,
        [r.key, perm, scope],
      );
    }
  }
}

// ---------------------------------------------------------------------------
// Resolver com cache (versao em rbac_meta; mutacoes de RBAC dao bump)
// ---------------------------------------------------------------------------
let cache = { version: -1, checkedAt: 0, users: new Map() }; // userId -> { roles, perms:Map(key->scope), at }
const VERSION_POLL_MS = 10_000;
const USER_TTL_MS = 30_000;

export async function bumpRbacVersion(client) {
  const q = client ? client.query.bind(client) : query;
  await q('UPDATE rbac_meta SET version = version + 1 WHERE id = 1');
}

async function currentVersion() {
  const now = Date.now();
  if (now - cache.checkedAt < VERSION_POLL_MS) return cache.version;
  const { rows } = await query('SELECT version FROM rbac_meta WHERE id = 1');
  const v = Number(rows[0]?.version || 0);
  if (v !== cache.version) cache = { version: v, checkedAt: now, users: new Map() };
  else cache.checkedAt = now;
  return v;
}

export function invalidateRbacCache() { cache = { version: -1, checkedAt: 0, users: new Map() }; }

export async function resolveUser(userId) {
  await currentVersion();
  const hit = cache.users.get(userId);
  if (hit && Date.now() - hit.at < USER_TTL_MS) return hit;
  const { rows } = await query(
    `SELECT u.id, u.email, u.name, u.is_active, u.approval_status,
            r.key AS role_key, rp.permission_key, rp.scope
     FROM users u
     LEFT JOIN user_roles ur ON ur.user_id = u.id
     LEFT JOIN roles r ON r.id = ur.role_id
     LEFT JOIN role_permissions rp ON rp.role_id = r.id
     WHERE u.id = $1`,
    [userId],
  );
  if (!rows.length) return null;
  const u = rows[0];
  const roles = [...new Set(rows.map((r) => r.role_key).filter(Boolean))];
  const perms = new Map();
  for (const r of rows) {
    if (!r.permission_key) continue;
    // escopo mais amplo vence quando o mesmo perm vem de papeis diferentes
    const rank = { own: 0, linked: 1, all: 2 };
    const prev = perms.get(r.permission_key);
    if (!prev || rank[r.scope] > rank[prev]) perms.set(r.permission_key, r.scope);
  }
  const entry = {
    at: Date.now(),
    user: { id: u.id, email: u.email, name: u.name, isActive: u.is_active, approvalStatus: u.approval_status },
    roles, perms,
  };
  cache.users.set(userId, entry);
  return entry;
}

// ---------------------------------------------------------------------------
// Middlewares
// ---------------------------------------------------------------------------
export function attachIdentity() {
  return async (req, res, next) => {
    req.auth = null;
    req.authUnavailable = false;
    if (!foundationEnabled()) { req.authUnavailable = true; return next(); }
    const header = req.get('authorization') || '';
    // Fallback p/ downloads via <a href> (relatorio HTML, anexos): token curto na query,
    // aceito SOMENTE em GET. Access token expira em 1h; trilha nunca loga o token.
    const queryToken = req.method === 'GET' && typeof req.query.access_token === 'string' ? req.query.access_token : '';
    if (!header.startsWith('Bearer ') && !queryToken) return next();
    if (!isDbReady()) { req.authUnavailable = true; return next(); }
    const token = header.startsWith('Bearer ') ? header.slice(7).trim() : queryToken;
    const v = verifyAccessToken(token, { secret: config.sessionSecret, prefix: 'besc_access' });
    if (!v.valid) return next();
    try {
      const entry = await resolveUser(v.payload.sub);
      if (entry && entry.user.isActive) req.auth = entry;
    } catch (e) {
      console.error('[rbac] resolveUser falhou:', e.message);
      req.authUnavailable = true;
    }
    next();
  };
}

// Deny por padrao. 401 sem sessao, 403 sem permissao, 503 quando a fundacao/banco
// esta fora (fail-closed: nenhuma rota gated abre porque a infra caiu).
export function authorize(permissionKey) {
  return (req, res, next) => {
    if (req.authUnavailable) return res.status(503).json({ error: 'autenticação indisponível no momento; tente novamente' });
    if (!req.auth) return res.status(401).json({ error: 'não autenticado' });
    const scope = req.auth.perms.get(permissionKey) || req.auth.perms.get('*');
    if (!scope) return res.status(403).json({ error: 'sem permissão para esta ação' });
    req.authz = { permission: permissionKey, scope };
    next();
  };
}

export function publicUser(reqAuth) {
  if (!reqAuth) return null;
  return {
    id: reqAuth.user.id,
    email: reqAuth.user.email,
    name: reqAuth.user.name,
    approvalStatus: reqAuth.user.approvalStatus,
    roles: reqAuth.roles,
    permissions: [...reqAuth.perms.entries()].map(([key, scope]) => ({ key, scope })),
  };
}

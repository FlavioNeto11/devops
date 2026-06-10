// =============================================================================
// Contexto de autenticação/autorização do pm-api.
//
// A identidade chega via headers definidos pela BORDA (oauth2-proxy + Traefik
// ForwardAuth, que repassa X-Auth-Request-Email / X-Auth-Request-Groups). O pm-api
// só é alcançável através dessa borda (Service ClusterIP atrás do Traefik), então
// confiar nesses headers é seguro neste modelo. NUNCA confie neles se o serviço
// for exposto sem o proxy à frente.
//
// Papéis:
//   - platform-admins  -> acesso total (comportamento atual) + gestão de membros.
//   - project-members  -> só Projetos & Tarefas, escopado aos projetos atribuídos.
// =============================================================================
import { query } from './db/pool.js';

const ADMIN_GROUP = process.env.PM_ADMIN_GROUP || 'platform-admins';
const MEMBER_GROUP = process.env.PM_MEMBER_GROUP || 'project-members';

// Fallback quando NÃO há identidade nos headers. Default = true (admin) por dois motivos:
// (1) evita regressão — se o forward dos headers falhar, o admin não fica trancado;
// (2) é SEGURO contra members: a borda (oauth2-proxy) SEMPRE define X-Auth-Request-Groups
// e o Traefik sobrescreve qualquer header forjado, então um member sempre chega COM o grupo
// project-members (hasIdentity=true) e nunca cai neste fallback. Requests sem identidade só
// existem se a borda não estiver à frente — dentro do cluster (ClusterIP). Pode ser endurecido
// com PM_DEV_TRUST_ADMIN=false após confirmar o forward dos headers.
const DEV_TRUST_ADMIN = (process.env.PM_DEV_TRUST_ADMIN ?? 'true') === 'true';

function parseGroups(raw) {
  if (!raw) return [];
  // oauth2-proxy envia os grupos separados por vírgula (X-Auth-Request-Groups).
  return String(raw)
    .split(/[\s,]+/)
    .map((g) => g.trim())
    .filter(Boolean);
}

/** Middleware: popula req.auth a partir dos headers da borda (não bloqueia). */
export function authContext(req, _res, next) {
  const email = String(req.headers['x-auth-request-email'] || req.headers['x-forwarded-email'] || '')
    .trim()
    .toLowerCase();
  const groups = parseGroups(req.headers['x-auth-request-groups'] || req.headers['x-forwarded-groups']);
  const hasIdentity = Boolean(email) || groups.length > 0;

  if (!hasIdentity && DEV_TRUST_ADMIN) {
    req.auth = { email: email || 'dev@local', groups: [ADMIN_GROUP], isAdmin: true, isMember: false, dev: true };
  } else {
    req.auth = {
      email,
      groups,
      isAdmin: groups.includes(ADMIN_GROUP),
      isMember: groups.includes(MEMBER_GROUP),
    };
  }
  next();
}

/** Middleware: exige platform-admins. */
export function requireAdmin(req, res, next) {
  if (req.auth?.isAdmin) return next();
  return res.status(403).json({ error: { code: 'FORBIDDEN', message: 'acesso restrito a administradores' } });
}

/** project_ids que o requester pode acessar. Admin => null (todos). */
export async function allowedProjectIds(req) {
  if (req.auth?.isAdmin) return null;
  if (!req.auth?.email) return [];
  const { rows } = await query('SELECT project_id FROM pm_user_access WHERE user_email = $1', [req.auth.email]);
  return rows.map((r) => r.project_id);
}

/**
 * Garante acesso ao projeto (admin sempre passa). Quando negado, responde 403 e
 * retorna false — o handler deve `return` se receber false.
 */
export async function assertProjectAccess(req, res, projectId) {
  if (req.auth?.isAdmin) return true;
  if (projectId && req.auth?.email) {
    const { rows } = await query(
      'SELECT 1 FROM pm_user_access WHERE user_email = $1 AND project_id = $2',
      [req.auth.email, projectId],
    );
    if (rows.length) return true;
  }
  res.status(403).json({ error: { code: 'FORBIDDEN', message: 'sem acesso a este projeto' } });
  return false;
}

export async function resolveProjectIdForItem(itemId) {
  const { rows } = await query('SELECT project_id FROM items WHERE id = $1', [itemId]);
  return rows[0]?.project_id || null;
}

export async function resolveProjectIdForTask(taskId) {
  const { rows } = await query(
    'SELECT i.project_id FROM tasks t JOIN items i ON i.id = t.item_id WHERE t.id = $1',
    [taskId],
  );
  return rows[0]?.project_id || null;
}

// --- CMS resolvers (mesmo padrao dos acima) --------------------------------
export async function resolveProjectIdByKey(key) {
  const { rows } = await query('SELECT id FROM projects WHERE key = $1', [key]);
  return rows[0]?.id || null;
}

export async function resolveProjectIdForPage(pageId) {
  const { rows } = await query('SELECT project_id FROM cms_pages WHERE id = $1', [pageId]);
  return rows[0]?.project_id || null;
}

export async function resolveProjectIdForSection(sectionId) {
  const { rows } = await query(
    'SELECT p.project_id FROM cms_sections s JOIN cms_pages p ON p.id = s.page_id WHERE s.id = $1',
    [sectionId],
  );
  return rows[0]?.project_id || null;
}

export async function resolveProjectIdForFile(fileId) {
  const { rows } = await query('SELECT project_id FROM cms_files WHERE id = $1', [fileId]);
  return rows[0]?.project_id || null;
}

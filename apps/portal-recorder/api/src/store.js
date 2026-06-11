// store.js — camada de dados do portal-recorder.
// Padrão ai-control-plane: helpers PUROS (validação/normalização/genId) testáveis
// SEM banco, + funções SQL que recebem o pool injetado. Erros de validação no
// formato { ok: false, status, code, message }; sucesso { ok: true, value }.
import crypto from 'node:crypto';

export function genId(prefix) {
  return `${prefix}_${crypto.randomBytes(9).toString('hex')}`;
}

function err(status, code, message) {
  return { ok: false, status, code, message };
}

const SLUG_RE = /^[a-z0-9]+(-[a-z0-9]+)*$/;
const SESSION_STATUSES = new Set(['created', 'running', 'finalizing', 'normalized', 'failed', 'expired']);

// ── validadores puros ──────────────────────────────────────────────────────
export function validateCreatePortal(body) {
  if (!body || typeof body !== 'object') return err(400, 'VALIDATION_ERROR', 'body must be an object');
  const slug = typeof body.slug === 'string' ? body.slug.trim() : '';
  const name = typeof body.name === 'string' ? body.name.trim() : '';
  const entryUrl = typeof body.entry_url === 'string' ? body.entry_url.trim() : '';
  if (!SLUG_RE.test(slug)) return err(400, 'VALIDATION_ERROR', 'slug must match ^[a-z0-9]+(-[a-z0-9]+)*$');
  if (!name) return err(400, 'VALIDATION_ERROR', 'name is required');
  let parsed;
  try { parsed = new URL(entryUrl); } catch { return err(400, 'VALIDATION_ERROR', 'entry_url must be an absolute URL'); }
  if (parsed.protocol !== 'https:' && parsed.protocol !== 'http:') return err(400, 'VALIDATION_ERROR', 'entry_url must be http(s)');
  const apiOrigins = Array.isArray(body.api_origins) ? body.api_origins.filter((o) => typeof o === 'string') : [];
  return {
    ok: true,
    value: {
      slug,
      name,
      entry_url: entryUrl,
      base_origin: parsed.origin,
      api_origins: apiOrigins.length ? apiOrigins : [parsed.origin],
      spa_kind: typeof body.spa_kind === 'string' ? body.spa_kind : null,
      notes: typeof body.notes === 'string' ? body.notes : null,
    },
  };
}

export function validateCreateSession(body) {
  const title = body && typeof body.title === 'string' ? body.title.trim() : null;
  return { ok: true, value: { title: title || null } };
}

export function isValidSessionStatus(status) {
  return SESSION_STATUSES.has(status);
}

// Normaliza uma URL crua em { host, path, query } (puro; usado na ingestão).
export function splitUrl(rawUrl) {
  try {
    const u = new URL(rawUrl);
    const query = {};
    for (const [k, v] of u.searchParams.entries()) query[k] = v;
    return { host: u.host, path: u.pathname, query };
  } catch {
    return { host: '', path: String(rawUrl || ''), query: {} };
  }
}

// ── SQL (pool injetado) ─────────────────────────────────────────────────────
export async function createPortal(pool, value) {
  const id = genId('por');
  const { rows } = await pool.query(
    `INSERT INTO portals (id, slug, name, entry_url, base_origin, api_origins, spa_kind, notes)
     VALUES ($1,$2,$3,$4,$5,$6::jsonb,$7,$8)
     ON CONFLICT (slug) DO UPDATE SET
       name = EXCLUDED.name, entry_url = EXCLUDED.entry_url, base_origin = EXCLUDED.base_origin,
       api_origins = EXCLUDED.api_origins, spa_kind = EXCLUDED.spa_kind, notes = EXCLUDED.notes,
       updated_at = NOW()
     RETURNING *`,
    [id, value.slug, value.name, value.entry_url, value.base_origin, JSON.stringify(value.api_origins), value.spa_kind, value.notes]
  );
  return rows[0];
}

export async function listPortals(pool) {
  const { rows } = await pool.query('SELECT * FROM portals ORDER BY created_at DESC');
  return rows;
}

export async function getPortal(pool, id) {
  const { rows } = await pool.query('SELECT * FROM portals WHERE id = $1 OR slug = $1', [id]);
  return rows[0] || null;
}

export async function createSession(pool, portalId, value) {
  const id = genId('cap');
  const correlationId = genId('corr');
  const { rows } = await pool.query(
    `INSERT INTO capture_sessions (id, portal_id, title, status, correlation_id, expires_at)
     VALUES ($1,$2,$3,'created',$4, NOW() + INTERVAL '24 hours')
     RETURNING *`,
    [id, portalId, value.title, correlationId]
  );
  return rows[0];
}

export async function listSessions(pool, { portalId, status, limit = 50 } = {}) {
  const clauses = [];
  const params = [];
  if (portalId) { params.push(portalId); clauses.push(`portal_id = $${params.length}`); }
  if (status) { params.push(status); clauses.push(`status = $${params.length}`); }
  params.push(Math.min(Number(limit) || 50, 200));
  const where = clauses.length ? `WHERE ${clauses.join(' AND ')}` : '';
  const { rows } = await pool.query(
    `SELECT * FROM capture_sessions ${where} ORDER BY created_at DESC LIMIT $${params.length}`,
    params
  );
  return rows;
}

export async function getSession(pool, id) {
  const { rows } = await pool.query('SELECT * FROM capture_sessions WHERE id = $1', [id]);
  return rows[0] || null;
}

export async function setSessionStatus(pool, id, status, extra = {}) {
  const sets = ['status = $2', 'updated_at = NOW()'];
  const params = [id, status];
  if (extra.started_at) sets.push('started_at = NOW()');
  if (extra.ended_at) sets.push('ended_at = NOW()');
  const { rows } = await pool.query(
    `UPDATE capture_sessions SET ${sets.join(', ')} WHERE id = $1 RETURNING *`,
    params
  );
  return rows[0] || null;
}

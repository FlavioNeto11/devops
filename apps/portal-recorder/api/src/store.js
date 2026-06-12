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
  // Vínculo opcional com um produto da plataforma (declarativo; mesma gramática
  // de key dos projetos). Vazio/ausente = portal externo independente.
  const related = typeof body.related_project_key === 'string' ? body.related_project_key.trim() : '';
  if (related && !SLUG_RE.test(related)) return err(400, 'VALIDATION_ERROR', 'related_project_key must match ^[a-z0-9]+(-[a-z0-9]+)*$');
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
      related_project_key: related || null,
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
    `INSERT INTO portals (id, slug, name, entry_url, base_origin, api_origins, spa_kind, notes, related_project_key)
     VALUES ($1,$2,$3,$4,$5,$6::jsonb,$7,$8,$9)
     ON CONFLICT (slug) DO UPDATE SET
       name = EXCLUDED.name, entry_url = EXCLUDED.entry_url, base_origin = EXCLUDED.base_origin,
       api_origins = EXCLUDED.api_origins, spa_kind = EXCLUDED.spa_kind, notes = EXCLUDED.notes,
       related_project_key = EXCLUDED.related_project_key,
       updated_at = NOW()
     RETURNING *`,
    [id, value.slug, value.name, value.entry_url, value.base_origin, JSON.stringify(value.api_origins), value.spa_kind, value.notes, value.related_project_key]
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

// Deleta uma sessão (cascata: eventos/anotações/screenshots/estado via FK).
export async function deleteSession(pool, id) {
  const { rowCount } = await pool.query('DELETE FROM capture_sessions WHERE id = $1', [id]);
  return rowCount > 0;
}

// Deleta um portal e TUDO dele (sessões/eventos/contratos via FK ON DELETE CASCADE).
export async function deletePortal(pool, id) {
  const { rowCount } = await pool.query('DELETE FROM portals WHERE id = $1 OR slug = $1', [id]);
  return rowCount > 0;
}

// Sessões ativas de um portal (para parar o browser remoto antes de apagar).
export async function listActiveSessionIds(pool, portalId) {
  const { rows } = await pool.query(
    `SELECT id FROM capture_sessions WHERE portal_id = $1 AND status IN ('created','running')`,
    [portalId]
  );
  return rows.map((r) => r.id);
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

// ── anotações (A4) ──────────────────────────────────────────────────────────
export function validateCreateAnnotation(body) {
  if (!body || typeof body !== 'object') return err(400, 'VALIDATION_ERROR', 'body must be an object');
  const label = typeof body.label === 'string' ? body.label.trim() : '';
  if (!label) return err(400, 'VALIDATION_ERROR', 'label is required');
  const start = Number(body.start_offset_ms);
  if (!Number.isFinite(start) || start < 0) return err(400, 'VALIDATION_ERROR', 'start_offset_ms must be a non-negative number');
  return {
    ok: true,
    value: {
      label,
      description: typeof body.description === 'string' ? body.description : null,
      start_offset_ms: Math.round(start),
      end_offset_ms: Number.isFinite(Number(body.end_offset_ms)) ? Math.round(Number(body.end_offset_ms)) : null,
      step_index: Number.isInteger(body.step_index) ? body.step_index : null,
      expected_endpoint: typeof body.expected_endpoint === 'string' ? body.expected_endpoint : null,
    },
  };
}

export async function createAnnotation(pool, sessionId, value) {
  const id = genId('ann');
  // fecha a janela da anotação anterior aberta (end = start desta) — passos sequenciais
  await pool.query(
    `UPDATE capture_annotations SET end_offset_ms = $2
       WHERE session_id = $1 AND end_offset_ms IS NULL AND start_offset_ms < $2`,
    [sessionId, value.start_offset_ms]
  );
  const stepIndex = value.step_index ?? (await pool.query('SELECT COUNT(*)::int AS n FROM capture_annotations WHERE session_id = $1', [sessionId])).rows[0].n;
  const { rows } = await pool.query(
    `INSERT INTO capture_annotations (id, session_id, step_index, label, description, start_offset_ms, end_offset_ms, expected_endpoint)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8) RETURNING *`,
    [id, sessionId, stepIndex, value.label, value.description, value.start_offset_ms, value.end_offset_ms, value.expected_endpoint]
  );
  return rows[0];
}

export async function listAnnotations(pool, sessionId) {
  const { rows } = await pool.query('SELECT * FROM capture_annotations WHERE session_id = $1 ORDER BY start_offset_ms', [sessionId]);
  return rows;
}

// ── timeline (A4 revisão): eventos + anotações + screenshots ────────────────
export async function getTimeline(pool, sessionId) {
  const [events, annotations, screenshots] = await Promise.all([
    pool.query(
      `SELECT id, seq, t_offset_ms, phase, method, host, path, status_code, resource_type,
              req_body, resp_body, body_truncated, redacted_keys
         FROM capture_events WHERE session_id = $1 ORDER BY seq LIMIT 2000`, [sessionId]),
    pool.query('SELECT * FROM capture_annotations WHERE session_id = $1 ORDER BY start_offset_ms', [sessionId]),
    pool.query('SELECT id, t_offset_ms, blob_ref, caption, annotation_id FROM capture_screenshots WHERE session_id = $1 ORDER BY t_offset_ms', [sessionId]),
  ]);
  return { events: events.rows, annotations: annotations.rows, screenshots: screenshots.rows };
}

export async function getScreenshot(pool, sessionId, shotId) {
  const { rows } = await pool.query('SELECT * FROM capture_screenshots WHERE id = $1 AND session_id = $2', [shotId, sessionId]);
  return rows[0] || null;
}

// ── normalização (A5): eventos → contrato ───────────────────────────────────
export async function loadResponseEventsForNormalize(pool, sessionId, apiOrigins = []) {
  // só respostas; filtra por host das api_origins (se houver) e descarta assets
  const { rows } = await pool.query(
    `SELECT e.id, e.method, e.host, e.path, e.status_code, e.resp_body,
            r.req_body
       FROM capture_events e
       LEFT JOIN LATERAL (
         SELECT req_body FROM capture_events r
          WHERE r.session_id = e.session_id AND r.phase='request' AND r.url = e.url
          ORDER BY r.seq DESC LIMIT 1
       ) r ON TRUE
      WHERE e.session_id = $1 AND e.phase='response'
      ORDER BY e.seq`,
    [sessionId]
  );
  const hosts = new Set(apiOrigins.map((o) => { try { return new URL(o).host; } catch { return o; } }));
  return rows
    .filter((r) => hosts.size === 0 || hosts.has(r.host))
    .map((r) => ({
      id: r.id, method: r.method, host: r.host, path: r.path,
      status_code: r.status_code, resp_body: r.resp_body, req_body: r.req_body,
      requires_auth_hint: r.status_code === 401 || r.status_code === 403 ? false : undefined,
      captcha_hint: false,
    }));
}

export async function saveContract(pool, portalId, sessionId, endpoints) {
  const contractId = genId('ctr');
  const next = await pool.query('SELECT COALESCE(MAX(version),0)+1 AS v FROM portal_contracts WHERE portal_id = $1', [portalId]);
  const version = next.rows[0].v;
  await pool.query(
    `INSERT INTO portal_contracts (id, portal_id, session_id, version, summary)
     VALUES ($1,$2,$3,$4,$5::jsonb)`,
    [contractId, portalId, sessionId, version, JSON.stringify({ endpoint_count: endpoints.length, generated_at: new Date().toISOString() })]
  );
  for (const ep of endpoints) {
    await pool.query(
      `INSERT INTO portal_endpoints
         (id, contract_id, method, host, path_template, requires_auth, requires_captcha,
          sample_request, sample_response, request_schema, response_schema, occurrence_count, source_event_ids)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8::jsonb,$9::jsonb,$10::jsonb,$11::jsonb,$12,$13::jsonb)
       ON CONFLICT (contract_id, method, host, path_template) DO NOTHING`,
      [genId('end'), contractId, ep.method, ep.host, ep.path_template, ep.requires_auth, ep.requires_captcha,
       JSON.stringify(ep.sample_request || {}), JSON.stringify(ep.sample_response || {}),
       JSON.stringify(ep.request_schema || {}), JSON.stringify(ep.response_schema || {}),
       ep.occurrence_count || 1, JSON.stringify(ep.source_event_ids || [])]
    );
  }
  return { contractId, version };
}

export async function getContract(pool, contractId) {
  const c = await pool.query('SELECT * FROM portal_contracts WHERE id = $1', [contractId]);
  if (!c.rows[0]) return null;
  const eps = await pool.query('SELECT * FROM portal_endpoints WHERE contract_id = $1 ORDER BY host, path_template', [contractId]);
  return { ...c.rows[0], endpoints: eps.rows };
}

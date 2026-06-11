// Camada de dados do ai-control-plane.
// Duas metades:
//   1) Helpers PUROS (validação de payload, normalização, montagem de params
//      SQL, agregação) — sem I/O, cobertos por test/store.test.js sem banco.
//   2) Funções SQL que recebem o pool por injeção (pool.query/pool.connect)
//      e executam as queries parametrizadas.
import crypto from 'node:crypto';

// ---------------------------------------------------------------------------
// Constantes de domínio
// ---------------------------------------------------------------------------
export const FEEDBACK_KINDS = Object.freeze(['thumbs_up', 'thumbs_down']);
export const EVAL_MODES = Object.freeze(['sample', 'full', 'graph', 'mock', 'ci']);

const PROMPT_NAME_RE = /^[a-zA-Z0-9][a-zA-Z0-9._-]{0,199}$/;
const MAX_SHORT_TEXT = 200;
const MAX_COMMENT = 4_000;
const MAX_PROMPT_TEXT = 200_000;

// ---------------------------------------------------------------------------
// Helpers puros — ids
// ---------------------------------------------------------------------------
export function genId(prefix) {
  return `${prefix}_${crypto.randomBytes(8).toString('hex')}`;
}

// ---------------------------------------------------------------------------
// Helpers puros — normalização / parsing
// ---------------------------------------------------------------------------

// Nome de prompt: ex. 'gymops.chat.system'. Retorna o nome normalizado (trim)
// ou null quando inválido.
export function normalizePromptName(raw) {
  if (typeof raw !== 'string') return null;
  const name = raw.trim();
  if (!PROMPT_NAME_RE.test(name)) return null;
  return name;
}

export function parseDays(raw, { def = 7, min = 1, max = 365 } = {}) {
  if (raw === undefined || raw === null || raw === '') return def;
  const n = Number.parseInt(String(raw), 10);
  if (!Number.isInteger(n)) return def;
  return Math.min(Math.max(n, min), max);
}

export function parseLimit(raw, { def = 20, min = 1, max = 200 } = {}) {
  if (raw === undefined || raw === null || raw === '') return def;
  const n = Number.parseInt(String(raw), 10);
  if (!Number.isInteger(n)) return def;
  return Math.min(Math.max(n, min), max);
}

export function computePassRate(total, passed) {
  if (!Number.isInteger(total) || total <= 0 || !Number.isInteger(passed)) return null;
  return passed / total;
}

// ---------------------------------------------------------------------------
// Helpers puros — validação de payload
// Retornam { ok: true, value } ou { ok: false, error: { code, message } }
// ---------------------------------------------------------------------------
function fail(code, message) {
  return { ok: false, error: { code, message } };
}

function isPlainObject(v) {
  return typeof v === 'object' && v !== null && !Array.isArray(v);
}

function optionalString(v, field, max = MAX_SHORT_TEXT) {
  if (v === undefined || v === null) return { ok: true, value: null };
  if (typeof v !== 'string') return fail('VALIDATION_ERROR', `'${field}' must be a string`);
  const s = v.trim();
  if (s.length === 0) return { ok: true, value: null };
  if (s.length > max) return fail('VALIDATION_ERROR', `'${field}' exceeds ${max} characters`);
  return { ok: true, value: s };
}

function requiredString(v, field, max = MAX_SHORT_TEXT) {
  if (typeof v !== 'string' || v.trim().length === 0) {
    return fail('VALIDATION_ERROR', `'${field}' is required and must be a non-empty string`);
  }
  const s = v.trim();
  if (s.length > max) return fail('VALIDATION_ERROR', `'${field}' exceeds ${max} characters`);
  return { ok: true, value: s };
}

function optionalJsonObject(v, field) {
  if (v === undefined || v === null) return { ok: true, value: {} };
  if (!isPlainObject(v)) return fail('VALIDATION_ERROR', `'${field}' must be a JSON object`);
  return { ok: true, value: v };
}

function nonNegativeInt(v, field) {
  if (!Number.isInteger(v) || v < 0) {
    return fail('VALIDATION_ERROR', `'${field}' is required and must be a non-negative integer`);
  }
  return { ok: true, value: v };
}

// POST /v1/prompts/:name/versions
export function validateCreateVersionPayload(body) {
  if (!isPlainObject(body)) return fail('VALIDATION_ERROR', 'request body must be a JSON object');

  const promptText = body.promptText;
  if (typeof promptText !== 'string' || promptText.trim().length === 0) {
    return fail('VALIDATION_ERROR', "'promptText' is required and must be a non-empty string");
  }
  if (promptText.length > MAX_PROMPT_TEXT) {
    return fail('VALIDATION_ERROR', `'promptText' exceeds ${MAX_PROMPT_TEXT} characters`);
  }

  const label = optionalString(body.label, 'label');
  if (!label.ok) return label;
  const createdBy = optionalString(body.createdBy, 'createdBy');
  if (!createdBy.ok) return createdBy;
  const description = optionalString(body.description, 'description', 2_000);
  if (!description.ok) return description;

  if (body.activate !== undefined && typeof body.activate !== 'boolean') {
    return fail('VALIDATION_ERROR', "'activate' must be a boolean");
  }

  return {
    ok: true,
    value: {
      promptText,
      label: label.value,
      createdBy: createdBy.value,
      description: description.value,
      activate: body.activate === true,
    },
  };
}

// POST /v1/prompts/:name/activate — exige confirmação explícita (anti-fat-finger).
export function validateActivatePayload(body) {
  if (!isPlainObject(body)) return fail('VALIDATION_ERROR', 'request body must be a JSON object');
  if (body.confirmed !== true) {
    return fail('CONFIRMATION_REQUIRED', "activation requires 'confirmed: true' in the body");
  }
  const versionId = requiredString(body.versionId, 'versionId');
  if (!versionId.ok) return versionId;
  return { ok: true, value: { versionId: versionId.value } };
}

// POST /v1/feedback
export function validateFeedbackPayload(body) {
  if (!isPlainObject(body)) return fail('VALIDATION_ERROR', 'request body must be a JSON object');

  const app = requiredString(body.app, 'app', 100);
  if (!app.ok) return app;

  if (typeof body.kind !== 'string' || !FEEDBACK_KINDS.includes(body.kind)) {
    return fail('VALIDATION_ERROR', `'kind' must be one of: ${FEEDBACK_KINDS.join(', ')}`);
  }

  const surface = optionalString(body.surface, 'surface', 100);
  if (!surface.ok) return surface;
  const refId = optionalString(body.refId, 'refId');
  if (!refId.ok) return refId;
  const toolName = optionalString(body.toolName, 'toolName');
  if (!toolName.ok) return toolName;
  const comment = optionalString(body.comment, 'comment', MAX_COMMENT);
  if (!comment.ok) return comment;
  const metadata = optionalJsonObject(body.metadata, 'metadata');
  if (!metadata.ok) return metadata;

  return {
    ok: true,
    value: {
      app: app.value,
      surface: surface.value ?? 'chat',
      kind: body.kind,
      refId: refId.value,
      toolName: toolName.value,
      comment: comment.value,
      metadata: metadata.value,
    },
  };
}

// POST /v1/eval-runs
export function validateEvalRunPayload(body) {
  if (!isPlainObject(body)) return fail('VALIDATION_ERROR', 'request body must be a JSON object');

  const app = requiredString(body.app, 'app', 100);
  if (!app.ok) return app;

  if (typeof body.mode !== 'string' || !EVAL_MODES.includes(body.mode)) {
    return fail('VALIDATION_ERROR', `'mode' must be one of: ${EVAL_MODES.join(', ')}`);
  }

  const total = nonNegativeInt(body.total, 'total');
  if (!total.ok) return total;
  const passed = nonNegativeInt(body.passed, 'passed');
  if (!passed.ok) return passed;
  const failed = nonNegativeInt(body.failed, 'failed');
  if (!failed.ok) return failed;

  const kpis = optionalJsonObject(body.kpis, 'kpis');
  if (!kpis.ok) return kpis;
  const metadata = optionalJsonObject(body.metadata, 'metadata');
  if (!metadata.ok) return metadata;

  return {
    ok: true,
    value: {
      app: app.value,
      mode: body.mode,
      total: total.value,
      passed: passed.value,
      failed: failed.value,
      passRate: computePassRate(total.value, passed.value),
      kpis: kpis.value,
      metadata: metadata.value,
    },
  };
}

// ---------------------------------------------------------------------------
// Helpers puros — montagem de params SQL (ordem das colunas dos INSERTs)
// ---------------------------------------------------------------------------

// INSERT INTO feedback_events (id, app, surface, kind, ref_id, tool_name, comment, metadata)
export function buildFeedbackInsertParams(id, value) {
  return [
    id,
    value.app,
    value.surface,
    value.kind,
    value.refId,
    value.toolName,
    value.comment,
    JSON.stringify(value.metadata ?? {}),
  ];
}

// INSERT INTO eval_runs (id, app, mode, total, passed, failed, pass_rate, kpis, metadata)
export function buildEvalRunInsertParams(id, value) {
  return [
    id,
    value.app,
    value.mode,
    value.total,
    value.passed,
    value.failed,
    value.passRate,
    JSON.stringify(value.kpis ?? {}),
    JSON.stringify(value.metadata ?? {}),
  ];
}

// ---------------------------------------------------------------------------
// Helpers puros — agregação
// ---------------------------------------------------------------------------

// rows: [{ app, kind, count }] -> { byKind, byApp, total }
export function summarizeFeedbackRows(rows) {
  const byKind = { thumbs_up: 0, thumbs_down: 0 };
  const byApp = {};
  let total = 0;
  for (const row of rows || []) {
    const count = Number(row.count) || 0;
    total += count;
    if (Object.hasOwn(byKind, row.kind)) byKind[row.kind] += count;
    if (!byApp[row.app]) byApp[row.app] = { thumbs_up: 0, thumbs_down: 0 };
    if (Object.hasOwn(byApp[row.app], row.kind)) byApp[row.app][row.kind] += count;
  }
  return { byKind, byApp, total };
}

// ---------------------------------------------------------------------------
// Funções SQL — recebem o pool por injeção (testáveis com fake/integration)
// ---------------------------------------------------------------------------

export async function listPrompts(pool) {
  const { rows } = await pool.query(
    `SELECT p.name,
            p.description,
            av.id      AS active_id,
            av.version AS active_version,
            av.label   AS active_label,
            COUNT(v.id)::int AS versions_count
       FROM prompts p
       LEFT JOIN prompt_versions av ON av.id = p.active_version_id
       LEFT JOIN prompt_versions v  ON v.prompt_name = p.name
      GROUP BY p.name, p.description, av.id, av.version, av.label
      ORDER BY p.name`
  );
  return rows.map((r) => ({
    name: r.name,
    description: r.description,
    activeVersion: r.active_id
      ? { id: r.active_id, version: r.active_version, label: r.active_label }
      : null,
    versionsCount: r.versions_count,
  }));
}

// Retorna { found, active }: found=false -> prompt não existe;
// active=null com found=true -> existe mas sem versão ativa.
export async function getActivePrompt(pool, name) {
  const { rows } = await pool.query(
    `SELECT p.name,
            v.id AS version_id,
            v.version,
            v.label,
            v.prompt_text,
            v.activated_at
       FROM prompts p
       LEFT JOIN prompt_versions v ON v.id = p.active_version_id
      WHERE p.name = $1`,
    [name]
  );
  if (rows.length === 0) return { found: false, active: null };
  const r = rows[0];
  if (!r.version_id) return { found: true, active: null };
  return {
    found: true,
    active: {
      promptName: r.name,
      versionId: r.version_id,
      version: r.version,
      label: r.label,
      promptText: r.prompt_text,
      activatedAt: r.activated_at,
    },
  };
}

// Retorna null quando o prompt não existe; senão lista desc por version.
export async function listVersions(pool, name) {
  const { rows: promptRows } = await pool.query(
    'SELECT active_version_id FROM prompts WHERE name = $1',
    [name]
  );
  if (promptRows.length === 0) return null;
  const activeId = promptRows[0].active_version_id;
  const { rows } = await pool.query(
    `SELECT id, version, label, prompt_text, created_by, created_at, activated_at
       FROM prompt_versions
      WHERE prompt_name = $1
      ORDER BY version DESC`,
    [name]
  );
  return rows.map((r) => ({
    id: r.id,
    version: r.version,
    label: r.label,
    promptText: r.prompt_text,
    createdBy: r.created_by,
    createdAt: r.created_at,
    activatedAt: r.activated_at,
    active: r.id === activeId,
  }));
}

// Cria o prompt se não existir, insere a versão (max+1) e opcionalmente ativa.
// Tudo numa transação para o version sequencial não colidir.
export async function createVersion(pool, name, value) {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    await client.query(
      `INSERT INTO prompts (name, description)
       VALUES ($1, $2)
       ON CONFLICT (name) DO UPDATE
         SET description = COALESCE(EXCLUDED.description, prompts.description),
             updated_at  = NOW()`,
      [name, value.description]
    );
    const {
      rows: [{ next }],
    } = await client.query(
      'SELECT COALESCE(MAX(version), 0) + 1 AS next FROM prompt_versions WHERE prompt_name = $1',
      [name]
    );
    const id = genId('pv');
    await client.query(
      `INSERT INTO prompt_versions (id, prompt_name, version, label, prompt_text, created_by, activated_at)
       VALUES ($1, $2, $3, $4, $5, $6, CASE WHEN $7 THEN NOW() ELSE NULL END)`,
      [id, name, next, value.label, value.promptText, value.createdBy, value.activate]
    );
    if (value.activate) {
      await client.query(
        'UPDATE prompts SET active_version_id = $1, updated_at = NOW() WHERE name = $2',
        [id, name]
      );
    }
    await client.query('COMMIT');
    return {
      id,
      promptName: name,
      version: Number(next),
      label: value.label,
      active: value.activate,
    };
  } catch (err) {
    await client.query('ROLLBACK').catch(() => {});
    throw err;
  } finally {
    client.release();
  }
}

// Promote/rollback: ativa uma versão existente e devolve a anterior
// (previous) para facilitar o rollback de um clique.
// Retorna { error } para casos de 404 ou { data } no sucesso.
export async function activateVersion(pool, name, versionId) {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const { rows: promptRows } = await client.query(
      'SELECT active_version_id FROM prompts WHERE name = $1 FOR UPDATE',
      [name]
    );
    if (promptRows.length === 0) {
      await client.query('ROLLBACK');
      return { error: 'PROMPT_NOT_FOUND' };
    }
    const { rows: targetRows } = await client.query(
      'SELECT id, version FROM prompt_versions WHERE id = $1 AND prompt_name = $2',
      [versionId, name]
    );
    if (targetRows.length === 0) {
      await client.query('ROLLBACK');
      return { error: 'VERSION_NOT_FOUND' };
    }

    let previous = null;
    const previousId = promptRows[0].active_version_id;
    if (previousId && previousId !== versionId) {
      const { rows: prevRows } = await client.query(
        'SELECT id, version FROM prompt_versions WHERE id = $1',
        [previousId]
      );
      if (prevRows.length > 0) {
        previous = { versionId: prevRows[0].id, version: prevRows[0].version };
      }
    }

    await client.query(
      'UPDATE prompts SET active_version_id = $1, updated_at = NOW() WHERE name = $2',
      [versionId, name]
    );
    await client.query('UPDATE prompt_versions SET activated_at = NOW() WHERE id = $1', [
      versionId,
    ]);
    await client.query('COMMIT');
    return {
      data: {
        promptName: name,
        activeVersionId: versionId,
        version: targetRows[0].version,
        previous,
      },
    };
  } catch (err) {
    await client.query('ROLLBACK').catch(() => {});
    throw err;
  } finally {
    client.release();
  }
}

export async function insertFeedback(pool, value) {
  const id = genId('fb');
  const { rows } = await pool.query(
    `INSERT INTO feedback_events (id, app, surface, kind, ref_id, tool_name, comment, metadata)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8::jsonb)
     RETURNING id, created_at`,
    buildFeedbackInsertParams(id, value)
  );
  return { id: rows[0].id, createdAt: rows[0].created_at };
}

export async function feedbackSummary(pool, { app = null, days = 7 } = {}) {
  const { rows } = await pool.query(
    `SELECT app, kind, COUNT(*)::int AS count
       FROM feedback_events
      WHERE created_at >= NOW() - make_interval(days => $1)
        AND ($2::text IS NULL OR app = $2)
      GROUP BY app, kind`,
    [days, app]
  );
  return { ...summarizeFeedbackRows(rows), days, app };
}

export async function insertEvalRun(pool, value) {
  const id = genId('er');
  const { rows } = await pool.query(
    `INSERT INTO eval_runs (id, app, mode, total, passed, failed, pass_rate, kpis, metadata)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8::jsonb, $9::jsonb)
     RETURNING id, pass_rate, created_at`,
    buildEvalRunInsertParams(id, value)
  );
  return { id: rows[0].id, passRate: rows[0].pass_rate, createdAt: rows[0].created_at };
}

export async function listEvalRuns(pool, { app = null, limit = 20 } = {}) {
  const { rows } = await pool.query(
    `SELECT id, app, mode, total, passed, failed, pass_rate, kpis, metadata, created_at
       FROM eval_runs
      WHERE ($1::text IS NULL OR app = $1)
      ORDER BY created_at DESC
      LIMIT $2`,
    [app, limit]
  );
  return rows.map(mapEvalRunRow);
}

function mapEvalRunRow(r) {
  return {
    id: r.id,
    app: r.app,
    mode: r.mode,
    total: r.total,
    passed: r.passed,
    failed: r.failed,
    passRate: r.pass_rate,
    kpis: r.kpis,
    metadata: r.metadata,
    createdAt: r.created_at,
  };
}

export async function overview(pool) {
  const [{ rows: countRows }, { rows: evalRows }] = await Promise.all([
    pool.query(
      `SELECT (SELECT COUNT(*)::int FROM prompts)         AS prompts,
              (SELECT COUNT(*)::int FROM prompt_versions) AS prompt_versions,
              (SELECT COUNT(*)::int FROM feedback_events
                WHERE kind = 'thumbs_up'
                  AND created_at >= NOW() - interval '7 days') AS up7d,
              (SELECT COUNT(*)::int FROM feedback_events
                WHERE kind = 'thumbs_down'
                  AND created_at >= NOW() - interval '7 days') AS down7d`
    ),
    pool.query(
      `SELECT id, app, mode, total, passed, failed, pass_rate, kpis, metadata, created_at
         FROM eval_runs
        ORDER BY created_at DESC
        LIMIT 5`
    ),
  ]);
  const c = countRows[0];
  return {
    prompts: c.prompts,
    promptVersions: c.prompt_versions,
    feedback7d: { up: c.up7d, down: c.down7d },
    lastEvalRuns: evalRows.map(mapEvalRunRow),
  };
}

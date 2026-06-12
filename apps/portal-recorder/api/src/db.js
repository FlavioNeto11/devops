// Pool Postgres + migration idempotente do portal-recorder.
// Mesmo padrão resiliente do ai-control-plane: o banco fora do ar NÃO derruba
// o processo — loga, re-tenta em background com backoff, e /health reporta db:false.
import pg from 'pg';

const { Pool } = pg;

let pool = null;
let dbReady = false;

export function getPool() {
  if (!pool) {
    pool = new Pool({
      connectionString: process.env.DATABASE_URL,
      max: 8,
      connectionTimeoutMillis: 5_000,
      idleTimeoutMillis: 30_000,
    });
    pool.on('error', (err) => {
      dbReady = false;
      console.error(`[db] idle client error: ${err.message}`);
    });
  }
  return pool;
}

export function isDbReady() {
  return dbReady;
}

export async function pingDb() {
  try {
    await getPool().query('SELECT 1');
    dbReady = true;
    return true;
  } catch {
    dbReady = false;
    return false;
  }
}

export async function pingDbQuick(timeoutMs = 750) {
  const timeout = new Promise((resolve) => {
    const t = setTimeout(() => resolve(null), timeoutMs);
    if (typeof t.unref === 'function') t.unref();
  });
  const result = await Promise.race([pingDb(), timeout]);
  return result === null ? dbReady : result;
}

// Schema da captura de portais. Todo statement idempotente (IF NOT EXISTS).
// Corpo grande (PNG/HAR/respostas binárias) NÃO mora aqui — vai ao PVC e o
// banco guarda só o caminho (*_blob_ref). Segredos são REDIGIDOS na origem
// (recorder) antes de qualquer escrita; aqui só entram dados já mascarados.
const MIGRATION_SQL = `
CREATE TABLE IF NOT EXISTS portals (
  id          TEXT PRIMARY KEY,
  slug        TEXT UNIQUE NOT NULL,
  name        TEXT NOT NULL,
  entry_url   TEXT NOT NULL,
  base_origin TEXT NOT NULL,
  api_origins JSONB NOT NULL DEFAULT '[]'::jsonb,
  spa_kind    TEXT,
  notes       TEXT,
  -- vínculo OPCIONAL e puramente declarativo com um produto da plataforma
  -- (ex.: 'sicat' — este portal externo alimenta/contextualiza aquele produto).
  -- Não altera captura/normalização; serve a contexto, IA e governança.
  related_project_key TEXT,
  metadata    JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
ALTER TABLE portals ADD COLUMN IF NOT EXISTS related_project_key TEXT;

CREATE TABLE IF NOT EXISTS capture_sessions (
  id             TEXT PRIMARY KEY,
  portal_id      TEXT NOT NULL REFERENCES portals(id) ON DELETE CASCADE,
  title          TEXT,
  status         TEXT NOT NULL DEFAULT 'created'
                 CHECK (status IN ('created','running','finalizing','normalized','failed','expired')),
  correlation_id TEXT NOT NULL,
  started_at     TIMESTAMPTZ,
  ended_at       TIMESTAMPTZ,
  expires_at     TIMESTAMPTZ,
  redaction_version INTEGER NOT NULL DEFAULT 1,
  event_count    INTEGER NOT NULL DEFAULT 0,
  metadata       JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at     TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at     TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_cap_sessions_portal ON capture_sessions(portal_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_cap_sessions_status ON capture_sessions(status);

CREATE TABLE IF NOT EXISTS capture_events (
  id            TEXT PRIMARY KEY,
  session_id    TEXT NOT NULL REFERENCES capture_sessions(id) ON DELETE CASCADE,
  seq           BIGINT NOT NULL,
  t_offset_ms   BIGINT NOT NULL,
  phase         TEXT NOT NULL CHECK (phase IN ('request','response')),
  method        TEXT,
  url           TEXT NOT NULL,
  host          TEXT NOT NULL,
  path          TEXT NOT NULL,
  query         JSONB NOT NULL DEFAULT '{}'::jsonb,
  status_code   INTEGER,
  resource_type TEXT,
  req_headers   JSONB NOT NULL DEFAULT '{}'::jsonb,
  resp_headers  JSONB NOT NULL DEFAULT '{}'::jsonb,
  req_body      JSONB,
  resp_body     JSONB,
  body_blob_ref TEXT,
  body_truncated BOOLEAN NOT NULL DEFAULT FALSE,
  redacted_keys JSONB NOT NULL DEFAULT '[]'::jsonb,
  secret_hashes JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_cap_events_session_seq ON capture_events(session_id, seq);
CREATE INDEX IF NOT EXISTS idx_cap_events_session_toffset ON capture_events(session_id, t_offset_ms);
CREATE INDEX IF NOT EXISTS idx_cap_events_session_host_path ON capture_events(session_id, host, path);

CREATE TABLE IF NOT EXISTS capture_session_state (
  id          TEXT PRIMARY KEY,
  session_id  TEXT NOT NULL REFERENCES capture_sessions(id) ON DELETE CASCADE,
  t_offset_ms BIGINT NOT NULL,
  cookies     JSONB NOT NULL DEFAULT '[]'::jsonb,
  storage     JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_cap_state_session ON capture_session_state(session_id, t_offset_ms);

CREATE TABLE IF NOT EXISTS capture_screenshots (
  id            TEXT PRIMARY KEY,
  session_id    TEXT NOT NULL REFERENCES capture_sessions(id) ON DELETE CASCADE,
  t_offset_ms   BIGINT NOT NULL,
  blob_ref      TEXT NOT NULL,
  width         INTEGER,
  height        INTEGER,
  caption       TEXT,
  annotation_id TEXT,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_cap_shots_session ON capture_screenshots(session_id, t_offset_ms);

CREATE TABLE IF NOT EXISTS capture_annotations (
  id              TEXT PRIMARY KEY,
  session_id      TEXT NOT NULL REFERENCES capture_sessions(id) ON DELETE CASCADE,
  step_index      INTEGER,
  label           TEXT NOT NULL,
  description     TEXT,
  start_offset_ms BIGINT NOT NULL,
  end_offset_ms   BIGINT,
  expected_endpoint TEXT,
  metadata        JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_cap_ann_session ON capture_annotations(session_id, start_offset_ms);

CREATE TABLE IF NOT EXISTS portal_contracts (
  id          TEXT PRIMARY KEY,
  portal_id   TEXT NOT NULL REFERENCES portals(id) ON DELETE CASCADE,
  session_id  TEXT REFERENCES capture_sessions(id) ON DELETE SET NULL,
  version     INTEGER NOT NULL,
  summary     JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (portal_id, version)
);
CREATE TABLE IF NOT EXISTS portal_endpoints (
  id              TEXT PRIMARY KEY,
  contract_id     TEXT NOT NULL REFERENCES portal_contracts(id) ON DELETE CASCADE,
  method          TEXT NOT NULL,
  host            TEXT NOT NULL,
  path_template   TEXT NOT NULL,
  requires_auth   BOOLEAN NOT NULL DEFAULT FALSE,
  requires_captcha BOOLEAN NOT NULL DEFAULT FALSE,
  sample_request  JSONB NOT NULL DEFAULT '{}'::jsonb,
  sample_response JSONB NOT NULL DEFAULT '{}'::jsonb,
  request_schema  JSONB NOT NULL DEFAULT '{}'::jsonb,
  response_schema JSONB NOT NULL DEFAULT '{}'::jsonb,
  occurrence_count INTEGER NOT NULL DEFAULT 1,
  source_event_ids JSONB NOT NULL DEFAULT '[]'::jsonb,
  annotation_refs  JSONB NOT NULL DEFAULT '[]'::jsonb,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (contract_id, method, host, path_template)
);
CREATE INDEX IF NOT EXISTS idx_portal_endpoints_contract ON portal_endpoints(contract_id);
`;

export async function migrate() {
  const client = await getPool().connect();
  try {
    await client.query(MIGRATION_SQL);
    dbReady = true;
  } finally {
    client.release();
  }
}

export function startMigrateLoop({ initialDelayMs = 1_000, maxDelayMs = 30_000 } = {}) {
  let delay = initialDelayMs;
  const attempt = () => {
    migrate()
      .then(() => console.log('[db] schema migrated (idempotent)'))
      .catch((err) => {
        console.error(`[db] migrate failed (${err.message}); retrying in ${delay}ms`);
        const t = setTimeout(attempt, delay);
        if (typeof t.unref === 'function') t.unref();
        delay = Math.min(delay * 2, maxDelayMs);
      });
  };
  attempt();
}

const CONN_ERROR_CODES = new Set([
  'ECONNREFUSED', 'ECONNRESET', 'ENOTFOUND', 'ETIMEDOUT', 'EAI_AGAIN', 'EPIPE',
  '57P03', '53300', '08001', '08006', '28P01',
]);

export function isDbConnectionError(err) {
  if (!err) return false;
  if (CONN_ERROR_CODES.has(err.code)) return true;
  if (Array.isArray(err.errors) && err.errors.some((e) => CONN_ERROR_CODES.has(e?.code))) return true;
  return /connect|connection terminated|timeout exceeded/i.test(String(err.message || ''));
}

export async function closePool() {
  if (pool) {
    const p = pool;
    pool = null;
    dbReady = false;
    await p.end().catch(() => {});
  }
}

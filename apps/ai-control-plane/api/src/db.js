// Pool Postgres + migration idempotente do ai-control-plane.
// Regra de design: este serviço fica FORA do caminho crítico dos apps —
// se o banco estiver fora, o processo NÃO crasha: loga, segue tentando em
// background (retry com backoff) e o /health reporta db:false.
import pg from 'pg';

const { Pool } = pg;

let pool = null;
let dbReady = false;

export function getPool() {
  if (!pool) {
    pool = new Pool({
      connectionString: process.env.DATABASE_URL,
      max: 5,
      connectionTimeoutMillis: 5_000,
      idleTimeoutMillis: 30_000,
    });
    // Erros de clientes ociosos (ex.: Postgres reiniciou) não podem derrubar o
    // processo — apenas marcam o estado e deixam o próximo uso reconectar.
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

// Ping best-effort: atualiza o estado cacheado quando resolve.
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

// Ping com teto de espera: o /health nunca pode ficar pendurado atrás de um
// connect lento. Se estourar o teto, responde o último estado conhecido
// (o ping continua em background e atualiza o cache quando resolver).
export async function pingDbQuick(timeoutMs = 750) {
  const timeout = new Promise((resolve) => {
    const t = setTimeout(() => resolve(null), timeoutMs);
    if (typeof t.unref === 'function') t.unref();
  });
  const result = await Promise.race([pingDb(), timeout]);
  return result === null ? dbReady : result;
}

// Schema completo — todo statement é idempotente (IF NOT EXISTS), então o
// migrate() pode rodar em TODO boot sem efeito colateral.
const MIGRATION_SQL = `
CREATE TABLE IF NOT EXISTS prompts (
  name TEXT PRIMARY KEY,
  description TEXT,
  active_version_id TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE TABLE IF NOT EXISTS prompt_versions (
  id TEXT PRIMARY KEY,
  prompt_name TEXT NOT NULL REFERENCES prompts(name) ON DELETE CASCADE,
  version INTEGER NOT NULL,
  label TEXT,
  prompt_text TEXT NOT NULL,
  created_by TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  activated_at TIMESTAMPTZ,
  UNIQUE (prompt_name, version)
);
CREATE TABLE IF NOT EXISTS feedback_events (
  id TEXT PRIMARY KEY,
  app TEXT NOT NULL,
  surface TEXT NOT NULL DEFAULT 'chat',
  kind TEXT NOT NULL,
  ref_id TEXT,
  tool_name TEXT,
  comment TEXT,
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_feedback_app_created ON feedback_events(app, created_at);
CREATE TABLE IF NOT EXISTS eval_runs (
  id TEXT PRIMARY KEY,
  app TEXT NOT NULL,
  mode TEXT NOT NULL,
  total INTEGER NOT NULL,
  passed INTEGER NOT NULL,
  failed INTEGER NOT NULL,
  pass_rate DOUBLE PRECISION,
  kpis JSONB NOT NULL DEFAULT '{}'::jsonb,
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
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

// Loop de migration resiliente: tenta no boot e, em falha, re-tenta com
// backoff exponencial (1s → 30s) sem nunca derrubar o processo.
export function startMigrateLoop({ initialDelayMs = 1_000, maxDelayMs = 30_000 } = {}) {
  let delay = initialDelayMs;
  const attempt = () => {
    migrate()
      .then(() => {
        console.log('[db] schema migrated (idempotent)');
      })
      .catch((err) => {
        console.error(`[db] migrate failed (${err.message}); retrying in ${delay}ms`);
        const t = setTimeout(attempt, delay);
        if (typeof t.unref === 'function') t.unref();
        delay = Math.min(delay * 2, maxDelayMs);
      });
  };
  attempt();
}

// Heurística para mapear erro de infraestrutura (conexão/indisponibilidade)
// para 503 nas rotas, em vez de um 500 genérico.
const CONN_ERROR_CODES = new Set([
  'ECONNREFUSED', 'ECONNRESET', 'ENOTFOUND', 'ETIMEDOUT', 'EAI_AGAIN', 'EPIPE',
  '57P03', // cannot_connect_now
  '53300', // too_many_connections
  '08001', '08006', // connection exception / failure
  '28P01', // invalid_password (config) — indisponível do ponto de vista do app
]);

export function isDbConnectionError(err) {
  if (!err) return false;
  if (CONN_ERROR_CODES.has(err.code)) return true;
  if (Array.isArray(err.errors) && err.errors.some((e) => CONN_ERROR_CODES.has(e?.code))) return true; // AggregateError
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

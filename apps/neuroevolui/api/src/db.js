// db.js — pool Postgres + migrations versionadas com advisory-lock. Gerado pela Forge (gymops-style).
import pg from 'pg';
export const pool = new pg.Pool({ connectionString: process.env.DATABASE_URL });

export const MIGRATIONS = [
  `CREATE TABLE IF NOT EXISTS records (
    id SERIAL PRIMARY KEY,
    tenant_id INTEGER NOT NULL DEFAULT 1,
    title TEXT NOT NULL,
    status TEXT NOT NULL DEFAULT 'open',
    external_ref TEXT,
    created_at TIMESTAMPTZ DEFAULT now(),
    updated_at TIMESTAMPTZ DEFAULT now()
  )`,
  `CREATE TABLE IF NOT EXISTS idempotency_registry (
    idempotency_key TEXT NOT NULL,
    operation TEXT NOT NULL,
    entity_type TEXT,
    entity_id TEXT,
    response_json JSONB,
    created_at TIMESTAMPTZ DEFAULT now(),
    PRIMARY KEY (idempotency_key, operation)
  )`,
];

export async function migrate() {
  const c = await pool.connect();
  try {
    await c.query('SELECT pg_advisory_lock(66021)');
    await c.query(`CREATE TABLE IF NOT EXISTS schema_migrations (version INTEGER PRIMARY KEY)`);
    const done = new Set((await c.query('SELECT version FROM schema_migrations')).rows.map((r) => r.version));
    for (let i = 0; i < MIGRATIONS.length; i++) {
      const v = i + 1;
      if (done.has(v)) continue;
      await c.query('BEGIN');
      try {
        await c.query(MIGRATIONS[i]);
        await c.query('INSERT INTO schema_migrations(version) VALUES ($1)', [v]);
        await c.query('COMMIT');
      } catch (e) {
        await c.query('ROLLBACK');
        throw e;
      }
      console.log('[migrate] v' + v);
    }
  } finally {
    await c.query('SELECT pg_advisory_unlock(66021)').catch(() => {});
    c.release();
  }
}

export async function seed() {
  const { rows } = await pool.query('SELECT count(*)::int n FROM records');
  if (rows[0].n === 0) await pool.query(`INSERT INTO records(title) VALUES ('Exemplo')`);
}

export async function idempotencyGet(operation, key) {
  try {
    const { rows } = await pool.query(
      'SELECT response_json FROM idempotency_registry WHERE idempotency_key=$1 AND operation=$2',
      [key, operation]
    );
    return rows[0]?.response_json || null;
  } catch {
    return null;
  }
}

export async function idempotencySave(operation, key, entityType, entityId, response) {
  try {
    await pool.query(
      `INSERT INTO idempotency_registry(idempotency_key, operation, entity_type, entity_id, response_json)
       VALUES ($1,$2,$3,$4,$5::jsonb)
       ON CONFLICT (idempotency_key, operation) DO UPDATE SET response_json = excluded.response_json`,
      [key, operation, entityType || null, entityId || null, JSON.stringify(response)]
    );
  } catch {
    // graceful — falha de persistência não quebra a requisição
  }
}

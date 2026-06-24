// db.js — pool + migrations versionadas (advisory-lock no boot) + seed. Gerado pela Forge.
import pg from 'pg';
export const pool = new pg.Pool({ connectionString: process.env.DATABASE_URL });
const MIGRATIONS = [`CREATE TABLE IF NOT EXISTS records (id SERIAL PRIMARY KEY, tenant_id INTEGER NOT NULL DEFAULT 1, title TEXT NOT NULL, status TEXT NOT NULL DEFAULT 'open', payload JSONB NOT NULL DEFAULT '{}'::jsonb, external_ref TEXT, created_at TIMESTAMPTZ DEFAULT now(), updated_at TIMESTAMPTZ DEFAULT now());`];
export async function migrate() {
  const c = await pool.connect();
  try {
    await c.query('SELECT pg_advisory_lock(77131)');
    await c.query(`CREATE TABLE IF NOT EXISTS schema_migrations (version INTEGER PRIMARY KEY, applied_at TIMESTAMPTZ DEFAULT now())`);
    const { rows } = await c.query('SELECT version FROM schema_migrations');
    const done = new Set(rows.map((r) => r.version));
    for (let i = 0; i < MIGRATIONS.length; i++) { const v = i + 1; if (done.has(v)) continue;
      await c.query('BEGIN');
      try { await c.query(MIGRATIONS[i]); await c.query('INSERT INTO schema_migrations(version) VALUES ($1)', [v]); await c.query('COMMIT'); }
      catch (e) { await c.query('ROLLBACK'); throw e; }
      console.log('[migrate] migration ' + v); }
  } finally { await c.query('SELECT pg_advisory_unlock(77131)').catch(() => {}); c.release(); }
}
export async function seed() {
  const { rows } = await pool.query('SELECT count(*)::int AS n FROM records');
  if (rows[0].n > 0) return;
  await pool.query(`INSERT INTO records(title) VALUES ('Registro de exemplo')`);
  console.log('[seed] ok');
}

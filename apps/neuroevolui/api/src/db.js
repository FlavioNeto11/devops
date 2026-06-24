// db.js — pool Postgres + migrations multi-tenant. Gerado pela Forge (gymops-style).
import pg from 'pg';
export const pool = new pg.Pool({ connectionString: process.env.DATABASE_URL });
const MIGRATIONS = [
  // v1: tabela base
  `CREATE TABLE IF NOT EXISTS records (id SERIAL PRIMARY KEY, tenant_id INTEGER NOT NULL DEFAULT 1, title TEXT NOT NULL, status TEXT NOT NULL DEFAULT 'open', external_ref TEXT, created_at TIMESTAMPTZ DEFAULT now(), updated_at TIMESTAMPTZ DEFAULT now())`,
  // v2: auditoria — coluna created_by (AC1 REQ-NEUROEVOLUI-0002)
  `ALTER TABLE records ADD COLUMN IF NOT EXISTS created_by TEXT NOT NULL DEFAULT 'system'`,
  // v3: soft-delete para compliance (AC6 REQ-NEUROEVOLUI-0002)
  `ALTER TABLE records ADD COLUMN IF NOT EXISTS deleted_at TIMESTAMPTZ`,
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
      } catch (e) { await c.query('ROLLBACK'); throw e; }
      console.log('[migrate] ' + v);
    }
  } finally { await c.query('SELECT pg_advisory_unlock(66021)').catch(() => {}); c.release(); }
}
export async function seed() {
  const { rows } = await pool.query('SELECT count(*)::int n FROM records WHERE deleted_at IS NULL');
  if (rows[0].n === 0) await pool.query(`INSERT INTO records(title, created_by) VALUES ('Exemplo', 'system')`);
}

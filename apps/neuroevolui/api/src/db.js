// db.js — pool Postgres + migrations multi-tenant. Gerado pela Forge (gymops-style).
import pg from 'pg';
export const pool = new pg.Pool({ connectionString: process.env.DATABASE_URL });
const MIGRATIONS = [
  // 1 — records (existente)
  `CREATE TABLE IF NOT EXISTS records (id SERIAL PRIMARY KEY, tenant_id INTEGER NOT NULL DEFAULT 1, title TEXT NOT NULL, status TEXT NOT NULL DEFAULT 'open', external_ref TEXT, created_at TIMESTAMPTZ DEFAULT now(), updated_at TIMESTAMPTZ DEFAULT now());`,
  // 2 — patients
  `CREATE TABLE IF NOT EXISTS patients (id SERIAL PRIMARY KEY, tenant_id INTEGER NOT NULL DEFAULT 1, name TEXT NOT NULL, birth_date DATE, record_number TEXT, created_at TIMESTAMPTZ DEFAULT now(), updated_at TIMESTAMPTZ DEFAULT now());`,
  // 3 — evolution_notes (soft-delete + structured fields)
  `CREATE TABLE IF NOT EXISTS evolution_notes (id SERIAL PRIMARY KEY, patient_id INTEGER NOT NULL, tenant_id INTEGER NOT NULL DEFAULT 1, note_date DATE NOT NULL DEFAULT CURRENT_DATE, professional TEXT NOT NULL, note_type TEXT NOT NULL DEFAULT 'consulta', text_content TEXT, test_name TEXT, test_result TEXT, recommendation TEXT, deleted_at TIMESTAMPTZ, deleted_by TEXT, created_by TEXT NOT NULL DEFAULT 'system', created_at TIMESTAMPTZ DEFAULT now(), updated_at TIMESTAMPTZ DEFAULT now());`,
  // 4 — evolution_note_attachments (metadata)
  `CREATE TABLE IF NOT EXISTS evolution_note_attachments (id SERIAL PRIMARY KEY, note_id INTEGER NOT NULL, filename TEXT NOT NULL, mimetype TEXT NOT NULL DEFAULT 'application/octet-stream', size_bytes INTEGER DEFAULT 0, created_at TIMESTAMPTZ DEFAULT now());`,
  // 5 — evolution_note_versions (audit trail)
  `CREATE TABLE IF NOT EXISTS evolution_note_versions (id SERIAL PRIMARY KEY, note_id INTEGER NOT NULL, version_number INTEGER NOT NULL, editor TEXT NOT NULL, edited_at TIMESTAMPTZ DEFAULT now(), snapshot JSONB NOT NULL);`,
  // 6 — patient_reports (async PDF generation)
  `CREATE TABLE IF NOT EXISTS patient_reports (id SERIAL PRIMARY KEY, patient_id INTEGER NOT NULL, tenant_id INTEGER NOT NULL DEFAULT 1, filters JSONB DEFAULT '{}', report_data JSONB, status TEXT NOT NULL DEFAULT 'pending', created_at TIMESTAMPTZ DEFAULT now(), updated_at TIMESTAMPTZ DEFAULT now());`,
];
export async function migrate() {
  const c = await pool.connect();
  try { await c.query('SELECT pg_advisory_lock(66021)');
    await c.query(`CREATE TABLE IF NOT EXISTS schema_migrations (version INTEGER PRIMARY KEY)`);
    const done = new Set((await c.query('SELECT version FROM schema_migrations')).rows.map((r) => r.version));
    for (let i = 0; i < MIGRATIONS.length; i++) { const v = i + 1; if (done.has(v)) continue;
      await c.query('BEGIN'); try { await c.query(MIGRATIONS[i]); await c.query('INSERT INTO schema_migrations(version) VALUES ($1)', [v]); await c.query('COMMIT'); } catch (e) { await c.query('ROLLBACK'); throw e; }
      console.log('[migrate] ' + v); }
  } finally { await c.query('SELECT pg_advisory_unlock(66021)').catch(() => {}); c.release(); }
}
export async function seed() { const { rows } = await pool.query('SELECT count(*)::int n FROM records'); if (rows[0].n === 0) await pool.query(`INSERT INTO records(title) VALUES ('Exemplo')`); }

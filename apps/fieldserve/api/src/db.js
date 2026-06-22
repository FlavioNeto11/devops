// db.js — pool Postgres + migrations versionadas (advisory-lock no boot) + seed.
// Bloco migrations-versionadas: SQL idempotente, AUTO_MIGRATE/AUTO_SEED no boot.
import pg from 'pg';

export const pool = new pg.Pool({ connectionString: process.env.DATABASE_URL });

const MIGRATIONS = [
  // 001 — schema base multi-tenant
  `CREATE TABLE IF NOT EXISTS tenants (
     id SERIAL PRIMARY KEY, name TEXT NOT NULL, created_at TIMESTAMPTZ DEFAULT now());
   CREATE TABLE IF NOT EXISTS assets (
     id SERIAL PRIMARY KEY, tenant_id INTEGER NOT NULL REFERENCES tenants ON DELETE CASCADE,
     name TEXT NOT NULL, kind TEXT, created_at TIMESTAMPTZ DEFAULT now());
   CREATE TABLE IF NOT EXISTS technicians (
     id SERIAL PRIMARY KEY, tenant_id INTEGER NOT NULL REFERENCES tenants ON DELETE CASCADE,
     name TEXT NOT NULL, created_at TIMESTAMPTZ DEFAULT now());
   CREATE TABLE IF NOT EXISTS work_orders (
     id SERIAL PRIMARY KEY, tenant_id INTEGER NOT NULL REFERENCES tenants ON DELETE CASCADE,
     title TEXT NOT NULL,
     status TEXT NOT NULL DEFAULT 'open' CHECK (status IN ('open','assigned','submitting','submitted','failed','done')),
     priority TEXT NOT NULL DEFAULT 'medium' CHECK (priority IN ('low','medium','high','critical')),
     asset_id INTEGER REFERENCES assets ON DELETE SET NULL,
     technician_id INTEGER REFERENCES technicians ON DELETE SET NULL,
     external_ref TEXT,
     created_at TIMESTAMPTZ DEFAULT now(), updated_at TIMESTAMPTZ DEFAULT now());`,
  // 002 — fila transacional + idempotência
  `CREATE TABLE IF NOT EXISTS jobs (
     id BIGSERIAL PRIMARY KEY, type TEXT NOT NULL, payload JSONB NOT NULL DEFAULT '{}'::jsonb,
     status TEXT NOT NULL DEFAULT 'queued' CHECK (status IN ('queued','running','done','dlq')),
     attempts INTEGER NOT NULL DEFAULT 0, max_attempts INTEGER NOT NULL DEFAULT 4,
     run_after TIMESTAMPTZ NOT NULL DEFAULT now(),
     locked_at TIMESTAMPTZ, locked_by TEXT, last_error TEXT, job_key TEXT UNIQUE,
     created_at TIMESTAMPTZ DEFAULT now(), updated_at TIMESTAMPTZ DEFAULT now());
   CREATE INDEX IF NOT EXISTS jobs_claim_idx ON jobs (status, run_after) WHERE status='queued';
   CREATE TABLE IF NOT EXISTS idempotency_keys (
     key TEXT PRIMARY KEY, response JSONB NOT NULL, created_at TIMESTAMPTZ DEFAULT now());`,
];

export async function migrate() {
  const c = await pool.connect();
  try {
    await c.query('SELECT pg_advisory_lock(91823)'); // advisory-lock: seguro com múltiplas réplicas
    await c.query(`CREATE TABLE IF NOT EXISTS schema_migrations (version INTEGER PRIMARY KEY, applied_at TIMESTAMPTZ DEFAULT now())`);
    const { rows } = await c.query('SELECT version FROM schema_migrations');
    const done = new Set(rows.map((r) => r.version));
    for (let i = 0; i < MIGRATIONS.length; i++) {
      const v = i + 1;
      if (done.has(v)) continue;
      await c.query('BEGIN');
      try { await c.query(MIGRATIONS[i]); await c.query('INSERT INTO schema_migrations(version) VALUES ($1)', [v]); await c.query('COMMIT'); }
      catch (e) { await c.query('ROLLBACK'); throw e; }
      console.log(`[migrate] aplicada migration ${v}`);
    }
  } finally { await c.query('SELECT pg_advisory_unlock(91823)').catch(() => {}); c.release(); }
}

export async function seed() {
  const { rows } = await pool.query('SELECT count(*)::int AS n FROM tenants');
  if (rows[0].n > 0) return;
  const t1 = (await pool.query(`INSERT INTO tenants(name) VALUES ('Empresa Alfa') RETURNING id`)).rows[0].id;
  const t2 = (await pool.query(`INSERT INTO tenants(name) VALUES ('Empresa Beta') RETURNING id`)).rows[0].id;
  const a1 = (await pool.query(`INSERT INTO assets(tenant_id,name,kind) VALUES ($1,'Compressor 01','HVAC') RETURNING id`, [t1])).rows[0].id;
  const tec1 = (await pool.query(`INSERT INTO technicians(tenant_id,name) VALUES ($1,'Joana Silva') RETURNING id`, [t1])).rows[0].id;
  await pool.query(`INSERT INTO work_orders(tenant_id,title,priority,asset_id,technician_id) VALUES ($1,'Manutenção preventiva do compressor','high',$2,$3)`, [t1, a1, tec1]);
  await pool.query(`INSERT INTO assets(tenant_id,name,kind) VALUES ($1,'Gerador 02','energia')`, [t2]);
  console.log('[seed] dados de exemplo inseridos');
}

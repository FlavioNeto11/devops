// db.js — pool Postgres + migrations multi-tenant. Gerado pela Forge (gymops-style).
import pg from 'pg';
export const pool = new pg.Pool({ connectionString: process.env.DATABASE_URL });
const MIGRATIONS = [
  `CREATE TABLE IF NOT EXISTS records (id SERIAL PRIMARY KEY, tenant_id INTEGER NOT NULL DEFAULT 1, title TEXT NOT NULL, status TEXT NOT NULL DEFAULT 'open', external_ref TEXT, created_at TIMESTAMPTZ DEFAULT now(), updated_at TIMESTAMPTZ DEFAULT now());`,
  `CREATE TABLE IF NOT EXISTS idempotency_registry (idempotency_key TEXT NOT NULL, operation TEXT NOT NULL, entity_type TEXT, entity_id TEXT, response_json JSONB NOT NULL, created_at TIMESTAMPTZ DEFAULT now(), PRIMARY KEY(idempotency_key, operation));`,
  `CREATE TABLE IF NOT EXISTS consultations (id BIGSERIAL PRIMARY KEY, tenant_id INTEGER NOT NULL DEFAULT 1, patient_id TEXT NOT NULL, professional_id TEXT NOT NULL, scheduled_at TIMESTAMPTZ NOT NULL, scheduled_end_at TIMESTAMPTZ NOT NULL, amount_cents INTEGER NOT NULL, currency TEXT NOT NULL DEFAULT 'BRL', status TEXT NOT NULL DEFAULT 'scheduled', payment_status TEXT NOT NULL DEFAULT 'pending', payment_transaction_id TEXT, created_by TEXT NOT NULL DEFAULT 'system', created_at TIMESTAMPTZ DEFAULT now(), updated_at TIMESTAMPTZ DEFAULT now());`,
  `CREATE TABLE IF NOT EXISTS payment_transactions (id BIGSERIAL PRIMARY KEY, tenant_id INTEGER NOT NULL DEFAULT 1, consultation_id BIGINT, idempotency_key TEXT NOT NULL, gateway_transaction_id TEXT NOT NULL, gateway_provider TEXT NOT NULL DEFAULT 'sandbox', amount_cents INTEGER NOT NULL, currency TEXT NOT NULL DEFAULT 'BRL', status TEXT NOT NULL, metadata JSONB, created_by TEXT NOT NULL DEFAULT 'system', created_at TIMESTAMPTZ DEFAULT now());`,
  `CREATE TABLE IF NOT EXISTS audit_logs (id BIGSERIAL PRIMARY KEY, tenant_id INTEGER NOT NULL DEFAULT 1, entity_type TEXT NOT NULL, entity_id TEXT, action TEXT NOT NULL, actor TEXT, amount_cents INTEGER, payment_status TEXT, gateway TEXT, metadata JSONB, created_at TIMESTAMPTZ DEFAULT now());`,
  `CREATE TABLE IF NOT EXISTS webhook_events (id BIGSERIAL PRIMARY KEY, tenant_id INTEGER NOT NULL DEFAULT 1, event_id TEXT NOT NULL UNIQUE, gateway_provider TEXT NOT NULL DEFAULT 'sandbox', event_type TEXT NOT NULL, payload JSONB NOT NULL, processed_at TIMESTAMPTZ, created_at TIMESTAMPTZ DEFAULT now());`,
  `ALTER TABLE records ADD COLUMN IF NOT EXISTS created_by TEXT NOT NULL DEFAULT 'system'`,
  `ALTER TABLE records ADD COLUMN IF NOT EXISTS deleted_at TIMESTAMPTZ`,
  `ALTER TABLE consultations ADD COLUMN IF NOT EXISTS deleted_at TIMESTAMPTZ`,
  `CREATE TABLE IF NOT EXISTS async_jobs (
    id BIGSERIAL PRIMARY KEY,
    tenant_id INTEGER NOT NULL DEFAULT 1,
    queue_name TEXT NOT NULL,
    job_key TEXT NOT NULL,
    job_id TEXT NOT NULL,
    status TEXT NOT NULL DEFAULT 'queued',
    payload JSONB,
    result JSONB,
    created_by TEXT NOT NULL DEFAULT 'system',
    created_at TIMESTAMPTZ DEFAULT now(),
    updated_at TIMESTAMPTZ DEFAULT now(),
    UNIQUE(queue_name, job_key)
  )`,
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

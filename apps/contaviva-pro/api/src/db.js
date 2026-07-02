// db.js — pool Postgres + migrations multi-tenant. Gerado pela Forge (gymops-style).
import pg from 'pg';
import { hashPassword } from './auth.js';
export const pool = new pg.Pool({ connectionString: process.env.DATABASE_URL });
const MIGRATIONS = [
  `CREATE TABLE IF NOT EXISTS records (id SERIAL PRIMARY KEY, tenant_id INTEGER NOT NULL DEFAULT 1, title TEXT NOT NULL, status TEXT NOT NULL DEFAULT 'open', external_ref TEXT, created_at TIMESTAMPTZ DEFAULT now(), updated_at TIMESTAMPTZ DEFAULT now());`,
  `CREATE TABLE IF NOT EXISTS users (id SERIAL PRIMARY KEY, tenant_id INTEGER NOT NULL DEFAULT 1, email TEXT UNIQUE NOT NULL, name TEXT, password_hash TEXT, role TEXT NOT NULL DEFAULT 'member', is_active BOOLEAN NOT NULL DEFAULT true, created_at TIMESTAMPTZ DEFAULT now(), updated_at TIMESTAMPTZ DEFAULT now());`,
  `CREATE TABLE IF NOT EXISTS sessions (id SERIAL PRIMARY KEY, user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE, refresh_hash TEXT NOT NULL, expires_at TIMESTAMPTZ NOT NULL, revoked_at TIMESTAMPTZ, created_at TIMESTAMPTZ DEFAULT now());`,
  `CREATE TABLE IF NOT EXISTS audit_logs (id SERIAL PRIMARY KEY, tenant_id INTEGER, actor TEXT, action TEXT, entity TEXT, entity_id TEXT, created_at TIMESTAMPTZ DEFAULT now());`,
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
// Espera o Postgres aceitar conexões antes do migrate/boot. Sem isso, num cold start (o pod do
// Postgres ainda subindo) o primeiro SELECT dava ECONNREFUSED e o processo MORRIA — só se
// recuperava por sorte no CrashLoopBackOff. Retry com backoff até DB_WAIT_MS (default 60s).
export async function waitForDb() {
  const deadline = Date.now() + (Number(process.env.DB_WAIT_MS) || 60000);
  let lastErr;
  while (Date.now() < deadline) {
    try { await pool.query('SELECT 1'); return; } catch (e) { lastErr = e; await new Promise((r) => setTimeout(r, 1500)); }
  }
  throw new Error('Postgres indisponível após espera: ' + (lastErr && lastErr.message ? lastErr.message : lastErr));
}
export async function seed() {
  const { rows } = await pool.query('SELECT count(*)::int n FROM records'); if (rows[0].n === 0) await pool.query(`INSERT INTO records(title) VALUES ('Exemplo')`);
  const bootEmail = process.env.BOOTSTRAP_ADMIN_EMAIL;
  const bootPass = process.env.BOOTSTRAP_ADMIN_PASSWORD;
  if (!bootEmail || !bootPass) {
    console.warn('[seed] sem BOOTSTRAP_ADMIN_EMAIL/BOOTSTRAP_ADMIN_PASSWORD — admin de bootstrap NÃO criado (sem senha default).');
  } else {
    const email = String(bootEmail).toLowerCase();
    const hash = await hashPassword(String(bootPass));
    await pool.query('INSERT INTO users(tenant_id,email,name,password_hash,role) VALUES (1,$1,$2,$3,$4) ON CONFLICT (email) DO NOTHING', [email, 'Administrador', hash, 'admin']);
    console.log('[seed] admin de bootstrap: ' + email);
  }
}

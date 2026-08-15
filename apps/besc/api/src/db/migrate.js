// Migrations: arquivos sql/NNNN_*.sql aplicados em ordem, cada um em transacao
// propria, registrados em schema_migrations (padrao SICAT) + pg_advisory_lock
// (melhoria: serializa boots concorrentes; o SICAT nao usa lock).
import { promises as fs } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { getPool } from '../db.js';

const SQL_DIR = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', '..', 'sql');
const MIGRATE_LOCK = 77223301; // constante arbitraria do app besc

export async function runMigrations() {
  const pool = getPool();
  if (!pool) return { applied: [] };
  const client = await pool.connect();
  const applied = [];
  try {
    await client.query('SELECT pg_advisory_lock($1)', [MIGRATE_LOCK]);
    await client.query(`CREATE TABLE IF NOT EXISTS schema_migrations (
      version TEXT PRIMARY KEY,
      applied_at TIMESTAMPTZ NOT NULL DEFAULT now()
    )`);
    const done = new Set((await client.query('SELECT version FROM schema_migrations')).rows.map((r) => r.version));
    const files = (await fs.readdir(SQL_DIR)).filter((f) => f.endsWith('.sql')).sort();
    for (const file of files) {
      if (done.has(file)) continue;
      const sql = await fs.readFile(path.join(SQL_DIR, file), 'utf8');
      try {
        await client.query('BEGIN');
        await client.query(sql);
        await client.query('INSERT INTO schema_migrations (version) VALUES ($1)', [file]);
        await client.query('COMMIT');
        applied.push(file);
        console.log(`[migrate] aplicado: ${file}`);
      } catch (e) {
        await client.query('ROLLBACK').catch(() => {});
        throw new Error(`migration ${file} falhou: ${e.message}`);
      }
    }
  } finally {
    await client.query('SELECT pg_advisory_unlock($1)', [MIGRATE_LOCK]).catch(() => {});
    client.release();
  }
  return { applied };
}

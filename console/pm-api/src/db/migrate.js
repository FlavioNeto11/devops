import { readdirSync, readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { pool } from './pool.js';

const sqlDir = join(dirname(fileURLToPath(import.meta.url)), '..', 'sql');

/**
 * Migracao no idioma do SICAT: .sql numerados + tabela schema_migrations.
 * Cada arquivo nao aplicado roda numa transacao e e registrado. Idempotente.
 */
export async function migrate() {
  await pool.query(
    'CREATE TABLE IF NOT EXISTS schema_migrations (version text PRIMARY KEY, applied_at timestamptz NOT NULL DEFAULT now())',
  );
  const applied = new Set(
    (await pool.query('SELECT version FROM schema_migrations')).rows.map((r) => r.version),
  );
  const files = readdirSync(sqlDir).filter((f) => f.endsWith('.sql')).sort();
  let count = 0;
  for (const file of files) {
    if (applied.has(file)) continue;
    const sql = readFileSync(join(sqlDir, file), 'utf8');
    const client = await pool.connect();
    try {
      await client.query('BEGIN');
      await client.query(sql);
      await client.query('INSERT INTO schema_migrations(version) VALUES ($1)', [file]);
      await client.query('COMMIT');
      count += 1;
      // eslint-disable-next-line no-console
      console.info(`[migrate] aplicado ${file}`);
    } catch (err) {
      await client.query('ROLLBACK');
      throw err;
    } finally {
      client.release();
    }
  }
  // eslint-disable-next-line no-console
  console.info(`[migrate] ${count} nova(s) migracao(oes); total ${files.length}.`);
}

// Permite rodar standalone: `node src/db/migrate.js`
if (process.argv[1] && import.meta.url === `file://${process.argv[1].replace(/\\/g, '/')}`) {
  migrate()
    .then(() => process.exit(0))
    .catch((err) => {
      // eslint-disable-next-line no-console
      console.error('[migrate] falhou:', err);
      process.exit(1);
    });
}

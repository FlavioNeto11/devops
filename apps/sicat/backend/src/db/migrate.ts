import fs from 'node:fs/promises';
import path from 'node:path';
import { pool } from './pool.js';

export async function runMigrations() {
  const migrationsDir = path.resolve(process.cwd(), 'src/sql');
  const files = (await fs.readdir(migrationsDir)).filter((name) => name.endsWith('.sql')).sort();

  await pool.query(`
    create table if not exists schema_migrations (
      version text primary key,
      applied_at timestamptz not null default now()
    )
  `);

  for (const file of files) {
    const exists = await pool.query('select 1 from schema_migrations where version = $1', [file]);
    if ((exists.rowCount ?? 0) > 0) continue;

    const sql = await fs.readFile(path.join(migrationsDir, file), 'utf8');
    const client = await pool.connect();
    try {
      await client.query('begin');
      await client.query(sql);
      await client.query('insert into schema_migrations(version) values ($1)', [file]);
      await client.query('commit');
      console.log(`[migrate] aplicado ${file}`);
    } catch (error: unknown) {
      await client.query('rollback');
      throw error;
    } finally {
      client.release();
    }
  }
}

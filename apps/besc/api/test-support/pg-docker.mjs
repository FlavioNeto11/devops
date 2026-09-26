// Postgres DESCARTÁVEL para testes de banco. Dois modos, nunca o besc-postgres do cluster:
//   1. TEST_PG_ADMIN_URL definido → cria um BANCO novo e exclusivo por arquivo de teste naquele
//      servidor (usado quando os testes rodam dentro do contêiner node:20 de produção, sem docker CLI);
//   2. senão → `docker run --rm postgres:16-alpine` numa porta aleatória em 127.0.0.1.
// Sem nenhum dos dois, devolve null e o teste é PULADO — exceto na suíte anti-Excalibur, que exige
// banco (ver requirePgOrFail).
import { execFileSync, spawnSync } from 'node:child_process';

const IMAGE = process.env.BESC_TEST_PG_IMAGE || 'postgres:16-alpine';
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

export function dockerAvailable() {
  try {
    execFileSync('docker', ['version', '--format', '{{.Server.Version}}'], { stdio: 'pipe', timeout: 15000 });
    return true;
  } catch {
    return false;
  }
}

// Senha fixa do papel besc_app nos testes: o papel é do cluster e vários bancos de teste podem
// compartilhar o mesmo servidor (modo 1); a mesma senha evita corrida entre arquivos.
export const TEST_APP_PASSWORD = 'besc-app-test-only';

// Configura o ambiente da API para o banco de teste (antes de importar src/config.js).
export function usePgEnv(inst, { appPassword = TEST_APP_PASSWORD } = {}) {
  process.env.DATABASE_URL = inst.url;
  process.env.SESSION_SECRET = process.env.SESSION_SECRET || 'test-secret';
  if (appPassword) process.env.BESC_DB_APP_PASSWORD = appPassword; else delete process.env.BESC_DB_APP_PASSWORD;
}

async function startDatabaseOnServer(adminUrl) {
  const pg = (await import('pg')).default;
  const name = `besc_t_${process.pid}_${Math.floor(Math.random() * 1e9)}`;
  const admin = new pg.Client({ connectionString: adminUrl });
  await admin.connect();
  await admin.query(`CREATE DATABASE ${name}`);
  await admin.end();
  const u = new URL(adminUrl); u.pathname = `/${name}`;
  const stop = async () => {
    const c = new pg.Client({ connectionString: adminUrl });
    try { await c.connect(); await c.query(`DROP DATABASE IF EXISTS ${name} WITH (FORCE)`); } catch { /* servidor descartável */ } finally { await c.end().catch(() => {}); }
  };
  return { url: u.toString(), name, stop };
}

export async function startDisposablePg() {
  if (process.env.TEST_PG_ADMIN_URL) return startDatabaseOnServer(process.env.TEST_PG_ADMIN_URL);
  if (!dockerAvailable()) return null;
  const port = 21000 + Math.floor(Math.random() * 20000);
  const name = `besc-test-pg-${process.pid}-${port}`;
  execFileSync('docker', ['run', '-d', '--rm', '--name', name, '-e', 'POSTGRES_PASSWORD=t', '-p', `127.0.0.1:${port}:5432`, IMAGE], { stdio: 'pipe' });
  const stop = () => { try { execFileSync('docker', ['rm', '-f', name], { stdio: 'pipe' }); } catch { /* já parado */ } };
  const url = `postgres://postgres:t@127.0.0.1:${port}/postgres`;
  // A imagem oficial reinicia uma vez após o initdb: esperar o fim do init antes de conectar.
  for (let i = 0; i < 120; i++) {
    const out = spawnSync('docker', ['logs', name], { encoding: 'utf8' });
    if (/PostgreSQL init process complete/.test(`${out.stdout || ''}${out.stderr || ''}`)) break;
    await sleep(500);
  }
  const pg = (await import('pg')).default;
  for (let i = 0; i < 60; i++) {
    try {
      const c = new pg.Client({ connectionString: url });
      await c.connect();
      await c.query('SELECT 1');
      await c.end();
      return { url, name, stop };
    } catch {
      await sleep(500);
    }
  }
  stop();
  throw new Error('postgres descartável não subiu');
}

// Para testes que NÃO podem passar vaziamente (suíte anti-Excalibur): sem banco, falha — a menos
// que BESC_TEST_ALLOW_NO_PG=1 seja definido explicitamente.
export function requirePgOrFail(inst) {
  if (inst) return false;
  if (process.env.BESC_TEST_ALLOW_NO_PG === '1') return 'sem Postgres e BESC_TEST_ALLOW_NO_PG=1';
  throw new Error('suíte anti-Excalibur exige Postgres (Docker ou TEST_PG_ADMIN_URL); defina BESC_TEST_ALLOW_NO_PG=1 só se souber o que faz');
}

// Migrations (papel de migração) + papel de runtime preparado, como no boot.
export async function migrateAndPrepare() {
  const { runMigrations } = await import('../src/db/migrate.js');
  const db = await import('../src/db.js');
  await runMigrations();
  await db.prepareRuntimeRole();
  return db;
}

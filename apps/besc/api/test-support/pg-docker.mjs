// Postgres DESCARTÁVEL para testes de banco: `docker run --rm postgres:16-alpine` numa porta
// aleatória em 127.0.0.1. Nunca aponta para o besc-postgres do cluster. Sem Docker, devolve null
// e o teste é PULADO (não falha), no mesmo padrão do besu-parity.
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

export async function startDisposablePg() {
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

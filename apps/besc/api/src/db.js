// Pool Postgres da fundacao. Fail-soft: se o banco cair, o portal publico segue;
// rotas que dependem de identidade respondem 503 (fail-closed) ate ele voltar.
import pg from 'pg';
import { config } from './config.js';

let pool = null;
let ready = false;

export function getPool() {
  if (!pool && config.databaseUrl) {
    pool = new pg.Pool({ connectionString: config.databaseUrl, max: 10, ssl: false });
    pool.on('error', (e) => { console.error('[db] pool error:', e.message); ready = false; });
  }
  return pool;
}

export function isDbReady() { return ready; }

export async function query(text, params) {
  const p = getPool();
  if (!p) throw new Error('db indisponível');
  return p.query(text, params);
}

// Transacao com client dedicado.
export async function tx(fn) {
  const p = getPool();
  if (!p) throw new Error('db indisponível');
  const client = await p.connect();
  try {
    await client.query('BEGIN');
    const out = await fn(client);
    await client.query('COMMIT');
    return out;
  } catch (e) {
    await client.query('ROLLBACK').catch(() => {});
    throw e;
  } finally {
    client.release();
  }
}

// Espera o banco ficar pronto (boot) e mantem a flag `ready` atualizada.
export async function waitDbReady({ attempts = 30, delayMs = 2000 } = {}) {
  const p = getPool();
  if (!p) return false;
  for (let i = 0; i < attempts; i++) {
    try {
      await p.query('SELECT 1');
      ready = true;
      return true;
    } catch (e) {
      if (i === 0 || i % 5 === 4) console.error(`[db] aguardando postgres (${i + 1}/${attempts}):`, e.message);
      await new Promise((r) => setTimeout(r, delayMs));
    }
  }
  return false;
}

// Vigia continuo: reavalia a saude do banco (religa `ready` quando ele volta).
export function startDbWatch({ intervalMs = 15000 } = {}) {
  const p = getPool();
  if (!p) return;
  setInterval(async () => {
    try { await p.query('SELECT 1'); ready = true; }
    catch { ready = false; }
  }, intervalMs).unref();
}

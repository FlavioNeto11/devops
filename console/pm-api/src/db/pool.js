import pg from 'pg';

const { Pool } = pg;

// DATABASE_URL vem do Secret pm-db (nunca em git). Sem ele, falha cedo (probe acusa).
export const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  max: 5,
  idleTimeoutMillis: 30_000,
});

pool.on('error', (err) => {
  // eslint-disable-next-line no-console
  console.error('[pm-db] erro no pool ocioso:', err.message);
});

/** Query simples. */
export function query(text, params) {
  return pool.query(text, params);
}

/** Executa fn(client) numa transacao (BEGIN/COMMIT/ROLLBACK). */
export async function withTx(fn) {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const result = await fn(client);
    await client.query('COMMIT');
    return result;
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
  }
}

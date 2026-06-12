import pg from 'pg';

const { Pool } = pg;

// DATABASE_URL vem do Secret pm-db (nunca em git). Sem ele, falha cedo (probe acusa).
// max 10: comporta uploads concorrentes + geracao de IA sem enfileirar; o Postgres
// do pm e dedicado. connectionTimeoutMillis falha rapido (em vez de pendurar a
// request) quando o banco esta fora — a probe /health acusa em segundos.
export const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  max: 10,
  idleTimeoutMillis: 30_000,
  connectionTimeoutMillis: 5_000,
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
    // ROLLBACK pode falhar se a conexao morreu no meio da transacao; o erro
    // original (err) e o que importa — nao deixar o rollback mascara-lo.
    try {
      await client.query('ROLLBACK');
    } catch {
      /* conexao perdida: o release destroi o client */
    }
    throw err;
  } finally {
    client.release();
  }
}

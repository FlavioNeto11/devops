import pg from 'pg';
import { config } from '../lib/config.js';
import type { PoolClient, QueryResult, QueryResultRow } from 'pg';

const { Pool } = pg;

// max 10 cobre api + worker (cada processo tem o proprio pool) sem esgotar o
// Postgres single-node; connectionTimeoutMillis falha rapido quando o banco
// esta fora (probe/health acusam em segundos em vez de requests pendurados).
// Sem statement_timeout global: migrations e jobs longos sao legitimos aqui.
export const pool = new Pool({
  connectionString: config.databaseUrl,
  ssl: config.databaseSsl ? { rejectUnauthorized: false } : false,
  max: 10,
  idleTimeoutMillis: 30_000,
  connectionTimeoutMillis: 5_000
});

/**
 * @template {QueryResultRow} T
 * @param {string} text
 * @param {readonly unknown[]} [params]
 * @returns {Promise<QueryResult<T>>}
 */
export async function query<T extends QueryResultRow = QueryResultRow>(
  text: string,
  params: readonly unknown[] = []
): Promise<QueryResult<T>> {
  return pool.query<T>(text, [...params]);
}

/**
 * @template T
 * @param {(client: PoolClient) => Promise<T>} fn
 * @returns {Promise<T>}
 */
export async function withTransaction<T>(
  fn: (client: PoolClient) => Promise<T>
): Promise<T> {
  const client = await pool.connect();
  try {
    await client.query('begin');
    const result = await fn(client);
    await client.query('commit');
    return result;
  } catch (error: unknown) {
    await client.query('rollback');
    throw error;
  } finally {
    client.release();
  }
}

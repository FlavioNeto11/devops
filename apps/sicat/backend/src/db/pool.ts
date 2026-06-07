import pg from 'pg';
import { config } from '../lib/config.js';
import type { PoolClient, QueryResult, QueryResultRow } from 'pg';

const { Pool } = pg;

export const pool = new Pool({
  connectionString: config.databaseUrl,
  ssl: config.databaseSsl ? { rejectUnauthorized: false } : false
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

// repositories/idempotency.js — SQL para idempotency_keys (camadas-rigidas).
import { pool } from '../db.js';

export async function findIdempotency(key, operation) {
  const { rows } = await pool.query(
    'SELECT response_json FROM idempotency_keys WHERE idempotency_key=$1 AND operation=$2',
    [key, operation]
  );
  return rows[0] ? rows[0].response_json : null;
}

export async function saveIdempotency(key, operation, entityType, entityId, response) {
  await pool.query(
    'INSERT INTO idempotency_keys(idempotency_key,operation,entity_type,entity_id,response_json) VALUES($1,$2,$3,$4,$5) ON CONFLICT(idempotency_key,operation) DO UPDATE SET response_json=EXCLUDED.response_json',
    [key, operation, entityType, entityId || null, JSON.stringify(response)]
  );
}

// repositories/idempotency-repo.js — registro de idempotência (padrão SICAT).
import { pool } from '../db.js';

export async function findIdempotency(operation, idempotencyKey) {
  const r = await pool.query(
    'SELECT response_json FROM idempotency_registry WHERE idempotency_key=$1 AND operation=$2',
    [idempotencyKey, operation]
  );
  return r.rows[0]?.response_json ?? null;
}

export async function saveIdempotency({ operation, idempotencyKey, entityType, entityId, response }) {
  await pool.query(
    `INSERT INTO idempotency_registry(idempotency_key, operation, entity_type, entity_id, response_json)
     VALUES($1,$2,$3,$4,$5::jsonb)
     ON CONFLICT(idempotency_key, operation) DO NOTHING`,
    [idempotencyKey, operation, entityType ?? null, entityId ?? null, JSON.stringify(response)]
  );
}

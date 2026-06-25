// idempotency.js — bloco idempotencia (SICAT pattern): persiste Idempotency-Key + resultado.
import { pool } from './db.js';

export async function getIdempotentResponse(operation, idempotencyKey) {
  if (!idempotencyKey) return null;
  try {
    const { rows } = await pool.query(
      'SELECT response_json FROM idempotency_registry WHERE idempotency_key=$1 AND operation=$2',
      [idempotencyKey, operation]
    );
    return rows[0] ? rows[0].response_json : null;
  } catch { return null; }
}

export async function rememberIdempotentResponse({ operation, idempotencyKey, entityType, entityId, response }) {
  if (!idempotencyKey) return;
  try {
    await pool.query(
      `INSERT INTO idempotency_registry(idempotency_key, operation, entity_type, entity_id, response_json)
       VALUES ($1,$2,$3,$4,$5)
       ON CONFLICT (idempotency_key, operation)
       DO UPDATE SET response_json = excluded.response_json`,
      [idempotencyKey, operation, entityType || null, entityId || null, JSON.stringify(response)]
    );
  } catch { /* non-fatal: idempotency miss is safe */ }
}

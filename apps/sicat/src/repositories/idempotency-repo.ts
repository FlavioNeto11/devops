import { query } from '../db/pool.js';

type IdempotencyRow = {
  idempotency_key: string;
  operation: string;
  entity_type: string | null;
  entity_id: string | null;
  response_json: Record<string, unknown> | null;
};

type SaveIdempotencyInput = {
  operation: string;
  idempotencyKey: string;
  entityType?: string | null;
  entityId?: string | null;
  response: Record<string, unknown>;
};

export async function findIdempotency(operation: string, idempotencyKey: string): Promise<IdempotencyRow | null> {
  const result = await query<IdempotencyRow>(
    `select * from idempotency_registry where operation = $1 and idempotency_key = $2`,
    [operation, idempotencyKey]
  );
  return result.rows[0] || null;
}

export async function saveIdempotency({
  operation,
  idempotencyKey,
  entityType,
  entityId,
  response
}: SaveIdempotencyInput): Promise<IdempotencyRow | undefined> {
  const result = await query<IdempotencyRow>(
    `insert into idempotency_registry(idempotency_key, operation, entity_type, entity_id, response_json)
     values ($1,$2,$3,$4,$5::jsonb)
     on conflict (idempotency_key, operation) do update set response_json = excluded.response_json
     returning *`,
    [idempotencyKey, operation, entityType || null, entityId || null, JSON.stringify(response)]
  );
  return result.rows[0];
}

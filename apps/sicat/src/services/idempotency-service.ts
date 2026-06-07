import { findIdempotency, saveIdempotency } from '../repositories/idempotency-repo.js';

type IdempotencyResponse = Record<string, unknown>;

export async function getIdempotentResponse(operation: string, idempotencyKey: string | undefined) {
  if (!idempotencyKey) return null;
  const record = await findIdempotency(operation, idempotencyKey);
  return record?.response_json || null;
}

export async function rememberIdempotentResponse({
  operation,
  idempotencyKey,
  entityType,
  entityId,
  response
}: {
  operation: string;
  idempotencyKey?: string;
  entityType?: string | null;
  entityId?: string | null;
  response: IdempotencyResponse;
}) {
  if (!idempotencyKey) return;
  await saveIdempotency({ operation, idempotencyKey, entityType, entityId, response });
}

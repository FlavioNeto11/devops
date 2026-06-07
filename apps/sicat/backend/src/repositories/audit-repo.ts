import { query } from '../db/pool.js';

type AuditEntryInput = {
  correlationId: string;
  entityType: string;
  entityId?: string | null;
  direction: string;
  component?: string | null;
  httpMethod?: string | null;
  endpoint?: string | null;
  httpStatus?: number | null;
  latencyMs?: number | null;
  sanitizedHeaders?: Record<string, unknown>;
  sanitizedBody?: Record<string, unknown>;
};

type AuditEntryRow = {
  entity_type: string;
  entity_id: string | null;
  occurred_at: string | Date | null;
  direction: string;
  component: string | null;
  http_method: string | null;
  endpoint: string | null;
  http_status: number | null;
  latency_ms: number | null;
  sanitized_headers: Record<string, unknown> | null;
  sanitized_body: Record<string, unknown> | null;
};

type AuditEntryView = {
  entityType: string;
  entityId: string | null;
  occurredAt: string | Date | null;
  direction: string;
  component: string | null;
  httpMethod: string | null;
  endpoint: string | null;
  httpStatus: number | null;
  latencyMs: number | null;
  sanitizedHeaders: Record<string, unknown> | null;
  sanitizedBody: Record<string, unknown> | null;
};

function asIsoDate(value: string | Date | null): string | null {
  if (value instanceof Date) return value.toISOString();
  return value;
}

export async function insertAuditEntry(entry: AuditEntryInput) {
  await query(
    `insert into audit_logs(
      correlation_id, entity_type, entity_id, direction, component,
      http_method, endpoint, http_status, latency_ms, sanitized_headers, sanitized_body
    ) values ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10::jsonb,$11::jsonb)`,
    [
      entry.correlationId,
      entry.entityType,
      entry.entityId || null,
      entry.direction,
      entry.component || null,
      entry.httpMethod || null,
      entry.endpoint || null,
      entry.httpStatus || null,
      entry.latencyMs || null,
      JSON.stringify(entry.sanitizedHeaders || {}),
      JSON.stringify(entry.sanitizedBody || {})
    ]
  );
}

export async function listAuditEntries(correlationId: string): Promise<AuditEntryView[]> {
  const result = await query<AuditEntryRow>(
    `select * from audit_logs where correlation_id = $1 order by occurred_at asc, id asc`,
    [correlationId]
  );
  return result.rows.map((row): AuditEntryView => ({
    entityType: row.entity_type,
    entityId: row.entity_id,
    occurredAt: asIsoDate(row.occurred_at),
    direction: row.direction,
    component: row.component,
    httpMethod: row.http_method,
    endpoint: row.endpoint,
    httpStatus: row.http_status,
    latencyMs: row.latency_ms,
    sanitizedHeaders: row.sanitized_headers,
    sanitizedBody: row.sanitized_body
  }));
}

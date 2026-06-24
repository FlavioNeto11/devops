// repositories/webhook-repo.js — registro de eventos de webhook (idempotência).
import { pool } from '../db.js';

export async function findWebhookEvent(eventId) {
  const r = await pool.query('SELECT * FROM webhook_events WHERE event_id=$1 LIMIT 1', [eventId]);
  return r.rows[0] ?? null;
}

export async function upsertWebhookEvent({ tenantId, eventId, gatewayProvider, eventType, payload }) {
  await pool.query(
    `INSERT INTO webhook_events(tenant_id, event_id, gateway_provider, event_type, payload)
     VALUES($1,$2,$3,$4,$5::jsonb)
     ON CONFLICT(event_id) DO NOTHING`,
    [tenantId || 1, eventId, gatewayProvider || 'sandbox', eventType, JSON.stringify(payload)]
  );
}

export async function markWebhookProcessed(eventId) {
  await pool.query('UPDATE webhook_events SET processed_at=now() WHERE event_id=$1', [eventId]);
}

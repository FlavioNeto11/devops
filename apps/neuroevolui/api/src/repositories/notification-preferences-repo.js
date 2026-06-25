// repositories/notification-preferences-repo.js — preferências de notificação e push subscriptions.
import { pool } from '../db.js';

export async function getNotificationPreferences(tenantId, userId) {
  const { rows } = await pool.query(
    `SELECT channel, enabled, contact_value FROM notification_preferences WHERE tenant_id=$1 AND user_id=$2`,
    [tenantId, userId],
  );
  return rows;
}

export async function upsertNotificationPreference({ tenantId, userId, channel, enabled, contactValue }) {
  await pool.query(
    `INSERT INTO notification_preferences(tenant_id, user_id, channel, enabled, contact_value)
     VALUES($1, $2, $3, $4, $5)
     ON CONFLICT(tenant_id, user_id, channel)
     DO UPDATE SET enabled=EXCLUDED.enabled, contact_value=EXCLUDED.contact_value, updated_at=now()`,
    [tenantId, userId, channel, enabled !== false, contactValue || ''],
  );
}

export async function listPushSubscriptions(tenantId, userId) {
  const { rows } = await pool.query(
    `SELECT endpoint, p256dh, auth FROM push_subscriptions WHERE tenant_id=$1 AND user_id=$2`,
    [tenantId, userId],
  );
  return rows;
}

export async function upsertPushSubscription({ tenantId, userId, endpoint, p256dh, auth, userAgent }) {
  await pool.query(
    `INSERT INTO push_subscriptions(tenant_id, user_id, endpoint, p256dh, auth, user_agent)
     VALUES($1, $2, $3, $4, $5, $6)
     ON CONFLICT(endpoint)
     DO UPDATE SET p256dh=EXCLUDED.p256dh, auth=EXCLUDED.auth, user_agent=EXCLUDED.user_agent`,
    [tenantId, userId, endpoint, p256dh, auth, userAgent || null],
  );
}

export async function deletePushSubscription(tenantId, userId, endpoint) {
  await pool.query(
    `DELETE FROM push_subscriptions WHERE tenant_id=$1 AND user_id=$2 AND endpoint=$3`,
    [tenantId, userId, endpoint],
  );
}

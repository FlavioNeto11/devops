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

// Coleção paginada para a rota REST genérica GET /v1/notification-preferences → { data, total }.
const NP_SORTABLE = new Set(['id', 'user_id', 'channel', 'enabled', 'created_at', 'updated_at']);
export async function listNotificationPreferencesPaged(tenantId, { page = 1, pageSize = 50, sort = 'id', dir = 'desc' } = {}) {
  const col = NP_SORTABLE.has(sort) ? sort : 'id';
  const order = String(dir).toLowerCase() === 'asc' ? 'ASC' : 'DESC';
  const limit = Math.min(Math.max(Number(pageSize) || 50, 1), 200);
  const offset = (Math.max(Number(page) || 1, 1) - 1) * limit;
  const totalRes = await pool.query('SELECT count(*)::int n FROM notification_preferences WHERE tenant_id=$1', [tenantId]);
  const r = await pool.query(
    `SELECT * FROM notification_preferences WHERE tenant_id=$1 ORDER BY ${col} ${order} LIMIT $2 OFFSET $3`,
    [tenantId, limit, offset]
  );
  return { data: r.rows, total: totalRes.rows[0].n };
}

export async function findNotificationPreference(tenantId, id) {
  const r = await pool.query('SELECT * FROM notification_preferences WHERE tenant_id=$1 AND id=$2', [tenantId, Number(id)]);
  return r.rows[0] ?? null;
}

export async function createNotificationPreference({ tenantId, userId, channel, enabled, contactValue }) {
  const r = await pool.query(
    `INSERT INTO notification_preferences(tenant_id, user_id, channel, enabled, contact_value)
     VALUES($1,$2,$3,$4,$5)
     ON CONFLICT(tenant_id, user_id, channel)
     DO UPDATE SET enabled=EXCLUDED.enabled, contact_value=EXCLUDED.contact_value, updated_at=now()
     RETURNING *`,
    [tenantId, userId, channel, enabled !== false, contactValue || '']
  );
  return r.rows[0];
}

export async function updateNotificationPreferenceById(tenantId, id, body) {
  const sets = [];
  const params = [tenantId, Number(id)];
  let i = 3;
  if (body.channel !== undefined) { sets.push(`channel=$${i++}`); params.push(body.channel); }
  if (body.enabled !== undefined) { sets.push(`enabled=$${i++}`); params.push(body.enabled !== false); }
  if (body.contact_value !== undefined) { sets.push(`contact_value=$${i++}`); params.push(body.contact_value || ''); }
  if (body.event_type !== undefined) { sets.push(`event_type=$${i++}`); params.push(body.event_type || 'all'); }
  if (body.schedule !== undefined) { sets.push(`schedule=$${i++}`); params.push(body.schedule || 'immediate'); }
  if (sets.length === 0) return findNotificationPreference(tenantId, id);
  sets.push('updated_at=now()');
  const r = await pool.query(
    `UPDATE notification_preferences SET ${sets.join(', ')} WHERE tenant_id=$1 AND id=$2 RETURNING *`,
    params
  );
  return r.rows[0] ?? null;
}

export async function deleteNotificationPreferenceById(tenantId, id) {
  const r = await pool.query('DELETE FROM notification_preferences WHERE tenant_id=$1 AND id=$2 RETURNING id', [tenantId, Number(id)]);
  return r.rowCount > 0;
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

// settings-repo.js — CRUD da tabela clinic_settings (REF-NEUROEVOLUI-0050).
import { pool } from '../db.js';

const DEFAULTS = {
  clinic_name: '',
  clinic_address: '',
  clinic_phone: '',
  clinic_email: '',
  timezone: 'America/Sao_Paulo',
  locale: 'pt-BR',
  notification_defaults: {},
};

export async function getSettings(tenantId) {
  const { rows } = await pool.query(
    'SELECT * FROM clinic_settings WHERE tenant_id = $1',
    [tenantId],
  );
  if (!rows[0]) return { tenant_id: tenantId, ...DEFAULTS };
  const row = rows[0];
  return {
    ...row,
    notification_defaults:
      typeof row.notification_defaults === 'object' ? row.notification_defaults : {},
  };
}

export async function upsertSettings(tenantId, data, actor) {
  const { rows } = await pool.query(
    `INSERT INTO clinic_settings
       (tenant_id, clinic_name, clinic_address, clinic_phone, clinic_email,
        timezone, locale, notification_defaults, updated_by, updated_at)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,now())
     ON CONFLICT (tenant_id) DO UPDATE SET
       clinic_name          = EXCLUDED.clinic_name,
       clinic_address       = EXCLUDED.clinic_address,
       clinic_phone         = EXCLUDED.clinic_phone,
       clinic_email         = EXCLUDED.clinic_email,
       timezone             = EXCLUDED.timezone,
       locale               = EXCLUDED.locale,
       notification_defaults = EXCLUDED.notification_defaults,
       updated_by           = EXCLUDED.updated_by,
       updated_at           = now()
     RETURNING *`,
    [
      tenantId,
      String(data.clinic_name || ''),
      String(data.clinic_address || ''),
      String(data.clinic_phone || ''),
      String(data.clinic_email || ''),
      String(data.timezone || 'America/Sao_Paulo'),
      String(data.locale || 'pt-BR'),
      JSON.stringify(data.notification_defaults || {}),
      actor || 'system',
    ],
  );
  return rows[0];
}

export async function resetSettings(tenantId) {
  await pool.query('DELETE FROM clinic_settings WHERE tenant_id = $1', [tenantId]);
}

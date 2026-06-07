-- Migration 009: Suporte à expiração administrativa de senha SICAT
-- Data: 2026-03-15

alter table if exists sicat_users
  add column if not exists password_expires_at timestamptz;

create index if not exists idx_sicat_users_password_expires_at
  on sicat_users(password_expires_at)
  where password_expires_at is not null;

insert into system_events (event_type, severity, component, message, details)
values (
  'MIGRATION_APPLIED',
  'info',
  'migrations',
  'Migration 009 applied: password expiration for SICAT users',
  jsonb_build_object(
    'migration', '009_access_password_expiration',
    'features', jsonb_build_array('password expiration date for sicat users')
  )
)
on conflict do nothing;
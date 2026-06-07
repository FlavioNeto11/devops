-- Migration 008: Fundação do módulo de Perfis e Acessos (Fase 1)
-- Data: 2026-03-15
-- Objetivo:
--   1) criar estrutura base de papéis/permissões
--   2) criar vínculos usuário↔papel e papel↔permissão
--   3) criar trilha de auditoria administrativa de sessão/acesso

create table if not exists access_roles (
  id text primary key,
  role_name text not null unique,
  description text,
  is_system boolean not null default false,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists access_permissions (
  id text primary key,
  permission_key text not null unique,
  resource text not null,
  action text not null,
  description text,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint chk_access_permission_key_not_empty check (length(trim(permission_key)) > 0),
  constraint chk_access_permission_resource_not_empty check (length(trim(resource)) > 0),
  constraint chk_access_permission_action_not_empty check (length(trim(action)) > 0)
);

create table if not exists access_role_permissions (
  id text primary key,
  role_id text not null references access_roles(id) on delete cascade,
  permission_id text not null references access_permissions(id) on delete cascade,
  granted_at timestamptz not null default now(),
  granted_by_user_id text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (role_id, permission_id)
);

create table if not exists access_user_roles (
  id text primary key,
  user_id text not null references sicat_users(id) on delete cascade,
  role_id text not null references access_roles(id) on delete cascade,
  assigned_at timestamptz not null default now(),
  assigned_by_user_id text,
  expires_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (user_id, role_id)
);

create table if not exists access_session_admin_audit (
  id text primary key,
  actor_user_id text references sicat_users(id) on delete set null,
  target_user_id text references sicat_users(id) on delete set null,
  target_session_id text references sicat_sessions(id) on delete set null,
  action_type text not null,
  action_status text not null default 'succeeded',
  reason text,
  correlation_id text,
  metadata jsonb not null default '{}'::jsonb,
  occurred_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint chk_access_session_admin_action_type_not_empty check (length(trim(action_type)) > 0),
  constraint chk_access_session_admin_action_status check (action_status in ('succeeded', 'failed', 'denied'))
);

create index if not exists idx_access_roles_is_active
  on access_roles(is_active);

create index if not exists idx_access_permissions_resource_action
  on access_permissions(resource, action);

create index if not exists idx_access_permissions_is_active
  on access_permissions(is_active);

create index if not exists idx_access_role_permissions_role_id
  on access_role_permissions(role_id);

create index if not exists idx_access_role_permissions_permission_id
  on access_role_permissions(permission_id);

create index if not exists idx_access_user_roles_user_id
  on access_user_roles(user_id);

create index if not exists idx_access_user_roles_role_id
  on access_user_roles(role_id);

create index if not exists idx_access_user_roles_expires_at
  on access_user_roles(expires_at)
  where expires_at is not null;

create index if not exists idx_access_session_admin_actor_user
  on access_session_admin_audit(actor_user_id, occurred_at desc);

create index if not exists idx_access_session_admin_target_user
  on access_session_admin_audit(target_user_id, occurred_at desc);

create index if not exists idx_access_session_admin_target_session
  on access_session_admin_audit(target_session_id, occurred_at desc);

create index if not exists idx_access_session_admin_correlation
  on access_session_admin_audit(correlation_id)
  where correlation_id is not null;

create index if not exists idx_access_session_admin_occurred_at
  on access_session_admin_audit(occurred_at desc);

insert into system_events (event_type, severity, component, message, details)
values (
  'MIGRATION_APPLIED',
  'info',
  'migrations',
  'Migration 008 applied: access control foundation tables',
  jsonb_build_object(
    'migration', '008_access_control_foundation',
    'features', jsonb_build_array(
      'roles',
      'permissions',
      'role-permission mapping',
      'user-role mapping',
      'admin session/access audit trail'
    )
  )
)
on conflict do nothing;

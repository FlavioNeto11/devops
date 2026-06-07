-- Migration 006: Persistência para dupla autenticação SICAT + múltiplas contas CETESB
-- Data: 2026-03-13

create table if not exists sicat_users (
  id text primary key,
  email text not null unique,
  password_hash text not null,
  name text,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists sicat_sessions (
  id text primary key,
  user_id text not null references sicat_users(id) on delete cascade,
  refresh_token_hash text not null,
  expires_at timestamptz not null,
  revoked_at timestamptz,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create unique index if not exists idx_sicat_sessions_refresh_token_hash
  on sicat_sessions(refresh_token_hash);
create index if not exists idx_sicat_sessions_user_id
  on sicat_sessions(user_id);

create table if not exists sicat_cetesb_accounts (
  id text primary key,
  user_id text not null references sicat_users(id) on delete cascade,
  partner_code bigint,
  partner_document text,
  partner_name text,
  account_type text not null default 'unknown',
  cetesb_login text,
  cetesb_email text,
  cetesb_password_ciphertext text,
  cetesb_password_iv text,
  cetesb_password_tag text,
  last_connection_at timestamptz,
  last_usage_at timestamptz,
  usage_summary jsonb not null default '{"manifestsCreated":0,"manifestsSubmitted":0,"manifestsPrinted":0,"manifestsCancelled":0}'::jsonb,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (user_id, partner_code, partner_document),
  constraint chk_sicat_cetesb_account_type check (account_type in ('generator', 'carrier', 'receiver', 'unknown'))
);

create index if not exists idx_sicat_cetesb_accounts_user_id
  on sicat_cetesb_accounts(user_id);
create index if not exists idx_sicat_cetesb_accounts_is_active
  on sicat_cetesb_accounts(is_active);
create index if not exists idx_sicat_cetesb_accounts_last_usage_at
  on sicat_cetesb_accounts(last_usage_at desc);

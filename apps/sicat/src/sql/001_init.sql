create table if not exists schema_migrations (
  version text primary key,
  applied_at timestamptz not null default now()
);

create table if not exists integration_accounts (
  id text primary key,
  account_name text not null,
  partner_code bigint,
  partner_document text,
  state_code integer,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists session_contexts (
  id text primary key,
  integration_account_id text not null references integration_accounts(id),
  status text not null default 'active',
  partner_document text,
  partner_type text,
  partner_code bigint,
  user_access_code bigint,
  user_name text,
  email text,
  auth_mode text,
  jwt_token text,
  jwt_token_ref text,
  expires_at timestamptz,
  last_validated_at timestamptz,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists partners (
  partner_code bigint primary key,
  role text,
  description text not null,
  trade_name text,
  document text,
  registration text,
  address jsonb not null default '{}'::jsonb,
  license_issuer text,
  license_number text,
  status_code integer,
  has_profile boolean,
  raw jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists catalogs (
  id bigserial primary key,
  catalog_name text not null,
  version text not null,
  source text not null default 'cetesb-real',
  item_code text not null,
  item_name text not null,
  item_short_name text,
  item_group text,
  active boolean not null default true,
  raw jsonb not null default '{}'::jsonb,
  synced_at timestamptz not null default now(),
  unique (catalog_name, version, item_code)
);

create index if not exists idx_catalogs_name_version on catalogs(catalog_name, version, synced_at desc);
create index if not exists idx_catalogs_search on catalogs(catalog_name, item_name, item_short_name, item_code);

create table if not exists catalog_sync_requests (
  id text primary key,
  integration_account_id text not null references integration_accounts(id),
  catalogs jsonb not null default '[]'::jsonb,
  force_refresh boolean not null default false,
  requested_by text,
  status text not null default 'queued',
  version text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists cadastros (
  id text primary key,
  integration_account_id text not null references integration_accounts(id),
  status text not null,
  requested_by text,
  correlation_id text not null,
  payload jsonb not null,
  external_response jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists manifests (
  id text primary key,
  integration_account_id text not null references integration_accounts(id),
  session_context_id text references session_contexts(id),
  status text not null,
  external_status text,
  external_reference jsonb,
  external_hash_code text,
  payload jsonb not null,
  requested_by text,
  correlation_id text not null,
  last_submitted_at timestamptz,
  last_sync_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists idx_manifests_filters on manifests(integration_account_id, status, external_status, created_at desc);

create table if not exists manifest_documents (
  id text primary key,
  manifest_id text not null references manifests(id) on delete cascade,
  type text not null,
  status text not null,
  mime_type text not null,
  file_name text not null,
  hash text,
  storage_path text not null,
  generated_at timestamptz not null default now(),
  active boolean not null default true
);

create table if not exists jobs (
  job_id text primary key,
  command_id text not null unique,
  entity_type text not null,
  entity_id text not null,
  operation text not null,
  payload jsonb not null default '{}'::jsonb,
  status text not null,
  attempts integer not null default 0,
  max_attempts integer not null default 5,
  queued_at timestamptz not null default now(),
  started_at timestamptz,
  finished_at timestamptz,
  next_retry_at timestamptz,
  correlation_id text not null,
  idempotency_key text,
  last_error_code text,
  last_error_message text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists idx_jobs_polling on jobs(status, next_retry_at, queued_at);
create index if not exists idx_jobs_entity on jobs(entity_type, entity_id);

create table if not exists idempotency_registry (
  id bigserial primary key,
  idempotency_key text not null,
  operation text not null,
  entity_type text,
  entity_id text,
  response_json jsonb not null,
  created_at timestamptz not null default now(),
  unique(idempotency_key, operation)
);

create table if not exists audit_logs (
  id bigserial primary key,
  correlation_id text not null,
  entity_type text not null,
  entity_id text,
  direction text not null,
  component text,
  http_method text,
  endpoint text,
  http_status integer,
  latency_ms integer,
  sanitized_headers jsonb,
  sanitized_body jsonb,
  occurred_at timestamptz not null default now()
);

create index if not exists idx_audit_correlation on audit_logs(correlation_id, occurred_at);

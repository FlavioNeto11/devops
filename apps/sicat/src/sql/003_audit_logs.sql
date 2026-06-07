create table if not exists manifest_audit_logs (
  id uuid primary key default gen_random_uuid(),
  manifest_id text not null references manifests(id) on delete cascade,
  user_id text,
  correlation_id text not null,
  action text not null check (action in ('CANCEL', 'SUBMIT', 'PRINT', 'BOOTSTRAP', 'SYNC')),
  status text not null check (status in ('PENDING', 'SUCCESS', 'FAILED')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  details jsonb not null default '{}'::jsonb,
  tags jsonb not null default '[]'::jsonb
);

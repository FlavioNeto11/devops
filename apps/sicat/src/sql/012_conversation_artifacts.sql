create table if not exists conversation_artifacts (
  id text primary key,
  conversation_session_id text not null references conversation_sessions(id) on delete cascade,
  conversation_turn_id text not null,
  artifact_type text not null check (artifact_type in ('document', 'zip')),
  source_kind text not null,
  status text not null default 'pending' check (status in ('pending', 'collecting', 'available', 'partial', 'failed')),
  title text not null,
  file_name text,
  mime_type text,
  storage_path text,
  source_refs jsonb not null default '{}'::jsonb,
  metadata jsonb not null default '{}'::jsonb,
  progress_total integer not null default 0 check (progress_total >= 0),
  progress_completed integer not null default 0 check (progress_completed >= 0),
  progress_failed integer not null default 0 check (progress_failed >= 0),
  correlation_id text not null,
  job_id text,
  integration_account_id text references integration_accounts(id),
  session_context_id text references session_contexts(id),
  available_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists idx_conversation_artifacts_session on conversation_artifacts (
    conversation_session_id,
    created_at desc
);

create index if not exists idx_conversation_artifacts_job on conversation_artifacts (job_id)
where
    job_id is not null;

create index if not exists idx_conversation_artifacts_correlation on conversation_artifacts (
    correlation_id,
    created_at desc
);

create index if not exists idx_conversation_artifacts_status on conversation_artifacts (status, updated_at desc);
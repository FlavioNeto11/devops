alter table if exists conversation_artifacts
drop constraint if exists conversation_artifacts_status_check;

update conversation_artifacts
set
    status = case
        when status in ('pending', 'collecting') then 'processing'
        else status
    end,
    updated_at = now()
where
    status in ('pending', 'collecting');

alter table if exists conversation_artifacts
add column if not exists expires_at timestamptz;

alter table if exists conversation_artifacts
add constraint conversation_artifacts_status_check check (
    status in (
        'processing',
        'available',
        'partial',
        'failed',
        'expired'
    )
);

create index if not exists idx_conversation_artifacts_expiration on conversation_artifacts (expires_at)
where
    expires_at is not null;

create table if not exists conversation_deterministic_trails (
  id text primary key,
  conversation_session_id text not null references conversation_sessions(id) on delete cascade,
  conversation_turn_id text not null,
  phase text not null check (phase in ('snapshot', 'plan', 'result')),
  intent text,
  execution_status text not null default 'processing' check (execution_status in ('processing', 'available', 'partial', 'failed', 'expired', 'blocked')),
  snapshot_token text,
  snapshot_payload jsonb not null default '{}'::jsonb,
  plan_payload jsonb not null default '{}'::jsonb,
  result_payload jsonb not null default '{}'::jsonb,
  metadata jsonb not null default '{}'::jsonb,
  manifest_ids jsonb not null default '[]'::jsonb,
  cdf_ids jsonb not null default '[]'::jsonb,
  correlation_id text not null,
  job_id text,
  command_id text,
  integration_account_id text references integration_accounts(id),
  session_context_id text references session_contexts(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists idx_conversation_det_trails_session on conversation_deterministic_trails (
    conversation_session_id,
    created_at desc
);

create index if not exists idx_conversation_det_trails_turn on conversation_deterministic_trails (
    conversation_turn_id,
    created_at desc
);

create index if not exists idx_conversation_det_trails_snapshot on conversation_deterministic_trails (snapshot_token)
where
    snapshot_token is not null;

create index if not exists idx_conversation_det_trails_correlation on conversation_deterministic_trails (
    correlation_id,
    created_at desc
);

create index if not exists idx_conversation_det_trails_job on conversation_deterministic_trails (job_id)
where
    job_id is not null;
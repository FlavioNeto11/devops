create table if not exists conversation_sessions (
  id text primary key,
  channel_type text not null,
  channel_session_key text,
  user_id text,
  account_id text,
  integration_account_id text references integration_accounts(id),
  session_context_id text references session_contexts(id),
  current_screen text,
  current_manifest_id text,
  status text not null default 'active',
  metadata jsonb not null default '{}'::jsonb,
  last_correlation_id text,
  last_turn_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create unique index if not exists ux_conversation_sessions_channel_key on conversation_sessions (
    channel_type,
    channel_session_key
)
where
    channel_session_key is not null;

create index if not exists idx_conversation_sessions_operational on conversation_sessions (
    integration_account_id,
    session_context_id,
    status,
    updated_at desc
);

create table if not exists conversation_messages (
  id text primary key,
  conversation_session_id text not null references conversation_sessions(id) on delete cascade,
  conversation_turn_id text not null,
  role text not null check (role in ('user', 'assistant', 'tool', 'system')),
  message_text text,
  structured_payload jsonb not null default '{}'::jsonb,
  tool_calls jsonb not null default '[]'::jsonb,
  correlation_id text,
  job_id text,
  integration_account_id text references integration_accounts(id),
  session_context_id text references session_contexts(id),
  created_at timestamptz not null default now()
);

create index if not exists idx_conversation_messages_session on conversation_messages (
    conversation_session_id,
    created_at desc
);

create index if not exists idx_conversation_messages_turn on conversation_messages (
    conversation_turn_id,
    created_at desc
);

create index if not exists idx_conversation_messages_correlation on conversation_messages (
    correlation_id,
    created_at desc
)
where
    correlation_id is not null;

create table if not exists conversation_action_logs (
  id text primary key,
  conversation_session_id text not null references conversation_sessions(id) on delete cascade,
  conversation_turn_id text not null,
  user_id text,
  channel_type text not null,
  action_type text not null,
  action_status text not null default 'recorded',
  risk_level text,
  requires_confirmation boolean not null default false,
  confirmed_at timestamptz,
  blocked_reason text,
  tool_name text,
  tool_arguments jsonb not null default '{}'::jsonb,
  result_payload jsonb not null default '{}'::jsonb,
  correlation_id text not null,
  job_id text,
  integration_account_id text references integration_accounts(id),
  session_context_id text references session_contexts(id),
  created_at timestamptz not null default now()
);

create index if not exists idx_conversation_action_logs_session on conversation_action_logs (
    conversation_session_id,
    created_at desc
);

create index if not exists idx_conversation_action_logs_correlation on conversation_action_logs (
    correlation_id,
    created_at desc
);

create index if not exists idx_conversation_action_logs_job on conversation_action_logs (job_id)
where
    job_id is not null;

create table if not exists conversation_memory (
  id text primary key,
  conversation_session_id text not null references conversation_sessions(id) on delete cascade,
  summary_kind text not null,
  summary_text text not null,
  summary_payload jsonb not null default '{}'::jsonb,
  valid_until timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (conversation_session_id, summary_kind)
);

create index if not exists idx_conversation_memory_validity on conversation_memory (
    conversation_session_id,
    valid_until desc nulls last,
    updated_at desc
);

create table if not exists conversation_channel_links (
  id text primary key,
  channel_type text not null,
  external_user_key text not null,
  user_id text,
  integration_account_id text references integration_accounts(id),
  verification_status text not null default 'pending',
  verified_at timestamptz,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (channel_type, external_user_key)
);

create index if not exists idx_conversation_channel_links_user on conversation_channel_links (user_id, channel_type)
where
    user_id is not null;
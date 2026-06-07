create table if not exists async_operation_entities (
  entity_type text not null,
  entity_id text not null,
  operation text not null,
  integration_account_id text not null references integration_accounts(id),
  session_context_id text references session_contexts(id),
  status text not null,
  payload jsonb not null default '{}'::jsonb,
  result jsonb,
  requested_by text,
  correlation_id text,
  last_sync_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (entity_type, entity_id)
);

create index if not exists idx_async_operation_entities_filters on async_operation_entities (
    entity_type,
    operation,
    integration_account_id,
    status,
    created_at desc
);

create table if not exists async_operation_documents (
  id text primary key,
  owner_entity_type text not null,
  owner_entity_id text not null,
  type text not null,
  status text not null,
  mime_type text not null,
  file_name text not null,
  hash text,
  storage_path text not null,
  metadata jsonb not null default '{}'::jsonb,
  generated_at timestamptz not null default now(),
  active boolean not null default true,
  constraint fk_async_operation_documents_owner
    foreign key (owner_entity_type, owner_entity_id)
    references async_operation_entities(entity_type, entity_id)
    on delete cascade
);

create index if not exists idx_async_operation_documents_owner on async_operation_documents (
    owner_entity_type,
    owner_entity_id,
    active,
    generated_at desc
);

create index if not exists idx_async_operation_documents_hash on async_operation_documents (owner_entity_type, hash)
where
    hash is not null;
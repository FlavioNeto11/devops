-- 017_ai_control_center.sql
-- AI Control Center: catálogo dinâmico de tools/agents, prompts versionados,
-- base de conhecimento, eventos de memória administrativa, traces unificados
-- (SICAT + Langfuse) e execuções de eval/smoke.
--
-- Idempotente (create ... if not exists). SICAT continua a fonte de verdade;
-- linhas aqui são OVERRIDES sobre os defaults de código. Sem linhas, o runtime
-- usa exatamente os defaults atuais (backward compatible).

-- 1. ai_tools — overrides do catálogo de tools (defaults vêm de tool-registry.ts)
create table if not exists ai_tools (
  id text primary key,
  tool_name text not null unique,
  category text,
  objective text,
  dependencies jsonb not null default '[]'::jsonb,
  schema_json jsonb,
  default_policy_json jsonb not null default '{}'::jsonb,
  enabled boolean not null default true,
  source text not null default 'db',
  active_version_id text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists idx_ai_tools_enabled on ai_tools (enabled, tool_name);

-- 2. ai_tool_versions — histórico versionado de schema/policy por tool
create table if not exists ai_tool_versions (
  id text primary key,
  tool_id text not null references ai_tools(id) on delete cascade,
  version text not null,
  schema_json jsonb,
  policy_json jsonb not null default '{}'::jsonb,
  changelog text,
  created_by text,
  created_at timestamptz not null default now(),
  activated_at timestamptz
);
create index if not exists idx_ai_tool_versions_tool on ai_tool_versions (tool_id, created_at desc);

-- 3. ai_agents — agentes/especialistas (overrides; defaults em conversation-specialists.ts)
create table if not exists ai_agents (
  id text primary key,
  agent_name text not null unique,
  description text,
  specialist_type text,
  tool_names jsonb not null default '[]'::jsonb,
  prompt_name text,
  enabled boolean not null default true,
  config_json jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- 4. ai_prompts — prompts administráveis (system/classifier/planner/synthesis/...)
create table if not exists ai_prompts (
  id text primary key,
  prompt_name text not null unique,
  description text,
  provider_source text not null default 'local',
  active_version_id text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- 5. ai_prompt_versions — versões de prompt com label/model e link opcional Langfuse
create table if not exists ai_prompt_versions (
  id text primary key,
  prompt_id text not null references ai_prompts(id) on delete cascade,
  version text not null,
  label text,
  model text,
  prompt_text text not null,
  prompt_config_json jsonb not null default '{}'::jsonb,
  langfuse_prompt_id text,
  langfuse_version integer,
  created_by text,
  created_at timestamptz not null default now(),
  activated_at timestamptz
);
create index if not exists idx_ai_prompt_versions_prompt on ai_prompt_versions (prompt_id, created_at desc);

-- 6. ai_knowledge_sources — metadados das fontes indexadas (RAG)
create table if not exists ai_knowledge_sources (
  id text primary key,
  source_key text not null unique,
  source_type text not null default 'file',
  title text,
  path_or_uri text,
  enabled boolean not null default true,
  embedding_model text,
  last_indexed_at timestamptz,
  chunk_count integer not null default 0,
  status text not null default 'unknown',
  metadata_json jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- 7. ai_knowledge_chunks — espelho opcional de chunks (sem pgvector: embedding em jsonb)
create table if not exists ai_knowledge_chunks (
  id text primary key,
  source_id text references ai_knowledge_sources(id) on delete cascade,
  chunk_key text not null,
  title text,
  text text not null,
  score_metadata_json jsonb not null default '{}'::jsonb,
  embedding_model text,
  embedding_vector jsonb,
  created_at timestamptz not null default now()
);
create index if not exists idx_ai_knowledge_chunks_source on ai_knowledge_chunks (source_id, created_at desc);

-- 8. ai_memory_admin_events — auditoria de operações administrativas de memória
create table if not exists ai_memory_admin_events (
  id text primary key,
  conversation_session_id text not null,
  action text not null,
  before_payload jsonb not null default '{}'::jsonb,
  after_payload jsonb not null default '{}'::jsonb,
  requested_by text,
  correlation_id text,
  created_at timestamptz not null default now()
);
create index if not exists idx_ai_memory_admin_events_session
  on ai_memory_admin_events (conversation_session_id, created_at desc);

-- 9. ai_trace_events — traces unificados (SICAT local + sincronização Langfuse)
create table if not exists ai_trace_events (
  id text primary key,
  trace_source text not null default 'sicat',
  trace_id text,
  observation_id text,
  conversation_session_id text,
  conversation_turn_id text,
  correlation_id text,
  user_id text,
  tool_name text,
  event_type text not null,
  status text,
  latency_ms integer,
  token_input integer,
  token_output integer,
  cost numeric,
  payload_json jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);
create index if not exists idx_ai_trace_events_created on ai_trace_events (created_at desc);
create index if not exists idx_ai_trace_events_session on ai_trace_events (conversation_session_id, created_at desc);
create index if not exists idx_ai_trace_events_turn on ai_trace_events (conversation_turn_id, created_at desc);
create index if not exists idx_ai_trace_events_correlation on ai_trace_events (correlation_id, created_at desc);
create index if not exists idx_ai_trace_events_trace on ai_trace_events (trace_id);
create index if not exists idx_ai_trace_events_tool on ai_trace_events (tool_name, created_at desc);

-- 10. ai_eval_runs — execuções de bateria de smoke/eval
create table if not exists ai_eval_runs (
  id text primary key,
  run_key text not null unique,
  mode text not null,
  status text not null default 'queued',
  started_at timestamptz,
  finished_at timestamptz,
  requested_by text,
  summary_json jsonb not null default '{}'::jsonb,
  langfuse_dataset_run_id text,
  created_at timestamptz not null default now()
);
create index if not exists idx_ai_eval_runs_created on ai_eval_runs (created_at desc);

-- 11. ai_eval_cases — casos de uma execução de eval
create table if not exists ai_eval_cases (
  id text primary key,
  run_id text not null references ai_eval_runs(id) on delete cascade,
  case_id text not null,
  category text,
  prompt text,
  expected_json jsonb not null default '{}'::jsonb,
  actual_json jsonb not null default '{}'::jsonb,
  score_json jsonb not null default '{}'::jsonb,
  status text,
  trace_id text,
  created_at timestamptz not null default now()
);
create index if not exists idx_ai_eval_cases_run on ai_eval_cases (run_id, created_at desc);

-- ─── Views de leitura simples para a tela ──────────────────────────────────

create or replace view v_ai_control_tool_usage as
select
  tool_name,
  count(*)::int as total,
  count(*) filter (where status = 'executed')::int as executed,
  count(*) filter (where status = 'blocked')::int as blocked,
  count(*) filter (where status = 'failed')::int as failed,
  max(created_at) as last_used_at
from ai_trace_events
where tool_name is not null
group by tool_name;

create or replace view v_ai_control_errors as
select
  coalesce(payload_json->>'errorCode', 'UNKNOWN') as error_code,
  count(*)::int as total,
  max(created_at) as last_seen_at
from ai_trace_events
where status = 'failed'
group by coalesce(payload_json->>'errorCode', 'UNKNOWN');

create or replace view v_ai_control_recent_turns as
select
  conversation_session_id,
  conversation_turn_id,
  correlation_id,
  tool_name,
  event_type,
  status,
  latency_ms,
  created_at
from ai_trace_events
where event_type in ('final-response', 'response.done', 'turn.started')
order by created_at desc;

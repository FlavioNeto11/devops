-- 019: feedback explícito do usuário (👍/👎) por resposta da IA (F5 da re-engenharia).
-- Alimenta o KPI csat e o loop contínuo (caso ruim → candidato a golden set);
-- rollup cross-app vai ao ai-control-plane (envio best-effort no service).

create table if not exists conversation_feedback (
  id                       text primary key,             -- cfbk_<hex>
  conversation_session_id  text references conversation_sessions(id) on delete cascade,
  correlation_id           text,                         -- correlação com o turno respondido
  channel_type             text not null default 'native_chat',
  feedback_type            text not null check (feedback_type in ('positive', 'negative')),
  user_id                  text,
  tool_name                text,
  user_comment             text,
  metadata                 jsonb not null default '{}'::jsonb,
  created_at               timestamptz not null default now()
);

create index if not exists conversation_feedback_session_idx
  on conversation_feedback(conversation_session_id);

create index if not exists conversation_feedback_correlation_idx
  on conversation_feedback(correlation_id);

create index if not exists conversation_feedback_created_idx
  on conversation_feedback(created_at);

-- 1 feedback por usuário por turno (último clique vence via upsert no service)
create unique index if not exists conversation_feedback_unique_idx
  on conversation_feedback(correlation_id, coalesce(user_id, ''));

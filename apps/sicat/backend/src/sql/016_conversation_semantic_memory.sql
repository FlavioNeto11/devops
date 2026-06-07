-- Memória semântica dedicada da conversa: um registro por turno (texto + embedding),
-- para RECALL VETORIAL de contexto relevante além da janela recente de histórico.
-- Tabela própria (separada de conversation_memory, que é estado/working-memory por kind).
create table if not exists conversation_semantic_memory (
  id text primary key,
  conversation_session_id text not null,
  integration_account_id text,
  role text not null,
  text text not null,
  embedding jsonb not null,
  created_at timestamptz not null default now(),
  valid_until timestamptz
);

create index if not exists idx_csm_session_created
  on conversation_semantic_memory (conversation_session_id, created_at desc);

create index if not exists idx_csm_valid_until
  on conversation_semantic_memory (valid_until);

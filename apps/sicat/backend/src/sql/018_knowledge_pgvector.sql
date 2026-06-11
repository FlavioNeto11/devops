-- 018: base de conhecimento do RAG em pgvector (F2 da re-engenharia de IA).
-- Substitui o índice em arquivo (artifacts/conversation-knowledge-index.json):
-- embeddings text-embedding-3-small (1536 dims) com índice HNSW (cosine) e
-- ingestão INCREMENTAL por hash de fonte (knowledge_sources).
-- Requer a extensão pgvector (imagem pgvector/pgvector:pg16 — ver k8s/postgres.yaml).

create extension if not exists vector;

create table if not exists knowledge_sources (
  source_id        text primary key,         -- caminho/identificador da fonte (ex.: docs/copilot/01-....md)
  content_hash     text not null,            -- sha256 do conteúdo (skip de ingestão quando inalterado)
  chunk_count      integer not null default 0,
  embedding_model  text,
  ingested_at      timestamptz not null default now()
);

create table if not exists knowledge_chunks (
  id           text primary key,             -- "<fonte>#<n>"
  source_id    text not null references knowledge_sources(source_id) on delete cascade,
  chunk_index  integer not null,
  title        text,
  content      text not null,
  embedding    vector(1536) not null,
  created_at   timestamptz not null default now()
);

create index if not exists knowledge_chunks_embedding_idx
  on knowledge_chunks using hnsw (embedding vector_cosine_ops);

create index if not exists knowledge_chunks_source_idx
  on knowledge_chunks (source_id);

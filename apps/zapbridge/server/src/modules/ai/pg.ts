// =============================================================================
// Postgres da camada de IA (zapbridge-postgres, imagem pgvector/pgvector:pg16).
// -----------------------------------------------------------------------------
// Banco SEPARADO do SQLite transacional do WhatsApp: guarda só o que a IA precisa
// (threads do grafo, memória longa, embeddings de mensagens, base de conhecimento,
// consentimento e auditoria). O worker de embedding só escreve AQUI — o SQLite nunca
// ganha um 2º writer (regra de ouro: 1 réplica / Recreate / RWO).
//
// `query(sql, params)` é o adapter no formato que o @flavioneto11/ai-core espera
// (createThreadStore/createUserMemory/createPgVectorStore). Schemas das tabelas
// geridas pelo ai-core (ai_chat_threads, ai_user_memory, knowledge_*) replicam
// EXATAMENTE o que aquelas funções consultam. As demais são app-owned.
//
// Fail-soft: sem AI_DATABASE_URL, `aiDbEnabled()` é false e nada de IA toca o banco;
// o app sobe e serve normalmente.
// =============================================================================
import pg from 'pg';
import { env } from '../../config/env';

const { Pool } = pg;

let _pool: pg.Pool | null = null;

export function aiDbEnabled(): boolean {
  return Boolean(env.ai.databaseUrl);
}

export function getPool(): pg.Pool | null {
  if (!aiDbEnabled()) return null;
  if (!_pool) {
    _pool = new Pool({
      connectionString: env.ai.databaseUrl,
      max: 8,
      idleTimeoutMillis: 30_000,
      connectionTimeoutMillis: 5_000,
    });
    _pool.on('error', (e: Error) => console.warn('[ai/pg] pool error:', e.message));
  }
  return _pool;
}

/** Adapter `{ rows, rowCount }` consumido pelo ai-core e pelos serviços de IA. */
export async function query<T extends pg.QueryResultRow = pg.QueryResultRow>(
  text: string,
  params: readonly unknown[] = [],
): Promise<pg.QueryResult<T>> {
  const pool = getPool();
  if (!pool) throw new Error('AI_DATABASE_URL não configurado');
  return pool.query<T>(text, [...params]);
}

// DDL idempotente. Tabelas do ai-core (ai_chat_threads, ai_user_memory, knowledge_*)
// têm colunas EXATAS conforme src/memory.js e src/rag.js do pacote.
const DDL: string[] = [
  `create extension if not exists vector`,

  `create table if not exists ai_chat_threads (
     id text primary key,
     messages jsonb not null default '[]'::jsonb,
     rolling_summary text,
     turn_count integer not null default 0,
     created_at timestamptz not null default now(),
     updated_at timestamptz not null default now()
   )`,

  `create table if not exists ai_user_memory (
     id uuid primary key default gen_random_uuid(),
     user_id text not null,
     kind text not null default 'fact',
     content text not null,
     embedding vector(1536) not null,
     expires_at timestamptz,
     created_at timestamptz not null default now()
   )`,
  `create index if not exists ai_user_memory_user_idx on ai_user_memory (user_id)`,
  `create index if not exists ai_user_memory_embedding_idx on ai_user_memory using hnsw (embedding vector_cosine_ops)`,
  `create index if not exists ai_user_memory_expires_idx on ai_user_memory (expires_at)`,

  `create table if not exists message_embeddings (
     message_id text primary key,
     user_id text not null,
     chat_jid text not null,
     from_me boolean not null default false,
     text text not null,
     ts timestamptz not null,
     embedding vector(1536) not null,
     created_at timestamptz not null default now()
   )`,
  `create index if not exists message_embeddings_scope_idx on message_embeddings (user_id, chat_jid, ts desc)`,
  `create index if not exists message_embeddings_embedding_idx on message_embeddings using hnsw (embedding vector_cosine_ops)`,

  `create table if not exists knowledge_sources (
     source_id text primary key,
     content_hash text not null,
     chunk_count integer not null default 0,
     embedding_model text,
     ingested_at timestamptz not null default now()
   )`,
  `create table if not exists knowledge_chunks (
     id text primary key,
     source_id text not null references knowledge_sources(source_id) on delete cascade,
     chunk_index integer not null,
     title text,
     content text not null,
     embedding vector(1536) not null,
     created_at timestamptz not null default now()
   )`,
  `create index if not exists knowledge_chunks_embedding_idx on knowledge_chunks using hnsw (embedding vector_cosine_ops)`,
  `create index if not exists knowledge_chunks_source_idx on knowledge_chunks (source_id)`,

  `create table if not exists ai_consent (
     user_id text primary key,
     version text not null,
     scope jsonb not null default '{}'::jsonb,
     accepted_at timestamptz not null default now()
   )`,

  `create table if not exists ai_action_log (
     id uuid primary key default gen_random_uuid(),
     user_id text not null,
     chat_jid text,
     kind text not null,
     payload jsonb,
     status text not null,
     created_at timestamptz not null default now()
   )`,
  `create table if not exists ai_autoreply_log (
     id uuid primary key default gen_random_uuid(),
     user_id text not null,
     chat_jid text not null,
     message_id text,
     confidence double precision,
     created_at timestamptz not null default now()
   )`,
];

// advisory-lock arbitrário ('zapb') — serializa boots concorrentes (restart rápido da
// 1 réplica) para não correr o DDL consigo mesmo.
const LOCK_KEY = 0x7a61_7062;

let _migrated = false;

async function migrateOnce(): Promise<void> {
  const pool = getPool();
  if (!pool) return;
  const client = await pool.connect();
  try {
    await client.query('select pg_advisory_lock($1)', [LOCK_KEY]);
    for (const stmt of DDL) await client.query(stmt);
    _migrated = true;
    console.log('[ai/pg] migrations aplicadas (pgvector + tabelas de IA)');
  } finally {
    try {
      await client.query('select pg_advisory_unlock($1)', [LOCK_KEY]);
    } catch {
      /* ignore */
    }
    client.release();
  }
}

/**
 * Cria extensão + tabelas (idempotente). Fail-soft: sem AI_DATABASE_URL, no-op.
 * Com retry/backoff: o server (Recreate) costuma bootar ANTES de o Postgres ficar
 * pronto — sem retry as tabelas nunca seriam criadas (a função roda uma vez no boot).
 */
export async function runAiMigrations(): Promise<void> {
  if (!aiDbEnabled() || _migrated) return;
  const maxAttempts = 12; // ~2min total (postgres initdb + pull da imagem na 1ª subida)
  for (let attempt = 1; attempt <= maxAttempts && !_migrated; attempt++) {
    try {
      await migrateOnce();
      return;
    } catch (e) {
      if (attempt === maxAttempts) {
        console.warn('[ai/pg] migrations falharam após', maxAttempts, 'tentativas:', (e as Error).message);
        return;
      }
      await new Promise((r) => setTimeout(r, 10_000));
    }
  }
}

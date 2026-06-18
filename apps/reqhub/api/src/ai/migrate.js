// ai/migrate.js — DDL idempotente da memoria duravel do chat de autoria.
// Tabelas conforme o contrato do ai-core memory.js: ai_chat_threads (curto/medio) e
// ai_user_memory (longo, pgvector 1536). Roda no boot; CREATE ... IF NOT EXISTS -> seguro
// de repetir. Recebe `query(sql, params)` (adapter pg cru).
export async function runMigrations(query) {
  await query('CREATE EXTENSION IF NOT EXISTS vector');
  await query(`CREATE TABLE IF NOT EXISTS ai_chat_threads (
    id text PRIMARY KEY,
    messages jsonb NOT NULL DEFAULT '[]'::jsonb,
    rolling_summary text,
    turn_count int NOT NULL DEFAULT 0,
    created_at timestamptz NOT NULL DEFAULT now(),
    updated_at timestamptz NOT NULL DEFAULT now()
  )`);
  await query(`CREATE TABLE IF NOT EXISTS ai_user_memory (
    id bigserial PRIMARY KEY,
    user_id text NOT NULL,
    kind text NOT NULL DEFAULT 'fact',
    content text NOT NULL,
    embedding vector(1536),
    expires_at timestamptz,
    created_at timestamptz NOT NULL DEFAULT now()
  )`);
  await query('CREATE INDEX IF NOT EXISTS ai_user_memory_user_idx ON ai_user_memory (user_id)');
}

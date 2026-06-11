-- Memória da IA (F3 da re-engenharia — plataforma de IA).
-- Threads do assistente (estado server-side) + memória longa por usuário em
-- pgvector (recall escopado por user_id, TTL). A imagem do Postgres do GymOps
-- já é pgvector/pgvector:pg16.

CREATE EXTENSION IF NOT EXISTS vector;

-- CreateTable
CREATE TABLE "ai_chat_threads" (
    "id" TEXT NOT NULL,
    "messages" JSONB NOT NULL DEFAULT '[]',
    "rolling_summary" TEXT,
    "turn_count" INTEGER NOT NULL DEFAULT 0,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ai_chat_threads_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ai_user_memory" (
    "id" TEXT NOT NULL DEFAULT (gen_random_uuid())::text,
    "user_id" TEXT NOT NULL,
    "kind" TEXT NOT NULL DEFAULT 'fact',
    "content" TEXT NOT NULL,
    "embedding" vector(1536) NOT NULL,
    "expires_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ai_user_memory_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "ai_user_memory_user_id_idx" ON "ai_user_memory"("user_id");

-- Índice vetorial (recall semântico por usuário)
CREATE INDEX "ai_user_memory_embedding_idx" ON "ai_user_memory" USING hnsw ("embedding" vector_cosine_ops);

-- pgvector precisa existir ANTES da coluna vector(1536)
CREATE EXTENSION IF NOT EXISTS vector;

-- CreateEnum
CREATE TYPE "AiActor" AS ENUM ('cortex', 'gpt', 'claude', 'gemini', 'system', 'human');

-- CreateEnum
CREATE TYPE "TimelineKind" AS ENUM ('note', 'status_change', 'ai_output', 'document_event', 'financial', 'appointment', 'inspection', 'acm', 'ptam', 'corbam', 'message');

-- CreateTable
CREATE TABLE "ai_chat_threads" (
    "id" TEXT NOT NULL,
    "organization_id" TEXT,
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

-- CreateTable
CREATE TABLE "ai_runs" (
    "id" TEXT NOT NULL,
    "organization_id" TEXT,
    "user_id" TEXT,
    "thread_id" TEXT,
    "channel" TEXT,
    "route" TEXT,
    "specialist" TEXT,
    "model" TEXT,
    "provider" TEXT,
    "input_tokens" INTEGER NOT NULL DEFAULT 0,
    "output_tokens" INTEGER NOT NULL DEFAULT 0,
    "cost_usd" DECIMAL(12,6) NOT NULL DEFAULT 0,
    "latency_ms" INTEGER NOT NULL DEFAULT 0,
    "escalated" BOOLEAN NOT NULL DEFAULT false,
    "tool_calls" JSONB NOT NULL DEFAULT '[]',
    "correlation_id" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ai_runs_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "timeline_entries" (
    "id" TEXT NOT NULL,
    "organization_id" TEXT NOT NULL,
    "entity_type" TEXT NOT NULL,
    "entity_id" TEXT NOT NULL,
    "kind" "TimelineKind" NOT NULL DEFAULT 'note',
    "actor_type" "AiActor" NOT NULL DEFAULT 'system',
    "actor_user_id" TEXT,
    "title" TEXT NOT NULL,
    "summary" TEXT,
    "payload" JSONB NOT NULL DEFAULT '{}',
    "correlation_id" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "timeline_entries_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "ai_user_memory_user_id_idx" ON "ai_user_memory"("user_id");

-- CreateIndex
CREATE INDEX "ai_runs_organization_id_created_at_idx" ON "ai_runs"("organization_id", "created_at");

-- CreateIndex
CREATE INDEX "timeline_entries_organization_id_entity_type_entity_id_crea_idx" ON "timeline_entries"("organization_id", "entity_type", "entity_id", "created_at");


CREATE INDEX IF NOT EXISTS ai_user_memory_embedding_idx ON ai_user_memory USING hnsw (embedding vector_cosine_ops);

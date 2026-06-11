-- Feedback explícito da IA (F5 da re-engenharia — plataforma de IA).
-- 👍/👎 por mensagem do chat, único por (thread, mensagem, usuário) — o upsert
-- da rota POST /ai/feedback permite o usuário mudar de ideia sem duplicar.

-- CreateTable
CREATE TABLE "ai_feedback" (
    "id" TEXT NOT NULL DEFAULT (gen_random_uuid())::text,
    "thread_id" TEXT NOT NULL,
    "message_id" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "kind" TEXT NOT NULL,
    "tool_name" TEXT,
    "reason" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ai_feedback_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "ai_feedback_thread_id_message_id_user_id_key" ON "ai_feedback"("thread_id", "message_id", "user_id");

-- CreateIndex
CREATE INDEX "ai_feedback_user_id_created_at_idx" ON "ai_feedback"("user_id", "created_at");

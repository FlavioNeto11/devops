-- CreateEnum
CREATE TYPE "TutorialStatus" AS ENUM ('not_started', 'in_progress', 'completed', 'skipped', 'deferred');

-- CreateTable
CREATE TABLE "tutorial_progress" (
    "id" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "tutorial_id" TEXT NOT NULL,
    "status" "TutorialStatus" NOT NULL DEFAULT 'not_started',
    "current_step_id" TEXT,
    "completed_steps_json" JSONB NOT NULL DEFAULT '[]',
    "started_at" TIMESTAMP(3),
    "completed_at" TIMESTAMP(3),
    "skipped_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "tutorial_progress_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "tutorial_progress_user_id_tutorial_id_key" ON "tutorial_progress"("user_id", "tutorial_id");

-- CreateIndex
CREATE INDEX "tutorial_progress_user_id_updated_at_idx" ON "tutorial_progress"("user_id", "updated_at");

-- AddForeignKey
ALTER TABLE "tutorial_progress" ADD CONSTRAINT "tutorial_progress_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

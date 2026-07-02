-- CreateTable
CREATE TABLE "ptams" (
    "id" TEXT NOT NULL,
    "organization_id" TEXT NOT NULL,
    "property_id" TEXT,
    "acm_run_id" TEXT,
    "methodology" TEXT NOT NULL DEFAULT 'ABNT NBR 14653',
    "status" TEXT NOT NULL DEFAULT 'draft',
    "narrative_text" TEXT,
    "estimated_value" DECIMAL(14,2),
    "confidence_grade" TEXT,
    "generated_by_model" TEXT,
    "version" INTEGER NOT NULL DEFAULT 1,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ptams_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "ptams_organization_id_idx" ON "ptams"("organization_id");


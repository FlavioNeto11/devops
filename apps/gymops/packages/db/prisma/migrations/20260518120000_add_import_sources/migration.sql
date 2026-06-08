-- CreateTable
CREATE TABLE "import_sources" (
    "id" TEXT NOT NULL,
    "organization_id" TEXT NOT NULL,
    "source_type" TEXT NOT NULL,
    "source_id" TEXT NOT NULL,
    "target_type" TEXT NOT NULL,
    "target_id" TEXT NOT NULL,
    "import_job_id" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "import_sources_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "import_sources_organization_id_source_type_source_id_key" ON "import_sources"("organization_id", "source_type", "source_id");

-- CreateIndex
CREATE INDEX "import_sources_organization_id_idx" ON "import_sources"("organization_id");

-- AddForeignKey
ALTER TABLE "import_sources" ADD CONSTRAINT "import_sources_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

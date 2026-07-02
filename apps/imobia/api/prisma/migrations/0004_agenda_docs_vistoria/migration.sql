-- CreateEnum
CREATE TYPE "AppointmentKind" AS ENUM ('visita', 'vistoria', 'renovacao', 'reuniao', 'assinatura');

-- CreateEnum
CREATE TYPE "AppointmentStatus" AS ENUM ('agendado', 'confirmado', 'concluido', 'cancelado');

-- CreateEnum
CREATE TYPE "InspectionKind" AS ENUM ('entrada', 'saida', 'periodica');

-- CreateEnum
CREATE TYPE "InspectionStatus" AS ENUM ('agendada', 'em_campo', 'analisando', 'laudo_gerado', 'concluida');

-- CreateEnum
CREATE TYPE "DocumentType" AS ENUM ('rg', 'cnh', 'holerite', 'comprovante_renda', 'certidao', 'contrato', 'serasa', 'boa_vista', 'extrato_bancario', 'matricula', 'foto', 'outro');

-- CreateEnum
CREATE TYPE "DocumentValidation" AS ENUM ('pendente', 'valido', 'invalido', 'ilegivel', 'expirado');

-- CreateTable
CREATE TABLE "appointments" (
    "id" TEXT NOT NULL,
    "organization_id" TEXT NOT NULL,
    "kind" "AppointmentKind" NOT NULL DEFAULT 'visita',
    "status" "AppointmentStatus" NOT NULL DEFAULT 'agendado',
    "title" TEXT NOT NULL,
    "start_at" TIMESTAMP(3) NOT NULL,
    "end_at" TIMESTAMP(3),
    "property_id" TEXT,
    "lead_id" TEXT,
    "corretor_id" TEXT,
    "location" TEXT,
    "notes" TEXT,
    "created_by_ai" BOOLEAN NOT NULL DEFAULT false,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "appointments_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "documents" (
    "id" TEXT NOT NULL,
    "organization_id" TEXT NOT NULL,
    "type" "DocumentType" NOT NULL DEFAULT 'outro',
    "validation" "DocumentValidation" NOT NULL DEFAULT 'pendente',
    "entity_type" TEXT,
    "entity_id" TEXT,
    "property_id" TEXT,
    "lead_id" TEXT,
    "inspection_id" TEXT,
    "corbam_case_id" TEXT,
    "filename" TEXT NOT NULL,
    "storage_key" TEXT NOT NULL,
    "mime_type" TEXT,
    "size_bytes" INTEGER,
    "validation_reason" TEXT,
    "extracted_fields" JSONB,
    "validated_by_model" TEXT,
    "validated_at" TIMESTAMP(3),
    "uploaded_by" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "documents_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "inspections" (
    "id" TEXT NOT NULL,
    "organization_id" TEXT NOT NULL,
    "property_id" TEXT,
    "kind" "InspectionKind" NOT NULL DEFAULT 'entrada',
    "status" "InspectionStatus" NOT NULL DEFAULT 'agendada',
    "scheduled_at" TIMESTAMP(3),
    "vistoriador_id" TEXT,
    "laudo_text" TEXT,
    "laudo_pdf_key" TEXT,
    "summary" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "inspections_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "inspection_photos" (
    "id" TEXT NOT NULL,
    "inspection_id" TEXT NOT NULL,
    "storage_key" TEXT NOT NULL,
    "room" TEXT,
    "ai_description" TEXT,
    "ai_findings" JSONB,
    "analyzed_by_model" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "inspection_photos_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "appointments_organization_id_start_at_idx" ON "appointments"("organization_id", "start_at");

-- CreateIndex
CREATE INDEX "documents_organization_id_entity_type_entity_id_idx" ON "documents"("organization_id", "entity_type", "entity_id");

-- CreateIndex
CREATE INDEX "inspections_organization_id_status_idx" ON "inspections"("organization_id", "status");

-- CreateIndex
CREATE INDEX "inspection_photos_inspection_id_idx" ON "inspection_photos"("inspection_id");

-- AddForeignKey
ALTER TABLE "inspection_photos" ADD CONSTRAINT "inspection_photos_inspection_id_fkey" FOREIGN KEY ("inspection_id") REFERENCES "inspections"("id") ON DELETE CASCADE ON UPDATE CASCADE;


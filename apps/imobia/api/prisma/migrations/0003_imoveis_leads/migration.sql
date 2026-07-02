-- CreateEnum
CREATE TYPE "PropertyPurpose" AS ENUM ('venda', 'locacao', 'ambos');

-- CreateEnum
CREATE TYPE "PropertyStatus" AS ENUM ('captacao', 'disponivel', 'reservado', 'vendido', 'locado', 'inativo');

-- CreateEnum
CREATE TYPE "PropertyType" AS ENUM ('apartamento', 'casa', 'terreno', 'comercial', 'rural', 'sala', 'galpao');

-- CreateEnum
CREATE TYPE "LeadInterest" AS ENUM ('compra', 'locacao', 'ambos');

-- CreateEnum
CREATE TYPE "LeadStage" AS ENUM ('novo', 'qualificando', 'qualificado', 'negociando', 'fechado', 'perdido');

-- CreateTable
CREATE TABLE "owners" (
    "id" TEXT NOT NULL,
    "organization_id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "cpf_cnpj" TEXT,
    "phone" TEXT,
    "email" TEXT,
    "notes" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "owners_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "addresses" (
    "id" TEXT NOT NULL,
    "street" TEXT,
    "number" TEXT,
    "complement" TEXT,
    "district" TEXT,
    "city" TEXT,
    "state" TEXT,
    "zip" TEXT,
    "lat" DOUBLE PRECISION,
    "lng" DOUBLE PRECISION,

    CONSTRAINT "addresses_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "properties" (
    "id" TEXT NOT NULL,
    "organization_id" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "purpose" "PropertyPurpose" NOT NULL DEFAULT 'venda',
    "type" "PropertyType" NOT NULL DEFAULT 'apartamento',
    "status" "PropertyStatus" NOT NULL DEFAULT 'captacao',
    "title" TEXT NOT NULL,
    "description" TEXT,
    "price_sale" DECIMAL(14,2),
    "price_rent" DECIMAL(14,2),
    "condo_fee" DECIMAL(12,2),
    "iptu" DECIMAL(12,2),
    "area_total" DOUBLE PRECISION,
    "area_usable" DOUBLE PRECISION,
    "bedrooms" INTEGER NOT NULL DEFAULT 0,
    "bathrooms" INTEGER NOT NULL DEFAULT 0,
    "parking" INTEGER NOT NULL DEFAULT 0,
    "owner_id" TEXT,
    "address_id" TEXT,
    "embedding" vector(1536),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "properties_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "property_photos" (
    "id" TEXT NOT NULL,
    "property_id" TEXT NOT NULL,
    "url" TEXT NOT NULL,
    "caption" TEXT,
    "order" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "property_photos_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "leads" (
    "id" TEXT NOT NULL,
    "organization_id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "cpf_cnpj" TEXT,
    "phone" TEXT,
    "email" TEXT,
    "interest" "LeadInterest" NOT NULL DEFAULT 'compra',
    "stage" "LeadStage" NOT NULL DEFAULT 'novo',
    "score" INTEGER NOT NULL DEFAULT 0,
    "score_reason" TEXT,
    "budget_min" DECIMAL(14,2),
    "budget_max" DECIMAL(14,2),
    "financial_profile" JSONB,
    "source_channel" TEXT,
    "notes" TEXT,
    "assigned_corretor_id" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "leads_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "lead_property_interests" (
    "id" TEXT NOT NULL,
    "lead_id" TEXT NOT NULL,
    "property_id" TEXT NOT NULL,
    "match_score" INTEGER NOT NULL DEFAULT 0,
    "note" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "lead_property_interests_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "owners_organization_id_idx" ON "owners"("organization_id");

-- CreateIndex
CREATE UNIQUE INDEX "properties_address_id_key" ON "properties"("address_id");

-- CreateIndex
CREATE INDEX "properties_organization_id_status_idx" ON "properties"("organization_id", "status");

-- CreateIndex
CREATE INDEX "property_photos_property_id_idx" ON "property_photos"("property_id");

-- CreateIndex
CREATE INDEX "leads_organization_id_stage_idx" ON "leads"("organization_id", "stage");

-- CreateIndex
CREATE UNIQUE INDEX "lead_property_interests_lead_id_property_id_key" ON "lead_property_interests"("lead_id", "property_id");

-- AddForeignKey
ALTER TABLE "properties" ADD CONSTRAINT "properties_owner_id_fkey" FOREIGN KEY ("owner_id") REFERENCES "owners"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "properties" ADD CONSTRAINT "properties_address_id_fkey" FOREIGN KEY ("address_id") REFERENCES "addresses"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "property_photos" ADD CONSTRAINT "property_photos_property_id_fkey" FOREIGN KEY ("property_id") REFERENCES "properties"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "lead_property_interests" ADD CONSTRAINT "lead_property_interests_lead_id_fkey" FOREIGN KEY ("lead_id") REFERENCES "leads"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "lead_property_interests" ADD CONSTRAINT "lead_property_interests_property_id_fkey" FOREIGN KEY ("property_id") REFERENCES "properties"("id") ON DELETE CASCADE ON UPDATE CASCADE;


CREATE INDEX IF NOT EXISTS properties_embedding_idx ON properties USING hnsw (embedding vector_cosine_ops);

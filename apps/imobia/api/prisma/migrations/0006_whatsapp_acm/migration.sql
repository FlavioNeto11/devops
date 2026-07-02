-- CreateEnum
CREATE TYPE "ChannelSegment" AS ENUM ('captacao', 'vendas', 'financas', 'geral');

-- CreateEnum
CREATE TYPE "MessageDirection" AS ENUM ('inbound', 'outbound');

-- CreateTable
CREATE TABLE "channels" (
    "id" TEXT NOT NULL,
    "organization_id" TEXT NOT NULL,
    "phone_number" TEXT NOT NULL,
    "instance_id" TEXT NOT NULL,
    "segment" "ChannelSegment" NOT NULL DEFAULT 'geral',
    "status" TEXT NOT NULL DEFAULT 'disconnected',
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "channels_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "wa_messages" (
    "id" TEXT NOT NULL,
    "organization_id" TEXT NOT NULL,
    "channel_id" TEXT NOT NULL,
    "contact_name" TEXT,
    "wa_jid" TEXT,
    "direction" "MessageDirection" NOT NULL DEFAULT 'inbound',
    "type" TEXT NOT NULL DEFAULT 'text',
    "text" TEXT,
    "ai_triaged" BOOLEAN NOT NULL DEFAULT false,
    "ai_intent" TEXT,
    "ai_actor" "AiActor",
    "lead_id" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "wa_messages_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "acm_runs" (
    "id" TEXT NOT NULL,
    "organization_id" TEXT NOT NULL,
    "property_id" TEXT,
    "status" TEXT NOT NULL DEFAULT 'aberto',
    "radius_km" DOUBLE PRECISION,
    "avg_price_per_m2" DOUBLE PRECISION,
    "median_price_per_m2" DOUBLE PRECISION,
    "sample_size" INTEGER NOT NULL DEFAULT 0,
    "summary" TEXT,
    "source_portals" TEXT[],
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "acm_runs_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "acm_comparables" (
    "id" TEXT NOT NULL,
    "acm_run_id" TEXT NOT NULL,
    "portal" TEXT NOT NULL DEFAULT 'manual',
    "external_url" TEXT,
    "price" DECIMAL(14,2) NOT NULL,
    "area_m2" DOUBLE PRECISION NOT NULL,
    "price_per_m2" DOUBLE PRECISION NOT NULL,
    "type" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "acm_comparables_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "channels_organization_id_idx" ON "channels"("organization_id");

-- CreateIndex
CREATE INDEX "wa_messages_channel_id_created_at_idx" ON "wa_messages"("channel_id", "created_at");

-- CreateIndex
CREATE INDEX "acm_runs_organization_id_idx" ON "acm_runs"("organization_id");

-- CreateIndex
CREATE INDEX "acm_comparables_acm_run_id_idx" ON "acm_comparables"("acm_run_id");

-- AddForeignKey
ALTER TABLE "wa_messages" ADD CONSTRAINT "wa_messages_channel_id_fkey" FOREIGN KEY ("channel_id") REFERENCES "channels"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "acm_comparables" ADD CONSTRAINT "acm_comparables_acm_run_id_fkey" FOREIGN KEY ("acm_run_id") REFERENCES "acm_runs"("id") ON DELETE CASCADE ON UPDATE CASCADE;


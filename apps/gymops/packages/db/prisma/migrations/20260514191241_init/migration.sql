-- CreateEnum
CREATE TYPE "UserRole" AS ENUM ('owner', 'org_manager', 'unit_manager', 'area_leader', 'executor', 'viewer');

-- CreateEnum
CREATE TYPE "ScopeType" AS ENUM ('organization', 'unit', 'area');

-- CreateEnum
CREATE TYPE "ActivityStatus" AS ENUM ('novo', 'em_andamento', 'aguardando_terceiro', 'aguardando_aprovacao', 'concluido', 'cancelado');

-- CreateEnum
CREATE TYPE "ActivityPriority" AS ENUM ('baixa', 'media', 'alta', 'critica');

-- CreateEnum
CREATE TYPE "VisibilityMode" AS ENUM ('inherited', 'restricted', 'shared');

-- CreateEnum
CREATE TYPE "AssigneeKind" AS ENUM ('responsible', 'participant', 'watcher');

-- CreateEnum
CREATE TYPE "AccessLevel" AS ENUM ('view', 'edit');

-- CreateEnum
CREATE TYPE "RecurrenceFrequency" AS ENUM ('diaria', 'semanal', 'mensal', 'intervalo_customizado');

-- CreateEnum
CREATE TYPE "RecurrenceGenerationMode" AS ENUM ('on_complete', 'pre_generate');

-- CreateEnum
CREATE TYPE "NotificationChannel" AS ENUM ('email', 'push', 'whatsapp');

-- CreateEnum
CREATE TYPE "IntegrationProvider" AS ENUM ('trello', 'google_drive', 'onedrive', 'whatsapp');

-- CreateEnum
CREATE TYPE "ImportStatus" AS ENUM ('pending', 'processing', 'awaiting_review', 'committed', 'failed');

-- CreateEnum
CREATE TYPE "ImportItemStatus" AS ENUM ('pending', 'mapped', 'skipped', 'failed');

-- CreateTable
CREATE TABLE "organizations" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "logo_url" TEXT,
    "settings_jsonb" JSONB NOT NULL DEFAULT '{}',
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    "deleted_at" TIMESTAMP(3),

    CONSTRAINT "organizations_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "units" (
    "id" TEXT NOT NULL,
    "organization_id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "code" TEXT,
    "address" TEXT,
    "status" TEXT NOT NULL DEFAULT 'active',
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    "deleted_at" TIMESTAMP(3),

    CONSTRAINT "units_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "areas" (
    "id" TEXT NOT NULL,
    "organization_id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "key" TEXT NOT NULL,
    "color" TEXT,
    "visibility_default" "VisibilityMode" NOT NULL DEFAULT 'inherited',
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "areas_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "unit_areas" (
    "id" TEXT NOT NULL,
    "unit_id" TEXT NOT NULL,
    "area_id" TEXT NOT NULL,
    "enabled" BOOLEAN NOT NULL DEFAULT true,
    "order" INTEGER NOT NULL DEFAULT 0,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "unit_areas_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "users" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "phone" TEXT,
    "avatar_url" TEXT,
    "password_hash" TEXT,
    "google_id" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    "deleted_at" TIMESTAMP(3),

    CONSTRAINT "users_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "sessions" (
    "id" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "refresh_token" TEXT NOT NULL,
    "expires_at" TIMESTAMP(3) NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "revoked_at" TIMESTAMP(3),

    CONSTRAINT "sessions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "memberships" (
    "id" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "organization_id" TEXT NOT NULL,
    "scope_type" "ScopeType" NOT NULL,
    "scope_id" TEXT NOT NULL,
    "role" "UserRole" NOT NULL,
    "granted_by" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    "deleted_at" TIMESTAMP(3),

    CONSTRAINT "memberships_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "activity_templates" (
    "id" TEXT NOT NULL,
    "organization_id" TEXT NOT NULL,
    "area_id" TEXT,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "config_jsonb" JSONB NOT NULL DEFAULT '{}',
    "is_system" BOOLEAN NOT NULL DEFAULT false,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    "deleted_at" TIMESTAMP(3),

    CONSTRAINT "activity_templates_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "activities" (
    "id" TEXT NOT NULL,
    "organization_id" TEXT NOT NULL,
    "unit_id" TEXT NOT NULL,
    "area_id" TEXT NOT NULL,
    "template_id" TEXT,
    "title" TEXT NOT NULL,
    "description" TEXT,
    "status" "ActivityStatus" NOT NULL DEFAULT 'novo',
    "priority" "ActivityPriority" NOT NULL DEFAULT 'media',
    "due_at" TIMESTAMP(3),
    "visibility_mode" "VisibilityMode" NOT NULL DEFAULT 'inherited',
    "metadata_jsonb" JSONB NOT NULL DEFAULT '{}',
    "created_by" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    "deleted_at" TIMESTAMP(3),

    CONSTRAINT "activities_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "activity_assignees" (
    "id" TEXT NOT NULL,
    "activity_id" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "kind" "AssigneeKind" NOT NULL DEFAULT 'responsible',
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "activity_assignees_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "activity_permissions" (
    "id" TEXT NOT NULL,
    "activity_id" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "access_level" "AccessLevel" NOT NULL DEFAULT 'view',
    "granted_by" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "activity_permissions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "activity_checklists" (
    "id" TEXT NOT NULL,
    "activity_id" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "order" INTEGER NOT NULL DEFAULT 0,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "activity_checklists_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "activity_checklist_items" (
    "id" TEXT NOT NULL,
    "checklist_id" TEXT NOT NULL,
    "text" TEXT NOT NULL,
    "done" BOOLEAN NOT NULL DEFAULT false,
    "done_by" TEXT,
    "done_at" TIMESTAMP(3),
    "order" INTEGER NOT NULL DEFAULT 0,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "activity_checklist_items_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "activity_comments" (
    "id" TEXT NOT NULL,
    "activity_id" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "body" TEXT NOT NULL,
    "edited_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "deleted_at" TIMESTAMP(3),

    CONSTRAINT "activity_comments_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "activity_attachments" (
    "id" TEXT NOT NULL,
    "activity_id" TEXT NOT NULL,
    "storage_provider" TEXT NOT NULL DEFAULT 'r2',
    "object_key" TEXT,
    "external_url" TEXT,
    "filename" TEXT NOT NULL,
    "mime_type" TEXT NOT NULL,
    "size_bytes" INTEGER,
    "uploaded_by" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "deleted_at" TIMESTAMP(3),

    CONSTRAINT "activity_attachments_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "activity_events" (
    "id" TEXT NOT NULL,
    "activity_id" TEXT NOT NULL,
    "actor_id" TEXT,
    "event_type" TEXT NOT NULL,
    "payload_jsonb" JSONB NOT NULL DEFAULT '{}',
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "activity_events_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "recurrence_rules" (
    "id" TEXT NOT NULL,
    "activity_id" TEXT NOT NULL,
    "frequency" "RecurrenceFrequency" NOT NULL,
    "interval" INTEGER NOT NULL DEFAULT 1,
    "weekdays_jsonb" JSONB,
    "generation_mode" "RecurrenceGenerationMode" NOT NULL DEFAULT 'on_complete',
    "pre_generate_n" INTEGER,
    "next_run_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "recurrence_rules_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "notification_preferences" (
    "id" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "channel" "NotificationChannel" NOT NULL,
    "enabled" BOOLEAN NOT NULL DEFAULT true,
    "config_jsonb" JSONB NOT NULL DEFAULT '{}',
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "notification_preferences_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "integration_accounts" (
    "id" TEXT NOT NULL,
    "organization_id" TEXT NOT NULL,
    "provider" "IntegrationProvider" NOT NULL,
    "auth_jsonb" JSONB NOT NULL,
    "metadata_jsonb" JSONB NOT NULL DEFAULT '{}',
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    "revoked_at" TIMESTAMP(3),

    CONSTRAINT "integration_accounts_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "import_jobs" (
    "id" TEXT NOT NULL,
    "organization_id" TEXT NOT NULL,
    "integration_account_id" TEXT,
    "provider" TEXT NOT NULL,
    "status" "ImportStatus" NOT NULL DEFAULT 'pending',
    "source_jsonb" JSONB NOT NULL DEFAULT '{}',
    "mapping_jsonb" JSONB NOT NULL DEFAULT '{}',
    "summary_jsonb" JSONB,
    "created_by" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "import_jobs_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "import_items" (
    "id" TEXT NOT NULL,
    "import_job_id" TEXT NOT NULL,
    "source_type" TEXT NOT NULL,
    "source_id" TEXT NOT NULL,
    "target_type" TEXT,
    "target_id" TEXT,
    "status" "ImportItemStatus" NOT NULL DEFAULT 'pending',
    "error_message" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "import_items_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "organizations_slug_key" ON "organizations"("slug");

-- CreateIndex
CREATE INDEX "units_organization_id_idx" ON "units"("organization_id");

-- CreateIndex
CREATE UNIQUE INDEX "areas_organization_id_key_key" ON "areas"("organization_id", "key");

-- CreateIndex
CREATE UNIQUE INDEX "unit_areas_unit_id_area_id_key" ON "unit_areas"("unit_id", "area_id");

-- CreateIndex
CREATE UNIQUE INDEX "users_email_key" ON "users"("email");

-- CreateIndex
CREATE UNIQUE INDEX "users_google_id_key" ON "users"("google_id");

-- CreateIndex
CREATE UNIQUE INDEX "sessions_refresh_token_key" ON "sessions"("refresh_token");

-- CreateIndex
CREATE INDEX "sessions_user_id_idx" ON "sessions"("user_id");

-- CreateIndex
CREATE INDEX "memberships_user_id_organization_id_scope_type_scope_id_idx" ON "memberships"("user_id", "organization_id", "scope_type", "scope_id");

-- CreateIndex
CREATE INDEX "memberships_organization_id_scope_type_scope_id_idx" ON "memberships"("organization_id", "scope_type", "scope_id");

-- CreateIndex
CREATE INDEX "activities_organization_id_unit_id_status_due_at_idx" ON "activities"("organization_id", "unit_id", "status", "due_at");

-- CreateIndex
CREATE INDEX "activities_organization_id_area_id_status_idx" ON "activities"("organization_id", "area_id", "status");

-- CreateIndex
CREATE INDEX "activities_created_by_idx" ON "activities"("created_by");

-- CreateIndex
CREATE INDEX "activity_assignees_user_id_idx" ON "activity_assignees"("user_id");

-- CreateIndex
CREATE UNIQUE INDEX "activity_assignees_activity_id_user_id_kind_key" ON "activity_assignees"("activity_id", "user_id", "kind");

-- CreateIndex
CREATE UNIQUE INDEX "activity_permissions_activity_id_user_id_key" ON "activity_permissions"("activity_id", "user_id");

-- CreateIndex
CREATE INDEX "activity_checklists_activity_id_idx" ON "activity_checklists"("activity_id");

-- CreateIndex
CREATE INDEX "activity_checklist_items_checklist_id_idx" ON "activity_checklist_items"("checklist_id");

-- CreateIndex
CREATE INDEX "activity_comments_activity_id_created_at_idx" ON "activity_comments"("activity_id", "created_at");

-- CreateIndex
CREATE INDEX "activity_attachments_activity_id_idx" ON "activity_attachments"("activity_id");

-- CreateIndex
CREATE INDEX "activity_events_activity_id_created_at_idx" ON "activity_events"("activity_id", "created_at");

-- CreateIndex
CREATE UNIQUE INDEX "recurrence_rules_activity_id_key" ON "recurrence_rules"("activity_id");

-- CreateIndex
CREATE INDEX "recurrence_rules_next_run_at_idx" ON "recurrence_rules"("next_run_at");

-- CreateIndex
CREATE UNIQUE INDEX "notification_preferences_user_id_channel_key" ON "notification_preferences"("user_id", "channel");

-- CreateIndex
CREATE UNIQUE INDEX "integration_accounts_organization_id_provider_key" ON "integration_accounts"("organization_id", "provider");

-- CreateIndex
CREATE INDEX "import_jobs_organization_id_status_idx" ON "import_jobs"("organization_id", "status");

-- CreateIndex
CREATE INDEX "import_items_import_job_id_status_idx" ON "import_items"("import_job_id", "status");

-- AddForeignKey
ALTER TABLE "units" ADD CONSTRAINT "units_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "areas" ADD CONSTRAINT "areas_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "unit_areas" ADD CONSTRAINT "unit_areas_unit_id_fkey" FOREIGN KEY ("unit_id") REFERENCES "units"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "unit_areas" ADD CONSTRAINT "unit_areas_area_id_fkey" FOREIGN KEY ("area_id") REFERENCES "areas"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "sessions" ADD CONSTRAINT "sessions_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "memberships" ADD CONSTRAINT "memberships_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "memberships" ADD CONSTRAINT "memberships_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "activity_templates" ADD CONSTRAINT "activity_templates_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "activity_templates" ADD CONSTRAINT "activity_templates_area_id_fkey" FOREIGN KEY ("area_id") REFERENCES "areas"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "activities" ADD CONSTRAINT "activities_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "activities" ADD CONSTRAINT "activities_unit_id_fkey" FOREIGN KEY ("unit_id") REFERENCES "units"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "activities" ADD CONSTRAINT "activities_area_id_fkey" FOREIGN KEY ("area_id") REFERENCES "areas"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "activities" ADD CONSTRAINT "activities_template_id_fkey" FOREIGN KEY ("template_id") REFERENCES "activity_templates"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "activity_assignees" ADD CONSTRAINT "activity_assignees_activity_id_fkey" FOREIGN KEY ("activity_id") REFERENCES "activities"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "activity_assignees" ADD CONSTRAINT "activity_assignees_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "activity_permissions" ADD CONSTRAINT "activity_permissions_activity_id_fkey" FOREIGN KEY ("activity_id") REFERENCES "activities"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "activity_permissions" ADD CONSTRAINT "activity_permissions_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "activity_checklists" ADD CONSTRAINT "activity_checklists_activity_id_fkey" FOREIGN KEY ("activity_id") REFERENCES "activities"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "activity_checklist_items" ADD CONSTRAINT "activity_checklist_items_checklist_id_fkey" FOREIGN KEY ("checklist_id") REFERENCES "activity_checklists"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "activity_comments" ADD CONSTRAINT "activity_comments_activity_id_fkey" FOREIGN KEY ("activity_id") REFERENCES "activities"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "activity_comments" ADD CONSTRAINT "activity_comments_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "activity_attachments" ADD CONSTRAINT "activity_attachments_activity_id_fkey" FOREIGN KEY ("activity_id") REFERENCES "activities"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "activity_events" ADD CONSTRAINT "activity_events_activity_id_fkey" FOREIGN KEY ("activity_id") REFERENCES "activities"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "activity_events" ADD CONSTRAINT "activity_events_actor_id_fkey" FOREIGN KEY ("actor_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "recurrence_rules" ADD CONSTRAINT "recurrence_rules_activity_id_fkey" FOREIGN KEY ("activity_id") REFERENCES "activities"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "notification_preferences" ADD CONSTRAINT "notification_preferences_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "integration_accounts" ADD CONSTRAINT "integration_accounts_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "import_jobs" ADD CONSTRAINT "import_jobs_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "import_jobs" ADD CONSTRAINT "import_jobs_integration_account_id_fkey" FOREIGN KEY ("integration_account_id") REFERENCES "integration_accounts"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "import_items" ADD CONSTRAINT "import_items_import_job_id_fkey" FOREIGN KEY ("import_job_id") REFERENCES "import_jobs"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

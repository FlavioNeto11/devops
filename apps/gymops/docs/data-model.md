# Modelo de Dados

Todas as tabelas usam `UUID` como chave primária. Timestamps em UTC. Soft delete via `deleted_at` onde indicado.

---

## Diagrama de entidades principais

```
organizations
    └── units (N)
    └── areas (N, catálogo global da org)
    └── unit_areas (N, quais áreas cada unidade usa)
    └── users (N via memberships)
    └── memberships (N, RBAC por escopo)
    └── activity_templates (N)
    └── activities (N)
    └── integration_accounts (N)
    └── import_jobs (N)

activities
    └── activity_assignees (N)
    └── activity_permissions (N, itens restritos)
    └── activity_checklists (N)
        └── activity_checklist_items (N)
    └── activity_comments (N)
    └── activity_attachments (N)
    └── activity_events (N, histórico imutável)
    └── recurrence_rules (1)
```

---

## Schema Prisma completo

```prisma
// packages/db/prisma/schema.prisma

generator client {
  provider = "prisma-client-js"
}

datasource db {
  provider = "postgresql"
  url      = env("DATABASE_URL")
}

// ─── ENUMS ───────────────────────────────────────────────

enum UserRole {
  owner
  org_manager
  unit_manager
  area_leader
  executor
  viewer
}

enum ScopeType {
  organization
  unit
  area
}

enum ActivityStatus {
  novo
  em_andamento
  aguardando_terceiro
  aguardando_aprovacao
  concluido
  cancelado
}

enum ActivityPriority {
  baixa
  media
  alta
  critica
}

enum VisibilityMode {
  inherited
  restricted
  shared
}

enum AssigneeKind {
  responsible  // responsável principal
  participant  // participante
  watcher      // apenas notificações
}

enum AccessLevel {
  view
  edit
}

enum RecurrenceFrequency {
  diaria
  semanal
  mensal
  intervalo_customizado
}

enum RecurrenceGenerationMode {
  on_complete    // gerar próxima ao concluir atual
  pre_generate   // pré-gerar N ocorrências
}

enum NotificationChannel {
  email
  push
  whatsapp
}

enum IntegrationProvider {
  trello
  google_drive
  onedrive
  whatsapp
}

enum ImportStatus {
  pending
  processing
  awaiting_review
  committed
  failed
}

enum ImportItemStatus {
  pending
  mapped
  skipped
  failed
}

// ─── CORE ENTITIES ───────────────────────────────────────

model Organization {
  id        String   @id @default(uuid())
  name      String
  slug      String   @unique
  logoUrl   String?  @map("logo_url")
  settings  Json     @default("{}") @map("settings_jsonb")
  createdAt DateTime @default(now()) @map("created_at")
  updatedAt DateTime @updatedAt @map("updated_at")
  deletedAt DateTime? @map("deleted_at")

  units               Unit[]
  areas               Area[]
  memberships         Membership[]
  activityTemplates   ActivityTemplate[]
  activities          Activity[]
  integrationAccounts IntegrationAccount[]
  importJobs          ImportJob[]

  @@map("organizations")
}

model Unit {
  id             String   @id @default(uuid())
  organizationId String   @map("organization_id")
  name           String
  code           String?
  address        String?
  status         String   @default("active") // active | inactive
  createdAt      DateTime @default(now()) @map("created_at")
  updatedAt      DateTime @updatedAt @map("updated_at")
  deletedAt      DateTime? @map("deleted_at")

  organization Organization @relation(fields: [organizationId], references: [id])
  unitAreas    UnitArea[]
  activities   Activity[]
  memberships  Membership[]

  @@index([organizationId])
  @@map("units")
}

model Area {
  id                String  @id @default(uuid())
  organizationId    String  @map("organization_id")
  name              String
  key               String  // slug: administrativo, marketing, coordenacao, etc.
  color             String?
  visibilityDefault VisibilityMode @default(inherited) @map("visibility_default")
  createdAt         DateTime @default(now()) @map("created_at")
  updatedAt         DateTime @updatedAt @map("updated_at")

  organization      Organization @relation(fields: [organizationId], references: [id])
  unitAreas         UnitArea[]
  activityTemplates ActivityTemplate[]
  activities        Activity[]
  memberships       Membership[]

  @@unique([organizationId, key])
  @@map("areas")
}

model UnitArea {
  id        String   @id @default(uuid())
  unitId    String   @map("unit_id")
  areaId    String   @map("area_id")
  enabled   Boolean  @default(true)
  order     Int      @default(0)
  createdAt DateTime @default(now()) @map("created_at")

  unit Unit @relation(fields: [unitId], references: [id])
  area Area @relation(fields: [areaId], references: [id])

  @@unique([unitId, areaId])
  @@map("unit_areas")
}

// ─── USERS & AUTH ────────────────────────────────────────

model User {
  id        String   @id @default(uuid())
  name      String
  email     String   @unique
  phone     String?
  avatarUrl String?  @map("avatar_url")
  passwordHash String? @map("password_hash")
  googleId  String?  @unique @map("google_id")
  createdAt DateTime @default(now()) @map("created_at")
  updatedAt DateTime @updatedAt @map("updated_at")
  deletedAt DateTime? @map("deleted_at")

  memberships             Membership[]
  activityAssignees       ActivityAssignee[]
  activityPermissions     ActivityPermission[]
  activityComments        ActivityComment[]
  activityEvents          ActivityEvent[]
  notificationPreferences NotificationPreference[]
  sessions                Session[]

  @@map("users")
}

model Session {
  id           String   @id @default(uuid())
  userId       String   @map("user_id")
  refreshToken String   @unique @map("refresh_token")
  expiresAt    DateTime @map("expires_at")
  createdAt    DateTime @default(now()) @map("created_at")
  revokedAt    DateTime? @map("revoked_at")

  user User @relation(fields: [userId], references: [id])

  @@index([userId])
  @@map("sessions")
}

// ─── RBAC ────────────────────────────────────────────────

model Membership {
  id             String    @id @default(uuid())
  userId         String    @map("user_id")
  organizationId String    @map("organization_id")
  scopeType      ScopeType @map("scope_type")
  scopeId        String    @map("scope_id") // org_id | unit_id | area_id
  role           UserRole
  grantedBy      String?   @map("granted_by")
  createdAt      DateTime  @default(now()) @map("created_at")
  updatedAt      DateTime  @updatedAt @map("updated_at")
  deletedAt      DateTime? @map("deleted_at")

  user         User         @relation(fields: [userId], references: [id])
  organization Organization @relation(fields: [organizationId], references: [id])
  unit         Unit?        @relation(fields: [scopeId], references: [id], map: "memberships_unit_fk")
  area         Area?        @relation(fields: [scopeId], references: [id], map: "memberships_area_fk")

  @@index([userId, organizationId, scopeType, scopeId])
  @@index([organizationId, scopeType, scopeId])
  @@map("memberships")
}

// ─── TEMPLATES ───────────────────────────────────────────

model ActivityTemplate {
  id             String   @id @default(uuid())
  organizationId String   @map("organization_id")
  areaId         String?  @map("area_id")
  name           String
  description    String?
  config         Json     @default("{}") @map("config_jsonb")
  // config inclui: checklist padrão, SLA sugerido, visibilidade padrão, campos específicos da área
  isSystem       Boolean  @default(false) @map("is_system") // templates de sistema (seed)
  createdAt      DateTime @default(now()) @map("created_at")
  updatedAt      DateTime @updatedAt @map("updated_at")
  deletedAt      DateTime? @map("deleted_at")

  organization Organization @relation(fields: [organizationId], references: [id])
  area         Area?        @relation(fields: [areaId], references: [id])
  activities   Activity[]

  @@map("activity_templates")
}

// ─── ACTIVITIES (NÚCLEO) ──────────────────────────────────

model Activity {
  id             String           @id @default(uuid())
  organizationId String           @map("organization_id")
  unitId         String           @map("unit_id")
  areaId         String           @map("area_id")
  templateId     String?          @map("template_id")
  title          String
  description    String?
  status         ActivityStatus   @default(novo)
  priority       ActivityPriority @default(media)
  dueAt          DateTime?        @map("due_at")
  visibilityMode VisibilityMode   @default(inherited) @map("visibility_mode")
  metadata       Json             @default("{}") @map("metadata_jsonb")
  // metadata: campos específicos do template (valor, fornecedor, equipamento, etc.)
  createdBy      String           @map("created_by")
  createdAt      DateTime         @default(now()) @map("created_at")
  updatedAt      DateTime         @updatedAt @map("updated_at")
  deletedAt      DateTime?        @map("deleted_at")

  organization     Organization         @relation(fields: [organizationId], references: [id])
  unit             Unit                 @relation(fields: [unitId], references: [id])
  area             Area                 @relation(fields: [areaId], references: [id])
  template         ActivityTemplate?    @relation(fields: [templateId], references: [id])
  assignees        ActivityAssignee[]
  permissions      ActivityPermission[]
  checklists       ActivityChecklist[]
  comments         ActivityComment[]
  attachments      ActivityAttachment[]
  events           ActivityEvent[]
  recurrenceRule   RecurrenceRule?

  @@index([organizationId, unitId, status, dueAt])
  @@index([organizationId, areaId, status])
  @@index([createdBy])
  @@map("activities")
}

model ActivityAssignee {
  id         String       @id @default(uuid())
  activityId String       @map("activity_id")
  userId     String       @map("user_id")
  kind       AssigneeKind @default(responsible)
  createdAt  DateTime     @default(now()) @map("created_at")

  activity Activity @relation(fields: [activityId], references: [id])
  user     User     @relation(fields: [userId], references: [id])

  @@unique([activityId, userId, kind])
  @@index([userId]) // visão pessoal
  @@map("activity_assignees")
}

model ActivityPermission {
  id          String      @id @default(uuid())
  activityId  String      @map("activity_id")
  userId      String      @map("user_id")
  accessLevel AccessLevel @default(view) @map("access_level")
  grantedBy   String      @map("granted_by")
  createdAt   DateTime    @default(now()) @map("created_at")

  activity Activity @relation(fields: [activityId], references: [id])
  user     User     @relation(fields: [userId], references: [id])

  @@unique([activityId, userId])
  @@map("activity_permissions")
}

// ─── CHECKLIST ───────────────────────────────────────────

model ActivityChecklist {
  id         String   @id @default(uuid())
  activityId String   @map("activity_id")
  title      String
  order      Int      @default(0)
  createdAt  DateTime @default(now()) @map("created_at")
  updatedAt  DateTime @updatedAt @map("updated_at")

  activity Activity              @relation(fields: [activityId], references: [id])
  items    ActivityChecklistItem[]

  @@index([activityId])
  @@map("activity_checklists")
}

model ActivityChecklistItem {
  id          String   @id @default(uuid())
  checklistId String   @map("checklist_id")
  text        String
  done        Boolean  @default(false)
  doneBy      String?  @map("done_by")
  doneAt      DateTime? @map("done_at")
  order       Int      @default(0)
  createdAt   DateTime @default(now()) @map("created_at")
  updatedAt   DateTime @updatedAt @map("updated_at")

  checklist ActivityChecklist @relation(fields: [checklistId], references: [id])

  @@index([checklistId])
  @@map("activity_checklist_items")
}

// ─── COMMENTS & ATTACHMENTS ──────────────────────────────

model ActivityComment {
  id         String   @id @default(uuid())
  activityId String   @map("activity_id")
  userId     String   @map("user_id")
  body       String
  editedAt   DateTime? @map("edited_at")
  createdAt  DateTime @default(now()) @map("created_at")
  deletedAt  DateTime? @map("deleted_at")

  activity Activity @relation(fields: [activityId], references: [id])
  user     User     @relation(fields: [userId], references: [id])

  @@index([activityId, createdAt])
  @@map("activity_comments")
}

model ActivityAttachment {
  id              String   @id @default(uuid())
  activityId      String   @map("activity_id")
  storageProvider String   @default("r2") @map("storage_provider") // r2 | external
  objectKey       String?  @map("object_key") // R2 key
  externalUrl     String?  @map("external_url") // Drive/OneDrive link
  filename        String
  mimeType        String   @map("mime_type")
  sizeBytes       Int?     @map("size_bytes")
  uploadedBy      String   @map("uploaded_by")
  createdAt       DateTime @default(now()) @map("created_at")
  deletedAt       DateTime? @map("deleted_at")

  activity Activity @relation(fields: [activityId], references: [id])

  @@index([activityId])
  @@map("activity_attachments")
}

// ─── HISTORY ─────────────────────────────────────────────

model ActivityEvent {
  id         String   @id @default(uuid())
  activityId String   @map("activity_id")
  actorId    String?  @map("actor_id") // null = sistema
  eventType  String   @map("event_type")
  // event_type: created | status_changed | priority_changed | assigned |
  //             checklist_checked | commented | attached | recurrence_triggered |
  //             imported | ai_draft_accepted | overdue_flagged
  payload    Json     @default("{}") @map("payload_jsonb")
  createdAt  DateTime @default(now()) @map("created_at")

  activity Activity @relation(fields: [activityId], references: [id])
  actor    User?    @relation(fields: [actorId], references: [id])

  @@index([activityId, createdAt])
  @@map("activity_events")
}

// ─── RECURRENCE ──────────────────────────────────────────

model RecurrenceRule {
  id             String                   @id @default(uuid())
  activityId     String                   @unique @map("activity_id")
  frequency      RecurrenceFrequency
  interval       Int                      @default(1) // a cada N unidades
  weekdays       Json?                    @map("weekdays_jsonb") // [0,1,2,3,4] para semanal
  generationMode RecurrenceGenerationMode @default(on_complete) @map("generation_mode")
  preGenerateN   Int?                     @map("pre_generate_n")
  nextRunAt      DateTime?                @map("next_run_at")
  createdAt      DateTime                 @default(now()) @map("created_at")
  updatedAt      DateTime                 @updatedAt @map("updated_at")

  activity Activity @relation(fields: [activityId], references: [id])

  @@index([nextRunAt]) // para o worker de recorrência
  @@map("recurrence_rules")
}

// ─── NOTIFICATIONS ────────────────────────────────────────

model NotificationPreference {
  id        String              @id @default(uuid())
  userId    String              @map("user_id")
  channel   NotificationChannel
  enabled   Boolean             @default(true)
  config    Json                @default("{}") @map("config_jsonb")
  createdAt DateTime            @default(now()) @map("created_at")
  updatedAt DateTime            @updatedAt @map("updated_at")

  user User @relation(fields: [userId], references: [id])

  @@unique([userId, channel])
  @@map("notification_preferences")
}

// ─── INTEGRATIONS & IMPORTS ───────────────────────────────

model IntegrationAccount {
  id             String              @id @default(uuid())
  organizationId String              @map("organization_id")
  provider       IntegrationProvider
  auth           Json                @map("auth_jsonb") // tokens, tokens encriptados
  metadata       Json                @default("{}") @map("metadata_jsonb")
  createdAt      DateTime            @default(now()) @map("created_at")
  updatedAt      DateTime            @updatedAt @map("updated_at")
  revokedAt      DateTime?           @map("revoked_at")

  organization Organization @relation(fields: [organizationId], references: [id])
  importJobs   ImportJob[]

  @@unique([organizationId, provider])
  @@map("integration_accounts")
}

model ImportJob {
  id                   String       @id @default(uuid())
  organizationId       String       @map("organization_id")
  integrationAccountId String?      @map("integration_account_id")
  provider             String       // trello | json_upload
  status               ImportStatus @default(pending)
  source               Json         @default("{}") @map("source_jsonb") // board IDs, filename etc.
  mapping              Json         @default("{}") @map("mapping_jsonb") // configuração do wizard
  summary              Json?        @map("summary_jsonb") // resultado do dry-run / commit
  createdBy            String       @map("created_by")
  createdAt            DateTime     @default(now()) @map("created_at")
  updatedAt            DateTime     @updatedAt @map("updated_at")

  organization        Organization        @relation(fields: [organizationId], references: [id])
  integrationAccount  IntegrationAccount? @relation(fields: [integrationAccountId], references: [id])
  items               ImportItem[]

  @@index([organizationId, status])
  @@map("import_jobs")
}

model ImportItem {
  id           String          @id @default(uuid())
  importJobId  String          @map("import_job_id")
  sourceType   String          @map("source_type") // board | list | card | checklist | comment | attachment
  sourceId     String          @map("source_id")
  targetType   String?         @map("target_type") // unit | area | activity | etc.
  targetId     String?         @map("target_id")
  status       ImportItemStatus @default(pending)
  errorMessage String?         @map("error_message")
  createdAt    DateTime        @default(now()) @map("created_at")

  importJob ImportJob @relation(fields: [importJobId], references: [id])

  @@index([importJobId, status])
  @@map("import_items")
}
```

---

## Migrations SQL adicionais (raw)

```sql
-- Habilitar extensões no migration inicial
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
CREATE EXTENSION IF NOT EXISTS "pgvector";

-- Campo vector para embeddings futuros de atividades
ALTER TABLE activities ADD COLUMN IF NOT EXISTS embedding vector(1536);
CREATE INDEX IF NOT EXISTS activities_embedding_idx ON activities USING ivfflat (embedding vector_cosine_ops);

-- Índice GIN para jsonb
CREATE INDEX IF NOT EXISTS activities_metadata_gin ON activities USING gin (metadata_jsonb);
CREATE INDEX IF NOT EXISTS activity_templates_config_gin ON activity_templates USING gin (config_jsonb);
CREATE INDEX IF NOT EXISTS activity_events_payload_gin ON activity_events USING gin (payload_jsonb);
```

---

## Notas de design

- **UUIDs em toda parte**: nunca expor IDs sequenciais via API
- **`deleted_at` soft delete** em Organization, Unit, User, Membership, ActivityTemplate, Activity, ActivityComment, ActivityAttachment — nunca deletar fisicamente essas entidades
- **`activity_events` é imutável** — nunca fazer UPDATE ou DELETE nessa tabela
- **`auth_jsonb` em IntegrationAccount** deve ser encriptado em repouso (usar `pg_crypto` ou encriptação na camada de aplicação antes de salvar)
- **`metadata_jsonb`** em Activity é aberto por design — o schema específico é definido pelo template e validado no application layer, não no banco

---
applyTo: "packages/db/**/*.ts,packages/db/prisma/**/*.prisma,packages/db/prisma/migrations/**"
---

# Instruções — Database (Prisma + PostgreSQL)

Aplicam-se a `packages/db/`, incluindo `schema.prisma`, migrations e código TypeScript.

## Princípios

- **Schema-first**: o `schema.prisma` é a fonte da verdade do modelo de dados.
- **Migrations explícitas**: `prisma migrate dev` gera SQL versionado em `prisma/migrations/`.
- **Banco**: PostgreSQL 16 com `pgvector` (para embeddings futuros).
- **Soft delete** via `deletedAt` em entidades com lifecycle longo (Unit, Area, ActivityTemplate, Activity, etc.).

## Convenções de nomenclatura

- **Tabelas**: `snake_case` plural (`activities`, `unit_areas`, `activity_checklist_items`)
- **Colunas**: `snake_case` (`created_at`, `visibility_mode`, `due_at`)
- **Enums Postgres**: prefixar com tipo (`activity_status`, `user_role`, `scope_type`)
- **Timestamps**: sempre `created_at` e `updated_at` com `DEFAULT now()`
- **IDs**: `UUID` v4 — nunca sequencial integer

No Prisma, mapear com `@@map` e `@map`:

```prisma
model Activity {
  id           String   @id @default(uuid())
  organizationId String @map("organization_id")
  createdAt    DateTime @default(now()) @map("created_at")
  updatedAt    DateTime @updatedAt @map("updated_at")
  @@map("activities")
}
```

## Migrações seguras

- **Adicionar coluna NOT NULL** com default: OK. Sem default em tabela grande: criar como nullable, backfill, depois enforcing.
- **Renomear coluna**: criar nova → backfill → migrar app → remover antiga (2 deploys).
- **Drop tabela/coluna**: nunca em hot patch; sempre planejado em sprint.
- **Adicionar enum value**: OK. **Remover**: requer migração com defaults e ajuste de app.
- Migrações testadas em dev (`prisma migrate dev`) → aplicadas em prod (`prisma migrate deploy`).

### Quando o ambiente local não dá acesso à porta 5432 (Docker isolado)

Aplicar SQL direto via container:

```bash
docker exec gym-postgres-1 psql -U gymops -d gymops -c "<DDL aqui>"
# Em seguida regenerar o client no host:
pnpm --filter @gymops/db generate
```

Documentar no histórico da PR que a migração foi aplicada via `psql` direto (workaround Windows + Docker).

## Soft delete vs hard delete

- **Soft delete** (`deletedAt`) em entidades com histórico/referências: `Unit`, `Area`, `ActivityTemplate`, `Activity`, `Membership`.
- **Hard delete** em entidades efêmeras: `Session`, `ActivityChecklistItem` (quando o pai é deletado), tokens expirados.
- Listagens sempre filtram `deletedAt: null` por padrão.

## JSON com double cast (TS2352)

Prisma `Json` columns exigem cast em duas etapas:

```typescript
// Write
data: { metadata: value as unknown as Prisma.InputJsonValue }   // ✅
data: { metadata: value as Prisma.InputJsonValue }              // ❌ TS2352

// Read-back
const config = template.config as unknown as TemplateConfig;    // ✅
const config = template.config as TemplateConfig;               // ❌
```

## Índices obrigatórios

Criar índice composto para padrões de query frequentes:

- `activities(organization_id, unit_id, status, due_at)` — filtros principais
- `memberships(user_id, organization_id, scope_type, scope_id)` — resolução de RBAC
- `activity_events(activity_id, created_at)` — histórico em ordem
- `activity_assignees(activity_id, user_id)` — visão pessoal
- `audit_logs(organization_id, created_at desc)` — auditoria paginada
- `notification_deliveries(organization_id, channel, created_at desc)` — log
- `invitations(token_hash)` — lookup público por token

Marcar no schema com `@@index([...])` ou criar via raw SQL na migration.

## Enums

- Manter sincronizados com TypeScript: enum Prisma → tipo gerado no client → consumido no app.
- Adicionar valor: rodar migration e regenerar client; código que usa exaustivo (`switch`) precisa ser atualizado.
- Remover valor: planejar — atualizar todas as rows existentes antes; backwards-incompatível.

## Seed (`prisma/seed.ts`)

- **Dev/test only**: nunca rodar `seed` em produção.
- Cria org SkyFit, 3 unidades, 6 áreas, 24 templates, usuário admin (`admin@skyfit.com` / `gymops123`).
- Idempotente: usar `upsert` para não duplicar em runs repetidos.
- Senha do seed sempre via `bcrypt.hash('gymops123', 10)`.

## Polimorfismo de Membership

`memberships(scope_type, scope_id, role)` é polimórfico — `scope_type` indica se `scope_id` referencia `organization`, `unit` ou `area`.

```typescript
// ✅ Correto — query direta
db.membership.findMany({
  where: { scopeType: 'unit', scopeId: unitId, deletedAt: null }
});

// ❌ Errado — Unit não tem campo memberships
unit.memberships
```

## Trabalhar com `pgvector`

- Tipo `vector` não é nativo do Prisma. Criar via raw SQL na migration:

```sql
CREATE EXTENSION IF NOT EXISTS vector;
ALTER TABLE activities ADD COLUMN embedding vector(1536);
CREATE INDEX activities_embedding_idx ON activities USING ivfflat (embedding vector_cosine_ops);
```

- Acessar via `$queryRawUnsafe` ou `$queryRaw` com tagged template.

## Audit log e fire-and-forget

Modelo `AuditLog` é gravado por `lib/audit.ts` em fire-and-forget. **Nunca quebra fluxo principal.** Se falhar (DB indisponível), engole exceção silenciosamente.

## Geração do client e exports

- `packages/db/prisma/schema.prisma` define o modelo
- `pnpm --filter @gymops/db generate` gera client em `node_modules/.pnpm/.../client`
- `packages/db/src/index.ts` re-exporta `PrismaClient`, `Prisma`, `Enums`
- Consumidores fazem `import { db, Prisma } from '@gymops/db'`

Nunca importar do `@prisma/client` direto fora do package `db`.

## Validações de ambiente

`DATABASE_URL` é obrigatória. Em produção, usar pooled connection do Neon. Em dev, `postgresql://gymops:gymops_dev@localhost:5432/gymops`.

`TEST_DATABASE_URL` opcional — se ausente, helpers usam `DATABASE_URL`. Para CI, considerar banco separado.

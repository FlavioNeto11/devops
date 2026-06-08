# Agente: Database Prisma

> **Tipo**: Especialista em banco de dados
> **Quando usar**: Mudança em `schema.prisma`, criação de migration, índices, JSONB, enums, seed.

## Missão

Modelar dados de forma segura, performática e versionável. Garantir migrations idempotentes, índices certos e que o client gerado reflete o schema.

## Quando usar

- Adicionar/alterar/remover entidade Prisma
- Criar migration (incluindo workarounds para Docker no Windows)
- Adicionar/ajustar índice composto
- Modelar campo JSONB
- Alterar enum
- Atualizar seed (sem rodar em prod)

## Quando NÃO usar

- Endpoint que consome o schema (use `backend-fastify`)
- UI consumindo o dado (use `frontend-next`)
- Decisão de RBAC sobre o dado (use `rbac-security`)

## Itens do backlog que requerem mudança no schema

| ID | Sprint | Mudança necessária |
|---|---|---|
| BUG-008 | 21 | `Session.refreshToken` → `refreshTokenHash` (sha256 do token) |
| FEAT-006 | 20 | Nova tabela `import_sources(organizationId, provider, externalId, activityId)` com `@@unique` |
| OPS-007 | pós go-live | Índices de performance em `activities`, `activity_events`, `notification_deliveries` |

Ver detalhes em [`docs/backlog.md`](../../docs/backlog.md) e design em [`docs/implementation-plan.md`](../../docs/implementation-plan.md) (PR-C.1 e PR-D).

## Arquivos que pode alterar

- `packages/db/prisma/schema.prisma`
- `packages/db/prisma/migrations/` (criar migration)
- `packages/db/prisma/seed.ts`
- `apps/api/src/test/helpers.ts` (TRUNCATE list quando nova tabela)
- `docs/data-model.md`

**Não altera**: rotas API, telas de frontend, lógica de RBAC, CI/CD.

## Riscos que precisa observar

| Risco | Impacto | Mitigação |
|---|---|---|
| BUG-008: renomear `refreshToken` → `refreshTokenHash` em hot patch | Todas as sessões ativas invalidadas sem aviso | Coordenar maintenance window; comunicar via `docs-roadmap` |
| Migration no Docker no Windows pode não conectar em `localhost:5432` | Migration não aplica | Usar workaround documentado: `docker exec gym-postgres-1 psql ...` |
| `import_sources` sem `@@unique` → dedupe não funciona | Segundo import duplica atividades | Definir `@@unique([organizationId, provider, externalId])` antes de criar |
| Seed desatualizado após `bootstrapOrganization()` (FEAT-004) | Divergência entre seed e endpoint público | Refatorar `seed.ts` para chamar `bootstrapOrganization()` (ver `docs/bootstrap-spec.md`) |

## Arquivos que deve ler

1. [`.github/instructions/database.instructions.md`](../instructions/database.instructions.md)
2. `packages/db/prisma/schema.prisma`
3. `packages/db/prisma/migrations/`
4. `packages/db/prisma/seed.ts`
5. [`docs/data-model.md`](../../docs/data-model.md)
6. [`docs/architecture.md`](../../docs/architecture.md) seção banco

## Stack

- Prisma (schema-first)
- PostgreSQL 16 + pgvector
- Migrations via `prisma migrate dev` / `prisma migrate deploy`
- Seed em `prisma/seed.ts`

## Regras

### Nomenclatura

- Tabelas: `snake_case` plural (`activities`, `unit_areas`)
- Colunas: `snake_case` (`created_at`, `visibility_mode`)
- Enums Postgres: prefixar com tipo (`activity_status`)
- Timestamps: `created_at` e `updated_at` com `DEFAULT now()`
- IDs: UUID v4

### Schema Prisma

```prisma
model Example {
  id             String   @id @default(uuid())
  organizationId String   @map("organization_id")
  name           String
  metadata       Json?
  deletedAt      DateTime? @map("deleted_at")
  createdAt      DateTime @default(now()) @map("created_at")
  updatedAt      DateTime @updatedAt @map("updated_at")
  organization   Organization @relation(fields: [organizationId], references: [id])
  @@map("examples")
  @@index([organizationId, deletedAt])
}
```

### Migrations seguras

- **Adicionar coluna**: NOT NULL com default = OK. Sem default em tabela grande: criar nullable → backfill → enforce.
- **Renomear coluna**: criar nova → backfill → migrar app → remover antiga (2 deploys)
- **Drop**: nunca em hot patch
- **Adicionar enum value**: OK
- **Remover enum value**: planejar (backfill antes)

### Workaround Windows + Docker

Se `prisma migrate dev` não conecta em `localhost:5432`:

```bash
docker exec gym-postgres-1 psql -U gymops -d gymops -c "<DDL aqui>"
# Em seguida regenerar o client no host:
pnpm --filter @gymops/db generate
```

Documentar no PR que migração foi aplicada via psql direto.

### Soft delete

- Entidades com histórico: `deletedAt DateTime?` + filtro `where: { deletedAt: null }` por padrão
- Entidades efêmeras: hard delete

### JSONB com double cast

```typescript
// Write
data: { config: value as unknown as Prisma.InputJsonValue }
// Read-back
template.config as unknown as TemplateConfig
```

### Índices obrigatórios

Adicionar `@@index` para padrões frequentes:

- `activities(organization_id, unit_id, status, due_at)`
- `memberships(user_id, organization_id, scope_type, scope_id)`
- `activity_events(activity_id, created_at)`
- `audit_logs(organization_id, created_at desc)`
- `notification_deliveries(organization_id, channel, created_at desc)`
- `invitations(token_hash)`

### Polimorfismo de Membership

`memberships(scope_type, scope_id)` é polimórfico — sem relação Prisma em `Unit`/`Area`.

```typescript
db.membership.findMany({ where: { scopeType: 'unit', scopeId, deletedAt: null } })  // ✅
unit.memberships  // ❌ não existe
```

### Seed

- **Dev/test only** — nunca rodar em produção
- Idempotente: usar `upsert`
- Senha sempre `bcrypt.hash('gymops123', 10)`

## Antirregras

- Sem cast direto para `Prisma.InputJsonValue` (sempre double cast)
- Sem `unit.memberships` (não existe)
- Sem rodar seed em produção
- Sem drop/rename em hot patch
- Sem `prisma db push` em produção (sempre migrate)
- Sem importar `@prisma/client` direto fora do package `db`

## Checklist de conclusão

- [ ] Schema atualizado e válido (`prisma validate`)
- [ ] Migration criada e aplicada localmente
- [ ] Client regenerado (`prisma generate`)
- [ ] Índices apropriados para padrões de query
- [ ] Soft delete onde aplicável
- [ ] `docs/data-model.md` atualizado
- [ ] `apps/api/src/test/helpers.ts` (TRUNCATE list) atualizado se nova tabela
- [ ] Seed ainda funciona

## Validação esperada

```bash
pnpm --filter @gymops/db generate
pnpm --filter @gymops/db migrate:deploy
pnpm --filter @gymops/api typecheck  # garantir que client reflete
pnpm --filter @gymops/api test
```

## Handoff esperado

Após migration de nova tabela (`import_sources`) → passar para **`integrations`** implementar a lógica de dedupe no `processor.ts`. Após BUG-008 (hash) → passar para **`backend-fastify`** atualizar o lookup de sessão. Sempre atualizar `docs/data-model.md` via `docs-roadmap`.

## Sinaliza para outros agentes quando

- Endpoint que consume nova tabela → `backend-fastify`
- RBAC sobre nova entidade → `rbac-security`
- UI consumindo nova entidade → `frontend-next`
- Documentar no `docs/data-model.md` → `docs-roadmap`

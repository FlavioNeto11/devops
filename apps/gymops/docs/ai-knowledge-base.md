# Base de Conhecimento para Agentes — GymOps

**Última atualização**: 2026-05-16

> **Propósito**: Índice resumido para agentes carregarem contexto mínimo sem ler todos os docs. Cada seção tem 5-10 linhas + link para o doc canônico quando precisar de detalhe.

---

## 1. Visão do produto

**GymOps** = plataforma de gestão operacional multiunidade que substitui o Trello em redes com várias unidades físicas. Contexto: rede SkyFit, ~300 boards Trello a migrar.

- Modelo: `Organização → Unidade → Área → Atividade`
- Não é clone de Trello — RBAC granular por escopo, visões hierárquicas, importador legado
- Idioma: pt-BR

**Detalhe**: [`docs/PRD.md`](PRD.md)

---

## 2. Stack

| Camada | Tecnologia |
|---|---|
| Frontend | Next.js 14 App Router + React 18 + Tailwind + shadcn/Radix |
| Backend | Node 20 + Fastify 4 + TypeScript 5 strict |
| ORM | Prisma (schema-first) |
| Banco | PostgreSQL 16 + pgvector |
| Cache/Filas | Redis + BullMQ |
| Storage | Cloudflare R2 (S3-compat) |
| IA | OpenAI (structured outputs) |
| Auth | JWT + Refresh cookie + Google OAuth |
| Notif | web-push VAPID + Nodemailer + Twilio |
| Deploy | Vercel + Render + Neon + Upstash |

**Detalhe**: [`docs/architecture.md`](architecture.md)

---

## 3. Módulos

1. **Operação diária** ✅ — visão pessoal, visão unidade, drawer de atividade, painel geral
2. **Administração** ✅ — perfil, organização, unidades, áreas, equipe, templates (Sprints 9-11)
3. **Visão transversal** ✅ — central global de atividades, ações em lote (Sprint 12)
4. **Importação / integrações** ⚠️ — Trello OK; gov de WhatsApp parcial (Sprints 13-14)
5. **Automação / notificações** ✅ — recorrência, e-mail, push, WhatsApp (Sprint 14)
6. **IA estruturada** ✅ — 4 features controladas (Sprint 6)

**Detalhe**: [`docs/PRD.md`](PRD.md) seção Módulos

---

## 4. Entidades principais

| Entidade | Função |
|---|---|
| Organization | Locatário SaaS |
| Unit | Local físico (unidade) |
| Area | Recorte funcional (Admin, Marketing, Coord, Estrutura, Líder, Financeiro) |
| Activity | Item executável com status, prazo, responsável, checklist, anexos |
| ActivityTemplate | Modelo por área com checklist sugerido |
| Membership | Vínculo usuário↔escopo com role |
| RecurrenceRule | Regra de geração periódica |
| ImportJob | Job de importação Trello |
| Invitation | Convite com token SHA-256 |
| AuditLog | Registro de ações administrativas |
| NotificationDelivery | Log de envio por canal |
| SavedView | View salva com filtros |
| OrganizationPlan | Plano (sem billing ainda) |

**Detalhe**: [`docs/data-model.md`](data-model.md)

---

## 5. Rotas principais (frontend)

### Autenticadas
- `/dashboard` — painel geral (owner, org_manager)
- `/me` — visão pessoal (todos)
- `/units/:id` — visão unidade
- `/activities` — central de atividades (admin)
- `/profile` — perfil próprio
- `/settings/organization` — owner
- `/settings/units` — admin
- `/settings/areas` — admin
- `/settings/team` — admin
- `/settings/templates` — admin
- `/settings/recurrences` — admin
- `/settings/imports` — admin (histórico)
- `/settings/import` — admin (wizard ativo)
- `/settings/integrations` — admin
- `/settings/notifications` (= /settings) — todos
- `/settings/audit` — owner

### Públicas
- `/login`
- `/auth/callback`
- `/invite/[token]` — aceitar convite
- `/setup` — wizard nova organização

**Detalhe**: [`docs/navigation-map.md`](navigation-map.md)

---

## 6. Endpoints principais (backend, REST)

- `/auth/*` — login, refresh, logout, google/start, google/callback, consume
- `/me/*` — profile, avatar/presign, avatar
- `/organizations/*` — get, update, create (wizard), slug-available
- `/units/*` — CRUD + reorder áreas + archive
- `/areas/*` — CRUD + archive
- `/memberships/*` — CRUD + invite-by-email
- `/invitations/*` — create, list, get-by-token, accept, cancel
- `/activity-templates/*` — CRUD + duplicate
- `/activities/*` — CRUD + bulk-update + bulk-assign + export
- `/recurrences/*` — list + update + delete
- `/saved-views/*` — CRUD
- `/audit-logs/*` — list (owner only)
- `/imports/*` — JSON, API, preview, mapping, commit, items, retry, cancel
- `/integrations/*` — list, trello/start, trello/connect, trello/health, trello/reconnect, whatsapp/status
- `/notifications/*` — preferences, subscribe, vapid-key, test, deliveries
- `/dashboards/*` — overview, unit
- `/ai/*` — draft, checklist-suggest, delay-analyze, daily-summary

**Detalhe**: [`docs/api-spec.md`](api-spec.md)

---

## 7. Sprints (estado em 2026-05-16)

| Sprint | Tema | Estado |
|---|---|---|
| 1 | Auth, Org/Unit/Area, RBAC base | ✅ |
| 2 | Activities + Checklists + Comentários + Anexos | ✅ |
| 3 | RBAC + Visões | ✅ |
| 4 | Templates + Recorrência + Notificações | ✅ |
| 5 | Trello import + WhatsApp | ✅ |
| 6 | IA + Mobile | ✅ |
| 7 | R2, OAuth, gaps | ✅ |
| 8 | Hardening | ✅ |
| 9-16 | Camada administrativa de frontend | ✅ |

**Detalhe**: [`docs/sprints.md`](sprints.md) e [`docs/status.md`](status.md)

---

## 8. Gaps conhecidos

- WhatsApp produção (sandbox OK; produção exige aprovação Meta)
- E2E suite ainda em draft (reescrita em Sprint 15)
- Índices fines de Postgres
- Observabilidade (Sentry, queue stats endpoint)
- RBAC `canCreate` frontend bloqueia executor (backend permite)
- Bug de conectividade DB no host Windows (Docker isolation)

**Detalhe**: [`docs/status.md`](status.md) seção "Gap principal"

---

## 9. Regras de RBAC (resumo)

```
owner > org_manager > unit_manager > area_leader > executor > viewer
```

- Sempre validar no backend (frontend é UX)
- `visibility_mode = restricted` quebra herança
- 404 vs 403: 404 em risco de enumeração
- Proteção do último owner: nunca remover/rebaixar
- Audit log em mudanças sensíveis

**Detalhe**: [`docs/rbac.md`](rbac.md) (algoritmo) e [`docs/rbac-matrix.md`](rbac-matrix.md) (matriz canônica)

---

## 10. Comandos do dia a dia

```bash
docker compose up -d postgres redis      # infra local
pnpm install
pnpm --filter @gymops/db generate
pnpm --filter @gymops/db migrate:deploy
pnpm --filter @gymops/db seed            # admin@skyfit.com / gymops123
pnpm dev                                  # API + Web em paralelo
pnpm lint && pnpm typecheck               # validação
pnpm --filter @gymops/api test
pnpm --filter @gymops/web build
pnpm --filter @gymops/web test:e2e
```

---

## 11. Armadilhas do codebase

```typescript
// Prisma JSON: double cast
value as unknown as Prisma.InputJsonValue   // ✅
value as Prisma.InputJsonValue              // ❌ TS2352

// ActivityTemplate soft delete
where: { deletedAt: null }    // ✅
where: { isActive: true }     // ❌ não existe

// bcryptjs default import
import bcrypt from 'bcryptjs'          // ✅
import { hash } from 'bcryptjs'        // ❌

// Lucide aria-label
<Icon aria-label="x" />    // ✅
<Icon title="x" />         // ❌

// WhatsApp posicional
sendWhatsApp(to, message)       // ✅
sendWhatsApp({ to, body })      // ❌

// Memberships polimórficas
db.membership.findMany({ where: { scopeType, scopeId } })  // ✅
unit.memberships  // ❌ não existe no schema

// ESM imports backend
from './foo.js'    // ✅
from './foo'       // ❌

// Migrations Windows + Docker
// localhost:5432 inacessível do host; usar:
docker exec gym-postgres-1 psql -U gymops -d gymops -c "<DDL>"
pnpm --filter @gymops/db generate
```

**Detalhe**: [`CLAUDE.md`](../CLAUDE.md) seção Armadilhas

---

## 12. Links canônicos por tópico

| Tópico | Link |
|---|---|
| Estado real | [`docs/status.md`](status.md) |
| Produto | [`docs/PRD.md`](PRD.md) |
| Roadmap | [`docs/product-roadmap.md`](product-roadmap.md) |
| Arquitetura | [`docs/architecture.md`](architecture.md) |
| Banco | [`docs/data-model.md`](data-model.md) |
| API | [`docs/api-spec.md`](api-spec.md) |
| RBAC algoritmo | [`docs/rbac.md`](rbac.md) |
| RBAC matriz | [`docs/rbac-matrix.md`](rbac-matrix.md) |
| Integrações | [`docs/integrations.md`](integrations.md) |
| Telas admin | [`docs/admin-ui-blueprint.md`](admin-ui-blueprint.md) |
| Navegação | [`docs/navigation-map.md`](navigation-map.md) |
| E2E flows | [`docs/e2e-business-flows.md`](e2e-business-flows.md) |
| Sprints | [`docs/sprints.md`](sprints.md) |
| Runbook | [`docs/runbook.md`](runbook.md) |
| Agentes | [`AGENTS.md`](../AGENTS.md) |
| Operação agentes | [`docs/ai-agent-operating-model.md`](ai-agent-operating-model.md) |
| Roteamento agentes | [`docs/agent-task-routing.md`](agent-task-routing.md) |
| Como usar | [`docs/how-to-use-ai-agents.md`](how-to-use-ai-agents.md) |

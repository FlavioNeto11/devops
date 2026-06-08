# FR — GymOps

- **Rota**: `/gymops` · **Repo**: `apps/gymops` · **Stack**: Next.js 14 / Fastify + TS / Prisma + Postgres+pgvector / Redis+BullMQ · **Estado**: ~95%

## Propósito
Gestão operacional multiunidade para redes (ex.: academias): substitui Trello com modelo próprio
Organização → Unidade → Área → Atividade, com checklists, recorrências e IA assistiva.

## Atores
Owner/org_manager, unit_manager, area_leader, operador (assignee/watcher) — RBAC escopado.

## Integrações
OpenAI (gpt-5-nano via SDK nativo), Google OAuth (login), Trello (import), WhatsApp/Twilio, R2
(anexos), web-push VAPID. Keycloak SSO: **a adicionar** (Fase 2.E, aditivo).

## Estado (pronto vs falta)  ← seed do módulo PM
> Canônico em `apps/gymops/docs/status.md` + `docs/backlog.md`.

### Pronto (Sprints 1–21)
- Auth email/senha + Google OAuth + refresh; RBAC escopado (org/unit/area).
- Setup de org (wizard) + bootstrap (6 áreas + 24 templates).
- Atividades: CRUD + checklist + comentários + anexos + histórico; Central (scroll infinito, views, bulk, export CSV).
- Admin: equipe escopada, unit_areas, convites.
- Integrações: import Trello (dedupe), WhatsApp; workers BullMQ com degradação graciosa; R2.
- IA: criar atividade/checklist + chat assistivo (gpt-5-nano); checklist sugerido vinculado.
- E2E Playwright; CI com variante `build-gymops` (base path `/gymops`).

### Falta
- [bug] **BUG-010 CORS** localhost hardcoded como fallback (usar `ALLOWED_ORIGINS`) — P1
- [evolution] **OPS-005** `.env.docker.public.example` separado — P1
- [feature] FEAT-010/011/012/013 (timezone, views compartilhadas, filtros de auditoria) — P2
- [evolution] OPS-006 Sentry · OPS-007 índices Postgres · OPS-008 `/admin/queues/stats` · OPS-009 OpenAPI — P2

## Perguntas em aberto
- Prioridade do SSO Keycloak vs. dívidas P2.

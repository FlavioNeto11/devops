---
title: "GymOps — Manual para Claude Code"
status: canonical
applies_to: [gymops]
updated: 2026-05-17
language: pt-BR
---

# GymOps — Plataforma de Gestão Operacional Multiunidade

> **⚡ Para começar:** leia primeiro [`AGENTS.md`](AGENTS.md) — contrato interoperável entre todos os agentes (Claude Code, Copilot Chat, etc). Este arquivo (`CLAUDE.md`) traz as regras detalhadas do projeto e armadilhas conhecidas.
>
> **Contexto da plataforma:** [`../../CLAUDE.md`](../../CLAUDE.md) (monorepo) e [`../../AGENTS.md`](../../AGENTS.md) (fronteiras); máquina: [`~/.claude/CLAUDE.md`](C:\Users\Administrator\.claude\CLAUDE.md). Padrão desta camada: [`../../docs/standards/meta-doc-standard.md`](../../docs/standards/meta-doc-standard.md).

## O que é este projeto

Substituição do Trello para gestão operacional de redes com múltiplas unidades físicas (contexto inicial: rede de academias SkyFit, ~300 boards Trello a migrar). O produto **não é um clone de Trello** — tem modelo próprio centrado em **Organização → Unidade → Área → Atividade**.

## Sinergia com Copilot Chat e outros agentes

Este repositório tem infraestrutura compartilhada de agentes:

- **[`AGENTS.md`](AGENTS.md)** — contrato interoperável (raiz). Em conflito, este arquivo prevalece sobre regras locais.
- **[`.github/copilot-instructions.md`](.github/copilot-instructions.md)** — instruções globais para o GitHub Copilot Chat (VS Code Insiders e Stable).
- **[`.github/instructions/*.instructions.md`](.github/instructions/)** — regras path-specific aplicadas automaticamente pelo Copilot (frontend, backend, database, rbac, tests, docs, integrations).
- **[`.github/prompts/*.prompt.md`](.github/prompts/)** — prompts reutilizáveis para tarefas comuns (executar sprint, criar tela admin, revisar segurança, etc).
- **[`.github/agents/*.agent.md`](.github/agents/)** — perfis especializados (orquestrador, product-admin, frontend, backend, rbac-security, etc).
- **[`docs/agent-skills/`](docs/agent-skills/)** — skills procedurais reutilizáveis.
- **[`docs/ai-agent-operating-model.md`](docs/ai-agent-operating-model.md)** — como Copilot e Claude trabalham juntos.
- **[`docs/agent-task-routing.md`](docs/agent-task-routing.md)** — matriz de roteamento de tarefas → agentes.
- **[`docs/how-to-use-ai-agents.md`](docs/how-to-use-ai-agents.md)** — guia para humanos.

**Como Claude Code deve respeitar essa estrutura:**
- Sempre começar lendo `docs/status.md` (estado atual) e `AGENTS.md` (contrato).
- Quando o arquivo alvo se encaixar em um path coberto por `.github/instructions/`, considerar as regras dessas instruções como aplicáveis também a Claude (não apenas Copilot).
- Quando o usuário pedir uma tarefa que mapeia para um prompt em `.github/prompts/`, seguir o roteiro descrito ali.
- Atualizar `docs/status.md` ao final de qualquer mudança não-trivial.

---

## Ordem oficial de leitura da documentação

Leia na ordem abaixo antes de qualquer implementação:

1. [`docs/PRD.md`](docs/PRD.md) — escopo funcional completo e métricas de sucesso
2. [`docs/status.md`](docs/status.md) — **estado atual e gaps (ler sempre antes de implementar)**
3. [`docs/architecture.md`](docs/architecture.md) — stack, decisões técnicas e diagrama
4. [`docs/data-model.md`](docs/data-model.md) — esquema de banco e relações
5. [`docs/rbac.md`](docs/rbac.md) — algoritmo de permissões e herança de escopos
6. [`docs/rbac-matrix.md`](docs/rbac-matrix.md) — **matriz canônica de permissões — fonte da verdade**
7. [`docs/api-spec.md`](docs/api-spec.md) — todos os endpoints REST com contratos
8. [`docs/ai-features.md`](docs/ai-features.md) — integração de IA (4 recursos controlados)
9. [`docs/integrations.md`](docs/integrations.md) — integrações externas (SMTP, Push VAPID, WhatsApp, Trello)
10. [`docs/sprints.md`](docs/sprints.md) — histórico de sprints 1-8 + plano 9-16
11. [`docs/wireframes.md`](docs/wireframes.md) — wireframes textuais das telas existentes

**Para implementar telas administrativas** (Sprints 9-21), ler também:

12. [`docs/product-roadmap.md`](docs/product-roadmap.md) — roadmap por horizonte e critérios de saída
13. [`docs/admin-ui-blueprint.md`](docs/admin-ui-blueprint.md) — especificação de cada tela administrativa (inclui seção S18–S21)
14. [`docs/navigation-map.md`](docs/navigation-map.md) — mapa de navegação por papel
15. [`docs/e2e-business-flows.md`](docs/e2e-business-flows.md) — critérios de aceite por fluxo
16. [`docs/backlog.md`](docs/backlog.md) — **backlog P0/P1/P2 com IDs estáveis — ler sempre antes de implementar**
17. [`docs/implementation-plan.md`](docs/implementation-plan.md) — ordem recomendada de PRs (S18→S21)

**Arquivo de tarefas da sprint atual**: `tasks/sprint-18.md` (S18 em execução — ver `docs/status.md`)

---

## Estado atual do projeto (2026-05-17)

**⚠️ ATENÇÃO**: versões anteriores deste arquivo afirmavam "produto 100%". Isso é incorreto. Análise estática de 2026-05-17 identificou bugs P0 em fluxos críticos (ver [`docs/backlog.md`](docs/backlog.md)) e telas administrativas com profundidade rasa. O produto está em **Sprints 18–21** (estabilização + go-live). Ver [`docs/status.md`](docs/status.md) para o estado real.

| Sprint | Conteúdo | Estado |
|--------|----------|--------|
| Sprint 1 | Auth email/senha, Org/Unit/Area, RBAC base | ✅ Concluída |
| Sprint 2 | Activities CRUD, checklists, comentários, histórico | ✅ Concluída |
| Sprint 3 | Dashboard, visão pessoal, painel geral | ✅ Concluída |
| Sprint 4 | Templates, recorrência, notificações | ✅ Concluída |
| Sprint 5 | Trello import pipeline, WhatsApp | ✅ Concluída |
| Sprint 6 | IA estruturada + Mobile | ✅ Concluída |
| Sprint 7 | R2, OAuth, todos os módulos funcionais | ✅ Concluída |
| Sprint 8 | Hardening: segurança, CI/CD, E2E, atomicidade | ✅ Concluída |
| Sprint 9–16 | Camada administrativa de frontend (perfil, org, unidades, áreas, equipe, convites, recorrências, imports admin, central de atividades, auditoria) | ✅ entregue, com **profundidade rasa** em equipe/unit_areas/central — gaps no backlog |
| Sprint 17 | Modo Tutorial Guiado (onboarding + tours contextuais + Central de Ajuda em `/help`) | ✅ Concluída |
| **Sprint 18** | **Estabilização crítica**: corrigir BUG-001..007 (prioridade PT/EN, bulk update, export CSV, senha mínima, login por área, canCreate, hasUnitRole) | 🚧 Planejada |
| **Sprint 19** | **Profundidade administrativa**: equipe escopada (FEAT-001), unit_areas UI (FEAT-002), central acionável (FEAT-003), /setup canônico (FEAT-004) | 🚧 Planejada |
| **Sprint 20** | **Operação e integrações**: health/reconnect UI (FEAT-005), import dinâmico + dedupe (FEAT-006), org branding (FEAT-007), área visibilityDefault (FEAT-008) | 🚧 Planejada |
| **Sprint 21** | **QA e readiness**: E2E em PR (OPS-001), build /gymops no CI (OPS-002), healthchecks Docker (BUG-009), CORS via env (BUG-010), smoke por perfil (OPS-004) | 🚧 Planejada |

**Estado canônico**: ver [`docs/status.md`](docs/status.md) (sempre ler antes de implementar).
**Backlog priorizado**: ver [`docs/backlog.md`](docs/backlog.md) (P0/P1/P2 com IDs estáveis).
**Roadmap por horizonte**: ver [`docs/product-roadmap.md`](docs/product-roadmap.md).
**Modo tutorial**: ver [`docs/tutorial-mode.md`](docs/tutorial-mode.md) antes de criar tela nova — toda tela administrativa deve ter ao menos um tutorial no registry.

---

## Estrutura do monorepo

```
/
├── apps/
│   ├── web/          # Next.js App Router (frontend + PWA)
│   └── api/          # Fastify + TypeScript (backend REST)
├── packages/
│   ├── db/           # Prisma schema, migrations, seed
│   ├── shared/       # tipos TypeScript compartilhados
│   └── ui/           # componentes Tailwind reutilizáveis
├── docs/             # documentação do produto e técnica
├── tasks/            # breakdown de sprints em tarefas
└── CLAUDE.md
```

---

## Stack obrigatória (não negociar no MVP)

| Camada | Tecnologia |
|---|---|
| Frontend | Next.js 14+ App Router, React 18+, Tailwind CSS |
| Backend | Node.js 20+, Fastify 4+, TypeScript 5+ |
| ORM | Prisma (schema-first) |
| Banco | PostgreSQL 16+ com extensão `pgvector` |
| Cache/Filas | Redis (BullMQ para jobs) |
| Storage | Cloudflare R2 (SDK S3-compatível) |
| IA | OpenAI API (structured outputs com `json_object`) |
| Auth | JWT + Google OAuth 2.0 (fetch nativo, sem dep googleapis) |
| Deploy | Vercel (frontend), Render (API), Neon (Postgres), Upstash (Redis) |
| Notificações | web-push VAPID (não FCM), Nodemailer/SMTP, Twilio (WhatsApp) |

---

## Regras de desenvolvimento

### Layout e responsividade — REGRA CRÍTICA

**Todo componente, página e modal deve funcionar em desktop E mobile.**

- Usar breakpoints `md:` do Tailwind para adaptar: mobile-first base, desktop com `md:` overrides
- Nunca remover ou alterar classes sem prefixo `md:` — isso quebra o desktop
- Sidebar: `fixed` overlay no mobile (`z-50`, slide-in), `md:relative` estático no desktop
- Padding: sempre `p-3 md:p-6` (nunca só `p-6`)
- Tabelas: sempre envolver em `overflow-x-auto`
- Modais/drawers: sempre `max-h-[90vh] overflow-y-auto`
- Flex layouts horizontais: usar `flex-wrap` ou `overflow-x-auto` em mobile
- Tabs horizontais com texto longo: `overflow-x-auto` + `whitespace-nowrap` nos botões
- Nunca usar `w-[valor fixo]` sem prefixo `md:` em containers principais
- Testar visualmente em viewport 375px (iPhone SE) e 1280px (laptop) antes de marcar como pronto

### Convenções de código

- TypeScript strict mode em todo projeto
- Sem `any` — usar tipos explícitos ou `unknown`
- Validação de entrada com **Zod** em todos os endpoints Fastify
- Testes de integração com banco real (não mockar PostgreSQL)
- Variáveis de ambiente via `process.env` com validação Zod no startup

### Armadilhas conhecidas neste codebase

```typescript
// Prisma InputJsonValue — SEMPRE double-cast (nunca cast direto)
value as unknown as Prisma.InputJsonValue  // ✅
value as Prisma.InputJsonValue             // ❌ TS2352

// ActivityTemplate — usa soft delete, NÃO campo isActive
where: { deletedAt: null }   // ✅
where: { isActive: true }    // ❌ campo não existe

// ActivityTemplate com área — usar include, não select
include: { area: { select: { key: true } } }  // ✅
select: { area: { select: { key: true } } }   // ❌ erro de tipo

// Prisma JSON read-back — também double-cast
job.source as unknown as { mode: string }  // ✅

// Lucide icons — não aceitam prop title
<Icon aria-label="text" />  // ✅
<Icon title="text" />       // ❌ LucideProps não aceita title

// bcryptjs — default import obrigatório (CJS-only)
import bcrypt from 'bcryptjs'        // ✅
import { hash } from 'bcryptjs'      // ❌

// Memberships polimórficas — não existem como relação em Unit/Area
db.membership.findMany({ where: { scopeType, scopeId } })  // ✅
unit.memberships  // ❌ não existe no schema
```

### Nomenclatura de banco

- Tabelas: `snake_case` plural (`activities`, `unit_areas`)
- Colunas: `snake_case` (`created_at`, `visibility_mode`)
- Enums no Postgres: prefixar com tipo (`activity_status`, `user_role`)
- Timestamps: sempre `created_at` e `updated_at` com `DEFAULT now()`

### Arquitetura de API

- REST puro — sem GraphQL no MVP
- Fastify com plugins por domínio (`/auth`, `/units`, `/activities`, etc.)
- Todas as respostas no envelope `{ data, meta?, error? }`
- Paginação por cursor (`after`, `limit`) em listas grandes
- HTTP status codes semânticos: 200/201/204/400/401/403/404/422/500

### Segurança obrigatória

- Nunca expor IDs sequenciais — usar UUIDs v4 em todas as tabelas
- Rate limiting no Fastify para endpoints de auth (10 req/min)
- Sanitizar inputs antes de qualquer query (Prisma já previne SQL injection, mas validar com Zod)
- Tokens JWT com expiração curta (15min access, 7d refresh)
- CSP headers no Next.js
- Uploads: validar MIME type e tamanho máximo (10MB por anexo) no backend
- Tokens OAuth (Trello, Google, OneDrive): criptografar com AES-256-GCM antes de salvar em `integration_accounts.auth_jsonb`

### IA — regras críticas

- IA **nunca salva diretamente** — sempre retorna rascunho para confirmação do usuário
- Detecção de atraso é **lógica SQL determinística**, não LLM
- Respostas IA sempre em **JSON Schema validado** (structured outputs OpenAI com `json_object`)
- Timeout máximo de 10s para chamadas IA em requisições síncronas, 60s em workers
- Fallback gracioso: se IA falhar, fluxo manual continua sem erro — usar `callAI(fn, fallback, timeoutMs)`
- Nunca enviar conteúdo de atividades `restricted` para o LLM
- Rate limiting: 10 req/min por userId em todos os endpoints `/ai/*`

### Workers BullMQ — regras

- Sempre degradar graciosamente quando `REDIS_URL` não estiver configurado
- Nunca lançar erro se Redis ausente — usar `setImmediate` como fallback
- Filas: `recurrence-jobs`, `import-jobs`, `notification-jobs`, `ai-summary-jobs`, `delay-scan-jobs`

### Permissões — regra de ouro

A precedência de acesso segue exatamente esta ordem (maior número sobrescreve menor em conflito):
1. `owner` / `org_manager` — acesso total à organização
2. `unit_manager` — acesso total à unidade
3. `area_leader` — acesso à área
4. Atividade `visibility_mode = restricted` — quebra herança, exige `activity_permissions` explícita
5. `assignee` / `watcher` — acesso mínimo à própria atividade se compartilhada

**Nunca** calcular permissão no frontend — sempre validar no backend a cada request.

---

## Fluxos críticos que não podem quebrar

1. **Criar atividade** → salvar → gerar evento no histórico → notificar assignees
2. **Alterar status** → validar transição → salvar → gerar evento → notificar watchers
3. **Importar Trello** → dry-run (preview) → revisão usuário → commit atômico
4. **Recorrência** → job Redis/BullMQ → gerar próxima atividade → notificar
5. **Visão pessoal** → query com filtro por `membership.user_id` + `activity_assignees`
6. **Painel geral** → aggregation query com `GROUP BY unit_id` protegida por RBAC
7. **Upload de anexo** → presign R2 → upload direto → registrar metadados na API

---

## O que NÃO implementar no MVP

- App nativo iOS/Android (PWA substitui)
- Workflow builder visual/automações complexas
- OCR/RAG em anexos
- Múltiplos provedores de IA simultâneos
- Modelos ML customizados
- Billing/Stripe (adiar para pós-MVP)
- GraphQL, WebSockets em tempo real (polling simples no MVP)
- Google Drive / OneDrive (Sprint 7+)

---

## Variáveis de ambiente necessárias

```env
# Banco
DATABASE_URL=postgresql://...
REDIS_URL=redis://...

# Auth
JWT_SECRET=...
JWT_REFRESH_SECRET=...
GOOGLE_CLIENT_ID=...
GOOGLE_CLIENT_SECRET=...

# Storage (R2 client inline em apps/api/src/routes/attachments/index.ts)
R2_ACCOUNT_ID=...
R2_ACCESS_KEY_ID=...
R2_SECRET_ACCESS_KEY=...
R2_BUCKET_NAME=...
R2_PUBLIC_URL=...

# IA
OPENAI_API_KEY=...

# Notificações
SMTP_HOST=...
SMTP_PORT=587
SMTP_USER=...
SMTP_PASS=...
SMTP_FROM=GymOps <noreply@gymops.com>
VAPID_PUBLIC_KEY=...       # gerar com `npx web-push generate-vapid-keys`
VAPID_PRIVATE_KEY=...
VAPID_SUBJECT=mailto:admin@gymops.com
TWILIO_ACCOUNT_SID=...
TWILIO_AUTH_TOKEN=...
TWILIO_WHATSAPP_FROM=...

# Segurança
ENCRYPTION_KEY=...        # 64 chars hex (32 bytes) para AES-256-GCM

# App
NEXT_PUBLIC_API_URL=...
FRONTEND_URL=...
API_PORT=3001
NODE_ENV=development
```

---

## Referência rápida de domínio

- **Organização**: locatário principal do SaaS (ex: "SkyFit")
- **Unidade**: local físico operacional (ex: "Vila Xavier", "Centro", "Shopping")
- **Área**: recorte funcional padrão (Administrativo, Marketing, Coordenação, Estrutura/Manutenção, Líder, Financeiro)
- **Atividade**: item executável com status, prazo, responsável, checklist, anexos, histórico
- **Membership**: vínculo usuário↔escopo com papel (role)
- **Template**: modelo de atividade por área com checklist sugerido e campos específicos
- **Recorrência**: regra para gerar atividades periódicas automaticamente
- **ImportJob**: job de importação Trello com fases: fetch → dry-run → awaiting_review → commit

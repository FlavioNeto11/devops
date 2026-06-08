# GymOps

Plataforma de gestão operacional para redes de academias. Substitui o Trello com um modelo hierárquico **Organização → Unidade → Área → Atividade** e RBAC granular por escopo.

## Stack

Node.js 20 · Next.js 14 · Fastify · Prisma · PostgreSQL 16 (pgvector) · Redis · Cloudflare R2 · OpenAI

## Subir localmente

```bash
# 1. Requisitos: Docker, Node.js 20+, pnpm 9+
docker compose up -d postgres redis   # PostgreSQL + Redis (apenas infra local)

# 2. Instalar dependências e configurar banco
pnpm install
cp .env.docker.example .env.docker      # criar se ainda não existir
pnpm --filter @gymops/db generate
pnpm --filter @gymops/db migrate:deploy
pnpm --filter @gymops/db seed            # admin@skyfit.com / gymops123

# 3. Subir API + Web em paralelo
pnpm dev
```

URL local oficial: `http://localhost:7480/gymops/login`

API: `http://localhost:3001` · Web interno: `http://localhost:3000` · Web exposta: `http://localhost:7480/gymops`

## Variáveis de ambiente obrigatórias

Copie `apps/api/.env.example` e preencha:

| Variável | Descrição |
|---|---|
| `DATABASE_URL` | PostgreSQL connection string |
| `JWT_SECRET` / `JWT_REFRESH_SECRET` | Min 32 chars cada |
| `ENCRYPTION_KEY` | 64 hex chars (regex `^[0-9a-fA-F]{64}$`) — obrigatório em `NODE_ENV=production` |
| `FRONTEND_URL` | URL do frontend (ex: `https://app.gymops.com`) |

Variáveis opcionais: `REDIS_URL`, `GOOGLE_CLIENT_*`, `R2_*`, `OPENAI_API_KEY`, `SMTP_*`, `TWILIO_*`, `VAPID_*`

### Deploy via Docker

Para subir o stack completo em Docker (API + Worker + Web + infra):

```bash
cp .env.docker.example .env.docker   # se o arquivo ainda não existir
docker compose down
docker compose build --no-cache
docker compose up -d postgres redis
docker compose run --rm api pnpm --filter @gymops/db migrate:deploy
docker compose run --rm api pnpm --filter @gymops/db seed
docker compose up -d api worker web
```

Veja `.env.docker.example` para referência de todas as variáveis configuráveis.

Se você rodar `pnpm --filter @gymops/api test` contra o PostgreSQL exposto em `localhost:5432`, rode o seed novamente antes de validar login e navegação no browser.

### URLs de referência

- Local: `http://localhost:7480/gymops/login`
- Público esperado: `http://38.211.146.161:7480/gymops/login`
- API local: `http://localhost:3001/health`
- API pública esperada: `http://38.211.146.161:3001/health`

### Rebuild do web

Rebuildar o web sempre que mudar `NEXT_PUBLIC_API_URL` ou `NEXT_PUBLIC_APP_BASE_PATH`:

```bash
docker compose --env-file .env.docker build web
docker compose up -d web
```

O frontend prioriza o host atual do navegador quando um bundle antigo ainda estiver com `localhost` embutido, evitando chamadas incorretas ao abrir o GymOps pelo IP publico.

Para o IP público, ajuste o `.env.docker` com:

```env
FRONTEND_URL=http://38.211.146.161:7480/gymops
NEXT_PUBLIC_API_URL=http://38.211.146.161:3001
NEXT_PUBLIC_APP_BASE_PATH=/gymops
```

## Rodar testes

```bash
# Requer PostgreSQL rodando
pnpm --filter @gymops/api test

# E2E (requer API + Web rodando)
pnpm --filter @gymops/web test:e2e
```

## Contribuir

1. Leia [`AGENTS.md`](AGENTS.md) — contrato interoperável entre Claude Code, Copilot Chat e outros agentes
2. Leia [`CLAUDE.md`](CLAUDE.md) — regras de desenvolvimento e arquitetura
3. Leia [`docs/status.md`](docs/status.md) — **estado real (reconciliado 2026-05-17)**
4. Leia [`docs/backlog.md`](docs/backlog.md) — backlog priorizado P0/P1/P2 com IDs estáveis
5. Leia [`docs/implementation-plan.md`](docs/implementation-plan.md) — ordem recomendada de PRs (Sprints S18–S21)
6. Crie um branch a partir de `main`
7. PRs precisam passar lint + typecheck + test antes do merge (CI automático)

> **Antes de qualquer release pública**: executar [`docs/qa-release-checklist.md`](docs/qa-release-checklist.md).

## Uso de agentes de IA no desenvolvimento

O repositório tem infraestrutura compartilhada para Claude Code e GitHub Copilot Chat trabalharem em sinergia, com instruções path-specific, prompts reutilizáveis e perfis especialistas.

- [`AGENTS.md`](AGENTS.md) — contrato interoperável (leitura inicial obrigatória para qualquer agente)
- [`docs/how-to-use-ai-agents.md`](docs/how-to-use-ai-agents.md) — guia prático: o que digitar no Copilot/Claude para cada tipo de tarefa
- [`docs/ai-agent-operating-model.md`](docs/ai-agent-operating-model.md) — como Copilot e Claude se sincronizam
- [`docs/ai-knowledge-base.md`](docs/ai-knowledge-base.md) — base de conhecimento navegável para agentes
- [`docs/agent-task-routing.md`](docs/agent-task-routing.md) — matriz: tipo de tarefa → agente + prompt + skill
- [`.github/copilot-instructions.md`](.github/copilot-instructions.md) — instruções globais do Copilot
- [`.github/instructions/`](.github/instructions/) — instruções path-specific (frontend, backend, db, rbac, tests, docs, integrations)
- [`.github/prompts/`](.github/prompts/) — 10 prompts reutilizáveis (`/implement-sprint`, `/add-api-endpoint`, etc.)
- [`.github/agents/`](.github/agents/) — 9 perfis especialistas (orquestrador + 8 subagentes)
- [`docs/agent-skills/`](docs/agent-skills/) — 10 skills procedurais (read-context, validate-rbac, create-admin-ui, etc.)

## Documentação

### Estado, backlog e plano (ler primeiro)
- [`docs/status.md`](docs/status.md) — **estado real** reconciliado, bugs P0/P1, gaps de produto
- [`docs/backlog.md`](docs/backlog.md) — backlog priorizado (P0/P1/P2) com IDs estáveis
- [`docs/implementation-plan.md`](docs/implementation-plan.md) — plano de PRs até go-live (S18–S21)
- [`docs/qa-release-checklist.md`](docs/qa-release-checklist.md) — checklist de release por perfil e ambiente

### Produto e requisitos
- [`docs/PRD.md`](docs/PRD.md) — escopo funcional completo e métricas de sucesso
- [`docs/product-roadmap.md`](docs/product-roadmap.md) — roadmap (S9–S17 entregue, S18–S21 em execução)
- [`docs/sprints.md`](docs/sprints.md) — histórico de sprints e plano futuro
- [`docs/bootstrap-spec.md`](docs/bootstrap-spec.md) — spec do starter pack canônico de nova organização

### Design e UX
- [`docs/admin-ui-blueprint.md`](docs/admin-ui-blueprint.md) — especificação de cada tela administrativa (inclui seção S18–S21)
- [`docs/navigation-map.md`](docs/navigation-map.md) — mapa de navegação por papel
- [`docs/wireframes.md`](docs/wireframes.md) — wireframes textuais das telas principais
- [`docs/tutorial-mode.md`](docs/tutorial-mode.md) — modo tutorial guiado (onboarding, tours, Central de Ajuda)

### Técnica
- [`docs/architecture.md`](docs/architecture.md) — stack e decisões técnicas
- [`docs/api-spec.md`](docs/api-spec.md) — endpoints REST
- [`docs/rbac.md`](docs/rbac.md) — algoritmo de permissões
- [`docs/rbac-matrix.md`](docs/rbac-matrix.md) — matriz canônica + função `resolveUserContext`
- [`docs/data-model.md`](docs/data-model.md) — schema de banco e relações
- [`docs/integrations.md`](docs/integrations.md) — integrações externas (SMTP, Push, WhatsApp, Trello)
- [`docs/integrations-ops.md`](docs/integrations-ops.md) — manual operacional (health, reconnect, sandbox/prod, troubleshooting)
- [`docs/e2e-business-flows.md`](docs/e2e-business-flows.md) — critérios de aceite por fluxo de negócio
- [`docs/testing.md`](docs/testing.md) — estratégia unit / integration / E2E / smoke por perfil

### Operação
- [`docs/runbook.md`](docs/runbook.md) — operação contínua, healthchecks, troubleshooting, rollback
- [`docs/deploy.md`](docs/deploy.md) — guia de deploy (dev local, Docker local, público `/gymops`)

### Tarefas por sprint
- [`tasks/sprint-9.md`](tasks/sprint-9.md) — Perfil + Organização + Templates
- [`tasks/sprint-10.md`](tasks/sprint-10.md) — Unidades + Áreas
- [`tasks/sprint-11.md`](tasks/sprint-11.md) — Equipe e Permissões
- [`tasks/sprint-12.md`](tasks/sprint-12.md) — Central Global de Atividades
- [`tasks/sprint-13.md`](tasks/sprint-13.md) — Centro de Importações
- [`tasks/sprint-14.md`](tasks/sprint-14.md) — Recorrências + Notificações/Logs
- [`tasks/sprint-15.md`](tasks/sprint-15.md) — Observabilidade e Qualidade
- [`tasks/sprint-16.md`](tasks/sprint-16.md) — Hardening Final e Preparação Comercial

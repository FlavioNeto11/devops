# Sprint 1 — Fundação e Estrutura

**Duração**: 2 semanas  
**Objetivo**: Usuário consegue criar conta, entrar na organização, ver unidades e navegar pela hierarquia.  
**Resultado esperado**: Usuário faz login, vê lista de unidades, admin pode convidar membros.

---

## Setup inicial do monorepo

- [ ] Inicializar monorepo com `pnpm workspaces`
- [ ] Configurar `package.json` raiz com workspaces: `apps/*`, `packages/*`
- [ ] Criar `apps/api` com Fastify + TypeScript
- [ ] Criar `apps/web` com Next.js App Router
- [ ] Criar `packages/db` com Prisma
- [ ] Criar `packages/shared` com tipos TypeScript compartilhados
- [ ] Criar `packages/ui` com componentes Tailwind
- [ ] Configurar `tsconfig.json` base e extends
- [ ] Configurar ESLint + Prettier compartilhados
- [ ] Configurar `.env.example` com todas as variáveis necessárias
- [ ] Configurar `docker-compose.yml` para PostgreSQL + Redis locais

## Backend — packages/db

- [ ] `prisma/schema.prisma`: models Organization, Unit, Area, UnitArea, User, Session, Membership
- [ ] Enums: UserRole, ScopeType
- [ ] Migration inicial + raw SQL para extensões (uuid-ossp, pgvector)
- [ ] Seed de dados: 1 organização, 3 unidades, 6 áreas padrão, 1 admin
- [ ] Exportar Prisma Client de `packages/db/index.ts`

## Backend — apps/api

- [ ] Setup Fastify com TypeScript, Zod, Pino
- [ ] Plugin `@fastify/cors` com origens configuráveis
- [ ] Plugin `@fastify/jwt` com secret de env
- [ ] Plugin `@fastify/rate-limit` (10 req/min em /auth)
- [ ] Plugin `@fastify/multipart` (para uploads futuros)
- [ ] `GET /health` → `{ status: 'ok', timestamp }`
- [ ] Middleware de autenticação (preHandler global para rotas protegidas)
- [ ] `POST /auth/login` — validar email/senha, emitir JWT + refresh cookie
- [ ] `POST /auth/refresh` — validar refresh token, emitir novo access token
- [ ] `POST /auth/logout` — revogar sessão (marcar `revokedAt`)
- [ ] `GET /auth/google/start` — redirect para Google OAuth
- [ ] `GET /auth/google/callback` — trocar code por tokens, criar/atualizar usuário
- [ ] `GET /organizations/:id` — detalhe da organização
- [ ] `PATCH /organizations/:id` — editar (requer owner)
- [ ] `GET /units` — listar com filtro por organizationId
- [ ] `POST /units` — criar (requer org_manager)
- [ ] `GET /units/:id` — detalhe com áreas ativas
- [ ] `PATCH /units/:id` — editar
- [ ] `GET /areas` — catálogo da organização
- [ ] `POST /areas` — criar área
- [ ] `POST /units/:id/areas` — ativar área na unidade
- [ ] `DELETE /units/:id/areas/:areaId` — desativar área
- [ ] `GET /memberships` — listar com filtros
- [ ] `POST /memberships` — conceder papel
- [ ] `DELETE /memberships/:id` — revogar (soft delete)
- [ ] Utilitário `resolveUserMemberships(userId, orgId)` — base do RBAC

## Frontend — apps/web

- [ ] Configurar Tailwind CSS + shadcn/ui (init)
- [ ] Configurar TanStack Query (`QueryClientProvider`)
- [ ] Configurar Zustand (store de auth: user, token, orgId atual)
- [ ] Configurar interceptor de API (adicionar Authorization header)
- [ ] Componentes base:
  - `Button` (variants: primary, secondary, ghost, destructive)
  - `Input` + `Label` + `FormField` (com mensagem de erro)
  - `Badge` (status, prioridade)
  - `Card` + `CardHeader` + `CardContent`
  - `Modal` / `Dialog`
  - `Toast` / `Sonner`
  - `Select` / `Dropdown`
  - `Avatar`
  - `Spinner` (loading state)
- [ ] Layout base:
  - `Sidebar` com navegação (Org name → Unidades → Painel Geral → Minha conta)
  - `Header` com breadcrumb e avatar do usuário
  - Layout responsivo (sidebar colapsável em mobile)
- [ ] Página `/login`:
  - Form email + senha com validação
  - Botão "Entrar com Google" (redirect para /auth/google/start)
  - Tratamento de erros
- [ ] Redirect pós-login: colaborador → /me, gestor → /units/:id, admin → /dashboard
- [ ] Página `/units`:
  - Lista de cards de unidades com status
  - Botão "Nova unidade" (para org_manager)
- [ ] Página `/units/:id`:
  - Header: nome da unidade, botão editar
  - Lista de áreas ativas (colapsáveis)
  - Botão "Gerenciar membros"
- [ ] Modal de gerenciamento de membros:
  - Lista de membros com papel
  - Campo "Convidar por email" + select de papel
  - Botão remover membro
- [ ] PWA: `public/manifest.json`, ícones em `/public/icons/`

## Testes

- [ ] Teste de integração: POST /auth/login com credenciais válidas e inválidas
- [ ] Teste de integração: memberships — convidar, listar, revogar
- [ ] Teste: seed popula banco corretamente

# GitHub Copilot — Instruções Globais para GymOps

> Estas instruções são aplicadas automaticamente pelo GitHub Copilot Chat no VS Code (Insiders e Stable) sempre que o repositório for aberto. Mantenha curtas, diretas e sempre apontando para a documentação canônica.

## 1. Sobre o projeto

**GymOps** é uma plataforma de gestão operacional multiunidade que substitui o Trello em redes com várias unidades físicas. Contexto inicial: rede SkyFit, ~300 boards Trello para migrar.

- **Modelo de domínio**: `Organização → Unidade → Área → Atividade`
- **Stack**: Next.js 14 (web) + Fastify (api) + Prisma + PostgreSQL 16 + Redis/BullMQ + Cloudflare R2 + OpenAI
- **Idioma de produto**: português brasileiro (`pt-BR`)
- **Estado atual**: Sprints 1–8 concluídas (MVP funcional ~97%); ciclo 9–16 constrói camada administrativa de frontend

## 2. Antes de qualquer resposta, leia (ordem oficial)

1. [`AGENTS.md`](../AGENTS.md) — contrato interoperável entre agentes (raiz do repo)
2. [`CLAUDE.md`](../CLAUDE.md) — regras de desenvolvimento e armadilhas conhecidas
3. [`docs/status.md`](../docs/status.md) — estado real do projeto e gaps
4. [`docs/product-roadmap.md`](../docs/product-roadmap.md) — roadmap por horizonte
5. [`docs/rbac-matrix.md`](../docs/rbac-matrix.md) — matriz canônica de permissões
6. [`docs/admin-ui-blueprint.md`](../docs/admin-ui-blueprint.md) — spec de telas administrativas
7. [`docs/api-spec.md`](../docs/api-spec.md) — contrato de endpoints REST
8. [`docs/e2e-business-flows.md`](../docs/e2e-business-flows.md) — critérios de aceite por fluxo

Para a lista completa de documentos, ver [`AGENTS.md`](../AGENTS.md) seção 3.

## 3. Stack obrigatória (não negociar)

| Camada | Tecnologia |
|---|---|
| Frontend | Next.js 14 App Router + React 18 + Tailwind + shadcn/radix |
| Backend | Node 20 + Fastify 4 + TypeScript 5 (strict) |
| ORM | Prisma (schema-first) |
| Banco | PostgreSQL 16 (+ pgvector) |
| Cache/Filas | Redis + BullMQ |
| Storage | Cloudflare R2 (S3-compat) |
| IA | OpenAI API (structured outputs) |
| Auth | JWT (access 15min) + Refresh em cookie httpOnly + Google OAuth |

## 4. Regras de implementação (resumo)

- **TypeScript strict**, sem `any` — usar `unknown` quando o tipo não for conhecido.
- **Zod em todos os endpoints Fastify** para validar entrada antes de qualquer query.
- **RBAC sempre no backend.** Frontend pode esconder UI, nunca decidir acesso.
- **Envelope de resposta**: `{ data, meta?, error? }` em todas as respostas.
- **HTTP status semântico**: 200/201/204/400/401/403/404/422/500.
- **Paginação por cursor** (`after`, `limit`) em listas grandes.
- **Soft delete via `deletedAt`** onde aplicável.
- **Idioma**: textos da UI sempre em pt-BR. Logs e código em inglês.
- **Responsividade obrigatória**: mobile-first com `md:` overrides; testar em 375px e 1280px.

## 5. RBAC em uma linha

Precedência: `owner > org_manager > unit_manager > area_leader > executor > viewer`.
Atividade `visibility_mode = restricted` quebra herança e exige `activity_permissions` explícita.
Detalhes em [`docs/rbac.md`](../docs/rbac.md) e matriz canônica em [`docs/rbac-matrix.md`](../docs/rbac-matrix.md).

## 6. Frontend (Next.js)

- App Router (não Pages Router). Server Components por padrão; Client apenas quando precisar de interatividade.
- Estado global: Zustand (sem token no `localStorage` — sempre em memória).
- Data fetching: TanStack Query.
- Formulários: React Hook Form + Zod.
- Ícones: lucide-react. Usar `aria-label`, **nunca** `title` (LucideProps não aceita `title`).
- Padding de páginas: `p-3 md:p-6` ou `p-4 md:p-8`.
- Tabelas: sempre dentro de `overflow-x-auto`.
- Modais/drawers: `max-h-[90vh] overflow-y-auto`.
- API client centralizado em `apps/web/src/lib/api.ts` — não chamar `fetch` direto em componentes.
- Linguagem de negócio na UI, nunca jargão técnico (ex: "Equipe" não "Memberships").

## 7. Backend (Fastify)

- Rotas por domínio em `apps/api/src/routes/<dominio>/index.ts`.
- Sempre `preHandler: [app.authenticate]` exceto rotas explicitamente públicas.
- Verificar membership/role no início do handler. Para casos sutis (atividades), usar `resolveActivityPermission`.
- Workers separados da API: lib em `apps/api/src/lib/queues.ts`, processador em `apps/api/src/worker-process.ts`.
- Sempre degradar graciosamente se `REDIS_URL` ausente — usar `setImmediate` como fallback.
- Audit log em ações administrativas via `logAudit(...)` (fire-and-forget).
- Erros para o usuário: mensagem amigável; detalhes técnicos só nos logs do servidor.

## 8. Prisma (packages/db)

- Schema em `packages/db/prisma/schema.prisma`. Migrations via `prisma migrate dev`.
- **Sempre double-cast para JSON**: `value as unknown as Prisma.InputJsonValue` (idem para read-back).
- **ActivityTemplate usa soft delete** (`deletedAt: null`), **não** campo `isActive`.
- **ActivityTemplate.area**: usar `include` (não `select`) para evitar erro de tipo.
- **Memberships são polimórficas** — `db.membership.findMany({ where: { scopeType, scopeId } })`, sem relação em `Unit`/`Area`.
- `bcryptjs`: usar default import (`import bcrypt from 'bcryptjs'`); CJS-only.
- Nomenclatura de banco: tabelas `snake_case` plural, colunas `snake_case`, timestamps com `DEFAULT now()`.

## 9. Testes

- API: Vitest com banco real (não mockar PostgreSQL). Helpers em `apps/api/src/test/helpers.ts`.
- E2E: Playwright em `apps/web/e2e/`. Cenários baseados em [`docs/e2e-business-flows.md`](../docs/e2e-business-flows.md).
- Não criar teste superficial que apenas verifica "página carrega" — exigir asserção de comportamento (RBAC, estado, side effect).
- Não pular hooks com `--no-verify`.

## 10. Segurança não-negociável

- Nunca commitar segredos. Apenas arquivos `*.example`.
- Nunca expor IDs sequenciais.
- Tokens OAuth criptografados com AES-256-GCM antes de gravar em `integration_accounts.auth_jsonb`.
- `ENCRYPTION_KEY` obrigatória em produção (regex `^[0-9a-fA-F]{64}$`, boot guard).
- IA nunca recebe conteúdo de atividade `restricted` — guard via `resolveActivityPermission`.
- Rate limit em `/auth/*` (10 req/min) e `/ai/*` (10 req/min por userId).

## 11. Comandos principais

```bash
docker compose up -d postgres redis             # infra local
pnpm install                                    # instalar deps
pnpm --filter @gymops/db generate               # gerar Prisma Client
pnpm --filter @gymops/db migrate:deploy         # aplicar migrations
pnpm --filter @gymops/db seed                   # seed (admin@skyfit.com / gymops123)
pnpm dev                                        # API + Web em paralelo
pnpm lint && pnpm typecheck                     # qualidade
pnpm --filter @gymops/api test                  # vitest
pnpm --filter @gymops/web test:e2e              # playwright
pnpm --filter @gymops/web build                 # build de produção
```

## 12. Armadilhas conhecidas do codebase

```typescript
// Prisma InputJsonValue — SEMPRE double-cast
value as unknown as Prisma.InputJsonValue  // ✅
value as Prisma.InputJsonValue             // ❌ TS2352

// ActivityTemplate — usa soft delete
where: { deletedAt: null }                 // ✅
where: { isActive: true }                  // ❌ campo não existe

// ActivityTemplate com área
include: { area: { select: { key: true } } }  // ✅
select:  { area: { select: { key: true } } }  // ❌ erro de tipo

// Prisma JSON read-back
job.source as unknown as { mode: string }  // ✅

// Lucide icons
<Icon aria-label="texto" />                // ✅
<Icon title="texto" />                     // ❌ LucideProps não aceita title

// bcryptjs (CJS-only)
import bcrypt from 'bcryptjs'              // ✅
import { hash } from 'bcryptjs'            // ❌

// Memberships polimórficas
db.membership.findMany({ where: { scopeType, scopeId } })  // ✅
unit.memberships                                            // ❌ não existe

// WhatsApp signature
sendWhatsApp(to, message)                  // ✅ posicional
sendWhatsApp({ to, body })                 // ❌

// Settings layout NavItem (frontend)
// Tipar como Array<{ href; label; icon; exact? }>; "exact" é opcional
```

## 13. O que NUNCA fazer

- Implementar app nativo, GraphQL, WebSocket, Stripe completo, OCR/RAG, i18n no MVP.
- Criar tela técnica para usuário final (JSON editor, console SQL, painel BullMQ exposto).
- Calcular RBAC no frontend como fonte de verdade.
- Criar botão sem ação real ou que mostra alert/mock para o usuário.
- Mockar PostgreSQL nos testes de integração.
- Salvar token JWT em `localStorage`.
- Enviar conteúdo de atividade `restricted` para IA.
- Skip-ar hooks de pre-commit (`--no-verify`).
- Quebrar responsividade alterando classes sem o prefixo `md:`.
- Adicionar `any` em TypeScript.

## 14. Como validar uma tarefa antes de concluir

1. **Tipo**: `pnpm typecheck` passa sem erros.
2. **Lint**: `pnpm lint` passa sem warnings novos.
3. **Testes relacionados** rodam OK (`pnpm --filter @gymops/api test` se mexeu em API).
4. **Build** passa se mudou frontend (`pnpm --filter @gymops/web build`).
5. **Documentação** afetada foi atualizada (`docs/status.md`, `docs/api-spec.md`, etc.).
6. **RBAC** validada no backend (não só no frontend).
7. **Responsividade** testada visualmente (375px e 1280px) se mudou UI.
8. **Relatório final** gerado (arquivos, validações, riscos, próximos passos).

## 15. Instruções path-specific

Para regras detalhadas por domínio, este repositório usa `.github/instructions/*.instructions.md` com `applyTo` no frontmatter:

| Path coberto | Arquivo |
|---|---|
| `apps/web/**/*.{ts,tsx}` | [frontend.instructions.md](instructions/frontend.instructions.md) |
| `apps/api/**/*.ts` | [backend.instructions.md](instructions/backend.instructions.md) |
| `packages/db/**` | [database.instructions.md](instructions/database.instructions.md) |
| `apps/api/src/lib/rbac.ts` + rotas | [rbac.instructions.md](instructions/rbac.instructions.md) |
| `apps/**/*.{test,spec}.ts` + `e2e/**` | [tests.instructions.md](instructions/tests.instructions.md) |
| `docs/**/*.md` + `tasks/**` | [docs.instructions.md](instructions/docs.instructions.md) |
| `apps/api/src/routes/integrations/**` + lib externa | [integrations.instructions.md](instructions/integrations.instructions.md) |

Para prompts reutilizáveis (executar sprint, criar tela admin, revisar segurança, etc.), ver `.github/prompts/*.prompt.md`.

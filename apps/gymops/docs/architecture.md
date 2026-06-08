# Arquitetura Técnica

**Estado atual** (2026-05-15): Sprints 1–6 implementados. Ver `docs/status.md` para gaps.

---

## Stack completa e decisões

### Frontend — `apps/web`

**Next.js 14+ App Router + React 18+ + Tailwind CSS**

- App Router com Server Components para páginas de dados pesados (painel, lista de unidades)
- Client Components para interações em tempo real (atividade, comentários, checklist)
- PWA com `next-pwa` ou solução custom de Service Worker
- Push notifications via FCM + Web Push API no service worker
- Estado global com Zustand (leve, sem Redux)
- Data fetching com TanStack Query (cache, polling, mutations)
- Formulários com React Hook Form + Zod
- Design system com Tailwind + shadcn/ui (radix primitives)

**Responsividade obrigatória — toda tela deve funcionar em desktop E mobile:**
- Breakpoint de corte: `md` (768px) — mobile-first, desktop com `md:` overrides
- Sidebar: `fixed` overlay mobile (`z-50`, `-translate-x-full` fechado), `md:relative` desktop
- Top bar mobile: `md:hidden`, exibe hamburger + nome da org
- Padding: `p-3 md:p-6` em todas as páginas
- Tabelas: sempre `overflow-x-auto`
- Modais: `max-h-[90vh] overflow-y-auto`
- Drawers: full-screen mobile, `md:max-w-2xl` desktop

**Decisão PWA vs App nativo**: PWA entrega instalação na tela inicial, push notifications e UX mobile sem custo de dois apps nativos. Para uso operacional de rotina (não recursos avançados de câmera/NFC), é suficiente no MVP.

### Backend — `apps/api`

**Node.js 20+ + Fastify 4+ + TypeScript 5+**

- Fastify com plugins por domínio (não Express — Fastify tem melhor performance e tipagem)
- Plugins: `@fastify/jwt`, `@fastify/cors`, `@fastify/multipart`, `@fastify/rate-limit`
- Validação de schemas com Zod em todos os handlers
- Estrutura de pastas por feature (`/auth`, `/units`, `/activities`, `/ai`, etc.)
- Jobs assíncronos com BullMQ (recorrência, importação, resumo diário)
- Logs estruturados com Pino (já embutido no Fastify)

**Armadilhas conhecidas**:
- `Prisma.InputJsonValue`: sempre double-cast — `value as unknown as Prisma.InputJsonValue`
- `ActivityTemplate.isActive`: não existe — usar `where: { deletedAt: null }`
- Memberships polimórficas: não existem como relação em Unit/Area — query direta

### ORM — `packages/db`

**Prisma (schema-first)**

- Schema centralizado em `packages/db/prisma/schema.prisma`
- Migrações gerenciadas pelo Prisma (`prisma migrate dev`)
- Para campos `vector` (pgvector): criar via raw SQL migration, acessar via `$queryRaw`
- Seed de dados de desenvolvimento em `prisma/seed.ts`
- Client gerado e re-exportado do package `packages/db`

### Banco de dados

**PostgreSQL 16+ (Neon em produção)**

- Extensão `uuid-ossp` para UUIDs v4 nativos
- Extensão `pgvector` para embeddings futuros (criar no migration inicial — **pendente migration**)
- `jsonb` para campos flexíveis (`metadata_jsonb`, `config_jsonb`, `payload_jsonb`) com índices GIN
- Índices compostos obrigatórios:
  - `activities(organization_id, unit_id, status, due_at)` — filtros principais
  - `memberships(user_id, organization_id, scope_type, scope_id)` — resolução de RBAC
  - `activity_events(activity_id, created_at)` — histórico em ordem
  - `activity_assignees(activity_id, user_id)` — visão pessoal

**Tabelas pendentes** (migrations não criadas):
- `fcm_subscriptions` — tokens de push por usuário
- `notification_logs` — rastreamento de entregas
- Coluna `users.phone` — WhatsApp

### Cache e Filas

**Redis (Upstash em produção) + BullMQ**

Filas BullMQ:
- `recurrence-jobs` — gerar próxima ocorrência de atividade recorrente
- `import-jobs` — processar importação Trello em background
- `notification-jobs` — enviar e-mail, push, WhatsApp
- `ai-summary-jobs` — gerar resumos diários (cron às 07h por organização) — **cron pendente**
- `delay-scan-jobs` — varrer atividades atrasadas (cron a cada hora) — **não implementado**

Cache Redis:
- Contadores de dashboard por unidade (TTL 5min)
- Sessões de importação em andamento
- Rate limiting de auth e endpoints IA
- `ai:summary:{unitId}:{date}` — resumo diário com TTL 48h ✅

**Workers devem degradar graciosamente** quando `REDIS_URL` ausente — usar `setImmediate` como fallback.

### Storage de arquivos

**Cloudflare R2 (S3-compatível)**

- SDK: `@aws-sdk/client-s3` (funciona com R2 via custom endpoint)
- Upload direto via presigned URL (frontend → R2, sem passar pelo API)
- Metadados registrados na tabela `activity_attachments` após upload
- Validação de MIME type e tamanho (máx 10MB) no presign endpoint
- Bucket privado — servir via presigned URL com expiração de 1h

**Estado atual**: endpoint de presign existe mas `apps/api/src/lib/r2.ts` **não foi criado**.  
Criar com `S3Client` apontando para `https://${R2_ACCOUNT_ID}.r2.cloudflarestorage.com`.

### Autenticação

**JWT + Google OAuth 2.0**

- Access token: JWT, exp 15min, payload `{ sub: userId, orgId, roles }`
- Refresh token: JWT, exp 7d, armazenado em httpOnly cookie
- Google OAuth: authorization code flow, troca por tokens no backend
- Sessão armazenada em tabela `sessions` para invalidação server-side
- Middleware Fastify `preHandler` em todas as rotas protegidas

**Estado atual**: email/senha 100% funcional. Google OAuth **não conectado** — rotas declaradas no spec mas não implementadas.

### IA

**OpenAI API (gpt-4o ou gpt-4o-mini)**

- `response_format: { type: 'json_object' }` para structured outputs
- Timeout 10s em chamadas síncronas, 60s em workers
- Fallback gracioso via `callAI(fn, fallback, timeoutMs)` — nunca 500 por falha de IA
- Prompts versionados em `apps/api/src/ai/prompts/`
- Nunca chamar IA diretamente do frontend — sempre via API
- Nunca enviar conteúdo de atividades `restricted` ao LLM
- Rate limit: 10 req/min por userId via Redis

**4 endpoints implementados**: draft, checklist, delay-analysis, daily-summary (manual).  
**Cron diário às 07h**: pendente configuração BullMQ repeatable.

### Notificações

- **FCM Web Push**: `firebase-admin` no backend + Service Worker no frontend — **setup pendente**
- **E-mail**: Nodemailer com template HTML — service configurado, jobs não integrados
- **WhatsApp**: Twilio WhatsApp API — service configurado, não chamado do worker
- Preferências por usuário em `notification_preferences`

---

## Diagrama de arquitetura

```
┌─────────────────────────────────────────────────────────────────┐
│  Usuário (Browser / PWA instalado — Desktop + Mobile)           │
└───────────────────┬─────────────────────────────────────────────┘
                    │ HTTPS
┌───────────────────▼─────────────────────────────────────────────┐
│  Next.js App Router (Vercel)                                    │
│  Server Components + Client Components + Service Worker          │
│  Responsivo: mobile-first com md: breakpoints                   │
└───────────────────┬─────────────────────────────────────────────┘
                    │ HTTP/REST
┌───────────────────▼─────────────────────────────────────────────┐
│  Fastify API (Render Web Service)                               │
│  ┌──────────┐ ┌──────────┐ ┌──────────┐ ┌──────────────┐      │
│  │ /auth    │ │ /units   │ │/activities│ │ /ai /imports │      │
│  └──────────┘ └──────────┘ └──────────┘ └──────────────┘      │
│                    │                                             │
│  ┌─────────────────▼──────────────────────────────────────┐    │
│  │ BullMQ Workers (recorrência, importação, notif, IA)     │    │
│  │ — degradam graciosamente se Redis ausente               │    │
│  └─────────────────────────────────────────────────────────┘    │
└──────┬──────────────┬──────────────┬──────────┬─────────────────┘
       │              │              │          │
┌──────▼──┐   ┌───────▼──┐  ┌───────▼──┐  ┌───▼──────────┐
│ Neon    │   │ Upstash  │  │ Cloudflare│  │ Serviços ext │
│ Postgres│   │ Redis    │  │ R2        │  │              │
│         │   │          │  │ ⚠ client │  │ OpenAI API ✅│
│ pgvector│   │ BullMQ   │  │ não criado│  │ FCM / Push ⚠│
│ jsonb   │   │ Cache    │  │           │  │ SMTP ⚠      │
└─────────┘   └──────────┘  └───────────┘  │ Twilio WA ⚠ │
                                            │ Trello API ⚠│
                                            └──────────────┘

⚠ = serviço configurado mas não totalmente integrado
```

---

## Deploy — configuração mínima do MVP

| Componente | Plataforma | Configuração |
|---|---|---|
| Frontend Next.js | Vercel | Deploy via Git, env vars no dashboard |
| API Fastify | Render Web Service | Dockerfile ou Node buildpack, auto-deploy |
| PostgreSQL | Neon | Connection string pooled + direct |
| Redis | Upstash | REST URL + token para ambientes serverless; `maxRetriesPerRequest: null` para BullMQ |
| Object Storage | Cloudflare R2 | Bucket `gymops-attachments`, S3 API habilitada |
| Web Push | Firebase (FCM) | Projeto Firebase, service account JSON, VAPID keys |

**Variáveis críticas**: ver seção "Variáveis de ambiente" no `CLAUDE.md`.

---

## Decisões técnicas registradas

### Por que Fastify e não Express?
Fastify tem ~2x throughput em benchmarks, schema validation nativa com Ajv, e melhor suporte a TypeScript. Para uma API que vai lidar com dashboards pesados e importações em batch, a performance importa.

### Por que Prisma e não TypeORM?
Produtividade de equipe e migrations explícitas. TypeORM é válido se a equipe já domina, mas Prisma reduz erros de relacionamento em modelos complexos como este (RBAC com herança por escopo).

### Por que `jsonb` para metadados de template?
Templates de áreas diferentes têm campos distintos (financeiro tem `valor/vencimento`, manutenção tem `equipamento/fornecedor`). Forçar colunas relacionais para cada combinação criaria explosão de colunas. `jsonb` com índice GIN resolve sem sacrificar filtros.

### Por que polling e não WebSockets?
WebSockets adicionam infra (sticky sessions, pub/sub Redis) sem destravar nada crítico no MVP. Polling a cada 60s em TanStack Query é invisível para o usuário e muito mais simples de operar.

### Por que PWA e não app nativo?
PWA entrega instalação na tela inicial, push notifications e layout responsivo sem custo de dois apps nativos (iOS + Android). Para uso operacional de rotina (formulários, checklists, comentários), é suficiente. App nativo avaliado pós-MVP.

### Por que Twilio para WhatsApp e não Cloud API direta?
Twilio abstrai a aprovação de template, configuração de webhook e resiliência de entrega. A Cloud API Meta direta é mais barata em escala, mas requer aprovação de número e mais setup. Twilio é o caminho mais rápido para MVP.

### Por que double-cast `as unknown as Prisma.InputJsonValue`?
TypeScript 5+ rejeita cast direto de tipos complexos (objetos, arrays tipados) para `Prisma.JsonValue` porque não há sobreposição suficiente. A solução é sempre passar por `unknown` como intermediário.

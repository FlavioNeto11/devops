# Sprint 8 — Hardening para MVP de Produção (P0 + P1)

**Duração**: 4 semanas (P0: semanas 1–2 | P1: semanas 3–4)  
**Objetivo**: Transformar o produto funcionalmente completo em software confiável para piloto real com clientes.  
**Entrada**: Sprint 7 concluída — todos os módulos implementados, 6 suítes de testes de API.  
**Saída**: MVP seguro, com CI/CD, deploy reprodutível, fluxos críticos com E2E, e operação estabilizada.

> **Contexto**: A análise externa do repositório (2026-05-15) confirmou que o escopo funcional está ~90% completo, mas a prontidão de produção está ~55%. O bloqueador não é feature — é hardening de segurança, infraestrutura de entrega e confiabilidade operacional.

---

## P0 — Semanas 1–2: Segurança e pipeline

### 1. Corrigir RBAC nos endpoints de IA

**Problema**: `POST /ai/activities/checklist` e `POST /ai/activities/delay-analysis` consultam a atividade sem checar `resolveActivityPermission`. Usuário autenticado pode acessar atividades `restricted` de outras áreas/unidades só conhecendo o UUID.

**Arquivo**: `apps/api/src/routes/ai/index.ts`

```diff
+import { resolveActivityPermission } from '../../lib/rbac.js';

 app.post('/activities/checklist', { preHandler: [app.authenticate] }, async (req, reply) => {
   const body = ChecklistInputSchema.parse(req.body);
+  const canView = await resolveActivityPermission({
+    userId: req.user.sub, activityId: body.activityId, action: 'view',
+  });
+  if (!canView) return reply.status(404).send({ error: { code: 'NOT_FOUND', message: 'Activity not found' } });
   const activity = await db.activity.findUnique({ ... });

 app.post('/activities/delay-analysis', { preHandler: [app.authenticate] }, async (req, reply) => {
+  const canView = await resolveActivityPermission({
+    userId: req.user.sub, activityId: body.activityId, action: 'view',
+  });
+  if (!canView) return reply.status(404).send({ error: { code: 'NOT_FOUND', message: 'Activity not found' } });
```

**Critério**: testes de RBAC para IA passando — usuário sem acesso → 404.

---

### 2. Corrigir autorização nas rotas de import

**Problema**: `GET /imports/:id`, `GET /imports/:id/preview`, `PATCH /imports/:id/mapping` e `POST /imports/:id/commit` não verificam se o job pertence à organização do usuário com a mesma robustez da criação.

**Arquivo**: `apps/api/src/routes/imports/index.ts`

```typescript
// Adicionar helper no topo do arquivo
async function assertImportAccess(jobId: string, userId: string) {
  const job = await db.importJob.findUnique({ where: { id: jobId } });
  if (!job) throw app.httpErrors.notFound('Import job not found');
  const member = await db.membership.findFirst({
    where: { userId, organizationId: job.organizationId },
  });
  if (!member) throw app.httpErrors.forbidden();
  return job;
}

// Usar em todas as rotas de leitura/escrita do job
const job = await assertImportAccess(params.id, request.user.sub);
```

**Critério**: usuário de outra organização tentando acessar import de org alheia → 403/404.

---

### 3. Remover access token do localStorage

**Problema**: `useAuthStore` com Zustand Persist grava o `token` no localStorage. Qualquer XSS tem acesso irrestrito ao JWT de acesso.

**Arquivos**: `apps/web/src/stores/auth.ts`, cliente de API, interceptors.

**Solução recomendada** (mínima, sem reescrever auth):
- Manter `token` apenas em memória (estado Zustand sem persistência)
- Persistir apenas `user` (dados não sensíveis) no localStorage
- Adicionar interceptor no cliente de API que chama `POST /auth/refresh` automaticamente em 401
- Token de refresh pode usar cookie `httpOnly; Secure` (necessário ajuste no backend)

```typescript
// apps/web/src/stores/auth.ts
// Remover 'token' da lista de campos persistidos
partialize: (state) => ({
  user: state.user,
  // token: state.token, ← REMOVER
}),
```

**Critério**: após refresh de página, token não existe em `localStorage` — revalidado via refresh token.

---

### 4. Corrigir Google OAuth callback (token fora da URL)

**Problema**: `/auth/google/callback` redireciona com `?token=<jwt>` na URL — exposto em logs, histórico do navegador e Referer headers.

**Arquivo**: `apps/api/src/routes/auth/index.ts`, `apps/web/src/app/(auth)/callback/page.tsx`

**Solução**: usar cookie temporário `httpOnly` para transportar o token ao frontend:

```typescript
// Backend: setar cookie httpOnly em vez de query param
reply.setCookie('auth_token', token, {
  httpOnly: true, secure: true, sameSite: 'lax',
  maxAge: 60, // 60 segundos — consumido imediatamente
  path: '/auth/consume',
});
return reply.redirect(`${env.FRONTEND_URL}/auth/callback`);

// Adicionar GET /auth/consume: lê o cookie, retorna o token e o limpa
```

**Critério**: URL de callback não contém token em query string.

---

### 5. Tornar `ENCRYPTION_KEY` obrigatória em produção

**Arquivo**: `apps/api/src/env.ts`

```typescript
ENCRYPTION_KEY: z.string().min(64).refine(
  (v) => process.env['NODE_ENV'] !== 'production' || v.length >= 64,
  { message: 'ENCRYPTION_KEY é obrigatória e deve ter 64 chars hex em produção' }
),
```

Sem essa variável configurada, segredos de integração (tokens Trello, etc.) ficam em texto simples no banco.

**Critério**: API não sobe em `NODE_ENV=production` sem `ENCRYPTION_KEY` válida.

---

### 6. Pipeline CI/CD com GitHub Actions

**Arquivo**: `.github/workflows/ci.yml`

```yaml
name: ci
on:
  pull_request:
  push:
    branches: [main]

jobs:
  validate:
    runs-on: ubuntu-latest
    services:
      postgres:
        image: pgvector/pgvector:pg16
        env:
          POSTGRES_DB: gymops_test
          POSTGRES_USER: postgres
          POSTGRES_PASSWORD: postgres
        ports: ['5432:5432']
        options: >-
          --health-cmd pg_isready
          --health-interval 10s
          --health-retries 5
    env:
      DATABASE_URL: postgresql://postgres:postgres@localhost:5432/gymops_test
      JWT_SECRET: test-secret-key-min-32-chars-long!!
      JWT_REFRESH_SECRET: test-refresh-secret-min-32-chars!!
      FRONTEND_URL: http://localhost:3000
      ENCRYPTION_KEY: ${{ '0'.repeat(64) }}
    steps:
      - uses: actions/checkout@v4
      - uses: pnpm/action-setup@v4
        with: { version: 9 }
      - uses: actions/setup-node@v4
        with: { node-version: 20, cache: pnpm }
      - run: pnpm install --frozen-lockfile
      - run: pnpm --filter @gymops/db generate
      - run: pnpm --filter @gymops/db exec prisma migrate deploy
      - run: pnpm lint
      - run: pnpm typecheck
      - run: pnpm --filter @gymops/api test

  build:
    runs-on: ubuntu-latest
    needs: validate
    steps:
      - uses: actions/checkout@v4
      - uses: pnpm/action-setup@v4
        with: { version: 9 }
      - uses: actions/setup-node@v4
        with: { node-version: 20, cache: pnpm }
      - run: pnpm install --frozen-lockfile
      - run: pnpm --filter @gymops/db generate
      - run: pnpm build
```

**Critério**: PRs bloqueados se lint/typecheck/test/build falharem.

---

### 7. README público e runbook

**Arquivos**: `README.md` (raiz do monorepo), `docs/runbook.md`

**README mínimo** deve cobrir:
- O que é o produto (1 parágrafo)
- Como subir localmente (`docker compose up -d && pnpm install && pnpm dev`)
- Variáveis de ambiente necessárias (link para `docs/status.md`)
- Como rodar testes
- Como contribuir

**Runbook** deve cobrir:
- Deploy em produção (migrar → API → worker → web)
- Rollback (procedure com `prisma migrate resolve`)
- Troubleshooting comum (Redis down, R2 inacessível, worker sem jobs)
- Smoke tests pós-deploy

---

## P1 — Semanas 3–4: Confiabilidade operacional

### 1. Separar processo worker/scheduler da API

**Problema**: todos os 5 workers sobem em `apps/api/src/index.ts`. Em escala horizontal (múltiplas réplicas da API), crons e timers disparam em cada réplica, criando duplicidade de notificações e jobs.

**Solução**:

```
apps/api/src/index.ts          → Fastify HTTP apenas (sem workers)
apps/api/src/worker-process.ts → Inicializa todos os workers (único processo)
```

```typescript
// apps/api/src/worker-process.ts
import { startRecurrenceWorker } from './workers/recurrence-worker.js';
import { startNotificationWorker } from './workers/notification-worker.js';
import { startImportWorker } from './workers/import-worker.js';
import { startAiSummaryWorker } from './workers/ai-summary-worker.js';
import { startDelayScanWorker } from './workers/delay-scan-worker.js';

startRecurrenceWorker();
startNotificationWorker();
startImportWorker();
startAiSummaryWorker();
startDelayScanWorker();
```

```json
// package.json (apps/api)
"scripts": {
  "start": "node dist/index.js",
  "start:worker": "node dist/worker-process.js"
}
```

No `docker-compose.yml` e no Render: dois serviços — `api` e `worker`.

**Critério**: `pnpm start` não inicializa nenhum worker; `pnpm start:worker` inicializa todos; comportamento idêntico em funcionalidade.

---

### 2. E2E Playwright para fluxos críticos

**Setup**:

```bash
pnpm add -D @playwright/test -w --filter @gymops/web
pnpm --filter @gymops/web exec playwright install chromium
```

**Arquivo**: `apps/web/e2e/`

**Fluxos prioritários** (em ordem de risco):

| Fluxo | Arquivo | Casos |
|-------|---------|-------|
| Login | `auth.spec.ts` | Email/senha OK; credencial errada → toast; redireciona |
| Dashboard | `dashboard.spec.ts` | KPIs visíveis; filtro por unidade funciona |
| Criar atividade | `activity.spec.ts` | Formulário, assignee, área, checklist; aparece na lista |
| Importação Trello | `import.spec.ts` | Upload JSON, preview, mapeamento, commit, relatório |
| Permissões | `rbac.spec.ts` | Executor não vê restricted; unit_manager vê apenas sua unidade |

**Critério**: todos os fluxos E2E passando em CI contra banco de staging.

---

### 3. Commit atômico no importador Trello

**Problema**: `commitImport()` em `imports/trello/processor.ts` faz mutações incrementais (criar unit, criar activities, criar checklists) sem uma transação global. Se falhar no meio, deixa estado parcial.

**Solução**: envolver toda a operação de commit em `db.$transaction()` com `maxWait`/`timeout` adequados para 500 cards, ou usar modelo staged (status `importing` → commit por lotes → `committed`/`failed`).

```typescript
// Opção 1: transação única (ok até ~200 cards)
await db.$transaction(async (tx) => {
  const unit = await tx.unit.upsert({ ... });
  for (const card of cards) {
    await tx.activity.create({ ... });
  }
}, { maxWait: 30_000, timeout: 60_000 });

// Opção 2: batched commit com status tracking (preferível para boards grandes)
// Status: dry_run → awaiting_review → importing → committed | failed
```

**Critério**: interromper o processo no meio do commit não deixa atividades parciais; re-executar é idempotente.

---

### 4. Separar `prisma migrate deploy` do boot da API

**Problema atual**: `Dockerfile` da API executa migrations e seed no startup, o que não é recomendado para produção (Prisma docs: migrations devem rodar no pipeline CI/CD, não no boot).

**Fix no Dockerfile**:
```dockerfile
# Remover do CMD / ENTRYPOINT:
# RUN npx prisma migrate deploy && npx prisma db seed

# Adicionar script de entrypoint separado para staging
COPY docker-entrypoint.sh /docker-entrypoint.sh
RUN chmod +x /docker-entrypoint.sh
```

**No pipeline de deploy (GitHub Actions ou Render deploy hook)**:
```bash
pnpm --filter @gymops/db exec prisma migrate deploy
# seed apenas em staging
```

**Critério**: `docker compose up api` não roda migrations automaticamente em produção.

---

### 5. Trello OAuth (movido de Sprint 7)

```
GET  /integrations/trello/start    → redirect para Trello OAuth 1.0a
GET  /integrations/trello/callback → troca token, salva criptografado em integration_accounts
GET  /integrations/trello/boards   → lista boards da conta conectada
DELETE /integrations/trello        → revoga e deleta token
```

**Atenção**:
- Trello usa OAuth 1.0a — usar biblioteca `oauth` (npm)
- Token OAuth 1.0a = `oauth_token` + `oauth_token_secret` — salvar ambos via `encrypt()` de `lib/crypto.ts`
- Frontend: botão "Conectar Trello" em `/settings/integrations` já existe — completar implementação

---

### 6. Import progress bar + relatório final (movido de Sprint 7)

**Passo 4** — polling durante commit:
```typescript
useQuery({
  queryKey: ['import-job', jobId],
  queryFn: () => importsApi.get(jobId),
  refetchInterval: (data) =>
    ['committed', 'failed'].includes(data?.data?.status) ? false : 2000,
});
```

**Passo 5** — relatório final: exibir `summary_jsonb.createdCount`, `skippedCount`, `failedCount` da `import_jobs`.

---

## Critério de aceitação da Sprint 8

### P0
- [ ] Endpoint `/ai/activities/checklist` com usuário sem acesso → 404
- [ ] Endpoint `/ai/activities/delay-analysis` com usuário sem acesso → 404
- [ ] Import job de outra org → 403/404
- [ ] Após reload da página, `localStorage` não contém JWT de acesso
- [ ] Callback Google OAuth não expõe token na URL
- [ ] API não sobe em produção sem `ENCRYPTION_KEY` de 64 chars
- [ ] PR para `main` sem passar lint/typecheck/test → bloqueado pelo CI
- [ ] README.md com setup local em menos de 5 comandos

### P1
- [ ] `pnpm start` sobe apenas a API HTTP sem workers
- [ ] `pnpm start:worker` sobe apenas os workers
- [ ] Dois containers distintos no docker-compose: `api` e `worker`
- [ ] Playwright E2E: login, dashboard, criar atividade, importação passando em CI
- [ ] Importação de 50 cards com falha simulada no meio → zero atividades criadas (rollback)
- [ ] Trello OAuth connect → boards listados
- [ ] Import progress bar + relatório final funcionando no wizard

# GymOps — Estratégia de Testes

**Última atualização**: 2026-05-17  
**Donos**: testing-e2e (líder), backend-fastify, frontend-next.  
**Referências cruzadas**: [`docs/e2e-business-flows.md`](e2e-business-flows.md), [`docs/qa-release-checklist.md`](qa-release-checklist.md), [`docs/backlog.md`](backlog.md) (OPS-001 / OPS-002).

---

## Pirâmide de testes

```
            ┌──────────────┐
            │  Smoke por   │  ← 6 papéis × 2 ambientes (manual + Playwright)
            │   perfil     │
            ├──────────────┤
            │     E2E      │  ← fluxos de negócio (Playwright)
            ├──────────────┤
            │ Integration  │  ← rotas + DB (Vitest)
            ├──────────────┤
            │     Unit     │  ← helpers, validators, lógica pura
            └──────────────┘
```

---

## Camada 1 — Unit (Vitest)

**Onde**: `apps/api/src/**/*.test.ts`, `apps/web/src/**/*.test.ts` (a criar).  
**Cobre**: lógica pura sem I/O — helpers RBAC, validators Zod, parsers, formatters.

### Exemplos atuais
- `apps/api/src/test/rbac.test.ts` — algoritmo de resolução
- `apps/api/src/test/recurrence.test.ts` — cálculo de próxima execução
- `apps/api/src/test/ai.test.ts` — wrapper de IA com fallback

### A adicionar
- `apps/web/src/store/auth.spec.ts` — todos os helpers (`canCreate`, `canEdit`, `isManager`) por papel (BUG-006)
- `apps/api/src/lib/rbac.test.ts` — `hasUnitRole` para memberships de área (BUG-007)
- `apps/api/src/lib/auth-context.test.ts` — `resolveUserContext()` para os 4 cenários: org / unit / area / nenhum (BUG-005)

### Execução

```bash
pnpm --filter @gymops/api test
pnpm --filter @gymops/web test  # (a criar — hoje só E2E)
```

---

## Camada 2 — Integration (Vitest com banco real)

**Onde**: `apps/api/src/test/*.test.ts` (com helpers em `apps/api/src/test/helpers.ts`).  
**Cobre**: rotas Fastify chamando `app.inject(...)` contra um Postgres real em CI.

### Cobertura atual
- `auth.test.ts` — registro, login, refresh, logout
- `import.test.ts` — wizard de importação
- `notifications.test.ts` — preferências
- `me-tutorial-progress.test.ts` — progresso de tutorial

### A adicionar (Sprint 18–20)
- `auth.login-by-area.test.ts` — login com membership só de área (BUG-005)
- `activities.bulk-update.test.ts` — bulk com `organizationId` (BUG-002)
- `activities.export-with-priority.test.ts` — export respeita prioridade (BUG-003)
- `organizations.bootstrap.test.ts` — starter pack canônico (FEAT-004)
- `memberships.scoped.test.ts` — CRUD por escopo unit/area (FEAT-001)
- `imports.dedupe-cross-job.test.ts` — segundo import marca duplicatas (FEAT-006)
- `cors.allowlist.test.ts` — `ALLOWED_ORIGINS` via env (BUG-010)

### Padrão

```ts
import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import { getApp, closeApp, resetDb, initApp, createUser, loginUser, authHeader } from './helpers.js';

describe('Activities bulk-update', () => {
  beforeAll(initApp);
  afterAll(closeApp);
  beforeEach(resetDb);

  it('atualiza várias atividades quando organizationId é enviado', async () => {
    const app = await getApp();
    // ...
  });
});
```

### Execução

```bash
# CI: usa postgres do GitHub Actions services
pnpm --filter @gymops/api test

# Local: docker compose up -d postgres redis primeiro
pnpm --filter @gymops/api test
```

---

## Camada 3 — E2E (Playwright)

**Onde**: `apps/web/e2e/*.spec.ts`.  
**Cobre**: jornadas de negócio com browser real, banco real, API real.

### Cobertura atual
- `auth.spec.ts` — login/logout
- `activity.spec.ts` — fluxo de atividade
- `rbac.spec.ts` — guards de API
- `import.spec.ts` — wizard básico
- `dashboard.spec.ts` — KPIs
- `tutorial.spec.ts` — modo tutorial (smoke)

### A adicionar (Sprints 18–21)
- `activities-central.full-flow.spec.ts` — filtros + paginação + bulk + export + drill-down (FEAT-003)
- `setup.full-flow.spec.ts` — wizard nova organização (FEAT-004)
- `team.invite-by-unit.spec.ts` — convite escopado (FEAT-001)
- `team.invite-by-area.spec.ts` — convite por área (FEAT-001)
- `units.areas-board.spec.ts` — matriz unit×area (FEAT-002)
- `integrations.trello-health.spec.ts` — diagnóstico (FEAT-005)
- `integrations.whatsapp-status.spec.ts` — diagnóstico (FEAT-005)
- `import.real-units.spec.ts` — wizard com áreas reais (FEAT-006)
- `smoke-by-role/owner.spec.ts` ... `viewer.spec.ts` — 6 perfis (OPS-004)

### Padrão (uso de `page.getByTestId`)

```ts
test('admin convida usuário como area_leader', async ({ page }) => {
  await loginAsOwner(page);
  await page.goto('/settings/team');
  await page.getByTestId('team-tab-area').click();
  await page.getByRole('button', { name: 'Convidar' }).click();
  // ...
});
```

### Convenção de `data-testid`

- `tutorial-step-card`, `tutorial-next`, `tutorial-prev` (já em uso)
- `team-tab-{org|unit|area}`, `team-invite-modal`
- `units-area-add`, `units-area-remove-{areaId}`, `units-area-reorder-up-{areaId}`
- `activities-bulk-action-{status|priority|assign|archive}`
- `integrations-trello-health-badge`, `integrations-trello-reconnect`, `integrations-whatsapp-test`

### Execução

```bash
# Local
pnpm --filter @gymops/web test:e2e

# Com UI (depuração)
pnpm --filter @gymops/web exec playwright test --ui

# Apenas um spec
pnpm --filter @gymops/web exec playwright test e2e/auth.spec.ts
```

---

## Camada 4 — Smoke por perfil

**Onde**: [`docs/qa-release-checklist.md`](qa-release-checklist.md) + (futuro) `apps/web/e2e/smoke-by-role/*.spec.ts`.  
**Cobre**: cada papel (owner / org_manager / unit_manager / area_leader / executor / viewer) percorrendo as principais rotas em local e público.

**Cadência**: antes de cada release.

---

## Estratégia de CI/CD

### Pipelines atuais

| Workflow | Trigger | Job |
|---|---|---|
| `.github/workflows/ci.yml` | push main + pull_request | lint + typecheck + test (API) + build (web) |
| `.github/workflows/e2e.yml` | push main + workflow_dispatch | Playwright |

### Gaps (Sprint 21)

- **OPS-001**: 🟡 gate implantado (2026-07-02) — E2E + integração de API rodam em `pull_request` pelo workflow **raiz do monorepo** `.github/workflows/ci-gymops-e2e.yml`. Os workflows aninhados deste app (`ci.yml`/`e2e.yml`) são mortos no monorepo (o GitHub só executa workflows da raiz) e ficam como histórico. A 1ª execução real expôs BUG-013 (vitest × prom-client) e BUG-014 (`import.spec.ts` ESM×CJS) — gate vermelho até corrigi-los (ver `docs/backlog.md`).
- **OPS-002**: ci.yml não compila variante `/gymops` — deploy público pode quebrar sem CI detectar.

### Estado alvo

```yaml
# .github/workflows/e2e.yml
on:
  push:
    branches: [main]
  pull_request:
    branches: [main]
```

```yaml
# .github/workflows/ci.yml — adicionar job
jobs:
  validate:
    # ... existente ...
  build-gymops:
    name: Build /gymops (path-aware)
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: pnpm/action-setup@v4
      - uses: actions/setup-node@v4
        with: { node-version: 20, cache: pnpm }
      - run: pnpm install --frozen-lockfile
      - run: pnpm --filter @gymops/db generate
      - run: pnpm --filter @gymops/web build
        env:
          NEXT_PUBLIC_API_URL: /gymops/api
          NEXT_PUBLIC_APP_BASE_PATH: /gymops
      # smoke: verificar que o output tem o basePath aplicado
      - run: |
          grep -q '/gymops' apps/web/.next/build-manifest.json || (echo "basePath não aplicado" && exit 1)
```

### Boas práticas

- **Sempre upload do report Playwright** com `if: always()`.
- **Cache** do `pnpm` e do `~/.cache/ms-playwright`.
- **Timeouts** sãs: jobs de até 30 minutos.
- **Matrix builds** para Node 20 (versão suportada do projeto).
- **Fail-fast: false** se houver matriz — quero ver todos os erros.

---

## Como reportar uma falha de teste

1. Salvar o report Playwright (artefato do CI).
2. Abrir issue com:
   - Link para o run do CI
   - Comportamento esperado × observado
   - Trace + screenshot
3. Se for regressão de feature: vincular com o PR que introduziu.
4. Adicionar ao [`docs/backlog.md`](backlog.md) como `BUG-xxx` se for problema persistente.

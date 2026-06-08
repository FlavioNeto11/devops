---
applyTo: "apps/**/*.test.ts,apps/**/*.spec.ts,apps/web/e2e/**/*.ts,tests/**/*.ts"
---

# Instruções — Testes (Vitest + Playwright)

Aplicam-se a todos os arquivos de teste.

## Stack

- **Vitest** — testes unitários e de integração da API (`apps/api/`)
- **Playwright** — testes E2E (`apps/web/e2e/`)
- Banco real PostgreSQL (não mockar)

## Princípios

1. **Cobertura por fluxo de negócio**, não por arquivo. Critérios em [`docs/e2e-business-flows.md`](../../docs/e2e-business-flows.md).
2. **Não criar teste superficial** que apenas verifica "página carrega" ou "endpoint responde 200" — exigir asserção de comportamento, RBAC, side effect ou estado.
3. **Testar RBAC real** — cobrir owner, org_manager, unit_manager, area_leader, executor, viewer em pontos sensíveis.
4. **Seed consistente** — usar helpers, não recriar manualmente em cada teste.
5. **Isolamento** — `beforeEach` chama `resetDb()` para evitar interferência.

## Vitest (API)

### Helpers

Localizados em `apps/api/src/test/helpers.ts`:

```typescript
import { testDb, getApp, resetDb, createOrg, createUser, createUnit, createArea, createActivity } from './helpers.js';
```

- `testDb` — PrismaClient apontando para `DATABASE_URL`
- `getApp()` — Fastify instance (singleton)
- `resetDb()` — TRUNCATE em todas as tabelas
- Factories: `createOrg`, `createUser`, `createUnit`, `createArea`, `createActivity`

### Padrão de teste

```typescript
import { describe, beforeEach, it, expect } from 'vitest';
import { getApp, resetDb, createOrg, createUser } from './helpers.js';

describe('POST /units', () => {
  beforeEach(async () => {
    await resetDb();
  });

  it('cria unidade quando role é org_manager', async () => {
    const app = await getApp();
    const org = await createOrg();
    const user = await createUser({ email: 'mgr@x.com' });
    await testDb.membership.create({ data: { userId: user.id, organizationId: org.id, role: 'org_manager', scopeType: 'organization', scopeId: org.id } });
    const token = await loginAs(user);

    const res = await app.inject({
      method: 'POST', url: '/units',
      headers: { authorization: `Bearer ${token}` },
      payload: { name: 'Centro', organizationId: org.id },
    });

    expect(res.statusCode).toBe(201);
    expect(res.json().data.name).toBe('Centro');
    expect(await testDb.unit.count({ where: { organizationId: org.id } })).toBe(1);
  });

  it('retorna 403 quando role é executor', async () => {
    // ...
    expect(res.statusCode).toBe(403);
    expect(await testDb.unit.count()).toBe(0);  // efeito não aconteceu
  });
});
```

### Sempre testar

- **Happy path**: a operação acontece e tem efeito mensurável.
- **403 por RBAC**: role insuficiente é rejeitado E **não tem efeito colateral** (verificar `count` no DB).
- **422 por Zod**: payload inválido é rejeitado.
- **Idempotência** quando aplicável (re-execução não duplica).

### Atualizar `resetDb` ao adicionar tabela

Quando adicionar nova entidade Prisma, atualizar `apps/api/src/test/helpers.ts` para incluí-la no `TRUNCATE` (em ordem de dependência: filhos antes de pais).

### Mock de Redis

Por padrão, BullMQ degrada graciosamente sem `REDIS_URL`. Para testar o fallback inline:

```typescript
import * as redis from '../lib/redis.js';
vi.spyOn(redis, 'cacheGet').mockResolvedValue('1');
```

## Playwright (E2E)

### Localização e estrutura

```
apps/web/e2e/
├── auth.spec.ts
├── activity.spec.ts
├── rbac.spec.ts
├── helpers/
│   ├── login.ts            # loginAs(page, role)
│   ├── factories.ts        # createOrgWithSeed(role)
│   └── selectors.ts        # data-testid centralizados
└── playwright.config.ts
```

### Padrão de spec

```typescript
import { test, expect } from '@playwright/test';
import { loginAs } from './helpers/login';

test.describe('Fluxo 5 — Convite e onboarding', () => {
  test('owner convida usuário → email gera token → usuário aceita e logga', async ({ page, request }) => {
    await loginAs(page, 'owner');
    await page.goto('/settings/team');
    await page.getByTestId('invite-button').click();
    await page.getByTestId('invite-email-input').fill('novo@x.com');
    await page.getByTestId('invite-role-select').selectOption('executor');
    await page.getByTestId('invite-submit').click();

    // Assert: convite criado no DB
    const invitation = await fetchLatestInvitation('novo@x.com');
    expect(invitation.status).toBe('pending');

    // Simula clique no link do email (token público)
    await page.goto(`/invite/${invitation.rawToken}`);
    await expect(page.getByText('Você foi convidado')).toBeVisible();

    await page.getByTestId('inv-name').fill('Novo Usuário');
    await page.getByTestId('inv-pass').fill('senha123');
    await page.getByTestId('inv-confirm').fill('senha123');
    await page.getByTestId('inv-submit').click();

    // Assert: redirect para login, usuário criado
    await expect(page).toHaveURL(/\/login/);
    await loginAs(page, 'executor', { email: 'novo@x.com', password: 'senha123' });
    await expect(page).toHaveURL(/\/me/);
  });
});
```

### Critérios obrigatórios

- **Cobrir um fluxo de negócio inteiro**, não uma interação isolada.
- Usar `data-testid` (estável, traduzível na UI sem quebrar teste).
- Asserir **efeito colateral real** (linha no DB, redirect, mudança de estado), não apenas presença de texto.
- Cobrir o caminho feliz E pelo menos um caminho de erro/negação.

### data-testid no frontend

Convenção: kebab-case, descritiva.

```tsx
<Button data-testid="invite-submit">Enviar convite</Button>
<Input data-testid="invite-email-input" />
<tr data-testid={`activity-row-${activity.id}`}>
```

## CI

- `.github/workflows/ci.yml` — lint + typecheck + test (vitest) + build em cada PR
- `.github/workflows/e2e.yml` — Playwright em PR (draft, atualizar Sprint 15)
- Falha bloqueia merge

## Seed para testes

Seed de teste **separado** do seed de dev. Para vitest, factories criam só o necessário por teste. Para Playwright, seed compartilhado em `apps/web/e2e/seed.sql` ou via API.

## Performance

- vitest: `--pool=threads` quando muitos arquivos
- Playwright: paralelismo controlado por `playwright.config.ts`

## O que NÃO testar

- Implementação interna de bibliotecas (Prisma, Fastify, React Query) — confiar na lib.
- Endpoints triviais sem regra de negócio (ex: `/health`) — uma asserção é suficiente.
- Detalhes visuais (cores, tamanhos) — exceto regressão crítica.

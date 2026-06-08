# Skill: Create Playwright E2E

## Objetivo

Criar spec Playwright cobrindo fluxo de negócio inteiro com assertions de efeito real e cobertura de RBAC.

## Quando usar

- Fluxo de negócio sem cobertura E2E
- Cobertura insuficiente em fluxo crítico
- Conclusão de sprint (criar/atualizar specs do que foi entregue)

## Quando NÃO usar

- Teste de interação isolada (use vitest)
- Teste visual / regressão visual (não no escopo do MVP)

## Entradas esperadas

- Fluxo coberto (qual em `docs/e2e-business-flows.md`)
- Personas envolvidas
- Pré-condições (seed)

## Arquivos de contexto

1. [`docs/e2e-business-flows.md`](../e2e-business-flows.md) — **critérios canônicos**
2. [`.github/instructions/tests.instructions.md`](../../.github/instructions/tests.instructions.md)
3. `apps/web/e2e/` — specs existentes e helpers
4. `apps/web/playwright.config.ts`

## Passos

1. **Identificar o fluxo** em `docs/e2e-business-flows.md` (cenários numerados)
2. **Preparar helpers**:
   - `apps/web/e2e/helpers/login.ts` — `loginAs(page, role)`
   - `apps/web/e2e/helpers/api.ts` — `fetchFromAdminApi(...)` para asserir DB
3. **Criar spec** `apps/web/e2e/<fluxo>.spec.ts`
4. **Estrutura**: `test.describe` por fluxo → `test()` por cenário
5. **Asserções de efeito**:
   - `await expect(page.getByTestId('x')).toBeVisible()`
   - `await expect(page).toHaveURL(/.../)`
   - Consultar backend via helper para confirmar persistência
6. **data-testid** no frontend — adicionar se não existirem
7. **Rodar local** — `pnpm --filter @gymops/web test:e2e`
8. **Atualizar `docs/e2e-business-flows.md`** marcando cenário como `✅ Coberto`

## Padrão de spec

```typescript
import { test, expect } from '@playwright/test';
import { loginAs } from './helpers/login';

test.describe('Fluxo 5 — Convite e onboarding', () => {
  test('owner convida → email gera token → usuário aceita', async ({ page }) => {
    await loginAs(page, 'owner');
    await page.goto('/settings/team');
    await page.getByTestId('invite-button').click();
    await page.getByTestId('invite-email-input').fill('novo@x.com');
    await page.getByTestId('invite-role-select').selectOption('executor');
    await page.getByTestId('invite-submit').click();

    // Asserir backend
    const inv = await fetchLatestInvitation('novo@x.com');
    expect(inv.status).toBe('pending');

    // Simular acceptance flow
    await page.goto(`/invite/${inv.rawToken}`);
    await page.getByTestId('inv-pass').fill('senha123');
    await page.getByTestId('inv-confirm').fill('senha123');
    await page.getByTestId('inv-submit').click();

    await expect(page).toHaveURL(/\/login/);
  });

  test('role insuficiente: executor não vê botão de convidar', async ({ page }) => {
    await loginAs(page, 'executor');
    await page.goto('/settings/team');
    await expect(page.getByTestId('invite-button')).not.toBeVisible();
  });
});
```

## Princípios

- **Cobrir fluxo inteiro**, não interação isolada
- **Pelo menos 2 cenários**: happy + erro/RBAC
- **Asserções de efeito** (DB, URL, estado)
- **data-testid** em vez de seletor frágil
- Evitar `page.waitForTimeout(N)` — usar `expect.poll` ou `waitForLoadState`

## Saída esperada

- Spec `.spec.ts` criada
- data-testid adicionados no frontend se necessário
- Spec passa local
- `docs/e2e-business-flows.md` atualizado

## Erros comuns

- Teste superficial (só `await page.goto()` + `expect(page).not.toBeNull()`)
- Selector por texto traduzível (`page.getByText('Salvar')` — quebra ao traduzir)
- Falta de seed limpo (testes interferem entre si)
- `waitForTimeout` em vez de espera condicional (flaky)
- Não asserir backend (só UI)

## Checklist

- [ ] Fluxo inteiro coberto
- [ ] 2+ cenários (happy + edge)
- [ ] Asserção de efeito (não só UI)
- [ ] data-testid usado
- [ ] Spec passa local
- [ ] `docs/e2e-business-flows.md` atualizado
- [ ] Sem `waitForTimeout`

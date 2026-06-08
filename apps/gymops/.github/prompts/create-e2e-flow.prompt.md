---
mode: agent
description: Criar E2E Playwright orientado a fluxo de negócio.
---

# Criar E2E Playwright (fluxo de negócio)

## Quando usar

Quando o pedido for criar/atualizar suíte E2E baseada em fluxo de negócio (não em interação isolada).

## Contexto obrigatório

1. [`docs/e2e-business-flows.md`](../../docs/e2e-business-flows.md) — **critérios de aceite canônicos**
2. [`.github/instructions/tests.instructions.md`](../instructions/tests.instructions.md) — padrões de teste
3. `apps/web/e2e/` — specs existentes e helpers
4. `apps/web/playwright.config.ts` — configuração

## Princípios

1. **Cobrir um fluxo inteiro**, não interação isolada (clicar em botão).
2. **Asserir efeito colateral real** (linha no banco, redirect, mudança de estado, email enviado).
3. **RBAC end-to-end**: testar pelo menos 2 roles diferentes (autorizado e negado).
4. **data-testid estáveis** — não selecionar por texto traduzível.

## Passos

1. **Identificar o fluxo**
   - Achar a seção em `docs/e2e-business-flows.md`
   - Listar personas, pré-condições, passos, critérios de aceite

2. **Preparar seed/factories**
   - Helpers em `apps/web/e2e/helpers/`
   - `loginAs(page, role)` — abstrair login
   - Garantir isolamento entre testes (`test.beforeEach`)

3. **Implementar spec**
   - Nomear `apps/web/e2e/<fluxo>.spec.ts`
   - Cobrir caminho feliz primeiro
   - Adicionar caminho de erro/negação

4. **Asserir corretamente**
   - Visibilidade: `await expect(page.getByTestId('x')).toBeVisible()`
   - Estado de URL: `await expect(page).toHaveURL(/\/me/)`
   - Backend: consultar DB via helper ou API admin (não confiar só na UI)

5. **Adicionar `data-testid` no frontend** se não existirem

6. **Rodar localmente**
   - `pnpm --filter @gymops/web test:e2e`
   - Se falhar em CI, garantir que não é flakiness — usar `await expect.poll` se necessário

7. **Atualizar status**
   - Em `docs/e2e-business-flows.md`, marcar o cenário como `✅ Coberto` ou `⚠️ Parcial`

## Padrão de spec

```typescript
import { test, expect } from '@playwright/test';
import { loginAs } from './helpers/login';
import { fetchFromAdminApi } from './helpers/api';

test.describe('Fluxo X — Nome do fluxo', () => {
  test.beforeEach(async () => {
    // seed limpo via API admin ou SQL direto
  });

  test('happy path: persona faz ação → efeito X observável', async ({ page }) => {
    await loginAs(page, 'org_manager');
    await page.goto('/settings/units');
    await page.getByTestId('new-unit-button').click();
    await page.getByTestId('unit-name-input').fill('Centro');
    await page.getByTestId('unit-submit').click();
    await expect(page.getByText('Centro')).toBeVisible();

    // Assert: backend reflete
    const units = await fetchFromAdminApi('/units?organizationId=...');
    expect(units.data.find(u => u.name === 'Centro')).toBeDefined();
  });

  test('role insuficiente: executor não vê botão de criar', async ({ page }) => {
    await loginAs(page, 'executor');
    await page.goto('/settings/units');
    await expect(page.getByTestId('new-unit-button')).not.toBeVisible();
  });
});
```

## Critérios de aceite

- [ ] Fluxo inteiro coberto (não interação isolada)
- [ ] Pelo menos 2 cenários: happy + erro/RBAC
- [ ] Asserção de efeito colateral (DB, URL, estado)
- [ ] data-testid usado em vez de seletores frágeis
- [ ] Spec passa local e em CI
- [ ] `docs/e2e-business-flows.md` atualizado com o status

## Comandos de validação

```bash
pnpm --filter @gymops/web test:e2e
# UI mode para debug:
pnpm --filter @gymops/web test:e2e:ui
```

## Formato da resposta final

1. Fluxo coberto (qual?)
2. Cenários implementados (happy + edge)
3. Arquivos criados/alterados
4. data-testid adicionados ao frontend
5. Resultado da execução
6. Status atualizado em `docs/e2e-business-flows.md`

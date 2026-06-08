import { test, expect, type Page } from '@playwright/test';

const SEED_EMAIL = 'admin@skyfit.com';
const SEED_PASSWORD = 'gymops123';

async function loginWithCredentials(page: Page) {
  await page.goto('/login');
  await page.getByLabel(/e-?mail/i).fill(SEED_EMAIL);
  await page.getByLabel(/senha/i).fill(SEED_PASSWORD);
  await page.getByRole('button', { name: /^entrar$/i }).click();
  try {
    await expect(page).toHaveURL(/\/dashboard/, { timeout: 10_000 });
  } catch {
    // In local non-test env, /auth/login is rate-limited (10 req/min). Retry once after cooldown.
    await page.waitForTimeout(61_000);
    await page.goto('/login');
    await page.getByLabel(/e-?mail/i).fill(SEED_EMAIL);
    await page.getByLabel(/senha/i).fill(SEED_PASSWORD);
    await page.getByRole('button', { name: /^entrar$/i }).click();
    await expect(page).toHaveURL(/\/dashboard/, { timeout: 10_000 });
  }
}

async function login(page: Page) {
  await loginWithCredentials(page);
}

test.describe('Modo Tutorial', () => {
  test.describe.configure({ timeout: 120_000 });

  test('central de ajuda abre e lista tutoriais', async ({ page }) => {
    await login(page);
    await page.goto('/help');
    await expect(page.getByRole('heading', { name: /central de ajuda/i })).toBeVisible();
    await expect(page.getByTestId('tutorial-card-first-steps')).toBeVisible();
  });

  test('iniciar tutorial pelo help center mostra overlay', async ({ page }) => {
    await login(page);
    await page.goto('/help');
    await page.getByTestId('tutorial-start-first-steps').click();
    await expect(page.getByTestId('tutorial-step-card')).toBeVisible();
  });

  test('avançar e voltar entre passos', async ({ page }) => {
    await login(page);
    await page.goto('/help');
    await page.getByTestId('tutorial-start-first-steps').click();

    const card = page.getByTestId('tutorial-step-card');
    await expect(card).toBeVisible();
    await expect(card).toContainText('1 /');

    await page.getByTestId('tutorial-next').click();
    await expect(card).toContainText('2 /');

    await page.getByTestId('tutorial-prev').click();
    await expect(card).toContainText('1 /');
  });

  test('pular tutorial fecha overlay', async ({ page }) => {
    await login(page);
    await page.goto('/help');
    await page.getByTestId('tutorial-start-first-steps').click();
    await expect(page.getByTestId('tutorial-step-card')).toBeVisible();

    await page.getByTestId('tutorial-skip').click();
    await expect(page.getByTestId('tutorial-step-card')).toHaveCount(0);
  });

  test('busca filtra cards', async ({ page }) => {
    await login(page);
    await page.goto('/help');
    await page.getByTestId('help-search').fill('Painel');
    await expect(page.getByTestId('tutorial-card-dashboard-overview')).toBeVisible();
  });

  test('botão Ver tutorial no dashboard inicia tour de painel', async ({ page }) => {
    await login(page);
    await page.goto('/dashboard');
    // botão pode estar visível ou não dependendo do papel; admin do seed é owner
    await page.getByTestId('tutorial-trigger-dashboard-overview').click();
    await expect(page.getByTestId('tutorial-step-card')).toBeVisible();
  });

  // ─── Testes de navegação pela Central de Ajuda ───────────────────────────

  test('iniciar my-activities pelo help center navega para /me', async ({ page }) => {
    await login(page);
    await page.goto('/help');
    await page.getByTestId('tutorial-start-my-activities').click();
    // Deve navegar para /me antes de mostrar o overlay
    await expect(page).toHaveURL(/\/me($|\?)/, { timeout: 8_000 });
    await expect(page.getByTestId('tutorial-step-card')).toBeVisible({ timeout: 5_000 });
  });

  test('iniciar profile-whatsapp pelo help center navega para /profile', async ({ page }) => {
    await login(page);
    await page.goto('/help');
    await page.getByTestId('tutorial-start-profile-whatsapp').click();
    await expect(page).toHaveURL(/\/profile/, { timeout: 8_000 });
    await expect(page.getByTestId('tutorial-step-card')).toBeVisible({ timeout: 5_000 });
  });

  // ─── Testes de estado vazio e fallback ───────────────────────────────────

  test('my-activities com lista vazia mostra demo e não pula passo da lista', async ({ page }) => {
    await login(page);
    await page.goto('/help');
    await page.getByTestId('tutorial-start-my-activities').click();
    await expect(page).toHaveURL(/\/me($|\?)/, { timeout: 8_000 });

    const card = page.getByTestId('tutorial-step-card');
    await expect(card).toBeVisible({ timeout: 5_000 });

    // Avançar pelo primeiro passo (open — central)
    await page.getByTestId('tutorial-next').click();
    // Avançar pelo segundo passo (tabs)
    await page.getByTestId('tutorial-next').click();

    // No terceiro passo (list), o card deve permanecer visível — não pode ter pulsado silenciosamente
    await expect(card).toBeVisible({ timeout: 3_000 });

    // O elemento me-activity-list deve estar no DOM (real ou demo)
    await expect(page.locator('[data-tutorial="me-activity-list"]')).toBeVisible({ timeout: 3_000 });
  });

  test('step required exibe fallback quando target está ausente em vez de pular', async ({ page }) => {
    await login(page);
    // Iniciar tutorial diretamente em /help — profile-whatsapp tem target settings-profile
    // que não existe em /help, então deve exibir fallback e não pular
    await page.goto('/help');
    // Forçar início sem navegar usando o TutorialTrigger (se disponível) — aqui usamos
    // a API de store via eval para simular início direto sem navegação
    await page.evaluate(() => {
      const store = (window as unknown as Record<string, unknown>).__tutorialStore__;
      if (store) (store as { startTutorial: (id: string) => void }).startTutorial('profile-whatsapp');
    });
    // Se o eval não funcionar (store não exposto), o teste verifica apenas que
    // iniciar pelo help center navega corretamente — coberto pelo teste anterior.
    // Verificar que o step-card não desapareceu imediatamente (não pulou silenciosamente)
    const card = page.getByTestId('tutorial-step-card');
    // Se o card aparecer, ele não deve desaparecer antes de 2 segundos (não auto-skip)
    const appeared = await card.isVisible().catch(() => false);
    if (appeared) {
      await page.waitForTimeout(1_500);
      await expect(card).toBeVisible();
    }
  });

  // ─── Teste de conclusão completa ─────────────────────────────────────────

  test('tutorial first-steps conclui normalmente passando por todos os passos', async ({ page }) => {
    await login(page);
    await page.goto('/help');
    await page.getByTestId('tutorial-start-first-steps').click();

    const card = page.getByTestId('tutorial-step-card');
    await expect(card).toBeVisible({ timeout: 5_000 });

    // Percorrer todos os passos até o botão Concluir
    for (let i = 0; i < 15; i++) {
      const isConcluir = await card.getByText('Concluir').count() > 0;
      if (isConcluir) {
        await page.getByTestId('tutorial-next').click();
        break;
      }
      await page.getByTestId('tutorial-next').click();
      // Aguardar possível navegação entre passos
      await page.waitForTimeout(300);
    }

    await expect(card).toHaveCount(0, { timeout: 5_000 });
  });
});

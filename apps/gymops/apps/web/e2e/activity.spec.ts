import { test, expect } from '@playwright/test';

test.describe('Activity creation', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/login');
    await page.getByLabel(/e-?mail/i).fill('admin@skyfit.com');
    await page.getByLabel(/senha/i).fill('gymops123');
    await page.getByRole('button', { name: /^entrar$/i }).click();
    await expect(page).toHaveURL(/\/dashboard/, { timeout: 10_000 });
  });

  test('can create an activity and it appears in the list', async ({ page }) => {
    // Navigate to activities view
    await page.getByRole('link', { name: /atividade|activit/i }).first().click();
    await expect(page).toHaveURL(/\/activities|\/unit/, { timeout: 5_000 });

    // Open creation form
    const createBtn = page.getByRole('button', { name: /nova atividade|criar|add/i }).first();
    await createBtn.click();

    const title = `E2E Test Activity ${Date.now()}`;
    await page.getByLabel(/título|title/i).fill(title);

    // Select area if picker is present
    const areaPicker = page.getByLabel(/área|area/i).first();
    if (await areaPicker.isVisible()) {
      await areaPicker.click();
      await page.getByRole('option').first().click();
    }

    await page.getByRole('button', { name: /salvar|criar|confirmar/i }).click();

    // Activity should appear in the list
    await expect(page.getByText(title)).toBeVisible({ timeout: 8_000 });
  });
});

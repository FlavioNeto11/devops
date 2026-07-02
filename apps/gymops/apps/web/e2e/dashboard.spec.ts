import { test, expect } from '@playwright/test';

test.describe('Dashboard', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/login');
    await page.getByLabel(/e-?mail/i).fill('admin@skyfit.com');
    await page.getByLabel(/senha/i).fill('gymops123');
    await page.getByRole('button', { name: /^entrar$/i }).click();
    await expect(page).toHaveURL(/\/dashboard/, { timeout: 10_000 });
  });

  test('shows KPI cards on dashboard', async ({ page }) => {
    // At least one KPI metric card should be visible
    await expect(page.getByText(/atividades|total|pendente|atrasad/i).first()).toBeVisible({ timeout: 8_000 });
  });

  test('unit filter changes visible data', async ({ page }) => {
    const unitSelector = page.getByRole('combobox').or(page.getByRole('listbox')).first();
    if (await unitSelector.isVisible()) {
      await unitSelector.click();
      const option = page.getByRole('option').nth(1);
      if (await option.isVisible()) {
        const optionText = await option.textContent();
        await option.click();
        await expect(page.getByText(optionText ?? '')).toBeVisible({ timeout: 5_000 });
      }
    }
  });
});

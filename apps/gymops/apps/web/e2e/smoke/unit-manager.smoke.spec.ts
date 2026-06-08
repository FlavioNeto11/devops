import { test, expect } from '@playwright/test';
import { PROFILES, loginAs } from './fixtures';

const P = PROFILES.unit_manager;

test.describe('Smoke — unit_manager', () => {
  test.beforeEach(async ({ page }) => {
    await loginAs(page, P);
  });

  test('reaches dashboard', async ({ page }) => {
    await expect(page).toHaveURL(/dashboard/, { timeout: 10_000 });
  });

  test('sees activities page', async ({ page }) => {
    await page.goto('/activities');
    await expect(page.getByRole('heading', { name: /atividades/i })).toBeVisible({ timeout: 10_000 });
  });

  test('can navigate to own unit area', async ({ page }) => {
    await page.goto('/dashboard');
    // Should see the unit dashboard (not org-level)
    await expect(page).not.toHaveURL(/login/, { timeout: 5_000 });
  });

  test('create activity button is visible', async ({ page }) => {
    await page.goto('/activities');
    await expect(page.getByRole('button', { name: /nova atividade/i })).toBeVisible({ timeout: 10_000 });
  });
});

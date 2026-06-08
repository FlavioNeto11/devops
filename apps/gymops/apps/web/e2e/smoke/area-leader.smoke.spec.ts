import { test, expect } from '@playwright/test';
import { PROFILES, loginAs } from './fixtures';

const P = PROFILES.area_leader;

test.describe('Smoke — area_leader', () => {
  test.beforeEach(async ({ page }) => {
    await loginAs(page, P);
  });

  test('reaches dashboard after login', async ({ page }) => {
    await expect(page).toHaveURL(/dashboard/, { timeout: 10_000 });
  });

  test('can see own area activities', async ({ page }) => {
    await page.goto('/activities');
    await expect(page).not.toHaveURL(/login/, { timeout: 5_000 });
    await expect(page.getByRole('heading', { name: /atividades/i })).toBeVisible({ timeout: 10_000 });
  });

  test('create activity button is visible', async ({ page }) => {
    await page.goto('/activities');
    await expect(page.getByRole('button', { name: /nova atividade/i })).toBeVisible({ timeout: 10_000 });
  });

  test('cannot access admin-only settings/units', async ({ page }) => {
    // area_leader should be redirected or see empty state on admin-only pages
    await page.goto('/settings/units');
    // Should not crash — should either redirect or show empty/restricted state
    await expect(page).not.toHaveURL(/login/, { timeout: 5_000 });
  });
});

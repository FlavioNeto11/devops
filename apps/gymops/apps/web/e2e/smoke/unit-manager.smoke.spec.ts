import { test, expect } from '@playwright/test';
import { PROFILES, loginAs } from './fixtures';

const P = PROFILES.unit_manager;

test.describe('Smoke — unit_manager', () => {
  test.beforeEach(async ({ page }) => {
    await loginAs(page, P);
  });

  test('lands on role home after login (unit_manager → unit)', async ({ page }) => {
    // resolveRedirect (login/page.tsx): unit_manager → /units/<primaryUnitId> (fallback /dashboard).
    // O assert /dashboard universal era defasado — a landing e por papel (BUG-005 por design).
    await expect(page).toHaveURL(/\/(units\/[0-9a-f-]+|dashboard)/i, { timeout: 10_000 });
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

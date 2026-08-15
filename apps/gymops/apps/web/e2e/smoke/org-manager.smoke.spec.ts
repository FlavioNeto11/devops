import { test, expect } from '@playwright/test';
import { authStatePath } from './fixtures';

// Auth via storageState produced by e2e/auth.setup.ts (1 login per role for the
// whole suite) — keeps the suite under the real /auth/login rate limit (10/min).
test.use({ storageState: authStatePath('org_manager') });

test.describe('Smoke — org_manager', () => {
  test('reaches dashboard (role-based redirect)', async ({ page }) => {
    // App truth (resolveRedirect + auth-bootstrap): authenticated org_manager
    // hitting /login is redirected to /dashboard.
    await page.goto('/login');
    await expect(page).toHaveURL(/dashboard/, { timeout: 10_000 });
  });

  test('sees activities page', async ({ page }) => {
    await page.goto('/activities');
    await expect(page.getByRole('heading', { name: /atividades/i })).toBeVisible({ timeout: 10_000 });
  });

  test('can access settings/units', async ({ page }) => {
    await page.goto('/settings/units');
    await expect(page.getByRole('heading', { name: /unidades/i })).toBeVisible({ timeout: 10_000 });
  });

  test('can access settings/team', async ({ page }) => {
    await page.goto('/settings/team');
    await expect(page.getByRole('heading', { name: /equipe/i })).toBeVisible({ timeout: 10_000 });
  });

  test('org settings page is not accessible (owner only)', async ({ page }) => {
    await page.goto('/settings/organization');
    // App truth (settings/organization/page.tsx): non-owner sees "Apenas owners
    // podem acessar esta página." — rendered only after auth-bootstrap hydrates
    // the role on a cold storageState load, so a retrying locator assertion is
    // required (one-shot page.content() races the SSR shell).
    await expect(page.getByText(/apenas owners podem acessar/i)).toBeVisible({ timeout: 10_000 });
  });
});

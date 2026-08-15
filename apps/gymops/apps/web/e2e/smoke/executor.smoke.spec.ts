import { test, expect } from '@playwright/test';
import { authStatePath, loadLoginContext, type LoginContext } from './fixtures';

// Auth via storageState produced by e2e/auth.setup.ts (1 login per role for the
// whole suite) — keeps the suite under the real /auth/login rate limit (10/min).
test.use({ storageState: authStatePath('executor') });

test.describe('Smoke — executor', () => {
  let ctx: LoginContext;

  test.beforeEach(() => {
    ctx = loadLoginContext('executor');
  });

  test('reaches personal view (BUG-005 regression)', async ({ page }) => {
    // executor has area-level membership — the session must resolve the auth
    // context via unit_areas (BUG-005) and stay in the app, not bounce to /login.
    // App truth (resolveRedirect): executor lands on /me (personal view).
    await page.goto('/login');
    await expect(page).toHaveURL(/\/me/, { timeout: 10_000 });
  });

  test('sees activities page', async ({ page }) => {
    await page.goto('/activities');
    await expect(page.getByRole('heading', { name: /atividades/i })).toBeVisible({ timeout: 10_000 });
  });

  test('create activity button is visible on unit page (BUG-006 regression)', async ({ page }) => {
    // canCreate() includes executor (BUG-006) and unit access for area-scoped
    // members resolves via unit_areas (BUG-007). App truth: the "Nova atividade"
    // CTA lives on the UNIT page (units/[id]); /activities is browse-only.
    expect(ctx.primaryUnitId, 'login must resolve primaryUnitId via unit_areas (BUG-005)').toBeTruthy();
    await page.goto(`/units/${ctx.primaryUnitId}`);
    await expect(page.getByRole('button', { name: /nova atividade/i })).toBeVisible({ timeout: 10_000 });
  });

  test('personal view loads without error', async ({ page }) => {
    await page.goto('/my-tasks');
    await expect(page).not.toHaveURL(/login/, { timeout: 5_000 });
  });
});

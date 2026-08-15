import { test, expect } from '@playwright/test';
import { authStatePath, loadLoginContext, type LoginContext } from './fixtures';

// Auth via storageState produced by e2e/auth.setup.ts (1 login per role for the
// whole suite) — keeps the suite under the real /auth/login rate limit (10/min).
test.use({ storageState: authStatePath('unit_manager') });

test.describe('Smoke — unit_manager', () => {
  let ctx: LoginContext;

  test.beforeEach(() => {
    ctx = loadLoginContext('unit_manager');
  });

  test('lands on own unit page (role-based redirect)', async ({ page }) => {
    // App truth (resolveRedirect + auth-bootstrap): an authenticated unit_manager
    // hitting /login is redirected to /units/<primaryUnitId> — NOT /dashboard
    // (owner/org_manager only).
    expect(ctx.primaryUnitId, 'login must resolve primaryUnitId for unit-scoped member').toBeTruthy();
    await page.goto('/login');
    await expect(page).toHaveURL(new RegExp(`/units/${ctx.primaryUnitId}`), { timeout: 10_000 });
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

  test('create activity button is visible on own unit page', async ({ page }) => {
    // App truth: the "Nova atividade" CTA lives on the UNIT page (units/[id],
    // behind canCreate()); the Central de Atividades (/activities) is browse-only.
    expect(ctx.primaryUnitId, 'login must resolve primaryUnitId for unit-scoped member').toBeTruthy();
    await page.goto(`/units/${ctx.primaryUnitId}`);
    await expect(page.getByRole('button', { name: /nova atividade/i })).toBeVisible({ timeout: 10_000 });
  });
});

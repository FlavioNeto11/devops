import { test, expect } from '@playwright/test';
import { PROFILES, loginAs, type LoginContext } from './fixtures';

const P = PROFILES.unit_manager;

test.describe('Smoke — unit_manager', () => {
  let ctx: LoginContext;

  test.beforeEach(async ({ page }) => {
    ctx = await loginAs(page, P);
  });

  test('lands on own unit page after login', async ({ page }) => {
    // App truth (resolveRedirect, login/page.tsx): unit_manager lands on
    // /units/<primaryUnitId> — NOT /dashboard (owner/org_manager only).
    expect(ctx.primaryUnitId, 'login must resolve primaryUnitId for unit-scoped member').toBeTruthy();
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

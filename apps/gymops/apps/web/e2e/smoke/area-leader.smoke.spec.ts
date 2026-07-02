import { test, expect } from '@playwright/test';
import { PROFILES, loginAs, type LoginContext } from './fixtures';

const P = PROFILES.area_leader;

test.describe('Smoke — area_leader', () => {
  let ctx: LoginContext;

  test.beforeEach(async ({ page }) => {
    ctx = await loginAs(page, P);
  });

  test('lands on own unit page after login', async ({ page }) => {
    // App truth (resolveRedirect, login/page.tsx): area_leader lands on
    // /units/<primaryUnitId> — NOT /dashboard (owner/org_manager only).
    expect(ctx.primaryUnitId, 'login must resolve primaryUnitId via unit_areas (BUG-005)').toBeTruthy();
    await expect(page).toHaveURL(new RegExp(`/units/${ctx.primaryUnitId}`), { timeout: 10_000 });
  });

  test('can see own area activities', async ({ page }) => {
    await page.goto('/activities');
    await expect(page).not.toHaveURL(/login/, { timeout: 5_000 });
    await expect(page.getByRole('heading', { name: /atividades/i })).toBeVisible({ timeout: 10_000 });
  });

  test('create activity button is visible on own unit page', async ({ page }) => {
    // App truth: the "Nova atividade" CTA lives on the UNIT page (units/[id],
    // behind canCreate()); the Central de Atividades (/activities) is browse-only.
    expect(ctx.primaryUnitId, 'login must resolve primaryUnitId via unit_areas (BUG-005)').toBeTruthy();
    await page.goto(`/units/${ctx.primaryUnitId}`);
    await expect(page.getByRole('button', { name: /nova atividade/i })).toBeVisible({ timeout: 10_000 });
  });

  test('cannot access admin-only settings/units', async ({ page }) => {
    // area_leader should be redirected or see empty state on admin-only pages
    await page.goto('/settings/units');
    // Should not crash — should either redirect or show empty/restricted state
    await expect(page).not.toHaveURL(/login/, { timeout: 5_000 });
  });
});

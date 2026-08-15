import { test, expect } from '@playwright/test';
import { API_URL, authStatePath, freshAccessToken, loadLoginContext, type LoginContext } from './fixtures';

// Auth via storageState produced by e2e/auth.setup.ts (1 login per role for the
// whole suite) — keeps the suite under the real /auth/login rate limit (10/min).
test.use({ storageState: authStatePath('owner') });

test.describe('Smoke — owner', () => {
  let ctx: LoginContext;

  test.beforeEach(() => {
    ctx = loadLoginContext('owner');
  });

  test('reaches dashboard (role-based redirect)', async ({ page }) => {
    // App truth (resolveRedirect + auth-bootstrap): authenticated owner hitting
    // /login is redirected to /dashboard.
    await page.goto('/login');
    await expect(page).toHaveURL(/dashboard/, { timeout: 10_000 });
  });

  test('sees create button on a unit page', async ({ page, request }) => {
    // App truth: the "Nova atividade" CTA lives on the UNIT page (units/[id],
    // behind canCreate()); the Central de Atividades (/activities) is browse-only.
    // Owner is org-scoped (no primaryUnitId) — resolve a unit via the API.
    const token = await freshAccessToken(request);
    const res = await request.get(`${API_URL}/units?organizationId=${ctx.organizationId}`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    expect(res.ok()).toBeTruthy();
    const body = (await res.json()) as { data?: Array<{ id: string }> };
    const unitId = body.data?.[0]?.id;
    expect(unitId, 'seed must create at least one unit').toBeTruthy();

    await page.goto(`/units/${unitId}`);
    await expect(page.getByRole('button', { name: /nova atividade/i })).toBeVisible({ timeout: 10_000 });
  });

  test('can access settings/units', async ({ page }) => {
    await page.goto('/settings/units');
    await expect(page.getByRole('heading', { name: /unidades/i })).toBeVisible({ timeout: 10_000 });
  });

  test('can access settings/areas', async ({ page }) => {
    await page.goto('/settings/areas');
    await expect(page.getByRole('heading', { name: /áreas/i })).toBeVisible({ timeout: 10_000 });
  });

  test('can access settings/team', async ({ page }) => {
    await page.goto('/settings/team');
    await expect(page.getByRole('heading', { name: /equipe/i })).toBeVisible({ timeout: 10_000 });
  });

  test('can access settings/organization', async ({ page }) => {
    await page.goto('/settings/organization');
    await expect(page.getByRole('heading', { name: /configurações da organização/i })).toBeVisible({ timeout: 10_000 });
  });
});

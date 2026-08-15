import { test, expect } from '@playwright/test';
import { API_URL, authStatePath, freshAccessToken, loadLoginContext, type LoginContext } from './smoke/fixtures';

// Auth via storageState produced by e2e/auth.setup.ts — no per-test UI login
// (keeps the suite under the real /auth/login rate limit, 10/min per IP).
test.use({ storageState: authStatePath('owner') });

test.describe('Activity creation', () => {
  let ctx: LoginContext;

  test.beforeEach(() => {
    ctx = loadLoginContext('owner');
  });

  test('can create an activity and it appears in the list', async ({ page, request }) => {
    // App truth: creation lives on the UNIT page (units/[id], behind canCreate());
    // the Central de Atividades (/activities) is browse/filter-only. Owner is
    // org-scoped (no primaryUnitId) — resolve a unit via the API.
    const token = await freshAccessToken(request);
    const res = await request.get(`${API_URL}/units?organizationId=${ctx.organizationId}`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    expect(res.ok()).toBeTruthy();
    const body = (await res.json()) as { data?: Array<{ id: string }> };
    const unitId = body.data?.[0]?.id;
    expect(unitId, 'seed must create at least one unit').toBeTruthy();

    await page.goto(`/units/${unitId}`);

    // Open creation dialog
    await page.getByRole('button', { name: /nova atividade/i }).click();
    const dialog = page.getByRole('dialog');
    await expect(dialog).toBeVisible({ timeout: 5_000 });

    // Área is required (native select) — pick the first real option
    await dialog.getByLabel(/área/i).selectOption({ index: 1 });

    const title = `E2E Test Activity ${Date.now()}`;
    await dialog.getByLabel(/título/i).fill(title);

    await dialog.getByRole('button', { name: /^criar atividade$/i }).click();

    // App truth: onCreated opens the ActivityDrawer (units/[id] sets selectedActivityId),
    // so the title renders TWICE — ActivityCard <span> in the list + the drawer <h2>.
    // A bare getByText(title) violates strict mode; assert the drawer heading (proves
    // creation AND the post-create drawer), then the list card entry specifically.
    // exact: true — o drawer acessível expõe um <h2 sr-only>"Atividade: {title}"</h2> (nome do
    // dialog) além do <h2> visível com o título; sem exact, o role=heading casaria os dois.
    await expect(page.getByRole('heading', { name: title, exact: true })).toBeVisible({ timeout: 8_000 });
  });
});

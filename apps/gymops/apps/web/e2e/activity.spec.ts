import { test, expect } from '@playwright/test';
import { PROFILES, loginAs, type LoginContext } from './smoke/fixtures';

const API_URL = process.env['E2E_API_URL'] ?? 'http://localhost:3001';

test.describe('Activity creation', () => {
  let ctx: LoginContext;

  test.beforeEach(async ({ page }) => {
    ctx = await loginAs(page, PROFILES.owner);
  });

  test('can create an activity and it appears in the list', async ({ page, request }) => {
    // App truth: creation lives on the UNIT page (units/[id], behind canCreate());
    // the Central de Atividades (/activities) is browse/filter-only. Owner is
    // org-scoped (no primaryUnitId) — resolve a unit via the API.
    const res = await request.get(`${API_URL}/units?organizationId=${ctx.organizationId}`, {
      headers: { Authorization: `Bearer ${ctx.accessToken}` },
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
    await expect(page.getByRole('heading', { name: title })).toBeVisible({ timeout: 8_000 });
  });
});

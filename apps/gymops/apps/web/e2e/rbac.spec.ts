import { test, expect, request as baseRequest } from '@playwright/test';

const API_URL = process.env['E2E_API_URL'] ?? 'http://localhost:3001';

// Helper: log in via API, return access token
async function apiLogin(email: string, password: string): Promise<string> {
  const ctx = await baseRequest.newContext({ baseURL: API_URL });
  const res = await ctx.post('/auth/login', { data: { email, password } });
  const body = await res.json() as { data?: { accessToken?: string } };
  await ctx.dispose();
  return body.data?.accessToken ?? '';
}

// Helper: register user + assign role via admin token
async function setupExecutorUser(adminToken: string, orgId: string): Promise<{ email: string; password: string }> {
  const ctx = await baseRequest.newContext({ baseURL: API_URL });
  const email = `executor-${Date.now()}@e2e.test`;
  const password = 'E2Epass123!';

  // Try to register via /auth/register (if available)
  const reg = await ctx.post('/auth/register', { data: { name: 'Executor E2E', email, password } });
  if (reg.ok()) {
    const body = await reg.json() as { data?: { id?: string } };
    const userId = body.data?.id;
    if (userId) {
      // Add as member with 'executor' role (lowest privilege)
      await ctx.post(`/organizations/${orgId}/members`, {
        data: { userId, role: 'executor' },
        headers: { Authorization: `Bearer ${adminToken}` },
      });
    }
  }
  await ctx.dispose();
  return { email, password };
}

test.describe('RBAC / permissions', () => {
  // ── Admin role ─────────────────────────────────────────────────────────────

  test('org_manager can see settings link in sidebar', async ({ page }) => {
    await page.goto('/login');
    await page.getByLabel(/e-?mail/i).fill('admin@skyfit.com');
    await page.getByLabel(/senha/i).fill('gymops123');
    await page.getByRole('button', { name: /entrar/i }).click();
    await expect(page).toHaveURL(/\/dashboard/, { timeout: 10_000 });
    await expect(page.getByRole('link', { name: /configura|settings/i })).toBeVisible({ timeout: 5_000 });
  });

  test('dashboard loads without JS errors for admin user', async ({ page }) => {
    const errors: string[] = [];
    page.on('pageerror', (err) => errors.push(err.message));

    await page.goto('/login');
    await page.getByLabel(/e-?mail/i).fill('admin@skyfit.com');
    await page.getByLabel(/senha/i).fill('gymops123');
    await page.getByRole('button', { name: /entrar/i }).click();
    await expect(page).toHaveURL(/\/dashboard/, { timeout: 10_000 });
    await page.waitForTimeout(2000);

    expect(errors).toHaveLength(0);
  });

  // ── Executor role ──────────────────────────────────────────────────────────

  test('executor cannot navigate to /settings/import directly', async ({ page }) => {
    // This test relies on seed: admin@skyfit.com has an org with an executor member.
    // We log in as admin to get the orgId, then set up an executor via API if possible.
    const adminToken = await apiLogin('admin@skyfit.com', 'gymops123');

    // Get admin's org
    const ctx = await baseRequest.newContext({ baseURL: API_URL });
    const orgsRes = await ctx.get('/organizations', {
      headers: { Authorization: `Bearer ${adminToken}` },
    });
    const orgsBody = await orgsRes.json() as { data?: Array<{ id: string }> };
    const orgId = orgsBody.data?.[0]?.id;
    await ctx.dispose();

    if (!orgId) {
      test.skip(true, 'No org found — seed may not have run');
      return;
    }

    const { email, password } = await setupExecutorUser(adminToken, orgId);

    // Login as executor
    await page.goto('/login');
    await page.getByLabel(/e-?mail/i).fill(email);
    await page.getByLabel(/senha/i).fill(password);
    await page.getByRole('button', { name: /entrar/i }).click();

    // Executor should land on dashboard (or be denied if org-only)
    const url = page.url();
    if (!url.includes('/login')) {
      // Attempt to go directly to restricted page
      await page.goto('/settings/import');
      // Should be redirected away or show access denied, not import wizard
      await expect(page).not.toHaveURL(/\/settings\/import/, { timeout: 5_000 });
    }
  });

  // ── API-level RBAC ─────────────────────────────────────────────────────────

  test('unauthenticated request to /imports returns 401', async ({ request }) => {
    const res = await request.get(`${API_URL}/imports?organizationId=00000000-0000-0000-0000-000000000000`);
    expect(res.status()).toBe(401);
  });

  test('non-member cannot list imports for an org', async ({ request }) => {
    // Create a user with no membership, try to list imports
    const loginRes = await request.post(`${API_URL}/auth/login`, {
      data: { email: 'admin@skyfit.com', password: 'gymops123' },
    });
    const loginBody = await loginRes.json() as { data?: { accessToken?: string } };
    const token = loginBody.data?.accessToken;

    if (!token) {
      test.skip(true, 'Could not get admin token — seed may not have run');
      return;
    }

    // Use a random non-existent org UUID — user is not a member
    const res = await request.get(
      `${API_URL}/imports?organizationId=aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee`,
      { headers: { Authorization: `Bearer ${token}` } },
    );
    expect(res.status()).toBe(403);
  });

  test('non-member cannot list integrations for an org', async ({ request }) => {
    const loginRes = await request.post(`${API_URL}/auth/login`, {
      data: { email: 'admin@skyfit.com', password: 'gymops123' },
    });
    const loginBody = await loginRes.json() as { data?: { accessToken?: string } };
    const token = loginBody.data?.accessToken;

    if (!token) {
      test.skip(true, 'Could not get admin token');
      return;
    }

    const res = await request.get(
      `${API_URL}/integrations?organizationId=aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee`,
      { headers: { Authorization: `Bearer ${token}` } },
    );
    expect(res.status()).toBe(403);
  });
});

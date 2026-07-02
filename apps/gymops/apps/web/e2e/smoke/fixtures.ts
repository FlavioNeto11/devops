import { expect, type Page } from '@playwright/test';

/**
 * Smoke test credentials.
 * These users must be seeded by packages/db/prisma/seed.ts before E2E runs.
 */
export const PROFILES = {
  owner: { email: 'admin@skyfit.com', password: 'gymops123', role: 'owner' },
  unit_manager: { email: 'joao@skyfit.com', password: 'gymops123', role: 'unit_manager' },
  org_manager: { email: 'org-manager@skyfit.com', password: 'gymops123', role: 'org_manager' },
  area_leader: { email: 'area-leader@skyfit.com', password: 'gymops123', role: 'area_leader' },
  executor: { email: 'executor@skyfit.com', password: 'gymops123', role: 'executor' },
  viewer: { email: 'viewer@skyfit.com', password: 'gymops123', role: 'viewer' },
} as const;

export type ProfileKey = keyof typeof PROFILES;

/**
 * Context returned by POST /auth/login — lets specs navigate to the TRUE
 * landing/target pages of each role (e.g. `/units/<primaryUnitId>`).
 */
export interface LoginContext {
  accessToken: string;
  role: string | null;
  organizationId: string | null;
  primaryUnitId: string | null;
}

/**
 * Helper: log in through the real UI and wait to leave /login.
 *
 * - Captures the /auth/login response so specs can use role/organizationId/
 *   primaryUnitId to assert the app's real role-based redirect (resolveRedirect
 *   in apps/web/src/app/(auth)/login/page.tsx).
 * - POST /auth/login has a REAL rate limit (10/min per IP — routes/auth). The
 *   serial E2E suite is synthetic load that can graze that ceiling; a 429 here
 *   is not a UX regression, so wait for the 1-minute window to renew and retry
 *   (at most twice) instead of failing the suite.
 */
export async function loginAs(
  page: Page,
  profile: { email: string; password: string },
): Promise<LoginContext> {
  await page.goto('/login');
  for (let attempt = 1; ; attempt++) {
    await page.getByLabel(/e-?mail/i).fill(profile.email);
    await page.getByLabel(/senha/i).fill(profile.password);
    const responsePromise = page.waitForResponse(
      (res) => res.url().includes('/auth/login') && res.request().method() === 'POST',
      { timeout: 15_000 },
    );
    await page.getByRole('button', { name: /^entrar$/i }).click();
    const response = await responsePromise;

    if (response.status() === 429 && attempt <= 2) {
      await page.waitForTimeout(31_000); // rate-limit window is 1 minute
      continue;
    }
    expect(response.status(), `login as ${profile.email} should succeed`).toBe(200);

    const body = (await response.json()) as {
      data?: {
        accessToken?: string;
        role?: string | null;
        organizationId?: string | null;
        primaryUnitId?: string | null;
      };
    };
    // Wait for the role-based redirect away from /login
    await page.waitForURL((url) => !url.pathname.endsWith('/login'), { timeout: 15_000 });
    return {
      accessToken: body.data?.accessToken ?? '',
      role: body.data?.role ?? null,
      organizationId: body.data?.organizationId ?? null,
      primaryUnitId: body.data?.primaryUnitId ?? null,
    };
  }
}

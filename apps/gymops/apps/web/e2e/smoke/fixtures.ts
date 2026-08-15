import fs from 'node:fs';
import path from 'node:path';
import { expect, test, type APIRequestContext, type Page } from '@playwright/test';

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

export const API_URL = process.env['E2E_API_URL'] ?? 'http://localhost:3001';

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
 * Auth artifacts produced by e2e/auth.setup.ts — one storageState (httpOnly
 * refresh cookie + zustand localStorage) and one LoginContext JSON per role.
 * Kept under e2e/.auth (gitignored), regenerated on every run.
 */
export const AUTH_DIR = path.join(__dirname, '..', '.auth');

export function authStatePath(key: ProfileKey): string {
  return path.join(AUTH_DIR, `${key}.json`);
}

export function loginContextPath(key: ProfileKey): string {
  return path.join(AUTH_DIR, `${key}.ctx.json`);
}

/** Read the LoginContext saved by auth.setup.ts (call at RUNTIME, not module load). */
export function loadLoginContext(key: ProfileKey): LoginContext {
  return JSON.parse(fs.readFileSync(loginContextPath(key), 'utf8')) as LoginContext;
}

/**
 * Get a FRESH access token using the httpOnly refresh cookie carried by the
 * storageState-backed `request` fixture (the setup-time accessToken expires in
 * 15 min — do not reuse it for API calls late in the suite).
 */
export async function freshAccessToken(request: APIRequestContext): Promise<string> {
  const res = await request.post(`${API_URL}/auth/refresh`);
  expect(res.status(), 'refresh-cookie session should still be valid').toBe(200);
  const body = (await res.json()) as { data?: { accessToken?: string } };
  return body.data?.accessToken ?? '';
}

/**
 * Helper: log in through the real UI and wait to leave /login.
 *
 * Used by e2e/auth.setup.ts (once per role) and by the few specs that exercise
 * the credential flow itself. Everything else reuses storageState.
 *
 * - Captures the /auth/login response so callers can use role/organizationId/
 *   primaryUnitId to assert the app's real role-based redirect (resolveRedirect
 *   in apps/web/src/app/(auth)/login/page.tsx).
 * - POST /auth/login has a REAL rate limit (10/min per IP — routes/auth). A 429
 *   here is synthetic E2E load, not a UX regression: extend the test timeout,
 *   wait the 1-minute window out and retry (at most twice).
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
      try {
        // The wait below outlives the default 30s test timeout — extend it.
        test.info().setTimeout(test.info().timeout + 45_000);
      } catch {
        // outside a test (global/setup context) — nothing to extend
      }
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

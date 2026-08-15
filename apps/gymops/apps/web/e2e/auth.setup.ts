import fs from 'node:fs';
import { test as setup } from '@playwright/test';
import { AUTH_DIR, PROFILES, authStatePath, loginAs, loginContextPath, type ProfileKey } from './smoke/fixtures';

/**
 * Auth setup — runs as a project DEPENDENCY before the chromium project
 * (see playwright.config.ts). Logs in ONCE per role through the real UI and
 * persists per-role auth state under e2e/.auth:
 *
 *   - storageState (httpOnly refresh_token cookie + zustand localStorage) —
 *     exactly what makes a real page reload stay authenticated (auth-bootstrap
 *     calls POST /auth/refresh with the cookie and re-issues the access token);
 *   - LoginContext JSON (role/organizationId/primaryUnitId) so specs can
 *     navigate to each role's TRUE pages.
 *
 * Specs then reuse the state via test.use({ storageState }) instead of
 * re-logging on every test. By construction this keeps the whole suite under
 * the REAL rate limit of POST /auth/login (10/min per IP), which was flaking
 * the gate when all ~50 tests logged in individually.
 */

const setupStart = Date.now();

for (const key of Object.keys(PROFILES) as ProfileKey[]) {
  setup(`authenticate: ${key}`, async ({ page }) => {
    fs.mkdirSync(AUTH_DIR, { recursive: true });
    const ctx = await loginAs(page, PROFILES[key]);
    await page.context().storageState({ path: authStatePath(key) });
    fs.writeFileSync(loginContextPath(key), JSON.stringify(ctx, null, 2));
  });
}

setup('drain login rate-limit window', async () => {
  // The setup logins above consume most of the /auth/login fixed window
  // (10/min). Wait out the remainder so the specs that still exercise the
  // credential flow (auth/dashboard/rbac/tutorial) start with a fresh budget.
  // ~40s of determinism beats a flaky gate.
  setup.setTimeout(120_000);
  const drain = 61_000 - (Date.now() - setupStart);
  if (drain > 0) await new Promise((resolve) => setTimeout(resolve, drain));
});

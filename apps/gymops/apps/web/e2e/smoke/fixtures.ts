/**
 * Smoke test credentials.
 * These users must be seeded by packages/db/prisma/seed.ts before E2E runs.
 */
export const PROFILES = {
  owner: { email: 'admin@skyfit.com', password: 'gymops123', role: 'owner' },
  unit_manager: { email: 'joao@skyfit.com', password: 'gymops123', role: 'unit_manager' },
  // Additional profiles are seeded by the E2E-specific seed step in e2e.yml
  org_manager: { email: 'org-manager@skyfit.com', password: 'gymops123', role: 'org_manager' },
  area_leader: { email: 'area-leader@skyfit.com', password: 'gymops123', role: 'area_leader' },
  executor: { email: 'executor@skyfit.com', password: 'gymops123', role: 'executor' },
  viewer: { email: 'viewer@skyfit.com', password: 'gymops123', role: 'viewer' },
} as const;

export type ProfileKey = keyof typeof PROFILES;

/**
 * Helper: log in as a given profile and wait for dashboard.
 */
export async function loginAs(page: import('@playwright/test').Page, profile: (typeof PROFILES)[ProfileKey]) {
  await page.goto('/login');
  await page.getByLabel(/e-?mail/i).fill(profile.email);
  await page.getByLabel(/senha/i).fill(profile.password);
  await page.getByRole('button', { name: /^entrar$/i }).click();
  // Wait for redirect away from /login
  await page.waitForURL((url) => !url.pathname.endsWith('/login'), { timeout: 15_000 });
}

import { test, expect } from '@playwright/test';
import { PROFILES, loginAs } from './fixtures';

const P = PROFILES.org_manager;

test.describe('Smoke — org_manager', () => {
  test.beforeEach(async ({ page }) => {
    await loginAs(page, P);
  });

  test('reaches dashboard', async ({ page }) => {
    await expect(page).toHaveURL(/dashboard/, { timeout: 10_000 });
  });

  test('sees activities page', async ({ page }) => {
    await page.goto('/activities');
    await expect(page.getByRole('heading', { name: /atividades/i })).toBeVisible({ timeout: 10_000 });
  });

  test('can access settings/units', async ({ page }) => {
    await page.goto('/settings/units');
    await expect(page.getByRole('heading', { name: /unidades/i })).toBeVisible({ timeout: 10_000 });
  });

  test('can access settings/team', async ({ page }) => {
    await page.goto('/settings/team');
    await expect(page.getByRole('heading', { name: /equipe/i })).toBeVisible({ timeout: 10_000 });
  });

  test('org settings page is not accessible (owner only)', async ({ page }) => {
    await page.goto('/settings/organization');
    // org_manager should see a restriction message or empty state
    const body = await page.content();
    expect(body).toMatch(/owner|permiss|acesso/i);
  });
});

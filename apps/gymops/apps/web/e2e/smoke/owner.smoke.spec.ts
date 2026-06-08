import { test, expect } from '@playwright/test';
import { PROFILES, loginAs } from './fixtures';

const P = PROFILES.owner;

test.describe('Smoke — owner', () => {
  test.beforeEach(async ({ page }) => {
    await loginAs(page, P);
  });

  test('reaches dashboard', async ({ page }) => {
    await expect(page).toHaveURL(/dashboard/, { timeout: 10_000 });
  });

  test('sees activities page with create button', async ({ page }) => {
    await page.goto('/activities');
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

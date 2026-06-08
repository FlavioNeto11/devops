import { test, expect } from '@playwright/test';
import { PROFILES, loginAs } from './fixtures';

const P = PROFILES.viewer;

test.describe('Smoke — viewer', () => {
  test.beforeEach(async ({ page }) => {
    await loginAs(page, P);
  });

  test('reaches app (shared activity view) after login', async ({ page }) => {
    // viewer has access via activity_permissions — may land on dashboard or shared activity
    await expect(page).not.toHaveURL(/login/, { timeout: 10_000 });
  });

  test('cannot see create activity button', async ({ page }) => {
    await page.goto('/activities');
    // viewer should NOT see the create button
    const createBtn = page.getByRole('button', { name: /nova atividade/i });
    await expect(createBtn).not.toBeVisible({ timeout: 5_000 });
  });

  test('activities page loads without crash', async ({ page }) => {
    await page.goto('/activities');
    // Should not redirect to login or show 500
    await expect(page).not.toHaveURL(/login/, { timeout: 5_000 });
  });
});

import { test, expect } from '@playwright/test';
import { PROFILES, loginAs } from './fixtures';

const P = PROFILES.executor;

test.describe('Smoke — executor', () => {
  test.beforeEach(async ({ page }) => {
    await loginAs(page, P);
  });

  test('lands on personal view after login (BUG-005: role-based landing)', async ({ page }) => {
    // resolveRedirect (login/page.tsx): executor/viewer → /me (visao pessoal), por design.
    // O assert /dashboard universal era defasado — a landing e por papel.
    await expect(page).toHaveURL(/\/me/, { timeout: 10_000 });
  });

  test('sees activities page', async ({ page }) => {
    await page.goto('/activities');
    await expect(page.getByRole('heading', { name: /atividades/i })).toBeVisible({ timeout: 10_000 });
  });

  test('create activity button is visible (BUG-006 regression)', async ({ page }) => {
    await page.goto('/activities');
    // canCreate() now includes executor — button should be visible
    await expect(page.getByRole('button', { name: /nova atividade/i })).toBeVisible({ timeout: 10_000 });
  });

  test('personal view loads without error', async ({ page }) => {
    await page.goto('/my-tasks');
    await expect(page).not.toHaveURL(/login/, { timeout: 5_000 });
  });
});

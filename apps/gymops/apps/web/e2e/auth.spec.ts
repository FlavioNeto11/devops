import { test, expect } from '@playwright/test';

const SEED_EMAIL = 'admin@skyfit.com';
const SEED_PASSWORD = 'gymops123';

test.describe('Authentication', () => {
  test('login with valid credentials redirects to dashboard', async ({ page }) => {
    await page.goto('/login');
    await page.getByLabel(/e-?mail/i).fill(SEED_EMAIL);
    await page.getByLabel(/senha/i).fill(SEED_PASSWORD);
    await page.getByRole('button', { name: /entrar/i }).click();
    await expect(page).toHaveURL(/\/dashboard/, { timeout: 10_000 });
  });

  test('login with wrong password shows error toast', async ({ page }) => {
    await page.goto('/login');
    await page.getByLabel(/e-?mail/i).fill(SEED_EMAIL);
    await page.getByLabel(/senha/i).fill('wrongpassword');
    await page.getByRole('button', { name: /entrar/i }).click();
    await expect(page.getByText(/inválid|incorret|senha/i)).toBeVisible({ timeout: 5_000 });
  });

  test('logout clears session and redirects to login', async ({ page }) => {
    await page.goto('/login');
    await page.getByLabel(/e-?mail/i).fill(SEED_EMAIL);
    await page.getByLabel(/senha/i).fill(SEED_PASSWORD);
    await page.getByRole('button', { name: /entrar/i }).click();
    await expect(page).toHaveURL(/\/dashboard/, { timeout: 10_000 });

    await page.getByRole('button', { name: /sair|logout/i }).click();
    await expect(page).toHaveURL(/\/login/, { timeout: 5_000 });
  });
});

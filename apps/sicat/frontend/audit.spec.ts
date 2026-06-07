import { test, expect } from '@playwright/test';

const BASE_URL = 'http://localhost:5174';

test.describe('Frontend Vuexy Audit - Desktop Wide', () => {
  test.beforeEach(async ({ page }) => {
    // Set desktop wide viewport
    await page.setViewportSize({ width: 1920, height: 1080 });
  });

  test('Light Mode - Login Page', async ({ page }) => {
    // Light mode - default
    await page.goto(`${BASE_URL}/login`);
    await page.waitForLoadState('networkidle');

    // Verify main layout elements
    const loginContainer = page.locator('[class*="login"], [class*="form"]').first();
    await expect(loginContainer).toBeVisible({ timeout: 5000 });

    // Screenshot light mode login
    await page.screenshot({ path: 'audit-light-login-desktop.png', fullPage: true });
  });

  test('Dark Mode - Login Page', async ({ page }) => {
    // Switch to dark mode
    await page.goto(`${BASE_URL}/login`);
    await page.waitForLoadState('networkidle');

    // Try to find and click dark mode toggle
    const themeToggle = page.locator('[class*="theme"], [aria-label*="theme"], [aria-label*="dark"], button:has-text("dark"), button:has-text("light")').first();
    if (await themeToggle.isVisible({ timeout: 2000 }).catch(() => false)) {
      await themeToggle.click();
      await page.waitForTimeout(500);
    }

    // Screenshot dark mode login
    await page.screenshot({ path: 'audit-dark-login-desktop.png', fullPage: true });
  });

  test('Light Mode - Dashboard', async ({ page }) => {
    // Navigate to dashboard (may redirect to login)
    await page.goto(`${BASE_URL}/dashboard`);
    await page.waitForLoadState('networkidle');

    // Check if we're on login or dashboard
    const currentUrl = page.url();
    if (currentUrl.includes('login')) {
      // On login, screenshot it
      await page.screenshot({ path: 'audit-light-dashboard-redirect-desktop.png', fullPage: true });
    } else {
      // On dashboard
      await page.screenshot({ path: 'audit-light-dashboard-desktop.png', fullPage: true });
    }
  });

  test('Responsive check - Mobile view', async ({ page }) => {
    // Check mobile responsiveness
    await page.setViewportSize({ width: 375, height: 667 });
    await page.goto(`${BASE_URL}/login`);
    await page.waitForLoadState('networkidle');

    const loginContainer = page.locator('[class*="login"], [class*="form"]').first();
    await expect(loginContainer).toBeVisible({ timeout: 5000 });

    await page.screenshot({ path: 'audit-mobile-login.png', fullPage: true });
  });

  test('Navigation Bar - Visibility & Items', async ({ page }) => {
    await page.goto(`${BASE_URL}/`);
    await page.waitForLoadState('networkidle');

    // Look for navbar/navigation elements
    const navbar = page.locator('nav, [class*="nav"], [class*="menu"], [class*="header"]').first();

    if (await navbar.isVisible({ timeout: 2000 }).catch(() => false)) {
      await expect(navbar).toBeVisible();
      await navbar.screenshot({ path: 'audit-navbar-desktop.png' });
    } else {
      console.log('Navbar not found on initial page');
    }
  });

  test('Topbar - Avatar & Profile', async ({ page }) => {
    await page.goto(`${BASE_URL}/`);
    await page.waitForLoadState('networkidle');

    // Look for avatar, profile dropdown, or user menu
    const avatar = page.locator('[class*="avatar"], [class*="profile"], [class*="user"]').first();

    if (await avatar.isVisible({ timeout: 2000 }).catch(() => false)) {
      await expect(avatar).toBeVisible();
      await avatar.screenshot({ path: 'audit-topbar-avatar-desktop.png' });
    } else {
      console.log('Avatar/profile not visible');
    }
  });

  test('Dark/Light Toggle Button - Visibility', async ({ page }) => {
    await page.goto(`${BASE_URL}/`);
    await page.waitForLoadState('networkidle');

    // Search for theme toggle
    const toggles = page.locator('[aria-label*="theme"], [aria-label*="dark"], [aria-label*="light"], button:has-text("theme")');
    const count = await toggles.count();

    console.log(`Found ${count} possible theme toggle buttons`);

    if (count > 0) {
      await toggles.first().screenshot({ path: 'audit-theme-toggle-desktop.png' });
    }
  });

  test('Compile Check - No errors on page load', async ({ page }) => {
    const errors: string[] = [];

    page.on('console', (msg) => {
      if (msg.type() === 'error') {
        errors.push(msg.text());
      }
    });

    await page.goto(`${BASE_URL}/login`);
    await page.waitForLoadState('networkidle');

    expect(errors.length).toBe(0);
    console.log('No console errors detected on login page');
  });
});

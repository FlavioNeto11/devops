import { test, expect, type Page, type Route } from '@playwright/test';

const BASE_URL = 'http://127.0.0.1:5174';
const integrationAccountId = 'acc_test_prod';
const sessionContextId = 'ctx_test_01';

async function setupAuthenticatedShell(page: Page) {
  await page.addInitScript(({ integrationAccountId: accId, sessionContextId: scxId }: { integrationAccountId: string; sessionContextId: string }) => {
    const expiresAt = new Date(Date.now() + 60 * 60 * 1000).toISOString();
    localStorage.setItem('sicat_session_access_token', 'test-token');
    localStorage.setItem('sicat_session_refresh_token', 'test-refresh-token');
    localStorage.setItem('sicat_session_expires_at', expiresAt);
    localStorage.setItem('sicat_session_user', JSON.stringify({
      name: 'Usuario Teste',
      email: 'user@test.com',
      userId: 'usr_test_ui_001'
    }));
    localStorage.setItem('sicat_active_cetesb_account', JSON.stringify({
      accountId: 'acc_test_01',
      partnerCode: 176163,
      partnerDocument: '31.913.781/0001-39',
      partnerName: 'Parceiro Teste',
      accountType: 'generator',
      isActive: true
    }));
    localStorage.setItem('sicat_active_session_context', JSON.stringify({
      sessionContextId: scxId,
      id: scxId,
      integrationAccountId: accId,
      status: 'active'
    }));
    localStorage.setItem('sicat_active_integration_account_id', accId);
  }, { integrationAccountId, sessionContextId });

  await page.route('**/v1/sicat/session', async (route: Route) => {
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({
        user: {
          userId: 'usr_test_ui_001',
          name: 'Usuario UI Teste',
          email: 'ui@test.com',
          roles: ['operator']
        },
        activeAccount: {
          accountId: 'acc_test_01',
          partnerCode: 176163,
          partnerDocument: '31.913.781/0001-39',
          partnerName: 'Parceiro Teste',
          accountType: 'generator',
          isActive: true
        },
        sessionContext: {
          sessionContextId,
          id: sessionContextId,
          integrationAccountId,
          status: 'active'
        }
      })
    });
  });

  await page.route('**/v1/sicat/cetesb-accounts', async (route: Route) => {
    if (route.request().method() === 'GET') {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          activeAccountId: 'acc_test_01',
          accounts: [{
            accountId: 'acc_test_01',
            partnerCode: 176163,
            partnerDocument: '31.913.781/0001-39',
            partnerName: 'Parceiro Teste',
            accountType: 'generator',
            isActive: true
          }]
        })
      });
      return;
    }

    await route.continue();
  });

  await page.route('**/v1/dashboard/overview**', async (route: Route) => {
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({
        manifests: { items: [] },
        health: {
          system: { status: 'healthy', statistics: { jobs_queued: 0, jobs_running: 0, workers_active_5m: 1, jobs_dlq_total: 0 } },
          workers: { total: 1, healthy: 1, degraded: 0, unhealthy: 0, stopped: 0 },
          dlq: { dlq_jobs: 0 }
        },
        performance: { source: 'jobs', job_execution_ms: { p95: 0 }, job_success_rate: 1, worker_utilization: 0 },
        timeline: { source: 'jobs', points: [] },
        integration_latency: { endpoints: [] }
      })
    });
  });
}

test.describe('Frontend Vuexy Audit - Desktop Wide (1920x1080)', () => {
  test.beforeEach(async ({ page }) => {
    // Set desktop wide viewport
    await page.setViewportSize({ width: 1920, height: 1080 });
  });

  test('01-Light Mode - Login Page', async ({ page }) => {
    // Light mode - default
    await page.goto(`${BASE_URL}/login`);
    await page.waitForSelector('.v-application', { timeout: 10000 });

    // Verify Vue app mounted (Vuetify hides body during theme initialization)
    const pageContent = page.locator('.v-application');
    await expect(pageContent).toBeVisible({ timeout: 10000 });

    // Screenshot light mode login
    await page.screenshot({ path: 'test-results/01-light-login-desktop-1920x1080.png', fullPage: true });
  });

  test('02-Dark Mode - Login Page', async ({ page }) => {
    await page.goto(`${BASE_URL}/login`);
    await page.waitForSelector('.v-application', { timeout: 10000 });

    // Get current theme state
    const htmlTag = page.locator('html');
    const classes = await htmlTag.getAttribute('class') || '';

    // If not in dark mode, try to toggle
    if (!classes.includes('dark')) {
      // Look for theme toggle button
      const toggleButtons = page.locator('button').filter({ hasText: /theme|dark|light/i });
      const count = await toggleButtons.count();

      if (count > 0) {
        await toggleButtons.first().click();
        await page.waitForTimeout(500);
      }
    }

    // Screenshot dark mode login
    await page.screenshot({ path: 'test-results/02-dark-login-desktop-1920x1080.png', fullPage: true });
  });

  test('03-Light Mode - Dashboard (or redirect)', async ({ page }) => {
    await page.goto(`${BASE_URL}/dashboard`);
    await page.waitForSelector('.v-application', { timeout: 10000 });

    // Screenshot wherever we end up
    await page.screenshot({ path: 'test-results/03-light-dashboard-desktop-1920x1080.png', fullPage: true });
  });

  test('04-Navbar Visibility & Structure', async ({ page }) => {
    await page.goto(`${BASE_URL}/dashboard`);
    await page.waitForSelector('.v-application', { timeout: 10000 });

    const unauthenticatedNavbar = page.locator('header[role="banner"], [data-testid="app-shell-navbar"]');
    await expect(unauthenticatedNavbar).toHaveCount(0);

    await setupAuthenticatedShell(page);
    await page.goto(`${BASE_URL}/dashboard`);
    await page.waitForSelector('.v-application', { timeout: 10000 });

    // Look for navbar/navigation elements
    const navElements = page.locator('header[role="banner"], [data-testid="app-shell-navbar"], nav[aria-label*="Navegação principal"]');
    const navCount = await navElements.count();

    console.log(`Found ${navCount} nav/header elements`);

    if (navCount > 0) {
      await navElements.first().screenshot({ path: 'test-results/04-navbar-structure.png' });
    }

    expect(navCount).toBeGreaterThan(0);
    await expect(page.locator('.sicat-app')).toHaveAttribute('data-authenticated', 'true');
  });

  test('05-Topbar Avatar & Profile Menu', async ({ page }) => {
    await setupAuthenticatedShell(page);
    await page.goto(`${BASE_URL}/dashboard`);
    await page.waitForSelector('.v-application', { timeout: 10000 });

    // Look for avatar/profile in topbar
    const profileElements = page.locator('[class*="avatar"], [class*="profile"], [class*="account"], button[aria-label*="account"]');
    const count = await profileElements.count();

    console.log(`Found ${count} profile/avatar elements`);

    if (count > 0) {
      await profileElements.first().screenshot({ path: 'test-results/05-topbar-avatar.png' });
    }
  });

  test('06-Theme Toggle - Accessible', async ({ page }) => {
    await page.goto(`${BASE_URL}/login`);
    await page.waitForSelector('.v-application', { timeout: 10000 });

    // Find all buttons and look for theme toggle pattern
    const buttons = page.locator('button');
    const count = await buttons.count();

    // Log first 10 buttons' accessible names/text
    for (let i = 0; i < Math.min(10, count); i++) {
      const btn = buttons.nth(i);
      const text = await btn.textContent();
      const ariaLabel = await btn.getAttribute('aria-label');
      const title = await btn.getAttribute('title');

      if (text?.toLowerCase().includes('theme') ||
        ariaLabel?.toLowerCase().includes('theme') ||
        title?.toLowerCase().includes('theme') ||
        text?.toLowerCase().includes('light') ||
        text?.toLowerCase().includes('dark')) {
        console.log(`Button ${i}: text="${text}", aria-label="${ariaLabel}", title="${title}"`);
      }
    }
  });

  test('07-Mobile Responsiveness Check - 375x667', async ({ page }) => {
    await page.setViewportSize({ width: 375, height: 667 });
    await page.goto(`${BASE_URL}/login`);
    await page.waitForLoadState('networkidle');

    // Should not have layout shift or horizontal scroll
    const bodyOverflow = await page.locator('body').evaluate((el) => {
      return globalThis.getComputedStyle(el).overflowX;
    });

    console.log(`Mobile body overflowX: ${bodyOverflow}`);

    await page.screenshot({ path: 'test-results/07-mobile-login-375x667.png', fullPage: true });
  });

  test('08-No Console Errors on Load', async ({ page }) => {
    const errors: { type: string; text: string }[] = [];

    page.on('console', (msg) => {
      if (msg.type() === 'error') {
        errors.push({ type: msg.type(), text: msg.text() });
      }
    });

    // Mock session endpoint so onMounted does not hit real backend (avoids 500)
    await page.route('**/v1/sicat/session', async (route: Route) => {
      await route.fulfill({ status: 401, contentType: 'application/json', body: JSON.stringify({ message: 'Unauthorized' }) });
    });

    await page.goto(`${BASE_URL}/login`);
    await page.waitForSelector('.v-application', { timeout: 10000 });
    await page.waitForTimeout(1000);

    // Filter out expected auth flow non-errors (network failures, 401 fetch responses)
    const jsErrors = errors.filter(e => !e.text.includes('401') && !e.text.includes('Unauthorized') && !e.text.includes('net::ERR'));

    if (jsErrors.length > 0) {
      console.log('Console errors found:');
      jsErrors.forEach(e => console.log(`  [${e.type}] ${e.text}`));
    }

    expect(jsErrors.length).toBe(0);
  });

  test('09-Vuetify Components Render', async ({ page }) => {
    await page.goto(`${BASE_URL}/login`);
    await page.waitForLoadState('networkidle');

    // Wait for Vuetify to finish mounting before counting components
    await page.waitForSelector('.v-application', { timeout: 10000 });

    // Check for Vuetify component classes
    const vElements = page.locator('[class*="v-"], [class*="vuetify"]');
    const count = await vElements.count();

    console.log(`Found ${count} Vuetify components`);
    expect(count).toBeGreaterThan(0);
  });

  test('10-Font Rendering - Public Sans', async ({ page }) => {
    await page.goto(`${BASE_URL}/login`);

    const body = page.locator('body');
    const fontFamily = await body.evaluate((el) => {
      return globalThis.getComputedStyle(el).fontFamily;
    });

    console.log(`Body font-family: ${fontFamily}`);
    await page.screenshot({ path: 'test-results/10-font-rendering.png', fullPage: true });
  });
});



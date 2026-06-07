import { chromium } from '@playwright/test';

const baseUrl = 'http://127.0.0.1:5174';
const apiBase = 'http://127.0.0.1:8080';
const browser = await chromium.launch({ headless: true });
const context = await browser.newContext({ viewport: { width: 1366, height: 900 } });
const page = await context.newPage();
const expiresAt = new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString();

await page.route(`${apiBase}/v1/sicat/session`, (route) => route.fulfill({
  status: 200,
  contentType: 'application/json',
  body: JSON.stringify({
    user: {
      userId: 'qa-user',
      email: 'qa@example.com',
      name: 'QA User',
      adminAccess: { allowed: false }
    },
    activeAccount: null,
    sessionContext: null
  })
}));

await page.route(`${apiBase}/v1/sicat/cetesb/accounts`, (route) => {
  if (route.request().method() === 'GET') {
    return route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({
        activeAccountId: null,
        accounts: [
          {
            accountId: 'acc-1',
            partnerName: 'Conta QA CETESB',
            partnerCode: 123,
            partnerDocument: '12345678000199',
            accountType: 'receiver',
            createdAt: '2026-04-22T12:00:00.000Z'
          }
        ]
      })
    });
  }

  return route.fallback();
});

await page.addInitScript(({ nextExpiresAt }) => {
  localStorage.clear();
  sessionStorage.clear();
  localStorage.setItem('sicat_session_access_token', 'qa-token');
  localStorage.setItem('sicat_session_refresh_token', 'qa-refresh');
  localStorage.setItem('sicat_session_expires_at', nextExpiresAt);
  localStorage.setItem('sicat_session_user', JSON.stringify({
    userId: 'qa-user',
    email: 'qa@example.com',
    name: 'QA User',
    adminAccess: { allowed: false }
  }));
}, { nextExpiresAt: expiresAt });

const results = {};

await page.goto(`${baseUrl}/login/cetesb`, { waitUntil: 'domcontentloaded' });
await page.waitForSelector('.account-selection-panel-toolbar', { timeout: 15000 });
results.loginCetesbDesktop = await page.evaluate(() => {
  const toolbar = document.querySelector('.account-selection-panel-toolbar');
  const toolbarHome = document.querySelector('.account-selection-panel-toolbar .account-home-action');
  const wrapperHeader = document.querySelector('.auth-content-shell > .public-home-inline-header-auth');

  return {
    path: location.pathname + location.search,
    toolbarHomeCount: toolbarHome ? 1 : 0,
    wrapperHeaderCount: wrapperHeader ? 1 : 0,
    ariaLabel: toolbarHome?.getAttribute('aria-label') || null,
    toolbarRect: toolbar?.getBoundingClientRect().toJSON() || null,
    homeRect: toolbarHome?.getBoundingClientRect().toJSON() || null,
    horizontalOverflow: document.documentElement.scrollWidth > document.documentElement.clientWidth
  };
});

const desktopHomeButton = page.locator('.account-selection-panel-toolbar .account-home-action').first();
await desktopHomeButton.hover();
results.loginCetesbDesktop.tooltipText = await page.locator('[role="tooltip"]').last().innerText();

await page.keyboard.press('Tab');
await page.keyboard.press('Tab');
await page.keyboard.press('Tab');
results.loginCetesbDesktop.keyboardFocus = await page.evaluate(() => ({
  activeAriaLabel: document.activeElement?.getAttribute?.('aria-label') || null,
  focusVisible: document.activeElement ? document.activeElement.matches(':focus-visible') : false
}));

await desktopHomeButton.click();
await page.waitForURL(`${baseUrl}/?public=1`, { timeout: 15000 });
results.redirectTarget = page.url();
results.publicHome = await page.evaluate(() => ({
  shortcutCount: document.querySelectorAll('.public-home-action, .account-home-action, .auth-home-action').length,
  path: location.pathname + location.search
}));

await page.goto(`${baseUrl}/login`, { waitUntil: 'domcontentloaded' });
await page.waitForSelector('.auth-panel-toolbar', { timeout: 15000 });
results.loginRoute = await page.evaluate(() => ({
  toolbarHomeCount: document.querySelectorAll('.auth-panel-toolbar .auth-home-action').length,
  wrapperHeaderCount: document.querySelectorAll('.auth-content-shell > .public-home-inline-header-auth').length,
  ariaLabel: document.querySelector('.auth-panel-toolbar .auth-home-action')?.getAttribute('aria-label') || null
}));

await page.setViewportSize({ width: 390, height: 844 });
await page.goto(`${baseUrl}/login/cetesb`, { waitUntil: 'domcontentloaded' });
await page.waitForSelector('.account-selection-panel-toolbar', { timeout: 15000 });
results.loginCetesbMobile = await page.evaluate(() => {
  const toolbarHome = document.querySelector('.account-selection-panel-toolbar .account-home-action');
  const wrapperHeader = document.querySelector('.auth-content-shell > .public-home-inline-header-auth');
  const themeButton = Array.from(document.querySelectorAll('button')).find((button) => {
    const label = button.getAttribute('aria-label') || '';
    return label.includes('tema escuro') || label.includes('tema claro');
  });

  return {
    viewport: { width: window.innerWidth, height: window.innerHeight },
    toolbarHomeCount: toolbarHome ? 1 : 0,
    wrapperHeaderCount: wrapperHeader ? 1 : 0,
    homeAriaLabel: toolbarHome?.getAttribute('aria-label') || null,
    themeAriaLabel: themeButton?.getAttribute('aria-label') || null,
    horizontalOverflow: document.documentElement.scrollWidth > document.documentElement.clientWidth
  };
});

const mobileThemeButton = page.locator('button[aria-label*="tema "]').first();
await mobileThemeButton.click();
results.loginCetesbMobile.afterThemeToggle = await page.evaluate(() => {
  const themeButton = Array.from(document.querySelectorAll('button')).find((button) => {
    const label = button.getAttribute('aria-label') || '';
    return label.includes('tema escuro') || label.includes('tema claro');
  });
  const toolbarHome = document.querySelector('.account-selection-panel-toolbar .account-home-action');

  return {
    themeAriaLabel: themeButton?.getAttribute('aria-label') || null,
    toolbarHomeStillPresent: Boolean(toolbarHome)
  };
});

console.log(JSON.stringify(results, null, 2));
await browser.close();
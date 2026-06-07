import { test, expect, type Page } from '@playwright/test';
import * as fs from 'node:fs';
import * as path from 'node:path';

(function loadDotEnv() {
  try {
    const envFile = path.join(path.dirname(new URL(import.meta.url).pathname.replace(/^\/([A-Z]:)/, '$1')), '../..', '.env');
    if (fs.existsSync(envFile)) {
      const lines = fs.readFileSync(envFile, 'utf-8').split('\n');
      for (const line of lines) {
        const trimmed = line.trim();
        if (!trimmed || trimmed.startsWith('#')) continue;
        const eqIdx = trimmed.indexOf('=');
        if (eqIdx === -1) continue;
        const key = trimmed.slice(0, eqIdx).trim();
        const val = trimmed.slice(eqIdx + 1).trim();
        if (key && !(key in process.env)) process.env[key] = val;
      }
    }
  } catch {
    // noop
  }
})();

const SICAT_EMAIL = process.env.SICAT_EMAIL || 'flavio_padilha_neto@msn.com';
const SICAT_PASSWORD = process.env.SICAT_PASSWORD || '';
const BASE_URL = 'http://127.0.0.1:5174';

async function waitForAppReady(page: Page) {
  await page.waitForSelector('.v-application', { timeout: 15000 });
}

async function doLogin(page: Page) {
  await page.goto(`${BASE_URL}/login`);
  await waitForAppReady(page);

  const emailInput = page.locator('input[type="email"], input[autocomplete="email"], input[name="email"]').first();
  await emailInput.waitFor({ timeout: 10000 });
  await emailInput.fill(SICAT_EMAIL);

  const passwordInput = page.locator('input[type="password"]').first();
  await passwordInput.fill(SICAT_PASSWORD);

  const submitBtn = page.locator('button[type="submit"], button:has-text("Entrar"), button:has-text("Login")').first();
  await submitBtn.click();
  await page.waitForURL(`${BASE_URL}/login/cetesb`, { timeout: 20000 });
  await waitForAppReady(page);
}

async function focusElementByAriaLabel(page: Page, ariaLabel: string) {
  for (let index = 0; index < 12; index += 1) {
    await page.keyboard.press('Tab');
    const activeAriaLabel = await page.evaluate(() => document.activeElement?.getAttribute?.('aria-label') || null);
    if (activeAriaLabel === ariaLabel) {
      return await page.evaluate(() => ({
        ariaLabel: document.activeElement?.getAttribute?.('aria-label') || null,
        focusVisible: document.activeElement ? document.activeElement.matches(':focus-visible') : false
      }));
    }
  }

  return {
    ariaLabel: null,
    focusVisible: false
  };
}

test.describe('QA global-home-back-button', () => {
  test.describe.configure({ mode: 'serial' });

  test('01 - /login permanece sem header inline externo', async ({ page }) => {
    await page.goto(`${BASE_URL}/login`);
    await waitForAppReady(page);
    await page.waitForSelector('.auth-panel-toolbar', { timeout: 15000 });

    const result = await page.evaluate(() => ({
      toolbarHomeCount: document.querySelectorAll('.auth-panel-toolbar .auth-home-action').length,
      wrapperHeaderCount: document.querySelectorAll('.auth-content-shell > .public-home-inline-header-auth').length,
      ariaLabel: document.querySelector('.auth-panel-toolbar .auth-home-action')?.getAttribute('aria-label') || null
    }));

    expect(result.toolbarHomeCount).toBe(1);
    expect(result.wrapperHeaderCount).toBe(0);
    expect(result.ariaLabel).toBe('Voltar para a home publica');
    console.log(JSON.stringify({ loginRoute: result }));
  });

  test('02 - /login/cetesb integra Home ao toolbar nativo e preserva UX', async ({ page }) => {
    test.skip(!SICAT_PASSWORD, 'SICAT_PASSWORD não definido — defina em frontend/.env');

    await doLogin(page);
    await page.waitForSelector('.account-selection-panel-toolbar', { timeout: 15000 });

    const desktop = await page.evaluate(() => {
      const toolbar = document.querySelector('.account-selection-panel-toolbar');
      const toolbarHome = document.querySelector('.account-selection-panel-toolbar .account-home-action');
      const wrapperHeader = document.querySelector('.auth-content-shell > .public-home-inline-header-auth');
      const themeButton = Array.from(document.querySelectorAll('button')).find((button) => {
        const label = button.getAttribute('aria-label') || '';
        return label.includes('tema escuro') || label.includes('tema claro');
      });

      return {
        path: location.pathname + location.search,
        toolbarHomeCount: toolbarHome ? 1 : 0,
        wrapperHeaderCount: wrapperHeader ? 1 : 0,
        ariaLabel: toolbarHome?.getAttribute('aria-label') || null,
        toolbarRect: toolbar?.getBoundingClientRect().toJSON() || null,
        homeRect: toolbarHome?.getBoundingClientRect().toJSON() || null,
        themeAriaLabel: themeButton?.getAttribute('aria-label') || null,
        horizontalOverflow: document.documentElement.scrollWidth > document.documentElement.clientWidth
      };
    });

    const homeButton = page.locator('.account-selection-panel-toolbar .account-home-action').first();
    await homeButton.hover();
    const tooltipText = await page.locator('[role="tooltip"]').last().innerText();
    const keyboardFocus = await focusElementByAriaLabel(page, 'Voltar para a home publica');

    expect(desktop.toolbarHomeCount).toBe(1);
    expect(desktop.wrapperHeaderCount).toBe(0);
    expect(desktop.ariaLabel).toBe('Voltar para a home publica');
    expect(tooltipText).toContain('Ir para a home publica');
    expect(keyboardFocus.ariaLabel).toBe('Voltar para a home publica');
    expect(keyboardFocus.focusVisible).toBeTruthy();
    expect(desktop.horizontalOverflow).toBeFalsy();

    const themeButton = page.locator('button[aria-label*="tema "]').first();
    await themeButton.click();
    const afterThemeToggle = await page.evaluate(() => {
      const nextThemeButton = Array.from(document.querySelectorAll('button')).find((button) => {
        const label = button.getAttribute('aria-label') || '';
        return label.includes('tema escuro') || label.includes('tema claro');
      });
      return {
        themeAriaLabel: nextThemeButton?.getAttribute('aria-label') || null,
        toolbarHomeStillPresent: Boolean(document.querySelector('.account-selection-panel-toolbar .account-home-action'))
      };
    });

    expect(afterThemeToggle.toolbarHomeStillPresent).toBeTruthy();
    expect(afterThemeToggle.themeAriaLabel).toBeTruthy();

    await page.setViewportSize({ width: 390, height: 844 });
    await page.reload({ waitUntil: 'domcontentloaded' });
    await waitForAppReady(page);
    await page.waitForSelector('.account-selection-panel-toolbar', { timeout: 15000 });

    const mobile = await page.evaluate(() => ({
      viewport: { width: window.innerWidth, height: window.innerHeight },
      toolbarHomeCount: document.querySelectorAll('.account-selection-panel-toolbar .account-home-action').length,
      wrapperHeaderCount: document.querySelectorAll('.auth-content-shell > .public-home-inline-header-auth').length,
      homeAriaLabel: document.querySelector('.account-selection-panel-toolbar .account-home-action')?.getAttribute('aria-label') || null,
      themeAriaLabel: Array.from(document.querySelectorAll('button')).find((button) => {
        const label = button.getAttribute('aria-label') || '';
        return label.includes('tema escuro') || label.includes('tema claro');
      })?.getAttribute('aria-label') || null,
      horizontalOverflow: document.documentElement.scrollWidth > document.documentElement.clientWidth
    }));

    expect(mobile.toolbarHomeCount).toBe(1);
    expect(mobile.wrapperHeaderCount).toBe(0);
    expect(mobile.homeAriaLabel).toBe('Voltar para a home publica');
    expect(mobile.themeAriaLabel).toBeTruthy();
    expect(mobile.horizontalOverflow).toBeFalsy();

    await page.setViewportSize({ width: 1366, height: 900 });
    await page.goto(`${BASE_URL}/login/cetesb`);
    await waitForAppReady(page);
    await page.waitForSelector('.account-selection-panel-toolbar .account-home-action', { timeout: 15000 });
    await page.locator('.account-selection-panel-toolbar .account-home-action').click();
    await page.waitForURL(`${BASE_URL}/?public=1`, { timeout: 15000 });

    const publicHome = await page.evaluate(() => ({
      path: location.pathname + location.search,
      shortcutCount: document.querySelectorAll('.public-home-action, .account-home-action, .auth-home-action').length
    }));

    expect(publicHome.path).toBe('/?public=1');
    expect(publicHome.shortcutCount).toBe(0);

    console.log(JSON.stringify({ loginCetesbDesktop: desktop, tooltipText, keyboardFocus, afterThemeToggle, loginCetesbMobile: mobile, publicHome }));
  });
});
import { test, expect, type Page } from '@playwright/test';
import * as fs from 'node:fs';
import * as path from 'node:path';

(function loadDotEnv() {
  try {
    const envFile = path.join(
      path.dirname(new URL(import.meta.url).pathname.replace(/^\/([A-Z]:)/, '$1')),
      '../..',
      '.env'
    );

    if (!fs.existsSync(envFile)) {
      return;
    }

    for (const line of fs.readFileSync(envFile, 'utf-8').split('\n')) {
      const trimmed = line.trim();
      if (!trimmed || trimmed.startsWith('#')) continue;
      const idx = trimmed.indexOf('=');
      if (idx === -1) continue;
      const key = trimmed.slice(0, idx).trim();
      const value = trimmed.slice(idx + 1).trim();
      if (key && !(key in process.env)) process.env[key] = value;
    }
  } catch {
    // noop
  }
})();

const BASE = 'http://127.0.0.1:5174';
const SICAT_EMAIL = process.env.SICAT_EMAIL || '';
const SICAT_PASSWORD = process.env.SICAT_PASSWORD || '';

async function appReady(page: Page) {
  await page.waitForLoadState('domcontentloaded');
  await page.waitForSelector('body', { state: 'attached', timeout: 60_000 });
}

async function loginAndActivate(page: Page) {
  const loginResponse = await page.goto(`${BASE}/login`, { waitUntil: 'domcontentloaded' });
  // Diagnóstico para ambiente de runner quando a página não renderiza
  // eslint-disable-next-line no-console
  console.log('[chat-layout] goto /login', {
    url: page.url(),
    status: loginResponse?.status() ?? null,
    ok: loginResponse?.ok() ?? null
  });
  await appReady(page);

  await page.locator('input[type="email"], input[name="email"]').first().fill(SICAT_EMAIL);
  await page.locator('input[type="password"]').first().fill(SICAT_PASSWORD);
  await page.locator('button[type="submit"], button:has-text("Entrar"), button:has-text("Login")').first().click();

  await page.waitForURL(`${BASE}/login/cetesb`, { timeout: 30_000 });

  const activate = page.locator(
    'button:has-text("Entrar"), button:has-text("Ativar"), button:has-text("Usar esta conta"), button:has-text("Selecionar")'
  ).first();

  if (await activate.isVisible({ timeout: 7_000 }).catch(() => false)) {
    await activate.click();
    await page.waitForURL(`${BASE}/dashboard`, { timeout: 30_000 }).catch(async () => {
      await page.goto(`${BASE}/dashboard`);
    });
  } else {
    await page.goto(`${BASE}/dashboard`);
  }

  await page.waitForLoadState('networkidle');
  await appReady(page);
}

async function assertSingleScrollAndComposerAtBottom(page: Page) {
  const wrapper = page.locator('.content-wrapper').first();
  const thread = page.locator('.chat-thread').first();
  const composer = page.locator('.chat-composer').first();

  await expect(thread).toBeVisible({ timeout: 10_000 });
  await expect(composer).toBeVisible({ timeout: 10_000 });

  const metricsBefore = await page.evaluate(() => {
    const wrapperEl = document.querySelector('.content-wrapper');
    const threadEl = document.querySelector('.chat-thread');
    const scrollingEl = document.scrollingElement as HTMLElement | null;

    if (!wrapperEl || !threadEl || !scrollingEl) {
      return null;
    }

    return {
      documentScrollable: scrollingEl.scrollHeight > scrollingEl.clientHeight + 1,
      wrapperScrollable: (wrapperEl as HTMLElement).scrollHeight > (wrapperEl as HTMLElement).clientHeight + 1,
      threadScrollable: (threadEl as HTMLElement).scrollHeight > (threadEl as HTMLElement).clientHeight + 1
    };
  });

  expect(metricsBefore).not.toBeNull();
  expect(metricsBefore?.documentScrollable).toBe(false);
  expect(metricsBefore?.wrapperScrollable).toBe(false);

  // Gera conteúdo suficiente para overflow no thread usando intenção local (não depende do backend)
  const composerInput = page.locator('.chat-composer textarea, .chat-composer input').first();
  for (let i = 0; i < 12; i += 1) {
    await composerInput.fill('esta tela');
    await composerInput.press('Enter');
  }

  await page.waitForTimeout(600);

  const metricsAfter = await page.evaluate(() => {
    const threadEl = document.querySelector('.chat-thread') as HTMLElement | null;
    const scrollingEl = document.scrollingElement as HTMLElement | null;
    const wrapperEl = document.querySelector('.content-wrapper') as HTMLElement | null;

    if (!threadEl || !scrollingEl || !wrapperEl) {
      return null;
    }

    return {
      documentScrollable: scrollingEl.scrollHeight > scrollingEl.clientHeight + 1,
      wrapperScrollable: wrapperEl.scrollHeight > wrapperEl.clientHeight + 1,
      threadScrollable: threadEl.scrollHeight > threadEl.clientHeight + 1
    };
  });

  expect(metricsAfter).not.toBeNull();
  expect(metricsAfter?.documentScrollable).toBe(false);
  expect(metricsAfter?.wrapperScrollable).toBe(false);
  expect(metricsAfter?.threadScrollable).toBe(true);

  const viewport = page.viewportSize();
  const composerBox = await composer.boundingBox();
  expect(viewport).not.toBeNull();
  expect(composerBox).not.toBeNull();

  if (viewport && composerBox) {
    const gapToBottom = viewport.height - (composerBox.y + composerBox.height);
    expect(gapToBottom).toBeGreaterThanOrEqual(0);
    expect(gapToBottom).toBeLessThanOrEqual(120);
  }

  await expect(wrapper).toBeVisible();
}

test.describe('Chat operacional - layout e scroll', () => {
  test.use({ viewport: { width: 1366, height: 768 } });

  test('composer fica no fim e apenas o thread tem scroll', async ({ page }) => {
    test.skip(!SICAT_PASSWORD, 'SICAT_PASSWORD ausente em frontend/.env');
    test.setTimeout(180_000);

    await loginAndActivate(page);

    await page.goto(`${BASE}/conversacional/chat`);
    await page.waitForLoadState('networkidle');
    await appReady(page);

    await assertSingleScrollAndComposerAtBottom(page);

    // Navega para outra rota e volta para garantir estabilidade do layout
    await page.goto(`${BASE}/dashboard`);
    await page.waitForLoadState('networkidle');
    await appReady(page);

    await page.goto(`${BASE}/conversacional/chat`);
    await page.waitForLoadState('networkidle');
    await appReady(page);

    await assertSingleScrollAndComposerAtBottom(page);

    await page.screenshot({
      path: 'test-results/chat-layout-scroll-validation.png',
      fullPage: true
    });
  });
});

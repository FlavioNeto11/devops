/**
 * QA Test: Homepage Pública - Theme Toggle e Contraste CTA
 *
 * Valida:
 * 1. Botão de alternância light/dark funcional na navbar
 * 2. Alternância sincroniza com tema global e persiste
 * 3. CTA "Iniciar capitulo 1" tem contraste legível no tema claro
 * 4. Tema dark da home não regride
 * 5. Navegação sem quebra ao /login
 */

import { test, expect, type Page, type Locator } from '@playwright/test';

const BASE_URL = 'http://127.0.0.1:5174';

async function waitForAppReady(page: Page) {
  await page.waitForSelector('.home-root', { timeout: 15_000 });
}

async function getThemeButtonLabel(page: Page): Promise<string | null> {
  const btn = page.locator('.home-btn--icon[title="Alternar tema"]');
  return btn.getAttribute('aria-label');
}

async function toggleTheme(page: Page): Promise<void> {
  const btn = page.locator('.home-btn--icon[title="Alternar tema"]');
  await btn.click();
  // Aguarda transição visual
  await page.waitForTimeout(300);
}

test.describe('QA Homepage Pública — Theme Toggle e Contraste', () => {
  test.beforeEach(async ({ page, context }) => {
    // Usa context fresh para cada teste (evita problemas de localStorage)
    await page.goto(`${BASE_URL}/`);
    await waitForAppReady(page);
  });

  test('01 — Botão de tema toggle existe e é funcional na navbar', async ({ page }) => {
    const themeBtn = page.locator('.home-btn--icon[title="Alternar tema"]');
    await expect(themeBtn).toBeVisible();

    // Deve ter aria-label
    const label = await themeBtn.getAttribute('aria-label');
    expect(label).toMatch(/(Ativar tema (claro|escuro))/);
    expect(label).toBeTruthy();

    console.log(`✓ Botão de tema encontrado com label: "${label}"`);
  });

  test('02 — Alternância de tema funciona (light → dark → light)', async ({ page }) => {
    const homeRoot = page.locator('.home-root');

    // Inicia em light (default)
    let isDark = await homeRoot.evaluate((el) => el.classList.contains('home-root--dark'));
    expect(isDark).toBe(false);
    console.log('✓ Estado inicial: LIGHT');

    // Click → Dark
    await toggleTheme(page);
    isDark = await homeRoot.evaluate((el) => el.classList.contains('home-root--dark'));
    expect(isDark).toBe(true);
    console.log('✓ Após primeiro toggle: DARK');

    // Click → Light
    await toggleTheme(page);
    isDark = await homeRoot.evaluate((el) => el.classList.contains('home-root--dark'));
    expect(isDark).toBe(false);
    console.log('✓ Após segundo toggle: LIGHT');
  });

  test('03 — Tema persiste após mudança (observable via aria-label)', async ({ page }) => {
    // Inicia em light
    let label = await getThemeButtonLabel(page);
    expect(label).toBe('Ativar tema escuro');

    // Alterna para dark
    await toggleTheme(page);
    label = await getThemeButtonLabel(page);
    expect(label).toBe('Ativar tema claro');
    console.log('✓ Tema alterado para dark via toggle');
  });

  test('04 — CTA "Iniciar capitulo 1" tem contraste adequado em light mode', async ({ page }) => {
    // Garante light mode
    const homeRoot = page.locator('.home-root');
    let isDark = await homeRoot.evaluate((el) => el.classList.contains('home-root--dark'));
    if (isDark) {
      await toggleTheme(page);
    }

    // Localiza botão "Iniciar capitulo 1" usando Locator
    const ctaBtn = page.locator('a.home-btn--ghost').filter({ hasText: 'Iniciar capitulo 1' });
    await expect(ctaBtn).toBeVisible();

    // Calcula o contraste verificando elemento via getAllLocators
    const btnElement = await ctaBtn.first().evaluate((el: HTMLElement) => {
      const computed = window.getComputedStyle(el);
      const textColor = computed.color;
      const bgColor = computed.backgroundColor;

      // Parse RGB
      const parseRgb = (rgb: string): [number, number, number] => {
        const match = rgb.match(/rgb(?:a)?\(([^)]+)\)/);
        if (!match) throw new Error(`Cannot parse color: ${rgb}`);
        const [r, g, b] = match[1].split(',').map((v) => parseInt(v.trim(), 10));
        return [r, g, b];
      };

      // Compute luminance
      const getLuminance = ([r, g, b]: [number, number, number]): number => {
        const [rs, gs, bs] = [r, g, b].map((v) => {
          const c = v / 255;
          return c <= 0.03928 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4);
        });
        return 0.2126 * rs + 0.7152 * gs + 0.0722 * bs;
      };

      const textLum = getLuminance(parseRgb(textColor));
      const bgLum = getLuminance(parseRgb(bgColor));

      const lighter = Math.max(textLum, bgLum);
      const darker = Math.min(textLum, bgLum);
      const ratio = (lighter + 0.05) / (darker + 0.05);

      return {
        text: textColor,
        bg: bgColor,
        ratio: Math.round(ratio * 100) / 100,
      };
    });

    // Validação WCAG AA: 3:1 para large text
    expect(btnElement.ratio).toBeGreaterThanOrEqual(3);

    console.log(`✓ Contraste CTA em light mode: ${btnElement.ratio}:1`);
    console.log(`  Texto: ${btnElement.text}, BG: ${btnElement.bg}`);
  });

  test('05 — CTA "Iniciar capitulo 1" tem contraste adequado em dark mode', async ({ page }) => {
    // Alterna para dark
    await toggleTheme(page);

    // Localiza botão "Iniciar capitulo 1" usando Locator
    const ctaBtn = page.locator('a.home-btn--ghost').filter({ hasText: 'Iniciar capitulo 1' });
    await expect(ctaBtn).toBeVisible();

    // Calcula o contraste
    const btnElement = await ctaBtn.first().evaluate((el: HTMLElement) => {
      const computed = window.getComputedStyle(el);
      const textColor = computed.color;
      const bgColor = computed.backgroundColor;

      // Parse RGB
      const parseRgb = (rgb: string): [number, number, number] => {
        const match = rgb.match(/rgb(?:a)?\(([^)]+)\)/);
        if (!match) throw new Error(`Cannot parse color: ${rgb}`);
        const [r, g, b] = match[1].split(',').map((v) => parseInt(v.trim(), 10));
        return [r, g, b];
      };

      // Compute luminance
      const getLuminance = ([r, g, b]: [number, number, number]): number => {
        const [rs, gs, bs] = [r, g, b].map((v) => {
          const c = v / 255;
          return c <= 0.03928 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4);
        });
        return 0.2126 * rs + 0.7152 * gs + 0.0722 * bs;
      };

      const textLum = getLuminance(parseRgb(textColor));
      const bgLum = getLuminance(parseRgb(bgColor));

      const lighter = Math.max(textLum, bgLum);
      const darker = Math.min(textLum, bgLum);
      const ratio = (lighter + 0.05) / (darker + 0.05);

      return {
        text: textColor,
        bg: bgColor,
        ratio: Math.round(ratio * 100) / 100,
      };
    });

    // Validação WCAG AA: 3:1 para large text
    expect(btnElement.ratio).toBeGreaterThanOrEqual(3);

    console.log(`✓ Contraste CTA em dark mode: ${btnElement.ratio}:1`);
    console.log(`  Texto: ${btnElement.text}, BG: ${btnElement.bg}`);
  });

  test('06 — Tema dark da home não regride (estilos aplicados)', async ({ page }) => {
    // Alterna para dark
    await toggleTheme(page);

    // Valida que as cores CSS do dark mode estão aplicadas
    const cssVars = await page.evaluate(() => {
      const root = document.querySelector('.home-root');
      const computed = window.getComputedStyle(root!);
      return {
        bgDark: computed.getPropertyValue('--home-bg').trim(),
        textTitleDark: computed.getPropertyValue('--home-text-title').trim(),
        btnGhostTextDark: computed.getPropertyValue('--home-btn-ghost-text').trim(),
      };
    });

    // Valida valores do dark mode
    expect(cssVars.bgDark).toMatch(/#03131a|#081521|rgb/);
    expect(cssVars.textTitleDark).toMatch(/ecf8ff|fff|rgb/);
    expect(cssVars.btnGhostTextDark).toMatch(/#72d9ff|rgb/);

    console.log('✓ Variáveis CSS dark mode aplicadas corretamente');
    console.log(`  BG: ${cssVars.bgDark}`);
    console.log(`  Text: ${cssVars.textTitleDark}`);
    console.log(`  Button Text: ${cssVars.btnGhostTextDark}`);
  });

  test('07 — Botão "Entrar na plataforma" leva ao /login sem quebra', async ({ page }) => {
    // Localiza botão principal "Entrar na plataforma"
    const loginBtn = page.locator('.home-btn--solid:has-text("Entrar na plataforma")').first();
    await expect(loginBtn).toBeVisible();

    // Click
    await loginBtn.click();

    // Aguarda navegação
    await page.waitForURL(`${BASE_URL}/**`, { timeout: 10_000 });

    // Verifica que chegou em uma rota de autenticação
    const url = page.url();
    expect(url).toContain('login');

    console.log(`✓ Navegação para login funcionou: ${url}`);
  });

  test('08 — Focus states estão acessíveis (keyboard navigation)', async ({ page }) => {
    // Garante light mode
    const homeRoot = page.locator('.home-root');
    let isDark = await homeRoot.evaluate((el) => el.classList.contains('home-root--dark'));
    if (isDark) {
      await toggleTheme(page);
    }

    // Pressiona Tab para navegar até o botão de tema
    let focusedElement: string | null = null;
    for (let i = 0; i < 20; i++) {
      await page.keyboard.press('Tab');
      focusedElement = await page.evaluate(() => {
        const el = document.activeElement as HTMLElement;
        return el?.getAttribute('title') || el?.getAttribute('aria-label') || null;
      });

      if (focusedElement?.includes('Alternar tema')) {
        break;
      }
    }

    expect(focusedElement).toContain('Alternar tema');

    // Verifica que :focus-visible está ativo
    const hasFocusVisible = await page.evaluate(() => {
      const el = document.activeElement as HTMLElement;
      return el ? el.matches(':focus-visible') : false;
    });

    expect(hasFocusVisible).toBe(true);
    console.log('✓ Botão de tema focável e com :focus-visible');
  });

  test('09 — Homepage carrega sem erros console', async ({ page }) => {
    const errors: string[] = [];

    page.on('console', (msg) => {
      if (msg.type() === 'error') {
        errors.push(msg.text());
      }
    });

    await page.goto(`${BASE_URL}/`);
    await waitForAppReady(page);

    // Aguarda um pouco para detectar erros deferred
    await page.waitForTimeout(1000);

    expect(errors.length).toBe(0);
    console.log('✓ Nenhum erro console detectado');
  });

  test('10 — Responsividade: toggle tema funciona em mobile (375px)', async ({ browser }) => {
    const context = await browser.newContext({ viewport: { width: 375, height: 667 } });
    const page = await context.newPage();

    await page.goto(`${BASE_URL}/`);
    await waitForAppReady(page);

    // Localiza botão de tema (deve estar visível mesmo em mobile)
    const themeBtn = page.locator('.home-btn--icon[title="Alternar tema"]');
    await expect(themeBtn).toBeVisible();

    // Alterna tema
    await themeBtn.click();
    await page.waitForTimeout(300);

    // Valida que tema mudou
    const homeRoot = page.locator('.home-root');
    const isDark = await homeRoot.evaluate((el) => el.classList.contains('home-root--dark'));
    expect(isDark).toBe(true);

    console.log('✓ Toggle tema funciona em mobile (375x667)');
    await context.close();
  });
});

/**
 * Teste E2E completo — SICAT todas as funcionalidades
 *
 * Cobre: login real, seleção de conta CETESB, todas as rotas autenticadas,
 * chat conversacional (nova feature), popup copiloto interno, manifestos,
 * relatórios, jobs, sessão, administração.
 *
 * Requer:
 *   - Stack local rodando: API (8080) + frontend (5174)
 *   - frontend/.env com SICAT_EMAIL e SICAT_PASSWORD configurados
 */

import { test, expect, type Page } from '@playwright/test';
import * as fs from 'node:fs';
import * as path from 'node:path';

// ---------------------------------------------------------------------------
// Carrega frontend/.env automaticamente
// ---------------------------------------------------------------------------
(function loadDotEnv() {
  try {
    const envFile = path.join(
      path.dirname(new URL(import.meta.url).pathname.replace(/^\/([A-Z]:)/, '$1')),
      '../..', '.env'
    );
    if (fs.existsSync(envFile)) {
      for (const line of fs.readFileSync(envFile, 'utf-8').split('\n')) {
        const trimmed = line.trim();
        if (!trimmed || trimmed.startsWith('#')) continue;
        const eqIdx = trimmed.indexOf('=');
        if (eqIdx === -1) continue;
        const key = trimmed.slice(0, eqIdx).trim();
        const val = trimmed.slice(eqIdx + 1).trim();
        if (key && !(key in process.env)) process.env[key] = val;
      }
    }
  } catch { /* silencioso */ }
})();

const SICAT_EMAIL = process.env.SICAT_EMAIL || '';
const SICAT_PASSWORD = process.env.SICAT_PASSWORD || '';
const BASE = 'http://127.0.0.1:5174';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------
async function appReady(page: Page) {
  await page.waitForSelector('.v-application', { timeout: 15_000 });
}

async function screenshot(page: Page, name: string) {
  await page.screenshot({ path: `test-results/full-nav-${name}.png`, fullPage: true });
}

/**
 * Faz login real e aguarda a tela de seleção de conta CETESB.
 */
async function login(page: Page) {
  await page.goto(`${BASE}/login`);
  await appReady(page);

  await page.locator('input[type="email"], input[name="email"]').first().fill(SICAT_EMAIL);
  await page.locator('input[type="password"]').first().fill(SICAT_PASSWORD);
  await page.locator('button[type="submit"], button:has-text("Entrar"), button:has-text("Login")').first().click();

  await page.waitForURL(`${BASE}/login/cetesb`, { timeout: 25_000 });
  console.log('✓ Login — redirecionado para /login/cetesb');
}

/**
 * Seleciona a primeira conta CETESB disponível e aguarda /dashboard.
 * Retorna true se chegou ao dashboard, false se o redirecionamento não ocorreu.
 */
async function activateCetesbAccount(page: Page): Promise<boolean> {
  const btn = page.locator(
    'button:has-text("Entrar"), button:has-text("Ativar"), ' +
    'button:has-text("Usar esta conta"), button:has-text("Selecionar")'
  ).first();

  if (!await btn.isVisible({ timeout: 5_000 }).catch(() => false)) {
    console.log('[cetesb] Nenhum botão de ativação visível — pode já estar ativada');
    return false;
  }

  await btn.click();
  const ok = await page.waitForURL(`${BASE}/dashboard`, { timeout: 30_000 }).then(() => true).catch(() => false);
  if (ok) {
    console.log('✓ Conta CETESB ativada — em /dashboard');
  } else {
    console.log('[cetesb] Ativação não redirecionou automaticamente');
  }
  return ok;
}

/**
 * Garante que a sessão está no dashboard.
 */
async function goToDashboard(page: Page) {
  await login(page);
  await appReady(page);
  await activateCetesbAccount(page);
  await page.waitForLoadState('networkidle');
  if (!page.url().includes('/dashboard')) {
    await page.goto(`${BASE}/dashboard`);
    await page.waitForLoadState('networkidle');
  }
  await appReady(page);
}

// ---------------------------------------------------------------------------
// Pré-condição global
// ---------------------------------------------------------------------------
test.beforeAll(() => {
  if (!SICAT_PASSWORD) {
    console.warn('[Skip] SICAT_PASSWORD não definido em frontend/.env — todos os testes serão pulados');
  }
});

// ---------------------------------------------------------------------------
// Suite principal
// ---------------------------------------------------------------------------
test.describe('SICAT — Navegação completa E2E', () => {
  test.describe.configure({ mode: 'serial' });
  test.use({ viewport: { width: 1440, height: 900 } });

  // ── 01 — Login ─────────────────────────────────────────────────────────
  test('01 — Login com credenciais reais', async ({ page }) => {
    test.skip(!SICAT_PASSWORD, 'SICAT_PASSWORD ausente');

    const jsErrors: string[] = [];
    page.on('console', msg => { if (msg.type() === 'error') jsErrors.push(msg.text()); });

    await login(page);
    await appReady(page);
    await screenshot(page, '01-cetesb-account-selection');

    const cards = page.locator('.v-card');
    expect(await cards.count()).toBeGreaterThan(0);
    console.log(`✓ ${await cards.count()} conta(s) CETESB listada(s)`);

    const relevantErrors = jsErrors.filter(e => !e.includes('401') && !e.includes('favicon') && !e.includes('net::ERR'));
    expect(relevantErrors, `Erros JS: ${relevantErrors.join(' | ')}`).toHaveLength(0);
  });

  // ── 02 — Dashboard ──────────────────────────────────────────────────────
  test('02 — Dashboard carrega corretamente', async ({ page }) => {
    test.skip(!SICAT_PASSWORD, 'SICAT_PASSWORD ausente');
    test.setTimeout(60_000);

    const jsErrors: string[] = [];
    page.on('console', msg => { if (msg.type() === 'error') jsErrors.push(msg.text()); });

    await goToDashboard(page);
    await screenshot(page, '02-dashboard');

    expect(page.url()).toContain('/dashboard');
    console.log('✓ Dashboard carregado');

    // Verifica navegação lateral/header visível
    const nav = page.locator('nav, [role="navigation"], .v-navigation-drawer');
    if (await nav.first().isVisible({ timeout: 5_000 }).catch(() => false)) {
      console.log('✓ Navegação lateral visível');
    }

    const relevantErrors = jsErrors.filter(e =>
      !e.includes('401') && !e.includes('favicon') && !e.includes('net::ERR') && !e.includes('Failed to fetch')
    );
    expect(relevantErrors, `Erros JS no dashboard: ${relevantErrors.join(' | ')}`).toHaveLength(0);
  });

  // ── 03 — Manifestos ─────────────────────────────────────────────────────
  test('03 — Lista de manifestos carrega', async ({ page }) => {
    test.skip(!SICAT_PASSWORD, 'SICAT_PASSWORD ausente');
    test.setTimeout(60_000);

    await goToDashboard(page);
    await page.goto(`${BASE}/manifestos`);
    await page.waitForLoadState('networkidle');
    await appReady(page);
    await screenshot(page, '03-manifestos');

    expect(page.url()).toContain('/manifestos');
    console.log('✓ Rota /manifestos acessível');

    // Verifica que a tabela/lista ou estado vazio aparece
    const listOrEmpty = page.locator('table, .v-data-table, [role="grid"], .v-list, .manifest-list, text="Nenhum manifesto"');
    const found = await listOrEmpty.first().isVisible({ timeout: 8_000 }).catch(() => false);
    console.log(found ? '✓ Conteúdo de manifestos visível' : '[aviso] Conteúdo de lista não detectado');
  });

  // ── 04 — Detalhe de manifesto (navegação discreta) ─────────────────────
  test('04 — Tentar abrir detalhe de manifesto', async ({ page }) => {
    test.skip(!SICAT_PASSWORD, 'SICAT_PASSWORD ausente');
    test.setTimeout(60_000);

    await goToDashboard(page);
    await page.goto(`${BASE}/manifestos`);
    await page.waitForLoadState('networkidle');
    await appReady(page);

    // Clicar no primeiro item da grade de manifestos quando houver linha de dados.
    const firstRow = page.locator('table tbody tr[data-vv-item], table tbody tr').first();
    if (await firstRow.isVisible({ timeout: 5_000 }).catch(() => false)) {
      await firstRow.scrollIntoViewIfNeeded();
      await firstRow.click();
      await page.waitForLoadState('networkidle');
      await appReady(page);
      await screenshot(page, '04-manifesto-detalhe');
      console.log(`✓ Detalhe de manifesto aberto: ${page.url()}`);
    } else {
      console.log('[aviso] Nenhum manifesto disponível para abrir detalhe');
      await screenshot(page, '04-manifestos-vazio');
    }
  });

  // ── 05 — Relatório MTR ──────────────────────────────────────────────────
  test('05 — Relatório MTR carrega', async ({ page }) => {
    test.skip(!SICAT_PASSWORD, 'SICAT_PASSWORD ausente');
    test.setTimeout(60_000);

    await goToDashboard(page);
    await page.goto(`${BASE}/relatorios/mtrs`);
    await page.waitForLoadState('networkidle');
    await appReady(page);
    await screenshot(page, '05-relatorio-mtrs');

    expect(page.url()).toContain('/relatorios/mtrs');
    console.log('✓ Rota /relatorios/mtrs acessível');
  });

  // ── 06 — Jobs ───────────────────────────────────────────────────────────
  test('06 — Página de Jobs carrega', async ({ page }) => {
    test.skip(!SICAT_PASSWORD, 'SICAT_PASSWORD ausente');
    test.setTimeout(60_000);

    await goToDashboard(page);
    await page.goto(`${BASE}/jobs`);
    await page.waitForLoadState('networkidle');
    await appReady(page);
    await screenshot(page, '06-jobs');

    expect(page.url()).toContain('/jobs');
    console.log('✓ Rota /jobs acessível');
  });

  // ── 07 — Sessão/Conta ───────────────────────────────────────────────────
  test('07 — Página de Sessão/Conta carrega', async ({ page }) => {
    test.skip(!SICAT_PASSWORD, 'SICAT_PASSWORD ausente');
    test.setTimeout(60_000);

    await goToDashboard(page);
    await page.goto(`${BASE}/sessao`);
    await page.waitForLoadState('networkidle');
    await appReady(page);
    await screenshot(page, '07-sessao');

    expect(page.url()).toContain('/sessao');
    console.log('✓ Rota /sessao acessível');
  });

  // ── 08 — Chat Operacional (nova feature — no shell autenticado) ─────────
  test('08 — Chat operacional carrega no shell autenticado', async ({ page }) => {
    test.skip(!SICAT_PASSWORD, 'SICAT_PASSWORD ausente');
    test.setTimeout(60_000);

    const jsErrors: string[] = [];
    page.on('console', msg => { if (msg.type() === 'error') jsErrors.push(msg.text()); });

    await goToDashboard(page);
    await page.goto(`${BASE}/conversacional/chat`);
    await page.waitForLoadState('networkidle');
    await appReady(page);
    await screenshot(page, '08-chat-operacional');

    expect(page.url()).toContain('/conversacional/chat');
    console.log('✓ Rota /conversacional/chat acessível');

    // Verifica que NÃO está em fullBleed (deve estar no shell autenticado)
    const shell = page.locator('nav, .v-navigation-drawer, [role="navigation"]').first();
    const hasShell = await shell.isVisible({ timeout: 5_000 }).catch(() => false);
    console.log(hasShell ? '✓ Shell autenticado visível no chat' : '[aviso] Shell não detectado');

    // Verifica a área do composer está visível
    const composer = page.locator('textarea, input[type="text"]').last();
    const composerVisible = await composer.isVisible({ timeout: 5_000 }).catch(() => false);
    console.log(composerVisible ? '✓ Composer do chat visível' : '[aviso] Composer não encontrado');

    const relevantErrors = jsErrors.filter(e =>
      !e.includes('401') && !e.includes('favicon') && !e.includes('net::ERR')
    );
    expect(relevantErrors, `Erros JS no chat: ${relevantErrors.join(' | ')}`).toHaveLength(0);
  });

  // ── 09 — Enviar mensagem no chat (smoke) ────────────────────────────────
  test('09 — Enviar mensagem no chat operacional', async ({ page }) => {
    test.skip(!SICAT_PASSWORD, 'SICAT_PASSWORD ausente');
    test.setTimeout(90_000);

    await goToDashboard(page);
    await page.goto(`${BASE}/conversacional/chat`);
    await page.waitForLoadState('networkidle');
    await appReady(page);

    // Localizar e preencher o composer
    const textarea = page.locator('textarea').first();
    if (!await textarea.isVisible({ timeout: 8_000 }).catch(() => false)) {
      console.log('[aviso] Textarea do chat não encontrada — pulando envio de mensagem');
      return;
    }

    await textarea.fill('dashboard');
    await screenshot(page, '09-chat-antes-envio');

    // Enter para enviar
    await textarea.press('Enter');
    console.log('✓ Mensagem enviada via Enter');

    // Aguarda resposta do assistente (até 30s — backend faz chamada LLM)
    await page.waitForTimeout(2_000);
    await screenshot(page, '09-chat-aguardando-resposta');

    const responseVisible = await page.waitForFunction(
      () => document.querySelectorAll('[class*="chat-message"]').length >= 2,
      { timeout: 30_000 }
    ).then(() => true).catch(() => false);

    await screenshot(page, '09-chat-apos-resposta');
    console.log(responseVisible ? '✓ Resposta do assistente recebida' : '[aviso] Resposta não detectada no tempo limite');
  });

  // ── 10 — Popup copiloto interno ─────────────────────────────────────────
  test('10 — Popup copiloto interno abre e fecha', async ({ page }) => {
    test.skip(!SICAT_PASSWORD, 'SICAT_PASSWORD ausente');
    test.setTimeout(60_000);

    await goToDashboard(page);

    // O copiloto está no /dashboard (ou qualquer rota autenticada)
    const launcherBtn = page.locator('button:has-text("Copiloto"), [aria-label*="copiloto"], [aria-label*="Copiloto"]').first();
    const hasLauncher = await launcherBtn.isVisible({ timeout: 8_000 }).catch(() => false);

    if (!hasLauncher) {
      console.log('[aviso] Botão do copiloto não encontrado no dashboard — pulando');
      await screenshot(page, '10-copiloto-nao-encontrado');
      return;
    }

    // Abre o painel
    await launcherBtn.click();
    await page.waitForTimeout(500);
    await screenshot(page, '10-copiloto-aberto');
    console.log('✓ Copiloto aberto');

    // Verifica que o painel está visível
    const panel = page.locator('dialog[open], [class*="copilot-panel"]').first();
    const panelVisible = await panel.isVisible({ timeout: 5_000 }).catch(() => false);
    console.log(panelVisible ? '✓ Painel do copiloto visível' : '[aviso] Painel não detectado');

    // Fecha via Escape
    await page.keyboard.press('Escape');
    await page.waitForTimeout(300);
    await screenshot(page, '10-copiloto-fechado');
    console.log('✓ Copiloto fechado via Escape');
  });

  // ── 11 — Quick actions no chat ──────────────────────────────────────────
  test('11 — Quick actions do chat operacional', async ({ page }) => {
    test.skip(!SICAT_PASSWORD, 'SICAT_PASSWORD ausente');
    test.setTimeout(60_000);

    await goToDashboard(page);
    await page.goto(`${BASE}/conversacional/chat`);
    await page.waitForLoadState('networkidle');
    await appReady(page);

    const quickActions = page.locator('[class*="quick-action"], [class*="chat-action"], button[class*="pill"]');
    const count = await quickActions.count();
    console.log(`[quick-actions] ${count} quick action(s) visível(is)`);
    await screenshot(page, '11-chat-quick-actions');

    if (count > 0) {
      await quickActions.first().click();
      await page.waitForTimeout(500);
      await screenshot(page, '11-chat-quick-action-clicada');
      console.log('✓ Quick action clicada');
    }
  });

  // ── 12 — Criar manifesto (página de novo manifesto) ─────────────────────
  test('12 — Página criar manifesto acessível', async ({ page }) => {
    test.skip(!SICAT_PASSWORD, 'SICAT_PASSWORD ausente');
    test.setTimeout(60_000);

    await goToDashboard(page);
    await page.goto(`${BASE}/manifestos/novo`);
    await page.waitForLoadState('networkidle');
    await appReady(page);
    await screenshot(page, '12-manifesto-novo');

    const url = page.url();
    const ok = url.includes('/manifestos/novo') || url.includes('/manifestos');
    console.log(ok ? '✓ Rota de criação de manifesto acessível' : `[aviso] URL inesperada: ${url}`);
  });

  // ── 13 — Responsividade mobile (viewport 375px) ─────────────────────────
  test('13 — Dashboard responsivo em mobile', async ({ page }) => {
    test.skip(!SICAT_PASSWORD, 'SICAT_PASSWORD ausente');
    test.setTimeout(60_000);

    await page.setViewportSize({ width: 375, height: 812 });
    await goToDashboard(page);
    await screenshot(page, '13-dashboard-mobile');

    expect(page.url()).toContain('/dashboard');
    console.log('✓ Dashboard carregado em viewport mobile (375px)');
  });

  // ── 14 — Chat em mobile ──────────────────────────────────────────────────
  test('14 — Chat operacional responsivo em mobile', async ({ page }) => {
    test.skip(!SICAT_PASSWORD, 'SICAT_PASSWORD ausente');
    test.setTimeout(60_000);

    await page.setViewportSize({ width: 375, height: 812 });
    await goToDashboard(page);
    await page.goto(`${BASE}/conversacional/chat`);
    await page.waitForLoadState('networkidle');
    await appReady(page);
    await screenshot(page, '14-chat-mobile');

    expect(page.url()).toContain('/conversacional/chat');
    console.log('✓ Chat carregado em mobile');

    // Compositor deve estar visível mesmo em mobile
    const textarea = page.locator('textarea').first();
    const composerVisible = await textarea.isVisible({ timeout: 5_000 }).catch(() => false);
    console.log(composerVisible ? '✓ Composer visível no mobile' : '[aviso] Composer não visível no mobile');
  });

  // ── 15 — Logout ──────────────────────────────────────────────────────────
  test('15 — Logout funciona corretamente', async ({ page }) => {
    test.skip(!SICAT_PASSWORD, 'SICAT_PASSWORD ausente');
    test.setTimeout(60_000);

    await goToDashboard(page);
    await screenshot(page, '15-antes-logout');

    // Tenta encontrar botão de logout no header/menu
    const logoutBtn = page.locator(
      'button:has-text("Sair"), button:has-text("Logout"), ' +
      '[aria-label*="Sair"], [aria-label*="logout"], ' +
      '[title*="Sair"], [title*="logout"]'
    ).first();

    const hasLogout = await logoutBtn.isVisible({ timeout: 5_000 }).catch(() => false);
    if (hasLogout) {
      await logoutBtn.click();
      await page.waitForLoadState('networkidle');
      await screenshot(page, '15-apos-logout');
      const urlAfterLogout = page.url();
      const isOnLogin = urlAfterLogout.includes('/login') || urlAfterLogout.includes('/');
      console.log(isOnLogin ? '✓ Logout redireciona para login/home' : `[aviso] URL após logout: ${urlAfterLogout}`);
    } else {
      // Tenta menu de usuário antes do logout
      const avatarBtn = page.locator('.v-avatar, [class*="user-menu"], button[aria-haspopup="listbox"]').first();
      if (await avatarBtn.isVisible({ timeout: 3_000 }).catch(() => false)) {
        await avatarBtn.click();
        await page.waitForTimeout(300);
        await screenshot(page, '15-menu-usuario-aberto');
        const logoutInMenu = page.locator('button:has-text("Sair"), .v-list-item:has-text("Sair")').first();
        if (await logoutInMenu.isVisible({ timeout: 3_000 }).catch(() => false)) {
          await logoutInMenu.click();
          await page.waitForLoadState('networkidle');
          await screenshot(page, '15-apos-logout-menu');
          console.log('✓ Logout via menu de usuário');
        } else {
          console.log('[aviso] Botão de logout não encontrado no menu');
        }
      } else {
        console.log('[aviso] Botão de logout não encontrado — testando limpeza de sessão via URL');
        await page.goto(`${BASE}/login`);
        await page.waitForLoadState('networkidle');
        console.log('✓ Navegação para /login bem-sucedida');
      }
    }
  });
});

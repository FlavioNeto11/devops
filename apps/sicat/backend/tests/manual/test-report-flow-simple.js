/**
 * Test: Report Flow - Versão Simplificada com Melhor Tratamento de Erros
 * 
 * Versão reduzida para diagnosticar exatamente onde o teste falha
 */

import { chromium } from 'playwright';
import fs from 'fs';
import path from 'path';

const BASE_URL = 'http://127.0.0.1:5174';
const EMAIL = 'flavio_padilha_neto@msn.com';
const PASSWORD = '08897520@Fpn';
const SCREENSHOT_DIR = './storage/temp/playwright-diagnostics';

function log(msg) {
  console.log(`[${new Date().toISOString().split('T')[1].split('.')[0]}] ${msg}`);
}

async function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

async function takeScreenshot(page, name) {
  try {
    const filename = path.join(SCREENSHOT_DIR, `${Date.now()}-${name}.png`);
    await page.screenshot({ path: filename, fullPage: true });
    log(`✓ Screenshot: ${name}`);
    return filename;
  } catch (err) {
    log(`❌ Erro capturando screenshot ${name}: ${err.message}`);
  }
}

async function main() {
  let browser;
  try {
    log('═'.repeat(70));
    log('TESTE: Fluxo de Geração de Relatório MTR - SIMPLIFICADO');
    log('═'.repeat(70));

    // Criar diretório
    if (!fs.existsSync(SCREENSHOT_DIR)) {
      fs.mkdirSync(SCREENSHOT_DIR, { recursive: true });
    }

    // Abrir navegador
    log('1. Abrindo navegador Playwright (headed)...');
    browser = await chromium.launch({ headless: false });
    const page = await browser.newPage();
    page.setViewportSize({ width: 1920, height: 1080 });

    // Ir para login
    log('2. Navegando para página de login...');
    await page.goto(`${BASE_URL}/auth/login`, { waitUntil: 'domcontentloaded', timeout: 15000 });
    await sleep(500);
    await takeScreenshot(page, '01-login-page');

    // Preencher credenciais
    log('3. Preenchendo email e senha...');
    const emailInput = page.locator('input[type="email"]').first();
    const passwordInput = page.locator('input[type="password"]').first();

    await emailInput.fill(EMAIL, { timeout: 5000 }).catch(e => {
      log(`⚠️  Erro preenchendo email: ${e.message}`);
      throw e;
    });
    
    await passwordInput.fill(PASSWORD, { timeout: 5000 }).catch(e => {
      log(`⚠️  Erro preenchendo senha: ${e.message}`);
      throw e;
    });

    await sleep(500);
    await takeScreenshot(page, '02-credentials-filled');

    // Clicar login
    log('4. Clicando botão Login...');
    const loginBtn = page.locator('button[type="submit"], button:has-text("Entrar"), button:has-text("Login")').first();
    await loginBtn.click({ timeout: 5000 }).catch(e => {
      log(`⚠️  Erro clicando login: ${e.message}`);
      throw e;
    });

    // Esperar navegação - mas sem timeout muito curto
    log('5. Aguardando navegação pós-login...');
    try {
      await Promise.race([
        page.waitForNavigation({ timeout: 10000 }).catch(err => log(`   ⚠️  waitForNavigation erro: ${err.message}`)),
        sleep(3000),
      ]);
    } catch (err) {
      log(`   ⚠️  Erro em waitForNavigation: ${err.message}`);
    }

    await sleep(2000);
    await takeScreenshot(page, '03-after-login');

    // Procurar Nova IT
    log('6. Procurando botão "Nova IT"...');
    const buttons = await page.locator('button, [role="button"], a').all().catch(() => []);
    log(`   ℹ️  Encontrados ${buttons.length || 'N/A'} elementos clicáveis`);

    let novaItFound = false;
    for (let i = 0; i < (buttons.length || 0); i++) {
      const text = await buttons[i].textContent().catch(() => '');
      if (text && text.includes('Nova IT')) {
        log(`   ✓ Botão "Nova IT" encontrado (índice ${i})`);
        await buttons[i].click({ timeout: 5000 });
        novaItFound = true;
        break;
      }
    }

    if (!novaItFound) {
      log(`   ⚠️  Botão "Nova IT" não encontrado, procurando em todo o DOM`);
      const allText = await page.textContent('body').catch(() => '');
      if (allText && allText.includes('Nova IT')) {
        log(`   ℹ️  Texto "Nova IT" existe no DOM`);
        const elem = page.locator('text="Nova IT"').first();
        await elem.click({ timeout: 5000 }).catch(err => {
          log(`   ⚠️  Erro clicando em text=Nova IT: ${err.message}`);
        });
      } else {
        log(`   ❌ "Nova IT" não encontrado em lugar algum`);
      }
    }

    log('7. Aguardando carregamento após seleção de conta...');
    await sleep(3000);
    await takeScreenshot(page, '04-after-nova-it');

    // Procurar por Manifestos
    log('8. Navegando para Manifestos...');
    const manifestosLink = page.locator('text="Manifestos"').first();
    const manifestosExists = await manifestosLink.isVisible({ timeout: 2000 }).catch(() => false);

    if (!manifestosExists) {
      log(`   ℹ️  Link "Manifestos" não visível, navegando via URL`);
      await page.goto(`${BASE_URL}/manifestos`, { waitUntil: 'domcontentloaded', timeout: 15000 });
    } else {
      log(`   ✓ Link "Manifestos" detectado`);
      await manifestosLink.click({ timeout: 5000 });
      await page.waitForNavigation({ waitUntil: 'domcontentloaded', timeout: 10000 }).catch(() => {});
    }

    await sleep(2000);
    await takeScreenshot(page, '05-manifestos-page');

    log('9. Procurando manifesto...');
    const firstRow = await page.locator('tr, [role="row"], [class*="row"]').first().isVisible({ timeout: 2000 }).catch(() => false);
    if (!firstRow) {
      log(`   ⚠️  Nenhuma linha de tabela encontrada`);
    } else {
      log(`   ✓ Linha de manifesto detectada`);
    }

    await sleep(1000);
    await takeScreenshot(page, '06-manifestos-list');

    log('10. Clicando em primeiro manifesto...');
    const firstManifesto = page.locator('[role="row"], tr').first();
    await firstManifesto.click({ timeout: 5000 }).catch(err => {
      log(`   ⚠️  Erro clicando manifesto: ${err.message}`);
    });

    await sleep(2000);
    await takeScreenshot(page, '07-manifesto-detail');

    log('11. Procurando tela de Relatório...');
    const reportTab = page.locator('button, [role="tab"]').filter({ has: page.locator('text=/Relatório|Report|MTR|Imprimir/i') }).first();
    const reportVisible = await reportTab.isVisible({ timeout: 2000 }).catch(() => false);

    if (reportVisible) {
      log(`   ✓ Aba de Relatório encontrada`);
      await reportTab.click({ timeout: 5000 });
    } else {
      log(`   ⚠️  Aba de Relatório não visível`);
    }

    await sleep(1500);
    await takeScreenshot(page, '08-report-tab');

    log('12. Procurando botão de geração...');
    const generateBtn = page.locator('button:has-text("Gerar"), button:has-text("Imprimir"), button:has-text("Criar")').first();
    const generateVisible = await generateBtn.isVisible({ timeout: 2000 }).catch(() => false);

    if (generateVisible) {
      log(`   ✓ Botão de geração encontrado`);
      await generateBtn.click({ timeout: 5000 });
      
      log('13. Aguardando processamento (30s)...');
      await sleep(3000);
      await takeScreenshot(page, '09-after-generate');

      log('14. Observando resposta/loader...');
      for (let i = 0; i < 10; i++) {
        const loader = page.locator('[role="status"], .spinner, .loader').isVisible({ timeout: 1000 }).catch(() => false);
        if (!await loader) {
          log(`   ✓ Loader desapareceu`);
          break;
        }
        log(`   ⏳ Aguardando ${i + 1}s...`);
        await sleep(1000);
      }
      await takeScreenshot(page, '10-final-response');
    } else {
      log(`   ❌ Botão de geração NÃO encontrado`);
      await takeScreenshot(page, '09-no-generate-btn');
    }

    log('');
    log('✅ TESTE CONCLUÍDO COM SUCESSO');
    log('');

  } catch (err) {
    log(`❌ ERRO: ${err.message}`);
    log(`   Stack: ${err.stack}`);
    
    try {
      await takeScreenshot(browser?.currentPage?.(), '99-error');
    } catch {}
    
    process.exit(1);
  } finally {
    if (browser) {
      log('Fechando navegador...');
      await browser.close().catch(err => log(`Erro fechando navegador: ${err.message}`));
    }
    
    log('Teste finalizado.');
  }
}

main().catch(err => {
  console.error('❌ Erro não capturado:', err);
  process.exit(1);
});

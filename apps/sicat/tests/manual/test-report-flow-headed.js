/**
 * Test: Reproduz fluxo de geração de relatório MTR via Playwright (headed mode)
 * Objetivo: Diagnosticar por que jobs de relatório estão travando
 * 
 * Execução: node tests/manual/test-report-flow-headed.js
 * 
 * Credenciais:
 * - Email: flavio_padilha_neto@msn.com
 * - Senha: 08897520@Fpn
 */

import { chromium } from 'playwright';
import fs from 'fs';
import path from 'path';

const BASE_URL = 'http://127.0.0.1:5174';
const EMAIL = 'flavio_padilha_neto@msn.com';
const PASSWORD = '08897520@Fpn';
const ACCOUNT_NAME = 'Nova IT';

// Directory para armazenar evidências
const SCREENSHOT_DIR = './storage/temp/playwright-diagnostics';

function ensureScreenshotDir() {
  if (!fs.existsSync(SCREENSHOT_DIR)) {
    fs.mkdirSync(SCREENSHOT_DIR, { recursive: true });
  }
}

async function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

async function takeScreenshot(page, name) {
  const filename = path.join(SCREENSHOT_DIR, `${Date.now()}-${name}.png`);
  await page.screenshot({ path: filename, fullPage: true });
  console.log(`✓ Screenshot: ${filename}`);
  return filename;
}

async function collectNetworkRequests(page) {
  const requests = [];
  page.on('request', request => {
    requests.push({
      url: request.url(),
      method: request.method(),
      timestamp: new Date().toISOString(),
    });
  });
  return requests;
}

async function testReportFlow() {
  ensureScreenshotDir();
  
  const browser = await chromium.launch({
    headless: false, // HEADED MODE
    args: ['--start-maximized'],
  });

  const page = await browser.newPage();
  page.setViewportSize({ width: 1920, height: 1080 });

  // Coletar requisições de rede
  const networkRequests = [];
  page.on('request', req => {
    if (!req.url().includes('png') && !req.url().includes('ico')) {
      networkRequests.push({
        method: req.method(),
        url: req.url(),
        time: new Date().toISOString(),
      });
    }
  });

  const testLog = [];

  try {
    console.log('\n📋 TESTE: Fluxo de Geração de Relatório MTR\n');
    testLog.push('INÍCIO DO TESTE: ' + new Date().toISOString());

    // 1️⃣ Navegação para login
    console.log('1️⃣ Navegando para página de login...');
    testLog.push('1️⃣ Navegando para login');
    await page.goto(`${BASE_URL}/auth/login`, { waitUntil: 'networkidle' });
    await sleep(1000);
    await takeScreenshot(page, '01-login-page');

    // 2️⃣ Preenchimento de credenciais
    console.log('2️⃣ Preenchendo credenciais...');
    testLog.push('2️⃣ Preenchendo credenciais');
    
    // Email
    const emailInput = page.locator('input[type="email"], input[name="email"], input[placeholder*="email" i]').first();
    await emailInput.fill(EMAIL);
    console.log(`   → Email preenchido: ${EMAIL}`);

    // Senha
    const passwordInput = page.locator('input[type="password"], input[name="password"]').first();
    await passwordInput.fill(PASSWORD);
    console.log(`   → Senha preenchida`);

    await takeScreenshot(page, '02-credentials-filled');

    // 3️⃣ Clique em Login
    console.log('3️⃣ Clicando botão Login...');
    testLog.push('3️⃣ Clicando em Login');
    
    const loginButton = page.locator('button:has-text("Login"), button:has-text("Entrar"), button[type="submit"]').first();
    await loginButton.click();

    // Aguardar navegação (pode ser rápido ou lento)
    await page.waitForNavigation({ waitUntil: 'networkidle', timeout: 30000 }).catch(() => {
      console.log('   ⚠️  Timeout em waitForNavigation (esperado se houver dialog de conta)');
    });
    await sleep(2000);
    await takeScreenshot(page, '03-after-login');

    // 4️⃣ Seleção de Conta
    console.log('4️⃣ Verificando seleção de conta...');
    testLog.push('4️⃣ Verificando seleção de conta');

    // Procurar por texto "Nova IT" ou indicador de conta
    const novaItButton = page.locator(`text="${ACCOUNT_NAME}"`).first();
    const isVisible = await novaItButton.isVisible().catch(() => false);

    if (isVisible) {
      console.log(`   ✓ Botão "${ACCOUNT_NAME}" encontrado`);
      await novaItButton.click();
      console.log(`   ✓ Clicado em "${ACCOUNT_NAME}"`);
      testLog.push(`   ✓ Conta "${ACCOUNT_NAME}" selecionada`);
      
      await page.waitForNavigation({ waitUntil: 'networkidle', timeout: 15000 }).catch(() => {
        console.log('   ⚠️  Timeout em waitForNavigation (normal)');
      });
      await sleep(1500);
    } else {
      console.log(`   ⚠️  Botão "${ACCOUNT_NAME}" não visível, tentando clicar em outro item de conta`);
      const accountBtn = page.locator('button, [role="button"]').filter({ hasText: /Nova|IT|Account/ }).first();
      if (await accountBtn.isVisible().catch(() => false)) {
        await accountBtn.click();
      }
      await sleep(1500);
    }

    await takeScreenshot(page, '04-account-selected');

    // 5️⃣ Navegação para Manifestos
    console.log('5️⃣ Navegando para tela de Manifestos...');
    testLog.push('5️⃣ Navegando para Manifestos');

    // Procurar por link/botão "Manifestos"
    const manifestosLink = page.locator('text="Manifestos", a:has-text("Manifestos"), [role="button"]:has-text("Manifestos")').first();
    const manifestosVisible = await manifestosLink.isVisible().catch(() => false);

    if (!manifestosVisible) {
      console.log('   ℹ️  Link "Manifestos" não encontrado, navegando via URL...');
      await page.goto(`${BASE_URL}/manifestos`, { waitUntil: 'networkidle' });
    } else {
      console.log('   ✓ Link "Manifestos" encontrado, clicando...');
      await manifestosLink.click();
      await page.waitForNavigation({ waitUntil: 'networkidle', timeout: 15000 }).catch(() => {
        console.log('   ⚠️  Timeout em waitForNavigation');
      });
    }

    await sleep(2000);
    await takeScreenshot(page, '05-manifestos-page');

    // 6️⃣ Buscar manifesto com status "Cancelado"
    console.log('6️⃣ Procurando manifesto com status "Cancelado"...');
    testLog.push('6️⃣ Procurando manifesto');

    // Procurar por filtro/busca
    const searchInput = page.locator('input[placeholder*="Buscar" i], input[placeholder*="Search" i], input[type="search"]').first();
    const hasSearch = await searchInput.isVisible().catch(() => false);

    if (hasSearch) {
      console.log('   ℹ️  Campo de busca encontrado, aguardando listagem...');
      await sleep(2000);
    }

    await takeScreenshot(page, '06-manifestos-list');

    // Procurar por linha de manifesto (procurar "Cancelado")
    const canceledManifesto = page.locator('text="Cancelado"').first();
    const canceledExists = await canceledManifesto.isVisible().catch(() => false);

    if (canceledExists) {
      console.log('   ✓ Manifesto com status "Cancelado" encontrado');
      testLog.push('   ✓ Manifesto com status "Cancelado" encontrado');
      
      // Clicar no manifesto
      const row = canceledManifesto.locator('..').locator('..'); // Subir até encontrar a row
      await row.first().click();
      console.log('   ✓ Clicado no manifesto');
      
      await page.waitForNavigation({ waitUntil: 'networkidle', timeout: 15000 }).catch(() => {});
      await sleep(2000);
      await takeScreenshot(page, '07-manifesto-opened');
    } else {
      console.log('   ⚠️  Manifesto com status "Cancelado" NÃO encontrado');
      console.log('   → Clicando no primeiro manifesto disponível...');
      testLog.push('   ⚠️  Manifesto "Cancelado" não encontrado, usando primeiro disponível');
      
      const firstManifesto = page.locator('[role="button"], a').filter({ has: page.locator('text') }).first();
      if (await firstManifesto.isVisible().catch(() => false)) {
        await firstManifesto.click();
        await page.waitForNavigation({ waitUntil: 'networkidle', timeout: 15000 }).catch(() => {});
        await sleep(2000);
        await takeScreenshot(page, '07-manifesto-opened-first');
      }
    }

    // 7️⃣ Procurar pela tela de Relatório MTR
    console.log('7️⃣ Procurando tela de Relatório MTR...');
    testLog.push('7️⃣ Procurando tela de Relatório MTR');

    // Procurar por botão "Relatório", "Report", "MTR", "Imprimir", etc.
    const reportButton = page.locator('text=/^Relatório|Report|MTR|Imprimir|Print/i').first();
    const reportVisible = await reportButton.isVisible().catch(() => false);

    if (reportVisible) {
      console.log('   ✓ Botão de Relatório encontrado');
      await reportButton.click();
      await page.waitForNavigation({ waitUntil: 'networkidle', timeout: 15000 }).catch(() => {});
      await sleep(2000);
      await takeScreenshot(page, '08-report-screen');
    } else {
      console.log('   ⚠️  Botão de Relatório não encontrado diretamente');
      console.log('   → Procurando em menu/abas...');
      
      // Procurar em tabs/menu
      const tabs = page.locator('[role="tab"], .tab, .nav-link').all();
      for (const tab of await tabs) {
        const text = await tab.textContent();
        if (text && /relatório|report|mtr|print/i.test(text)) {
          console.log(`   ✓ Aba "${text}" encontrada`);
          await tab.click();
          await sleep(1000);
          await takeScreenshot(page, '08-report-tab');
          break;
        }
      }
    }

    // 8️⃣ Tentar gerar/imprimir relatório
    console.log('8️⃣ Procurando botão para gerar/imprimir relatório...');
    testLog.push('8️⃣ Gerando/imprimindo relatório');

    const generateButton = page.locator('button:has-text("Gerar"), button:has-text("Imprimir"), button:has-text("Criar Relatório"), button:has-text("Generate"), button:has-text("Print")').first();
    const generateVisible = await generateButton.isVisible().catch(() => false);

    if (generateVisible) {
      console.log('   ✓ Botão de geração encontrado, clicando...');
      await takeScreenshot(page, '09-before-generate');
      
      const generateText = await generateButton.textContent();
      console.log(`   → Botão: "${generateText}"`);
      
      await generateButton.click();
      console.log('   ✓ Clicado em botão de geração');
      testLog.push('   ✓ Clicado em botão de geração');
      
      // Aguardar resposta (pode demorar ou ficar travado aqui!)
      console.log('   ⏳ Aguardando resposta (pode levar tempo ou travar)...');
      
      await sleep(3000);
      await takeScreenshot(page, '10-after-generate-request');

      // Procurar por mensagem de sucesso, erro ou loader
      const successMsg = page.locator('text="sucesso", text="success", text="gerado", text="completo"').first();
      const errorMsg = page.locator('text="erro", text="error", text="falhou", text="failed"').first();
      const loader = page.locator('[role="status"], .spinner, .loader').first();

      const hasSuccess = await successMsg.isVisible().catch(() => false);
      const hasError = await errorMsg.isVisible().catch(() => false);
      const hasLoader = await loader.isVisible().catch(() => false);

      if (hasSuccess) {
        console.log('   ✅ Mensagem de SUCESSO detectada!');
        testLog.push('   ✅ Mensagem de SUCESSO detectada');
        await takeScreenshot(page, '11-success-message');
      } else if (hasError) {
        console.log('   ❌ Mensagem de ERRO detectada!');
        const errorText = await errorMsg.textContent();
        console.log(`   → Erro: ${errorText}`);
        testLog.push(`   ❌ Erro: ${errorText}`);
        await takeScreenshot(page, '11-error-message');
      } else if (hasLoader) {
        console.log('   ⏳ Loader/spinner detectado - operação em progresso');
        testLog.push('   ⏳ Loader detectado - operação em progresso');
        
        // Aguardar loader desaparecer (máximo 30s)
        for (let i = 0; i < 30; i++) {
          await sleep(1000);
          console.log(`   ⏳ Aguardando... ${i + 1}s`);
          
          const loaderStillThere = await loader.isVisible().catch(() => false);
          if (!loaderStillThere) {
            console.log('   ✓ Loader desapareceu!');
            await takeScreenshot(page, '12-after-loader-disappear');
            break;
          }

          if (i === 29) {
            console.log('   ⚠️  TIMEOUT: Loader não desapareceu após 30s');
            console.log('   🚨 JOB PROVAVELMENTE TRAVADO!');
            testLog.push('   🚨 JOB PROVAVELMENTE TRAVADO - Loader não desapareceu após 30s');
            await takeScreenshot(page, '12-timeout-loader-stuck');
          }
        }
      } else {
        console.log('   ℹ️  Nenhuma mensagem clara de feedback detectada');
        testLog.push('   ℹ️  Nenhuma mensagem de feedback detectada');
        await takeScreenshot(page, '11-no-feedback');
      }
    } else {
      console.log('   ⚠️  Botão de geração/impressão NÃO encontrado');
      testLog.push('   ⚠️  Botão de geração não encontrado');
      await takeScreenshot(page, '09-no-generate-button');
    }

    // 9️⃣ Extração de Correlation ID
    console.log('\n9️⃣ Extraindo Correlation ID...');
    testLog.push('9️⃣ Extraindo Correlation ID');

    // Procurar em console/network logs
    const consoleLogs = [];
    page.on('console', msg => consoleLogs.push(msg.text()));

    // Buscar pattern de correlation-id em rede ou DOM
    const correlationElements = page.locator('text=/correlation|request-id|trace-id/i').all();
    let correlationId = null;

    for (const elem of await correlationElements) {
      const text = await elem.textContent();
      const match = text.match(/(?:correlation|request|trace)[-_]?id:?\s*([a-f0-9\-]+)/i);
      if (match && match[1]) {
        correlationId = match[1];
        break;
      }
    }

    // Se não encontrou no DOM, tentar procurar nos headers de rede
    if (!correlationId) {
      console.log('   ℹ️  Correlation ID não encontrado no DOM, procurando em headers de rede...');
      // Isso seria feito via interceptação de rede
    }

    if (correlationId) {
      console.log(`   ✓ Correlation ID encontrado: ${correlationId}`);
      testLog.push(`   ✓ Correlation ID: ${correlationId}`);
    } else {
      console.log('   ⚠️  Correlation ID não foi possível extrair');
      testLog.push('   ⚠️  Correlation ID não extraído');
    }

    await takeScreenshot(page, '13-final-state');

    console.log('\n✅ TESTE CONCLUÍDO\n');
    testLog.push('TESTE CONCLUÍDO: ' + new Date().toISOString());

  } catch (error) {
    console.error('\n❌ ERRO DURANTE TESTE:', error.message);
    testLog.push(`❌ ERRO: ${error.message}`);
    await takeScreenshot(page, '99-error-screenshot');
  } finally {
    // Salvar log
    const logFile = path.join(SCREENSHOT_DIR, `${Date.now()}-test-log.txt`);
    fs.writeFileSync(logFile, testLog.join('\n'), 'utf8');
    console.log(`📄 Log salvo em: ${logFile}`);

    // Informações para diagnóstico
    console.log('\n📊 RESUMO DE EVIDÊNCIAS:');
    console.log(`   📁 Screenshots: ${SCREENSHOT_DIR}`);
    console.log(`   📄 Log: ${logFile}`);
    console.log(`   🌐 Base URL: ${BASE_URL}`);
    console.log(`   👤 Conta: ${ACCOUNT_NAME}`);
    console.log('\n💡 PRÓXIMAS AÇÕES:');
    console.log('   1. Verificar job na fila: node scripts/diagnose-job-stuck.js');
    console.log('   2. Verificar worker health: curl http://localhost:8080/health/workers');
    console.log('   3. Revisar logs do worker: npm run worker');
    console.log('   4. Verificar correlation ID nos logs do worker');

    await browser.close();
  }
}

// Executar teste
testReportFlow().catch(console.error);

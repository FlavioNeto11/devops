#!/usr/bin/env node

/**
 * Reproduz fluxo de impressão de relatório MTR em modo headed com Playwright
 * Objetivo: diagnosticar por que jobs de relatório estão travando na fila
 * 
 * Execução: node tests/manual/reproduce-report-job-stuck.mjs
 */

import { chromium } from 'playwright';
import * as fs from 'fs';
import * as path from 'path';

const BASE_URL = 'http://localhost:5174';
const CREDENTIALS = {
  email: 'flavio_padilha_neto@msn.com',
  password: '08897520@Fpn',
};

const ACCOUNT_NAME = 'Nova IT';

// Criar diretório de saída para coleta de evidência
const OUT_DIR = path.join(process.cwd(), 'storage', 'temp', 'report-job-stuck-diagnostic');
if (!fs.existsSync(OUT_DIR)) {
  fs.mkdirSync(OUT_DIR, { recursive: true });
}

const diagnosticLog = [];

function log(message) {
  const timestamp = new Date().toISOString();
  const msg = `[${timestamp}] ${message}`;
  console.log(msg);
  diagnosticLog.push(msg);
}

async function captureScreenshot(page, name) {
  const filename = path.join(OUT_DIR, `${name}-${Date.now()}.png`);
  await page.screenshot({ path: filename, fullPage: true });
  log(`📸 Screenshot capturado: ${filename}`);
  return filename;
}

async function extractCorrelationId(page) {
  const correlationId = await page.evaluate(() => {
    // Tentar extrair de um header request ou resposta interceptado
    // OU procurar na página ou em sessionStorage
    return window.sessionStorage?.getItem?.('correlationId') || 
           window.localStorage?.getItem?.('correlationId') || 
           null;
  });
  return correlationId;
}

async function waitForJobStatus(correlationId, maxWaitMs = 10000) {
  const startTime = Date.now();
  const healthEndpoint = 'http://localhost:8080/v1/health/jobs/active';
  
  log(`⏳ Aguardando job com correlationId: ${correlationId}...`);
  
  while (Date.now() - startTime < maxWaitMs) {
    try {
      const response = await fetch(healthEndpoint);
      const data = await response.json();
      
      // Procurar por job relacionado ao correlationId
      if (data.jobs && Array.isArray(data.jobs)) {
        const relatedJobs = data.jobs.filter(job => 
          job.metadata?.correlationId === correlationId
        );
        
        if (relatedJobs.length > 0) {
          log(`✅ Job(s) encontrado(s) para ${correlationId}:`);
          relatedJobs.forEach(job => {
            log(`   - Job ID: ${job.id}`);
            log(`   - Operation: ${job.operation}`);
            log(`   - Status: ${job.status}`);
            log(`   - Attempts: ${job.attempts}/${job.max_attempts}`);
            log(`   - Last Error: ${job.last_error_message || 'nenhum'}`);
          });
          return relatedJobs;
        }
      }
    } catch (error) {
      log(`⚠️ Erro ao consultar jobs: ${error.message}`);
    }
    
    await new Promise(resolve => setTimeout(resolve, 500));
  }
  
  log(`❌ Timeout: nenhum job encontrado para ${correlationId} após ${maxWaitMs}ms`);
  return [];
}

async function main() {
  log('🚀 Iniciando reprodução de fluxo de relatório MTR em modo headed');
  log(`Base URL: ${BASE_URL}`);
  
  const browser = await chromium.launch({
    headless: false, // ⭐ MODO HEADED para visualização real
    devtools: true,  // Abre dev tools
  });
  
  const context = await browser.newContext();
  const page = await context.newPage();
  
  try {
    // ==================== PASSO 1: Login ====================
    log('\n📝 PASSO 1: Navegação inicial e login');
    await page.goto(BASE_URL, { waitUntil: 'networkidle' });
    await captureScreenshot(page, '01-homepage');
    
    // Esperar e clicar no campo de email
    log('  ➜ Preenchendo email...');
    await page.fill('input[type="email"]', CREDENTIALS.email);
    await page.fill('input[type="password"]', CREDENTIALS.password);
    
    // Captura antes de submeter login
    await captureScreenshot(page, '02-login-form');
    
    log('  ➜ Submetendo formulário de login...');
    await page.click('button[type="submit"]');
    
    // Aguardar navegação pós-login
    await page.waitForNavigation({ waitUntil: 'networkidle', timeout: 15000 }).catch(() => {
      log('  ⚠️ Timeout aguardando navegação pós-login, continuando...');
    });
    
    await captureScreenshot(page, '03-after-login');
    
    // ==================== PASSO 2: Selecionar Conta ====================
    log('\n🏢 PASSO 2: Seleção de conta "Nova IT"');
    
    // Procurar por elemento que contenha "Nova IT"
    const accountSelector = `text=${ACCOUNT_NAME}`;
    try {
      await page.click(accountSelector, { timeout: 5000 });
      log(`  ✅ Conta "${ACCOUNT_NAME}" selecionada`);
      await page.waitForNavigation({ waitUntil: 'networkidle', timeout: 10000 }).catch(() => {
        log('  ⚠️ Timeout aguardando navegação após seleção de conta');
      });
    } catch (error) {
      log(`  ⚠️ Erro ao selecionar conta: ${error.message}`);
    }
    
    await captureScreenshot(page, '04-account-selected');
    
    // ==================== PASSO 3: Navegar até Manifestos ====================
    log('\n📋 PASSO 3: Navegação até tela de Manifestos');
    
    // Procurar por link/botão de Manifestos (pode estar em menu, navbar, etc)
    const manifestLink = await page.$('a[href*="manifest"], text=Manifestos, text=Manifests');
    
    if (manifestLink) {
      await manifestLink.click();
      log('  ✅ Clicado em Manifestos');
    } else {
      log('  ⚠️ Link de Manifestos não encontrado, tentando buscar no menu...');
      // Tentar buscar em um menu
      await page.click('[data-testid="menu-manifestos"], .menu-item:has-text("Manifestos")').catch(() => {
        log('  ⚠️ Menu de manifestos não encontrado, tentando navegação direta...');
        return page.goto(`${BASE_URL}/manifestos`, { waitUntil: 'networkidle' });
      });
    }
    
    await page.waitForLoadState('networkidle', { timeout: 10000 }).catch(() => {
      log('  ⚠️ Timeout aguardando carregamento de manifestos');
    });
    
    await captureScreenshot(page, '05-manifestos-list');
    
    // ==================== PASSO 4: Procurar Manifesto "Cancelado" ====================
    log('\n🔍 PASSO 4: Procura por manifesto com status "Cancelado"');
    
    // Procurar por linhas de manifesto com status "Cancelado"
    const canceledManifests = await page.locator('text=Cancelado').all();
    
    if (canceledManifests.length === 0) {
      log('  ⚠️ Nenhum manifesto com status "Cancelado" encontrado');
      log('  ℹ️  Procedendo com o primeiro manifesto disponível...');
    } else {
      log(`  ✅ Encontrado(s) ${canceledManifests.length} manifesto(s) com status "Cancelado"`);
    }
    
    // Clicar no primeiro manifesto ("Cancelado" ou qualquer um)
    const rows = await page.locator('table tbody tr, [role="row"]').all();
    if (rows.length > 0) {
      log(`  ➜ Total de manifestos visíveis: ${rows.length}`);
      
      // Procurar por um que tenha "Cancelado"
      let clickedRow = null;
      for (const row of rows) {
        const text = await row.textContent();
        if (text && text.includes('Cancelado')) {
          clickedRow = row;
          log('  ✅ Manifesto "Cancelado" encontrado, clicando...');
          break;
        }
      }
      
      // Se não encontrou "Cancelado", usar primeiro
      if (!clickedRow) {
        clickedRow = rows[0];
        log('  ℹ️   Usando primeiro manifesto disponível');
      }
      
      await clickedRow.click();
      log('  ➜ Aguardando abertura do detalhe do manifesto...');
      await page.waitForLoadState('networkidle', { timeout: 10000 }).catch(() => {});
    }
    
    await captureScreenshot(page, '06-manifesto-opened');
    
    // ==================== PASSO 5: Abrir Relatório MTR ====================
    log('\n📄 PASSO 5: Abertura do relatório MTR');
    
    // Procurar por botão/aba de Relatório
    const reportButtons = await page.locator(
      'text=Relatório, text=Report, text=MTR, button:has-text("Imprimir"), button:has-text("Print")'
    ).all();
    
    let foundReportButton = false;
    for (const btn of reportButtons) {
      const text = await btn.textContent();
      if (text && (text.includes('Relatório') || text.includes('Report') || text.includes('Imprimir'))) {
        log(`  ➜ Clicando em: "${text}"`);
        await btn.click();
        foundReportButton = true;
        break;
      }
    }
    
    if (!foundReportButton) {
      log('  ⚠️ Botão de relatório não encontrado, tentando procurar aba...');
      // Procurar por aba/tab
      const tabs = await page.locator('[role="tab"], .nav-link, .tab').all();
      for (const tab of tabs) {
        const text = await tab.textContent();
        if (text && (text.includes('Relatório') || text.includes('Print') || text.includes('MTR'))) {
          log(`  ➜ Clicando em aba: "${text}"`);
          await tab.click();
          foundReportButton = true;
          break;
        }
      }
    }
    
    await page.waitForLoadState('networkidle', { timeout: 8000 }).catch(() => {});
    await captureScreenshot(page, '07-report-tab-opened');
    
    // ==================== PASSO 6: Gerar/Imprimir Relatório ====================
    log('\n🖨️ PASSO 6: Geração/Impressão de relatório');
    
    // Procurar por botão de impressão/geração
    const printButtons = await page.locator(
      'text=Imprimir, text=Print, text=Gerar, text=Generate, button[title*="Print"], button[title*="Imprimir"]'
    ).all();
    
    let printButtonClicked = false;
    for (const btn of printButtons) {
      const text = await btn.textContent();
      log(`  ℹ️   Encontrado botão: "${text}"`);
      if (!text || text.length < 50) { // Evitar headers/labels
        log(`  ➜ Clicando em: "${text}"`);
        await btn.click();
        printButtonClicked = true;
        break;
      }
    }
    
    if (!printButtonClicked) {
      log('  ⚠️ Botão de impressão não encontrado, procurando alternativas...');
      // Tentar buscar em dropdown, menu, etc
      const allButtons = await page.locator('button').all();
      for (const btn of allButtons) {
        const text = await btn.textContent();
        if (text && (text.includes('Imprimir') || text.includes('Print'))) {
          log(`  ➜ Clicando em botão alternativo: "${text}"`);
          await btn.click();
          printButtonClicked = true;
          break;
        }
      }
    }
    
    if (printButtonClicked) {
      log('✅ Comando de impressão submetido');
      
      // ==================== PASSO 7: Capturar Correlation ID ====================
      log('\n🔗 PASSO 7: Captura de Correlation ID');
      
      await page.waitForTimeout(1000); // Aguardar processamento
      const correlationId = await extractCorrelationId(page);
      
      if (correlationId) {
        log(`✅ Correlation ID capturado: ${correlationId}`);
      } else {
        log('⚠️ Correlation ID não encontrado em sessionStorage/localStorage');
        log('  ℹ️   Procurando em X-Correlation-Id header ou resposta de API...');
      }
      
      await captureScreenshot(page, '08-after-print-click');
      
      // ==================== PASSO 8: Monitorar Fila de Jobs ====================
      log('\n⏳ PASSO 8: Monitoramento de fila de jobs');
      
      // Aguardar um tempo para o job ser enfileirado
      await page.waitForTimeout(2000);
      
      if (correlationId) {
        const jobs = await waitForJobStatus(correlationId, 15000);
        
        if (jobs.length === 0) {
          log('❌ PROBLEMA DETECTADO: Job não apareceu na fila!');
          log('  Possível causa: chamada de API falhou ou não foi enfileirada');
        } else {
          log(`✅ Job(s) encontrado(s) na fila: ${jobs.length}`);
          
          // Verificar se job fica preso
          await page.waitForTimeout(5000);
          const jobsAfter = await waitForJobStatus(correlationId, 2000);
          
          if (jobsAfter.length > 0) {
            const firstJob = jobsAfter[0];
            if (firstJob.status === 'queued') {
              log('🚨 PROBLEMA CONFIRMADO: Job ficou TRAVADO em status "queued"');
              log('  Evidência: Job não foi processado mesmo após workers consumirem fila');
            } else if (firstJob.status === 'running') {
              log('✅ Job em processamento...');
            } else if (firstJob.status === 'finished') {
              log('✅ Job completado com sucesso');
            } else {
              log(`ℹ️   Job em status: ${firstJob.status}`);
            }
          }
        }
      } else {
        log('⚠️ Não foi possível monitorar job sem correlation ID');
      }
      
      await captureScreenshot(page, '09-final-state');
    } else {
      log('❌ Não foi possível clicar em botão de impressão');
    }
    
    log('\n' + '='.repeat(60));
    log('✅ TESTE CONCLUÍDO');
    log(''.repeat(60));
    
  } catch (error) {
    log(`\n❌ ERRO DURANTE TESTE: ${error.message}`);
    log(error.stack);
    await captureScreenshot(page, '99-error');
  } finally {
    // Salvar log de diagnóstico
    const logFile = path.join(OUT_DIR, `diagnostic-log-${Date.now()}.txt`);
    fs.writeFileSync(logFile, diagnosticLog.join('\n'), 'utf8');
    log(`\n📊 Log de diagnóstico salvo em: ${logFile}`);
    
    // Manter navegador aberto por alguns segundos para inspeção
    log('\n⏳ Mantendo navegador aberto por 10 segundos para inspeção...');
    await page.waitForTimeout(10000);
    
    await browser.close();
    log('✅ Navegador fechado');
  }
}

main().catch(error => {
  console.error('ERRO FATAL:', error);
  process.exit(1);
});

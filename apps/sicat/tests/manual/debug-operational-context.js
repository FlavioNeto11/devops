#!/usr/bin/env node

/**
 * Debug: Investigar por que o contexto operacional enriquecido não está sendo enviado
 * 
 * Possíveis causas:
 * 1. provide() em ManifestDetailView não está sendo executado
 * 2. inject() em useInAppCopilot não está recebendo o valor
 * 3. buildConversationScreenContext não está retornando os campos
 */

import { chromium } from 'playwright';

const API_BASE = 'http://127.0.0.1:8080';
const FRONTEND_BASE = 'http://127.0.0.1:5174';
const TEST_MANIFEST_ID = 'test_manifest_qa_phase3_debug';

async function setupAuthenticatedSession(page) {
  await page.addInitScript(({ activeAccountId, scxId }) => {
    const expiresAt = new Date(Date.now() + 60 * 60 * 1000).toISOString();
    localStorage.setItem('sicat_session_access_token', 'test-token');
    localStorage.setItem('sicat_session_refresh_token', 'test-refresh-token');
    localStorage.setItem('sicat_session_expires_at', expiresAt);
    localStorage.setItem('sicat_session_user', JSON.stringify({
      name: 'Debug User',
      email: 'debug@test.com',
      userId: 'usr_debug_001'
    }));
    localStorage.setItem('sicat_active_cetesb_account', JSON.stringify({
      accountId: 'acc_debug_001',
      partnerCode: 999999,
      partnerDocument: '00.000.000/0000-00',
      partnerName: 'Debug Account',
      accountType: 'generator',
      isActive: true
    }));
    localStorage.setItem('sicat_active_session_context', JSON.stringify({
      sessionContextId: scxId,
      id: scxId,
      integrationAccountId: activeAccountId,
      status: 'active'
    }));
    localStorage.setItem('sicat_active_integration_account_id', activeAccountId);
  }, {
    activeAccountId: 'acc_debug_001',
    scxId: 'scx_debug_001'
  });
}

async function mockBackendEndpoints(page) {
  await page.route('**/v1/sicat/session', async (route) => {
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({
        user: { userId: 'usr_debug_001', name: 'Debug User', email: 'debug@test.com', roles: ['operator'] },
        activeAccount: { accountId: 'acc_debug_001', partnerCode: 999999, partnerName: 'Debug Account', accountType: 'generator', isActive: true },
        sessionContext: { sessionContextId: 'scx_debug_001', id: 'scx_debug_001', integrationAccountId: 'acc_debug_001', status: 'active' }
      })
    });
  });

  // Mock manifesto com dados completos
  await page.route(`**/v1/manifestos/${TEST_MANIFEST_ID}`, async (route) => {
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({
        id: TEST_MANIFEST_ID,
        manifestNumber: 'MTR-DEBUG-001',
        externalCode: 'SIGOR-DEBUG-001',
        status: 'submitted',
        externalStatus: 'registered',
        createdAt: '2026-04-01T10:00:00Z',
        updatedAt: new Date().toISOString(),
        documents: [
          { name: 'Documento1.pdf', type: 'attachment' },
          { name: 'Receipt.pdf', type: 'receipt' }
        ],
        jobResults: {
          'manifest.submit': {
            jobId: 'job_submit_debug_001',
            status: 'succeeded',
            completedAt: new Date(Date.now() - 7200000).toISOString()
          },
          'manifest.sync': {
            jobId: 'job_sync_debug_001',
            status: 'processing'
          }
        }
      })
    });
  });

  // Interceptar requisições de conversa
  const conversationRequests = [];
  await page.route('**/v1/conversations/turns', async (route) => {
    const requestBody = route.request().postDataJSON();
    conversationRequests.push(requestBody);
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({
        conversationSessionId: 'csess_debug_001',
        status: 'ok',
        responseText: 'Debug response'
      })
    });
  });

  return { conversationRequests };
}

async function runDebug() {
  let browser;
  try {
    console.log('\n🔍 Debug: Investigar contexto operacional enriquecido\n');

    browser = await chromium.launch({ headless: false });
    const page = await browser.newPage();
    
    // Ativar logs do console
    page.on('console', msg => {
      if (msg.type() === 'log') {
        console.log(`  [Browser Log] ${msg.text()}`);
      }
    });

    console.log('⚙️  Setup...');
    await setupAuthenticatedSession(page);
    const { conversationRequests } = await mockBackendEndpoints(page);

    console.log(`📍 Navegando para manifesto...`);
    await page.goto(`${FRONTEND_BASE}/manifestos/${TEST_MANIFEST_ID}`);
    await page.waitForLoadState('networkidle');

    // Debug 1: Inspecionar dados do manifesto carregado
    console.log('\n📋 Debug 1: Dados do manifesto carregados no frontend');
    const manifestData = await page.evaluate(() => {
      // Procurar pelo h1 ou elemento de título que contenha o manifesto
      const titleElement = document.querySelector('h1, h2, [class*="title"]');
      const manifestStatusElements = Array.from(document.querySelectorAll('[class*="status"], span, div')).filter(el => 
        el.textContent.includes('submitted') || el.textContent.includes('registered')
      );
      return {
        title: titleElement?.textContent,
        statusElements: manifestStatusElements.slice(0, 3).map(e => e.textContent),
        documentCount: document.querySelectorAll('[class*="document"], [class*="attachment"]').length
      };
    });
    console.log(`  ${JSON.stringify(manifestData, null, 2)}`);

    // Debug 2: Verificar se o composable useInAppCopilot foi injetado corretamente
    console.log('\n📋 Debug 2: Estado do composable useInAppCopilot');
    const copilotState = await page.evaluate(() => {
      // Procurar por atributos data que possam indicar estado Vue
      const elements = document.querySelectorAll('[class*="copilot"]');
      return {
        copilotElements: elements.length,
        firstCopilotClass: elements[0]?.className || 'N/A'
      };
    });
    console.log(`  ${JSON.stringify(copilotState, null, 2)}`);

    // Debug 3: Enviar mensagem e capturar contexto completo
    console.log('\n📋 Debug 3: Contexto enviado em última requisição');
    
    // Procurar por input/compositor
    const inputs = await page.locator('input, textarea').count();
    console.log(`  Inputs encontrados: ${inputs}`);

    // Tentar enviar mensagem
    const composerInput = page.locator('textarea, input[type="text"]').first();
    if (await composerInput.count() > 0) {
      console.log('  Enviando mensagem...');
      await composerInput.fill('Debug test message');
      await page.press('textarea, input[type="text"]', 'Enter');
      await page.waitForTimeout(1000);
    }

    // Inspecionar requisição
    if (conversationRequests.length > 0) {
      const lastRequest = conversationRequests[conversationRequests.length - 1];
      console.log('\n  📤 Último payload enviado:');
      console.log('  Campos presentes:', Object.keys(lastRequest.context || {}));
      
      console.log('\n  🔍 Campos operacionais esperados:');
      const opCtx = lastRequest.context || {};
      console.log(`    - manifestStatus: ${opCtx.manifestStatus || '❌ MISSING'}`);
      console.log(`    - externalStatus: ${opCtx.externalStatus || '❌ MISSING'}`);
      console.log(`    - lastAction: ${opCtx.lastAction || '❌ MISSING'}`);
      console.log(`    - relatedJobs: ${Array.isArray(opCtx.relatedJobs) && opCtx.relatedJobs.length > 0 ? '✅ Present (' + opCtx.relatedJobs.length + ')' : '❌ MISSING'}`);
      console.log(`    - availableDocuments: ${Array.isArray(opCtx.availableDocuments) && opCtx.availableDocuments.length > 0 ? '✅ Present (' + opCtx.availableDocuments.length + ')' : '❌ MISSING'}`);
    } else {
      console.log('  ⚠️  Nenhuma requisição de conversa foi capturada');
    }

    console.log('\n✋ Browser permanecerá aberto por 10 segundos para inspeção...');
    await page.waitForTimeout(10000);

  } finally {
    if (browser) {
      await browser.close();
    }
  }
}

runDebug().catch(err => {
  console.error('❌ Erro no debug:', err);
  process.exit(1);
});

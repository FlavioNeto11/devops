import { expect, test } from '@playwright/test';

function setupAuthenticatedStorage(page) {
  return page.addInitScript(() => {
    const expiresAt = new Date(Date.now() + 60 * 60 * 1000).toISOString();
    localStorage.setItem('sicat_session_access_token', 'test-token');
    localStorage.setItem('sicat_session_refresh_token', 'test-refresh-token');
    localStorage.setItem('sicat_session_expires_at', expiresAt);
    localStorage.setItem('sicat_session_user', JSON.stringify({
      userId: 'usr_chat_001',
      name: 'Usuario Chat QA',
      email: 'chat.qa@test.com'
    }));
    localStorage.setItem('sicat_active_cetesb_account', JSON.stringify({
      accountId: 'acc_chat_001',
      partnerCode: 176163,
      partnerName: 'Conta QA Conversacional',
      accountType: 'generator',
      isActive: true
    }));
    localStorage.setItem('sicat_active_session_context', JSON.stringify({
      id: 'scx_chat_001',
      sessionContextId: 'scx_chat_001',
      integrationAccountId: 'int_chat_001',
      status: 'active'
    }));
    localStorage.setItem('sicat_active_integration_account_id', 'int_chat_001');
  });
}

async function mockSicatSession(page) {
  await page.route('**/v1/sicat/session', async (route) => {
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({
        user: {
          userId: 'usr_chat_001',
          name: 'Usuario Chat QA',
          email: 'chat.qa@test.com'
        },
        activeAccount: {
          accountId: 'acc_chat_001',
          partnerCode: 176163,
          partnerName: 'Conta QA Conversacional',
          accountType: 'generator',
          isActive: true
        },
        sessionContext: {
          id: 'scx_chat_001',
          sessionContextId: 'scx_chat_001',
          integrationAccountId: 'int_chat_001',
          status: 'active'
        }
      })
    });
  });
}

const structuredResponse = [
  'Resumo da analise operacional:',
  '1. Validar manifesto mais recente.',
  '2. Confirmar status externo no portal CETESB.',
  '- Priorizar manifestos com pendencia critica.',
  '- Notificar operador se houver bloqueio.',
  'Manifesto: MTR-2026-0001',
  'Data: 2026-04-23',
  'Status: submitted',
  'Gerador: Gerador QA 01',
  'CNPJ: 00.111.222/0001-99',
  'Transportador: Transporte QA LTDA',
  'Motorista: Joao da Silva',
  'Placa: ABC1D23',
  'Destinador: Destino Industrial QA',
  'Manifesto: MTR-2026-0002',
  'Data: 2026-04-24',
  'Status: authorized',
  'Gerador: Gerador QA 02',
  'CNPJ: 11.222.333/0001-88',
  'Transportador: Transporte QA EXPRESS',
  'Motorista: Maria Costa',
  'Placa: DEF4G56',
  'Destinador: Destino Reciclagem QA'
].join('\n');

test('renderiza mensagem estruturada no app conversacional com destaque de campos-chave', async ({ page }) => {
  await setupAuthenticatedStorage(page);
  await mockSicatSession(page);

  await page.route('**/v1/conversations/turns', async (route) => {
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({
        conversationSessionId: 'csn_structured_chat_001',
        conversationTurnId: 'ctn_structured_chat_001',
        correlationId: 'corr_structured_chat_001',
        channel: 'native_chat',
        status: 'responded',
        responseText: structuredResponse,
        llm: {
          provider: 'rule-based',
          confidence: 0.9
        },
        policy: {
          allowed: true,
          reasonCode: null,
          reason: null,
          requiresConfirmation: false,
          riskLevel: 'R1'
        },
        context: {
          integrationAccountId: 'int_chat_001',
          sessionContextId: 'scx_chat_001'
        }
      })
    });
  });

  await page.goto('/conversacional/chat');

  const composer = page.locator('.chat-composer textarea').first();
  await composer.fill('me traga um resumo estruturado');
  await composer.press('Enter');

  const lastAssistantMessage = page.locator('.chat-message--assistant .structured-message').last();
  await expect(lastAssistantMessage).toBeVisible();
  await expect(lastAssistantMessage.locator('ol > li')).toHaveCount(2);
  await expect(lastAssistantMessage.locator('ul > li')).toHaveCount(2);
  const cards = lastAssistantMessage.locator('.manifest-card');
  await expect(cards).toHaveCount(2);
  await expect(cards.first().locator('.manifest-card-title', { hasText: 'Resumo' })).toBeVisible();
  await expect(cards.first().locator('.manifest-card-title', { hasText: 'Gerador' })).toBeVisible();
  await expect(cards.first().locator('.manifest-card-title', { hasText: 'Transporte' })).toBeVisible();
  await expect(cards.first().locator('.manifest-card-title', { hasText: 'Destino' })).toBeVisible();
  await expect(cards.first()).toContainText('MTR-2026-0001');
  await expect(cards.first()).toContainText('submitted');
  await expect(cards.last()).toContainText('MTR-2026-0002');
  await expect(cards.last()).toContainText('authorized');

  const noHorizontalOverflow = await page.locator('.chat-thread').evaluate((el) => el.scrollWidth <= el.clientWidth + 2);
  expect(noHorizontalOverflow).toBeTruthy();
});

test('renderiza estrutura em bullets e pares chave-valor no assistente interno', async ({ page }) => {
  await setupAuthenticatedStorage(page);
  await mockSicatSession(page);

  await page.route('**/v1/conversations/turns', async (route) => {
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({
        conversationSessionId: 'csn_structured_inapp_001',
        conversationTurnId: 'ctn_structured_inapp_001',
        correlationId: 'corr_structured_inapp_001',
        channel: 'inapp',
        status: 'responded',
        responseText: structuredResponse,
        llm: {
          provider: 'rule-based',
          confidence: 0.9
        },
        policy: {
          allowed: true,
          reasonCode: null,
          reason: null,
          requiresConfirmation: false,
          riskLevel: 'R1'
        },
        context: {
          integrationAccountId: 'int_chat_001',
          sessionContextId: 'scx_chat_001'
        }
      })
    });
  });

  await page.goto('/dashboard');

  await page.getByRole('button', { name: 'Abrir copiloto contextual' }).click();

  const panel = page.locator('dialog.copilot-panel[open]');
  await expect(panel).toBeVisible();

  const inAppComposer = panel.locator('.copilot-composer textarea:not([readonly])').first();
  await inAppComposer.fill('quero resposta estruturada');
  await inAppComposer.press('Enter');

  const lastAssistantMessage = panel.locator('.copilot-message-assistant .structured-message').last();
  await expect(lastAssistantMessage).toBeVisible();
  await expect(lastAssistantMessage.locator('ol > li')).toHaveCount(2);
  await expect(lastAssistantMessage.locator('ul > li')).toHaveCount(2);
  const cards = lastAssistantMessage.locator('.manifest-card');
  await expect(cards).toHaveCount(2);
  await expect(cards.first()).toContainText('MTR-2026-0001');
  await expect(cards.last()).toContainText('MTR-2026-0002');
});

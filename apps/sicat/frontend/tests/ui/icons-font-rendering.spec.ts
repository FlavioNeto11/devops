import { test, expect, type Page, type Route } from '@playwright/test';

const integrationAccountId = 'acc_test_prod';
const sessionContextId = 'ctx_test_01';

async function setupAuthenticatedShell(page: Page) {
  await page.addInitScript(({ integrationAccountId: accId, sessionContextId: scxId }: { integrationAccountId: string; sessionContextId: string }) => {
    const expiresAt = new Date(Date.now() + 60 * 60 * 1000).toISOString();
    localStorage.setItem('sicat_session_access_token', 'test-token');
    localStorage.setItem('sicat_session_refresh_token', 'test-refresh-token');
    localStorage.setItem('sicat_session_expires_at', expiresAt);
    localStorage.setItem('sicat_session_user', JSON.stringify({
      name: 'Usuario Teste',
      email: 'user@test.com',
      userId: 'usr_test_ui_001'
    }));
    localStorage.setItem('sicat_active_cetesb_account', JSON.stringify({
      accountId: 'acc_test_01',
      partnerCode: 176163,
      partnerDocument: '31.913.781/0001-39',
      partnerName: 'Parceiro Teste',
      accountType: 'generator',
      isActive: true
    }));
    localStorage.setItem('sicat_active_session_context', JSON.stringify({
      sessionContextId: scxId,
      id: scxId,
      integrationAccountId: accId,
      status: 'active'
    }));
    localStorage.setItem('sicat_active_integration_account_id', accId);
  }, { integrationAccountId, sessionContextId });

  await page.route('**/v1/sicat/session', async (route: Route) => {
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({
        user: {
          userId: 'usr_test_ui_001',
          name: 'Usuario UI Teste',
          email: 'ui@test.com',
          roles: ['operator']
        },
        activeAccount: {
          accountId: 'acc_test_01',
          partnerCode: 176163,
          partnerDocument: '31.913.781/0001-39',
          partnerName: 'Parceiro Teste',
          accountType: 'generator',
          isActive: true
        },
        sessionContext: {
          sessionContextId,
          id: sessionContextId,
          integrationAccountId,
          status: 'active'
        }
      })
    });
  });

  await page.route('**/v1/sicat/cetesb-accounts', async (route: Route) => {
    if (route.request().method() === 'GET') {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          activeAccountId: 'acc_test_01',
          accounts: [{
            accountId: 'acc_test_01',
            partnerCode: 176163,
            partnerDocument: '31.913.781/0001-39',
            partnerName: 'Parceiro Teste',
            accountType: 'generator',
            isActive: true
          }]
        })
      });
      return;
    }

    await route.continue();
  });

  await page.route('**/v1/manifestos?**', async (route: Route) => {
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({
        page: 1,
        pageSize: 20,
        totalItems: 1,
        totalPages: 1,
        items: [
          {
            id: 'man_test_01',
            status: 'printed',
            externalStatus: 'salvo',
            manifestNumber: '260010784805',
            externalCode: 22273911,
            expeditionDate: '2026-03-13',
            carrier: { description: '12631745000308' },
            receiver: { description: 'B2BLUE COM COMERCIO E VALORIZACAO DE RESIDUOS LTDA' }
          }
        ]
      })
    });
  });
}

async function expectMaterialSymbolFont(page: Page) {
  const firstSymbol = page.locator('.material-symbols-outlined').first();
  await expect(firstSymbol).toBeVisible();

  const fontFamily = await firstSymbol.evaluate((el) => globalThis.getComputedStyle(el).fontFamily);
  expect(fontFamily).toContain('Material Symbols Outlined');
}

test.describe('Material Symbols rendering', () => {
  test('Manifestos usa fonte correta para icones ligature', async ({ page }) => {
    await setupAuthenticatedShell(page);
    await page.goto('/manifestos');
    await page.waitForSelector('.v-application');
    await expectMaterialSymbolFont(page);
    await page.screenshot({ path: 'test-results/icons-font-manifestos.png', fullPage: true });
  });

  test('Relatorio de MTR usa fonte correta nos campos de data', async ({ page }) => {
    await setupAuthenticatedShell(page);
    await page.goto('/relatorios/mtrs');
    await page.waitForSelector('.v-application');
    await expectMaterialSymbolFont(page);
    await page.screenshot({ path: 'test-results/icons-font-relatorio-mtrs.png', fullPage: true });
  });
});

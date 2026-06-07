import { test, expect } from '@playwright/test';

const viewports = [
  { name: 'mobile', width: 390, height: 844 },
  { name: 'tablet', width: 768, height: 1024 },
  { name: 'desktop', width: 1366, height: 768 },
  { name: 'wide', width: 1920, height: 1080 }
];

const mockedCatalogResponse = {
  catalogName: 'units',
  page: 1,
  pageSize: 50,
  totalItems: 1,
  totalPages: 1,
  items: [{ code: '1', name: 'Quilograma', shortName: 'kg' }]
};

const mockedListResponse = {
  page: 1,
  pageSize: 20,
  totalItems: 1,
  totalPages: 1,
  items: [
    {
      id: 'man_test_001',
      manifestNumber: 'MTR-TESTE-001',
      status: 'draft',
      expeditionDate: '2026-03-10',
      generator: { description: 'Empresa Teste' },
      carrier: { description: 'Transportadora Teste' },
      receiver: { description: 'Destinatário Teste' }
    }
  ]
};

const mockedManifestDetails = {
  id: 'man_test_001',
  status: 'draft',
  externalStatus: 'pending_submission',
  lastSyncAt: '2026-03-10T14:00:00.000Z',
  generator: { description: 'Empresa Teste' },
  carrier: { description: 'Transportadora Teste' },
  receiver: { description: 'Destinatário Teste' },
  externalReference: {
    manNumero: '123456',
    manCodigo: 'ABC-123'
  }
};

async function mockApi(page) {
  await page.route('**/v1/sicat/auth/login', async (route) => {
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({
        accessToken: 'test-access-token',
        refreshToken: 'test-refresh-token',
        expiresAt: new Date(Date.now() + 60 * 60 * 1000).toISOString(),
        user: {
          userId: 'usr_test_ui_001',
          name: 'Usuário UI Teste',
          email: 'ui@test.com',
          roles: ['operator']
        }
      })
    });
  });

  await page.route('**/v1/sicat/session', async (route) => {
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({
        user: {
          userId: 'usr_test_ui_001',
          name: 'Usuário UI Teste',
          email: 'ui@test.com',
          roles: ['operator']
        },
        activeAccount: null,
        sessionContext: null
      })
    });
  });

  await page.route('**/v1/sicat/cetesb-accounts', async (route) => {
    const method = route.request().method();

    if (method === 'GET') {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          activeAccountId: null,
          accounts: []
        })
      });
      return;
    }

    await route.continue();
  });

  await page.route('**/v1/auth/partner-info**', async (route) => {
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({
        partnerCode: 176163,
        registeredUsers: [{ email: 'ui@test.com' }]
      })
    });
  });

  await page.route('**/v1/catalogs/**', async (route) => {
    const url = route.request().url();

    if (url.includes('/residueClasses')) {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          ...mockedCatalogResponse,
          catalogName: 'residueClasses',
          items: [{ code: '731', name: 'Resíduo Classe A', shortName: 'Classe A' }]
        })
      });
      return;
    }

    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({
        ...mockedCatalogResponse,
        catalogName: url.split('/').pop()?.split('?')[0] || 'catalog'
      })
    });
  });

  await page.route('**/v1/manifestos?**', async (route) => {
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify(mockedListResponse)
    });
  });

  await page.route('**/v1/manifestos/man_test_001', async (route) => {
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify(mockedManifestDetails)
    });
  });

}

test.describe('UX responsiva', () => {
  for (const viewport of viewports) {
    test(`login em 2 etapas renderiza bem em ${viewport.name}`, async ({ page }) => {
      await page.setViewportSize({ width: viewport.width, height: viewport.height });
      await mockApi(page);
      await page.goto('/login');

      await expect(page.getByRole('heading', { name: /Entrar no SICAT/i })).toBeVisible();
      await expect(page.getByText(/Use seu e-mail e senha para continuar o fluxo operacional\./i)).toBeVisible();
      await expect(page.getByLabel('E-mail')).toBeVisible();
      await expect(page.getByRole('textbox', { name: 'Senha' })).toBeVisible();
      await expect(page.getByRole('button', { name: 'Entrar' })).toBeVisible();

      const loginHorizontalOverflow = await page.evaluate(() => {
        const root = document.documentElement;
        return root.scrollWidth > root.clientWidth;
      });
      expect(loginHorizontalOverflow).toBeFalsy();

      await page.getByLabel('E-mail').fill('ui@test.com');
      await page.getByRole('textbox', { name: 'Senha' }).fill('senha-teste');
      await page.getByRole('button', { name: 'Entrar' }).click();

      await expect(page).toHaveURL(/\/login\/cetesb$/);
      await expect(page.getByRole('heading', { name: 'Selecionar conta operacional' })).toBeVisible();
      await expect(page.getByText(/Após entrar com uma conta CETESB/i)).toBeVisible();
    });

    test(`dashboard renderiza bem em ${viewport.name}`, async ({ page }) => {
      await page.setViewportSize({ width: viewport.width, height: viewport.height });

      await page.addInitScript(() => {
        const expiresAt = new Date(Date.now() + 60 * 60 * 1000).toISOString();
        localStorage.setItem('sicat_session_access_token', 'test-token');
        localStorage.setItem('sicat_session_refresh_token', 'test-refresh-token');
        localStorage.setItem('sicat_session_expires_at', expiresAt);
        localStorage.setItem('sicat_session_user', JSON.stringify({ name: 'Usuário Teste', email: 'user@test.com', userId: 1 }));
        localStorage.setItem('sicat_active_cetesb_account', JSON.stringify({
          accountId: 'acc_test_01',
          partnerCode: 176163,
          partnerDocument: '31.913.781/0001-39',
          partnerName: 'Parceiro Teste',
          accountType: 'generator',
          usageSummary: {
            manifestsCreated: 1,
            manifestsSubmitted: 1,
            manifestsPrinted: 1,
            manifestsCancelled: 0
          },
          isActive: true
        }));
        localStorage.setItem('sicat_active_session_context', JSON.stringify({
          sessionContextId: 'ctx_test_01',
          id: 'ctx_test_01',
          integrationAccountId: 'acc_test_prod',
          status: 'active'
        }));
        localStorage.setItem('sicat_active_integration_account_id', 'acc_test_prod');
      });

      await mockApi(page);
      await page.goto('/dashboard');

      await expect(page.getByRole('heading', { name: /Visão Geral/i })).toBeVisible();
      await expect(page.getByText('Últimos manifestos carregados')).toBeVisible();
      await expect(page.getByText('MTR-TESTE-001')).toBeVisible();

      const dashboardHorizontalOverflow = await page.evaluate(() => {
        const root = document.documentElement;
        return root.scrollWidth > root.clientWidth;
      });
      expect(dashboardHorizontalOverflow).toBeFalsy();
    });
  }
});

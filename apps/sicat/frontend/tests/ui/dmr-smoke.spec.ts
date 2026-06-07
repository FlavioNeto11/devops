import { expect, test } from '@playwright/test';

/**
 * Cadeia: dmr-fluxo-base · fase 08-qa-validation.
 *
 * Smoke Playwright DMR cobrindo:
 *  1. Listagem `/dmr` carrega autenticado e exibe a declaração mockada.
 *  2. Criação via `/dmr/novo` redireciona para `/dmr/:id`.
 *  3. Banner `DMR_GATEWAY_PENDING_HAR` aparece quando submit é tentado
 *     contra o stub do gateway (Caminho B do checkpoint 02).
 *
 * Os fluxos backend são mockados via `page.route` para isolar a verificação
 * do contrato visual/UX da fase 07; backend/worker reais são cobertos pelas
 * suítes `test:api`, `test:integration` e `test:worker`.
 */

const integrationAccountId = 'acc_dmr_qa_001';
const sessionContextId = 'scx_dmr_qa_001';
const accountId = 'acc_dmr_qa_001';

const baseDmr = {
  id: 'dmr_qa_001',
  integrationAccountId,
  cnpj: '31913781000139',
  role: 'gerador',
  status: 'draft',
  periodStart: '2026-03-01',
  periodEnd: '2026-03-31',
  periodLabel: '2026-03-01 a 2026-03-31',
  totalItems: 0,
  totalQuantityKg: 0,
  attempts: 0,
  protocolNumber: null,
  lastErrorCode: null,
  lastErrorMessage: null,
  createdAt: '2026-04-25T10:00:00.000Z',
  updatedAt: '2026-04-25T10:00:00.000Z'
};

async function setupAuthenticatedSession(page) {
  await page.addInitScript(({ accountId, scxId, accId }) => {
    const expiresAt = new Date(Date.now() + 60 * 60 * 1000).toISOString();
    localStorage.setItem('sicat_session_access_token', 'test-token');
    localStorage.setItem('sicat_session_refresh_token', 'test-refresh-token');
    localStorage.setItem('sicat_session_expires_at', expiresAt);
    localStorage.setItem('sicat_session_user', JSON.stringify({
      name: 'Usuario QA DMR',
      email: 'qa-dmr@test.com',
      userId: 'usr_qa_dmr_001'
    }));
    localStorage.setItem('sicat_active_cetesb_account', JSON.stringify({
      accountId: accId,
      partnerCode: 176163,
      partnerDocument: '31.913.781/0001-39',
      partnerName: 'Parceiro QA DMR',
      accountType: 'generator',
      isActive: true
    }));
    localStorage.setItem('sicat_active_session_context', JSON.stringify({
      sessionContextId: scxId,
      id: scxId,
      integrationAccountId: accountId,
      status: 'active'
    }));
    localStorage.setItem('sicat_active_integration_account_id', accountId);
  }, { accountId: integrationAccountId, scxId: sessionContextId, accId: accountId });
}

async function mockSessionContext(page) {
  await page.route('**/v1/sicat/session', async (route) => {
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({
        user: {
          userId: 'usr_qa_dmr_001',
          name: 'Usuario QA DMR',
          email: 'qa-dmr@test.com',
          roles: ['operator']
        },
        activeAccount: {
          accountId,
          partnerCode: 176163,
          partnerDocument: '31.913.781/0001-39',
          partnerName: 'Parceiro QA DMR',
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

  await page.route('**/v1/sicat/cetesb-accounts', async (route) => {
    if (route.request().method() !== 'GET') {
      await route.continue();
      return;
    }
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({
        activeAccountId: accountId,
        accounts: [{
          accountId,
          partnerCode: 176163,
          partnerDocument: '31.913.781/0001-39',
          partnerName: 'Parceiro QA DMR',
          accountType: 'generator',
          isActive: true
        }]
      })
    });
  });
}

test.describe('DMR smoke (cadeia dmr-fluxo-base)', () => {
  test('listagem /dmr carrega autenticado e exibe declaração mockada', async ({ page }) => {
    await setupAuthenticatedSession(page);
    await mockSessionContext(page);

    const listRequests: Array<{ integrationAccountId: string | null }> = [];

    await page.route('**/v1/dmr?**', async (route) => {
      const url = new URL(route.request().url());
      listRequests.push({
        integrationAccountId: url.searchParams.get('integrationAccountId')
      });
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          items: [baseDmr],
          total: 1,
          limit: 50,
          offset: 0
        })
      });
    });

    await page.goto('/dmr');

    await expect(page.getByRole('heading', { name: /Declarações DMR/i })).toBeVisible();
    await expect.poll(() => listRequests.length).toBeGreaterThanOrEqual(1);
    await expect(page.getByText(baseDmr.periodLabel)).toBeVisible({ timeout: 10_000 });
  });

  test('criação via /dmr/novo redireciona para /dmr/:id', async ({ page }) => {
    await setupAuthenticatedSession(page);
    await mockSessionContext(page);

    await page.route('**/v1/dmr', async (route) => {
      if (route.request().method() === 'POST') {
        const created = { ...baseDmr, status: 'draft' };
        await route.fulfill({
          status: 201,
          contentType: 'application/json',
          body: JSON.stringify(created)
        });
        return;
      }
      await route.continue();
    });

    await page.route(`**/v1/dmr/${baseDmr.id}`, async (route) => {
      if (route.request().method() === 'GET') {
        await route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify({ ...baseDmr, items: [] })
        });
        return;
      }
      await route.continue();
    });

    await page.route(`**/v1/dmr/${baseDmr.id}/status`, async (route) => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          dmrId: baseDmr.id,
          status: baseDmr.status,
          operationalStatus: 'pending',
          attempts: 0
        })
      });
    });

    await page.route(`**/v1/dmr/${baseDmr.id}/items`, async (route) => {
      if (route.request().method() === 'GET') {
        await route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify({ items: [], total: 0 })
        });
        return;
      }
      await route.continue();
    });

    await page.goto('/dmr/novo');

    await expect(page.getByRole('heading', { name: /Criar DMR rascunho/i })).toBeVisible();

    await page.getByRole('button', { name: /Criar rascunho/i }).click();

    await page.waitForURL(`**/dmr/${baseDmr.id}`, { timeout: 10_000 });
    expect(page.url()).toContain(`/dmr/${baseDmr.id}`);
  });

  test('banner DMR_GATEWAY_PENDING_HAR aparece quando submit retorna 503 do gateway', async ({ page }) => {
    await setupAuthenticatedSession(page);
    await mockSessionContext(page);

    const consolidatedDmr = {
      ...baseDmr,
      status: 'pending_review',
      totalItems: 1,
      totalQuantityKg: 250
    };

    await page.route(`**/v1/dmr/${baseDmr.id}`, async (route) => {
      if (route.request().method() === 'GET') {
        await route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify(consolidatedDmr)
        });
        return;
      }
      await route.continue();
    });

    await page.route(`**/v1/dmr/${baseDmr.id}/status`, async (route) => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          dmrId: baseDmr.id,
          status: consolidatedDmr.status,
          operationalStatus: 'pending',
          attempts: 0
        })
      });
    });

    await page.route(`**/v1/dmr/${baseDmr.id}/items`, async (route) => {
      if (route.request().method() === 'GET') {
        await route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify({
            items: [{
              id: 'dmritem_qa_001',
              dmrId: baseDmr.id,
              mtrNumber: '260010999001',
              residueClass: 'IIA',
              quantityValue: 250,
              quantityUnit: 'kg',
              partnerRole: 'transportador',
              partnerCnpj: '11222333000181'
            }],
            total: 1
          })
        });
        return;
      }
      await route.continue();
    });

    await page.route(`**/v1/dmr/${baseDmr.id}/submit`, async (route) => {
      if (route.request().method() === 'POST') {
        await route.fulfill({
          status: 503,
          contentType: 'application/problem+json',
          body: JSON.stringify({
            type: 'about:blank',
            title: 'DMR gateway pending HAR capture',
            status: 503,
            code: 'DMR_GATEWAY_PENDING_HAR',
            detail: 'Aguardando captura HAR DMR — envio remoto à CETESB pendente.'
          })
        });
        return;
      }
      await route.continue();
    });

    await page.goto(`/dmr/${baseDmr.id}`);

    await expect(page.getByRole('heading', { name: new RegExp(consolidatedDmr.periodLabel, 'i') })).toBeVisible({ timeout: 10_000 });

    // Abre o diálogo "Submeter à CETESB" e confirma.
    await page.getByRole('button', { name: /Submeter à CETESB/i }).click();
    const dialog = page.getByRole('dialog');
    await expect(dialog).toBeVisible();
    await dialog.getByRole('button', { name: /Confirmar envio/i }).click();

    await expect(page.getByText(/Aguardando captura HAR DMR/i)).toBeVisible({ timeout: 10_000 });
  });
});

import { expect, test } from '@playwright/test';

const activeIntegrationAccountId = 'acc_active_qa_001';
const staleIntegrationAccountId = 'acc_stale_qa_999';
const sessionContextId = 'scx_active_qa_001';

async function setupAuthenticatedSession(page) {
  await page.addInitScript(({ activeAccountId, staleAccountId, scxId }) => {
    const expiresAt = new Date(Date.now() + 60 * 60 * 1000).toISOString();
    localStorage.setItem('sicat_session_access_token', 'test-token');
    localStorage.setItem('sicat_session_refresh_token', 'test-refresh-token');
    localStorage.setItem('sicat_session_expires_at', expiresAt);
    localStorage.setItem('sicat_session_user', JSON.stringify({
      name: 'Usuario QA',
      email: 'qa@test.com',
      userId: 'usr_qa_001'
    }));
    localStorage.setItem('sicat_active_cetesb_account', JSON.stringify({
      accountId: 'acc_operational_001',
      partnerCode: 176163,
      partnerDocument: '31.913.781/0001-39',
      partnerName: 'Parceiro Operacional QA',
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
    localStorage.setItem('sicat_manifest_list_filters', JSON.stringify({
      integrationAccountId: staleAccountId,
      status: 'submitted',
      groupId: '',
      manifestNumber: '',
      carrierQuery: '',
      receiverQuery: '',
      dateFrom: '18/04/2026',
      dateTo: '18/04/2026',
      page: 1,
      pageSize: 20
    }));
  }, {
    activeAccountId: activeIntegrationAccountId,
    staleAccountId: staleIntegrationAccountId,
    scxId: sessionContextId
  });
}

async function mockOperationalContext(page) {
  await page.route('**/v1/sicat/session', async (route) => {
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({
        user: {
          userId: 'usr_qa_001',
          name: 'Usuario QA',
          email: 'qa@test.com',
          roles: ['operator']
        },
        activeAccount: {
          accountId: 'acc_operational_001',
          partnerCode: 176163,
          partnerDocument: '31.913.781/0001-39',
          partnerName: 'Parceiro Operacional QA',
          accountType: 'generator',
          isActive: true
        },
        sessionContext: {
          sessionContextId,
          id: sessionContextId,
          integrationAccountId: activeIntegrationAccountId,
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
        activeAccountId: 'acc_operational_001',
        accounts: [{
          accountId: 'acc_operational_001',
          partnerCode: 176163,
          partnerDocument: '31.913.781/0001-39',
          partnerName: 'Parceiro Operacional QA',
          accountType: 'generator',
          isActive: true
        }]
      })
    });
  });
}

test('busca de manifestos ignora integrationAccountId stale da rota e do localStorage', async ({ page }) => {
  await setupAuthenticatedSession(page);
  await mockOperationalContext(page);

  const manifestSearchRequests = [];

  await page.route('**/v1/manifestos?**', async (route) => {
    const requestUrl = new URL(route.request().url());
    manifestSearchRequests.push({
      integrationAccountId: requestUrl.searchParams.get('integrationAccountId'),
      sessionContextId: requestUrl.searchParams.get('sessionContextId'),
      status: requestUrl.searchParams.get('status')
    });

    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({
        page: 1,
        pageSize: 20,
        totalItems: 1,
        totalPages: 1,
        items: [{
          id: 'man_qa_001',
          manifestNumber: '260010999001',
          status: 'submitted',
          externalStatus: 'salvo',
          carrier: { description: 'Transportadora QA' },
          receiver: { description: 'Destinador QA' },
          expeditionDate: '2026-04-18'
        }]
      })
    });
  });

  await page.goto(`/manifestos?integrationAccountId=${staleIntegrationAccountId}`);

  await expect.poll(() => manifestSearchRequests.length).toBe(1);
  expect(manifestSearchRequests[0]).toEqual({
    integrationAccountId: activeIntegrationAccountId,
    sessionContextId,
    status: 'submitted'
  });

  await expect(page.getByText('260010999001')).toBeVisible();
});
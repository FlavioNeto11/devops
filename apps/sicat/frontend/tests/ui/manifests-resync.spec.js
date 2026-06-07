import { test, expect } from '@playwright/test';

const integrationAccountId = 'acc_test_prod';
const sessionContextId = 'ctx_test_01';

async function setupAuthenticatedSession(page) {
  await page.addInitScript(({ integrationAccountId: accId, sessionContextId: scxId }) => {
    const expiresAt = new Date(Date.now() + 60 * 60 * 1000).toISOString();
    localStorage.setItem('sicat_session_access_token', 'test-token');
    localStorage.setItem('sicat_session_refresh_token', 'test-refresh-token');
    localStorage.setItem('sicat_session_expires_at', expiresAt);
    localStorage.setItem('sicat_session_user', JSON.stringify({
      name: 'Usuário Teste',
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
}

test('ressinc envia sessionContextId e mantém erro estrito sem warning residual', async ({ page }) => {
  await setupAuthenticatedSession(page);

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

  await page.route('**/v1/sicat/cetesb-accounts', async (route) => {
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

  let forceSyncSessionContextId = null;

  await page.route('**/v1/manifestos?**', async (route) => {
    const requestUrl = new URL(route.request().url());
    const isForceSync = requestUrl.searchParams.get('forceSync') === 'true';

    if (isForceSync) {
      forceSyncSessionContextId = requestUrl.searchParams.get('sessionContextId');
      await route.fulfill({
        status: 502,
        contentType: 'application/problem+json',
        body: JSON.stringify({
          title: 'Bad Gateway',
          detail: 'A CETESB retornou 500 para GET /api/mtr/pesquisaManifesto/...'
        })
      });
      return;
    }

    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({
        page: 1,
        pageSize: 20,
        totalItems: 0,
        totalPages: 0,
        items: [],
        syncWarning: {
          code: 'CETESB_SYNC_FALLBACK',
          message: 'CETESB indisponível no momento. Exibindo dados locais em cache.',
          source: 'local-cache',
          remoteStatus: 500,
          fallbackAt: '2026-03-13T10:15:00.000Z'
        }
      })
    });
  });

  await page.goto('/manifestos');

  await expect(page.getByText('CETESB indisponível no momento. Exibindo dados locais em cache.')).toBeVisible();

  await page.getByRole('button', { name: /Ressinc\. CETESB/i }).click();

  await expect.poll(() => forceSyncSessionContextId).toBe(sessionContextId);
  await expect(page.getByText('A CETESB retornou 500 para GET /api/mtr/pesquisaManifesto/...')).toBeVisible();
  await expect(page.getByText('CETESB indisponível no momento. Exibindo dados locais em cache.')).not.toBeVisible();
});

test('manifesto impresso permanece cancelável e com status visual de sucesso', async ({ page }) => {
  await setupAuthenticatedSession(page);

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

  await page.route('**/v1/sicat/cetesb-accounts', async (route) => {
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

  await page.route('**/v1/manifestos?**', async (route) => {
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
            id: 'man_printed_01',
            status: 'printed',
            externalStatus: 'salvo',
            manifestNumber: '260010784805',
            externalCode: 22273911,
            externalHashCode: 'VmEcPNd9afQG5ZUMvp2r5pFMEYspCO',
            expeditionDate: '2026-03-13',
            carrier: { description: '12631745000308' },
            receiver: { description: 'B2BLUE COM COMERCIO E VALORIZACAO DE RESIDUOS LTDA' }
          }
        ]
      })
    });
  });

  await page.goto('/manifestos');

  const row = page.locator('tbody tr', { hasText: '260010784805' });
  await expect(row).toBeVisible();

  const statusBadge = row.locator('.sicat-status');
  await expect(statusBadge).toHaveText('salvo');
  await expect(statusBadge).toHaveClass(/succeeded/);

  await row.getByRole('button', { name: 'Ações' }).click();

  const cancelButton = page.getByRole('menuitem', { name: 'Cancelar' });
  await expect(cancelButton).toBeEnabled();
});

test('menu de ações do manifesto abre fora do container com overflow da grid', async ({ page }) => {
  await setupAuthenticatedSession(page);

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

  await page.route('**/v1/sicat/cetesb-accounts', async (route) => {
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

  await page.route('**/v1/manifestos?**', async (route) => {
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
            id: 'man_actions_01',
            status: 'submitted',
            externalStatus: 'sucesso',
            manifestNumber: '260010784806',
            externalCode: 22273912,
            externalHashCode: 'hash-menu-actions',
            expeditionDate: '2026-03-13',
            carrier: { description: '12631745000308' },
            receiver: { description: 'B2BLUE COM COMERCIO E VALORIZACAO DE RESIDUOS LTDA' }
          }
        ]
      })
    });
  });

  await page.goto('/manifestos');

  const row = page.locator('tbody tr', { hasText: '260010784806' });
  await expect(row).toBeVisible();

  await row.getByRole('button', { name: 'Ações' }).click();

  const popover = page.getByRole('menu');
  await expect(popover).toBeVisible();
  await expect(popover).toHaveCSS('position', 'fixed');
  await expect(page.locator('.manifests-table-shell .manifest-actions-list')).toHaveCount(0);
  await expect(popover.getByRole('menuitem', { name: 'Visualizar' })).toBeVisible();
});

test('menu de ações do manifesto abre para cima quando não há espaço útil abaixo do trigger', async ({ page }) => {
  await setupAuthenticatedSession(page);
  const manifests = Array.from({ length: 40 }, (_, index) => ({
    id: `man_actions_flip_${index + 1}`,
    status: 'submitted',
    externalStatus: 'sucesso',
    manifestNumber: `2600107848${String(index + 10).padStart(2, '0')}`,
    externalCode: 22273914 + index,
    externalHashCode: `hash-menu-actions-flip-${index + 1}`,
    expeditionDate: '2026-03-13',
    carrier: { description: '12631745000308' },
    receiver: { description: `Recebedor Teste ${index + 1}` }
  }));
  const targetManifest = manifests[28];

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

  await page.route('**/v1/sicat/cetesb-accounts', async (route) => {
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

  await page.route('**/v1/manifestos?**', async (route) => {
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({
        page: 1,
        pageSize: 20,
        totalItems: manifests.length,
        totalPages: 1,
        items: manifests
      })
    });
  });

  await page.setViewportSize({ width: 1280, height: 720 });
  await page.goto('/manifestos');

  const row = page.locator('tbody tr', { hasText: targetManifest.manifestNumber });
  await expect(row).toBeVisible();

  await row.evaluate((element) => {
    const scroller = document.querySelector('.sicat-page');
    const rowRect = element.getBoundingClientRect();
    const scrollerRect = scroller.getBoundingClientRect();
    const delta = rowRect.top - (scrollerRect.bottom - rowRect.height - 12);
    scroller.scrollBy({ top: delta, behavior: 'auto' });
  });
  await page.waitForTimeout(100);

  const trigger = row.getByRole('button', { name: 'Ações' });
  const triggerRect = await trigger.evaluate((element) => {
    const { top, bottom } = element.getBoundingClientRect();
    return { top, bottom };
  });
  const scrollerRect = await page.locator('.sicat-page').evaluate((element) => {
    const { top, bottom } = element.getBoundingClientRect();
    return { top, bottom, scrollTop: element.scrollTop };
  });

  await trigger.click();

  const popover = page.getByRole('menu');
  await expect(popover).toBeVisible();
  await expect(popover).toHaveAttribute('data-direction', 'up');

  const rect = await popover.evaluate((element) => {
    const { top, bottom, height } = element.getBoundingClientRect();
    return { top, bottom, height };
  });
  expect(scrollerRect.scrollTop).toBeGreaterThan(0);
  expect(triggerRect.bottom).toBeGreaterThanOrEqual(scrollerRect.bottom - 80);
  expect(rect.top).toBeGreaterThanOrEqual(scrollerRect.top + 8);
  expect(rect.bottom).toBeLessThanOrEqual(scrollerRect.bottom - 8);
  expect(rect.bottom).toBeLessThan(triggerRect.top);
});

test('menu de ações do manifesto fecha ao clicar fora do popover', async ({ page }) => {
  await setupAuthenticatedSession(page);

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

  await page.route('**/v1/sicat/cetesb-accounts', async (route) => {
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

  await page.route('**/v1/manifestos?**', async (route) => {
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
            id: 'man_actions_outside_01',
            status: 'submitted',
            externalStatus: 'sucesso',
            manifestNumber: '260010784808',
            externalCode: 22273930,
            externalHashCode: 'hash-menu-actions-outside',
            expeditionDate: '2026-03-13',
            carrier: { description: '12631745000308' },
            receiver: { description: 'B2BLUE COM COMERCIO E VALORIZACAO DE RESIDUOS LTDA' }
          }
        ]
      })
    });
  });

  await page.goto('/manifestos');

  const row = page.locator('tbody tr', { hasText: '260010784808' });
  await expect(row).toBeVisible();

  const trigger = row.getByRole('button', { name: 'Ações' });

  await trigger.click();
  await expect(page.getByRole('menu')).toBeVisible();

  await page.locator('.manifests-header-copy').click();
  await expect(page.getByRole('menu')).toHaveCount(0);

  await trigger.click();
  await expect(page.getByRole('menuitem', { name: 'Visualizar' })).toBeVisible();
});

test('menu de ações do manifesto fecha com Escape sem perder usabilidade', async ({ page }) => {
  await setupAuthenticatedSession(page);

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

  await page.route('**/v1/sicat/cetesb-accounts', async (route) => {
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

  await page.route('**/v1/manifestos?**', async (route) => {
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
            id: 'man_actions_close_01',
            status: 'submitted',
            externalStatus: 'sucesso',
            manifestNumber: '260010784807',
            externalCode: 22273913,
            externalHashCode: 'hash-menu-actions-close',
            expeditionDate: '2026-03-13',
            carrier: { description: '12631745000308' },
            receiver: { description: 'B2BLUE COM COMERCIO E VALORIZACAO DE RESIDUOS LTDA' }
          }
        ]
      })
    });
  });

  await page.goto('/manifestos');

  const row = page.locator('tbody tr', { hasText: '260010784807' });
  await expect(row).toBeVisible();

  const trigger = row.getByRole('button', { name: 'Ações' });

  await trigger.click();
  const popover = page.getByRole('menu');
  await expect(popover).toBeVisible();
  await expect(popover.getByRole('menuitem', { name: 'Visualizar' })).toBeVisible();

  await page.keyboard.press('Escape');
  await expect(page.getByRole('menu')).toHaveCount(0);
  await expect(trigger).toBeFocused();

  await trigger.click();
  await expect(page.getByRole('menuitem', { name: 'Cancelar' })).toBeVisible();
});

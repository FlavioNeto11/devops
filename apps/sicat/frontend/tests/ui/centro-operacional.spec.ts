import { test, expect, type Page, type Route } from '@playwright/test';

const BASE_URL = 'http://127.0.0.1:5174';
const integrationAccountId = 'acc_test_co_001';
const sessionContextId = 'ctx_test_co_01';

async function setupAuthenticatedShell(page: Page) {
  await page.addInitScript(({ accId, scxId }: { accId: string; scxId: string }) => {
    const expiresAt = new Date(Date.now() + 60 * 60 * 1000).toISOString();
    localStorage.setItem('sicat_session_access_token', 'test-token');
    localStorage.setItem('sicat_session_refresh_token', 'test-refresh-token');
    localStorage.setItem('sicat_session_expires_at', expiresAt);
    localStorage.setItem('sicat_session_user', JSON.stringify({
      name: 'CO Tester',
      email: 'co@test.com',
      userId: 'usr_co_001'
    }));
    localStorage.setItem('sicat_active_cetesb_account', JSON.stringify({
      accountId: 'acc_co_01',
      partnerCode: 176163,
      partnerDocument: '31.913.781/0001-39',
      partnerName: 'Parceiro CO',
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
  }, { accId: integrationAccountId, scxId: sessionContextId });

  await page.route('**/v1/sicat/session', async (route: Route) => {
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({
        user: { userId: 'usr_co_001', name: 'CO Tester', email: 'co@test.com', roles: ['operator'] },
        activeAccount: {
          accountId: 'acc_co_01',
          partnerCode: 176163,
          partnerDocument: '31.913.781/0001-39',
          partnerName: 'Parceiro CO',
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
          activeAccountId: 'acc_co_01',
          accounts: [{
            accountId: 'acc_co_01',
            partnerCode: 176163,
            partnerDocument: '31.913.781/0001-39',
            partnerName: 'Parceiro CO',
            accountType: 'generator',
            isActive: true
          }]
        })
      });
      return;
    }
    await route.continue();
  });
}

async function mockOperationsOverview(page: Page) {
  await page.route('**/v1/operations/overview', async (route: Route) => {
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({
        generatedAt: '2026-04-25T12:00:00Z',
        jobs: { queued: 2, running: 1, retry_wait: 0, succeeded_24h: 50, failed_24h: 1, dlq_total: 1 },
        manifests: { total: 100, submitted: 80, printed: 15, cancelled: 3, draft_or_failed: 2 },
        accounts: { total: 3, active: 2 },
        sessions: { active: 1, pending_auth: 1, expired: 0, invalid: 0, revoked: 0 },
        recentJobs: [
          {
            jobId: 'job_recent_1',
            operation: 'manifest.submit',
            entityType: 'manifest',
            entityId: 'man_1',
            status: 'succeeded',
            attempts: 1,
            correlationId: 'corr_1',
            operationalStatus: 'completed_with_document',
            label: 'Concluído com documento',
            severity: 'success',
            recommendedAction: 'Disponibilizar o documento.',
            retryable: 'false',
            bucket: 'terminal_success',
            links: { self: '/v1/jobs/job_recent_1' }
          }
        ],
        recentErrors: [
          {
            jobId: 'job_err_1',
            operation: 'manifest.submit',
            entityType: 'manifest',
            entityId: 'man_2',
            status: 'failed',
            attempts: 3,
            lastErrorCode: 'REMOTE_TIMEOUT',
            lastErrorMessage: 'Upstream timeout',
            correlationId: 'corr_err_1',
            operationalStatus: 'failed_remote_contract',
            label: 'Falha no contrato remoto (CETESB)',
            severity: 'danger',
            recommendedAction: 'Inspecionar exchange auditado.',
            retryable: 'conditional',
            bucket: 'terminal_failure',
            links: { self: '/v1/jobs/job_err_1' }
          }
        ],
        recentDlq: [
          {
            jobId: 'job_dlq_1',
            operation: 'manifest.print',
            entityType: 'manifest',
            entityId: 'man_3',
            dlqReason: 'max_attempts_exceeded',
            movedAt: '2026-04-25T11:50:00Z',
            operationalStatus: 'dlq',
            label: 'Em fila morta (DLQ)',
            severity: 'danger',
            recommendedAction: 'Reenfileirar via /v1/jobs/{id}/retry.',
            retryable: 'true',
            bucket: 'blocked'
          }
        ]
      })
    });
  });
}

async function mockJobsSearch(page: Page) {
  await page.route('**/v1/jobs/search**', async (route: Route) => {
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({
        items: [{
          jobId: 'job_search_1',
          commandId: 'cmd_1',
          entityType: 'manifest',
          entityId: 'man_x',
          operation: 'manifest.submit',
          status: 'failed',
          operationalStatus: 'failed_remote_contract',
          attempts: 3,
          maxAttempts: 5,
          queuedAt: '2026-04-20T10:00:00Z',
          correlationId: 'corr_search_1',
          label: 'Falha no contrato remoto (CETESB)',
          severity: 'danger',
          recommendedAction: 'Inspecionar exchange auditado.',
          retryable: 'conditional',
          bucket: 'terminal_failure',
          links: {}
        }],
        page: 1,
        pageSize: 20,
        totalItems: 1,
        totalPages: 1
      })
    });
  });
}

async function mockAuditSearch(page: Page) {
  await page.route('**/v1/audit/search**', async (route: Route) => {
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({
        items: [{
          correlationId: 'corr_audit_1',
          entityType: 'manifest',
          entityId: 'man_x',
          occurredAt: '2026-04-20T10:00:00Z',
          direction: 'outbound',
          component: 'cetesb-gateway',
          httpMethod: 'POST',
          endpoint: '/api/mtr/gerarMtr',
          httpStatus: 200,
          latencyMs: 1200,
          links: {}
        }],
        page: 1,
        pageSize: 20,
        totalItems: 1,
        totalPages: 1
      })
    });
  });
}

async function mockCetesbHealth(page: Page) {
  await page.route('**/v1/cetesb/accounts/health**', async (route: Route) => {
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({
        generatedAt: '2026-04-25T12:00:00Z',
        totals: { total: 1, active: 1, healthy: 1, degraded: 0, pending: 0, idle: 0, inactive: 0 },
        accounts: [{
          accountId: 'acc_co_01',
          integrationAccountId,
          partnerName: 'Parceiro CO',
          partnerDocument: '31913781000139',
          partnerCode: '176163',
          accountType: 'generator',
          isActive: true,
          status: 'healthy',
          sessions: { active: 1, pending: 0, expired: 0, invalid: 0 },
          jobs: { failed24h: 0, dlqTotal: 0 }
        }]
      })
    });
  });

  await page.route('**/v1/cetesb/sessions/health**', async (route: Route) => {
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({
        generatedAt: '2026-04-25T12:00:00Z',
        totals: { total: 1, active: 1, pending_auth: 0, expired: 0, invalid: 0, revoked: 0 },
        sessions: [{
          sessionContextId,
          integrationAccountId,
          status: 'active',
          isExpired: false,
          expiresAt: '2026-04-25T15:00:00Z',
          lastValidatedAt: '2026-04-25T12:00:00Z'
        }]
      })
    });
  });
}

async function mockMtrReports(page: Page) {
  await page.route('**/v1/reports/mtrs?**', async (route: Route) => {
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({
        items: [{
          id: 'man_report_1',
          status: 'submitted',
          externalStatus: 'transit',
          manifestType: 1,
          expeditionDate: '2026-04-20',
          manifestNumber: '20260000123456',
          externalCode: 12345,
          generator: { partnerCode: '176163', description: 'Gerador X' },
          carrier: { partnerCode: '654321', description: 'Transportadora Y' },
          receiver: { partnerCode: '789012', description: 'Receptor Z' }
        }],
        page: 1,
        pageSize: 20,
        totalItems: 1,
        totalPages: 1
      })
    });
  });
}

test.describe('Centro Operacional SICAT - smoke', () => {
  test.beforeEach(async ({ page }) => {
    await setupAuthenticatedShell(page);
    await mockOperationsOverview(page);
    await mockJobsSearch(page);
    await mockAuditSearch(page);
    await mockCetesbHealth(page);
    await mockMtrReports(page);
  });

  test('operations dashboard renderiza KPIs e badge de severity', async ({ page }) => {
    await page.goto(`${BASE_URL}/operacao/dashboard`);
    const view = page.locator('[data-testid="operations-dashboard-view"]');
    await expect(view).toBeVisible();
    await expect(page.locator('[data-testid="kpi-jobs-queued"]')).toContainText('2');
    await expect(view.getByText('Concluído com documento').first()).toBeVisible();
    await expect(view.getByText('Falha no contrato remoto (CETESB)').first()).toBeVisible();
  });

  test('jobs console renderiza tabela com badge operacional', async ({ page }) => {
    await page.goto(`${BASE_URL}/operacao/jobs`);
    await expect(page.locator('[data-testid="jobs-console-view"]')).toBeVisible();
    const table = page.locator('[data-testid="jobs-console-table"]');
    await expect(table).toBeVisible();
    await expect(table).toContainText('manifest.submit');
    await expect(table).toContainText('Falha no contrato remoto (CETESB)');
  });

  test('audit explorer carrega busca e timeline', async ({ page }) => {
    await page.route('**/v1/audit/corr_audit_1**', async (route: Route) => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ correlationId: 'corr_audit_1', exchanges: [] })
      });
    });
    await page.goto(`${BASE_URL}/operacao/auditoria/corr_audit_1`);
    await expect(page.locator('[data-testid="audit-explorer-view"]')).toBeVisible();
    await expect(page.locator('[data-testid="audit-search-table"]')).toBeVisible();
    await expect(page.locator('[data-testid="audit-trail-panel"]')).toBeVisible();
  });

  test('cetesb health renderiza tabelas', async ({ page }) => {
    await page.goto(`${BASE_URL}/operacao/cetesb-health`);
    await expect(page.locator('[data-testid="cetesb-health-view"]')).toBeVisible();
    await expect(page.locator('[data-testid="accounts-health-table"]')).toContainText('Parceiro CO');
  });

  test('mtr reports renderiza tabela e expõe botão export', async ({ page }) => {
    await page.goto(`${BASE_URL}/operacao/relatorios/mtr`);
    await expect(page.locator('[data-testid="mtr-reports-view"]')).toBeVisible();
    await expect(page.locator('[data-testid="mtr-reports-table"]')).toContainText('20260000123456');
    await expect(page.locator('[data-testid="mtr-reports-export"]')).toBeVisible();
  });

  test('command center lista comandos e filtra por busca', async ({ page }) => {
    await page.goto(`${BASE_URL}/operacao/command-center`);
    const view = page.locator('[data-testid="command-center-view"]');
    await expect(view).toBeVisible();
    const list = page.locator('[data-testid="command-center-list"]');
    await expect(list.getByText('Ver jobs com erro')).toBeVisible();
    await page.locator('[data-testid="command-center-search"] input').fill('CDF');
    await expect(list.getByText('Listar CDFs emitidos')).toBeVisible();
    await expect(list.getByText('Ver jobs com erro')).toHaveCount(0);
  });
});

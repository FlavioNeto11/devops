import { expect, test } from '@playwright/test';

/**
 * Smoke da vertical Transporte (DL-103, programa "SICAT Transporte", Onda
 * 1.5/PR-F1 — frontend mínimo). Molde: tests/ui/mtr-provisorio-smoke.spec.ts.
 *
 * Cobertura mínima:
 *  1. Lista `/transporte/operacoes` carrega autenticado e exibe item mockado.
 *  2. Detalhe alcançado via "Detalhar" mostra o status da operação e o PAINEL
 *     DE CONFORMIDADE (pelo menos um gate avaliado, com o check visível).
 *
 * A vertical nasce atrás de `VITE_FEATURE_TRANSPORTE` (default DESLIGADA — ver
 * `src/lib/feature-flags.js` e `.env.example`). O `webServer` deste projeto
 * (`playwright.config.js`) roda `npm run dev` sem `.env` setado, então em CI/
 * dev "de fábrica" o guard do router redireciona `/transporte/operacoes` para
 * `/dashboard` ANTES da tela carregar — os testes abaixo detectam esse
 * redirect e usam `test.skip(...)` (forma dinâmica do Playwright) em vez de
 * falhar. Para exercitar de verdade: `VITE_FEATURE_TRANSPORTE=true` no `.env`
 * do frontend antes de subir o `webServer`.
 *
 * Backend é mockado via `page.route` — mesmo isolamento do smoke de MTR
 * provisório (contrato real fica em `test:api`/`test:integration`).
 */

const integrationAccountId = 'acc_transporte_qa_001';
const sessionContextId = 'scx_transporte_qa_001';
const accountId = 'acc_transporte_qa_001';
const operationId = 'trop_qa_smoke_0001a2b3c4d5e6f7';

const operationSummary = {
  id: operationId,
  version: 1,
  integrationAccountId,
  referenceCode: 'PED-QA-000777',
  status: 'draft',
  cargoRegime: 'lotacao',
  freight: {
    offeredAmount: 3500.0,
    contractedAmount: null,
    floorAmount: null,
    tollAmount: null,
    vpoAmount: null,
    otherComponentsAmount: null,
    totalContractValue: null
  },
  currency: 'BRL',
  availableCommands: ['submit_validation', 'cancel'],
  createdAt: '2026-08-13T12:15:00.000Z',
  updatedAt: '2026-08-13T12:15:00.000Z'
};

const operationDetail = {
  ...operationSummary,
  sessionContextId: null,
  operationClassification: null,
  paymentMethod: null,
  paymentTermDays: null,
  blockedReasonCode: null,
  cancelledReason: null,
  parties: [],
  vehicles: [],
  cargo: [],
  route: {
    id: 'troproute_qa_smoke_0001',
    originMunicipality: 'São Paulo',
    originUf: 'SP',
    originIbgeCode: null,
    destinationMunicipality: 'Campinas',
    destinationUf: 'SP',
    destinationIbgeCode: null,
    distanceKm: 99.5,
    routeSource: 'manual',
    tollExpected: null,
    waypoints: [],
    createdAt: '2026-08-13T12:15:00.000Z'
  }
};

const complianceOverview = {
  operationId,
  gates: [
    {
      gate: 'GATE_PROPOSAL',
      latestEvaluation: {
        evaluationId: 'cmpeval_qa_smoke_0001',
        operationId,
        gate: 'GATE_PROPOSAL',
        overallStatus: 'WARN',
        referenceDate: '2026-08-13',
        evaluatedAt: '2026-08-13T12:25:30.000Z',
        checks: [
          {
            ruleCode: 'TR-PMF-001',
            ruleVersionLabel: 'v2026-08-baseline',
            status: 'PASS',
            rawStatus: null,
            reasonCode: null,
            humanMessage: 'Regime de carga "lotacao" — piso mínimo de frete aplicável.',
            legalBasis: [{ reference: 'Lei 13.703/2018' }],
            evidenceRefs: ['cmpevd_qa_smoke_0001']
          }
        ]
      }
    },
    { gate: 'GATE_CONTRACT', latestEvaluation: null },
    { gate: 'GATE_CIOT', latestEvaluation: null },
    { gate: 'GATE_FISCAL', latestEvaluation: null },
    { gate: 'GATE_PRE_BOARDING', latestEvaluation: null },
    { gate: 'GATE_RELEASE', latestEvaluation: null },
    { gate: 'GATE_IN_TRANSIT', latestEvaluation: null },
    { gate: 'GATE_COMPLETION', latestEvaluation: null }
  ]
};

async function setupAuthenticatedSession(page) {
  await page.addInitScript(({ accId, scxId, integAccId }) => {
    const expiresAt = new Date(Date.now() + 60 * 60 * 1000).toISOString();
    localStorage.setItem('sicat_session_access_token', 'test-token');
    localStorage.setItem('sicat_session_refresh_token', 'test-refresh-token');
    localStorage.setItem('sicat_session_expires_at', expiresAt);
    localStorage.setItem('sicat_session_user', JSON.stringify({
      name: 'Usuario QA Transporte',
      email: 'qa-transporte@test.com',
      userId: 'usr_qa_transporte_001'
    }));
    localStorage.setItem('sicat_active_cetesb_account', JSON.stringify({
      accountId: accId,
      partnerCode: 176164,
      partnerDocument: '31.913.782/0001-30',
      partnerName: 'Parceiro QA Transporte',
      accountType: 'carrier',
      isActive: true
    }));
    localStorage.setItem('sicat_active_session_context', JSON.stringify({
      sessionContextId: scxId,
      id: scxId,
      integrationAccountId: integAccId,
      status: 'active'
    }));
    localStorage.setItem('sicat_active_integration_account_id', integAccId);
  }, { accId: accountId, scxId: sessionContextId, integAccId: integrationAccountId });
}

async function mockSessionContext(page) {
  await page.route('**/v1/sicat/session', async (route) => {
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({
        user: {
          userId: 'usr_qa_transporte_001',
          name: 'Usuario QA Transporte',
          email: 'qa-transporte@test.com',
          roles: ['operator']
        },
        activeAccount: {
          accountId,
          partnerCode: 176164,
          partnerDocument: '31.913.782/0001-30',
          partnerName: 'Parceiro QA Transporte',
          accountType: 'carrier',
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
          partnerCode: 176164,
          partnerDocument: '31.913.782/0001-30',
          partnerName: 'Parceiro QA Transporte',
          accountType: 'carrier',
          isActive: true
        }]
      })
    });
  });
}

async function mockTransportOperationRoutes(page) {
  await page.route('**/v1/transporte/operacoes?**', async (route) => {
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({ items: [operationSummary], total: 1, page: 1, pageSize: 20 })
    });
  });

  await page.route(`**/v1/transporte/operacoes/${operationId}?**`, async (route) => {
    await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(operationDetail) });
  });

  await page.route(`**/v1/transporte/operacoes/${operationId}/conformidade?**`, async (route) => {
    await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(complianceOverview) });
  });
}

test.describe('Transporte smoke (programa "SICAT Transporte", Onda 1.5/PR-F1)', () => {
  test('lista /transporte/operacoes → detalhe → painel de conformidade visível', async ({ page }) => {
    await setupAuthenticatedSession(page);
    await mockSessionContext(page);
    await mockTransportOperationRoutes(page);

    await page.goto('/transporte/operacoes');
    await page.waitForLoadState('networkidle');

    // Flag desligada (default): o guard redireciona para /dashboard antes da
    // tela carregar — nada para verificar aqui além de que o redirect ocorreu.
    test.skip(
      !page.url().includes('/transporte/operacoes'),
      'VITE_FEATURE_TRANSPORTE está desligada neste ambiente (default off) — rota redirecionou para /dashboard.'
    );

    await expect(page.getByRole('heading', { name: /Operações de transporte/i })).toBeVisible();
    await expect(page.getByText(operationSummary.referenceCode)).toBeVisible({ timeout: 10_000 });

    await page.getByRole('button', { name: /Detalhar/i }).first().click();
    await page.waitForURL(`**/transporte/operacoes/${operationId}`, { timeout: 15_000 });

    await expect(page.getByRole('heading', { name: new RegExp(operationSummary.referenceCode, 'i') })).toBeVisible({ timeout: 10_000 });

    // Painel de conformidade: pelo menos o gate avaliado (GATE_PROPOSAL) e o
    // check dentro dele ficam visíveis — prova que o overview foi renderizado,
    // não só buscado.
    await expect(page.getByText('Painel de conformidade')).toBeVisible();
    await expect(page.getByText('Proposta')).toBeVisible();
    await expect(page.getByText(/TR-PMF-001/)).toBeVisible();
    await expect(page.getByText(/piso mínimo de frete aplicável/i)).toBeVisible();

    // Botão de comando roteado (availableCommands: submit_validation/cancel).
    await expect(page.getByRole('button', { name: /Submeter validação/i })).toBeVisible();
  });

  test('acesso não autenticado redireciona para /login', async ({ page }) => {
    await page.goto('/transporte/operacoes');
    await page.waitForURL(/\/login/, { timeout: 10_000 });
    expect(page.url()).toMatch(/\/login/);
  });
});

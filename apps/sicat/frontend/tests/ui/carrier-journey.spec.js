import { expect, test } from '@playwright/test';

/**
 * Jornada ponta-a-ponta do MÓDULO DO TRANSPORTADOR (onda F9 — REQ-SICAT-0032,
 * 0036 e 0037). Molde: tests/ui/transporte-smoke.spec.ts.
 *
 * O que este spec prova é a COSTURA, não cada tela isolada (isso os specs
 * anteriores já fazem): a home da persona carrier leva ao checklist, o
 * checklist leva à habilitação, o hub leva a registrar viagem, o detalhe da
 * viagem carrega o cartão "Seguro da viagem" e o mês fecha na apuração — mais o
 * GR, que é a exigência que a apólice de roubo faz por fora da viagem.
 *
 * ─── COMO RODAR ────────────────────────────────────────────────────────────
 * Este arquivo NÃO entra no gate padrão do CI (`cd frontend/tests/unit &&
 * node --test` só roda os testes puros de node:test). Ele exige o dev server
 * do Playwright E a vertical LIGADA:
 *
 *   cd apps/sicat/frontend
 *   "VITE_FEATURE_TRANSPORTE=true" | Out-File -Encoding utf8 .env   # PowerShell
 *   npx playwright test tests/ui/carrier-journey.spec.js
 *
 * Sem a flag (default de fábrica) o guard do router redireciona `/transporte/*`
 * para `/dashboard` ANTES da tela montar — os testes detectam o redirect e usam
 * `test.skip(...)` dinâmico em vez de falhar, mesmo padrão do transporte-smoke.
 *
 * Backend é 100% mockado por `page.route` (contrato real vive em `test:api`):
 * um fallback devolve lista vazia para qualquer `/v1/transporte/**` não
 * previsto, e os mocks específicos são registrados DEPOIS — no Playwright o
 * handler registrado por último vence.
 */

const integrationAccountId = 'acc_carrier_journey_001';
const sessionContextId = 'scx_carrier_journey_001';
const accountId = 'acc_carrier_journey_001';
const operationId = 'trop_journey_0001a2b3c4d5e6f7';
const carrierId = 'trparty_journey_0001a2b3c4d5';
const policyId = 'inspol_journey_0001a2b3c4d5';

const carrier = {
  id: carrierId,
  version: 3,
  integrationAccountId,
  documentType: 'CNPJ',
  documentNumber: '31913782000130',
  legalName: 'Transportadora Jornada Ltda',
  tradeName: 'Jornada Log',
  rntrcNumber: '87654321',
  rntrcCategory: 'ETC',
  rntrcStatus: 'active',
  rntrcVerifiedAt: '2026-08-10T09:30:00.000Z',
  rntrcVerificationSource: 'open_data',
  municipality: 'São Paulo',
  uf: 'SP',
  isActive: true,
  metadata: {},
  roles: ['carrier'],
  createdAt: '2026-07-01T12:00:00.000Z',
  updatedAt: '2026-08-10T09:30:00.000Z',
  // Derivados do PR I1 (REQ-SICAT-0033): a tela de habilitação traduz estes
  // três campos na régua PF / TAC / ETC.
  fleetSize: 5,
  derivedTypology: 'etc',
  typologyWarning: null
};

const policy = {
  id: policyId,
  version: 2,
  integrationAccountId,
  partyId: carrierId,
  policyType: 'RCTR_C',
  policyNumber: 'APL-JORNADA-0001',
  insurerName: 'Seguradora Jornada',
  status: 'active',
  validFrom: '2026-01-01',
  validUntil: '2026-12-31',
  daysToExpiry: 137,
  perTripLimitAmount: 250000,
  createdAt: '2026-01-01T12:00:00.000Z',
  updatedAt: '2026-08-01T12:00:00.000Z'
};

const operationSummary = {
  id: operationId,
  version: 4,
  integrationAccountId,
  referenceCode: 'PED-JORNADA-000123',
  status: 'contracted',
  cargoRegime: 'lotacao',
  freight: {
    offeredAmount: 4200.0,
    contractedAmount: 4200.0,
    floorAmount: null,
    tollAmount: null,
    vpoAmount: null,
    otherComponentsAmount: null,
    totalContractValue: 4200.0
  },
  currency: 'BRL',
  availableCommands: ['cancel'],
  createdAt: '2026-08-14T12:15:00.000Z',
  updatedAt: '2026-08-15T12:15:00.000Z'
};

const operationDetail = {
  ...operationSummary,
  sessionContextId: null,
  operationClassification: null,
  paymentMethod: null,
  paymentTermDays: null,
  blockedReasonCode: null,
  cancelledReason: null,
  parties: [{ id: 'trpl_journey_1', partyId: carrierId, role: 'carrier', legalName: carrier.legalName }],
  vehicles: [],
  // Caso de ouro do prêmio: R$ 25.000,00 × 0,097% = R$ 24,25.
  cargo: [{ id: 'trcargo_journey_1', description: 'Carga geral', declaredValue: 25000.0 }],
  route: {
    id: 'troproute_journey_1',
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
    createdAt: '2026-08-14T12:15:00.000Z'
  }
};

const complianceOverview = {
  operationId,
  gates: [
    { gate: 'GATE_PROPOSAL', latestEvaluation: null },
    { gate: 'GATE_CONTRACT', latestEvaluation: null },
    { gate: 'GATE_CIOT', latestEvaluation: null },
    { gate: 'GATE_FISCAL', latestEvaluation: null },
    { gate: 'GATE_PRE_BOARDING', latestEvaluation: null },
    { gate: 'GATE_RELEASE', latestEvaluation: null },
    { gate: 'GATE_IN_TRANSIT', latestEvaluation: null },
    { gate: 'GATE_COMPLETION', latestEvaluation: null }
  ]
};

const billingPeriod = {
  id: 'insbill_journey_0001',
  integrationAccountId,
  policyId,
  periodMonth: '2026-08',
  status: 'open',
  declaredTotalAmount: 25000.0,
  premiumTotalAmount: 24.25,
  minimumAmount: 700.0,
  billedAmount: 700.0,
  billingBasis: 'minimum',
  closedAt: null,
  statement: { items: [], notes: [] },
  runs: []
};

const operationsOverview = {
  generatedAt: '2026-08-16T12:00:00.000Z',
  operationsByStatus: { contracted: 1 },
  compliance: { topBlockedRules: [], belowFloorOffers: 0 },
  ciot: { byStatus: {}, unconfirmedPending: 0 },
  vpo: { applicableNotAcquired: 0 },
  fiscalDocuments: { invalid: 0, warnings: 0 },
  insurance: { expiringOrExpiredCount: 0, windowDays: 30 },
  rntrc: { staleCarriers: 0, freshnessDays: 90 },
  jobs: { retryWait: 0, dlq: 0 },
  watch: { pendingHumanReviewGlobal: 0 }
};

async function setupAuthenticatedSession(page) {
  await page.addInitScript(({ accId, scxId, integAccId }) => {
    const expiresAt = new Date(Date.now() + 60 * 60 * 1000).toISOString();
    localStorage.setItem('sicat_session_access_token', 'test-token');
    localStorage.setItem('sicat_session_refresh_token', 'test-refresh-token');
    localStorage.setItem('sicat_session_expires_at', expiresAt);
    localStorage.setItem('sicat_session_user', JSON.stringify({
      name: 'Usuario QA Jornada',
      email: 'qa-jornada@test.com',
      userId: 'usr_qa_jornada_001'
    }));
    localStorage.setItem('sicat_active_cetesb_account', JSON.stringify({
      accountId: accId,
      partnerCode: 176164,
      partnerDocument: '31.913.782/0001-30',
      partnerName: 'Transportadora Jornada',
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
    // O card de boas-vindas cobre o checklist no primeiro acesso — a jornada
    // testada começa DEPOIS dele (o operador real clica "Entendi" uma vez).
    localStorage.setItem('sicat.ui.carrier-welcomed', '1');
  }, { accId: accountId, scxId: sessionContextId, integAccId: integrationAccountId });
}

function json(route, body, status = 200) {
  return route.fulfill({ status, contentType: 'application/json', body: JSON.stringify(body) });
}

async function mockSession(page) {
  await page.route('**/v1/sicat/session', (route) => json(route, {
    user: { userId: 'usr_qa_jornada_001', name: 'Usuario QA Jornada', email: 'qa-jornada@test.com', roles: ['operator'] },
    activeAccount: {
      accountId,
      partnerCode: 176164,
      partnerDocument: '31.913.782/0001-30',
      partnerName: 'Transportadora Jornada',
      accountType: 'carrier',
      isActive: true
    },
    sessionContext: { sessionContextId, id: sessionContextId, integrationAccountId, status: 'active' }
  }));

  await page.route('**/v1/sicat/cetesb-accounts', async (route) => {
    if (route.request().method() !== 'GET') {
      await route.continue();
      return;
    }
    await json(route, {
      activeAccountId: accountId,
      accounts: [{
        accountId,
        partnerCode: 176164,
        partnerDocument: '31.913.782/0001-30',
        partnerName: 'Transportadora Jornada',
        accountType: 'carrier',
        isActive: true
      }]
    });
  });
}

async function mockTransporte(page) {
  // Fallback PRIMEIRO: qualquer rota da vertical não prevista responde lista
  // vazia, para nenhuma tela ficar pendurada num request sem handler.
  await page.route('**/v1/transporte/**', (route) => json(route, { items: [], total: 0, page: 1, pageSize: 20 }));

  await page.route('**/v1/transporte/operations/overview**', (route) => json(route, operationsOverview));

  await page.route('**/v1/transporte/transportadores?**', (route) => json(route, {
    items: [carrier], total: 1, page: 1, pageSize: 20
  }));
  await page.route(`**/v1/transporte/transportadores/${carrierId}?**`, (route) => json(route, carrier));
  await page.route(`**/v1/transporte/transportadores/${carrierId}/apolices?**`, (route) => json(route, {
    items: [policy], total: 1
  }));

  await page.route('**/v1/transporte/veiculos?**', (route) => json(route, {
    items: [{ id: 'trveh_journey_1', version: 1, integrationAccountId, plate: 'ABC1D23', vehicleType: 'truck', isActive: true }],
    total: 1,
    page: 1,
    pageSize: 20
  }));
  await page.route('**/v1/transporte/motoristas?**', (route) => json(route, {
    items: [{
      id: 'trdrv_journey_1',
      version: 1,
      integrationAccountId,
      partyId: 'trparty_journey_pf',
      partyName: 'Motorista Jornada',
      partyDocumentNumber: '12345678909',
      cnhNumber: '12345678901',
      cnhCategory: 'E',
      cnhValidUntil: '2027-05-30',
      status: 'active'
    }],
    total: 1,
    page: 1,
    pageSize: 20
  }));

  await page.route('**/v1/transporte/operacoes?**', (route) => json(route, {
    items: [operationSummary], total: 1, page: 1, pageSize: 20
  }));
  await page.route(`**/v1/transporte/operacoes/${operationId}?**`, (route) => json(route, operationDetail));
  await page.route(`**/v1/transporte/operacoes/${operationId}/conformidade?**`, (route) => json(route, complianceOverview));

  await page.route('**/v1/transporte/seguros/apuracao?**', (route) => json(route, {
    items: [billingPeriod], total: 1, periodMonth: '2026-08'
  }));
  await page.route(`**/v1/transporte/seguros/apuracao/${billingPeriod.id}?**`, (route) => json(route, billingPeriod));

  await page.route('**/v1/transporte/gr/screenings?**', (route) => json(route, {
    items: [{
      id: 'grscr_journey_1',
      integrationAccountId,
      subjectType: 'driver',
      driverId: 'trdrv_journey_1',
      vehicleId: null,
      provider: 'sandbox',
      status: 'completed',
      outcome: 'approved',
      validUntil: '2026-11-30',
      result: {},
      createdAt: '2026-08-12T10:00:00.000Z',
      updatedAt: '2026-08-12T10:00:00.000Z'
    }],
    total: 1
  }));
}

/** A vertical desligada (default de fábrica) redireciona para /dashboard. */
function skipWhenFeatureOff(page, expectedPath) {
  test.skip(
    !page.url().includes(expectedPath),
    `VITE_FEATURE_TRANSPORTE está desligada neste ambiente (default off) — ${expectedPath} redirecionou para /dashboard.`
  );
}

test.describe('Jornada do Transportador (Módulo Transportadora, onda F9)', () => {
  test.beforeEach(async ({ page }) => {
    await setupAuthenticatedSession(page);
    await mockSession(page);
    await mockTransporte(page);
  });

  test('home → checklist → habilitação → registrar viagem → seguro da viagem → apuração', async ({ page }) => {
    // 1. HOME da persona: o /dashboard ramifica para a home do Transportador.
    await page.goto('/dashboard');
    await page.waitForLoadState('networkidle');
    await expect(page.getByRole('heading', { name: /Olá, Usuario QA Jornada/i })).toBeVisible({ timeout: 15_000 });

    // A home só ramifica para o carrier com a flag ligada; sem ela o resto da
    // jornada não existe (as rotas /transporte/* redirecionam).
    const checklistCard = page.getByText('Deixe sua transportadora pronta');
    test.skip(
      !(await checklistCard.isVisible().catch(() => false)),
      'VITE_FEATURE_TRANSPORTE está desligada neste ambiente (default off) — a home do Transportador não é renderizada.'
    );

    // 2. CHECKLIST → habilitação (destino re-apontado na onda F9).
    await expect(page.getByText('Cadastre sua transportadora')).toBeVisible();
    await page.goto('/transporte/habilitacao');
    await page.waitForLoadState('networkidle');
    skipWhenFeatureOff(page, '/transporte/habilitacao');

    await expect(page.getByRole('heading', { name: /Minha habilitação/i })).toBeVisible();
    await expect(page.getByText(carrier.legalName)).toBeVisible({ timeout: 10_000 });
    await expect(page.getByText(carrier.rntrcNumber)).toBeVisible();
    // Tipologia DERIVADA da frota (5 veículos ⇒ ETC) com a explicação didática.
    await expect(page.getByText(/ETC — Empresa de Transporte de Cargas/i).first()).toBeVisible();
    await expect(page.getByText('O que falta para operar')).toBeVisible();
    await expect(page.getByRole('button', { name: /Verificar agora/i })).toBeVisible();

    // 3. REGISTRAR VIAGEM (a ação primária do hub).
    await page.goto('/transporte/operacoes/nova');
    await page.waitForLoadState('networkidle');
    skipWhenFeatureOff(page, '/transporte/operacoes/nova');
    await expect(page.getByRole('heading', { name: /Registrar viagem/i })).toBeVisible();

    // 4. DETALHE da viagem: o cartão "Seguro da viagem" (onda F7) carrega.
    await page.goto(`/transporte/operacoes/${operationId}`);
    await page.waitForLoadState('networkidle');
    skipWhenFeatureOff(page, `/transporte/operacoes/${operationId}`);
    await expect(page.getByRole('heading', { name: new RegExp(operationSummary.referenceCode, 'i') })).toBeVisible({ timeout: 15_000 });
    await expect(page.getByText('Seguro da viagem')).toBeVisible({ timeout: 10_000 });

    // 5. APURAÇÃO do mês: o custo mínimo prevalecendo sobre a soma dos prêmios.
    await page.goto('/transporte/seguros/apuracao');
    await page.waitForLoadState('networkidle');
    skipWhenFeatureOff(page, '/transporte/seguros/apuracao');
    await expect(page.getByRole('heading', { name: /Apuração mensal/i })).toBeVisible();
    await expect(page.getByText('Valor do mês')).toBeVisible({ timeout: 10_000 });
  });

  test('GR: pesquisas de motorista e veículo em seções separadas', async ({ page }) => {
    await page.goto('/transporte/seguros/gr');
    await page.waitForLoadState('networkidle');
    skipWhenFeatureOff(page, '/transporte/seguros/gr');

    await expect(page.getByRole('heading', { name: /Gerenciamento de risco/i })).toBeVisible();
    await expect(page.getByText('Por que a seguradora exige isto')).toBeVisible();
    // As duas seções existem SEMPRE — é o que revela "nenhum veículo pesquisado".
    await expect(page.getByText('Motoristas', { exact: true })).toBeVisible();
    await expect(page.getByText('Veículos', { exact: true })).toBeVisible();
    await expect(page.getByText('Nenhuma pesquisa de veículo')).toBeVisible({ timeout: 10_000 });
    await expect(page.getByRole('button', { name: /Solicitar pesquisa/i })).toBeVisible();
  });
});

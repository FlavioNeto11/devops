import { expect, test } from '@playwright/test';

const integrationAccountId = 'acc_test_prod';
const sessionContextId = 'ctx_test_01';

const manifests = [
  {
    id: 'man_received_001',
    status: 'submitted',
    externalStatus: 'Recebido',
    manifestNumber: '260010784805',
    externalCode: 'CET-12345',
    externalHashCode: 'hash-man-001',
    expeditionDate: '2026-04-10',
    generator: {
      description: 'Gerador Elegivel',
      document: '12.345.678/0001-90'
    },
    carrier: {
      description: 'Transportadora Teste',
      document: '98.765.432/0001-10'
    },
    receiver: {
      description: 'Destinador Teste',
      document: '11.111.111/0001-11',
      partnerCode: 176163
    },
    externalReference: {
      manNumero: '260010784805',
      manCodigo: 22273911
    }
  },
  {
    id: 'man_saved_001',
    status: 'submitted',
    externalStatus: 'salvo',
    manifestNumber: '260010784806',
    externalCode: 'CET-12346',
    externalHashCode: 'hash-man-002',
    expeditionDate: '2026-04-11',
    generator: {
      description: 'Gerador Recebimento',
      document: '98.765.432/0001-90'
    },
    carrier: {
      description: 'Transportadora Teste',
      document: '98.765.432/0001-10'
    },
    receiver: {
      description: 'Destinador Teste',
      document: '11.111.111/0001-11',
      partnerCode: 176163
    },
    externalReference: {
      manNumero: '260010784806',
      manCodigo: 22273912
    }
  },
  {
    id: 'man_cdf_001',
    status: 'submitted',
    externalStatus: 'Recebido',
    manifestNumber: '260010784807',
    externalCode: 'CET-12347',
    externalHashCode: 'hash-man-003',
    expeditionDate: '2026-04-12',
    cdfEmitidoNumero: 'CDF-2026-999',
    generator: {
      description: 'Gerador Ja Certificado',
      document: '22.222.222/0001-90'
    },
    carrier: {
      description: 'Transportadora Teste',
      document: '98.765.432/0001-10'
    },
    receiver: {
      description: 'Destinador Teste',
      document: '11.111.111/0001-11',
      partnerCode: 176163
    },
    externalReference: {
      manNumero: '260010784807',
      manCodigo: 22273913
    }
  }
];

const certificateItem = {
  id: 'cdf_local_001',
  documentId: 'doc_cdf_001',
  certificateCode: 'CDF-2026-001',
  issuedAt: '2026-04-12T10:30:00.000Z',
  dateFrom: '2026-04-10T00:00:00.000Z',
  dateTo: '2026-04-12T23:59:59.999Z',
  responsibleName: 'Responsavel CDF',
  type: {
    code: '9',
    description: 'CDF'
  }
};

function buildNdjson(events) {
  return `${events.map((event) => JSON.stringify(event)).join('\n')}\n`;
}

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
      partnerDocument: '11.111.111/0001-11',
      partnerName: 'Destinador Teste',
      accountType: 'receiver',
      isActive: true
    }));
    localStorage.setItem('sicat_active_session_context', JSON.stringify({
      sessionContextId: scxId,
      id: scxId,
      integrationAccountId: accId,
      status: 'active'
    }));
    localStorage.setItem('sicat_active_integration_account_id', accId);

    URL.createObjectURL = () => 'blob:mocked-cdf';
    URL.revokeObjectURL = () => {};
  }, { integrationAccountId, sessionContextId });
}

async function mockOperationalContext(page) {
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
          partnerDocument: '11.111.111/0001-11',
          partnerName: 'Destinador Teste',
          accountType: 'receiver',
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
        activeAccountId: 'acc_test_01',
        accounts: [{
          accountId: 'acc_test_01',
          partnerCode: 176163,
          partnerDocument: '11.111.111/0001-11',
          partnerName: 'Destinador Teste',
          accountType: 'receiver',
          isActive: true
        }]
      })
    });
  });
}

test('listagem do destinador protege recebimento e CDF no fluxo novo', async ({ page }) => {
  let manifestSearchReads = 0;
  let manifestReceivePayload = null;
  let cdfGeneratePayload = null;

  await setupAuthenticatedSession(page);
  await mockOperationalContext(page);

  await page.route('**/v1/manifestos?**', async (route) => {
    manifestSearchReads += 1;
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

  await page.route('**/v1/cdf/certificates**', async (route) => {
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({
        items: [certificateItem]
      })
    });
  });

  await page.route('**/v1/manifestos/receive', async (route) => {
    manifestReceivePayload = JSON.parse(route.request().postData() || '{}');
    await route.fulfill({
      status: 202,
      contentType: 'application/json',
      body: JSON.stringify({
        jobId: 'job_receive_001',
        commandId: 'cmd_receive_001',
        operation: 'manifest.receive',
        status: 'queued'
      })
    });
  });

  await page.route('**/v1/cdf/generate', async (route) => {
    cdfGeneratePayload = JSON.parse(route.request().postData() || '{}');
    await route.fulfill({
      status: 202,
      contentType: 'application/json',
      body: JSON.stringify({
        jobId: 'job_generate_001',
        commandId: 'cmd_generate_001',
        operation: 'cdf.generate',
        status: 'queued'
      })
    });
  });

  await page.route('**/v1/cdf/documents/doc_cdf_001**', async (route) => {
    await route.fulfill({
      status: 200,
      contentType: 'application/pdf',
      headers: {
        'content-disposition': 'attachment; filename="cdf-2026-001.pdf"'
      },
      body: 'fake-pdf-content'
    });
  });

  await page.goto('/manifestos');

  await expect(page.getByRole('heading', { level: 2, name: 'Listagem de Manifestos' })).toBeVisible();
  await expect(page.getByRole('heading', { level: 3, name: 'Operacao de CDF na listagem' })).toBeVisible();
  await expect(page.getByText('260010784805')).toBeVisible();
  await expect(page.getByText('260010784806')).toBeVisible();
  await expect(page.getByText('260010784807')).toBeVisible();
  await expect(page.getByText('CDF-2026-001')).toBeVisible();
  await expect(page.getByRole('button', { name: 'Baixar PDF' })).toBeVisible();

  const rows = page.locator('.manifests-results-card tbody tr');
  const receivedRow = rows.filter({ hasText: '260010784805' }).first();
  const savedRow = rows.filter({ hasText: '260010784806' }).first();
  const cdfIssuedRow = rows.filter({ hasText: '260010784807' }).first();

  await receivedRow.getByRole('button', { name: 'Ações' }).click();
  const firstMenu = page.getByRole('menu');
  await expect(firstMenu.getByRole('menuitem', { name: 'Iniciar fluxo CDF' })).toBeVisible();
  await expect(firstMenu.getByRole('menuitem', { name: 'Receber MTR' })).toHaveCount(0);
  await page.keyboard.press('Escape');

  await savedRow.getByRole('button', { name: 'Ações' }).click();
  const secondMenu = page.getByRole('menu');
  await expect(secondMenu.getByRole('menuitem', { name: 'Receber MTR' })).toBeVisible();
  await expect(secondMenu.getByRole('menuitem', { name: 'Iniciar fluxo CDF' })).toHaveCount(0);
  await page.keyboard.press('Escape');

  await cdfIssuedRow.getByRole('button', { name: 'Ações' }).click();
  const thirdMenu = page.getByRole('menu');
  await expect(thirdMenu.getByRole('menuitem', { name: 'Iniciar fluxo CDF' })).toHaveCount(0);
  await page.keyboard.press('Escape');

  await receivedRow.locator('input[type="checkbox"]').check();
  await savedRow.locator('input[type="checkbox"]').check();

  await expect(page.getByText('2 manifesto(s) selecionado(s) para ação em lote.')).toBeVisible();
  await page.getByRole('button', { name: 'Receber selecionados' }).click();
  const receiveDialog = page.getByRole('dialog');
  await expect(receiveDialog.getByText('2 manifesto(s) serao ignorados por nao estarem elegiveis nesta selecao.')).toHaveCount(0);
  await expect(receiveDialog.getByText('1 manifesto(s) serao ignorados por nao estarem elegiveis nesta selecao.')).toBeVisible();
  await receiveDialog.locator('input[type="datetime-local"]').fill('2026-04-12T09:30');
  await receiveDialog.locator('input[type="number"]').fill('3960');
  await receiveDialog.getByRole('button', { name: 'Confirmar recebimento' }).click();

  await expect.poll(() => manifestReceivePayload).not.toBeNull();
  expect(manifestReceivePayload.integrationAccountId).toBe(integrationAccountId);
  expect(manifestReceivePayload.sessionContextId).toBe(sessionContextId);
  expect(manifestReceivePayload.receiptPayload.paaCodigo).toBe(176163);
  expect(manifestReceivePayload.receiptPayload.manifesto.manCodigo).toBe(22273912);
  expect(manifestReceivePayload.receiptPayload.manifesto.manHashCode).toBe('hash-man-002');
  await expect(page.getByText('1 recebimento(s) enfileirado(s) com sucesso. 1 manifesto(s) ficaram bloqueados antes do envio.')).toBeVisible();

  await receivedRow.locator('input[type="checkbox"]').check();
  await savedRow.locator('input[type="checkbox"]').check();
  await cdfIssuedRow.locator('input[type="checkbox"]').check();

  await page.getByRole('button', { name: 'Abrir fluxo CDF' }).click();
  await expect(page.getByText('Selecionados: 1')).toBeVisible();
  await expect(page.getByText('Elegiveis: 1')).toBeVisible();

  await page.locator('#cdf-responsible').fill('3209');
  await page.locator('#cdf-issue-at').fill('2026-04-12T10:00');
  await page.locator('#cdf-date-from').fill('2026-04-10');
  await page.locator('#cdf-date-to').fill('2026-04-12');
  await page.getByRole('button', { name: 'Gerar CDF com selecionados' }).click();

  await expect.poll(() => cdfGeneratePayload).not.toBeNull();
  expect(cdfGeneratePayload.integrationAccountId).toBe(integrationAccountId);
  expect(cdfGeneratePayload.sessionContextId).toBe(sessionContextId);
  expect(cdfGeneratePayload.cdfPayload.parceiroDestinador.parCodigo).toBe(176163);
  expect(cdfGeneratePayload.cdfPayload.listaManifesto).toHaveLength(1);
  expect(cdfGeneratePayload.cdfPayload.listaManifesto[0].manCodigo).toBe(22273911);
  expect(cdfGeneratePayload.cdfPayload.listaParceiroGerador).toEqual([
    { parCnpj: '12345678000190' }
  ]);
  await expect(page.getByText('Geracao de CDF solicitada para 1 manifesto(s). Job job_generate_001 criado com sucesso.')).toBeVisible();

  await page.getByRole('button', { name: 'Baixar PDF' }).click();
  await expect(page.getByText('Download iniciado para o CDF CDF-2026-001.')).toBeVisible();

  expect(manifestSearchReads).toBeGreaterThan(1);
});
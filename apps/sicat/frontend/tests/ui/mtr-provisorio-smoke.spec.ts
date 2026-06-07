import { expect, test } from '@playwright/test';

/**
 * Cadeia: mtr-provisorio-fluxo-base · fase 07-frontend-ux
 * (smoke baseline para a fase 08-qa-validation expandir).
 *
 * Cobertura mínima:
 *  1. Listagem `/mtr-provisorio` carrega autenticado e exibe item mockado.
 *  2. Criação via `/mtr-provisorio/novo` redireciona para `/mtr-provisorio/:id`.
 *  3. Detalhe `/mtr-provisorio/:id` mostra status físico/canônico e expõe
 *     ação de imprimir (em status `submitted`).
 *  4. Banner `MTR_PROVISORIO_PERSISTENCE_NOT_IMPLEMENTED` aparece quando o
 *     backend ainda responde 501 (cenário transitório enquanto a fase 05
 *     não estiver migrada em runtime).
 *  5. Acesso não autenticado redireciona para `/login`.
 *
 * Backend é mockado via `page.route` para isolar a verificação do contrato
 * visual/UX da fase 07. Testes backend reais ficam em `test:api`,
 * `test:integration` e `test:worker`.
 */

const integrationAccountId = 'acc_mtrp_qa_001';
const sessionContextId = 'scx_mtrp_qa_001';
const accountId = 'acc_mtrp_qa_001';

const baseMtr = {
  id: 'mtrp_qa_001',
  integrationAccountId,
  kind: 'provisorio',
  status: 'submitted',
  provisionalNumber: 'PRV-260010999001',
  definitiveManifestId: null,
  attempts: 1,
  version: 2,
  correlationId: 'corr_mtrp_qa_001',
  lastErrorCode: null,
  lastErrorMessage: null,
  createdAt: '2026-04-25T10:00:00.000Z',
  updatedAt: '2026-04-25T10:05:00.000Z',
  payload: {
    jobResults: {
      'manifest.print': null
    }
  }
};

async function setupAuthenticatedSession(page) {
  await page.addInitScript(({ accountId, scxId, accId }) => {
    const expiresAt = new Date(Date.now() + 60 * 60 * 1000).toISOString();
    localStorage.setItem('sicat_session_access_token', 'test-token');
    localStorage.setItem('sicat_session_refresh_token', 'test-refresh-token');
    localStorage.setItem('sicat_session_expires_at', expiresAt);
    localStorage.setItem('sicat_session_user', JSON.stringify({
      name: 'Usuario QA MTR Provisorio',
      email: 'qa-mtrp@test.com',
      userId: 'usr_qa_mtrp_001'
    }));
    localStorage.setItem('sicat_active_cetesb_account', JSON.stringify({
      accountId: accId,
      partnerCode: 176163,
      partnerDocument: '31.913.781/0001-39',
      partnerName: 'Parceiro QA MTR Provisório',
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
          userId: 'usr_qa_mtrp_001',
          name: 'Usuario QA MTR Provisorio',
          email: 'qa-mtrp@test.com',
          roles: ['operator']
        },
        activeAccount: {
          accountId,
          partnerCode: 176163,
          partnerDocument: '31.913.781/0001-39',
          partnerName: 'Parceiro QA MTR Provisório',
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
          partnerName: 'Parceiro QA MTR Provisório',
          accountType: 'generator',
          isActive: true
        }]
      })
    });
  });
}

test.describe('MTR Provisório smoke (cadeia mtr-provisorio-fluxo-base)', () => {
  test('listagem /mtr-provisorio carrega autenticado e exibe item mockado', async ({ page }) => {
    await setupAuthenticatedSession(page);
    await mockSessionContext(page);

    const listRequests: Array<{ integrationAccountId: string | null; status: string | null }> = [];

    await page.route('**/v1/mtr-provisorio?**', async (route) => {
      const url = new URL(route.request().url());
      listRequests.push({
        integrationAccountId: url.searchParams.get('integrationAccountId'),
        status: url.searchParams.get('status')
      });
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          items: [baseMtr],
          page: 1,
          pageSize: 50,
          totalItems: 1,
          totalPages: 1
        })
      });
    });

    await page.goto('/mtr-provisorio');

    await expect(page.getByRole('heading', { name: /Manifestos provisórios/i })).toBeVisible();
    await expect.poll(() => listRequests.length).toBeGreaterThanOrEqual(1);
    await expect(page.getByText(baseMtr.provisionalNumber!)).toBeVisible({ timeout: 10_000 });
  });

  test('criação via /mtr-provisorio/novo redireciona para /mtr-provisorio/:id', async ({ page }) => {
    await setupAuthenticatedSession(page);
    await mockSessionContext(page);

    // Mock dos catálogos do wizard (units, residueClasses, etc.). O componente
    // ManifestCreateForm aplica setCatalogDefaults assumindo o primeiro item
    // de cada coleção, então cada catálogo precisa expor pelo menos um item.
    await page.route('**/v1/catalogs/**', async (route) => {
      const url = new URL(route.request().url());
      const catalogName = url.pathname.split('/').pop() || 'catalog';
      const sample = {
        units: [{ code: 1, name: 'Quilograma', shortName: 'kg' }],
        residueTreatments: [{ code: 10, name: 'Tratamento térmico' }],
        classes: [{ code: 100, name: 'Classe IIA' }],
        residueStates: [{ code: 1, name: 'Sólido' }],
        packagingGroups: [{ code: 5, name: 'Big bag' }],
        residueClasses: [{ code: 731, name: 'Resíduo Classe A', shortName: 'CLASSE-A' }]
      }[catalogName] || [{ code: 1, name: `Item ${catalogName}` }];

      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          catalogName,
          items: sample,
          page: 1,
          pageSize: 200,
          totalItems: sample.length,
          totalPages: 1
        })
      });
    });

    // Mock do search de parceiros (transportador/destinador). O wizard chama
    // duas roles por tipo (carrier→transportador/carrier, receiver→destinador/
    // receiver), então respondemos sempre com o mesmo parceiro mock.
    await page.route('**/v1/partners/search**', async (route) => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          items: [{
            partnerCode: 999001,
            description: 'Parceiro QA Transportador',
            tradeName: 'Parceiro QA',
            document: '12.345.678/0001-90',
            address: { city: 'São Paulo', state: 'SP' }
          }],
          page: 1,
          pageSize: 20,
          totalItems: 1,
          totalPages: 1
        })
      });
    });

    let createPostBody: Record<string, unknown> | null = null;
    await page.route('**/v1/mtr-provisorio', async (route) => {
      if (route.request().method() === 'POST') {
        try {
          createPostBody = JSON.parse(route.request().postData() || '{}') as Record<string, unknown>;
        } catch {
          createPostBody = null;
        }
        await route.fulfill({
          status: 202,
          contentType: 'application/json',
          body: JSON.stringify({
            id: baseMtr.id,
            commandId: 'cmd_mtrp_qa_001',
            jobId: 'job_mtrp_qa_001',
            status: 'queued_submit'
          })
        });
        return;
      }
      await route.continue();
    });

    await page.route(`**/v1/mtr-provisorio/${baseMtr.id}`, async (route) => {
      if (route.request().method() === 'GET') {
        await route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify({ ...baseMtr, status: 'queued_submit' })
        });
        return;
      }
      await route.continue();
    });

    await page.goto('/mtr-provisorio/novo');

    await expect(page.getByRole('heading', { name: /Criar MTR provisório/i })).toBeVisible();

    // Etapa 1 — Contexto: completa o responsável e avança.
    await page.getByLabel(/Respons[áa]vel/i).first().fill('Operador QA');
    await page.getByTestId('wizard-next-step').click();

    // Etapa 2 — Participantes: seleciona transportador e destinador via
    // FilterableDropdown (input de filtro + clique na sugestão).
    const carrierField = page.locator('.wizard-dropdown-field', { hasText: 'Transportador' });
    await carrierField.locator('input').first().fill('Parceiro');
    await page.getByRole('option').first().click();

    const receiverField = page.locator('.wizard-dropdown-field', { hasText: 'Destinador' });
    await receiverField.locator('input').first().fill('Parceiro');
    await page.getByRole('option').first().click();

    await page.getByTestId('wizard-next-step').click();

    // Etapa 3 — Resíduo: defaults de catálogo já preenchidos por setCatalogDefaults.
    await page.getByTestId('wizard-next-step').click();

    // Etapa 4 — Revisão: dispara o submit. Em modo singleOnly não existe
    // botão "Criar e submeter agora"; o botão primário (data-testid
    // wizard-submit-primary) carrega o rótulo customizado do MTR provisório.
    await page.getByTestId('wizard-submit-primary').click();

    await page.waitForURL(`**/mtr-provisorio/${baseMtr.id}`, { timeout: 15_000 });
    expect(page.url()).toContain(`/mtr-provisorio/${baseMtr.id}`);
    expect(createPostBody).not.toBeNull();
    expect((createPostBody as { responsibleName?: string } | null)?.responsibleName).toBe('Operador QA');
  });

  test('detalhe /mtr-provisorio/:id mostra status submitted e expõe imprimir', async ({ page }) => {
    await setupAuthenticatedSession(page);
    await mockSessionContext(page);

    await page.route(`**/v1/mtr-provisorio/${baseMtr.id}`, async (route) => {
      if (route.request().method() === 'GET') {
        await route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify(baseMtr)
        });
        return;
      }
      await route.continue();
    });

    await page.goto(`/mtr-provisorio/${baseMtr.id}`);

    await expect(page.getByRole('heading', { name: new RegExp(baseMtr.id, 'i') })).toBeVisible({ timeout: 10_000 });
    await expect(page.getByText(baseMtr.provisionalNumber!)).toBeVisible();
    await expect(page.getByRole('button', { name: /Imprimir/i })).toBeEnabled();
  });

  test('banner MTR_PROVISORIO_PERSISTENCE_NOT_IMPLEMENTED aparece quando GET retorna 501', async ({ page }) => {
    await setupAuthenticatedSession(page);
    await mockSessionContext(page);

    await page.route(`**/v1/mtr-provisorio/${baseMtr.id}`, async (route) => {
      if (route.request().method() === 'GET') {
        await route.fulfill({
          status: 501,
          contentType: 'application/problem+json',
          body: JSON.stringify({
            type: 'about:blank',
            title: 'MTR provisório persistence not implemented',
            status: 501,
            code: 'MTR_PROVISORIO_PERSISTENCE_NOT_IMPLEMENTED',
            detail: 'Persistência MTR provisório ainda não está ativa em runtime.'
          })
        });
        return;
      }
      await route.continue();
    });

    await page.goto(`/mtr-provisorio/${baseMtr.id}`);

    await expect(page.getByText(/Persistência MTR provisório pendente/i)).toBeVisible({ timeout: 10_000 });
  });

  test('acesso não autenticado redireciona para /login', async ({ page }) => {
    await page.goto('/mtr-provisorio');
    await page.waitForURL(/\/login/, { timeout: 10_000 });
    expect(page.url()).toMatch(/\/login/);
  });

  // -------------------------------------------------------------------------
  // Cenários adicionais — fase 08-qa-validation (cadeia mtr-provisorio-fluxo-base)
  //
  // Cobrem o §7.2 de docs/handoffs/mtr-provisorio-fluxo-base/07-frontend-ux.md:
  //  - filtro `failed_submit` exibe badge canônico resolvido por hint;
  //  - cancelar `draft` via dialog atualiza para `cancelled`;
  //  - imprimir após `submitted` exibe `commandId`/`jobId` no feedback;
  //  - chip "Documento disponível" quando `payload.jobResults['manifest.print']`
  //    contém `documentUrl`;
  //  - 400 `MTR_PROVISORIO_PAYLOAD_INVALID` exibe a mensagem amigável do helper.
  //
  // Nenhum cenário ataca backend real — todos isolam a camada Vue 3 via mocks.
  // -------------------------------------------------------------------------

  test('lista filtrada por failed_submit exibe badge canônico failed_remote_auth', async ({ page }) => {
    await setupAuthenticatedSession(page);
    await mockSessionContext(page);

    const failedItem = {
      ...baseMtr,
      id: 'mtrp_qa_failed_auth',
      status: 'failed_submit',
      lastErrorCode: 'CETESB_AUTH_INVALID',
      lastErrorMessage: 'Sessão CETESB expirada.'
    };

    const listRequests: Array<{ status: string | null }> = [];
    await page.route('**/v1/mtr-provisorio?**', async (route) => {
      const url = new URL(route.request().url());
      listRequests.push({ status: url.searchParams.get('status') });
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          items: [failedItem],
          page: 1,
          pageSize: 50,
          totalItems: 1,
          totalPages: 1
        })
      });
    });

    await page.goto('/mtr-provisorio?status=failed_submit');
    await expect(page.getByRole('heading', { name: /Manifestos provisórios/i })).toBeVisible();

    // Aplica filtro `status=failed_submit` via Vuetify v-select (combobox).
    const statusSelect = page.getByRole('combobox').first();
    await statusSelect.click();
    await page.getByRole('option', { name: 'Falha no envio' }).first().click();
    await page.getByRole('button', { name: /^Buscar$/i }).click();

    await expect.poll(() => listRequests.length).toBeGreaterThanOrEqual(2);
    const filtered = listRequests.filter((entry) => entry.status === 'failed_submit');
    expect(filtered.length).toBeGreaterThanOrEqual(1);

    // Badge canônico resolvido por hint AUTH em lastErrorCode → failed_remote_auth.
    const badge = page.locator('[data-status="failed_remote_auth"]').first();
    await expect(badge).toBeVisible({ timeout: 10_000 });
    await expect(badge).toContainText('Falha no envio');
  });

  test('cancelar rascunho via dialog atualiza para status cancelled', async ({ page }) => {
    await setupAuthenticatedSession(page);
    await mockSessionContext(page);

    const draftId = 'mtrp_qa_draft_001';
    const draftMtr = {
      ...baseMtr,
      id: draftId,
      status: 'draft',
      provisionalNumber: null,
      lastErrorCode: null,
      lastErrorMessage: null,
      payload: { jobResults: {} }
    };

    let cancelCalls = 0;
    await page.route(`**/v1/mtr-provisorio/${draftId}`, async (route) => {
      const method = route.request().method();
      if (method === 'GET') {
        await route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify(draftMtr)
        });
        return;
      }
      if (method === 'DELETE') {
        cancelCalls += 1;
        await route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify({ id: draftId, status: 'cancelled' })
        });
        return;
      }
      await route.continue();
    });

    await page.goto(`/mtr-provisorio/${draftId}`);
    await expect(page.getByRole('heading', { name: new RegExp(draftId, 'i') })).toBeVisible({ timeout: 10_000 });

    const cancelBtn = page.getByRole('button', { name: /Cancelar rascunho/i });
    await expect(cancelBtn).toBeEnabled();
    await cancelBtn.click();

    await page.getByRole('button', { name: /Confirmar cancelamento/i }).click();

    await expect(page.getByText(/MTR provisório cancelado\./i)).toBeVisible({ timeout: 10_000 });
    expect(cancelCalls).toBe(1);
  });

  test('imprimir após submitted expõe commandId e jobId no feedback', async ({ page }) => {
    await setupAuthenticatedSession(page);
    await mockSessionContext(page);

    const id = baseMtr.id;
    const expectedCommandId = 'cmd_mtrp_qa_print_001';
    const expectedJobId = 'job_mtrp_qa_print_001';

    let printCalls = 0;
    await page.route(`**/v1/mtr-provisorio/${id}/print`, async (route) => {
      if (route.request().method() === 'POST') {
        printCalls += 1;
        await route.fulfill({
          status: 202,
          contentType: 'application/json',
          body: JSON.stringify({
            id,
            commandId: expectedCommandId,
            jobId: expectedJobId,
            status: 'queued_print'
          })
        });
        return;
      }
      await route.continue();
    });

    await page.route(`**/v1/mtr-provisorio/${id}`, async (route) => {
      if (route.request().method() === 'GET') {
        await route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify(baseMtr)
        });
        return;
      }
      await route.continue();
    });

    await page.goto(`/mtr-provisorio/${id}`);
    await expect(page.getByRole('button', { name: /^Imprimir$/i })).toBeEnabled();

    await page.getByRole('button', { name: /^Imprimir$/i }).click();
    await page.getByRole('button', { name: /Confirmar impressão/i }).click();

    await expect(page.getByText(/Impressão do MTR provisório enfileirada\./i)).toBeVisible({ timeout: 10_000 });
    await expect(page.getByText(`commandId: ${expectedCommandId}`)).toBeVisible();
    await expect(page.getByText(`jobId: ${expectedJobId}`)).toBeVisible();
    expect(printCalls).toBe(1);
  });

  test('chip "Documento disponível" aparece quando jobResults[manifest.print] retorna documentUrl', async ({ page }) => {
    await setupAuthenticatedSession(page);
    await mockSessionContext(page);

    const printedId = 'mtrp_qa_printed_001';
    const printedMtr = {
      ...baseMtr,
      id: printedId,
      status: 'submitted',
      payload: {
        jobResults: {
          'manifest.print': {
            documentUrl: 'https://storage.example.com/mtr-provisorio/printed.pdf',
            success: true
          }
        }
      }
    };

    await page.route(`**/v1/mtr-provisorio/${printedId}`, async (route) => {
      if (route.request().method() === 'GET') {
        await route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify(printedMtr)
        });
        return;
      }
      await route.continue();
    });

    await page.goto(`/mtr-provisorio/${printedId}`);
    await expect(page.getByRole('heading', { name: new RegExp(printedId, 'i') })).toBeVisible({ timeout: 10_000 });
    await expect(page.getByText(/Documento disponível/i)).toBeVisible();
  });

  test('400 MTR_PROVISORIO_PAYLOAD_INVALID exibe mensagem amigável do helper', async ({ page }) => {
    await setupAuthenticatedSession(page);
    await mockSessionContext(page);

    const detailMessage = 'Campo expeditionDate ausente — corrija e tente novamente.';

    await page.route('**/v1/mtr-provisorio', async (route) => {
      if (route.request().method() === 'POST') {
        await route.fulfill({
          status: 400,
          contentType: 'application/problem+json',
          body: JSON.stringify({
            type: 'about:blank',
            title: 'MTR provisório payload inválido',
            status: 400,
            code: 'MTR_PROVISORIO_PAYLOAD_INVALID',
            detail: detailMessage
          })
        });
        return;
      }
      await route.continue();
    });

    await page.goto('/mtr-provisorio/novo');
    await expect(page.getByRole('heading', { name: /Criar MTR provisório/i })).toBeVisible();

    await page.getByLabel(/Responsável \*/i).fill('Operador QA');
    await page.getByRole('button', { name: /Criar MTR provisório/i }).click();

    await expect(page.getByText(detailMessage, { exact: false })).toBeVisible({ timeout: 10_000 });
  });

  // -------------------------------------------------------------------------
  // Cenário adicional — fase 08-qa-validation (cadeia mtr-provisorio-wizard-frontend)
  //
  // Cobre o fluxo wizard end-to-end navegando todas as 4 etapas e recebendo
  // problem+json `MTR_PROVISORIO_PAYLOAD_INVALID` no POST final, verificando
  // que a mensagem amigável é renderizada no banner `mtrp-create-error` e que
  // o wizard NÃO redireciona para a página de detalhe.
  // -------------------------------------------------------------------------

  test('wizard end-to-end retorna problem+json PAYLOAD_INVALID no POST final e exibe banner amigável', async ({ page }) => {
    await setupAuthenticatedSession(page);
    await mockSessionContext(page);

    const detailMessage = 'expeditionDate ausente — corrija e reenvie o MTR provisório.';

    // Catálogos do wizard (paridade com cenário 2 — defaults via primeiro item).
    await page.route('**/v1/catalogs/**', async (route) => {
      const url = new URL(route.request().url());
      const catalogName = url.pathname.split('/').pop() || 'catalog';
      const sample = {
        units: [{ code: 1, name: 'Quilograma', shortName: 'kg' }],
        residueTreatments: [{ code: 10, name: 'Tratamento térmico' }],
        classes: [{ code: 100, name: 'Classe IIA' }],
        residueStates: [{ code: 1, name: 'Sólido' }],
        packagingGroups: [{ code: 5, name: 'Big bag' }],
        residueClasses: [{ code: 731, name: 'Resíduo Classe A', shortName: 'CLASSE-A' }]
      }[catalogName] || [{ code: 1, name: `Item ${catalogName}` }];

      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          catalogName,
          items: sample,
          page: 1,
          pageSize: 200,
          totalItems: sample.length,
          totalPages: 1
        })
      });
    });

    // Mock partner search — devolve um parceiro fixo para transportador e destinador.
    await page.route('**/v1/partners/search**', async (route) => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          items: [{
            partnerCode: 999002,
            description: 'Parceiro QA Wizard',
            tradeName: 'Parceiro QA Wizard',
            document: '98.765.432/0001-10',
            address: { city: 'São Paulo', state: 'SP' }
          }],
          page: 1,
          pageSize: 20,
          totalItems: 1,
          totalPages: 1
        })
      });
    });

    let postCalls = 0;
    await page.route('**/v1/mtr-provisorio', async (route) => {
      if (route.request().method() === 'POST') {
        postCalls += 1;
        await route.fulfill({
          status: 400,
          contentType: 'application/problem+json',
          body: JSON.stringify({
            type: 'about:blank',
            title: 'MTR provisório payload inválido',
            status: 400,
            code: 'MTR_PROVISORIO_PAYLOAD_INVALID',
            detail: detailMessage
          })
        });
        return;
      }
      await route.continue();
    });

    await page.goto('/mtr-provisorio/novo');
    await expect(page.getByRole('heading', { name: /Criar MTR provisório/i })).toBeVisible();

    // Etapa 1 — Contexto.
    await page.getByLabel(/Respons[áa]vel/i).first().fill('Operador QA Wizard');
    await page.getByTestId('wizard-next-step').click();

    // Etapa 2 — Participantes via FilterableDropdown (opção é <button class="filterable-dropdown-option">).
    const carrierField = page.locator('.wizard-dropdown-field', { hasText: 'Transportador' });
    await carrierField.locator('input').first().fill('Parceiro');
    await carrierField.locator('.filterable-dropdown-option').first().click();

    const receiverField = page.locator('.wizard-dropdown-field', { hasText: 'Destinador' });
    await receiverField.locator('input').first().fill('Parceiro');
    await receiverField.locator('.filterable-dropdown-option').first().click();

    await page.getByTestId('wizard-next-step').click();

    // Etapa 3 — Resíduo: defaults preenchidos por setCatalogDefaults via mocks acima.
    await page.getByTestId('wizard-next-step').click();

    // Etapa 4 — Revisão: dispara o POST que devolve 400 problem+json.
    await page.getByTestId('wizard-submit-primary').click();

    // Banner amigável renderizado por describeMtrProvisorioError (detail do problem+json).
    const errorBanner = page.getByTestId('mtrp-create-error');
    await expect(errorBanner).toBeVisible({ timeout: 10_000 });
    await expect(errorBanner).toContainText(detailMessage);

    // Confirma POST chegou e que NÃO houve redirecionamento para detalhe.
    expect(postCalls).toBe(1);
    expect(page.url()).toContain('/mtr-provisorio/novo');
  });
});

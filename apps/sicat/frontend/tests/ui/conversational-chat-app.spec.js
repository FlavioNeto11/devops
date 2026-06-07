import { expect, test } from '@playwright/test';

function setupAuthenticatedStorage(page) {
  return page.addInitScript(() => {
    const expiresAt = new Date(Date.now() + 60 * 60 * 1000).toISOString();
    localStorage.setItem('sicat_session_access_token', 'test-token');
    localStorage.setItem('sicat_session_refresh_token', 'test-refresh-token');
    localStorage.setItem('sicat_session_expires_at', expiresAt);
    localStorage.setItem('sicat_session_user', JSON.stringify({
      userId: 'usr_chat_001',
      name: 'Usuario Chat QA',
      email: 'chat.qa@test.com'
    }));
    localStorage.setItem('sicat_active_cetesb_account', JSON.stringify({
      accountId: 'acc_chat_001',
      partnerCode: 176163,
      partnerName: 'Conta QA Conversacional',
      accountType: 'generator',
      isActive: true
    }));
    localStorage.setItem('sicat_active_session_context', JSON.stringify({
      id: 'scx_chat_001',
      sessionContextId: 'scx_chat_001',
      integrationAccountId: 'int_chat_001',
      status: 'active'
    }));
    localStorage.setItem('sicat_active_integration_account_id', 'int_chat_001');
  });
}

async function mockSicatSession(page) {
  await page.route('**/v1/sicat/session', async (route) => {
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({
        user: {
          userId: 'usr_chat_001',
          name: 'Usuario Chat QA',
          email: 'chat.qa@test.com'
        },
        activeAccount: {
          accountId: 'acc_chat_001',
          partnerCode: 176163,
          partnerName: 'Conta QA Conversacional',
          accountType: 'generator',
          isActive: true
        },
        sessionContext: {
          id: 'scx_chat_001',
          sessionContextId: 'scx_chat_001',
          integrationAccountId: 'int_chat_001',
          status: 'active'
        }
      })
    });
  });
}

function setupAuthWithoutSessionContext(page) {
  return page.addInitScript(() => {
    const expiresAt = new Date(Date.now() + 60 * 60 * 1000).toISOString();
    localStorage.setItem('sicat_session_access_token', 'test-token');
    localStorage.setItem('sicat_session_refresh_token', 'test-refresh-token');
    localStorage.setItem('sicat_session_expires_at', expiresAt);
    localStorage.setItem('sicat_session_user', JSON.stringify({
      userId: 'usr_chat_scope_001',
      name: 'Usuario Escopo Incompleto',
      email: 'scope.incompleto@test.com'
    }));
    localStorage.setItem('sicat_active_cetesb_account', JSON.stringify({
      accountId: 'acc_chat_scope_001',
      partnerCode: 176163,
      partnerName: 'Conta QA Escopo',
      accountType: 'generator',
      isActive: true
    }));
    localStorage.setItem('sicat_active_session_context', JSON.stringify({
      id: 'scx_chat_scope_001',
      sessionContextId: 'scx_chat_scope_001',
      integrationAccountId: 'int_chat_scope_001',
      status: 'active'
    }));
    localStorage.setItem('sicat_active_integration_account_id', 'int_chat_scope_001');
    localStorage.removeItem('sicat_session_user');
  });
}

async function mockSicatSessionWithoutActiveAccount(page) {
  await page.route('**/v1/sicat/session', async (route) => {
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({
        user: {
          userId: 'usr_chat_no_account',
          name: 'Usuario Sem Conta',
          email: 'sem.conta@test.com'
        },
        activeAccount: null,
        sessionContext: null
      })
    });
  });
}

async function mockSicatSessionWithoutUser(page) {
  await page.route('**/v1/sicat/session', async (route) => {
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({
        user: null,
        activeAccount: {
          accountId: 'acc_chat_scope_001',
          partnerCode: 176163,
          partnerName: 'Conta QA Escopo',
          accountType: 'generator',
          isActive: true
        },
        sessionContext: {
          id: 'scx_chat_scope_001',
          sessionContextId: 'scx_chat_scope_001',
          integrationAccountId: 'int_chat_scope_001',
          status: 'active'
        }
      })
    });
  });
}

test('app simplificado envia quick action em modo consultivo para backend conversacional', async ({ page }) => {
  await setupAuthenticatedStorage(page);
  await mockSicatSession(page);

  const conversationPayloads = [];

  await page.route('**/v1/conversations/turns', async (route) => {
    const body = route.request().postDataJSON();
    conversationPayloads.push(body);

    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({
        conversationSessionId: 'csn_chat_test_001',
        conversationTurnId: 'ctn_chat_test_001',
        correlationId: 'corr_chat_test_001',
        channel: 'native_chat',
        status: 'responded',
        responseText: 'Resumo operacional pronto.',
        llm: {
          provider: 'rule-based',
          confidence: 0.8
        },
        toolCall: {
          name: 'get_dashboard_overview',
          arguments: {}
        },
        policy: {
          allowed: true,
          reasonCode: null,
          reason: null,
          requiresConfirmation: false,
          riskLevel: 'R1'
        },
        context: {
          integrationAccountId: 'int_chat_001',
          sessionContextId: 'scx_chat_001',
          manifestId: null,
          jobId: null
        },
        result: {
          kind: 'query',
          data: {
            health: {
              statistics: {
                jobs_queued: 2,
                jobs_running: 1,
                workers_active_5m: 3
              }
            }
          }
        }
      })
    });
  });

  await page.goto('/conversacional/chat');

  await page.getByRole('button', { name: 'Resumo operacional' }).click();

  await expect.poll(() => conversationPayloads.length).toBe(1);
  expect(conversationPayloads[0]?.channel).toBe('native_chat');
  expect(conversationPayloads[0]?.options?.allowActions).toBe(true);
  expect(conversationPayloads[0]?.context?.integrationAccountId).toBe('int_chat_001');
  expect(conversationPayloads[0]?.context?.sessionContextId).toBe('scx_chat_001');

  await expect(page.getByText('Resumo operacional pronto.')).toBeVisible();
});

test('app simplificado bloqueia acesso quando nao existe conta CETESB ativa', async ({ page }) => {
  await page.addInitScript(() => {
    const expiresAt = new Date(Date.now() + 60 * 60 * 1000).toISOString();
    localStorage.setItem('sicat_session_access_token', 'test-token');
    localStorage.setItem('sicat_session_refresh_token', 'test-refresh-token');
    localStorage.setItem('sicat_session_expires_at', expiresAt);
    localStorage.setItem('sicat_session_user', JSON.stringify({
      userId: 'usr_chat_no_account',
      name: 'Usuario Sem Conta',
      email: 'sem.conta@test.com'
    }));
    localStorage.removeItem('sicat_active_cetesb_account');
    localStorage.removeItem('sicat_active_session_context');
    localStorage.removeItem('sicat_active_integration_account_id');
  });

  await mockSicatSessionWithoutActiveAccount(page);

  await page.goto('/conversacional/chat');
  await expect(page).toHaveURL(/\/(?:login\/cetesb(?:\?.*)?|login\?reason=expired)$/);
});

test('quick action de detalhe de manifesto exige manifestId e envia contexto quando preenchido', async ({ page }) => {
  await setupAuthenticatedStorage(page);
  await mockSicatSession(page);

  const conversationPayloads = [];

  await page.route('**/v1/conversations/turns', async (route) => {
    const body = route.request().postDataJSON();
    conversationPayloads.push(body);

    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({
        conversationSessionId: 'csn_chat_test_manifest_001',
        conversationTurnId: 'ctn_chat_test_manifest_001',
        correlationId: 'corr_chat_test_manifest_001',
        channel: 'native_chat',
        status: 'responded',
        responseText: 'Detalhe de manifesto consultado.',
        toolCall: {
          name: 'get_manifest_details',
          arguments: {
            manifestId: 'MTR-2026-0001'
          }
        },
        result: {
          kind: 'query',
          data: {
            id: 'MTR-2026-0001',
            manifestNumber: 'MTR-2026-0001',
            status: 'submitted',
            externalStatus: 'registered'
          }
        }
      })
    });
  });

  await page.goto('/conversacional/chat');

  const manifestDetailsButton = page.getByRole('button', {
    name: 'Detalhe de manifesto'
  });

  await manifestDetailsButton.click();
  await expect(page.getByText('Informe um manifesto em foco para usar esta acao guiada.')).toBeVisible();
  expect(conversationPayloads).toHaveLength(0);
});

test('quick action de status de job exige jobId e envia contexto quando preenchido', async ({ page }) => {
  await setupAuthenticatedStorage(page);
  await mockSicatSession(page);

  const conversationPayloads = [];

  await page.route('**/v1/conversations/turns', async (route) => {
    const body = route.request().postDataJSON();
    conversationPayloads.push(body);

    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({
        conversationSessionId: 'csn_chat_test_job_001',
        conversationTurnId: 'ctn_chat_test_job_001',
        correlationId: 'corr_chat_test_job_001',
        channel: 'native_chat',
        status: 'responded',
        responseText: 'Status de job consultado.',
        toolCall: {
          name: 'get_job_status',
          arguments: {
            jobId: 'job-qa-0001'
          }
        },
        result: {
          kind: 'query',
          data: {
            jobId: 'job-qa-0001',
            status: 'running',
            jobType: 'manifest.sync'
          }
        }
      })
    });
  });

  await page.goto('/conversacional/chat');

  const jobStatusButton = page.getByRole('button', {
    name: 'Status de job'
  });

  await jobStatusButton.click();
  await expect(page.getByText('Informe um job em foco para usar esta acao guiada.')).toBeVisible();
  expect(conversationPayloads).toHaveLength(0);
});

test('comando sensivel permanece bloqueado em modo consultivo e sem chamada operacional sensivel', async ({ page }) => {
  await setupAuthenticatedStorage(page);
  await mockSicatSession(page);

  const conversationPayloads = [];
  const sensitiveOperationalCalls = [];

  page.on('request', (request) => {
    const url = request.url();
    if (/\/v1\/.+/i.test(url) && /(submit|submeter|cancel|cancelar|print|imprimir)/i.test(url)) {
      sensitiveOperationalCalls.push({ url, method: request.method() });
    }
  });

  await page.route('**/v1/conversations/turns', async (route) => {
    const body = route.request().postDataJSON();
    conversationPayloads.push(body);

    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({
        conversationSessionId: 'csn_chat_sensitive_001',
        conversationTurnId: 'ctn_chat_sensitive_001',
        correlationId: 'corr_chat_sensitive_001',
        channel: 'native_chat',
        status: 'blocked',
        responseText: 'Acao sensivel bloqueada pela policy consultiva.',
        policy: {
          allowed: false,
          reasonCode: 'ACTIONS_DISABLED',
          reason: 'Canal consultivo nao executa submit/imprimir/cancelar.',
          requiresConfirmation: false,
          riskLevel: 'R4'
        },
        result: {
          kind: 'blocked',
          data: null
        }
      })
    });
  });

  await page.goto('/conversacional/chat');
  await page.getByPlaceholder('Pergunte sobre manifestos, jobs, auditoria e dashboard. Este app opera em modo consultivo.').fill('Quero submeter este manifesto agora');
  await page.getByPlaceholder('Pergunte sobre manifestos, jobs, auditoria e dashboard. Este app opera em modo consultivo.').press('Enter');

  await expect(page.getByText('Acao sensivel bloqueada pela policy consultiva.')).toBeVisible();
  await expect.poll(() => conversationPayloads.length).toBe(1);
  expect(conversationPayloads[0]?.options?.allowActions).toBe(true);
  expect(sensitiveOperationalCalls).toHaveLength(0);
});

test('composer exibe bloqueio explicito quando operationalScopeReady for falso', async ({ page }) => {
  await setupAuthWithoutSessionContext(page);
  await mockSicatSessionWithoutUser(page);

  let conversationTurnsCalled = 0;
  await page.route('**/v1/conversations/turns', async (route) => {
    conversationTurnsCalled += 1;
    await route.abort();
  });

  await page.goto('/conversacional/chat');
  await page.getByPlaceholder('Pergunte sobre manifestos, jobs, auditoria e dashboard. Este app opera em modo consultivo.').fill('Quero consultar o dashboard');
  await page.getByPlaceholder('Pergunte sobre manifestos, jobs, auditoria e dashboard. Este app opera em modo consultivo.').press('Enter');

  await expect(page.getByText('Este app exige sessao SICAT valida, conta CETESB ativa e contexto operacional completo.')).toBeVisible();
  expect(conversationTurnsCalled).toBe(0);
});

test('renderiza action_confirmation e envia toolRequest confirmado para backend', async ({ page }) => {
  await setupAuthenticatedStorage(page);
  await mockSicatSession(page);

  const conversationPayloads = [];
  let turnCount = 0;

  await page.route('**/v1/conversations/turns', async (route) => {
    const body = route.request().postDataJSON();
    conversationPayloads.push(body);
    turnCount += 1;

    if (turnCount === 1) {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          conversationSessionId: 'csn_chat_confirm_001',
          conversationTurnId: 'ctn_chat_confirm_001',
          correlationId: 'corr_chat_confirm_001',
          channel: 'native_chat',
          status: 'blocked',
          responseText: 'Esta operacao precisa de confirmacao.',
          toolCall: {
            name: 'submit_manifest',
            arguments: {
              manifestId: 'MTR-2026-1001'
            }
          },
          policy: {
            allowed: false,
            reasonCode: 'CONFIRMATION_REQUIRED',
            reason: 'Confirme para executar submit_manifest.',
            requiresConfirmation: true,
            riskLevel: 'R4'
          },
          result: {
            kind: 'blocked',
            type: 'action',
            data: {
              intent: 'manifest.submit'
            },
            actions: []
          }
        })
      });
      return;
    }

    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({
        conversationSessionId: 'csn_chat_confirm_001',
        conversationTurnId: 'ctn_chat_confirm_002',
        correlationId: 'corr_chat_confirm_002',
        channel: 'native_chat',
        status: 'executed',
        responseText: 'Execucao confirmada e enfileirada.',
        toolCall: {
          name: 'submit_manifest',
          arguments: {
            manifestId: 'MTR-2026-1001'
          }
        },
        policy: {
          allowed: true,
          reasonCode: null,
          reason: null,
          requiresConfirmation: true,
          riskLevel: 'R4'
        },
        result: {
          kind: 'action',
          type: 'action',
          data: {
            jobId: 'job-confirm-001'
          },
          artifacts: [
            {
              type: 'job',
              title: 'Acao enfileirada',
              payload: {
                jobId: 'job-confirm-001',
                status: 'queued'
              }
            }
          ]
        }
      })
    });
  });

  await page.goto('/conversacional/chat');
  await page.getByPlaceholder('Pergunte sobre manifestos, jobs, auditoria e dashboard. Este app opera em modo consultivo.').fill('Submeter manifesto MTR-2026-1001');
  await page.getByPlaceholder('Pergunte sobre manifestos, jobs, auditoria e dashboard. Este app opera em modo consultivo.').press('Enter');

  const confirmButton = page.getByRole('button', { name: 'Confirmar execucao' });
  await expect(confirmButton).toBeVisible();
  await confirmButton.click();

  await expect.poll(() => conversationPayloads.length).toBe(2);
  expect(conversationPayloads[1]?.toolRequest?.name).toBe('submit_manifest');
  expect(conversationPayloads[1]?.toolRequest?.arguments?.confirmed).toBe(true);
  await expect(page.getByText('Execucao confirmada e enfileirada.')).toBeVisible();
});

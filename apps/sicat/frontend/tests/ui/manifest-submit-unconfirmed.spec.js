/**
 * PROVA NA TELA do estado "envio sem confirmação" (`submit_unconfirmed`).
 *
 * O teste unitário prova as funções; este prova a TELA — que o badge sai com o
 * tom certo e que "Replicar"/"Submeter" aparecem BLOQUEADOS e com o motivo, em
 * vez de sumirem em silêncio (sumir ensina o operador a tentar por fora, que é
 * como nasce o MTR duplicado).
 *
 * Traz CONTROLE NEGATIVO na mesma tabela: um manifesto confirmado, cujas mesmas
 * ações precisam continuar LIBERADAS. Sem ele, um `disabled` global passaria.
 *
 * A sessão é sempre local (`hasValidToken()` só lê o localStorage), então o
 * guard de rota passa sem backend; a lista vem de `page.route`.
 */

import { test, expect } from '@playwright/test';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

// `test-results/` já é ignorado pelo git (apps/sicat/.gitignore): a captura é
// artefato regerado a cada execução, não arquivo versionado.
const SCREENSHOT_DIR = join(dirname(fileURLToPath(import.meta.url)), '..', '..', 'test-results');

const ACCOUNT = Object.freeze({
  accountId: 'acc_test_01',
  partnerCode: 176163,
  partnerDocument: '31.913.781/0001-39',
  partnerName: 'Nova IT',
  accountType: 'generator',
  isActive: true
});

const partner = (description, partnerCode) => ({ description, partnerCode });
const baseManifest = {
  generator: { document: '31913781000139', description: 'Nova IT', partnerCode: '176163' },
  carrier: partner('CASAMAX COMERCIAL LTDA.', '160627'),
  receiver: partner('MARDAN FIRE ENGENHARIA LTDA.', '40110'),
  expeditionDate: '2026-08-07',
  createdAt: '2026-08-07T12:00:00Z'
};

const ITEMS = [
  // Alvo: envio despachado, desfecho DESCONHECIDO. Vem com hash e números de
  // propósito — é o cenário permissivo em que os ramos genéricos liberavam tudo.
  { ...baseManifest, id: 'mtr_unconf', manifestNumber: '900000001', externalCode: '900001', externalHashCode: 'HASH-UNCONF', status: 'submit_unconfirmed', externalStatus: '' },
  // Controle: envio confirmado. As MESMAS ações têm de seguir liberadas.
  { ...baseManifest, id: 'mtr_ok', manifestNumber: '900000002', externalCode: '900002', externalHashCode: 'HASH-OK', status: 'submitted', externalStatus: 'Salvo' }
];

async function setupAuthenticatedSession(page) {
  await page.addInitScript(() => {
    const expiresAt = new Date(Date.now() + 60 * 60 * 1000).toISOString();
    localStorage.setItem('sicat_session_access_token', 'test-token');
    localStorage.setItem('sicat_session_refresh_token', 'test-refresh-token');
    localStorage.setItem('sicat_session_expires_at', expiresAt);
    localStorage.setItem('sicat_session_user', JSON.stringify({ name: 'Operador U5', email: 'u5@test.com', userId: 'usr_u5' }));
    localStorage.setItem('sicat_active_cetesb_account', JSON.stringify({
      accountId: 'acc_test_01', partnerCode: 176163, partnerDocument: '31.913.781/0001-39',
      partnerName: 'Nova IT', accountType: 'generator', isActive: true
    }));
    localStorage.setItem('sicat_active_account_id', 'acc_test_01');
    localStorage.setItem('sicat_active_session_context', JSON.stringify({
      sessionContextId: 'ctx_u5', id: 'ctx_u5', integrationAccountId: 'acc_test_prod', status: 'active'
    }));
    localStorage.setItem('sicat_active_integration_account_id', 'acc_test_prod');
  });
}

async function stubApi(page) {
  // RegExp, não glob: em glob o `?` de query string é caractere de padrão.
  // Uma rota única evita depender da ordem de precedência entre handlers.
  await page.route(/\/v1\//, async (route) => {
    const url = route.request().url();
    const json = (body) => route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(body) });
    if (/\/v1\/manifestos(\?|$)/.test(url)) {
      return json({ items: ITEMS, totalItems: ITEMS.length, total: ITEMS.length, page: 1, pageSize: 20 });
    }
    // Sessão e contas: obrigatórias. Sem elas a tela para em "Ative uma conta
    // CETESB para buscar manifestos" e NENHUMA linha é pedida.
    if (url.includes('/v1/sicat/session')) {
      return json({
        user: { userId: 'usr_u5', name: 'Operador U5', email: 'u5@test.com', roles: ['operator'] },
        activeAccount: ACCOUNT,
        sessionContext: { sessionContextId: 'ctx_u5', id: 'ctx_u5', integrationAccountId: 'acc_test_prod', status: 'active' }
      });
    }
    if (url.includes('/v1/sicat/cetesb-accounts')) {
      return json({ accounts: [ACCOUNT], activeAccountId: ACCOUNT.accountId });
    }
    // Qualquer outra chamada da tela responde vazio — o alvo aqui é a linha.
    return json({ items: [], totalItems: 0 });
  });
}

/** Abre o kebab da linha e devolve [{ titulo, motivo, desabilitado }]. */
async function openRowMenu(page, manifestNumber) {
  await page.keyboard.press('Escape');
  const row = page.locator('table tbody tr', { hasText: manifestNumber });
  await row.getByRole('button', { name: 'Mais ações do manifesto' }).click();
  const menu = page.locator('.v-overlay--active .v-list').last();
  await expect(menu).toBeVisible();
  return menu;
}

async function readMenu(menu) {
  return menu.locator('.v-list-item').evaluateAll((nodes) => nodes.map((li) => ({
    titulo: li.querySelector('.v-list-item-title')?.textContent.trim() || '',
    motivo: li.querySelector('.v-list-item-subtitle')?.textContent.trim() || null,
    desabilitado: li.classList.contains('v-list-item--disabled') || li.getAttribute('aria-disabled') === 'true'
  })));
}

test('envio sem confirmação: badge amarelo e ações que duplicariam o MTR bloqueadas COM motivo', async ({ page }) => {
  await setupAuthenticatedSession(page);
  await stubApi(page);
  await page.goto('/manifestos');

  const targetRow = page.locator('table tbody tr', { hasText: '900000001' });
  await expect(targetRow).toBeVisible();

  // --- Badge: nem cinza que esconde, nem vermelho que mente. ---
  const badge = targetRow.locator('.sicat-status-badge');
  await expect(badge).toHaveAttribute('data-tone', 'warning');
  await expect(badge).toHaveText('Envio sem confirmação');

  // Controle negativo do badge: os vizinhos NÃO mudaram de tom.
  const controlBadge = page.locator('table tbody tr', { hasText: '900000002' }).locator('.sicat-status-badge');
  await expect(controlBadge).toHaveAttribute('data-tone', 'running');

  // --- Ações do manifesto sem confirmação. ---
  const menu = await openRowMenu(page, '900000001');
  // Espera o menu TERMINAR de pintar: sem isso a captura pega o overlay ainda
  // em transição (retângulo branco) e a "prova" não mostra prova nenhuma.
  await expect(menu.locator('.v-list-item-subtitle').first()).toBeVisible();
  await page.waitForTimeout(400);
  await page.screenshot({ path: join(SCREENSHOT_DIR, 'submit-unconfirmed-acoes-bloqueadas.png'), fullPage: false });
  const items = await readMenu(menu);

  const byTitle = (titulo) => items.find((item) => item.titulo === titulo);

  for (const titulo of ['Replicar', 'Submeter']) {
    const item = byTitle(titulo);
    expect(item, `"${titulo}" tem de CONTINUAR na lista — sumir não explica nada`).toBeTruthy();
    expect(item.desabilitado, `"${titulo}" tem de estar bloqueado`).toBe(true);
    expect(item.motivo).toMatch(/sem confirmação/i);
    expect(item.motivo, `"${titulo}" tem de dizer a consequência`).toMatch(/duplicad/i);
    expect(item.motivo, 'bloqueio sem saída vira beco').toMatch(/Atualizar da CETESB/);
  }

  // Imprimir e Cancelar: bloqueados e com motivo verdadeiro (as frases antigas
  // diriam "ainda nao registrado no SIGOR" / "imprima apos o envio" — mentira).
  for (const titulo of ['Imprimir', 'Cancelar']) {
    const item = byTitle(titulo);
    expect(item.desabilitado, `"${titulo}" tem de estar bloqueado`).toBe(true);
    expect(item.motivo).toMatch(/sem confirmação/i);
  }
  expect(byTitle('Imprimir').motivo).not.toMatch(/apos o envio/i);
  expect(byTitle('Cancelar').motivo).not.toMatch(/nao registrado no SIGOR/i);

  // Não é falha: "Reenviar" e "Remover" não podem sequer aparecer.
  expect(byTitle('Reenviar'), 'reenviar = MTR duplicado').toBeFalsy();
  expect(byTitle('Remover'), 'remover apaga o rastro do órfão').toBeFalsy();
});

test('CONTROLE NEGATIVO: manifesto confirmado na mesma tabela segue com as ações liberadas', async ({ page }) => {
  await setupAuthenticatedSession(page);
  await stubApi(page);
  await page.goto('/manifestos');

  await expect(page.locator('table tbody tr', { hasText: '900000002' })).toBeVisible();
  const menu = await openRowMenu(page, '900000002');
  const items = await readMenu(menu);

  const replicar = items.find((item) => item.titulo === 'Replicar');
  expect(replicar, 'controle: "Replicar" existe no confirmado').toBeTruthy();
  expect(replicar.desabilitado, 'se isto virar true, o bloqueio vazou para todo mundo').toBe(false);
  expect(replicar.motivo).toBeNull();

  const imprimir = items.find((item) => item.titulo === 'Imprimir');
  expect(imprimir.desabilitado).toBe(false);
  const cancelar = items.find((item) => item.titulo === 'Cancelar');
  expect(cancelar.desabilitado).toBe(false);
});

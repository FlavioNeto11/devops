import { expect, test } from '@playwright/test';

/**
 * E2E REAL (ponta a ponta) contra a stack viva (front + back + worker + banco via Docker).
 *
 * Valida o cenário reportado (MARDAN): na grid de manifestos aparecem manifestos de hoje
 * (ex.: 29/05/2026, status "salvo"); no chat conversacional, ao perguntar "qual meu
 * manifesto mais recente", a resposta deve refletir os DADOS ATUAIS e NUNCA o manifesto
 * antigo 260012058818 (28/05).
 *
 * Diferente dos specs mockados (porta 5174), este roda contra a stack real:
 *   - Frontend em SICAT_E2E_BASE_URL (default http://localhost:5173)
 *   - Backend conversacional real (LLM decide sobre evidência atual)
 *
 * Pré-requisitos (NUNCA versionar segredos):
 *   - docker compose no ar (frontend, api, worker, postgres)
 *   - SICAT_TEST_PASSWORD: senha do usuário de teste (lida só do ambiente; nunca hardcode/log)
 *   - SICAT_TEST_EMAIL: e-mail do usuário SICAT (default flavio_padilha_neto@msn.com),
 *     com a conta CETESB MARDAN vinculada e ativa.
 *
 * Sem SICAT_TEST_PASSWORD o teste é PULADO (não falha o CI e não expõe segredo).
 * Execução: SICAT_TEST_PASSWORD=*** npx playwright test conversational-recency-live.spec.js
 */

const BASE_URL = (process.env.SICAT_E2E_BASE_URL || 'http://localhost:5173').replace(/\/$/, '');
const EMAIL = process.env.SICAT_TEST_EMAIL || 'flavio_padilha_neto@msn.com';
const PASSWORD = process.env.SICAT_TEST_PASSWORD || '';
const ACCOUNT_HINT = process.env.SICAT_TEST_ACCOUNT || 'MARDAN';
const STALE_MANIFEST = '260012058818'; // 28/05 — NÃO pode ser apresentado como "mais recente"

const CHAT_PLACEHOLDER = /Pergunte sobre manifestos/i;

test.describe('chat: recência reflete dados atuais (E2E real contra a stack)', () => {
  test.skip(!PASSWORD, 'Defina SICAT_TEST_PASSWORD (e o usuário/conta MARDAN ativos) para rodar o E2E real.');

  test('a resposta de "manifesto mais recente" usa dados atuais e nunca o 260012058818', async ({ page }) => {
    // 1) LOGIN real (a senha vive só em memória; jamais é logada/printada)
    await page.goto(`${BASE_URL}/login`);
    await page.getByLabel('Email', { exact: false }).first().fill(EMAIL);
    await page.getByLabel('Password', { exact: false }).first().fill(PASSWORD);
    const loginButton = page.getByRole('button', { name: /sign in|entrar|acessar|login/i }).first();
    if (await loginButton.isVisible().catch(() => false)) {
      await loginButton.click();
    } else {
      await page.getByLabel('Password', { exact: false }).first().press('Enter');
    }

    // 2) Seleção/ativação do contexto CETESB (MARDAN), se a tela aparecer
    await page.waitForLoadState('networkidle').catch(() => {});
    if (/\/login\/cetesb/.test(page.url())) {
      const accountOption = page.getByText(new RegExp(ACCOUNT_HINT, 'i')).first();
      await accountOption.click().catch(() => {});
      await page.getByRole('button', { name: /entrar|ativar|selecionar|continuar/i }).first().click().catch(() => {});
      await page.waitForLoadState('networkidle').catch(() => {});
    }

    // 3) Grid de manifestos: confirma que há manifestos atuais (data de hoje) na tela
    await page.goto(`${BASE_URL}/manifestos`);
    await expect(page.getByRole('columnheader', { name: /Data Emiss/i })).toBeVisible({ timeout: 20_000 });
    // Aguarda a grid carregar dados reais (linhas com número MTR)
    await expect(page.locator('tbody tr').first()).toBeVisible({ timeout: 20_000 });

    // 4) Abre o chat e pergunta pela recência
    await page.goto(`${BASE_URL}/conversacional/chat`);
    const input = page.getByPlaceholder(CHAT_PLACEHOLDER);
    await expect(input).toBeVisible({ timeout: 20_000 });
    await input.fill('qual meu manifesto mais recente');
    await input.press('Enter');

    // 5) A resposta do assistente (gerada pelo LLM sobre a evidência atual) deve chegar
    //    e refletir os dados de hoje — citando os manifestos de 29/05 e/ou explicando o
    //    empate de datas. Espera generosa pela latência do LLM. (.first() evita strict-mode
    //    quando o número aparece em mais de um nó.)
    await expect(page.getByText('260012073434', { exact: false }).first()).toBeVisible({ timeout: 60_000 });
    await expect(page.getByText(/empat[ae]|29\/05\/2026|2026-05-29/i).first()).toBeVisible({ timeout: 60_000 });

    // O manifesto antigo (28/05) NÃO pode ser apresentado como o mais recente.
    await expect(page.getByText(STALE_MANIFEST)).toHaveCount(0);
  });
});

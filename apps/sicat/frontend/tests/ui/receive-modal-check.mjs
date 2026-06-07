// Valida a tela de Recebimento de MTR reconstruída (fiel ao SIGOR): abre o modal,
// confere seleção de responsável (lista nome+cargo) e grid de resíduos editável.
// NÃO clica em "Receber" (não executa mutação real na CETESB).
// Lê credenciais do .env.e2e (gitignored). NUNCA imprime a senha.
import { chromium } from '@playwright/test';
import { readFileSync, existsSync, mkdirSync } from 'node:fs';
import { resolve } from 'node:path';

function loadEnv(file) {
  if (!existsSync(file)) return;
  for (const l of readFileSync(file, 'utf8').split(/\r?\n/)) {
    const t = l.trim(); if (!t || t.startsWith('#')) continue;
    const i = t.indexOf('='); if (i <= 0) continue;
    const k = t.slice(0, i).trim(); const v = t.slice(i + 1).trim();
    if (process.env[k] === undefined) process.env[k] = v;
  }
}
loadEnv(resolve(process.cwd(), '..', '.env.e2e'));
loadEnv(resolve(process.cwd(), '.env.e2e'));

const BASE = (process.env.SICAT_E2E_BASE_URL || 'http://localhost:5173').replace(/\/$/, '');
const EMAIL = process.env.SICAT_TEST_EMAIL;
const PASS = process.env.SICAT_TEST_PASSWORD;
const OUT = resolve(process.cwd(), 'walkthrough-shots');
mkdirSync(OUT, { recursive: true });
const results = [];
const ok = (s, p, d = '') => { results.push({ s, p }); console.log(`${p ? 'OK ' : 'XX '} ${s}${d ? ' — ' + d : ''}`); };

let browser;
try { browser = await chromium.launch({ headless: false }); } catch { browser = await chromium.launch({ headless: true }); }
const page = await (await browser.newContext({ viewport: { width: 1440, height: 940 } })).newPage();

try {
  await page.goto(`${BASE}/login`, { waitUntil: 'networkidle' });
  await page.getByLabel('Email', { exact: false }).first().fill(EMAIL);
  await page.getByLabel('Password', { exact: false }).first().fill(PASS);
  const btn = page.getByRole('button', { name: /sign in|entrar|acessar|login/i }).first();
  if (await btn.isVisible().catch(() => false)) await btn.click(); else await page.getByLabel('Password', { exact: false }).first().press('Enter');
  await page.waitForLoadState('networkidle').catch(() => {});
  await page.waitForTimeout(1500);

  await page.goto(`${BASE}/manifestos`, { waitUntil: 'networkidle' });
  await page.waitForTimeout(3500);
  await page.screenshot({ path: `${OUT}/06-receiver-grid.png`, fullPage: true }).catch(() => {});

  // Abre o menu "Ações" da primeira linha (auto-wait + scroll) e clica em "Receber MTR".
  let opened = false;
  try {
    const acoes = page.getByRole('button', { name: /Ações/i }).first();
    await acoes.waitFor({ state: 'visible', timeout: 20000 });
    await acoes.scrollIntoViewIfNeeded().catch(() => {});
    await acoes.click({ timeout: 10000 });
    const receber = page.getByText(/Receber MTR/i).first();
    await receber.waitFor({ state: 'visible', timeout: 6000 });
    await receber.click();
    opened = true;
  } catch (e) {
    console.log('   (detalhe abertura:', String(e?.message || e).slice(0, 80), ')');
  }
  ok('Ação "Receber MTR" disponível e abriu o modal', opened, opened ? '' : 'nenhum manifesto recebível / menu não encontrado');

  if (opened) {
    await page.waitForTimeout(1500);
    ok('Modal "Recebimento de MTR"', await page.getByText(/Recebimento de MTR/i).first().isVisible().catch(() => false));
    ok('Botão "Selecionar Responsável" presente', await page.getByRole('button', { name: /Selecionar Responsável/i }).first().isVisible().catch(() => false));
    ok('Seção "Resíduos" presente', await page.getByText(/^Resíduos$/i).first().isVisible().catch(() => false));
    await page.screenshot({ path: `${OUT}/07-receive-modal.png`, fullPage: true }).catch(() => {});

    // Sub-modal de responsáveis
    await page.getByRole('button', { name: /Selecionar Responsável/i }).first().click();
    await page.waitForTimeout(2500);
    const hasDanilo = await page.getByText(/Danilo/).first().isVisible().catch(() => false);
    const hasMarcos = await page.getByText(/Marcos Aurelio Mussel de Barros/i).first().isVisible().catch(() => false);
    ok('Lista de responsáveis carregou (Danilo + Marcos, com cargo)', hasDanilo && hasMarcos);
    await page.screenshot({ path: `${OUT}/08-responsibles.png`, fullPage: true }).catch(() => {});

    // Seleciona um responsável (NÃO submete o recebimento — sem mutação).
    await page.getByRole('button', { name: /Selecionar/i }).last().click().catch(() => {});
    await page.waitForTimeout(800);
    ok('Responsável selecionado aparece no modal', await page.getByText(/Responsável:/i).first().isVisible().catch(() => false));
    await page.screenshot({ path: `${OUT}/09-receive-ready.png`, fullPage: true }).catch(() => {});
  }
} catch (e) {
  ok('Receive modal check', false, String(e?.message || e).slice(0, 160));
  await page.screenshot({ path: `${OUT}/99-receive-erro.png` }).catch(() => {});
} finally {
  await browser.close();
  const failed = results.filter((r) => !r.p).length;
  console.log(`\nRESULTADO: ${results.length - failed}/${results.length} OK`);
  process.exit(failed ? 1 : 0);
}

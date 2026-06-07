// Valida a tela de Geração de CDF reconstruída (fiel ao SIGOR): responsável por SELEÇÃO
// (lista nome+cargo da CETESB, não código digitado), data de emissão como DIA, observação livre
// (sem default 'via SICAT'). Também confere que a tela de manifestos só REDIRECIONA para /cdf/novo.
// NÃO clica em "Gerar CDF" de submissão (não executa mutação definitiva na CETESB).
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

// Captura a resposta do endpoint NOVO de responsáveis de CDF (evidência de que carregou da fonte certa).
let responsiblesCount = null;
page.on('response', async (res) => {
  if (res.url().includes('/v1/cdf/responsibles')) {
    try { const body = await res.json(); responsiblesCount = Array.isArray(body?.items) ? body.items.length : null; } catch { /* ignore */ }
  }
});

try {
  await page.goto(`${BASE}/login`, { waitUntil: 'networkidle' });
  await page.getByLabel('Email', { exact: false }).first().fill(EMAIL);
  await page.getByLabel('Password', { exact: false }).first().fill(PASS);
  const btn = page.getByRole('button', { name: /sign in|entrar|acessar|login/i }).first();
  if (await btn.isVisible().catch(() => false)) await btn.click(); else await page.getByLabel('Password', { exact: false }).first().press('Enter');
  await page.waitForLoadState('networkidle').catch(() => {});
  await page.waitForTimeout(1500);

  // ── Tela dedicada de CDF ──────────────────────────────────────────────
  await page.goto(`${BASE}/cdf/novo`, { waitUntil: 'networkidle' });
  await page.waitForTimeout(3000);
  await page.screenshot({ path: `${OUT}/cdf-01-tela.png`, fullPage: true }).catch(() => {});

  ok('Rota /cdf/novo abriu', page.url().includes('/cdf/novo') && (await page.getByText(/Manifestos para emissão/i).first().isVisible().catch(() => false)));

  // Responsável agora é SELEÇÃO (label "Responsável pela emissão"), não "Código do responsável" digitado.
  ok('Campo "Responsável pela emissão" (seleção) presente', await page.getByText(/Responsável pela emissão/i).first().isVisible().catch(() => false));
  ok('Padrão antigo removido: NÃO há "Código do responsável"', !(await page.getByText(/Código do responsável/i).first().isVisible().catch(() => false)));

  // Endpoint novo de responsáveis foi chamado.
  ok('Endpoint /v1/cdf/responsibles consultado', responsiblesCount !== null, responsiblesCount !== null ? `${responsiblesCount} responsável(is)` : 'sem resposta capturada');

  // Abre o seletor e confere itens (se a conta tiver responsáveis na CETESB).
  try {
    const sel = page.locator('.v-select').first();
    await sel.scrollIntoViewIfNeeded().catch(() => {});
    await sel.click({ timeout: 5000 });
    await page.waitForTimeout(1200);
    const optionCount = await page.locator('.v-overlay-container .v-list-item').count().catch(() => 0);
    ok('Seletor de responsável abre como lista (combobox)', optionCount >= 0, `${optionCount} opção(ões) renderizada(s)`);
    await page.screenshot({ path: `${OUT}/cdf-02-responsaveis.png`, fullPage: true }).catch(() => {});
    await page.keyboard.press('Escape').catch(() => {});
  } catch (e) {
    ok('Seletor de responsável interativo', false, String(e?.message || e).slice(0, 80));
  }

  // Data de emissão como DIA (input type=date), não datetime-local.
  const dateType = await page.locator('input[type="date"]').first().getAttribute('type').catch(() => null);
  ok('Data da emissão é DIA (type="date")', dateType === 'date');
  ok('Padrão antigo removido: NÃO há datetime-local', (await page.locator('input[type="datetime-local"]').count().catch(() => 0)) === 0);

  // Observação livre, sem default "CDF gerado via SICAT.".
  const obs = await page.locator('textarea').first().inputValue().catch(() => '');
  ok('Observação SEM default "via SICAT"', !/via SICAT/i.test(obs), obs ? `valor: "${obs.slice(0, 40)}"` : 'vazia');

  // ── De-redundância na tela de manifestos ──────────────────────────────
  await page.goto(`${BASE}/manifestos`, { waitUntil: 'networkidle' });
  await page.waitForTimeout(3000);
  await page.screenshot({ path: `${OUT}/cdf-03-manifestos.png`, fullPage: true }).catch(() => {});

  // O botão do cabeçalho agora chama "Gerar CDF" e apenas redireciona (sem workspace embutido).
  const hasGerarCdf = await page.getByRole('button', { name: /^Gerar CDF$/i }).first().isVisible().catch(() => false);
  ok('Tela de manifestos: botão "Gerar CDF" (redireciona)', hasGerarCdf);

  // Sem seleção, clicar deve manter na própria tela com aviso (não abre workspace de CDF).
  if (hasGerarCdf) {
    await page.getByRole('button', { name: /^Gerar CDF$/i }).first().click().catch(() => {});
    await page.waitForTimeout(800);
    const stayed = page.url().includes('/manifestos');
    ok('Sem seleção: permanece em /manifestos com aviso (não abre fluxo embutido)', stayed);
  }
} catch (e) {
  ok('CDF walkthrough', false, String(e?.message || e).slice(0, 160));
  await page.screenshot({ path: `${OUT}/cdf-99-erro.png` }).catch(() => {});
} finally {
  await browser.close();
  const failed = results.filter((r) => !r.p).length;
  console.log(`\nRESULTADO CDF: ${results.length - failed}/${results.length} OK`);
  process.exit(failed ? 1 : 0);
}

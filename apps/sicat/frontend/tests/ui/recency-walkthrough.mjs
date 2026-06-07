// Walkthrough de navegação real (como o usuário): login -> manifestos -> chat.
// Dirige um browser real contra a stack viva, captura screenshots e valida cada passo.
// Lê credenciais do .env.e2e (gitignored). NUNCA imprime a senha.
// Uso: node tests/ui/recency-walkthrough.mjs   (a partir de frontend/)
import { chromium } from '@playwright/test';
import { readFileSync, existsSync, mkdirSync } from 'node:fs';
import { resolve } from 'node:path';

function loadEnv(file) {
  if (!existsSync(file)) return;
  for (const l of readFileSync(file, 'utf8').split(/\r?\n/)) {
    const t = l.trim();
    if (!t || t.startsWith('#')) continue;
    const i = t.indexOf('=');
    if (i <= 0) continue;
    const k = t.slice(0, i).trim();
    const v = t.slice(i + 1).trim();
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
const ok = (step, pass, detail = '') => {
  results.push({ step, pass, detail });
  console.log(`${pass ? 'OK ' : 'XX '} ${step}${detail ? ' — ' + detail : ''}`);
};

if (!EMAIL || !PASS) {
  console.error('SICAT_TEST_EMAIL/SICAT_TEST_PASSWORD ausentes (.env.e2e).');
  process.exit(2);
}

let browser;
try {
  browser = await chromium.launch({ headless: false });
} catch {
  browser = await chromium.launch({ headless: true });
}
const ctx = await browser.newContext({ viewport: { width: 1366, height: 900 } });
const page = await ctx.newPage();
const consoleErrors = [];
page.on('console', (m) => { if (m.type() === 'error') consoleErrors.push(m.text()); });

async function shot(name) { await page.screenshot({ path: `${OUT}/${name}.png`, fullPage: true }).catch(() => {}); }

try {
  // 1) LOGIN
  await page.goto(`${BASE}/login`, { waitUntil: 'networkidle' });
  await shot('01-login');
  await page.getByLabel('Email', { exact: false }).first().fill(EMAIL);
  await page.getByLabel('Password', { exact: false }).first().fill(PASS);
  const btn = page.getByRole('button', { name: /sign in|entrar|acessar|login/i }).first();
  if (await btn.isVisible().catch(() => false)) await btn.click();
  else await page.getByLabel('Password', { exact: false }).first().press('Enter');
  await page.waitForLoadState('networkidle').catch(() => {});
  await page.waitForTimeout(2000);
  await shot('02-apos-login');
  ok('Login concluído (saiu de /login)', !/\/login(\?|$)/.test(page.url()), `url=${page.url()}`);
  ok('Header com contexto MARDAN', await page.getByText(/MARDAN/i).first().isVisible().catch(() => false));

  // 2) MANIFESTOS (aqui era onde dava "Sessão expirada")
  await page.goto(`${BASE}/manifestos`, { waitUntil: 'networkidle' });
  await page.waitForTimeout(3000);
  await shot('03-manifestos');
  const expired = await page.getByText(/sess[aã]o expirada/i).first().isVisible().catch(() => false);
  ok('Tela de Manifestos SEM "Sessão expirada"', !expired, expired ? 'mensagem apareceu' : 'ok');
  const grid2905 = await page.getByText('260012073434', { exact: false }).first().isVisible().catch(() => false);
  ok('Grid exibe manifesto de 29/05 (260012073434)', grid2905);

  // 3) CHAT — recência
  await page.goto(`${BASE}/conversacional/chat`, { waitUntil: 'networkidle' });
  const input = page.getByPlaceholder(/Pergunte sobre manifestos/i);
  await input.waitFor({ timeout: 20000 });
  await input.fill('qual meu manifesto mais recente');
  await input.press('Enter');
  await page.getByText('260012073434', { exact: false }).first().waitFor({ timeout: 60000 });
  await page.waitForTimeout(800);
  await shot('04-chat-resposta');
  const staleCount = await page.getByText('260012058818').count();
  ok('Chat cita 29/05 e NÃO o antigo 260012058818', staleCount === 0, `ocorrências 260012058818=${staleCount}`);
  const empate = await page.getByText(/empat[ae]/i).first().isVisible().catch(() => false);
  ok('Chat explica o empate de datas', empate);

  ok('Sem erros graves no console', consoleErrors.length === 0, consoleErrors.slice(0, 2).join(' | '));
} catch (e) {
  ok('Walkthrough', false, String(e?.message || e).slice(0, 160));
  await shot('99-erro');
} finally {
  await browser.close();
  const failed = results.filter((r) => !r.pass).length;
  console.log(`\nRESULTADO: ${results.length - failed}/${results.length} passos OK. Screenshots em ${OUT}`);
  process.exit(failed ? 1 : 0);
}

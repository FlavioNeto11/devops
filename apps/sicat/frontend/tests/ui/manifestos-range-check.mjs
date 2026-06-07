// Valida que a tela de Manifestos (conta destinador/MARDAN) aceita INTERVALO (range),
// sem o erro "Para conta destinador, utilize a mesma data inicial e final.".
// Lê credenciais do .env.e2e (gitignored). NUNCA imprime a senha.
// Uso: node tests/ui/manifestos-range-check.mjs   (a partir de frontend/)
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
const page = await (await browser.newContext({ viewport: { width: 1366, height: 900 } })).newPage();
let lastManifestReq = '';
page.on('request', (r) => { if (/\/v1\/manifestos(\?|$)/.test(r.url())) lastManifestReq = r.url(); });

try {
  // Login
  await page.goto(`${BASE}/login`, { waitUntil: 'networkidle' });
  await page.getByLabel('Email', { exact: false }).first().fill(EMAIL);
  await page.getByLabel('Password', { exact: false }).first().fill(PASS);
  const btn = page.getByRole('button', { name: /sign in|entrar|acessar|login/i }).first();
  if (await btn.isVisible().catch(() => false)) await btn.click(); else await page.getByLabel('Password', { exact: false }).first().press('Enter');
  await page.waitForLoadState('networkidle').catch(() => {});
  await page.waitForTimeout(1500);

  // Semeia o filtro persistido com um RANGE (formato real do app = BR) ANTES de montar a
  // tela. SEM o fix, normalizeReceiverDateWindow colapsaria para data única no mount;
  // COM o fix, o range é preservado. Evita lutar com o date-picker custom no teste.
  await page.evaluate(() => {
    localStorage.setItem('sicat_manifest_list_filters', JSON.stringify({
      integrationAccountId: '', status: '', groupId: '', manifestNumber: '',
      carrierQuery: '', receiverQuery: '', dateFrom: '27/05/2026', dateTo: '29/05/2026',
      page: 1, pageSize: 50
    }));
  });

  await page.goto(`${BASE}/manifestos`, { waitUntil: 'networkidle' });
  await page.waitForTimeout(4000);
  await page.screenshot({ path: `${OUT}/05-manifestos-range.png`, fullPage: true }).catch(() => {});
  console.log('request enviado ao backend:', decodeURIComponent(lastManifestReq).replace(/.*\/v1\/manifestos/, '/v1/manifestos'));
  ok('Frontend PRESERVOU o range (dateFrom 2026-05-27) e enviou ao backend', /dateFrom=2026-05-27/.test(lastManifestReq), lastManifestReq ? 'capturado' : 'sem request');

  // Não deve aparecer o erro de data única
  const blocked = await page.getByText(/mesma data inicial e final|busca di[aá]ria/i).first().isVisible().catch(() => false);
  ok('SEM erro "mesma data inicial e final"', !blocked, blocked ? 'erro apareceu' : 'ok');

  // Total de manifestos > 3 prova que o range multi-dia (27..29) funcionou (default de hoje traz só 3).
  const body = await page.locator('body').innerText();
  const m = body.match(/de\s+(\d+)\s+manifestos/i);
  const total = m ? Number(m[1]) : 0;
  ok('Range multi-dia retornou > 3 manifestos', total > 3, `total=${total}`);
} catch (e) {
  ok('Range check', false, String(e?.message || e).slice(0, 160));
  await page.screenshot({ path: `${OUT}/99-range-erro.png` }).catch(() => {});
} finally {
  await browser.close();
  const failed = results.filter((r) => !r.p).length;
  console.log(`\nRESULTADO: ${results.length - failed}/${results.length} OK`);
  process.exit(failed ? 1 : 0);
}

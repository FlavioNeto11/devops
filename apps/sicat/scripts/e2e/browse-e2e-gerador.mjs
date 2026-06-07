#!/usr/bin/env node
/**
 * Navegação E2E no portal SICAT (conta GERADOR real), via Playwright/chromium.
 *
 * - Apenas LEITURA/navegação. NÃO submete formulários, NÃO cancela/transmite/recebe/imprime.
 * - Lê credenciais de `.env.e2e` (não versionado). Não imprime segredos.
 * - Mascara CNPJ/CPF/e-mail/nome no DOM antes de cada screenshot.
 * - Screenshots e results.json vão para frontend/test-results/e2e-gerador/ (gitignored).
 * - Resiliente: erro em uma tela não aborta o run; tudo é registrado.
 */
import { chromium } from 'playwright';
import { readFileSync, existsSync, mkdirSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';

function loadDotenv(file) {
  if (!existsSync(file)) return;
  for (const line of readFileSync(file, 'utf8').split(/\r?\n/)) {
    const t = line.trim(); if (!t || t.startsWith('#')) continue;
    const i = t.indexOf('='); if (i > 0 && process.env[t.slice(0, i).trim()] === undefined) process.env[t.slice(0, i).trim()] = t.slice(i + 1).trim();
  }
}
loadDotenv(resolve(process.cwd(), '.env.e2e'));

const FRONT = (process.env.SICAT_FRONTEND_URL || 'http://localhost:5173').replace(/\/$/, '');
const email = process.env.SICAT_E2E_INTERNAL_USER_EMAIL;
const password = process.env.SICAT_E2E_INTERNAL_USER_PASSWORD;
const SENSITIVE = [
  process.env.CETESB_COMPANY_DOCUMENT, process.env.CETESB_USER_CPF,
  process.env.CETESB_USER_EMAIL, process.env.CETESB_USER_NAME,
  (process.env.CETESB_COMPANY_DOCUMENT || '').replace(/\D/g, ''),
  (process.env.CETESB_USER_CPF || '').replace(/\D/g, '')
].filter(Boolean);

const OUT = resolve(process.cwd(), 'frontend/test-results/e2e-gerador');
mkdirSync(OUT, { recursive: true });

const ROUTES = [
  ['Início (Dashboard)', '/dashboard', 'operator'],
  ['Manifestos', '/manifestos', 'operator'],
  ['Emitir MTR (form)', '/manifestos/novo', 'operator'],
  ['Relatórios MTR', '/relatorios/mtrs', 'operator'],
  ['MTR Provisório (lista)', '/mtr-provisorio', 'operator'],
  ['Novo MTR Provisório (form)', '/mtr-provisorio/novo', 'operator'],
  ['DMR (declarações)', '/dmr', 'operator'],
  ['DMR Pendentes', '/dmr/pendentes', 'operator'],
  ['Nova DMR (form)', '/dmr/novo', 'operator'],
  ['CDF (emitidos)', '/cdf', 'operator'],
  ['Gerar CDF (form)', '/cdf/novo', 'operator'],
  ['Assistente (chat)', '/conversacional/chat', 'operator'],
  ['Minha sessão', '/sessao', 'operator'],
  ['Sistema · Jobs', '/sistema/jobs', 'system'],
  ['Sistema · Visão geral', '/operacao/dashboard', 'system'],
  ['Sistema · Auditoria', '/operacao/auditoria', 'system'],
  ['Sistema · Saúde CETESB', '/operacao/cetesb-health', 'system'],
  ['Sistema · Command Center', '/operacao/command-center', 'system'],
  ['Administração · Acessos', '/admin/acessos', 'admin'],
  ['Dev · Playground', '/dev/components', 'system']
];

const results = [];
let slug = (s) => s.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '');

async function maskAndShot(page, name) {
  try {
    await page.evaluate((sens) => {
      const re = sens.map((s) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')).filter(Boolean);
      if (re.length) {
        const rx = new RegExp(re.join('|'), 'g');
        const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT);
        const nodes = []; while (walker.nextNode()) nodes.push(walker.currentNode);
        for (const n of nodes) { if (rx.test(n.nodeValue)) n.nodeValue = n.nodeValue.replace(rx, '••••••'); }
      }
    }, SENSITIVE);
  } catch {}
  try { await page.screenshot({ path: resolve(OUT, `${slug(name)}.png`), fullPage: false }); } catch {}
}

async function visit(page, label, path, audience) {
  const entry = { label, path, audience, consoleErrors: [], badResponses: [], finalUrl: '', bodyLen: 0, status: 'aprovado', notes: [] };
  const onConsole = (m) => { if (m.type() === 'error') entry.consoleErrors.push(m.text().slice(0, 200)); };
  const onPageError = (e) => entry.consoleErrors.push('PAGEERROR: ' + String(e?.message || e).slice(0, 200));
  const onResp = (r) => { const s = r.status(); if (s >= 400) entry.badResponses.push(`${s} ${r.url().replace(/https?:\/\/[^/]+/, '').slice(0, 90)}`); };
  page.on('console', onConsole); page.on('pageerror', onPageError); page.on('response', onResp);
  try {
    await page.goto(FRONT + path, { waitUntil: 'domcontentloaded', timeout: 30000 });
    await page.waitForTimeout(2500);
    try { await page.waitForLoadState('networkidle', { timeout: 8000 }); } catch {}
    entry.finalUrl = page.url().replace(FRONT, '') || '/';
    entry.bodyLen = (await page.evaluate(() => document.body?.innerText?.length || 0));
    if (entry.bodyLen < 20) { entry.status = 'reprovado'; entry.notes.push('tela praticamente em branco'); }
    // Heurística de acessibilidade (sem dependências)
    entry.a11y = await page.evaluate(() => {
      const all = (s) => Array.from(document.querySelectorAll(s));
      const iconBtns = all('button').filter((b) => !b.textContent.trim() && !b.getAttribute('aria-label') && !b.getAttribute('title') && !b.querySelector('img[alt]:not([alt=""])'));
      const imgsNoAlt = all('img').filter((i) => !i.hasAttribute('alt'));
      const inputsNoLabel = all('input,select,textarea').filter((el) => {
        if (el.type === 'hidden') return false;
        if (el.getAttribute('aria-label') || el.getAttribute('aria-labelledby') || el.getAttribute('title')) return false;
        const id = el.getAttribute('id');
        if (id && document.querySelector(`label[for="${(window.CSS && CSS.escape) ? CSS.escape(id) : id}"]`)) return false;
        return !el.closest('label');
      });
      return { iconBtnsNoLabel: iconBtns.length, imgsNoAlt: imgsNoAlt.length, inputsNoLabel: inputsNoLabel.length };
    });
    if (audience !== 'operator' && entry.finalUrl.startsWith('/dashboard') && path !== '/dashboard') {
      entry.notes.push('redirecionado para /dashboard (gating por papel — esperado p/ não-admin)');
      entry.status = 'gated';
    }
    const critical = entry.consoleErrors.filter((e) => !/favicon|ResizeObserver|Failed to load resource: the server responded with a status of 401/.test(e));
    if (critical.length) { entry.status = entry.status === 'aprovado' ? 'aprovado com ressalva' : entry.status; }
    const real500 = entry.badResponses.filter((b) => b.startsWith('5'));
    if (real500.length) { entry.status = 'reprovado'; entry.notes.push('resposta 5xx: ' + real500.join('; ')); }
    await maskAndShot(page, label);
  } catch (e) {
    entry.status = 'reprovado'; entry.notes.push('exceção: ' + String(e?.message || e).slice(0, 150));
  } finally {
    page.off('console', onConsole); page.off('pageerror', onPageError); page.off('response', onResp);
  }
  results.push(entry);
  console.log(`[browse] ${entry.status.toUpperCase().padEnd(20)} ${label}  (${entry.finalUrl}) console:${entry.consoleErrors.length} http4xx5xx:${entry.badResponses.length}`);
}

async function main() {
  const browser = await chromium.launch({ headless: true });
  const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 }, locale: 'pt-BR' });
  const page = await ctx.newPage();
  const summary = { login: 'n/d', accountSelection: 'n/d', screens: results };

  // LOGIN
  try {
    await page.goto(FRONT + '/login', { waitUntil: 'domcontentloaded', timeout: 30000 });
    await page.waitForTimeout(1500);
    await page.fill('input[placeholder="voce@empresa.com"]', email, { timeout: 15000 });
    await page.fill('input[placeholder="Digite sua senha"]', password, { timeout: 15000 });
    await page.getByRole('button', { name: /sign in/i }).click({ timeout: 15000 });
    await page.waitForTimeout(4000);
    const url = page.url().replace(FRONT, '');
    summary.login = url.includes('/login') && !url.includes('/login/cetesb') ? 'falhou (permaneceu em /login)' : 'ok';
    console.log('[browse] pós-login url: ' + url);

    // SELEÇÃO DE CONTA (se redirecionado para /login/cetesb)
    if (url.includes('/login/cetesb')) {
      await maskAndShot(page, 'Seleção de conta CETESB');
      // clica no botão "Entrar" do card da conta GERADOR (ativação real → handleActivateAccount)
      let clicked = false;
      try { await page.getByRole('button', { name: /^entrar$/i }).first().click({ timeout: 12000 }); clicked = true; } catch {}
      try { await page.waitForURL('**/dashboard', { timeout: 12000 }); } catch {}
      const u2 = page.url().replace(FRONT, '');
      summary.accountSelection = u2.startsWith('/dashboard') ? 'ok (Entrar → redirect /dashboard)' : ('clicou=' + clicked + ' url=' + u2);
      console.log('[browse] pós-seleção url: ' + u2);
    } else if (url.startsWith('/dashboard')) {
      summary.accountSelection = 'ok (sessão CETESB já ativa, sem etapa de seleção)';
    }
  } catch (e) {
    summary.login = 'erro: ' + String(e?.message || e).slice(0, 150);
  }

  // NAVEGAÇÃO (desktop)
  for (const [label, path, audience] of ROUTES) {
    await visit(page, label, path, audience);
  }

  // PASSAGEM MOBILE (375px) — verifica scroll horizontal e captura drawer
  const mobile = [];
  try {
    await page.setViewportSize({ width: 375, height: 812 });
    for (const [label, path] of [['Início', '/dashboard'], ['Manifestos', '/manifestos'], ['CDF', '/cdf'], ['Sistema · Jobs', '/sistema/jobs']]) {
      try {
        await page.goto(FRONT + path, { waitUntil: 'domcontentloaded', timeout: 30000 });
        await page.waitForTimeout(1500);
        const overflow = await page.evaluate(() => document.documentElement.scrollWidth > window.innerWidth + 2);
        await maskAndShot(page, 'mobile-' + label);
        mobile.push({ label, path, horizontalOverflow: overflow });
        console.log(`[browse][mobile] ${label}: scroll-horizontal=${overflow ? 'SIM ⚠️' : 'não'}`);
      } catch (e) { mobile.push({ label, path, error: String(e?.message || e).slice(0, 100) }); }
    }
    await page.setViewportSize({ width: 1440, height: 900 });
  } catch (e) { console.log('[browse][mobile] erro: ' + (e?.message || e)); }
  summary.mobile = mobile;

  // Resumo A11y (heurístico)
  const a11yTotals = results.reduce((acc, r) => {
    if (r.a11y) { acc.iconBtnsNoLabel += r.a11y.iconBtnsNoLabel; acc.imgsNoAlt += r.a11y.imgsNoAlt; acc.inputsNoLabel += r.a11y.inputsNoLabel; }
    return acc;
  }, { iconBtnsNoLabel: 0, imgsNoAlt: 0, inputsNoLabel: 0 });
  summary.a11yTotals = a11yTotals;
  console.log(`[browse][a11y] icon-btns sem label: ${a11yTotals.iconBtnsNoLabel} | imgs sem alt: ${a11yTotals.imgsNoAlt} | inputs sem label: ${a11yTotals.inputsNoLabel} (somatório das ${results.length} telas)`);

  // LOGOUT (best-effort: limpa storage e vai p/ /login)
  try {
    await page.goto(FRONT + '/login', { timeout: 20000 });
    await page.evaluate(() => { try { localStorage.clear(); sessionStorage.clear(); } catch {} });
    summary.logout = 'ok (storage limpo)';
  } catch { summary.logout = 'n/d'; }

  writeFileSync(resolve(OUT, 'results.json'), JSON.stringify(summary, null, 2));
  console.log('\n[browse] login=' + summary.login + ' | accountSelection=' + summary.accountSelection);
  console.log('[browse] telas: ' + results.length + ' | reprovadas: ' + results.filter(r => r.status === 'reprovado').length + ' | gated: ' + results.filter(r => r.status === 'gated').length + ' | ressalva: ' + results.filter(r => r.status === 'aprovado com ressalva').length);
  console.log('[browse] results.json + screenshots em frontend/test-results/e2e-gerador/');
  await browser.close();
}
main().catch((e) => { console.error('[browse] erro fatal:', e?.message || e); process.exit(1); });

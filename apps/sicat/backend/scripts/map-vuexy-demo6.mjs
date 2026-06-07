/**
 * map-vuexy-demo6.mjs
 * Script Playwright para mapear a estrutura visual e técnica do Vuexy Vue.js Admin Template - Demo 6
 *
 * Execução (a partir da raiz do projeto):
 *   npx --prefix ./frontend playwright install chromium   # instalar browser (1x)
 *   node --experimental-vm-modules scripts/map-vuexy-demo6.mjs
 *
 * OU executar direto via npx do diretório frontend:
 *   cd frontend && npx playwright test --config=../scripts/pw-config-demo6.js ../scripts/run-demo6-spec.js
 *
 * Alternativa mais simples – script autônomo com chromium bundled:
 *   cd frontend && node ../scripts/map-vuexy-demo6.mjs
 */

import { chromium } from '@playwright/test';
import { writeFileSync, mkdirSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const OUTPUT_DIR = resolve(__dirname, '../storage/temp/vuexy-demo6');

mkdirSync(OUTPUT_DIR, { recursive: true });

const BASE = 'https://demos.pixinvent.com/vuexy-vuejs-admin-template/demo-6';
const CREDS = { email: 'admin@demo.com', password: 'admin' };

// ─── helpers ─────────────────────────────────────────────────────────────────

/** Extrai todas as CSS custom properties do :root de todas as stylesheets */
async function extractCssVars(page) {
  return page.evaluate(() => {
    const vars = {};
    for (const sheet of document.styleSheets) {
      try { // eslint-disable-line no-restricted-syntax
        for (const rule of sheet.cssRules) {
          if (rule.selectorText === ':root' || rule.selectorText === ':root, [data-theme]') {
            for (const prop of rule.style) {
              if (prop.startsWith('--')) {
                vars[prop] = rule.style.getPropertyValue(prop).trim();
              }
            }
          }
        }
      } catch { /* cross-origin stylesheet — expected, skip */ }
    }
    // Também coleta computed vars do document.documentElement
    const computed = getComputedStyle(document.documentElement);
    const known = [
      '--v-theme-primary', '--v-theme-primary-darken-1', '--v-theme-secondary',
      '--v-theme-success', '--v-theme-warning', '--v-theme-error', '--v-theme-info',
      '--v-theme-background', '--v-theme-surface', '--v-theme-on-background',
      '--v-theme-on-surface', '--v-theme-on-primary',
      '--v-primary-base', '--v-secondary-base',
      '--v-border-color', '--v-border-opacity',
      '--v-hover-opacity', '--v-disabled-opacity',
    ];
    for (const k of known) {
      const val = computed.getPropertyValue(k).trim();
      if (val) vars[k] = val;
    }
    return vars;
  });
}

/** Extrai metadados de layout: classes do body, wrappers principais */
async function extractLayoutMeta(page) {
  return page.evaluate(() => {
    const body = document.body;
    const html = document.documentElement;
    const main = document.querySelector('main, [class*="layout-page"], [class*="content"]');
    const nav = document.querySelector('nav, header, [class*="navbar"], [class*="layout-nav"]');
    const footer = document.querySelector('footer, [class*="footer"]');
    const app = document.querySelector('#app, [data-app]');

    return {
      htmlClasses: html.className,
      bodyClasses: body.className,
      dataTheme: html.dataset['theme'] || body.dataset['theme'],
      dataMode: html.dataset['mode'] || body.dataset['mode'],
      appEl: app ? { tag: app.tagName, id: app.id, classes: app.className } : null,
      navEl: nav ? { tag: nav.tagName, classes: nav.className, html: nav.outerHTML.substring(0, 4000) } : null,
      mainEl: main ? { tag: main.tagName, classes: main.className } : null,
      footerEl: footer ? { tag: footer.tagName, classes: footer.className, html: footer.outerHTML.substring(0, 2000) } : null,
    };
  });
}

/** Extrai estrutura do menu horizontal (links, dropdowns, megamenu) */
async function extractHorizontalNav(page) {
  return page.evaluate(() => {
    const selectors = [
      '.horizontal-nav', '.layout-horizontal-nav', 'nav[class*="horizontal"]',
      '.nav-horizontal', '[class*="horizontal-nav"]',
      '.navbar-nav', '.layout-navbar .v-list', 
      'nav .v-list', 'header nav',
    ];

    let navEl = null;
    for (const s of selectors) {
      navEl = document.querySelector(s);
      if (navEl) break;
    }

    if (!navEl) {
      // Fallback: first nav with multiple list items
      const navs = document.querySelectorAll('nav, header');
      for (const n of navs) {
        if (n.querySelectorAll('li, a').length > 3) { navEl = n; break; }
      }
    }

    if (!navEl) return { found: false, html: null };

    const items = [];
    const topItems = navEl.querySelectorAll(':scope > ul > li, :scope > .v-list > .v-list-item, :scope > a');
    topItems.forEach(item => {
      const link = item.querySelector('a') || item;
      const hasDropdown = item.querySelector('ul, .v-list, [class*="dropdown"], [class*="menu"]') !== null;
      items.push({
        text: link.textContent?.trim().substring(0, 50),
        href: link.getAttribute('href'),
        hasDropdown,
        classes: item.className,
      });
    });

    return {
      found: true,
      selector: navEl.tagName + '.' + navEl.className.split(' ').join('.'),
      itemCount: items.length,
      items,
      html: navEl.outerHTML.substring(0, 6000),
    };
  });
}

/** Extrai todos os scripts src carregados (indica dependências) */
async function extractScripts(page) {
  return page.evaluate(() => {
    return Array.from(document.querySelectorAll('script[src]'))
      .map(s => s.src)
      .filter(Boolean);
  });
}

/** Extrai links de fontes (Google Fonts etc.) */
async function extractFonts(page) {
  return page.evaluate(() => {
    const fontLinks = Array.from(document.querySelectorAll('link[href*="font"], link[href*="Font"]'))
      .map(l => l.href);
    const fontFaces = [];
    for (const sheet of document.styleSheets) {
      try { // eslint-disable-line no-restricted-syntax
        for (const rule of sheet.cssRules) {
          if (rule.type === CSSRule.FONT_FACE_RULE) {
            fontFaces.push({
              family: rule.style.getPropertyValue('font-family'),
              src: rule.style.getPropertyValue('src').substring(0, 200),
            });
          }
        }
      } catch { /* cross-origin — skip */ }
    }
    return { fontLinks, fontFaces };
  });
}

/** Extrai estrutura da página de login */
async function extractLoginPage(page) {
  return page.evaluate(() => {
    const form = document.querySelector('form, .auth-wrapper form');
    const inputs = Array.from(document.querySelectorAll('input')).map(i => ({
      type: i.type,
      name: i.name,
      id: i.id,
      placeholder: i.placeholder,
      autocomplete: i.autocomplete,
      classes: i.className,
    }));
    const buttons = Array.from(document.querySelectorAll('button, [type="submit"]')).map(b => ({
      type: b.type,
      text: b.textContent?.trim().substring(0, 80),
      classes: b.className,
    }));
    const authWrapper = document.querySelector('.auth-wrapper, [class*="auth"], [class*="login"]');
    const logo = document.querySelector('[class*="logo"], [class*="brand"] img, svg[class*="logo"]');
    const socialBtns = Array.from(document.querySelectorAll('[class*="social"], [class*="oauth"]')).map(b => b.textContent?.trim());

    return {
      title: document.title,
      inputs,
      buttons,
      hasForm: !!form,
      formClasses: form?.className,
      formAction: form?.action,
      authWrapperClasses: authWrapper?.className,
      hasBgImage: !!(document.querySelector('[class*="auth-bg"], [style*="background-image"]')),
      hasLogo: !!logo,
      logoTag: logo?.tagName,
      hasSocialLogin: socialBtns.length > 0,
      socialBtns,
      bodyHtml: document.body.innerHTML.substring(0, 8000),
    };
  });
}

/** Extrai estrutura de cards e widgets do dashboard */
async function extractDashboardCards(page) {
  return page.evaluate(() => {
    const cards = Array.from(document.querySelectorAll('.v-card, .card, [class*="card"]')).slice(0, 20).map(c => ({
      tag: c.tagName,
      classes: c.className,
      titleText: c.querySelector('.v-card-title, .card-header, h4, h5, h6')?.textContent?.trim().substring(0, 80),
      hasChart: !!(c.querySelector('canvas, svg[class*="chart"], [class*="chart"]')),
      hasTable: !!(c.querySelector('table, .v-table')),
      hasAvatar: !!(c.querySelector('.v-avatar, [class*="avatar"]')),
    }));

    const charts = Array.from(document.querySelectorAll('canvas, svg[class*="chart"], [class*="apexchart"]')).map(c => ({
      tag: c.tagName,
      id: c.id,
      classes: c.className,
      width: c.getAttribute('width') || c.offsetWidth,
      height: c.getAttribute('height') || c.offsetHeight,
    }));

    const tables = Array.from(document.querySelectorAll('table, .v-table')).map(t => ({
      tag: t.tagName,
      classes: t.className,
      headers: Array.from(t.querySelectorAll('th')).map(th => th.textContent?.trim()),
    }));

    const headingH4 = Array.from(document.querySelectorAll('h4, h5, h6')).slice(0, 30).map(h => h.textContent?.trim());
    const snapshotHtml = document.body.innerHTML.substring(0, 5000);

    return { cards, charts, tables, headingH4, snapshotHtml };
  });
}

/** Identifica biblioteca de componentes Vue em uso */
async function identifyComponentLibrary(page) {
  return page.evaluate(() => {
    // Vuetify
    const vuetify = !!(
      document.querySelector('[class^="v-"], [class*=" v-"]') ||
      globalThis.__vuetify__ ||
      globalThis.Vuetify
    );
    // PrimeVue
    const primevue = !!(
      document.querySelector('[class^="p-"], [class*=" p-"]') ||
      globalThis.PrimeVue
    );
    // Element Plus
    const elementPlus = !!(
      document.querySelector('[class^="el-"], [class*=" el-"]') ||
      globalThis.ElementPlus
    );
    // Quasar
    const quasar = !!(
      document.querySelector('[class^="q-"], [class*=" q-"]') ||
      globalThis.Quasar
    );

    // Check meta tags
    const vComponents = Array.from(document.querySelectorAll('[class]'))
      .flatMap(el => [...el.classList])
      .filter(c => c.startsWith('v-'))
      .slice(0, 30);

    const metaGenerator = document.querySelector('meta[name="generator"]')?.content;

    // Check window globals
    const globals = Object.keys(globalThis).filter(k =>
      ['Vuetify','PrimeVue','ElementPlus','Quasar','Vue','__VUE__'].includes(k)
    );

    return {
      vuetify, primevue, elementPlus, quasar,
      vComponents: [...new Set(vComponents)],
      metaGenerator,
      globals,
    };
  });
}

// ─── main ────────────────────────────────────────────────────────────────────

async function run() {
  console.log('[map-vuexy-demo6] Starting Playwright browser...');

  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({
    viewport: { width: 1440, height: 900 },
    userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
  });
  const page = await context.newPage();

  const report = {};

  // ── 1. Login page ──────────────────────────────────────────────────────────
  console.log('[1/6] Navigating to login page...');
  await page.goto(`${BASE}/login`, { waitUntil: 'networkidle', timeout: 30000 });
  await page.waitForTimeout(2000);

  report.login = await extractLoginPage(page);
  report.loginCssVars = await extractCssVars(page);
  report.loginFonts = await extractFonts(page);
  report.loginLayout = await extractLayoutMeta(page);
  report.loginScripts = await extractScripts(page);
  report.loginComponentLib = await identifyComponentLibrary(page);

  await page.screenshot({ path: `${OUTPUT_DIR}/01-login.png`, fullPage: true });
  console.log('  ✓ Login page captured');

  // ── 2. Attempt authentication ──────────────────────────────────────────────
  console.log('[2/6] Attempting login with demo credentials...');
  try {
    const emailSel = 'input[type="email"], input[name="email"], input[id*="email"], input[placeholder*="mail" i]';
    const pwdSel = 'input[type="password"], input[name="password"], input[id*="password"]';
    const submitSel = 'button[type="submit"], button:has-text("login"), button:has-text("Sign In")';

    await page.waitForSelector(emailSel, { timeout: 5000 });
    await page.fill(emailSel, CREDS.email);
    await page.fill(pwdSel, CREDS.password);
    await page.screenshot({ path: `${OUTPUT_DIR}/02-login-filled.png` });
    await page.click(submitSel);
    await page.waitForTimeout(4000);
    await page.waitForLoadState('networkidle', { timeout: 10000 }).catch(() => {});

    const currentUrl = page.url();
    report.loginAttempt = {
      success: !currentUrl.includes('/login'),
      redirectedTo: currentUrl,
    };
    console.log(`  → Redirected to: ${currentUrl}`);
  } catch (e) {
    report.loginAttempt = { success: false, error: e.message };
    console.log('  ✗ Login attempt failed:', e.message);
  }

  // ── 3. Dashboard / home ────────────────────────────────────────────────────
  if (report.loginAttempt?.success) {
    console.log('[3/6] Capturing dashboard...');

    report.dashboardLayout = await extractLayoutMeta(page);
    report.dashboardCssVars = await extractCssVars(page);
    report.dashboardNav = await extractHorizontalNav(page);
    report.dashboardCards = await extractDashboardCards(page);
    report.dashboardComponentLib = await identifyComponentLibrary(page);
    report.dashboardFonts = await extractFonts(page);
    report.dashboardScripts = await extractScripts(page);
    report.dashboardUrl = page.url();
    report.dashboardTitle = await page.title();

    await page.screenshot({ path: `${OUTPUT_DIR}/03-dashboard.png`, fullPage: true });
    console.log('  ✓ Dashboard captured');

    // Scroll and capture full page  
    await page.evaluate(() => window.scrollTo(0, document.body.scrollHeight));
    await page.waitForTimeout(1000);
    await page.screenshot({ path: `${OUTPUT_DIR}/03-dashboard-bottom.png`, fullPage: false });

  } else {
    // Try to go directly to dashboard anyway
    console.log('[3/6] Trying direct dashboard access...');
    await page.goto(`${BASE}/`, { waitUntil: 'networkidle', timeout: 30000 });
    await page.waitForTimeout(2000);

    report.dashboardLayout = await extractLayoutMeta(page);
    report.dashboardCssVars = await extractCssVars(page);
    report.dashboardNav = await extractHorizontalNav(page);
    report.dashboardCards = await extractDashboardCards(page);
    report.dashboardComponentLib = await identifyComponentLibrary(page);
    report.dashboardUrl = page.url();
    report.dashboardTitle = await page.title();

    await page.screenshot({ path: `${OUTPUT_DIR}/03-dashboard-or-redirect.png`, fullPage: true });
    console.log(`  → URL: ${page.url()}`);
  }

  // ── 4. Explore menu items ──────────────────────────────────────────────────
  console.log('[4/6] Exploring navigation menu...');
  report.navExploration = [];

  // Hover on potential nav items to trigger dropdowns
  try {
    const navLinks = await page.$$('nav a, header a, [class*="navbar"] a');
    const linkTexts = [];
    for (const link of navLinks.slice(0, 15)) {
      const text = await link.textContent().catch(() => '');
      const href = await link.getAttribute('href').catch(() => '');
      linkTexts.push({ text: text?.trim(), href });
    }
    report.navLinks = linkTexts;
    console.log(`  Found ${linkTexts.length} nav links`);
  } catch (e) {
    report.navLinks = { error: e.message };
  }

  // ── 5. Capture a sub-page if available (e.g. typography, components) ───────
  console.log('[5/6] Trying components/typography page...');
  const pagesToTry = [
    `${BASE}/components/alert`,
    `${BASE}/components/button`,
    `${BASE}/pages/account-settings`,
    `${BASE}/forms/form-layouts`,
    `${BASE}/ui/typography`,
    `${BASE}/charts/apex-chart`,
  ];

  report.subPages = [];
  for (const url of pagesToTry) {
    try {
      await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 15000 });
      await page.waitForTimeout(1500);
      const currentUrl = page.url();

      // Skip if redirected back to login
      if (currentUrl.includes('/login')) {
        report.subPages.push({ url, status: 'redirected-to-login' });
        continue;
      }

      const snap = {
        url,
        finalUrl: currentUrl,
        title: await page.title(),
        layout: await extractLayoutMeta(page),
        status: 'ok',
      };
      report.subPages.push(snap);

      const safeFilename = url.replaceAll(/[^a-z0-9]/gi, '-').substring(url.lastIndexOf('/') + 1);
      await page.screenshot({ path: `${OUTPUT_DIR}/sub-${safeFilename}.png`, fullPage: true });
      console.log(`  ✓ ${url}`);
      break; // Just grab the first one that works
    } catch (e) {
      report.subPages.push({ url, status: 'error', error: e.message });
    }
  }

  // ── 6. Extract :root variables from a deeply loaded page ──────────────────
  console.log('[6/6] Final CSS variable extraction...');
  // Go back to dashboard/home for complete CSS context
  if (report.loginAttempt?.success) {
    await page.goto(`${BASE}/`, { waitUntil: 'networkidle', timeout: 20000 });
    await page.waitForTimeout(2000);
  }

  report.finalCssVars = await extractCssVars(page);
  report.finalComponentLib = await identifyComponentLibrary(page);

  // Also check <link> tags for font/icon libraries
  report.headLinks = await page.evaluate(() =>
    Array.from(document.querySelectorAll('link'))
      .map(l => ({ rel: l.rel, href: l.href, type: l.type }))
      .filter(l => l.href)
  );

  // Check for icon font (Material Icons, FontAwesome, BoxIcons, etc.)
  report.iconLibraries = await page.evaluate(() => {
    const hasMdi = !!(document.querySelector('[class*="mdi-"]') || document.querySelector('link[href*="material"]'));
    const hasFa = !!(document.querySelector('[class*="fa-"]'));
    const hasBoxIcons = !!(document.querySelector('[class*="bx-"], [class*="bxl-"], [class*="bxs-"]'));
    const hasRemix = !!(document.querySelector('[class*="ri-"]'));
    const hasTabler = !!(document.querySelector('[class*="ti-"]'));
    const hasMaterialSymbols = !!(document.querySelector('.material-symbols-outlined, .material-symbols-rounded'));

    // Sample some icon classes
    const iconEls = Array.from(document.querySelectorAll('i, span')).filter(el =>
      [...el.classList].some(c => c.match(/^(mdi|fa|bx|ri|ti)-/))
    ).slice(0, 10);

    return {
      mdi: hasMdi,
      fontAwesome: hasFa,
      boxIcons: hasBoxIcons,
      remixIcons: hasRemix,
      tablerIcons: hasTabler,
      materialSymbols: hasMaterialSymbols,
      samples: iconEls.map(el => ({ tag: el.tagName, classes: el.className })),
    };
  });

  await browser.close();
  console.log('[map-vuexy-demo6] Browser closed.');

  // ── Write report ────────────────────────────────────────────────────────────
  const reportPath = `${OUTPUT_DIR}/report.json`;
  writeFileSync(reportPath, JSON.stringify(report, null, 2), 'utf-8');
  console.log(`\n[done] Full report written to: ${reportPath}`);

  // Print summary
  console.log('\n═══════════════════════════════════════════════════════════');
  console.log('VUEXY DEMO-6 — SUMMARY REPORT');
  console.log('═══════════════════════════════════════════════════════════');
  console.log('\n▸ PAGE TITLE:', report.dashboardTitle || report.login?.title);
  console.log('▸ LOGIN ATTEMPT:', JSON.stringify(report.loginAttempt));
  console.log('\n▸ COMPONENT LIBRARY DETECTION:');
  console.log(JSON.stringify(report.loginComponentLib || report.finalComponentLib, null, 2));
  console.log('\n▸ ICON LIBRARIES:', JSON.stringify(report.iconLibraries, null, 2));
  console.log('\n▸ FONTS FOUND:', JSON.stringify(report.loginFonts || report.dashboardFonts, null, 2));
  console.log('\n▸ CSS VARIABLES (:root) — login page:');
  const vars = report.loginCssVars || report.finalCssVars || {};
  const importantVars = Object.entries(vars).filter(([k]) =>
    k.includes('primary') || k.includes('secondary') || k.includes('theme') ||
    k.includes('background') || k.includes('surface') || k.includes('font')
  );
  importantVars.forEach(([k, v]) => console.log(`  ${k}: ${v}`));
  console.log('\n▸ HORIZONTAL NAV:', JSON.stringify({
    found: report.dashboardNav?.found,
    itemCount: report.dashboardNav?.itemCount,
    items: report.dashboardNav?.items,
  }, null, 2));
  console.log('\n▸ DASHBOARD LAYOUT META:');
  if (report.dashboardLayout) {
    const dl = report.dashboardLayout;
    console.log('  htmlClasses:', dl.htmlClasses);
    console.log('  bodyClasses:', dl.bodyClasses);
    console.log('  dataTheme:', dl.dataTheme);
    console.log('  navClasses:', dl.navEl?.classes);
    console.log('  mainClasses:', dl.mainEl?.classes);
    console.log('  footerClasses:', dl.footerEl?.classes);
  }
  console.log('\n▸ NAV LINKS FOUND:', report.navLinks?.length || 0);
  (report.navLinks || []).slice(0, 20).forEach(l => console.log(`  [${l.href}] ${l.text}`));
  console.log('\n▸ SUB-PAGES EXPLORED:');
  (report.subPages || []).forEach(sp => console.log(`  ${sp.url} → ${sp.status}`));
  console.log('\n═══════════════════════════════════════════════════════════');
}

run().catch(err => {
  console.error('[FATAL]', err);
  process.exit(1);
});

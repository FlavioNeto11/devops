#!/usr/bin/env node

import { chromium } from 'playwright';
import fs from 'node:fs';
import path from 'node:path';

const FRONTEND_URL = process.env.FRONTEND_URL || 'http://127.0.0.1:5174';
const API_URL = process.env.API_URL || 'http://localhost:8080';
const EMAIL = process.env.SICAT_EMAIL || 'flavio_padilha_neto@msn.com';
const PASSWORD = process.env.SICAT_PASSWORD || '08897520@Fpn';
const ACCOUNT_NAME = process.env.SICAT_ACCOUNT || 'Nova IT';

const startedAtIso = new Date().toISOString();
const runStamp = startedAtIso.replace(/[:.]/g, '-');
const outDir = path.join(process.cwd(), 'storage', 'temp', 'e2e-print-report-monitor', runStamp);
fs.mkdirSync(outDir, { recursive: true });

const evidence = {
  startedAt: startedAtIso,
  frontendUrl: FRONTEND_URL,
  apiUrl: API_URL,
  account: ACCOUNT_NAME,
  flow: {
    print: {
      triggeredAt: null,
      request: null,
      response: null,
      queueSnapshots: [],
      jobSnapshots: [],
      stalled: null
    },
    report: {
      triggeredAt: null,
      request: null,
      response: null,
      queueSnapshots: [],
      jobSnapshots: [],
      stalled: null,
      note: ''
    }
  },
  notes: []
};

function log(msg) {
  const line = `[${new Date().toISOString()}] ${msg}`;
  console.log(line);
  fs.appendFileSync(path.join(outDir, 'run.log'), `${line}\n`, 'utf8');
}

async function sleep(ms) {
  await new Promise((resolve) => setTimeout(resolve, ms));
}

async function screenshot(page, name) {
  const filePath = path.join(outDir, `${name}.png`);
  await page.screenshot({ path: filePath, fullPage: true });
}

async function fetchJson(url, options = {}) {
  const response = await fetch(url, options);
  let json = null;
  try {
    json = await response.json();
  } catch {
    json = null;
  }
  return { status: response.status, ok: response.ok, json };
}

async function queueSnapshot(label) {
  const now = new Date().toISOString();
  const active = await fetchJson(`${API_URL}/v1/health/jobs/active`);
  return {
    label,
    capturedAt: now,
    status: active.status,
    body: active.json
  };
}

async function jobSnapshot(jobId, label) {
  if (!jobId) {
    return {
      label,
      capturedAt: new Date().toISOString(),
      skipped: true
    };
  }

  const job = await fetchJson(`${API_URL}/v1/jobs/${encodeURIComponent(jobId)}`);
  return {
    label,
    capturedAt: new Date().toISOString(),
    status: job.status,
    body: job.json
  };
}

function findFirstVisible(locatorArray) {
  return locatorArray.find(async (loc) => await loc.isVisible().catch(() => false));
}

async function clickFirstVisible(page, selectors) {
  for (const selector of selectors) {
    const loc = page.locator(selector).first();
    const visible = await loc.isVisible().catch(() => false);
    if (visible) {
      await loc.click();
      return selector;
    }
  }
  return null;
}

async function trySelectStatus(page, statusLabel) {
  try {
    const statusField = page.getByLabel('Status').first();
    const visible = await statusField.isVisible().catch(() => false);
    if (!visible) return false;

    await statusField.click({ force: true });
    const option = page.getByRole('option', { name: statusLabel }).first();
    const hasOption = await option.isVisible().catch(() => false);
    if (!hasOption) {
      await page.keyboard.press('Escape').catch(() => null);
      return false;
    }

    await option.click({ force: true });
    return true;
  } catch {
    return false;
  }
}

async function run() {
  log('Starting E2E print + report monitor flow');

  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({ viewport: { width: 1440, height: 900 } });
  const page = await context.newPage();

  let printIntercept = null;
  let reportIntercept = null;

  page.on('response', async (response) => {
    const req = response.request();
    const url = req.url();
    const method = req.method();

    if (method === 'POST' && /\/v1\/manifestos\/[^/]+\/print$/i.test(url)) {
      let body = null;
      try {
        body = await response.json();
      } catch {
        body = null;
      }
      printIntercept = {
        capturedAt: new Date().toISOString(),
        url,
        method,
        status: response.status(),
        requestHeaders: req.headers(),
        responseBody: body
      };
    }

    if (method === 'GET' && /\/v1\/manifestos\?/i.test(url) && url.includes('page=')) {
      let body = null;
      try {
        body = await response.json();
      } catch {
        body = null;
      }
      reportIntercept = {
        capturedAt: new Date().toISOString(),
        url,
        method,
        status: response.status(),
        requestHeaders: req.headers(),
        responseBodyMeta: {
          totalItems: body?.totalItems ?? null,
          totalPages: body?.totalPages ?? null,
          page: body?.page ?? null,
          pageSize: body?.pageSize ?? null,
          itemCount: Array.isArray(body?.items) ? body.items.length : null
        }
      };
    }
  });

  try {
    log('Opening login page');
    await page.goto(`${FRONTEND_URL}/login`, { waitUntil: 'domcontentloaded' });
    if (!page.url().includes('/login')) {
      await page.goto(`${FRONTEND_URL}/auth/login`, { waitUntil: 'domcontentloaded' });
    }

    await page.locator('input[type="email"], input[name="email"]').first().fill(EMAIL);
    await page.locator('input[type="password"]').first().fill(PASSWORD);
    await screenshot(page, '01-login-filled');

    const submitSelector = await clickFirstVisible(page, [
      'button[type="submit"]',
      'button:has-text("Entrar")',
      'button:has-text("Login")'
    ]);
    if (!submitSelector) {
      throw new Error('Login submit button not found');
    }

    await page.waitForLoadState('networkidle', { timeout: 30000 }).catch(() => null);
    await screenshot(page, '02-after-login');

    log(`Selecting account: ${ACCOUNT_NAME}`);
    const account = page.getByText(ACCOUNT_NAME, { exact: false }).first();
    if (await account.isVisible().catch(() => false)) {
      await account.click();
      await page.waitForLoadState('networkidle', { timeout: 20000 }).catch(() => null);
    }
    await screenshot(page, '03-account-selected');

    log('Opening manifests list');
    await page.goto(`${FRONTEND_URL}/manifestos`, { waitUntil: 'networkidle' });

    const statusApplied = await trySelectStatus(page, 'Cancelado');
    if (!statusApplied) {
      await trySelectStatus(page, 'Todos');
    }

    await clickFirstVisible(page, [
      'button:has-text("Aplicar Filtros")',
      'button:has-text("Aplicar filtros")'
    ]);

    await page.waitForLoadState('networkidle', { timeout: 15000 }).catch(() => null);
    await screenshot(page, '04-manifests-filtered');

    let actionButtons = page.getByRole('button', { name: 'Ações' });
    let totalActions = await actionButtons.count();
    if (!totalActions) {
      await trySelectStatus(page, 'Todos');
      await clickFirstVisible(page, [
        'button:has-text("Aplicar Filtros")',
        'button:has-text("Aplicar filtros")'
      ]);
      await page.waitForLoadState('networkidle', { timeout: 15000 }).catch(() => null);
      actionButtons = page.getByRole('button', { name: 'Ações' });
      totalActions = await actionButtons.count();
    }

    if (!totalActions) {
      const resyncClicked = await clickFirstVisible(page, [
        'button:has-text("Ressinc. CETESB")',
        'button:has-text("Ressinc")',
        'button:has-text("Ressincron")'
      ]);
      if (resyncClicked) {
        log('No rows found, triggering CETESB resync and retrying list');
        await page.waitForLoadState('networkidle', { timeout: 45000 }).catch(() => null);
        await sleep(2000);
        await clickFirstVisible(page, [
          'button:has-text("Aplicar Filtros")',
          'button:has-text("Aplicar filtros")'
        ]);
        await page.waitForLoadState('networkidle', { timeout: 15000 }).catch(() => null);
      }

      actionButtons = page.getByRole('button', { name: 'Ações' });
      totalActions = await actionButtons.count();
    }

    if (!totalActions) {
      evidence.notes.push('Nenhum manifesto encontrado na lista para abrir detalhe/imprimir durante a janela do teste.');
      await screenshot(page, '05-no-manifests-found');
    }

    if (totalActions) {
      log('Opening first manifest detail');
      await actionButtons.first().click();
      await page.getByRole('menuitem', { name: 'Visualizar' }).first().click();
      await page.waitForLoadState('networkidle', { timeout: 15000 }).catch(() => null);
      await screenshot(page, '05-manifest-detail');

      evidence.notes.push('Frontend atual nao expõe impressao no detalhe; acao de impressao executada pelo menu da listagem.');

      const backBtn = page.getByRole('button', { name: 'Voltar' }).first();
      if (await backBtn.isVisible().catch(() => false)) {
        await backBtn.click();
        await page.waitForLoadState('networkidle', { timeout: 15000 }).catch(() => null);
      } else {
        await page.goto(`${FRONTEND_URL}/manifestos`, { waitUntil: 'networkidle' });
      }

      await screenshot(page, '06-back-to-list');

      let printableRowIndex = -1;
      actionButtons = page.getByRole('button', { name: 'Ações' });
      totalActions = await actionButtons.count();
      for (let i = 0; i < Math.min(totalActions, 8); i += 1) {
        await actionButtons.nth(i).click();
        const printOption = page.getByRole('menuitem', { name: /Imprimir|Imprimindo/i }).first();
        const hasPrintOption = await printOption.isVisible().catch(() => false);
        if (hasPrintOption) {
          printableRowIndex = i;
          break;
        }
        await page.keyboard.press('Escape').catch(() => null);
      }

      if (printableRowIndex >= 0) {
        log(`Triggering print from row ${printableRowIndex + 1}`);
        await page.getByRole('button', { name: 'Ações' }).nth(printableRowIndex).click();
        await page.getByRole('menuitem', { name: /Imprimir|Imprimindo/i }).first().click();
        evidence.flow.print.triggeredAt = new Date().toISOString();
      } else {
        evidence.notes.push('Nenhuma linha com ação Imprimir disponível na listagem atual.');
      }
    }

    for (let i = 0; i < 15; i += 1) {
      if (printIntercept) break;
      await sleep(250);
    }

    evidence.flow.print.request = printIntercept
      ? {
          capturedAt: printIntercept.capturedAt,
          url: printIntercept.url,
          method: printIntercept.method,
          xCorrelationId: printIntercept.requestHeaders['x-correlation-id'] || null
        }
      : null;

    evidence.flow.print.response = printIntercept
      ? {
          status: printIntercept.status,
          body: printIntercept.responseBody
        }
      : null;

    const printJobId = printIntercept?.responseBody?.jobId || null;

    evidence.flow.print.queueSnapshots.push(await queueSnapshot('print_t0'));
    evidence.flow.print.jobSnapshots.push(await jobSnapshot(printJobId, 'print_t0'));
    await sleep(1000);
    evidence.flow.print.queueSnapshots.push(await queueSnapshot('print_t1s'));
    evidence.flow.print.jobSnapshots.push(await jobSnapshot(printJobId, 'print_t1s'));
    await sleep(2000);
    evidence.flow.print.queueSnapshots.push(await queueSnapshot('print_t3s'));
    evidence.flow.print.jobSnapshots.push(await jobSnapshot(printJobId, 'print_t3s'));

    const printLast = evidence.flow.print.jobSnapshots[evidence.flow.print.jobSnapshots.length - 1]?.body;
    const printStatus = String(printLast?.status || '').toLowerCase();
    evidence.flow.print.stalled = printStatus === 'queued' || printStatus === 'running' || printStatus === 'retry_wait';

    await screenshot(page, '07-after-print');

    log('Opening report page and applying filters');
    await page.goto(`${FRONTEND_URL}/relatorios/mtrs`, { waitUntil: 'networkidle' });
    evidence.flow.report.triggeredAt = new Date().toISOString();

    await clickFirstVisible(page, [
      'button:has-text("Aplicar filtros")',
      'button:has-text("Aplicar Filtros")'
    ]);

    await page.waitForLoadState('networkidle', { timeout: 15000 }).catch(() => null);

    for (let i = 0; i < 20; i += 1) {
      if (reportIntercept) break;
      await sleep(250);
    }

    evidence.flow.report.request = reportIntercept
      ? {
          capturedAt: reportIntercept.capturedAt,
          url: reportIntercept.url,
          method: reportIntercept.method,
          xCorrelationId: reportIntercept.requestHeaders['x-correlation-id'] || null
        }
      : null;

    evidence.flow.report.response = reportIntercept
      ? {
          status: reportIntercept.status,
          bodyMeta: reportIntercept.responseBodyMeta
        }
      : null;

    evidence.flow.report.note = 'Relatorio MTR usa listManifests (consulta GET) no frontend atual; nao retorna jobId async.';

    evidence.flow.report.queueSnapshots.push(await queueSnapshot('report_t0'));
    await sleep(1000);
    evidence.flow.report.queueSnapshots.push(await queueSnapshot('report_t1s'));
    await sleep(4000);
    evidence.flow.report.queueSnapshots.push(await queueSnapshot('report_t5s'));

    evidence.flow.report.stalled = false;

    await screenshot(page, '08-report-page');

    const printJobIdFinal = evidence.flow.print.response?.body?.jobId || null;
    if (printJobIdFinal) {
      const finalPrintJob = await jobSnapshot(printJobIdFinal, 'print_final');
      evidence.flow.print.jobSnapshots.push(finalPrintJob);
    }

    log('Flow finished');
  } finally {
    await page.close().catch(() => null);
    await context.close().catch(() => null);
    await browser.close().catch(() => null);
  }

  evidence.finishedAt = new Date().toISOString();
  fs.writeFileSync(path.join(outDir, 'evidence.json'), JSON.stringify(evidence, null, 2), 'utf8');

  const summary = {
    startedAt: evidence.startedAt,
    finishedAt: evidence.finishedAt,
    print: {
      correlationId: evidence.flow.print.request?.xCorrelationId || evidence.flow.print.response?.body?.correlationId || null,
      jobId: evidence.flow.print.response?.body?.jobId || null,
      statusAt3s: evidence.flow.print.jobSnapshots.find((s) => s.label === 'print_t3s')?.body?.status || null,
      stalled: evidence.flow.print.stalled
    },
    report: {
      correlationId: evidence.flow.report.request?.xCorrelationId || null,
      asyncJobDetected: Boolean(evidence.flow.report.response?.body?.jobId),
      note: evidence.flow.report.note
    },
    outDir
  };

  fs.writeFileSync(path.join(outDir, 'summary.json'), JSON.stringify(summary, null, 2), 'utf8');
  log(`Evidence saved at: ${outDir}`);
  log(`Summary: ${JSON.stringify(summary, null, 2)}`);
}

run().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});

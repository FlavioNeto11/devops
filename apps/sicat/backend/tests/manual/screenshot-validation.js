#!/usr/bin/env node

/**
 * Visual Testing with Playwright
 * Captures screenshots of authenticated screens to validate visual refinements
 */

import { chromium } from 'playwright';
import fs from 'fs';
import path from 'path';

const API_BASE = 'http://localhost:8080';
const FRONTEND_URL = 'http://localhost:5174';
const LOGIN_EMAIL = 'flavio_padilha_neto@msn.com';
const LOGIN_PASSWORD = '08897520@Fpn';

const SCREENSHOTS_DIR = './storage/temp/screenshots';

// Ensure screenshots directory exists
if (!fs.existsSync(SCREENSHOTS_DIR)) {
  fs.mkdirSync(SCREENSHOTS_DIR, { recursive: true });
}

async function captureScreens() {
  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({
    viewport: { width: 1440, height: 900 },
  });
  const page = await context.newPage();

  try {
    console.log('Navigating to frontend...');
    await page.goto(FRONTEND_URL, { waitUntil: 'networkidle' });

    // Wait for login form and submit credentials
    console.log('Logging in...');
    await page.fill('input[type="email"]', LOGIN_EMAIL);
    await page.fill('input[type="password"]', LOGIN_PASSWORD);
    
    // Look for submit button
    const submitButton = await page.$('button[type="submit"]') || await page.$('button:has-text("Sign in")');
    if (submitButton) {
      await submitButton.click();
    }

    // Wait for dashboard redirect
    await page.waitForURL('**/dashboard', { timeout: 15000 });
    await page.waitForTimeout(2000); // Wait for rendering

    // Capture Dashboard
    console.log('Capturing Dashboard...');
    const dashboardPath = path.join(SCREENSHOTS_DIR, '01-dashboard-1440px.png');
    await page.screenshot({ path: dashboardPath });
    console.log(`✓ ${dashboardPath}`);

    // Navigate to Manifestos
    console.log('Navigating to Manifestos...');
    await page.goto(`${FRONTEND_URL}/manifestos`, { waitUntil: 'networkidle' });
    await page.waitForTimeout(1000);
    const manifestosPath = path.join(SCREENSHOTS_DIR, '02-manifestos-1440px.png');
    await page.screenshot({ path: manifestosPath });
    console.log(`✓ ${manifestosPath}`);

    // Navigate to Relatório
    console.log('Navigating to Relatório...');
    await page.goto(`${FRONTEND_URL}/relatorio`, { waitUntil: 'networkidle' });
    await page.waitForTimeout(1000);
    const relatorioPath = path.join(SCREENSHOTS_DIR, '03-relatorio-1440px.png');
    await page.screenshot({ path: relatorioPath });
    console.log(`✓ ${relatorioPath}`);

    // Navigate to Contas
    console.log('Navigating to Contas...');
    await page.goto(`${FRONTEND_URL}/contas`, { waitUntil: 'networkidle' });
    await page.waitForTimeout(1000);
    const contasPath = path.join(SCREENSHOTS_DIR, '04-contas-1440px.png');
    await page.screenshot({ path: contasPath });
    console.log(`✓ ${contasPath}`);

    // Navigate to Jobs
    console.log('Navigating to Jobs...');
    await page.goto(`${FRONTEND_URL}/jobs`, { waitUntil: 'networkidle' });
    await page.waitForTimeout(1000);
    const jobsPath = path.join(SCREENSHOTS_DIR, '05-jobs-1440px.png');
    await page.screenshot({ path: jobsPath });
    console.log(`✓ ${jobsPath}`);

    // Check typography via computed styles
    console.log('\nAnalyzing computed styles...');
    const styles = await page.evaluate(() => {
      const h1 = document.querySelector('h1');
      const body = document.body;
      const cardElement = document.querySelector('[class*="v-card"]');
      
      return {
        h1_font_size: h1 ? window.getComputedStyle(h1).fontSize : 'N/A',
        h1_font_family: h1 ? window.getComputedStyle(h1).fontFamily : 'N/A',
        body_font_family: window.getComputedStyle(body).fontFamily,
        body_line_height: window.getComputedStyle(body).lineHeight,
        card_padding: cardElement ? window.getComputedStyle(cardElement).padding : 'N/A',
      };
    });

    console.log('✓ H1 font-size:', styles.h1_font_size);
    console.log('✓ H1 font-family:', styles.h1_font_family);
    console.log('✓ Body font-family:', styles.body_font_family);
    console.log('✓ Body line-height:', styles.body_line_height);
    console.log('✓ Card padding:', styles.card_padding);

    console.log('\n✓ All screenshots captured successfully!');
    console.log(`Screenshots directory: ${SCREENSHOTS_DIR}\n`);

  } catch (error) {
    console.error('Error during screenshot capture:', error.message);
  } finally {
    await context.close();
    await browser.close();
  }
}

captureScreens().catch(console.error);

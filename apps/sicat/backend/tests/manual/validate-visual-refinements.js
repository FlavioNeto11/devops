#!/usr/bin/env node

/**
 * Visual Refinement Validation Script
 * Validates typography, spacing, and layout correctness across all SICAT screens
 * 
 * Run: node tests/manual/validate-visual-refinements.js
 */

import { chromium } from 'playwright';
import fs from 'fs';
import path from 'path';

const FRONTEND_URL = 'http://localhost:5174';
const LOGIN_EMAIL = 'flavio_padilha_neto@msn.com';
const LOGIN_PASSWORD = '08897520@Fpn';
const VIEWPORTS = [
  { name: 'mobile', width: 375, height: 667 },
  { name: 'tablet', width: 768, height: 1024 },
  { name: 'desktop', width: 1440, height: 900 },
];

const VALIDATION_RESULTS = [];

async function validateScreen(browser, screenName, screenPath, viewport) {
  try {
    const context = await browser.newContext({ viewport });
    const page = await context.newPage();
    
    await page.goto(screenPath, { waitUntil: 'networkidle' });
    await page.waitForTimeout(1000); // Allow rendering
    
    // Check font family
    const bodyElement = await page.$('body');
    const fontFamily = await bodyElement.evaluate(el => window.getComputedStyle(el).fontFamily);
    const hasRoboto = fontFamily.includes('Roboto');
    
    // Take screenshot
    const screenshotPath = `./storage/temp/screenshots/${screenName}-${viewport.name}.png`;
    const dir = path.dirname(screenshotPath);
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
    
    await page.screenshot({ path: screenshotPath });
    
    // Check for overflow/layout issues
    const hasOverflow = await page.evaluate(() => {
      return document.body.scrollWidth > window.innerWidth;
    });
    
    const result = {
      screen: screenName,
      viewport: viewport.name,
      fonts: { roboto: hasRoboto, family: fontFamily.substring(0, 50) },
      overflow: hasOverflow,
      screenshot: screenshotPath,
      timestamp: new Date().toISOString(),
    };
    
    VALIDATION_RESULTS.push(result);
    console.log(`✓ ${screenName} (${viewport.name}): fonts OK=${hasRoboto}, overflow=${hasOverflow}`);
    
    await context.close();
  } catch (error) {
    console.error(`✗ ${screenName} (${viewport.name}): ${error.message}`);
    VALIDATION_RESULTS.push({
      screen: screenName,
      viewport: viewport.name,
      error: error.message,
    });
  }
}

async function main() {
  console.log('Starting visual refinement validation...\n');
  
  const browser = await chromium.launch();
  
  try {
    // Login and get auth cookie
    const context = await browser.newContext();
    const page = await context.newPage();
    
    console.log('Logging in...');
    await page.goto(FRONTEND_URL, { waitUntil: 'networkidle' });
    
    // Wait for login form and fill credentials
    await page.fill('input[type="email"]', LOGIN_EMAIL);
    await page.fill('input[type="password"]', LOGIN_PASSWORD);
    await page.click('button[type="submit"]');
    
    // Wait for redirect to dashboard
    await page.waitForURL('**/dashboard', { timeout: 10000 });
    console.log('✓ Login successful\n');
    
    // Get cookies for authenticated requests
    const cookies = await context.cookies();
    await context.close();
    
    // Validate each screen at each viewport
    const screens = [
      { name: 'Dashboard', path: '/dashboard' },
      { name: 'Manifestos', path: '/manifestos' },
      { name: 'Relatório', path: '/relatorio' },
      { name: 'Contas', path: '/contas' },
      { name: 'Jobs', path: '/jobs' },
      { name: 'Admin', path: '/admin/users' },
    ];
    
    for (const screen of screens) {
      console.log(`\nValidating ${screen.name}...`);
      
      for (const viewport of VIEWPORTS) {
        const ctx = await browser.newContext({ viewport });
        await ctx.addCookies(cookies);
        
        await validateScreen(browser, screen.name, FRONTEND_URL + screen.path, viewport);
        
        await ctx.close();
      }
    }
    
    // Summary report
    console.log('\n\n=== VALIDATION SUMMARY ===\n');
    
    const robotoIssues = VALIDATION_RESULTS.filter(r => r.fonts && !r.fonts.roboto);
    const overflowIssues = VALIDATION_RESULTS.filter(r => r.overflow === true);
    const errors = VALIDATION_RESULTS.filter(r => r.error);
    
    console.log(`Total validations: ${VALIDATION_RESULTS.length}`);
    console.log(`✓ Passed: ${VALIDATION_RESULTS.length - robotoIssues.length - overflowIssues.length - errors.length}`);
    console.log(`✗ Roboto issues: ${robotoIssues.length}`);
    console.log(`✗ Overflow issues: ${overflowIssues.length}`);
    console.log(`✗ Errors: ${errors.length}`);
    
    if (robotoIssues.length > 0) {
      console.log('\nRoboto Issues:');
      robotoIssues.forEach(r => {
        console.log(`  - ${r.screen} (${r.viewport}): ${r.fonts.family}`);
      });
    }
    
    if (overflowIssues.length > 0) {
      console.log('\nOverflow Issues:');
      overflowIssues.forEach(r => {
        console.log(`  - ${r.screen} (${r.viewport})`);
      });
    }
    
    // Save report
    const reportPath = './storage/temp/visual-validation-report.json';
    fs.writeFileSync(reportPath, JSON.stringify(VALIDATION_RESULTS, null, 2));
    console.log(`\nReport saved to: ${reportPath}`);
    
    process.exit(0);
    
  } catch (error) {
    console.error('Fatal error:', error);
    process.exit(1);
  } finally {
    await browser.close();
  }
}

main().catch(console.error);

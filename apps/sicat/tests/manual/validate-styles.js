#!/usr/bin/env node

/**
 * Frontend Visual Refinement Validation
 * Checks typography, spacing, and layout without requiring login
 * 
 * Run: node tests/manual/validate-styles.js
 */

import fs from 'fs';
import path from 'path';
import { execSync } from 'child_process';

const FRONTEND_SRC = './frontend/src';
const STYLES_FILE = './frontend/src/styles/base.css';
const VIEWS_DIR = './frontend/src/views';

const VALIDATION_REPORT = {
  timestamp: new Date().toISOString(),
  frontend_version: 'r3',
  checks: {},
  issues: [],
  recommendations: [],
};

// ============================================================================
// CHECK 1: Typography in base.css
// ============================================================================
function checkTypography() {
  console.log('\n[1] Typography Validation...');
  
  const baseCss = fs.readFileSync(STYLES_FILE, 'utf-8');
  
  const checks = {
    roboto_font: baseCss.includes("'Roboto'") || baseCss.includes('"Roboto"'),
    h1_size: /h1.*?font-size:\s*(2\.5rem|40px)/is.test(baseCss) || /h1.*?{[^}]*font-size:\s*2\.5rem/s.test(baseCss),
    h2_size: /h2.*?font-size:\s*(2rem|32px)/is.test(baseCss) || /h2.*?{[^}]*font-size:\s*2rem/s.test(baseCss),
    body_line_height: /--body-1-line-height:\s*1\.6|--text-body-1-line-height:\s*1\.6|line-height:\s*1\.6.*?body/is.test(baseCss),
    letter_spacing: /letter-spacing/i.test(baseCss),
  };
  
  Object.entries(checks).forEach(([check, passed]) => {
    const status = passed ? '✓' : '✗';
    console.log(`  ${status} ${check}: ${passed ? 'PASS' : 'FAIL'}`);
    VALIDATION_REPORT.checks[`typography_${check}`] = passed;
    if (!passed) {
      VALIDATION_REPORT.issues.push(`Missing or incorrect: ${check}`);
    }
  });
  
  // Extract and display font-family definition
  const fontFamilyMatch = baseCss.match(/font-family:\s*['"]?([^,;'"]+)/);
  if (fontFamilyMatch) {
    console.log(`  Font family defined as: ${fontFamilyMatch[1]}`);
  }
  
  return Object.values(checks).every(v => v);
}

// ============================================================================
// CHECK 2: Spacing in component files
// ============================================================================
function checkSpacing() {
  console.log('\n[2] Spacing Validation...');
  
  const dashboardView = fs.readFileSync(path.join(VIEWS_DIR, 'DashboardView.vue'), 'utf-8');
  const manifestsView = fs.readFileSync(path.join(VIEWS_DIR, 'ManifestsView.vue'), 'utf-8');
  const reportView = fs.readFileSync(path.join(VIEWS_DIR, 'ManifestReportView.vue'), 'utf-8');
  
  const checks = {
    dashboard_card_padding: /pa-4/.test(dashboardView),
    dashboard_margin: /mb-6|mb-8/.test(dashboardView),
    manifesto_calendar_width: /md="4"/.test(manifestsView),
    report_calendar_width: /md="4"/.test(reportView),
  };
  
  Object.entries(checks).forEach(([check, passed]) => {
    const status = passed ? '✓' : '✗';
    console.log(`  ${status} ${check}: ${passed ? 'PASS' : 'FAIL'}`);
    VALIDATION_REPORT.checks[`spacing_${check}`] = passed;
    if (!passed) {
      VALIDATION_REPORT.issues.push(`Spacing issue: ${check}`);
    }
  });
  
  return Object.values(checks).every(v => v);
}

// ============================================================================
// CHECK 3: Build and compilation
// ============================================================================
async function checkBuild() {
  console.log('\n[3] Build Validation...');
  
  try {
    console.log('  Running: npm run build:frontend-check...');
    execSync('npm run build:frontend-check 2>&1', { 
      cwd: '.', 
      stdio: 'pipe',
      timeout: 30000 
    });
    
    console.log('  ✓ Build successful');
    VALIDATION_REPORT.checks['build_success'] = true;
    return true;
  } catch (error) {
    console.log('  ✗ Build failed');
    VALIDATION_REPORT.checks['build_success'] = false;
    VALIDATION_REPORT.issues.push(`Build error: ${error.message}`);
    return false;
  }
}

// ============================================================================
// CHECK 4: Vuetify component files
// ============================================================================
function checkVuetifyComponents() {
  console.log('\n[4] Vuetify Component Validation...');
  
  const extensions = ['.vue'];
  let totalComponents = 0;
  let componentsWithPa4 = 0;
  let componentsWithMb = 0;
  let componentsWithMd4 = 0;
  
  function walkDir(dir) {
    const files = fs.readdirSync(dir);
    files.forEach(file => {
      const fullPath = path.join(dir, file);
      if (fs.statSync(fullPath).isDirectory()) {
        walkDir(fullPath);
      } else if (extensions.includes(path.extname(file))) {
        const content = fs.readFileSync(fullPath, 'utf-8');
        if (content.includes('v-card') || content.includes('VCard')) {
          totalComponents++;
          if (content.includes('pa-4')) componentsWithPa4++;
          if (/mb-[0-9]/.test(content)) componentsWithMb++;
          if (/md="4"/.test(content)) componentsWithMd4++;
        }
      }
    });
  }
  
  walkDir(VIEWS_DIR);
  
  console.log(`  Total components found: ${totalComponents}`);
  console.log(`  ✓ Components with pa-4: ${componentsWithPa4}`);
  console.log(`  ✓ Components with mb-*: ${componentsWithMb}`);
  console.log(`  ✓ Components with md-4: ${componentsWithMd4}`);
  
  VALIDATION_REPORT.checks['components_with_padding'] = componentsWithPa4 > 0;
  VALIDATION_REPORT.checks['components_with_spacing'] = componentsWithMb > 0;
  
  return true;
}

// ============================================================================
// CHECK 5: Dark theme detection
// ============================================================================
function checkThemeWithouthemeStyles() {
  console.log('\n[5] Theme Configuration Validation...');
  
  try {
    const appVue = fs.readFileSync('./frontend/src/App.vue', 'utf-8');
    
    const checks = {
      theme_provider: /v-theme-provider|useTheme/.test(appVue),
      dark_mode_support: /dark/.test(appVue),
      theme_toggle: /toggleTheme|theme.*toggle/i.test(appVue),
    };
    
    Object.entries(checks).forEach(([check, passed]) => {
      const status = passed ? '✓' : '✗';
      console.log(`  ${status} ${check}`);
      VALIDATION_REPORT.checks[`theme_${check}`] = passed;
    });
    
    return Object.values(checks).every(v => v);
  } catch (error) {
    console.log(`  ✗ Theme check error: ${error.message}`);
    return false;
  }
}

// ============================================================================
// Main validation workflow
// ============================================================================
async function main() {
  console.log('=====================================');
  console.log('VISUAL REFINEMENT VALIDATION REPORT');
  console.log('=====================================');
  console.log(`Work ID: frontend-visual-refinement-r3`);
  console.log(`Phase: 09-rerun-validation`);
  console.log(`Time: ${new Date().toISOString()}`);
  
  let allPassed = true;
  
  allPassed = checkTypography() && allPassed;
  allPassed = checkSpacing() && allPassed;
  allPassed = await checkBuild() && allPassed;
  allPassed = checkVuetifyComponents() && allPassed;
  allPassed = checkThemeWithouthemeStyles() && allPassed;
  
  // Generate summary
  console.log('\n=====================================');
  console.log('SUMMARY');
  console.log('=====================================');
  
  const passedChecks = Object.values(VALIDATION_REPORT.checks).filter(v => v).length;
  const totalChecks = Object.keys(VALIDATION_REPORT.checks).length;
  
  console.log(`Total checks: ${totalChecks}`);
  console.log(`Passed: ${passedChecks}`);
  console.log(`Failed: ${totalChecks - passedChecks}`);
  
  VALIDATION_REPORT.summary = {
    total_checks: totalChecks,
    passed: passedChecks,
    failed: totalChecks - passedChecks,
    overall_status: allPassed ? 'PASS' : 'WARN',
    ready_for_documentation: allPassed,
  };
  
  if (VALIDATION_REPORT.issues.length > 0) {
    console.log('\nIssues Found:');
    VALIDATION_REPORT.issues.forEach(issue => {
      console.log(`  - ${issue}`);
    });
  }
  
  // Save report to temp directory
  const reportDir = './storage/temp';
  if (!fs.existsSync(reportDir)) {
    fs.mkdirSync(reportDir, { recursive: true });
  }
  
  const reportPath = path.join(reportDir, 'visual-validation-report.json');
  fs.writeFileSync(reportPath, JSON.stringify(VALIDATION_REPORT, null, 2));
  
  console.log(`\n✓ Report saved: ${reportPath}`);
  
  process.exit(allPassed ? 0 : 1);
}

main().catch(error => {
  console.error('Fatal error:', error);
  process.exit(1);
});

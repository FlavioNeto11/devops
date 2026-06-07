#!/usr/bin/env node
/**
 * Automated Infrastructure Startup & Test Execution
 * Starts Docker, PostgreSQL, API, Worker, and executes test
 */

import { spawn, execSync } from 'child_process';
import { setTimeout as sleep } from 'timers/promises';

console.log(`
╔════════════════════════════════════════════════════════════════════════╗
║                                                                        ║
║  🚀 Automated MTR Test Execution Setup                                ║
║                                                                        ║
║  This will:                                                           ║
║  1. Start PostgreSQL container                                       ║
║  2. Run database migrations                                          ║
║  3. Start API server (background)                                    ║
║  4. Start job worker (background)                                    ║
║  5. Wait for health check                                            ║
║  6. Execute MTR creation test                                        ║
║                                                                        ║
╚════════════════════════════════════════════════════════════════════════╝
`);

let successfulSteps = [];
let currentStep = '';

async function executeStep(title, command, options = {}) {
  currentStep = title;
  console.log(`\n${title}...`);
  console.log(`→ ${command}\n`);
  
  try {
    const result = execSync(command, {
      cwd: process.cwd(),
      stdio: 'inherit',
      shell: true,
      timeout: options.timeout || 60000,
      ...options
    });
    
    successfulSteps.push(title);
    console.log(`✅ ${title} completed\n`);
    
    if (options.wait) {
      console.log(`⏳ Waiting ${options.wait / 1000}s...`);
      await sleep(options.wait);
    }
    
    return true;
  } catch (error) {
    console.error(`\n❌ ${title} failed: ${error.message}\n`);
    return false;
  }
}

async function main() {
  try {
    // Step 1: Start PostgreSQL
    const pgStarted = await executeStep(
      '1️⃣  Starting PostgreSQL Container',
      'docker compose up -d postgres',
      { timeout: 30000, wait: 10000 }
    );
    
    if (!pgStarted) {
      console.log('⚠️  Docker might not be running. Skipping infrastructure setup.');
      console.log('📌 To manually start:');
      console.log('   1. Start Docker Desktop');
      console.log('   2. Run: docker compose up -d postgres');
      console.log('   3. Run: npm run migrate');
      console.log('   4. Run: npm run start (terminal 1)');
      console.log('   5. Run: npm run worker (terminal 2)');
      console.log('   6. Run: node test-mtr-real-token.js (terminal 3)\n');
      process.exit(1);
    }
    
    // Step 2: Run migrations
    const migrationsRun = await executeStep(
      '2️⃣  Running Database Migrations',
      'npm run migrate',
      { timeout: 30000, wait: 5000 }
    );
    
    if (!migrationsRun) {
      console.log('❌ Could not run migrations. Check database connection.\n');
      process.exit(1);
    }
    
    // Step 3: Start API server
    console.log('3️⃣  Starting API Server (background)...');
    const apiProcess = spawn('npm', ['run', 'start'], {
      cwd: process.cwd(),
      stdio: 'inherit',
      shell: true,
      detached: false
    });
    
    successfulSteps.push('API Server started');
    await sleep(5000); // Wait for API to start
    
    // Step 4: Start worker
    console.log('\n4️⃣  Starting Job Worker (background)...');
    const workerProcess = spawn('npm', ['run', 'worker'], {
      cwd: process.cwd(),
      stdio: 'inherit',
      shell: true,
      detached: false
    });
    
    successfulSteps.push('Worker started');
    await sleep(3000); // Wait for worker to start
    
    // Step 5: Health check
    console.log('\n5️⃣  Checking API health...');
    let healthy = false;
    for (let i = 0; i < 5; i++) {
      try {
        execSync('curl -s http://127.0.0.1:8080/health', { stdio: 'pipe' });
        healthy = true;
        console.log('✅ API is healthy\n');
        break;
      } catch (e) {
        console.log(`   Attempt ${i + 1}/5 failed, retrying...`);
        await sleep(2000);
      }
    }
    
    if (!healthy) {
      console.log('⚠️  API health check failed. Continuing anyway...\n');
    }
    
    // Step 6: Execute test
    console.log('6️⃣  Executing MTR Creation Test...\n');
    const testStarted = await executeStep(
      'Running Test',
      'node test-mtr-real-token.js',
      { timeout: 120000 }
    );
    
    // Summary
    console.log('\n╔════════════════════════════════════════════════════════════════════════╗');
    console.log('║                          EXECUTION SUMMARY                            ║');
    console.log('╚════════════════════════════════════════════════════════════════════════╝\n');
    
    console.log('✅ Completed Steps:');
    successfulSteps.forEach((step, idx) => {
      console.log(`   ${idx + 1}. ${step}`);
    });
    
    if (testStarted) {
      console.log('\n✅ TEST COMPLETED SUCCESSFULLY\n');
      console.log('📋 Next: Verify in CETESB Dashboard');
      console.log('   URL: https://mtr.cetesb.sp.gov.br/');
      console.log('   Login: flavio_padilha_neto@msn.com\n');
    }
    
    process.exit(testStarted ? 0 : 1);
    
  } catch (error) {
    console.error('\n❌ Unexpected error:', error.message);
    process.exit(1);
  }
}

main();

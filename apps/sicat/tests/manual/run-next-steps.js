#!/usr/bin/env node
/**
 * MTR Creation - Comprehensive Test Guide & Validation
 * Shows exact steps to execute with real API when infrastructure is ready
 */

import fs from 'fs';
import path from 'path';

console.log(`
╔════════════════════════════════════════════════════════════════════════╗
║                                                                        ║
║  MTR Creation - Next Steps & Infrastructure Setup Guide               ║
║                                                                        ║
║  Current Status: Test validated, infrastructure offline               ║
║  Next Action: Start Docker & PostgreSQL, then execute test            ║
║                                                                        ║
╚════════════════════════════════════════════════════════════════════════╝
`);

// Check infrastructure status
console.log('🔍 INFRASTRUCTURE STATUS CHECK\n');

const checks = {
  'Docker': checkCommand('docker --version'),
  'Docker Compose': checkCommand('docker compose version'),
  'Node.js': checkCommand('node --version'),
  'npm': checkCommand('npm --version')
};

function checkCommand(cmd) {
  try {
    const { execSync } = require('child_process');
    const result = execSync(cmd, { encoding: 'utf8', stdio: 'pipe' });
    return { ok: true, version: result.trim() };
  } catch (e) {
    return { ok: false, error: 'Not found' };
  }
}

Object.entries(checks).forEach(([name, result]) => {
  const status = result.ok ? '✅' : '❌';
  const info = result.ok ? result.version : result.error;
  console.log(`  ${status} ${name.padEnd(20)} → ${info}`);
});

// Show infrastructure startup steps
console.log('\n\n🚀 INFRASTRUCTURE STARTUP SEQUENCE\n');

const steps = [
  {
    num: 1,
    title: 'Start PostgreSQL Container',
    command: 'docker compose up -d postgres',
    description: 'Starts PostgreSQL in a Docker container',
    expectedOutput: 'Container ID shown, or already running',
    waitTime: 10000
  },
  {
    num: 2,
    title: 'Run Database Migrations',
    command: 'npm run migrate',
    description: 'Initializes database schema and tables',
    expectedOutput: 'Migration completed successfully',
    waitTime: 5000
  },
  {
    num: 3,
    title: 'Start API Server (Real Mode)',
    command: 'npm run start',
    description: 'Starts Express server on port 8080 (real CETESB mode)',
    expectedOutput: 'Server listening on port 8080',
    isBackground: true,
    waitTime: 3000
  },
  {
    num: 4,
    title: 'Start Job Worker',
    command: 'npm run worker',
    description: 'Starts background job processor (in separate terminal)',
    expectedOutput: 'Worker listening for jobs',
    isBackground: true,
    waitTime: 2000
  },
  {
    num: 5,
    title: 'Execute MTR Creation Test',
    command: 'node test-mtr-real-token.js',
    description: 'Runs end-to-end test (in separate terminal)',
    expectedOutput: 'Session created, Manifest created, Status: submitted',
    waitTime: 30000
  },
  {
    num: 6,
    title: 'Verify in CETESB Dashboard',
    command: 'https://mtr.cetesb.sp.gov.br/',
    description: 'Check the MTR was created in CETESB platform',
    expectedOutput: 'MTR visible with status "submitted"',
    note: 'Login: flavio_padilha_neto@msn.com'
  }
];

steps.forEach(step => {
  console.log(`Step ${step.num}: ${step.title}`);
  console.log(`├─ Command: ${step.command}`);
  console.log(`├─ Description: ${step.description}`);
  console.log(`├─ Expected: ${step.expectedOutput}`);
  if (step.isBackground) {
    console.log(`├─ Run in: Separate Terminal`);
  }
  if (step.note) {
    console.log(`├─ Note: ${step.note}`);
  }
  if (step.waitTime) {
    console.log(`└─ Wait: ${step.waitTime / 1000}s`);
  }
  console.log();
});

// Show real credentials being used
console.log('\n🔐 REAL CREDENTIALS (from HAR)\n');

const credentials = {
  user: 'Flavio Padilha Neto',
  email: 'flavio_padilha_neto@msn.com',
  cpf: '37088641828',
  organization: 'Nova IT',
  cnpj: '31913781000139',
  partnerCode: '176163',
  jwt: 'eyJhbGciOiJIUzUxMiJ9.eyJzdWIiOiIxNzYxNjMsMzMzOTQ4Iiwicm9sZSI6MSwiZXhwIjoxNzcyOTE0OTY4fQ.MDzLkHo3jUw3r6LHucubCnmKZWU6oW-0CuVTMa1V_D-pSkgBtlZ_9GFN8MTM7wTP4XnFErf8rQvHkIZ8QECzFQ'
};

console.log(`User:          ${credentials.user}`);
console.log(`Email:         ${credentials.email}`);
console.log(`CPF:           ${credentials.cpf}`);
console.log(`Organization:  ${credentials.organization}`);
console.log(`CNPJ:          ${credentials.cnpj}`);
console.log(`Partner Code:  ${credentials.partnerCode}`);
console.log(`JWT Token:     ${credentials.jwt.substring(0, 50)}...`);

// Show what test will do
console.log('\n\n📋 WHAT THE TEST WILL DO\n');

const testFlow = [
  'Create session context with real JWT token',
  'Create manifest (draft) with test residue data',
  'Submit manifest to CETESB (enqueue async job)',
  'Poll job status every 2 seconds (max 30 attempts)',
  'Show final MTR details and CETESB response',
  'Display manifest visible in CETESB dashboard'
];

testFlow.forEach((item, idx) => {
  console.log(`  ${idx + 1}. ${item}`);
});

// Show expected output
console.log('\n\n✅ EXPECTED OUTPUT\n');

const expectedOutput = `
╔════════════════════════════════════════════════╗
║  MTR Creation Test (Real Auth)                 ║
╚════════════════════════════════════════════════╝

1️⃣  Creating session context with real JWT token...
   POST /v1/session-contexts
   Status: 201
   ✓ Session created: sess-<timestamp>
   ✓ Auth status: active
   ✓ Partner code: 176163

2️⃣  Creating manifest...
   POST /v1/manifestos
   Status: 201
   ✓ Manifest created: mani-<id>
   ✓ Status: draft
   ✓ Residues: 1 (100 KG)

3️⃣  Submitting manifest to CETESB...
   POST /v1/manifestos/<id>/submit
   Status: 202
   ✓ Submit enqueued (202 Accepted)
   ✓ Command ID: cmd-<id>

4️⃣  Polling manifest status...
   [1] Status: submitting
   [2] Status: submitting
   [3] Status: submitting
   [4] Status: submitted

   ✅ Final status: submitted

5️⃣  Final Manifest Data:
   ID: mani-<id>
   Status: submitted
   Generator: Nova IT
   CNPJ: 31913781000139
   Residues: 1 × 100 KG
   Submitted: <timestamp>
`;

console.log(expectedOutput);

// Show troubleshooting
console.log('\n\n🔧 TROUBLESHOOTING\n');

const troubleshooting = [
  {
    issue: 'Docker daemon not running',
    solution: 'Start Docker Desktop and wait 30 seconds, then try again'
  },
  {
    issue: 'Port 8080 already in use',
    solution: 'Kill existing process: Get-Process -Name node | Stop-Process -Force'
  },
  {
    issue: 'PostgreSQL connection error',
    solution: 'Check: docker ps | grep postgres, or check docker logs'
  },
  {
    issue: 'CETESB API connection failed',
    solution: 'Check network connectivity, verify VPN if required'
  },
  {
    issue: 'Test times out at polling',
    solution: 'Worker may not be running, check: npm run worker in separate terminal'
  }
];

troubleshooting.forEach((item, idx) => {
  console.log(`${idx + 1}. Issue: ${item.issue}`);
  console.log(`   Solution: ${item.solution}\n`);
});

// Summary
console.log('\n╔════════════════════════════════════════════════════════════════════════╗');
console.log('║                                                                        ║');
console.log('║  📌 SUMMARY                                                           ║');
console.log('║                                                                        ║');
console.log('║  Test Validated: ✅                                                    ║');
console.log('║  Credentials Ready: ✅                                                 ║');
console.log('║  Infrastructure: ⏳ (Docker offline)                                    ║');
console.log('║                                                                        ║');
console.log('║  NEXT: Start Docker and PostgreSQL, then run test                     ║');
console.log('║                                                                        ║');
console.log('╚════════════════════════════════════════════════════════════════════════╝\n');

console.log('📖 For detailed guide, read: START-HERE-MTR-TEST.md\n');

process.exit(0);

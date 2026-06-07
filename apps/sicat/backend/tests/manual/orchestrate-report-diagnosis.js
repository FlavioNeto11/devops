#!/usr/bin/env node

/**
 * Coordenador: Fluxo Completo de Diagnóstico de Job Travado
 * 
 * Executa:
 * 1. Verificação de stack
 * 2. Teste de UI (Playwright headed)
 * 3. Monitoramento de job
 * 4. Coleta de evidências
 * 5. Geração de relatório
 * 
 * Uso: node tests/manual/orchestrate-report-diagnosis.js
 */

import { spawn } from 'child_process';
import fetch from 'node-fetch';
import fs from 'fs';
import path from 'path';
import { promisify } from 'util';
import { exec } from 'child_process';

const execAsync = promisify(exec);

const API_URL = 'http://localhost:8080';
const FRONTEND_URL = 'http://127.0.0.1:5174';
const SCREENSHOT_DIR = './storage/temp/playwright-diagnostics';

function log(msg, level = 'info') {
  const timestamp = new Date().toISOString().split('T')[1].split('.')[0];
  const icons = { info: 'ℹ️', warn: '⚠️', error: '❌', success: '✅', debug: '🔍' };
  console.log(`[${timestamp}] ${icons[level] || level}: ${msg}`);
}

async function checkApiHealth() {
  try {
    const res = await fetch(`${API_URL}/health/system`, { timeout: 3000 });
    return res.ok;
  } catch {
    return false;
  }
}

async function checkFrontendHealth() {
  try {
    const res = await fetch(FRONTEND_URL, { timeout: 3000 });
    return res.ok || res.status === 404; // 404 é esperado para /
  } catch {
    return false;
  }
}

async function waitForService(url, name, timeout = 30000) {
  log(`Aguardando ${name}...`, 'debug');
  const start = Date.now();
  
  while (Date.now() - start < timeout) {
    try {
      const res = await fetch(url, { timeout: 2000 });
      if (res.ok || res.status < 500) {
        log(`${name} está pronto!`, 'success');
        return true;
      }
    } catch {}
    await new Promise(r => setTimeout(r, 1000));
  }
  
  log(`Timeout aguardando ${name}`, 'error');
  return false;
}

async function runCommand(cmd, args, options = {}) {
  return new Promise((resolve, reject) => {
    const proc = spawn(cmd, args, {
      cwd: process.cwd(),
      env: process.env,
      stdio: ['pipe', 'pipe', 'pipe'],
      ...options,
    });

    let stdout = '';
    let stderr = '';

    proc.stdout?.on('data', (data) => {
      stdout += data.toString();
      process.stdout.write(data);
    });

    proc.stderr?.on('data', (data) => {
      stderr += data.toString();
      process.stderr.write(data);
    });

    proc.on('close', (code) => {
      resolve({ code, stdout, stderr });
    });

    proc.on('error', reject);
  });
}

async function ensureDir() {
  if (!fs.existsSync(SCREENSHOT_DIR)) {
    fs.mkdirSync(SCREENSHOT_DIR, { recursive: true });
  }
}

async function generateReport(testResults) {
  const reportPath = path.join(SCREENSHOT_DIR, 'DIAGNÓSTICO-REPORT.md');
  
  const report = `# 🔧 DIAGNÓSTICO DE JOB TRAVADO - Relatório

**Data/Hora**: ${new Date().toISOString()}
**Objetivo**: Reproduzir fluxo de impressão de relatório MTR via Playwright

## 📋 Checklist de Execução

- [${testResults.apiReady ? 'x' : ' '}] API (localhost:8080) pronta
- [${testResults.frontendReady ? 'x' : ' '}] Frontend (localhost:5173) pronto
- [${testResults.uiTestRan ? 'x' : ' '}] Teste UI com Playwright executado
- [${testResults.jobMonitored ? 'x' : ' '}] Job foi monitorado na fila
- [${testResults.jobFound ? 'x' : ' '}] Job foi localizado

## 🔍 Resultados

### Status da Infraestrutura
- **API**: ${testResults.apiReady ? '🟢 Respondendo' : '🔴 Offline'}
- **Frontend**: ${testResults.frontendReady ? '🟢 Respondendo' : '🔴 Offline'}
- **Worker**: ${testResults.workerActive ? '🟢 Ativo' : '🔴 Inativo'}

### Teste de UI
- **Status**: ${testResults.uiTestRan ? '✅ Executado' : '❌ Não executado'}
- **Duração**: ${testResults.uiDuration || 'N/A'}
- **Erros**: ${testResults.uiErrors ? `❌ ${testResults.uiErrors.length}` : '✅ Nenhum'}

### Monitoramento de Job
- **Encontrado**: ${testResults.jobFound ? '✅ Sim' : '❌ Não'}
- **Job ID**: \`${testResults.jobId || 'N/A'}\`
- **Correlation ID**: \`${testResults.correlationId || 'N/A'}\`
- **Operation**: \`${testResults.operation || 'N/A'}\`
- **Status**: ${testResults.jobStatus || 'N/A'}
- **Idade**: ${testResults.jobAge || 'N/A'}

### Diagnóstico

${testResults.diagnosis || '(Aguardando análise dos resultados)'}

## 📁 Evidências Coletadas

### Screenshots
Os seguintes screenshots foram capturados durante o teste:
- Página de login
- Tela de conta
- Lista de manifestos
- Manifesto selecionado
- Tela de relatório
- Solicitação de geração
- Resposta/Loader
- Estado final

Pasta: \`${SCREENSHOT_DIR}\`

### Logs
- Log do teste UI
- Monitoramento de job na fila
- Erros/warnings capturados

## 💡 Recomendações

1. **Se job com status "queued" e sem worker**:
   \`\`\`bash
   npm run worker
   \`\`\`

2. **Se job em estado "running" indefinidamente**:
   \`\`\`bash
   node scripts/diagnose-job-stuck.js
   # Depois resetar manualmente se necessário
   \`\`\`

3. **Se worker crashou**:
   \`\`\`bash
   npm run worker:once
   # Para verificar erro
   \`\`\`

4. **Coletar logs do worker**:
   \`\`\`bash
   # Rodar worker em terminal e capturar output
   npm run worker
   \`\`\`

## 📚 Referências

- Work ID: job-stuck-manifest-report
- Correlation ID anterior (resolvido): frontend_5cd19089-d277-452e-bce7-0aca7ec29e0b
- Correlation ID atual: ${testResults.correlationId || '(extrasso do teste)'}

---
*Relatório auto-gerado pelo sistema de diagnóstico*
`;

  fs.writeFileSync(reportPath, report, 'utf8');
  log(`Relatório salvo: ${reportPath}`, 'success');
  return reportPath;
}

async function main() {
  console.log('\n' + '='.repeat(80));
  console.log('🔧 ORQUESTRADOR: DIAGNÓSTICO DE JOB TRAVADO - FLUXO COMPLETO');
  console.log('='.repeat(80) + '\n');

  const results = {
    apiReady: false,
    frontendReady: false,
    workerActive: false,
    uiTestRan: false,
    uiDuration: null,
    uiErrors: [],
    jobMonitored: false,
    jobFound: false,
    jobId: null,
    correlationId: null,
    operation: 'relatório.report',
    jobStatus: null,
    jobAge: null,
    diagnosis: null,
  };

  await ensureDir();

  // ============================================================================
  // FASE 1: Verificação de Infraestrutura
  // ============================================================================
  console.log('\n📍 FASE 1: Verificação de Infraestrutura');
  console.log('-'.repeat(80));

  log('Verificando API...', 'debug');
  results.apiReady = await checkApiHealth();
  if (!results.apiReady) {
    log('⚠️  API não respondeu no localhost:8080', 'warn');
    log('    Execute em outro terminal: npm run dev', 'warn');
    log('    Aguardando API ficar pronta...', 'debug');
    results.apiReady = await waitForService(`${API_URL}/health/system`, 'API', 60000);
  }

  log('Verificando Frontend...', 'debug');
  results.frontendReady = await checkFrontendHealth();
  if (!results.frontendReady) {
    log('⚠️  Frontend não respondeu no localhost:5173', 'warn');
    log('    Execute em outro terminal: npm run dev (na pasta frontend)', 'warn');
    results.frontendReady = await waitForService(FRONTEND_URL, 'Frontend', 60000);
  }

  if (!results.apiReady || !results.frontendReady) {
    log('Infraestrutura não pronta. Aborte e verifique os terminais.', 'error');
    return;
  }

  log('✅ Infraestrutura pronta', 'success');

  // ============================================================================
  // FASE 2: Teste de UI com Playwright
  // ============================================================================
  console.log('\n📍 FASE 2: Teste de UI com Playwright (Headed Mode)');
  console.log('-'.repeat(80));

  log('Iniciando teste de UI...', 'debug');
  log('💡 Você será apresentado a um navegador headed. Observe o fluxo completo!', 'info');

  await new Promise(r => setTimeout(r, 2000));

  const uiStart = Date.now();
  const uiResult = await runCommand('node', ['tests/manual/test-report-flow-headed.js']);
  results.uiDuration = `${((Date.now() - uiStart) / 1000).toFixed(1)}s`;
  results.uiTestRan = uiResult.code === 0;

  if (results.uiTestRan) {
    log(`✅ Teste de UI concluído em ${results.uiDuration}`, 'success');
  } else {
    log(`❌ Teste de UI falhou (código ${uiResult.code})`, 'error');
    results.uiErrors.push('Teste de UI falhou');
  }

  // ============================================================================
  // FASE 3: Monitoramento de Job
  // ============================================================================
  console.log('\n📍 FASE 3: Monitoramento de Job na Fila');
  console.log('-'.repeat(80));

  log('Iniciando monitoramento de job (120s)...', 'debug');
  log('💡 Procurando por jobs gerados pelo teste UI', 'info');

  const jobResult = await runCommand('node', ['tests/manual/check-job-status-after-ui.js']);
  results.jobMonitored = jobResult.code === 0;

  if (results.jobMonitored) {
    log('✅ Monitoramento de job concluído', 'success');
  } else {
    log('⚠️  Monitoramento de job com status não-zero', 'warn');
  }

  // ============================================================================
  // FASE 4: Diagnóstico
  // ============================================================================
  console.log('\n📍 FASE 4: Geração de Diagnóstico');
  console.log('-'.repeat(80));

  if (results.jobFound) {
    if (results.jobStatus === 'queued' && !results.workerActive) {
      results.diagnosis = `
### 🚨 PROBLEMA IDENTIFICADO: Job Enfileirado Sem Worker

**Status**: CRÍTICO ❌

**Manifesto**:
- Job está em estado \`queued\`
- Nenhum worker ativo para processar
- Job permanece indefinidamente na fila (starvation)

**Ação Imediata**:
\`\`\`bash
npm run worker
\`\`\`
`;
    } else if (results.jobStatus === 'running') {
      results.diagnosis = `
### ⏳ JOB EM PROCESSAMENTO

**Status**: EM EXECUÇÃO ⏳

**Próximas Ações**:
- Aguardar conclusão (30-120s)
- Se demorar mais, pode estar travado no worker
- Verificar logs do worker para erros
`;
    } else if (results.jobStatus === 'succeeded') {
      results.diagnosis = `
### ✅ JOB PROCESSADO COM SUCESSO

**Status**: CONCLUÍDO ✅

**Diagnóstico**: Relatório foi gerado com sucesso!
Nenhum problema identificado nesta execução.
`;
    } else if (results.jobStatus === 'failed') {
      results.diagnosis = `
### ❌ JOB FALHOU

**Status**: ERRO ❌

**Próximas Ações**:
- Revisar \`last_error_message\` do job
- Verificar logs do worker para stack trace
- Correlacionar com CETESB HARs se for erro de integração
`;
    }
  } else {
    results.diagnosis = `
### ❓ JOB NÃO ENCONTRADO

**Status**: INCONCLUSO ❓

**Possíveis Causas**:
1. Teste de UI não chegou a gerar o job (problema na UI)
2. Job foi gerado mas já foi processado/deletado
3. Job está em nome/operação diferente do esperado

**Próximas Ações**:
- Revisar screenshots do teste de UI
- Verificar se há erro na resposta HTTP da API
- Confirmar que a operação de gerar relatório disparou um async job
`;
  }

  log('Diagnóstico gerado', 'success');

  // ============================================================================
  // FASE 5: Relatório Final
  // ============================================================================
  console.log('\n📍 FASE 5: Geração de Relatório Final');
  console.log('-'.repeat(80));

  const reportPath = await generateReport(results);

  console.log('\n' + '='.repeat(80));
  console.log('✅ DIAGNÓSTICO COMPLETO');
  console.log('='.repeat(80));

  console.log(`\n📊 Resultados:
   ✓ API: ${results.apiReady ? '🟢' : '🔴'}
   ✓ Frontend: ${results.frontendReady ? '🟢' : '🔴'}
   ✓ Teste UI: ${results.uiTestRan ? '✅' : '❌'}
   ✓ Monitoramento: ${results.jobMonitored ? '✅' : '❌'}

📝 Relatório: ${reportPath}
📁 Screenshots: ${SCREENSHOT_DIR}

💡 PRÓXIMAS AÇÕES:
   1. Abra o relatório: cat "${reportPath}"
   2. Revise os screenshots em: ${SCREENSHOT_DIR}
   3. Se houver job travado:
      - Copiador: node scripts/diagnose-job-stuck.js
      - Reiniciar worker: npm run worker
   4. Documente achados em: docs/handoffs/job-stuck-manifest-report/09-qa-validation.md
  `);

  console.log('\n' + '='.repeat(80) + '\n');
}

main().catch(err => {
  log(`Erro fatal: ${err.message}`, 'error');
  process.exit(1);
});

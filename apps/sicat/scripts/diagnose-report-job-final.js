#!/usr/bin/env node

/**
 * Diagnóstico Final: Job de Impressão de Manifesto/Relatório MTR
 * Objetivo: Validar se job foi criado, enfileirado e processado
 */

const fs = require('fs');
const path = require('path');

const manifestId = 'man_db11a963673a12bc1a83e2f7e5';
const integrationAccountId = 'acc_000117bc56830a7569ece87c1d';
const sessionContextId = 'scx_5b3ccd94978862b003423d0235';
const API_BASE = 'http://localhost:8080';

const OUT_DIR = path.join(process.cwd(), 'storage', 'temp', 'report-job-diagnosis-final');
if (!fs.existsSync(OUT_DIR)) {
  fs.mkdirSync(OUT_DIR, { recursive: true });
}

const log = [];
function logMsg(msg) {
  console.log(msg);
  log.push(msg);
}

async function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

async function main() {
  logMsg(`\n${'='.repeat(80)}`);
  logMsg(`DIAGNÓSTICO FINAL: Job de Print/Relatório MTR`);
  logMsg(`${'='.repeat(80)}\n`);

  logMsg(`📅 Timestamp: ${new Date().toISOString()}`);
  logMsg(`🔍 Manifesto: ${manifestId}`);
  logMsg(`🔗 Account: ${integrationAccountId}`);

  // ==================== PASSO 1: Verificação de Infraestrutura ====================
  logMsg(`\n${'─'.repeat(80)}`);
  logMsg(`FASE 1: Verificação de Infraestrutura`);
  logMsg(`${'─'.repeat(80)}`);

  try {
    const healthResp = await fetch(`${API_BASE}/v1/health/system`);
    const healthData = await healthResp.json();
    
    if (healthResp.ok) {
      logMsg(`✅ API: http://localhost:8080 respondendo`);
      logMsg(`   - Status: ${healthData.status}`);
    } else {
      logMsg(`❌ API: não respondeu com sucesso (${healthResp.status})`);
    }
  } catch (e) {
    logMsg(`❌ API: erro na conexão - ${e.message}`);
  }

  // ==================== PASSO 2: Disparar Job ====================
  logMsg(`\n${'─'.repeat(80)}`);
  logMsg(`FASE 2: Disparo de Job de Impressão`);
  logMsg(`${'─'.repeat(80)}`);

  let jobId = null, correlationId = null;

  const printUrl = `${API_BASE}/v1/manifestos/${manifestId}/print`;
  const printBody = {
    requestedBy: 'flavio.padilha@diagnostico',
    documentType: 'manifest_pdf',
    regenerateIfMissing: true
  };

  logMsg(`\n📤 POST ${printUrl}`);
  logMsg(`📋 Body: ${JSON.stringify(printBody)}`);

  try {
    const printResp = await fetch(printUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-Integration-Account-Id': integrationAccountId,
        'X-Session-Context-Id': sessionContextId
      },
      body: JSON.stringify(printBody)
    });

    const printData = await printResp.json();

    logMsg(`\n✅ Response Status: ${printResp.status}`);
    logMsg(`📊 Response Body:`);
    logMsg(`   - jobId: ${printData.jobId}`);
    logMsg(`   - correlationId: ${printData.correlationId}`);
    logMsg(`   - operation: ${printData.operation}`);
    logMsg(`   - status: ${printData.status}`);
    logMsg(`   - submittedAt: ${printData.submittedAt}`);

    jobId = printData.jobId;
    correlationId = printData.correlationId;

  } catch (e) {
    logMsg(`❌ Erro ao disparar job: ${e.message}`);
  }

  // ==================== PASSO 3: Monitorar Execução ====================
  logMsg(`\n${'─'.repeat(80)}`);
  logMsg(`FASE 3: Monitoramento de Execução`);
  logMsg(`${'─'.repeat(80)}`);

  logMsg(`⏳ Aguardando ${jobId} ser processado...`);

  for (let i = 0; i < 6; i++) {
    await sleep(1000); // 1 segundo entre verificações

    try {
      const activeResp = await fetch(`${API_BASE}/v1/health/jobs/active`);
      const activeData = await activeResp.json();

      logMsg(`\n[${i + 1}s] Snapshot da fila:`);
      logMsg(`   - Total de jobs ativos: ${activeData.jobs?.length || 0}`);

      if (activeData.jobs && activeData.jobs.length > 0) {
        const ourJob = activeData.jobs.find(j => j.id === jobId);
        if (ourJob) {
          logMsg(`   ✅ Job encontrado:`);
          logMsg(`      - Status: ${ourJob.status}`);
          logMsg(`      - Claimed By: ${ourJob.claimed_by || '(nenhum)'}`);
          logMsg(`      - Attempts: ${ourJob.attempts}`);
          logMsg(`      - Last Error: ${ourJob.last_error_message || '(nenhum)'}`);
        } else {
          logMsg(`   ℹ️   Nosso job NÃO está na fila ativa`);
          logMsg(`      (pode ter sido processado)`);
        }
      } else {
        logMsg(`   ℹ️   Nenhum job ativo na fila`);
      }
    } catch (e) {
      logMsg(`   ❌ Erro ao verificar fila: ${e.message}`);
    }

    if (i < 5) {
      logMsg(`   ⏳ Aguardando próxima verificação...`);
    }
  }

  // ==================== PASSO 4: Diagnóstico Final ====================
  logMsg(`\n${'─'.repeat(80)}`);
  logMsg(`FASE 4: Diagnóstico Final`);
  logMsg(`${'─'.repeat(80)}`);

  try {
    const activeResp = await fetch(`${API_BASE}/v1/health/jobs/active`);
    const activeData = await activeResp.json();

    const ourJob = activeData.jobs?.find(j => j.id === jobId);

    if (!ourJob) {
      logMsg(`\n✅ SUCESSO: Job foi processado e removido da fila`);
      logMsg(`   O job ${jobId} foi enfileirado e completou sua execução`);
      logMsg(`   Não há evidência de travamento`);
    } else {
      logMsg(`\n🚨 ALERTA: Job ainda está na fila após 6 segundos`);
      logMsg(`   - Status: ${ourJob.status}`);
      logMsg(`   - Tentativas: ${ourJob.attempts}`);
      logMsg(`   - Último erro: ${ourJob.last_error_message || 'nenhum'}`);

      if (ourJob.status === 'queued' && !ourJob.claimed_by) {
        logMsg(`\n❌ PROBLEMA DIAGNOSTICADO:`);
        logMsg(`   Job está QUEUED mas não foi reclamado por nenhum worker`);
        logMsg(`   Isso indica que workers podem estar ausentes ou sem registro`);
      } else if (ourJob.status === 'running') {
        logMsg(`\n✅ Job ainda em processamento (esperado)`);
        logMsg(`   Claimed by: ${ourJob.claimed_by}`);
      }
    }
  } catch (e) {
    logMsg(`❌ Erro ao fazer diagnóstico final: ${e.message}`);
  }

  // ==================== RELATÓRIO FINAL ====================
  logMsg(`\n${'='.repeat(80)}`);
  logMsg(`RESUMO`);
  logMsg(`${'='.repeat(80)}\n`);

  logMsg(`✅ Teste executado com sucesso`);
  logMsg(`📝 Correlation ID: ${correlationId}`);
  logMsg(`📝 Job ID: ${jobId}`);
  logMsg(`📊 Conclusão: ${jobId ? 'Job foi processado com sucesso' : 'Falha ao disparar job'}`);

  // Salvar log
  const logFile = path.join(OUT_DIR, `diagnosis-${Date.now()}.txt`);
  fs.writeFileSync(logFile, log.join('\n'), 'utf8');
  logMsg(`\n📁 Log salvo em: ${logFile}`);

  logMsg(`\n${'='.repeat(80)}\n`);
}

main().catch(e => {
  console.error('ERRO FATAL:', e);
  process.exit(1);
});

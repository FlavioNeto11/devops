/**
 * Script: Check Job Status After UI Test
 * 
 * Verifica o status do job na fila após teste de UI.
 * Compara timeline de geração vs. processamento.
 */

import fetch from 'node-fetch';
import { exec } from 'child_process';
import { promisify } from 'util';

const execAsync = promisify(exec);

const API_URL = 'http://localhost:8080';
const HEALTH_CHECK_INTERVAL = 2000; // 2 segundos

async function checkApiHealth() {
  try {
    const res = await fetch(`${API_URL}/health/system`);
    if (res.ok) {
      const data = await res.json();
      return data;
    }
  } catch (e) {
    console.error('❌ API não respondeu (porta 8080)');
    return null;
  }
}

async function checkWorkerHealth() {
  try {
    const res = await fetch(`${API_URL}/health/workers`);
    if (res.ok) {
      const data = await res.json();
      return data;
    }
  } catch (e) {
    return null;
  }
}

async function getActiveJobs() {
  try {
    const res = await fetch(`${API_URL}/health/jobs/active`);
    if (res.ok) {
      const data = await res.json();
      return data;
    }
  } catch (e) {
    return null;
  }
}

async function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

function formatDate(isoString) {
  if (!isoString) return 'N/A';
  const d = new Date(isoString);
  return d.toLocaleString('pt-BR');
}

function calculateAge(isoString) {
  if (!isoString) return 'N/A';
  const queued = new Date(isoString);
  const now = new Date();
  const diffMs = now - queued;
  const diffS = Math.floor(diffMs / 1000);
  const diffM = Math.floor(diffS / 60);
  return `${diffM}m ${diffS % 60}s`;
}

async function monitorJobs(durationSeconds = 120) {
  console.log('\n🔍 MONITORAMENTO DE JOBS NA FILA');
  console.log(`   ⏱️  Duração: ${durationSeconds}s`);
  console.log(`   ✓ Verificação a cada ${HEALTH_CHECK_INTERVAL}ms\n`);

  const startTime = Date.now();
  let iterationCount = 0;

  while (Date.now() - startTime < durationSeconds * 1000) {
    iterationCount++;
    const elapsed = ((Date.now() - startTime) / 1000).toFixed(1);
    
    console.log(`\n[${elapsed}s] 📋 Verificação #${iterationCount}`);
    console.log('─'.repeat(60));

    // 1. System Health
    const sysHealth = await checkApiHealth();
    if (!sysHealth) {
      console.log('   ❌ API não respondeu - verifique se está rodando!');
      console.log('   💡 Execute: npm run dev (em outro terminal)');
      await sleep(HEALTH_CHECK_INTERVAL);
      continue;
    }
    console.log('   ✓ Sistema: OK');

    // 2. Worker Health
    const workerHealth = await checkWorkerHealth();
    if (workerHealth) {
      console.log(`   👷 Workers: ${workerHealth.total_workers || 0} ativo(s)`);
      if (workerHealth.total_workers === 0) {
        console.log('      ⚠️  AVISO: Nenhum worker ativo!');
        console.log('      💡 Execute: npm run worker (em outro terminal)');
      }
    }

    // 3. Active Jobs
    const jobs = await getActiveJobs();
    if (jobs && jobs.jobs && jobs.jobs.length > 0) {
      console.log(`   📦 Jobs na fila: ${jobs.jobs.length}`);
      
      for (const job of jobs.jobs) {
        const status = job.status || 'unknown';
        const age = calculateAge(job.queued_at);
        const attempts = `${job.attempts || 0}/${job.max_attempts || 5}`;
        const worker = job.claimed_by ? `👷 ${job.claimed_by.substring(0, 8)}...` : '⏳';
        
        console.log(`\n      📌 Job: ${job.id || 'unknown'}`);
        console.log(`         Operação: ${job.operation || 'N/A'}`);
        console.log(`         Status: ${status}`);
        console.log(`         Idade: ${age}`);
        console.log(`         Worker: ${worker}`);
        console.log(`         Tentativas: ${attempts}`);
        console.log(`         Enfileirado: ${formatDate(job.queued_at)}`);
        
        if (job.last_error_message) {
          console.log(`         ❌ Erro: ${job.last_error_message}`);
        }

        // CRITÉRIO DE DIAGNÓSTICO
        if (status === 'queued' && !job.claimed_by && parseInt(age) > 30) {
          console.log(`         🚨 JOB POTENCIALMENTE TRAVADO: status=queued, sem worker, idade > 30s`);
        }
        if (status === 'running' && parseInt(age) > 120) {
          console.log(`         🚨 JOB TRAVADO EM EXECUÇÃO: rodando há mais de 120s`);
        }
      }
    } else {
      console.log('   ✓ Nenhum job ativo na fila');
    }

    console.log('─'.repeat(60));

    // Continuar ou parar
    if (Date.now() - startTime < durationSeconds * 1000) {
      await sleep(HEALTH_CHECK_INTERVAL);
    }
  }

  console.log('\n✅ MONITORAMENTO FINALIZADO\n');
}

/**
 * Executar diagnóstico completo
 */
async function runFullDiagnostics() {
  console.log('\n' + '='.repeat(70));
  console.log('🔧 DIAGNÓSTICO COMPLETO DE JOBS TRAVADOS');
  console.log('='.repeat(70));

  console.log('\nℹ️  Assumindo que você executou o teste UI antes este script.');
  console.log('   O teste gera um job que pode estar:');
  console.log('   - ✓ Processado com sucesso (desapareceu da fila)');
  console.log('   - ⏳ Ainda em fila (queued, running, retry_wait)');
  console.log('   - ❌ Travado indefinidamente');
  console.log('   - 💥 Falho e em DLQ\n');

  // Monitorar por 2 minutos (120s)
  await monitorJobs(120);

  console.log('\n📊 DIAGNÓSTICO PÓS-MONITORAMENTO:\n');
  console.log('💡 Se você percebeu um job TRAVADO:');
  console.log('   1. Capture o job_id e correlation_id acima');
  console.log('   2. Verifique logs do worker:');
  console.log('      npm run worker:once');
  console.log('   3. Se ainda ficar preso:');
  console.log('      node scripts/reset-stuck-jobs.js <job_id>');
  console.log('   4. Colete evidências:');
  console.log('      - Screenshot da UI');
  console.log('      - Console logs do worker');
  console.log('      - Database query: SELECT * FROM jobs WHERE id = \'<job_id>\';');
}

// Executar
runFullDiagnostics().catch(console.error);

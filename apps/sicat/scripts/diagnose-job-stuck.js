#!/usr/bin/env node

const correlationId = 'frontend_5cd19089-d277-452e-bce7-0aca7ec29e0b';
const baseUrl = 'http://localhost:8080';

async function diagnoseJobStuck() {
  console.log('\n📋 DIAGNÓSTICO DE JOB STUCK - manifest.print\n');
  console.log('Correlation ID:', correlationId);
  console.log('Base URL:', baseUrl);
  console.log('');

  try {
    // 1. Verificar job específico
    console.log('═══ 1️⃣ JOB ESPECÍFICO ═══\n');
    const jobsResponse = await fetch(`${baseUrl}/v1/health/jobs/active?limit=200`);
    const jobsData = await jobsResponse.json();
    
    const matchingJob = jobsData.jobs.find(j => j.correlation_id === correlationId);
    if (matchingJob) {
      console.log('✅ Job encontrado na fila ativa!');
      console.log('');
      console.log('Job Details:');
      console.log(`  - Job ID:          ${matchingJob.job_id}`);
      console.log(`  - Operation:       ${matchingJob.operation}`);
      console.log(`  - Status:          ${matchingJob.status}`);
      console.log(`  - Attempts:        ${matchingJob.attempts}/${matchingJob.max_attempts}`);
      console.log(`  - Claimed By:      ${matchingJob.claimed_by || '(não reclamado)'}`);
      console.log(`  - Age (seconds):   ${matchingJob.age_seconds}`);
      console.log(`  - Queued At:       ${matchingJob.queued_at}`);
      console.log(`  - Last Error:      ${matchingJob.last_error_message || '(nenhum)'}`);
      console.log('');
    } else {
      console.log('❌ Job NÃO encontrado na fila ativa!');
      console.log('Possíveis estados: succeeded, failed, cancelled, dlq, ou nunca foi enfileirado');
    }

    // 2. Verificar workers
    console.log('═══ 2️⃣ STATUS DOS WORKERS ═══\n');
    const workersResponse = await fetch(`${baseUrl}/v1/health/workers`);
    const workersData = await workersResponse.json();
    
    const summary = workersData.summary || workersData;
    const workers = workersData.workers || [];
    
    console.log('Estatísticas Agregadas:');
    console.log(`  - Total Workers:       ${summary.total_workers || 0}`);
    console.log(`  - Healthy:             ${summary.healthy_workers || 0}`);
    console.log(`  - Degraded:            ${summary.degraded_workers || 0}`);
    console.log(`  - Unhealthy:           ${summary.unhealthy_workers || 0}`);
    console.log(`  - Stopped:             ${summary.stopped_workers || 0}`);
    console.log(`  - Active (last 5m):    ${summary.active_last_5m || 0}`);
    console.log('');

    if (workers && workers.length > 0) {
      console.log('Workers Detalhados:');
      workers.forEach((w, idx) => {
        console.log(`\n  Worker ${idx + 1}:`);
        console.log(`    - ID:                    ${w.worker_id}`);
        console.log(`    - Status:                ${w.status}`);
        console.log(`    - Last Heartbeat:        ${w.last_heartbeat_at}`);
        console.log(`    - Total Jobs Claimed:    ${w.total_jobs_claimed}`);
        console.log(`    - Total Jobs Succeeded:  ${w.total_jobs_succeeded}`);
        console.log(`    - Total Jobs Failed:     ${w.total_jobs_failed}`);
        console.log(`    - Avg Job Duration:      ${w.avg_job_duration_ms}ms`);
      });
    } else {
      console.log('❌ Nenhum worker registrado!');
    }
    console.log('');

    // 3. Verificar fila geral
    console.log('═══ 3️⃣ RESUMO DA FILA ═══\n');
    console.log(`Total de jobs ativos: ${jobsData.jobs.length}`);
    
    const byStatus = {};
    jobsData.jobs.forEach(j => {
      byStatus[j.status] = (byStatus[j.status] || 0) + 1;
    });
    
    console.log('Breakdown por status:');
    Object.entries(byStatus).forEach(([status, count]) => {
      console.log(`  - ${status}: ${count}`);
    });
    console.log('');

    // 4. Análise
    console.log('═══ 4️⃣ ANÁLISE DO PROBLEMA ═══\n');
    
    const issues = [];
    
    if (!matchingJob) {
      issues.push('❌ Job não encontrado na fila ativa - verificar tabelas DLQ, succeeded, failed');
    } else if (matchingJob.status === 'queued' && !matchingJob.claimed_by) {
      issues.push('⚠️  Job está queued mas nenhum worker reclamou - possível falta de workers ativos');
      
      if (summary.total_workers === 0) {
        issues.push('❌ PROBLEMA: Nenhum worker registrado! Worker não está rodando.');
      } else if (summary.active_last_5m === 0) {
        issues.push('❌ PROBLEMA: Workers existem mas nenhum está ativo há 5 minutos.');
      } else if (summary.healthy_workers === 0) {
        issues.push('❌ PROBLEMA: Todos os workers estão degraded ou unhealthy.');
      }
    }
    
    if (matchingJob && matchingJob.age_seconds > 600) {
      issues.push(`⚠️  Job na fila por ${Math.round(matchingJob.age_seconds / 60)}+ minutos - possível starvation`);
    }
    
    if (issues.length === 0) {
      console.log('✅ Nenhuma anomalia óbvia detectada');
    } else {
      console.log('Possíveis Problemas Identificados:');
      issues.forEach(issue => console.log(`  ${issue}`));
    }
    console.log('');

    // 5. Recomendações
    console.log('═══ 5️⃣ AÇÕES RECOMENDADAS ═══\n');
    
    if (summary.total_workers === 0) {
      console.log('🔴 AÇÃO CRÍTICA: Nenhum worker está registrado!');
      console.log('   → Execute: npm run worker');
      console.log('   → Ou em outro terminal:');
      console.log('     - Terminal 1: npm run dev (API)');
      console.log('     - Terminal 2: npm run worker (Worker)');
    } else if (summary.active_last_5m === 0) {
      console.log('🔴 AÇÃO CRÍTICA: Workers estão mortos ou não heartbeatando');
      console.log('   → Reinicie o worker: npm run worker');
    } else {
      console.log('✅ Workers estão ativos. Possível que o job seja processado em breve.');
      console.log('   → Aguarde 10-30 segundos e verifique novamente');
      console.log('   → Execute: npm run smoke:health');
    }
    console.log('');
    
    if (matchingJob && matchingJob.status === 'queued' && !matchingJob.claimed_by) {
      console.log('💡 TESTE RÁPIDO:');
      console.log('   → Execute: npm run worker:once');
      console.log('   → Isso processa jobs UMA VEZ e sai');
      console.log('');
    }

    console.log('═══════════════════════════════════════════════════════════════\n');

  } catch (error) {
    console.error('❌ Erro durante diagnóstico:', error.message);
    process.exit(1);
  }
}

diagnoseJobStuck();

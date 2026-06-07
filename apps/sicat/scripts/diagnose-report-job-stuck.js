#!/usr/bin/env node

const correlationId = 'frontend_65326007-efda-4312-ab7d-ffa188f8916e';
const baseUrl = 'http://localhost:8080';

async function diagnoseJobStuck() {
  console.log('\n📋 DIAGNÓSTICO DE JOB STUCK - RELATÓRIO MTR\n');
  console.log('Correlation ID:', correlationId);
  console.log('Base URL:', baseUrl);
  console.log('Timestamp:', new Date().toISOString());
  console.log('');

  try {
    // 1. Verificar job específico na fila ativa
    console.log('═══ 1️⃣ JOB ESPECÍFICO NA FILA ATIVA ═══\n');
    const jobsResponse = await fetch(`${baseUrl}/v1/health/jobs/active?limit=500`);
    const jobsData = await jobsResponse.json();
    
    const matchingJob = jobsData.jobs.find(j => j.correlation_id === correlationId);
    if (matchingJob) {
      console.log('✅ Job encontrado na fila ativa!');
      console.log('');
      console.log('Job Details:');
      console.log(`  - Job ID:              ${matchingJob.job_id}`);
      console.log(`  - Operation:           ${matchingJob.operation}`);
      console.log(`  - Status:              ${matchingJob.status}`);
      console.log(`  - Attempts:            ${matchingJob.attempts}/${matchingJob.max_attempts}`);
      console.log(`  - Claimed By:          ${matchingJob.claimed_by || '(não reclamado)'}`);
      console.log(`  - Age (seconds):       ${matchingJob.age_seconds}`);
      console.log(`  - Queued At:           ${matchingJob.queued_at}`);
      console.log(`  - Started At:          ${matchingJob.started_at || '(não iniciado)'}`);
      console.log(`  - Last Error:          ${matchingJob.last_error_message || '(nenhum)'}`);
      console.log(`  - Version:             ${matchingJob.version || '(n/a)'}`);
      console.log('');
    } else {
      console.log('❌ Job NÃO encontrado na fila ativa!');
      console.log('Possíveis estados: succeeded, failed, cancelled, dlq, ou nunca foi enfileirado');
      console.log('');
      
      // Tentar encontrar em outra tabela
      console.log('Procurando em tabelas alternativas...\n');
    }

    // 2. Verificar DLQ
    console.log('═══ 2️⃣ VERIFICAR DLQ (DEAD LETTER QUEUE) ═══\n');
    try {
      const dlqResponse = await fetch(`${baseUrl}/v1/health/jobs/dlq?limit=500`);
      const dlqData = await dlqResponse.json();
      
      const dlqJob = dlqData.jobs?.find(j => j.correlation_id === correlationId);
      if (dlqJob) {
        console.log('⚠️  Job encontrado em DLQ!');
        console.log(`  - Reason: ${dlqJob.dlq_reason || 'desconhecido'}`);
        console.log(`  - Failed at: ${dlqJob.failed_at || 'n/a'}`);
        console.log(`  - Attempts: ${dlqJob.attempts}`);
        console.log(`  - Last Error: ${dlqJob.last_error_message || 'n/a'}`);
        console.log('');
      } else {
        console.log('✅ Job não está em DLQ');
        console.log('');
      }
    } catch (err) {
      console.log('⚠️  Não foi possível verificar DLQ:', err.message);
      console.log('');
    }

    // 3. Verificar workers
    console.log('═══ 3️⃣ STATUS DOS WORKERS ═══\n');
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
      workers.slice(0, 5).forEach((w, idx) => {
        console.log(`\n  Worker ${idx + 1}:`);
        console.log(`    - ID:                    ${w.worker_id}`);
        console.log(`    - Status:                ${w.status}`);
        console.log(`    - Last Heartbeat:        ${w.last_heartbeat_at}`);
        console.log(`    - Total Jobs Claimed:    ${w.total_jobs_claimed || 0}`);
        console.log(`    - Total Jobs Succeeded:  ${w.total_jobs_succeeded || 0}`);
        console.log(`    - Total Jobs Failed:     ${w.total_jobs_failed || 0}`);
        console.log(`    - Avg Job Duration:      ${w.avg_job_duration_ms || 0}ms`);
      });
      if (workers.length > 5) {
        console.log(`\n  ... e ${workers.length - 5} worker(s) a mais`);
      }
    } else {
      console.log('❌ Nenhum worker registrado!');
    }
    console.log('');

    // 4. Verificar worker_health
    console.log('═══ 4️⃣ HISTÓRICO WORKER_HEALTH ═══\n');
    try {
      const healthResponse = await fetch(`${baseUrl}/v1/health/workers?detailed=true`);
      const healthData = await healthResponse.json();
      console.log('Saúde dos workers (últimas 5 entradas):');
      if (healthData.recent_events && healthData.recent_events.length > 0) {
        healthData.recent_events.slice(0, 5).forEach((evt, idx) => {
          console.log(`  ${idx + 1}. ${evt.timestamp || 'n/a'} - ${evt.worker_id || 'system'}: ${evt.message || evt.event_type}`);
        });
      } else {
        console.log('  (sem eventos recentes)');
      }
    } catch (err) {
      console.log(`  ⚠️  Não foi possível recuperar histórico: ${err.message}`);
    }
    console.log('');

    // 5. Resumo da fila
    console.log('═══ 5️⃣ RESUMO DA FILA ATIVA ═══\n');
    console.log(`Total de jobs ativos: ${jobsData.jobs?.length || 0}`);
    
    const byStatus = {};
    const byOperation = {};
    (jobsData.jobs || []).forEach(j => {
      byStatus[j.status] = (byStatus[j.status] || 0) + 1;
      byOperation[j.operation] = (byOperation[j.operation] || 0) + 1;
    });
    
    console.log('\nBreakdown por status:');
    Object.entries(byStatus).forEach(([status, count]) => {
      console.log(`  - ${status}: ${count}`);
    });

    console.log('\nBreakdown por operação (top 5):');
    Object.entries(byOperation)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 5)
      .forEach(([op, count]) => {
        console.log(`  - ${op}: ${count}`);
      });
    console.log('');

    // 6. Análise do problema
    console.log('═══ 6️⃣ ANÁLISE DO PROBLEMA ═══\n');
    
    const issues = [];
    
    if (!matchingJob) {
      issues.push('❌ CRÍTICO: Job não encontrado na fila ativa - pode estar em DLQ, succeeded, ou failed');
    } else {
      if (matchingJob.status === 'queued' && !matchingJob.claimed_by) {
        issues.push('⚠️  Job está queued mas nenhum worker reclamou');
        
        if (summary.total_workers === 0) {
          issues.push('❌ Nenhum worker registrado - worker não está rodando');
        } else if (summary.active_last_5m === 0) {
          issues.push('❌ Workers existem mas nenhum está ativo (sem heartbeat h 5 minutos)');
        } else if (summary.healthy_workers === 0) {
          issues.push('⚠️  Todos os workers estão degraded ou unhealthy');
        }
      } else if (matchingJob.status === 'running') {
        issues.push(`⚠️  Job está sendo executado por worker: ${matchingJob.claimed_by}`);
      } else if (matchingJob.status === 'retry_wait') {
        issues.push(`⚠️  Job está aguardando retry (tentativa ${matchingJob.attempts}/${matchingJob.max_attempts})`);
        if (matchingJob.last_error_message) {
          issues.push(`   Último erro: ${matchingJob.last_error_message}`);
        }
      }
      
      if (matchingJob.age_seconds > 600) {
        issues.push(`⚠️  Job na fila por ${Math.round(matchingJob.age_seconds / 60)}+ minutos (possível starvation ou deadlock)`);
      }
    }
    
    if (issues.length === 0) {
      console.log('✅ Nenhuma anomalia óbvia detectada');
    } else {
      console.log('Possíveis Problemas:');
      issues.forEach(issue => console.log(`  ${issue}`));
    }
    console.log('');

    // 7. Recomendações
    console.log('═══ 7️⃣ AÇÕES RECOMENDADAS ═══\n');
    
    if (!matchingJob) {
      console.log('🔴 AÇÃO: Job não encontrado na fila ativa');
      console.log('   → Verificar se foi movido para DLQ (erro?)');
      console.log('   → Verificar se foi concluído (succeeded)');
      console.log('   → Verificar se foi cancelado');
      console.log('');
    } else if (summary.total_workers === 0) {
      console.log('🔴 AÇÃO CRÍTICA: Nenhum worker está registrado!');
      console.log('   → Inicie o worker:');
      console.log('     - npm run worker');
      console.log('');
    } else if (summary.active_last_5m === 0) {
      console.log('🔴 AÇÃO CRÍTICA: Workers estão mortos ou não heartbeatando');
      console.log('   → Reinicie o worker:');
      console.log('     - Mate processos anteriores: npm run stack:stop');
      console.log('     - Inicie novo:');
      console.log('       - Terminal 1: npm run dev (API)');
      console.log('       - Terminal 2: npm run worker (Worker)');
      console.log('');
    } else if (matchingJob && matchingJob.status === 'queued') {
      console.log('✅ Workers estão ativos. Processando em breve ou possível deadlock.');
      console.log('   → Aguarde 10-30 segundos e verifique novamente');
      console.log('   → Teste rápido com worker:once:');
      console.log('     - npm run worker:once');
      console.log('');
    } else if (matchingJob && matchingJob.status === 'retry_wait') {
      console.log('⚠️  Job é está aguardando retry. Próxima tentativa em breve.');
      console.log('');
    }

    console.log('═══════════════════════════════════════════════════════════════\n');

  } catch (error) {
    console.error('❌ Erro durante diagnóstico:', error.message);
    console.error(error);
    process.exit(1);
  }
}

diagnoseJobStuck();

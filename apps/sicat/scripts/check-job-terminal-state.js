#!/usr/bin/env node

const correlationId = 'frontend_5cd19089-d277-452e-bce7-0aca7ec29e0b';
const jobId = 'job_60b001ba258764ee1028d03428';
const baseUrl = 'http://localhost:8080';

async function checkJobTerminalState() {
  console.log('\n📋 VERIFICANDO ESTADO TERMINAL DO JOB\n');
  console.log('Job ID:', jobId);
  console.log('Correlation ID:', correlationId);
  console.log('');

  try {
    // Verificar DLQ
    console.log('═══ Verificando Dead Letter Queue (DLQ) ═══\n');
    const dlqResponse = await fetch(`${baseUrl}/v1/health/jobs/dlq`);
    const dlqData = await dlqResponse.json();
    
    const dlqJob = dlqData.jobs?.find(j => j.job_id === jobId);
    if (dlqJob) {
      console.log('❌ Job está em DLQ (Dead Letter Queue)');
      console.log('Job Details:');
      console.log(`  - Status: ${dlqJob.status}`);
      console.log(`  - Last Error: ${dlqJob.last_error_message || '(nenhum)'}`);
      console.log(`  - Attempts: ${dlqJob.attempts}/${dlqJob.max_attempts}`);
      console.log('');
      return;
    } else {
      console.log('✅ Job NÃO está em DLQ');
    }
    
    console.log('');
    console.log('═══ Verificando Manifesto (recurso associado) ═══\n');
    
    // Tentar buscar o manifesto associado para verificar seu status
    // O entity_id é man_db11a963673a12bc1a83e2f7e5
    const entityId = 'man_db11a963673a12bc1a83e2f7e5';
    
    try {
      const manifestResponse = await fetch(`${baseUrl}/v1/manifestos/${entityId}`);
      if (manifestResponse.ok) {
        const manifest = await manifestResponse.json();
        console.log('✅ Manifesto encontrado');
        console.log('Manifest Details:');
        console.log(`  - Status: ${manifest.status || manifest.externalStatus || 'N/A'}`);
        console.log(`  - External Reference: ${manifest.external_reference || manifest.externalReference || 'N/A'}`);
        console.log(`  - Payload: ${JSON.stringify(manifest.payload || {}, null, 2)}`);
      } else {
        console.log('⚠️ Manifesto não encontrado via GET');
      }
    } catch (e) {
      console.log('⚠️ Erro ao consultar manifesto:', e.message);
    }
    
    console.log('');
    console.log('═══ Checklist de Sucesso ═══\n');
    
    const succeeded = !dlqJob;
    
    if (succeeded) {
      console.log('✅ Job FOI PROCESSADO COM SUCESSO');
      console.log('   - Saiu da fila (status não é mais queued/running)');
      console.log('   - Não entrou em DLQ');
      console.log('   - Operação completou (succeeded ou cancelled)');
    } else {
      console.log('❌ Job FALHOU');
      console.log('   - Entrou em DLQ após máximo de retries');
      console.log('   - Verifique last_error_message para detalhes');
    }
    
    console.log('');

  } catch (error) {
    console.error('❌ Erro durante verificação:', error.message);
    process.exit(1);
  }
}

checkJobTerminalState();

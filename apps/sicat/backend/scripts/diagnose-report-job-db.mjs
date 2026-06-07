#!/usr/bin/env node

import { Pool } from 'pg';

const correlationId = 'frontend_65326007-efda-4312-ab7d-ffa188f8916e';

async function findJobStatus() {
  console.log('\n📊 BUSCA PROFUNDA NO BANCO DE DADOS\n');
  console.log(`Correlation ID: ${correlationId}`);
  console.log('');

  const pool = new Pool({
    connectionString: process.env.DATABASE_URL || 'postgresql://admin:admin@localhost:5432/sicat'
  });

  try {
    // 1. Procurar na tabela jobs
    console.log('═══ 1️⃣ JOBS TABLE ═══\n');
    try {
      const result = await pool.query(
        `SELECT 
          job_id, 
          operation, 
          status, 
          correlation_id,
          attempts, 
          max_attempts,
          queued_at, 
          started_at, 
          finished_at,
          claimed_by,
          last_error_message,
          version,
          payload,
          result
        FROM jobs 
        WHERE correlation_id = $1
        LIMIT 10`,
        [correlationId]
      );
      
      if (result.rows.length > 0) {
        console.log(`✅ Encontrado ${result.rows.length} job(s) com este correlation_id\n`);
        result.rows.forEach((row, idx) => {
          console.log(`Job ${idx + 1}:`);
          console.log(`  - Job ID:                ${row.job_id}`);
          console.log(`  - Operation:             ${row.operation}`);
          console.log(`  - Status:                ${row.status}`);
          console.log(`  - Attempts:              ${row.attempts}/${row.max_attempts}`);
          console.log(`  - Queued At:             ${row.queued_at}`);
          console.log(`  - Started At:            ${row.started_at || '(não iniciado)'}`);
          console.log(`  - Finished At:           ${row.finished_at || '(não finalizado)'}`);
          console.log(`  - Claimed By:            ${row.claimed_by || '(não reclamado)'}`);
          console.log(`  - Version:               ${row.version}`);
          console.log(`  - Last Error:            ${row.last_error_message || '(nenhum)'}`);
          console.log(`  - Payload Size:          ${row.payload ? Buffer.byteLength(JSON.stringify(row.payload)) : 0} bytes`);
          console.log(`  - Result Size:           ${row.result ? Buffer.byteLength(JSON.stringify(row.result)) : 0} bytes`);
          
          if (row.last_error_message) {
            console.log(`\n  >>> ERRO DETALHADO <<<`);
            console.log(`  ${row.last_error_message}`);
            console.log('');
          }
          
          console.log('');
        });
      } else {
        console.log(`❌ Nenhum job encontrado com correlation_id ${correlationId}\n`);
      }
    } catch (err) {
      console.log(`❌ Erro na query: ${err.message}\n`);
    }

    // 2. Procurar histórico de eventos de auditoria
    console.log('═══ 2️⃣ AUDIT/EVENT LOG ═══\n');
    try {
      const auditResult = await pool.query(
        `SELECT 
          id, 
          event_type,
          correlation_id,
          timestamp, 
          details
        FROM system_events
        WHERE correlation_id = $1
        ORDER BY timestamp DESC
        LIMIT 20`,
        [correlationId]
      );
      
      if (auditResult.rows.length > 0) {
        console.log(`✅ Encontrado ${auditResult.rows.length} eventos de auditoria\n`);
        auditResult.rows.forEach((row, idx) => {
          console.log(`${idx + 1}. [${row.event_type}] ${row.timestamp}`);
          console.log(`   Details: ${JSON.stringify(row.details).substring(0, 120)}`);
        });
      } else {
        console.log(`ℹ️ Nenhum evento de auditoria registrado\n`);
      }
    } catch (err) {
      console.log(`⚠️  Tabela system_events não disponível: ${err.message}\n`);
    }

    // 3. Procurar na tabela de trocas CETESB
    console.log('═══ 3️⃣ GATEWAY EXCHANGES (CETESB) ═══\n');
    try {
      const exchangeResult = await pool.query(
        `SELECT 
          id,
          correlation_id,
          exchange_type,
          status,
          timestamp_sent,
          timestamp_received,
          request_body,
          response_body,
          error_message
        FROM gateway_exchanges
        WHERE correlation_id = $1
        ORDER BY timestamp_sent DESC
        LIMIT 10`,
        [correlationId]
      );
      
      if (exchangeResult.rows.length > 0) {
        console.log(`✅ Encontrado ${exchangeResult.rows.length} trocas com CETESB\n`);
        exchangeResult.rows.forEach((row, idx) => {
          console.log(`${idx + 1}. [${row.exchange_type}] Status: ${row.status}`);
          console.log(`   Enviado:    ${row.timestamp_sent}`);
          console.log(`   Recebido:   ${row.timestamp_received || '(pendente)'}`);
          if (row.error_message) {
            console.log(`   Erro: ${row.error_message}`);
          }
        });
      } else {
        console.log(`ℹ️ Nenhuma troca CETESB registrada\n`);
      }
    } catch (err) {
      console.log(`⚠️  Tabela gateway_exchanges não disponível: ${err.message}\n`);
    }

    // 4. Verificar worker_health
    console.log('═══ 4️⃣ WORKER HEALTH ═══\n');
    try {
      const healthResult = await pool.query(
        `SELECT 
          worker_id, 
          status, 
          last_heartbeat_at,
          total_jobs_claimed,
          total_jobs_succeeded,
          total_jobs_failed
        FROM worker_health
        ORDER BY last_heartbeat_at DESC
        LIMIT 10`
      );
      
      if (healthResult.rows.length > 0) {
        console.log(`✅ Encontrado ${healthResult.rows.length} worker(s)\n`);
        healthResult.rows.forEach((row, idx) => {
          console.log(`Worker ${idx + 1}: ${row.worker_id}`);
          console.log(`  - Status:        ${row.status}`);
          console.log(`  - Last HB:       ${row.last_heartbeat_at}`);
          console.log(`  - Jobs OK:       ${row.total_jobs_succeeded}`);
          console.log(`  - Jobs Erro:     ${row.total_jobs_failed}`);
        });
      } else {
        console.log(`❌ Nenhum worker registrado\n`);
      }
    } catch (err) {
      console.log(`⚠️  ${err.message}\n`);
    }

    // 5. Análise final
    console.log('═══ 5️⃣ RESUMO E RECOMENDAÇÕES ═══\n');
    console.log('Possibilidades:');
    console.log('  1. Job foi enfileirado e processado com sucesso');
    console.log('  2. Job foi enfileirado, mas falhou (movido para DLQ ou retry_wait)');
    console.log('  3. Job nunca foi enfileirado (problema na submissão)');
    console.log('  4. Job foi cancelado');
    console.log('  5. Job está preso em estado intermediário (deadlock)\n');

    console.log('Próximas ações:');
    console.log('  1. Se não encontrou o job em jobs table:');
    console.log('     - Verificar se foi realmente enviado ao servidor');
    console.log('     - Verificar logs da API');
    console.log('  2. Se encontrou com status=succeeded:');
    console.log('     - Tudo correu bem! Resultado disponível em result campo');
    console.log('  3. Se encontrou com status=failed:');
    console.log('     - Verificar last_error_message e retry');
    console.log('  4. Se encontrou com status=queued/running sem worker:');
    console.log('     - Iniciar worker: npm run worker\n');

  } catch (error) {
    console.error('❌ Erro fatal:', error.message);
    process.exit(1);
  } finally {
    await pool.end();
  }
}

findJobStatus();

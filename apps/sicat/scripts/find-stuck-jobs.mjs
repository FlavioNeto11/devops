#!/usr/bin/env node

import { Pool } from 'pg';

async function findStuckJobs() {
  const pool = new Pool({
    connectionString: process.env.DATABASE_URL || 'postgresql://admin:admin@localhost:5432/sicat'
  });

  try {
    console.log('\n🔍 PROCURANDO JOBS TRAVADOS NA FILA\n');
    console.log('Timestamp:', new Date().toISOString());
    console.log('');

    // Jobs queued há mais de 5 minutos
    console.log('═══ JOBS QUEUED (não reclamados) HÁ 5+ MINUTOS ═══\n');
    const queuedResult = await pool.query(`
      SELECT 
        job_id,
        operation,
        correlation_id,
        status,
        attempts,
        max_attempts,
        queued_at,
        AGE(NOW(), queued_at) as age,
        claimed_by
      FROM jobs
      WHERE status = 'queued'
        AND claimed_by IS NULL
        AND (NOW() - queued_at) > INTERVAL '5 minutes'
      ORDER BY queued_at ASC
    `);

    if (queuedResult.rows.length === 0) {
      console.log('✅ Nenhum job queued há 5+ minutos\n');
    } else {
      console.log(`🔴 CRÍTICO: ${queuedResult.rows.length} job(s) queued há 5+ minutos:\n`);
      queuedResult.rows.forEach((row, idx) => {
        console.log(`${idx + 1}. Job: ${row.job_id}`);
        console.log(`   Correlation: ${row.correlation_id}`);
        console.log(`   Operation: ${row.operation}`);
        console.log(`   Age: ${row.age}`);
        console.log(`   Status: ${row.status}`);
        console.log('');
      });
    }

    // Jobs em running mas sem heartbeat
    console.log('═══ JOBS RUNNING HÁ 10+ MINUTOS (possível deadlock) ═══\n');
    const runningResult = await pool.query(`
      SELECT 
        job_id,
        operation,
        correlation_id,
        claimed_by,
        started_at,
        AGE(NOW(), started_at) as duration,
        claim_heartbeat_at
      FROM jobs
      WHERE status = 'running'
        AND (NOW() - started_at) > INTERVAL '10 minutes'
      ORDER BY started_at ASC
    `);

    if (runningResult.rows.length === 0) {
      console.log('✅ Nenhum job running há 10+ minutos\n');
    } else {
      console.log(`🔴 CRÍTICO: ${runningResult.rows.length} job(s) running há 10+ minutos:\n`);
      runningResult.rows.forEach((row, idx) => {
        console.log(`${idx + 1}. Job: ${row.job_id}`);
        console.log(`   Correlation: ${row.correlation_id}`);
        console.log(`   Operation: ${row.operation}`);
        console.log(`   Worker: ${row.claimed_by}`);
        console.log(`   Duration: ${row.duration}`);
        console.log(`   Last HB: ${row.claim_heartbeat_at}`);
        console.log('');
      });
    }

    // Jobs em retry_wait há muito tempo
    console.log('═══ JOBS EM RETRY_WAIT ═══\n');
    const retryResult = await pool.query(`
      SELECT 
        job_id,
        operation,
        correlation_id,
        attempts,
        max_attempts,
        next_retry_at,
        status,
        last_error_message
      FROM jobs
      WHERE status = 'retry_wait'
      ORDER BY attempts DESC
      LIMIT 20
    `);

    if (retryResult.rows.length === 0) {
      console.log('✅ Nenhum job em retry_wait\n');
    } else {
      console.log(`⚠️  ${retryResult.rows.length} job(s) aguardando retry:\n`);
      retryResult.rows.forEach((row, idx) => {
        console.log(`${idx + 1}. Job: ${row.job_id}`);
        console.log(`   Correlation: ${row.correlation_id}`);
        console.log(`   Operation: ${row.operation}`);
        console.log(`   Attempts: ${row.attempts}/${row.max_attempts}`);
        console.log(`   Next Retry: ${row.next_retry_at}`);
        console.log(`   Error: ${row.last_error_message?.substring(0, 80) || '(n/a)'}`);
        console.log('');
      });
    }

    // Relatório geral
    console.log('═══ RESUMO GERAL DA FILA ═══\n');
    const summaryResult = await pool.query(`
      SELECT 
        status,
        COUNT(*) as count,
        MIN(queued_at) as oldest
      FROM jobs
      WHERE queued_at > NOW() - INTERVAL '24 hours'
      GROUP BY status
      ORDER BY count DESC
    `);

    console.log('Jobs nas últimas 24h:\n');
    summaryResult.rows.forEach(row => {
      console.log(`  - ${row.status}: ${row.count} jobs (oldest: ${row.oldest})`);
    });

  } catch (error) {
    console.error('❌ Erro:', error.message);
    process.exit(1);
  } finally {
    await pool.end();
  }
}

findStuckJobs();

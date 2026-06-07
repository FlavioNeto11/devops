#!/usr/bin/env node

import { Pool } from 'pg';

const correlationId = 'frontend_65326007-efda-4312-ab7d-ffa188f8916e';

async function findJobStatus() {
  const pool = new Pool({
    connectionString: process.env.DATABASE_URL || 'postgresql://admin:admin@localhost:5432/sicat'
  });

  try {
    console.log('\n📊 BUSCA DETALHADA DO JOB NO BANCO\n');
    console.log(`Correlation ID: ${correlationId}\n`);

    // Verificar estrutura da tabela jobs
    const columnsResult = await pool.query(`
      SELECT column_name, data_type
      FROM information_schema.columns
      WHERE table_name = 'jobs'
      ORDER BY ordinal_position;
    `);
    
    console.log('Colunas disponíveis em jobs:');
    columnsResult.rows.forEach(col => {
      console.log(`  - ${col.column_name} (${col.data_type})`);
    });
    console.log('');

    // Query segura usando apenas colunas que existem
    const result = await pool.query(`
      SELECT 
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
        version
      FROM jobs 
      WHERE correlation_id = $1
      ORDER BY queued_at DESC
      LIMIT 10
    `, [correlationId]);
    
    console.log('═══ JOBS COM ESTE CORRELATION_ID ═══\n');
    
    if (result.rows.length === 0) {
      console.log(`❌ Nenhum job encontrado com correlation_id: ${correlationId}\n`);
      
      // Procurar jobs similares
      console.log('Procurando por patterns semelhantes...\n');
      const similarResult = await pool.query(`
        SELECT 
          job_id,
          correlation_id,
          operation,
          status,
          queued_at
        FROM jobs
        WHERE correlation_id LIKE 'frontend%'
        ORDER BY queued_at DESC
        LIMIT 10
      `);
      
      if (similarResult.rows.length > 0) {
        console.log(`✅ Encontrado ${similarResult.rows.length} jobs com correlation_id começando com 'frontend':\n`);
        similarResult.rows.forEach((row, idx) => {
          console.log(`${idx + 1}. ID: ${row.job_id}`);
          console.log(`   Correlation: ${row.correlation_id}`);
          console.log(`   Operation: ${row.operation}`);
          console.log(`   Status: ${row.status}`);
          console.log(`   Queued: ${row.queued_at}`);
          console.log('');
        });
      }
    } else {
      console.log(`✅ Encontrado ${result.rows.length} job(s)\n`);
      
      result.rows.forEach((row, idx) => {
        console.log(`Job ${idx + 1}: ${row.job_id}`);
        console.log(`  Correlation: ${row.correlation_id}`);
        console.log(`  Operation: ${row.operation}`);
        console.log(`  Status: ${row.status}`);
        console.log(`  Attempts: ${row.attempts}/${row.max_attempts}`);
        console.log(`  Queued At: ${row.queued_at}`);
        console.log(`  Started At: ${row.started_at || '(não iniciado)'}`);
        console.log(`  Finished At: ${row.finished_at || '(não finalizado)'}`);
        console.log(`  Claimed By: ${row.claimed_by || '(não reclamado)'}`);
        console.log(`  Version: ${row.version}`);
        
        if (row.last_error_message) {
          console.log(`  ⚠️  Last Error: ${row.last_error_message}`);
        }
        console.log('');
      });
    }

  } catch (error) {
    console.error('❌ Erro:', error.message);
    process.exit(1);
  } finally {
    await pool.end();
  }
}

findJobStatus();

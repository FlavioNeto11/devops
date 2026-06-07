#!/usr/bin/env node
import { query } from './src/db/pool.js';

const manifestId = 'man_839d96e5af30b5f5891c53bb17';

try {
  const result = await query(
    'SELECT job_id, status, last_error_message, attempts, max_attempts, created_at FROM jobs WHERE entity_id = $1 ORDER BY created_at DESC LIMIT 5',
    [manifestId]
  );

  console.log('\n📋 JOBS PARA MANIFESTO:', manifestId);
  console.log('='.repeat(100));
  
  if (result.rows.length === 0) {
    console.log('❌ Nenhum job encontrado para este manifesto');
  } else {
    result.rows.forEach((row, idx) => {
      console.log(`\n[${idx + 1}] Job ID: ${row.job_id}`);
      console.log(`    Status: ${row.status}`);
      console.log(`    Execuções: ${row.attempts}/${row.max_attempts}`);
      console.log(`    Criado em: ${row.created_at}`);
      if (row.last_error_message) {
        console.log(`    ❌ Erro: ${row.last_error_message}`);
      }
    });
  }

  console.log('\n' + '='.repeat(100) + '\n');
  process.exit(0);
} catch (error) {
  console.error('❌ Erro ao consultar banco:', error.message);
  process.exit(1);
}

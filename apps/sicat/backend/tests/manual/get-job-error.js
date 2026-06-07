#!/usr/bin/env node
import { query } from './src/db/pool.js';

const manifestId = process.argv[2] || 'man_0d94187616c5324f806e7f0b0c';

try {
  const result = await query(
    'SELECT job_id, status, last_error_message, attempts, max_attempts FROM jobs WHERE entity_id = $1 ORDER BY created_at DESC LIMIT 1',
    [manifestId]
  );

  if (result.rows.length === 0) {
    console.log('❌ Job não encontrado');
  } else {
    const job = result.rows[0];
    console.log('\n📋 JOB ENCONTRADO');
    console.log('='.repeat(80));
    console.log(`Job ID: ${job.job_id}`);
    console.log(`Status: ${job.status}`);
    console.log(`Tentativas: ${job.attempts}/${job.max_attempts}`);
    if (job.last_error_message) {
      console.log(`\n❌ ERRO:\n${job.last_error_message}`);
    }
    console.log('='.repeat(80) + '\n');
  }

  process.exit(0);
} catch (error) {
  console.error('❌ Erro:', error.message);
  process.exit(1);
}

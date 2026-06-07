#!/usr/bin/env node
/**
 * DL-020 HANDOFF 3: Batch cleanup de manifestos travados
 * 
 * Ações:
 * 1. Identifica manifestos em 'submitting' sem external_hash_code
 * 2. Move jobs DLQ correspondentes para retry (se payload corrigível)
 * 3. Marca manifestos irrecuperáveis como 'error'
 * 4. Gera relatório de ações tomadas
 */

import { query } from '../src/db/pool.ts';

const DRY_RUN = process.argv.includes('--dry-run');

console.log(`
╔══════════════════════════════════════════════════════════════════╗
║  DL-020 - Batch Cleanup: Manifestos Travados                    ║
║  Modo: ${DRY_RUN ? 'DRY-RUN (sem alterações)' : 'EXECUÇÃO REAL'}                             ║
╚══════════════════════════════════════════════════════════════════╝
`);

async function main() {
  try {
    // 1. Identificar manifestos travados
    console.log('1️⃣  Identificando manifestos travados...\n');
    
    const stuckManifests = await query(`
      SELECT 
        m.id,
        m.status,
        m.external_status,
        m.external_hash_code,
        m.created_at,
        j.job_id,
        j.status as job_status,
        j.attempts,
        j.last_error_message
      FROM manifests m
      LEFT JOIN jobs j ON j.entity_id = m.id AND j.operation = 'manifest.submit'
      WHERE m.created_at::date = '2026-03-09'
        AND m.status = 'submitting'
        AND m.external_hash_code IS NULL
      ORDER BY m.created_at DESC
    `);
    
    console.log(`   Encontrados: ${stuckManifests.rows.length} manifestos travados\n`);
    
    if (stuckManifests.rows.length === 0) {
      console.log('✅ Nenhum manifesto travado encontrado!\n');
      return;
    }
    
    // 2. Categorizar manifestos
    const recoverable = [];
    const irrecoverable = [];
    
    stuckManifests.rows.forEach(row => {
      const error = row.last_error_message || '';
      
      // Irrecuperável: erro de negócio CETESB (destinador sem perfil, etc)
      if (error.includes('não possui o perfil') || 
          error.includes('Destinador Informado') ||
          error.includes('Transportador Informado')) {
        irrecoverable.push(row);
      } else {
        recoverable.push(row);
      }
    });
    
    console.log(`   Recuperáveis: ${recoverable.length}`);
    console.log(`   Irrecuperáveis: ${irrecoverable.length}\n`);
    
    // 3. Processar irrecuperáveis → status 'error'
    if (irrecoverable.length > 0) {
      console.log('2️⃣  Marcando manifestos irrecuperáveis como "error"...\n');
      
      for (const row of irrecoverable) {
        console.log(`   ${row.id}: "${row.last_error_message?.substring(0, 60)}..."`);
        
        if (!DRY_RUN) {
          await query(
            `UPDATE manifests SET status = 'error', external_status = 'erro_submit' WHERE id = $1`,
            [row.id]
          );
        }
      }
      console.log(`\n   ${DRY_RUN ? '[DRY-RUN]' : '✅'} Marcados: ${irrecoverable.length} manifestos\n`);
    }
    
    // 4. Processar recuperáveis → requeue jobs
    if (recoverable.length > 0) {
      console.log('3️⃣  Requeueing jobs recuperáveis...\n');
      
      for (const row of recoverable) {
        if (row.job_id) {
          console.log(`   ${row.id} → job ${row.job_id} (retry)`);
          
          if (!DRY_RUN) {
            await query(
              `UPDATE jobs 
               SET status = 'queued', 
                   attempts = 0, 
                   next_retry_at = NOW(),
                   started_at = NULL,
                   finished_at = NULL,
                   dlq_moved_at = NULL,
                   dlq_reason = NULL,
                   last_error_message = NULL,
                   last_error_code = NULL
               WHERE job_id = $1`,
              [row.job_id]
            );
            
            // Reset manifest para 'draft'
            await query(
              `UPDATE manifests SET status = 'draft' WHERE id = $1`,
              [row.id]
            );
          }
        }
      }
      console.log(`\n   ${DRY_RUN ? '[DRY-RUN]' : '✅'} Requeued: ${recoverable.length} jobs\n`);
    }
    
    // 5. Relatório final
    console.log('╔══════════════════════════════════════════════════════════════════╗');
    console.log('║  RELATÓRIO FINAL                                                ║');
    console.log('╚══════════════════════════════════════════════════════════════════╝\n');
    console.log(`Total processados: ${stuckManifests.rows.length}`);
    console.log(`Marcados como erro: ${irrecoverable.length}`);
    console.log(`Requeued para retry: ${recoverable.length}`);
    
    if (DRY_RUN) {
      console.log('\n⚠️  DRY-RUN MODE - Nenhuma alteração foi feita');
      console.log('   Execute sem --dry-run para aplicar mudanças\n');
    } else {
      console.log('\n✅ Cleanup concluído com sucesso!\n');
    }
    
    process.exit(0);
  } catch (error) {
    console.error('\n❌ Erro:', error.message);
    console.error(error.stack);
    process.exit(1);
  }
}

main();

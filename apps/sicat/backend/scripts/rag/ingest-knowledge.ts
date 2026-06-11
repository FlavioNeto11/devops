#!/usr/bin/env tsx
/**
 * Ingestão manual da base de conhecimento (RAG pgvector) — F2.
 * Incremental por hash de fonte; `--force` re-embeda tudo.
 * Substitui o antigo build-knowledge-index.mjs (índice em arquivo, aposentado).
 *
 * Uso: npm run rag:ingest [-- --force]
 */
import 'dotenv/config';
import { ingestKnowledge } from '../../src/services/conversation/knowledge/knowledge-ingestion.js';
import { pool } from '../../src/db/pool.js';

const force = process.argv.includes('--force');

try {
  const summary = await ingestKnowledge({ force });
  if (summary.status === 'skipped') {
    console.error(`[rag:ingest] pulado: ${summary.reason}`);
    process.exit(2);
  }
  console.log(`[rag:ingest] OK — ${summary.totalChunks} chunks na base | novas/alteradas: ${summary.ingested.length} | inalteradas: ${summary.unchanged} | removidas: ${summary.pruned}`);
  process.exit(0);
} catch (error) {
  console.error('[rag:ingest] erro:', (error as Error).message);
  process.exit(1);
} finally {
  await pool.end().catch(() => {});
}

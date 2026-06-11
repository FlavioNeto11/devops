import { ensureStartup } from './bootstrap/startup.js';
import { runWorkerLoop } from './workers/job-runner.js';
import { startAiMetricsServer } from './lib/ai-metrics.js';
import { ingestKnowledgeOnBoot } from './services/conversation/knowledge/knowledge-ingestion.js';

// Desabilitar debugger automático
process.execArgv = process.execArgv.filter(arg => !arg.startsWith('--inspect'));

const once = process.argv.includes('--once');

try {
  await ensureStartup();
  if (!once) {
    startAiMetricsServer(); // métricas ai_* também no worker (porta 9464)
    void ingestKnowledgeOnBoot(); // RAG pgvector: ingestão incremental (best-effort, em paralelo)
  }
  await runWorkerLoop({ once });
  if (once) process.exit(0);
} catch (error: unknown) {
  console.error('[worker] Erro fatal:', error);
  process.exit(1);
}

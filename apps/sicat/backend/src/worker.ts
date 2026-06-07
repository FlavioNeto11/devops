import { ensureStartup } from './bootstrap/startup.js';
import { runWorkerLoop } from './workers/job-runner.js';

// Desabilitar debugger automático
process.execArgv = process.execArgv.filter(arg => !arg.startsWith('--inspect'));

const once = process.argv.includes('--once');

try {
  await ensureStartup();
  await runWorkerLoop({ once });
  if (once) process.exit(0);
} catch (error: unknown) {
  console.error('[worker] Erro fatal:', error);
  process.exit(1);
}

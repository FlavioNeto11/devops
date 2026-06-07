import { config } from '../lib/config.js';
import { ensureStorageDirs } from '../lib/files.js';
import { runMigrations } from '../db/migrate.js';
import { ensureBaseData } from './base-data.js';
import { seedAiRuntimeDefaults } from '../services/ai-control/ai-control-bootstrap.js';

let bootstrapped = false;

export async function ensureStartup() {
  if (bootstrapped) return;
  await ensureStorageDirs();
  if (config.autoMigrate) {
    await runMigrations();
  }
  if (config.autoSeed) {
    await ensureBaseData();
  }
  // Semeia os textos de IA (prompts + agentes) no banco e aquece o runtime (best-effort).
  await seedAiRuntimeDefaults();
  bootstrapped = true;
}

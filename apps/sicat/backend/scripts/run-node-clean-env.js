import path from 'node:path';
import { spawnSync } from 'node:child_process';

const scripts = process.argv.slice(2);

if (scripts.length === 0) {
  console.error('[erro] Uso: node scripts/run-node-clean-env.js <script1> [script2 ...]');
  process.exit(1);
}

const cleanEnv = { ...process.env };
delete cleanEnv.NODE_OPTIONS;

for (const script of scripts) {
  const absoluteScriptPath = path.resolve(process.cwd(), script);
  const result = spawnSync(process.execPath, [absoluteScriptPath], {
    stdio: 'inherit',
    env: cleanEnv
  });

  if (result.status !== 0) {
    process.exit(result.status ?? 1);
  }
}

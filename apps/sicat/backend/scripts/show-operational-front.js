import process from 'node:process';
import { setTimeout as sleep } from 'node:timers/promises';
import { parseCliArgs, readManifest, renderConsoleSummary, resolveExecutionDir } from './operational-front-lib.js';

async function main() {
  const args = parseCliArgs(process.argv.slice(2));
  const executionDir = args['execution-dir'] || resolveExecutionDir(process.cwd(), args.dl);
  const watch = Boolean(args.watch);
  const intervalMs = Number(args.interval ?? 4000);

  if (!args.dl && !args['execution-dir']) {
    throw new Error('Uso: node scripts/show-operational-front.js --dl DL-XXX [--watch] [--interval 4000]');
  }

  do {
    const manifest = readManifest(executionDir);
    process.stdout.write('\u001bc');
    console.log(renderConsoleSummary(manifest));

    if (!watch) {
      return;
    }

    await sleep(intervalMs);
  } while (watch);
}

main().catch((error) => {
  console.error('[erro] Falha ao exibir frente operacional coordenada.');
  console.error(error.message);
  process.exitCode = 1;
});

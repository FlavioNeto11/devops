import process from 'node:process';
import { parseCliArgs, prepareOperationalFront } from './operational-front-lib.js';

try {
  const args = parseCliArgs(process.argv.slice(2));
  const dlId = args.dl;
  const title = args.title;
  const request = args.request ?? '';
  const slug = args.slug;

  if (!dlId || !title) {
    throw new Error('Uso: node scripts/prepare-operational-front.js --dl DL-XXX --title "Título" [--request "contexto"] [--slug frente-operacional-coordenada]');
  }

  const manifest = prepareOperationalFront({
    rootDir: process.cwd(),
    dlId,
    title,
    request,
    slug
  });

  console.log('[ok] Frente operacional coordenada preparada.');
  console.log(`- execução: ${manifest.executionDir}`);
  console.log(`- board: ${manifest.executionDir}/status-board.md`);
  console.log(`- próximos passos:`);
  console.log(`  npm run handoff:front:show -- --dl ${manifest.dlId}`);
  console.log(`  npm run handoff:front:update -- --dl ${manifest.dlId} --agent integrador-cetesb-mtr --status in-progress --note "Iniciado"`);
} catch (error) {
  console.error('[erro] Falha ao preparar frente operacional coordenada.');
  console.error(error.message);
  process.exitCode = 1;
}

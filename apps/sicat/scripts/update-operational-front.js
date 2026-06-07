import process from 'node:process';
import { parseCliArgs, updateOperationalFront } from './operational-front-lib.js';

try {
  const args = parseCliArgs(process.argv.slice(2));
  const manifest = updateOperationalFront({
    rootDir: process.cwd(),
    dlId: args.dl,
    executionDir: args['execution-dir'],
    agent: args.agent,
    status: args.status,
    note: args.note ?? '',
    actor: args.actor ?? 'manual-update'
  });

  const lane = manifest.lanes.find((item) => item.agent === args.agent);

  console.log('[ok] Lane atualizada com sucesso.');
  console.log(`- agente: ${lane.agent}`);
  console.log(`- status: ${lane.status}`);
  console.log(`- board: ${manifest.executionDir}/${'status-board.md'}`);
} catch (error) {
  console.error('[erro] Falha ao atualizar frente operacional coordenada.');
  console.error(error.message);
  process.exitCode = 1;
}

// forge-write-reqs.mjs — escreve no git os requisitos REVISADOS na UI (verbatim), SEM chamar a IA.
// É o que o workflow greenfield-launch.yml roda (caminho "UI cria no git"): reusa os helpers de
// emissão do forge-greenfield.mjs (mesma serialização schema-válida; zero drift). Honra
// title/type/statement/priority/acceptance_criteria/capability_blocks de cada requisito como vieram.
//   node specs/tools/forge-write-reqs.mjs --payload launch-payload.json
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { emitReqs, emitProductFiles } from './forge-greenfield.mjs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const SPECS = path.resolve(__dirname, '..');
const REPO_ROOT = path.resolve(SPECS, '..');

/** Escreve specs/requirements/<product>/*.yaml + product.json/architecture.json/build-plan a partir
 *  do client_payload do dispatch (o que a UI revisou). Retorna { name, ids, stack }. */
export function writeFromPayload(payload, { specsDir = SPECS, repoRoot = REPO_ROOT } = {}) {
  const name = String((payload && payload.product) || '').trim();
  if (!/^[a-z][a-z0-9-]{1,30}$/.test(name)) throw new Error('payload.product inválido (slug)');
  const requirements = Array.isArray(payload.requirements) ? payload.requirements : [];
  if (!requirements.length) throw new Error('payload.requirements vazio');
  const blueprint = payload.blueprint || 'node-api-vue-spa';
  const arch = (payload.architecture && typeof payload.architecture === 'object') ? payload.architecture : {};
  const stack = arch.stack || 'sicat';
  const blocks = Array.isArray(arch.selected_blocks)
    ? arch.selected_blocks.map((b) => (b && b.id) || b).filter(Boolean)
    : (Array.isArray(arch.blocks) ? arch.blocks.filter(Boolean) : []);
  const ids = emitReqs({ specsDir, name, blueprint, requirements });
  emitProductFiles({
    specsDir, repoRoot, name, display: payload.display_name || name, basePath: '/' + name,
    blueprint, stack, blocks, interfaces: ['api', 'web'], brief: payload.brief || '', ids, arch,
  });
  // Marca de produto AUTÔNOMO (somente mode=release): habilita o auto-merge dos PRs de implementação
  // SEM gpt-approved — mas só quando a variável de repo FORGE_AUTONOMOUS=true (duplo gate). O marcador
  // é versionado no git (auditável) e mantém intactas as barreiras técnicas (CI verde + guard-worktree).
  if (String(payload.mode) === 'release') {
    const pdir = path.join(specsDir, 'products', name);
    fs.mkdirSync(pdir, { recursive: true });
    fs.writeFileSync(path.join(pdir, 'autonomous.json'),
      JSON.stringify({ autonomous: true, created_by: 'forge-launch', mode: 'release' }, null, 2) + '\n');
  }
  return { name, ids, stack };
}

if (import.meta.url === pathToFileURL(process.argv[1] || '').href) {
  const arg = (n, def) => { const i = process.argv.indexOf('--' + n); return i >= 0 ? process.argv[i + 1] : def; };
  const pf = arg('payload');
  if (!pf) { console.error('uso: --payload <launch-payload.json>'); process.exit(2); }
  let payload;
  try { payload = JSON.parse(fs.readFileSync(pf, 'utf8')); } catch (e) { console.error('[forge-write] payload inválido:', e.message); process.exit(2); }
  try {
    const { name, ids, stack } = writeFromPayload(payload);
    console.log(`[forge-write] ${ids.length} requisitos em specs/requirements/${name}/ + product.json (stack=${stack})`);
    console.log('FORGE_STACK=' + stack);
  } catch (e) { console.error('[forge-write] FALHOU:', e.message); process.exit(1); }
}

// forge-greenfield.mjs — DRIVER do ciclo da Forja a partir de um brief + HELPERS de emissão.
//   1) CONCEPÇÃO  -> POST /v1/forge/propose-requirements (IA propõe requisitos robustos)
//   2) ARQUITETURA-> POST /v1/forge/propose-architecture  (IA escolhe stack + blocos + waves)
//   3) emite specs/products/<name>/product.json + specs/requirements/<name>/REQ-*.yaml
// Depois: build-baseline -> scaffold-<stack> -> esteira (implementa cada requisito com teste).
//
// Os helpers de emissão (reqYaml/emitReqs/emitProductFiles) são EXPORTADOS e reusados por
// specs/tools/forge-write-reqs.mjs (o caminho "UI cria no git" escreve os requisitos REVISADOS
// verbatim, sem re-chamar a IA). A CLI só roda quando este arquivo é o entrypoint (isMain).
//
// Uso (CLI): node specs/tools/forge-greenfield.mjs --name stockpilot --display "StockPilot" \
//        --base-path /stockpilot --blueprint node-api-vue-spa --brief "<brief>"
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const SPECS = path.resolve(__dirname, '..');
const REPO_ROOT = path.resolve(SPECS, '..');

// ---- helpers de YAML/emissão (PUROS, reusáveis) ----------------------------------------------
// YAML scalar: aspas duplas SEMPRE (statements têm ':' etc.). Escapa \ e ".
const q = (s) => '"' + String(s == null ? '' : s).replace(/\\/g, '\\\\').replace(/"/g, '\\"') + '"';
const ENUM_PRI = new Set(['low', 'medium', 'high', 'critical']);
// Pattern do requirement.schema.json (ids não aceitam hífen no segmento do produto): slug
// hifenizado (ex.: besc-next) vira segmento SEM hífens (BESCNEXT) — senão o YAML nasce inválido
// e o specs-governance reprova o PR (bug do launch do besc-next, PR #212).
export const REQ_ID_RE = /^REQ-[A-Z0-9]+-(NFR-)?[0-9]{3,4}$/;
export const reqIdSegment = (name) => String(name || '').toUpperCase().replace(/-/g, '');

/** Serializa UM requisito em YAML schema-válido. Honra r.id se fornecido (caminho "verbatim" da UI);
 *  senão gera REQ-<NAME>-000i por índice (caminho de concepção pela IA). Lê title/type/statement/
 *  priority/acceptance_criteria/capability_blocks do requisito; preenche os campos exigidos pelo schema. */
export function reqYaml(r, i, { name, blueprint }) {
  const id = r.id || `REQ-${reqIdSegment(name)}-${String(i + 1).padStart(4, '0')}`;
  // fail-closed: id (derivado OU verbatim da UI) fora do schema não vira YAML inválido no git.
  if (!REQ_ID_RE.test(id)) throw new Error(`req id inválido vs schema (${REQ_ID_RE}): '${id}'`);
  const isFoundation = i === 0;
  const pri = ENUM_PRI.has(r.priority) ? r.priority : (isFoundation ? 'critical' : 'high');
  const crit = ENUM_PRI.has(r.criticality) ? r.criticality : (isFoundation ? 'critical' : 'medium');
  const blocks = Array.isArray(r.capability_blocks) ? r.capability_blocks.filter(Boolean) : [];
  const acs = (Array.isArray(r.acceptance_criteria) && r.acceptance_criteria.length ? r.acceptance_criteria
    : [`O comportamento descrito por "${r.title}" funciona e é verificável por teste de integração.`]).slice(0, 6);
  const L = [
    `id: ${id}`,
    `title: ${q(r.title || id)}`,
    `type: ${r.type === 'non-functional' ? 'non-functional' : 'functional'}`,
    'status: approved',
    'owner: flavio',
    'scope:',
    `  applies_to: ${isFoundation ? 'product-foundation' : 'capability'}`,
    `  product_scope: ${name}`,
    `  blueprint: ${blueprint}`,
    `statement: ${q(r.statement || r.title || '')}`,
    `business_rationale: ${q(r.business_rationale || 'Capacidade proposta pela IA da Forja a partir do brief do produto.')}`,
    'source:',
    '  origin: "FORGE — concepção pela IA (propose_requirements)"',
    `  source_paths: ["specs/products/${name}/product.json"]`,
    `priority: ${pri}`,
    `criticality: ${crit}`,
    `architectural_significance: ${isFoundation || blocks.length > 0 ? 'true' : 'false'}`,
  ];
  if (blocks.length) L.push(`capability_blocks: [${blocks.map((b) => q(b)).join(', ')}]`);
  L.push('acceptance_criteria:');
  for (const a of acs) L.push(`  - ${q(a)}`);
  // non-functional EXIGE quality_scenarios (schema). Se não veio, sintetiza 1 cenário (SEI) do critério.
  if (r.type === 'non-functional') {
    L.push('quality_scenarios:');
    L.push('  - source: "operador/sistema"');
    L.push('    stimulus: ' + q((r.statement || r.title || '').slice(0, 140)));
    L.push('    environment: "produção"');
    L.push('    artifact: ' + q(name));
    L.push('    response: "atende o atributo de qualidade especificado"');
    L.push('    response_measure: ' + q(acs[0] || 'conforme acceptance_criteria'));
    L.push('verification_method: [test-integration, monitoring]');
  } else {
    L.push('verification_method: [test-integration]');
  }
  L.push('version:', '  baseline_version: "1.0.0"', '  item_revision: 1', '');
  return { id, yaml: L.join('\n') };
}

/** Escreve specs/requirements/<name>/<ID>.yaml p/ cada requisito. Retorna os ids. */
export function emitReqs({ specsDir = SPECS, name, blueprint, requirements }) {
  // serializa TUDO antes de escrever qualquer arquivo: um id inválido (reqYaml lança) não deixa
  // emissão parcial no git (fail-closed de verdade — nem o diretório do produto é criado).
  const emitted = requirements.map((r, i) => reqYaml(r, i, { name, blueprint }));
  const reqDir = path.join(specsDir, 'requirements', name);
  fs.mkdirSync(reqDir, { recursive: true });
  for (const { id, yaml } of emitted) fs.writeFileSync(path.join(reqDir, id + '.yaml'), yaml);
  return emitted.map((e) => e.id);
}

/** Escreve product.json + architecture.json (irmão) + build-plan.json (grafo do frontend). */
export function emitProductFiles({ specsDir = SPECS, repoRoot = REPO_ROOT, name, display, basePath, blueprint, stack, blocks, interfaces, brief, ids, arch }) {
  const prodDir = path.join(specsDir, 'products', name);
  fs.mkdirSync(prodDir, { recursive: true });
  const product = {
    schema_version: '1.2.0', name, display_name: display || name, base_path: basePath || ('/' + name), namespace: 'apps',
    app_type: 'product_software', blueprint: (arch && arch.blueprint) || blueprint, stack, interfaces: interfaces || ['api', 'web'],
    capability_blocks: blocks || [], vision: String(brief || '').slice(0, 600), requirement_ids: ids,
    phases: { requirements: { status: 'approved' }, architecture: { status: 'approved' }, scaffold: { status: 'not_started' }, build: { status: 'not_started' } },
    version: { revision: 1, change_reason: 'FORGE greenfield — concepção+arquitetura pela IA' },
  };
  fs.writeFileSync(path.join(prodDir, 'product.json'), JSON.stringify(product, null, 2) + '\n');
  fs.writeFileSync(path.join(prodDir, 'architecture.json'), JSON.stringify({ stack_rationale: (arch && arch.stack_rationale) || '', adrs: (arch && arch.adrs) || [], waves: (arch && arch.waves) || [] }, null, 2) + '\n');
  const feDir = path.join(repoRoot, 'apps/reqhub/frontend/data/products', name);
  fs.mkdirSync(feDir, { recursive: true });
  fs.writeFileSync(path.join(feDir, 'build-plan.json'), JSON.stringify({ status: 'proposed', stack, waves: (arch && arch.waves) || [] }, null, 2) + '\n');
  return { product };
}

// ---- CLI (só roda como entrypoint; importar este módulo NÃO executa nada disto) ---------------
async function mainCli() {
  const BASE = process.env.FORGE_API || 'http://localhost:8088';
  const HEADERS = {
    'Content-Type': 'application/json',
    'X-Auth-Request-Email': 'admin@nvit.com.br',
    'X-Auth-Request-Groups': 'platform-admins',
  };
  const arg = (n, def) => { const i = process.argv.indexOf('--' + n); return i >= 0 ? process.argv[i + 1] : def; };
  const NAME = arg('name');
  const DISPLAY = arg('display', NAME);
  const BASE_PATH = arg('base-path', '/' + NAME);
  const BLUEPRINT = arg('blueprint', 'node-api-vue-spa');
  let BRIEF = arg('brief');
  const BRIEF_FILE = arg('brief-file');
  if (BRIEF_FILE) {
    const { ingest } = await import('../../packages/file-ingest-kit/src/index.js');
    const buf = fs.readFileSync(BRIEF_FILE);
    const res = await ingest([{ filename: path.basename(BRIEF_FILE), bytes: buf }]);
    const fileText = res.textParts.map((t) => `### ${t.name}\n${t.text}`).join('\n\n');
    BRIEF = [BRIEF, fileText].filter(Boolean).join('\n\n');
    if (res.notes.length) console.error('[forge] ingestão:', res.notes.join(' '));
    console.error(`[forge] brief de ${BRIEF_FILE}: ${BRIEF.length} chars · arquivos: ${res.manifest.map((m) => `${m.path}(${m.status})`).join(', ')}`);
  }
  if (!NAME || !BRIEF) { console.error('uso: --name <slug> (--brief "<brief>" | --brief-file <path>) [--display .. --base-path .. --blueprint ..]'); process.exit(2); }

  const capabilities = JSON.parse(fs.readFileSync(path.join(SPECS, 'baseline/capabilities.json'), 'utf8')).capabilities || [];
  const blueprints = JSON.parse(fs.readFileSync(path.join(SPECS, 'baseline/blueprints.json'), 'utf8')).blueprints || [];
  const call = async (route, body) => {
    const r = await fetch(BASE + route, { method: 'POST', headers: HEADERS, body: JSON.stringify(body) });
    const data = await r.json().catch(() => ({}));
    if (!r.ok) throw new Error(`${route} -> ${r.status} ${JSON.stringify(data).slice(0, 300)}`);
    return data;
  };

  console.log(`[forge] CONCEPÇÃO — IA propondo requisitos p/ "${DISPLAY}"...`);
  const pr = await call('/v1/forge/propose-requirements', { product: NAME, blueprint: BLUEPRINT, brief: BRIEF, capabilities, blueprints });
  const reqs = (pr.requirements || []).slice(0, 8);
  if (!reqs.length) throw new Error('IA não propôs requisitos');
  console.log(`[forge]   -> ${reqs.length} requisitos: ${reqs.map((r) => r.title).join(' | ')}`);

  console.log('[forge] ARQUITETURA — IA escolhendo stack + blocos + waves...');
  const ar = await call('/v1/forge/propose-architecture', {
    product: NAME, blueprint: BLUEPRINT,
    requirements: reqs.map((r, i) => ({ id: `REQ-${reqIdSegment(NAME)}-${String(i + 1).padStart(4, '0')}`, title: r.title, type: r.type, statement: r.statement, capability_blocks: r.capability_blocks || [] })),
    capabilities, blueprints,
  });
  const stack = ar.stack || 'sicat';
  const blocks = (ar.selected_blocks || []).map((b) => b.id);
  console.log(`[forge]   -> stack=${stack} | blocos=[${blocks.join(', ')}] | waves=${(ar.waves || []).length} | dropped=[${(ar.dropped_blocks || []).map((d) => d.id || d).join(', ')}]`);

  const ids = emitReqs({ name: NAME, blueprint: BLUEPRINT, requirements: reqs });
  const interfaces = (arg('interfaces', 'api,web')).split(',').map((s) => s.trim()).filter(Boolean);
  emitProductFiles({ name: NAME, display: DISPLAY, basePath: BASE_PATH, blueprint: BLUEPRINT, stack, blocks, interfaces, brief: BRIEF, ids, arch: ar });

  console.log(`[forge] EMITIDO: specs/products/${NAME}/product.json + ${ids.length} requisitos em specs/requirements/${NAME}/`);
  console.log(`[forge] próximo: build-baseline -> scaffold-${stack}.mjs --product ${NAME} -> esteira por requisito`);
  console.log('FORGE_STACK=' + stack);
}

if (import.meta.url === pathToFileURL(process.argv[1] || '').href) {
  mainCli().catch((e) => { console.error('[forge] FALHOU:', e.message); process.exit(1); });
}

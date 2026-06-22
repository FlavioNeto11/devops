// forge-greenfield.mjs — DRIVER do ciclo da Forja a partir de um brief:
//   1) CONCEPÇÃO  -> POST /v1/forge/propose-requirements (IA propõe requisitos robustos)
//   2) ARQUITETURA-> POST /v1/forge/propose-architecture  (IA escolhe stack + blocos + waves)
//   3) emite specs/products/<name>/product.json + specs/requirements/<name>/REQ-*.yaml
// Depois: build-baseline -> scaffold-<stack> -> esteira (implementa cada requisito com teste).
//
// Auth: chama a reqhub-api por um PORT-FORWARD (http://localhost:8088) com headers de admin SSO
// (X-Auth-Request-*), que a API confia vindo da borda. Catálogo+blueprints lidos da baseline local.
//
// Uso: node specs/tools/forge-greenfield.mjs --name stockpilot --display "StockPilot" \
//        --base-path /stockpilot --blueprint node-api-vue-spa --brief "<brief>"
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const SPECS = path.resolve(__dirname, '..');
const BASE = process.env.FORGE_API || 'http://localhost:8088';
const HEADERS = {
  'Content-Type': 'application/json',
  'X-Auth-Request-Email': 'admin@nvit.com.br',
  'X-Auth-Request-Groups': 'platform-admins',
};

function arg(name, def) { const i = process.argv.indexOf('--' + name); return i >= 0 ? process.argv[i + 1] : def; }
const NAME = arg('name');
const DISPLAY = arg('display', NAME);
const BASE_PATH = arg('base-path', '/' + NAME);
const BLUEPRINT = arg('blueprint', 'node-api-vue-spa');
const BRIEF = arg('brief');
if (!NAME || !BRIEF) { console.error('uso: --name <slug> --brief "<brief>" [--display .. --base-path .. --blueprint ..]'); process.exit(2); }

const capabilities = JSON.parse(fs.readFileSync(path.join(SPECS, 'baseline/capabilities.json'), 'utf8')).capabilities || [];
const blueprints = JSON.parse(fs.readFileSync(path.join(SPECS, 'baseline/blueprints.json'), 'utf8')).blueprints || [];

async function call(route, body) {
  const r = await fetch(BASE + route, { method: 'POST', headers: HEADERS, body: JSON.stringify(body) });
  const data = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error(`${route} -> ${r.status} ${JSON.stringify(data).slice(0, 300)}`);
  return data;
}

// YAML scalar: aspas duplas SEMPRE (statements têm ':' etc.). Escapa \ e ".
const q = (s) => '"' + String(s == null ? '' : s).replace(/\\/g, '\\\\').replace(/"/g, '\\"') + '"';
const ENUM_PRI = new Set(['low', 'medium', 'high', 'critical']);

function reqYaml(r, i, total) {
  const id = `REQ-${NAME.toUpperCase()}-${String(i + 1).padStart(4, '0')}`;
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
    `  product_scope: ${NAME}`,
    `  blueprint: ${BLUEPRINT}`,
    `statement: ${q(r.statement || r.title || '')}`,
    `business_rationale: ${q(r.business_rationale || 'Capacidade proposta pela IA da Forja a partir do brief do produto.')}`,
    'source:',
    '  origin: "FORGE — concepção pela IA (propose_requirements)"',
    `  source_paths: ["specs/products/${NAME}/product.json"]`,
    `priority: ${pri}`,
    `criticality: ${crit}`,
    `architectural_significance: ${isFoundation || blocks.length > 0 ? 'true' : 'false'}`,
  ];
  if (blocks.length) L.push(`capability_blocks: [${blocks.map((b) => q(b)).join(', ')}]`);
  L.push('acceptance_criteria:');
  for (const a of acs) L.push(`  - ${q(a)}`);
  // non-functional EXIGE quality_scenarios (schema). Se a IA não trouxe, sintetiza 1 cenário (SEI) do critério.
  if (r.type === 'non-functional') {
    L.push('quality_scenarios:');
    L.push('  - source: "operador/sistema"');
    L.push('    stimulus: ' + q((r.statement || r.title || '').slice(0, 140)));
    L.push('    environment: "produção"');
    L.push('    artifact: ' + q(NAME));
    L.push('    response: "atende o atributo de qualidade especificado"');
    L.push('    response_measure: ' + q(acs[0] || 'conforme acceptance_criteria'));
    L.push('verification_method: [test-integration, monitoring]');
  } else {
    L.push('verification_method: [test-integration]');
  }
  L.push('version:', '  baseline_version: "1.0.0"', '  item_revision: 1', '');
  return { id, yaml: L.join('\n') };
}

(async () => {
  console.log(`[forge] CONCEPÇÃO — IA propondo requisitos p/ "${DISPLAY}"...`);
  const pr = await call('/v1/forge/propose-requirements', { product: NAME, blueprint: BLUEPRINT, brief: BRIEF, capabilities, blueprints });
  const reqs = (pr.requirements || []).slice(0, 8);
  if (!reqs.length) throw new Error('IA não propôs requisitos');
  console.log(`[forge]   -> ${reqs.length} requisitos: ${reqs.map((r) => r.title).join(' | ')}`);

  console.log('[forge] ARQUITETURA — IA escolhendo stack + blocos + waves...');
  const ar = await call('/v1/forge/propose-architecture', {
    product: NAME, blueprint: BLUEPRINT,
    requirements: reqs.map((r, i) => ({ id: `REQ-${NAME.toUpperCase()}-${String(i + 1).padStart(4, '0')}`, title: r.title, type: r.type, statement: r.statement, capability_blocks: r.capability_blocks || [] })),
    capabilities, blueprints,
  });
  const stack = ar.stack || 'sicat';
  const blocks = (ar.selected_blocks || []).map((b) => b.id);
  console.log(`[forge]   -> stack=${stack} | blocos=[${blocks.join(', ')}] | waves=${(ar.waves || []).length} | dropped=[${(ar.dropped_blocks || []).map((d) => d.id || d).join(', ')}]`);

  // emite os requisitos
  const reqDir = path.join(SPECS, 'requirements', NAME);
  fs.mkdirSync(reqDir, { recursive: true });
  const ids = [];
  reqs.forEach((r, i) => { const { id, yaml } = reqYaml(r, i, reqs.length); fs.writeFileSync(path.join(reqDir, id + '.yaml'), yaml); ids.push(id); });

  // emite o product.json
  const prodDir = path.join(SPECS, 'products', NAME);
  fs.mkdirSync(prodDir, { recursive: true });
  const product = {
    schema_version: '1.2.0', name: NAME, display_name: DISPLAY, base_path: BASE_PATH, namespace: 'apps',
    app_type: 'product_software', blueprint: ar.blueprint || BLUEPRINT, stack,
    capability_blocks: blocks, vision: BRIEF.slice(0, 600), requirement_ids: ids,
    phases: { requirements: { status: 'approved' }, architecture: { status: 'approved' }, scaffold: { status: 'not_started' }, build: { status: 'not_started' } },
    version: { revision: 1, change_reason: 'FORGE greenfield — concepção+arquitetura pela IA' },
  };
  fs.writeFileSync(path.join(prodDir, 'product.json'), JSON.stringify(product, null, 2) + '\n');
  // arquitetura rica (ADRs+waves) num arquivo IRMÃO (product schema é estrito) + build-plan p/ o grafo do frontend
  fs.writeFileSync(path.join(prodDir, 'architecture.json'), JSON.stringify({ stack_rationale: ar.stack_rationale || '', adrs: ar.adrs || [], waves: ar.waves || [] }, null, 2) + '\n');
  const feDir = path.join(SPECS, '..', 'apps/reqhub/frontend/data/products', NAME);
  fs.mkdirSync(feDir, { recursive: true });
  fs.writeFileSync(path.join(feDir, 'build-plan.json'), JSON.stringify({ status: 'proposed', stack, waves: ar.waves || [] }, null, 2) + '\n');

  console.log(`[forge] EMITIDO: specs/products/${NAME}/product.json + ${ids.length} requisitos em specs/requirements/${NAME}/`);
  console.log(`[forge] próximo: build-baseline -> scaffold-${stack}.mjs --product ${NAME} -> esteira por requisito`);
  console.log('FORGE_STACK=' + stack);
})().catch((e) => { console.error('[forge] FALHOU:', e.message); process.exit(1); });

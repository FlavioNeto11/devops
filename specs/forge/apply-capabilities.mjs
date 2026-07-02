// =============================================================================
// apply-capabilities.mjs — RESOLVE o conjunto de blocos de capacidade de um produto
// (fecho de `requires`, força os DEFAULT_BLOCKS quando o preset tem código, dropa
// conflitos/incompatíveis) e EMITE o manifesto canônico
// `apps/<app>/.forge/applied-capabilities.json` (o que o app DEVE ter: serviços/infra/env
// agregados + exemplares + guidance por bloco + catalog_hash do catálogo usado).
// Determinístico e idempotente. FAIL-CLOSED: bloco só entra com stack compatível EXPLÍCITA
// (stack null/desconhecida não casa com nada); blueprint t1 (portal sem código) não recebe
// DEFAULT_BLOCKS (portal não "tem observabilidade/contas-acesso" — seria manifesto mentiroso).
// O scaffold (scaffold-product.ps1) e o make-work-order consomem o manifesto; o operador/scaffold
// aplica os `adds_*` ao devops.yaml/k8s (merge aditivo).
//
// Uso:
//   node apply-capabilities.mjs --product <name>            # lê specs/products/<name>/product.json
//   node apply-capabilities.mjs --stack sicat --blocks a,b  # ad-hoc (sem produto registrado)
//   (opcional) --out <dir>  : raiz do app (default apps/<name>)
// =============================================================================
import fs from 'node:fs';
import path from 'node:path';
import { execSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const SPECS_DIR = path.resolve(__dirname, '..');
const REPO_ROOT = path.resolve(SPECS_DIR, '..');

// Provenance (Forja 4.0 B4, warn-only): sha do commit do catálogo/gerador que produziu o manifesto.
// GITHUB_SHA no CI; `git rev-parse HEAD` local; FAIL-SOFT "unknown" (nenhum gate falha por ausência).
export function catalogSourceSha() {
  if (process.env.GITHUB_SHA) return process.env.GITHUB_SHA;
  try {
    const sha = execSync('git rev-parse HEAD', { cwd: REPO_ROOT, stdio: ['ignore', 'pipe', 'ignore'] }).toString().trim();
    return sha || 'unknown';
  } catch { return 'unknown'; }
}

export function loadCatalog(specsDir = SPECS_DIR) {
  const p = path.join(specsDir, 'baseline', 'capabilities.json');
  if (!fs.existsSync(p)) return new Map();
  const j = JSON.parse(fs.readFileSync(p, 'utf8'));
  return new Map((j.capabilities || []).filter((c) => c && c.id).map((c) => [c.id, c]));
}

// Hash do catálogo (blocos+blueprints) emitido pelo build-products.mjs em
// specs/baseline/capabilities.json — carimbado no manifesto (rastreia QUAL catálogo gerou).
export function loadCatalogHash(specsDir = SPECS_DIR) {
  const p = path.join(specsDir, 'baseline', 'capabilities.json');
  if (!fs.existsSync(p)) return null;
  try { return JSON.parse(fs.readFileSync(p, 'utf8')).catalog_hash || null; } catch { return null; }
}

// Blocos SEMPRE incluídos num produto novo COM CÓDIGO (todo app nasce observável + com
// contas/acesso). Só são adicionados se existirem no catálogo E forem compatíveis com a
// stack. NÃO são forçados quando o preset é t1 (cms-portal): portal sem código não "tem
// observabilidade/contas-acesso" — o manifesto seria mentiroso.
export const DEFAULT_BLOCKS = ['observabilidade', 'contas-acesso'];

// RESOLVE o conjunto final de blocos (puro/testável): força os DEFAULT_BLOCKS (exceto t1),
// fecha `requires`, dropa incompatível-com-stack e conflitos (mantém o primeiro pela ordem
// do catálogo). FAIL-CLOSED: bloco só entra com stack compatível EXPLÍCITA — stack
// null/desconhecida não casa com bloco nenhum (nunca "compatível com tudo").
export function resolveBlocks(selected, stack, byId, { tier = 't3' } = {}) {
  const compatible = (id) => { const b = byId.get(id); return !!(b && stack && Array.isArray(b.compatible_stacks) && b.compatible_stacks.includes(stack)); };
  const chosen = new Set();
  if (tier !== 't1') for (const id of DEFAULT_BLOCKS) if (byId.has(id) && compatible(id)) chosen.add(id); // DEFAULT (presets com código)
  for (const id of (selected || [])) if (byId.has(id) && compatible(id)) chosen.add(id);
  let changed = true;
  while (changed) {
    changed = false;
    for (const id of [...chosen]) for (const r of (byId.get(id)?.requires || [])) if (!chosen.has(r) && compatible(r)) { chosen.add(r); changed = true; }
  }
  for (const id of [...chosen]) if (chosen.has(id)) for (const c of (byId.get(id)?.conflicts_with || [])) if (chosen.has(c)) chosen.delete(c);
  return [...chosen];
}

// Monta o manifesto a partir do conjunto resolvido (puro dado os inputs). Dois carimbos de
// proveniência COMPLEMENTARES (ambos warn-only, nunca gateiam): `catalogHash` = qual versão do
// catálogo (specs/baseline/capabilities.json) gerou o manifesto (C1); `sourceSha` = commit do
// gerador (B4; injetável em teste, default fail-soft do commit atual).
export function buildManifest({ app, stack, blocks, byId, catalogHash = null, sourceSha = catalogSourceSha() }) {
  const detail = blocks.map((id) => {
    const b = byId.get(id) || {};
    const ov = b.scaffold_overlay || {};
    return { id, title: b.title || id, category: b.category || '', adds_services: ov.adds_services || [], adds_infra: ov.adds_infra || [], adds_env: ov.adds_env || [], reuses: b.reuses || [], exemplars: (b.reference || []).map((r) => r.path), work_order_guidance: b.work_order_guidance || '', verification: (b.verification || []).map((v) => v.assertion) };
  });
  const uniq = (xs) => [...new Set(xs)].sort();
  return {
    app,
    stack: stack || null,
    catalog_hash: catalogHash,
    blocks,
    catalog_source_sha: sourceSha, // provenance warn-only (nunca gateia nada)
    aggregated: {
      services: uniq(detail.flatMap((d) => d.adds_services)),
      infra: uniq(detail.flatMap((d) => d.adds_infra)),
      env: uniq(detail.flatMap((d) => d.adds_env)),
      reuses: uniq(detail.flatMap((d) => d.reuses)),
    },
    detail,
  };
}

function parseArgs(argv) {
  const a = {};
  for (let i = 0; i < argv.length; i++) {
    if (argv[i] === '--product') a.product = argv[++i];
    else if (argv[i] === '--stack') a.stack = argv[++i];
    else if (argv[i] === '--blocks') a.blocks = (argv[++i] || '').split(',').map((s) => s.trim()).filter(Boolean);
    else if (argv[i] === '--out') a.out = argv[++i];
  }
  return a;
}

// Tier do blueprint do produto (preset). Fail-soft: blueprint ausente/ilegível = t3
// (produto completo — preserva o comportamento dos produtos existentes).
export function loadBlueprintTier(blueprintId, specsDir = SPECS_DIR) {
  if (!blueprintId) return 't3';
  const p = path.join(specsDir, 'blueprints', blueprintId, 'blueprint.json');
  if (!fs.existsSync(p)) return 't3';
  try { return JSON.parse(fs.readFileSync(p, 'utf8')).tier || 't3'; } catch { return 't3'; }
}

function main() {
  const args = parseArgs(process.argv.slice(2));
  const byId = loadCatalog();
  if (!byId.size) { console.error('[apply-capabilities] catálogo vazio — rode build-products.mjs antes.'); process.exit(1); }

  let app, stack, selected, tier = 't3';
  if (args.product) {
    const pp = path.join(SPECS_DIR, 'products', args.product, 'product.json');
    if (!fs.existsSync(pp)) { console.error(`[apply-capabilities] produto não encontrado: ${pp}`); process.exit(1); }
    const prod = JSON.parse(fs.readFileSync(pp, 'utf8'));
    app = prod.name; stack = prod.stack || null; selected = prod.capability_blocks || [];
    tier = loadBlueprintTier(prod.blueprint);
  } else if (args.stack && args.blocks) {
    app = args.out ? path.basename(args.out) : 'adhoc'; stack = args.stack; selected = args.blocks;
  } else {
    console.error('uso: node apply-capabilities.mjs --product <name>  |  --stack <s> --blocks a,b [--out apps/<app>]');
    process.exit(2);
  }

  const blocks = resolveBlocks(selected, stack, byId, { tier });
  const manifest = buildManifest({ app, stack, blocks, byId, catalogHash: loadCatalogHash() });
  const appDir = args.out || path.join(REPO_ROOT, 'apps', app);
  const forgeDir = path.join(appDir, '.forge');
  fs.mkdirSync(forgeDir, { recursive: true });
  fs.writeFileSync(path.join(forgeDir, 'applied-capabilities.json'), JSON.stringify(manifest, null, 2) + '\n');

  console.log(`[apply-capabilities] ${app} (stack ${stack || '?'}) — ${blocks.length} blocos: ${blocks.join(', ')}`);
  console.log(`  serviços: [${manifest.aggregated.services.join(', ')}]  infra: [${manifest.aggregated.infra.join(', ')}]`);
  console.log(`  env: [${manifest.aggregated.env.join(', ')}]  reuses: [${manifest.aggregated.reuses.join(', ')}]`);
  console.log(`  -> ${path.relative(REPO_ROOT, path.join(forgeDir, 'applied-capabilities.json'))}`);
}

if (process.argv[1] && process.argv[1].endsWith('apply-capabilities.mjs')) main();

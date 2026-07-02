// =============================================================================
// apply-capabilities.mjs — RESOLVE o conjunto de blocos de capacidade de um produto
// (fecho de `requires`, força `observabilidade`, dropa conflitos/incompatíveis) e EMITE
// o manifesto canônico `apps/<app>/.forge/applied-capabilities.json` (o que o app DEVE ter:
// serviços/infra/env agregados + exemplares + guidance por bloco). Determinístico e idempotente.
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

// Blocos SEMPRE incluídos num produto novo (todo app nasce observável + com contas/acesso).
// Só são adicionados se existirem no catálogo E forem compatíveis com a stack — um produto
// cuja stack não suporta o bloco gera idêntico a antes (resolução fail-soft, sem quebrar).
export const DEFAULT_BLOCKS = ['observabilidade', 'contas-acesso'];

// RESOLVE o conjunto final de blocos (puro/testável): força os DEFAULT_BLOCKS, fecha `requires`,
// dropa incompatível-com-stack e conflitos (mantém o primeiro pela ordem do catálogo).
export function resolveBlocks(selected, stack, byId) {
  const compatible = (id) => { const b = byId.get(id); return b && (!stack || b.compatible_stacks.includes(stack)); };
  const chosen = new Set();
  for (const id of DEFAULT_BLOCKS) if (byId.has(id) && compatible(id)) chosen.add(id); // DEFAULT (sempre)
  for (const id of (selected || [])) if (byId.has(id) && compatible(id)) chosen.add(id);
  let changed = true;
  while (changed) {
    changed = false;
    for (const id of [...chosen]) for (const r of (byId.get(id)?.requires || [])) if (!chosen.has(r) && compatible(r)) { chosen.add(r); changed = true; }
  }
  for (const id of [...chosen]) if (chosen.has(id)) for (const c of (byId.get(id)?.conflicts_with || [])) if (chosen.has(c)) chosen.delete(c);
  return [...chosen];
}

// Monta o manifesto a partir do conjunto resolvido (puro dado os inputs; `sourceSha` é injetável
// em teste e default = provenance fail-soft do commit atual).
export function buildManifest({ app, stack, blocks, byId, sourceSha = catalogSourceSha() }) {
  const detail = blocks.map((id) => {
    const b = byId.get(id) || {};
    const ov = b.scaffold_overlay || {};
    return { id, title: b.title || id, category: b.category || '', adds_services: ov.adds_services || [], adds_infra: ov.adds_infra || [], adds_env: ov.adds_env || [], reuses: b.reuses || [], exemplars: (b.reference || []).map((r) => r.path), work_order_guidance: b.work_order_guidance || '', verification: (b.verification || []).map((v) => v.assertion) };
  });
  const uniq = (xs) => [...new Set(xs)].sort();
  return {
    app,
    stack: stack || null,
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

function main() {
  const args = parseArgs(process.argv.slice(2));
  const byId = loadCatalog();
  if (!byId.size) { console.error('[apply-capabilities] catálogo vazio — rode build-products.mjs antes.'); process.exit(1); }

  let app, stack, selected;
  if (args.product) {
    const pp = path.join(SPECS_DIR, 'products', args.product, 'product.json');
    if (!fs.existsSync(pp)) { console.error(`[apply-capabilities] produto não encontrado: ${pp}`); process.exit(1); }
    const prod = JSON.parse(fs.readFileSync(pp, 'utf8'));
    app = prod.name; stack = prod.stack || null; selected = prod.capability_blocks || [];
  } else if (args.stack && args.blocks) {
    app = args.out ? path.basename(args.out) : 'adhoc'; stack = args.stack; selected = args.blocks;
  } else {
    console.error('uso: node apply-capabilities.mjs --product <name>  |  --stack <s> --blocks a,b [--out apps/<app>]');
    process.exit(2);
  }

  const blocks = resolveBlocks(selected, stack, byId);
  const manifest = buildManifest({ app, stack, blocks, byId });
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
